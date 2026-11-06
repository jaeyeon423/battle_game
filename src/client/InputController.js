// ============================================================================
// [Client] 가로모드 트윈 스틱 & 스킬 1·2 & 직업 전환 통합 입력 컨트롤러
// - 스마트폰 세로(Portrait) 파지 시 90도 강제 가로 회전(force-landscape) 좌표 자동 역변환 지원
// - 터치한 지점이 중심이 되는 플로팅 오리진(Floating Origin) 조이스틱
// - 우측 공격 스틱: 탭(Tap) 시 가장 가까운 적 자동 조준(Auto-Aim) & 드래그 시 360° 수동 조준·연사
// ============================================================================

export class InputController {
  constructor({
    canvas,
    leftZone,
    leftKnob,
    rightZone,
    rightKnob,
    reloadBtn,
    skill1Btn,
    skill2Btn,
    onInteract,
    onSelectClass,
    getAutoAimAngle,
  }) {
    this.canvas = canvas;
    this.leftZone = leftZone;
    this.leftKnob = leftKnob;
    this.rightZone = rightZone;
    this.rightKnob = rightKnob;
    this.reloadBtn = reloadBtn;
    this.skill1Btn = skill1Btn;
    this.skill2Btn = skill2Btn;
    this.onInteract = onInteract;
    this.onSelectClass = onSelectClass;
    this.getAutoAimAngle = getAutoAimAngle;

    this.seq = 0;
    this.keys = new Set();
    this.isRotatedPortrait = false;

    this.leftPointerId = null;
    this.leftOrigin = { x: 0, y: 0 };
    this.stickMove = { x: 0, y: 0 };

    this.rightPointerId = null;
    this.rightOrigin = { x: 0, y: 0 };
    this.stickAim = { active: false, angle: 0, firing: false, dragged: false };

    this.mouseAim = { active: false, x: 0, y: 0, down: false };

    this.aimAngle = 0;
    this.tapFireTimer = 0;
    this.reloadQueued = false;
    this.skill1Queued = false;
    this.skill2Queued = false;

    this.maxStickRadius = 38;
    this.fireDeadzone = 8;

    this._bindEvents();
  }

  /**
   * 화면이 세로(Portrait)여서 #viewport가 시계방향 90도 회전(.force-landscape)된 상태인지 설정합니다.
   */
  setRotatedPortrait(rotated) {
    this.isRotatedPortrait = Boolean(rotated);
  }

  /**
   * 물리 화면 좌표(clientX, clientY)를 논리적 가로 뷰포트 좌표(x, y)로 변환합니다.
   * - 일반 가로 모드: (clientX, clientY) 그대로 사용
   * - 세로 강제 가로 회전 모드(.force-landscape): 시계방향 90도 회전의 역변환 적용
   */
  _toLogicalPoint(clientX, clientY) {
    if (!this.isRotatedPortrait) {
      return { x: clientX, y: clientY };
    }
    return {
      x: clientY,
      y: window.innerWidth - clientX,
    };
  }

  _bindEvents() {
    window.addEventListener('keydown', (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      this.onInteract?.();
      const code = e.code;
      this.keys.add(code);

      if (code === 'KeyR') this.reloadQueued = true;
      if (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'Space') {
        if (code === 'Space') e.preventDefault();
        this.skill1Queued = true;
      }
      if (code === 'KeyE' || code === 'KeyQ') {
        this.skill2Queued = true;
      }
      if (code === 'KeyB') this.onSelectClass?.('random');
      if (code === 'Digit1') this.onSelectClass?.('warrior');
      if (code === 'Digit2') this.onSelectClass?.('archer');
      if (code === 'Digit3') this.onSelectClass?.('mage');
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this._resetLeftStick();
      this._resetRightStick();
      this.mouseAim.down = false;
    });

    // 좌측 이동 조이스틱 (손가락이 처음 닿은 지점을 중심으로 설정하는 Floating Origin 방식)
    this.leftZone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onInteract?.();
      try {
        this.leftZone.setPointerCapture(e.pointerId);
      } catch {}
      this.leftPointerId = e.pointerId;
      const pt = this._toLogicalPoint(e.clientX, e.clientY);
      this.leftOrigin = { x: pt.x, y: pt.y };
      this._updateLeftStick(e.clientX, e.clientY);
    });

    this.leftZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.leftPointerId) return;
      this._updateLeftStick(e.clientX, e.clientY);
    });

    const endLeft = (e) => {
      if (e.pointerId !== this.leftPointerId) return;
      this._resetLeftStick();
    };
    this.leftZone.addEventListener('pointerup', endLeft);
    this.leftZone.addEventListener('pointercancel', endLeft);

    // 우측 360도 조준·발사 스틱 (터치 즉시 가장 가까운 적 자동 조준 + 드래그 시 360° 수동 조준)
    this.rightZone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onInteract?.();
      try {
        this.rightZone.setPointerCapture(e.pointerId);
      } catch {}
      this.rightPointerId = e.pointerId;
      const pt = this._toLogicalPoint(e.clientX, e.clientY);
      this.rightOrigin = { x: pt.x, y: pt.y };
      this.stickAim.dragged = false;

      if (this.getAutoAimAngle) {
        const autoAng = this.getAutoAimAngle();
        if (typeof autoAng === 'number' && !Number.isNaN(autoAng)) {
          this.aimAngle = autoAng;
          this.stickAim.angle = autoAng;
        }
      }

      this.rightZone.classList.add('active', 'firing');
      this.stickAim.active = true;
      this.stickAim.firing = true;
      this.tapFireTimer = 0.18;
      this._updateRightStick(e.clientX, e.clientY);
    });

    this.rightZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.rightPointerId) return;
      this._updateRightStick(e.clientX, e.clientY);
    });

    const endRight = (e) => {
      if (e.pointerId !== this.rightPointerId) return;
      this._resetRightStick();
    };
    this.rightZone.addEventListener('pointerup', endRight);
    this.rightZone.addEventListener('pointercancel', endRight);

    // 우측 보조 액션 버튼 3종 (재장전 / 스킬 1 / 스킬 2)
    this.reloadBtn?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onInteract?.();
      this.reloadQueued = true;
    });

    this.skill1Btn?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onInteract?.();
      this.skill1Queued = true;
    });

    this.skill2Btn?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onInteract?.();
      this.skill2Queued = true;
    });

    // PC 마우스 전장 조준 및 사격
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const pt = this._toLogicalPoint(e.clientX, e.clientY);
      this.mouseAim.active = true;
      this.mouseAim.x = pt.x;
      this.mouseAim.y = pt.y;
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button === 0) {
        this.onInteract?.();
        const pt = this._toLogicalPoint(e.clientX, e.clientY);
        this.mouseAim.active = true;
        this.mouseAim.x = pt.x;
        this.mouseAim.y = pt.y;
        this.mouseAim.down = true;
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button === 0) {
        this.mouseAim.down = false;
      }
    });
  }

  _updateLeftStick(clientX, clientY) {
    const pt = this._toLogicalPoint(clientX, clientY);
    const dx = pt.x - this.leftOrigin.x;
    const dy = pt.y - this.leftOrigin.y;
    const dist = Math.hypot(dx, dy);
    const maxR = this.maxStickRadius;

    // 손가락이 너무 멀리 벗어나면 중심점(origin)이 손가락을 부드럽게 따라오도록 처리
    if (dist > maxR * 1.35) {
      const pull = dist - maxR * 1.35;
      const ang = Math.atan2(dy, dx);
      this.leftOrigin.x += Math.cos(ang) * pull;
      this.leftOrigin.y += Math.sin(ang) * pull;
    }

    const clampedDist = Math.min(dist, maxR);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clampedDist;
    const ky = Math.sin(angle) * clampedDist;

    this.leftKnob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;
    this.leftZone.classList.add('active');

    if (dist > 4) {
      // 살짝만 기울여도 최고 속도에 빠르게 도달하도록 감도 향상
      const norm = Math.min(1, dist / (maxR * 0.72));
      this.stickMove.x = Math.cos(angle) * norm;
      this.stickMove.y = Math.sin(angle) * norm;
    } else {
      this.stickMove.x = 0;
      this.stickMove.y = 0;
    }
  }

  _resetLeftStick() {
    this.leftPointerId = null;
    this.stickMove.x = 0;
    this.stickMove.y = 0;
    this.leftKnob.style.transform = 'translate(0px, 0px)';
    this.leftZone.classList.remove('active');
  }

  _updateRightStick(clientX, clientY) {
    const pt = this._toLogicalPoint(clientX, clientY);
    const dx = pt.x - this.rightOrigin.x;
    const dy = pt.y - this.rightOrigin.y;
    const dist = Math.hypot(dx, dy);
    const maxR = this.maxStickRadius;

    const clampedDist = Math.min(dist, maxR);
    const angle = dist >= this.fireDeadzone ? Math.atan2(dy, dx) : this.aimAngle;
    const kx = dist >= this.fireDeadzone ? Math.cos(angle) * clampedDist : 0;
    const ky = dist >= this.fireDeadzone ? Math.sin(angle) * clampedDist : 0;

    this.rightKnob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;

    this.stickAim.active = true;
    this.stickAim.firing = true;
    this.rightZone.classList.add('firing');

    if (dist >= this.fireDeadzone) {
      this.stickAim.dragged = true;
      this.aimAngle = angle;
      this.stickAim.angle = angle;
    } else if (!this.stickAim.dragged && this.getAutoAimAngle) {
      // 드래그하지 않고 탭/홀드만 하고 있을 때는 가장 가까운 적을 자동 추적 조준!
      const autoAng = this.getAutoAimAngle();
      if (typeof autoAng === 'number' && !Number.isNaN(autoAng)) {
        this.aimAngle = autoAng;
        this.stickAim.angle = autoAng;
      }
    }
  }

  _resetRightStick() {
    this.rightPointerId = null;
    this.stickAim.active = false;
    this.stickAim.firing = false;
    this.stickAim.dragged = false;
    this.rightKnob.style.transform = 'translate(0px, 0px)';
    this.rightZone.classList.remove('active', 'firing');
  }

  sampleInputCommand(playerScreenX, playerScreenY, dt = 0.016) {
    if (this.tapFireTimer > 0) {
      this.tapFireTimer = Math.max(0, this.tapFireTimer - dt);
    }

    let moveX = this.stickMove.x;
    let moveY = this.stickMove.y;

    let kbX = 0;
    let kbY = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kbX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kbX += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) kbY -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) kbY += 1;

    if (kbX !== 0 || kbY !== 0) {
      const len = Math.hypot(kbX, kbY);
      moveX = kbX / len;
      moveY = kbY / len;
      if (this.leftPointerId === null) {
        const r = this.maxStickRadius * 0.75;
        this.leftKnob.style.transform = `translate(${(moveX * r).toFixed(1)}px, ${(moveY * r).toFixed(1)}px)`;
      }
    } else if (this.leftPointerId === null) {
      this.leftKnob.style.transform = 'translate(0px, 0px)';
    }

    let isFiring = false;
    if (this.stickAim.active) {
      if (!this.stickAim.dragged && this.getAutoAimAngle) {
        const autoAng = this.getAutoAimAngle();
        if (typeof autoAng === 'number' && !Number.isNaN(autoAng)) {
          this.aimAngle = autoAng;
        }
      }
      isFiring = this.stickAim.firing;
    } else if (this.tapFireTimer > 0) {
      isFiring = true;
    } else if (this.mouseAim.active) {
      const dx = this.mouseAim.x - playerScreenX;
      const dy = this.mouseAim.y - playerScreenY;
      if (Math.hypot(dx, dy) > 4) {
        this.aimAngle = Math.atan2(dy, dx);
      }
      isFiring = this.mouseAim.down;

      if (isFiring) {
        const r = this.maxStickRadius * 0.8;
        this.rightKnob.style.transform = `translate(${(Math.cos(this.aimAngle) * r).toFixed(1)}px, ${(Math.sin(this.aimAngle) * r).toFixed(1)}px)`;
        this.rightZone.classList.add('firing');
      } else {
        this.rightKnob.style.transform = 'translate(0px, 0px)';
        this.rightZone.classList.remove('firing');
      }
    }

    // 스킬 발동 시에도 조준을 아직 안 했으면 가장 가까운 적 방향으로 자동 조준 보정
    if ((this.skill1Queued || this.skill2Queued) && !this.stickAim.dragged && !this.mouseAim.active && this.getAutoAimAngle) {
      const autoAng = this.getAutoAimAngle();
      if (typeof autoAng === 'number' && !Number.isNaN(autoAng)) {
        this.aimAngle = autoAng;
      }
    }

    const cmd = {
      seq: ++this.seq,
      moveX,
      moveY,
      aimAngle: this.aimAngle,
      isFiring,
      reloadPressed: this.reloadQueued,
      skill1Pressed: this.skill1Queued,
      skill2Pressed: this.skill2Queued,
    };

    this.reloadQueued = false;
    this.skill1Queued = false;
    this.skill2Queued = false;

    return cmd;
  }
}
