// ============================================================================
// [Client] 모바일 세로(Portrait) & PC 겸용 프로급 전술 조작계
// 1. [이동]: 화면 좌측 50% 어디든 터치하면 즉시 생기는 다이나믹 플로팅 조이스틱 (PC: WASD / 방향키)
//    - 최대 반경 46px로 확장하여 정밀하고 쾌적한 360° 이동 지원
// 2. [발사]: 브롤스타즈식 드래그 방향 조종 & 릴리즈 발사 (Drag to Aim & Release to Fire)
//    - 누르고 있는 동안: 360° 내가 원하는 방향으로 조준선 화살표 조작
//    - 손을 뗄 때: 조준한 바로 그 방향으로 1회 발사! (가볍게 탭하고 떼면 가장 가까운 적 오토에임 발사)
// 3. [보조]: [🔄 재장전/충전(R)] / [⚡ 기동스킬 1(Shift)] / [💥 필살기 2(E)]
// ============================================================================

export class InputController {
  constructor({
    canvas,
    moveTouchPad,
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
    this.moveTouchPad = moveTouchPad;
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

    // 좌측 다이나믹 플로팅 이동 조이스틱
    this.leftPointerId = null;
    this.leftOrigin = { x: 0, y: 0 };
    this.stickMove = { x: 0, y: 0 };
    this.isLeftFloating = false;
    this.maxStickRadius = 46; // 기존 36px 대비 조작감 대폭 확대

    // 우측 드래그 조준 & 릴리즈 발사 조작계
    this.rightPointerId = null;
    this.rightOrigin = { x: 0, y: 0 };
    this.isAiming = false;
    this.aimDragged = false;
    this.aimAngle = 0;
    this.autoAimRequested = false;

    // PC 마우스 조준 & 릴리즈 발사
    this.mouseAim = { down: false, x: 0, y: 0 };

    this.fireQueued = false;
    this.reloadQueued = false;
    this.skill1Queued = false;
    this.skill2Queued = false;

    this._bindEvents();
  }

  /**
   * 제자리 탭 시 가장 가까운 적을 향해 오토에임으로 1회 발사를 준비합니다.
   */
  triggerAutoAttack() {
    this.onInteract?.();
    if (this.getAutoAimAngle) {
      const autoAng = this.getAutoAimAngle();
      if (typeof autoAng === 'number' && !Number.isNaN(autoAng)) {
        this.aimAngle = autoAng;
      }
    }
    this.autoAimRequested = true;
    this.fireQueued = true;
  }

  /**
   * 지정된 방향(aimAngle)으로 직접 1회 발사합니다.
   */
  triggerDirectionalAttack(angle) {
    this.onInteract?.();
    if (typeof angle === 'number' && !Number.isNaN(angle)) {
      this.aimAngle = angle;
    }
    this.autoAimRequested = false;
    this.fireQueued = true;
  }

  _bindEvents() {
    // ------------------------------------------------------------------------
    // [PC 키보드 단축키]
    // ------------------------------------------------------------------------
    window.addEventListener('keydown', (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      this.onInteract?.();
      const code = e.code;
      this.keys.add(code);

      // 공격 키 (KeyJ, KeyF): 누르는 동안 조준 시작, 뗐을 때 발사
      if (code === 'KeyJ' || code === 'KeyF') {
        if (!e.repeat) {
          this.isAiming = true;
          if (this.getAutoAimAngle) {
            const autoAng = this.getAutoAimAngle();
            if (typeof autoAng === 'number' && !Number.isNaN(autoAng)) {
              this.aimAngle = autoAng;
            }
          }
        }
      }

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
      const code = e.code;
      this.keys.delete(code);

      // 공격 키를 뗐을 때 발사!
      if (code === 'KeyJ' || code === 'KeyF') {
        this.isAiming = false;
        this.triggerDirectionalAttack(this.aimAngle);
      }
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this._resetLeftStick();
      this._resetRightAim();
      this.mouseAim.down = false;
    });

    // ------------------------------------------------------------------------
    // [좌측 이동: 화면 좌측 절반 다이나믹 플로팅 조이스틱]
    // 화면 좌측 어디든 손가락을 대면 그 자리에 조이스틱이 떠서 즉시 360° 이동 가능!
    // ------------------------------------------------------------------------
    const startMoveStick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onInteract?.();

      if (this.leftPointerId !== null) return;
      this.leftPointerId = e.pointerId;
      try {
        (this.moveTouchPad || this.leftZone).setPointerCapture(e.pointerId);
      } catch {}

      this.leftOrigin = { x: e.clientX, y: e.clientY };

      // 터치한 위치로 조이스틱 베이스를 부드럽게 이동 (Floating Joystick)
      if (this.leftZone) {
        this.leftZone.classList.add('active', 'floating');
        this.leftZone.style.left = `${Math.round(e.clientX - 58)}px`;
        this.leftZone.style.top = `${Math.round(e.clientY - 58)}px`;
        this.leftZone.style.bottom = 'auto';
      }
      this.isLeftFloating = true;
      this._updateLeftStick(e.clientX, e.clientY);
    };

    const moveMoveStick = (e) => {
      if (e.pointerId !== this.leftPointerId) return;
      this._updateLeftStick(e.clientX, e.clientY);
    };

    const endMoveStick = (e) => {
      if (e.pointerId !== this.leftPointerId) return;
      this._resetLeftStick();
    };

    if (this.moveTouchPad) {
      this.moveTouchPad.addEventListener('pointerdown', startMoveStick);
      this.moveTouchPad.addEventListener('pointermove', moveMoveStick);
      this.moveTouchPad.addEventListener('pointerup', endMoveStick);
      this.moveTouchPad.addEventListener('pointercancel', endMoveStick);
    }

    if (this.leftZone) {
      this.leftZone.addEventListener('pointerdown', startMoveStick);
      this.leftZone.addEventListener('pointermove', moveMoveStick);
      this.leftZone.addEventListener('pointerup', endMoveStick);
      this.leftZone.addEventListener('pointercancel', endMoveStick);
    }

    // ------------------------------------------------------------------------
    // [우측 발사: 드래그 방향 조종 & 릴리즈 발사 (브롤스타즈 조작계)]
    // - 누르는 동안: 360° 원하는 방향으로 조준선/화살표 조종
    // - 손을 뗄 때: 조준한 바로 그 방향으로 1회 발사! (가볍게 탭만 하면 오토에임 발사)
    // ------------------------------------------------------------------------
    this.rightZone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onInteract?.();
      try {
        this.rightZone.setPointerCapture(e.pointerId);
      } catch {}
      this.rightPointerId = e.pointerId;
      this.rightOrigin = { x: e.clientX, y: e.clientY };
      this.isAiming = true;
      this.aimDragged = false;
      this.rightZone.classList.add('active', 'aiming');

      // 터치 시작 시: 주변에 적이 있으면 초기 조준선을 적 방향으로 정렬
      if (this.getAutoAimAngle) {
        const autoAng = this.getAutoAimAngle();
        if (typeof autoAng === 'number' && !Number.isNaN(autoAng)) {
          this.aimAngle = autoAng;
        }
      }
    });

    this.rightZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.rightPointerId) return;
      const dx = e.clientX - this.rightOrigin.x;
      const dy = e.clientY - this.rightOrigin.y;
      const dist = Math.hypot(dx, dy);

      // 8px 이상 손가락을 끌면: 플레이어가 직접 조종한 방향으로 360° 조준!
      if (dist >= 8) {
        this.aimDragged = true;
        this.aimAngle = Math.atan2(dy, dx);

        const clampedDist = Math.min(dist, 48);
        const kx = Math.cos(this.aimAngle) * clampedDist;
        const ky = Math.sin(this.aimAngle) * clampedDist;
        this.rightKnob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;
      } else {
        this.rightKnob.style.transform = 'translate(0px, 0px)';
      }
    });

    const endRightAim = (e) => {
      if (e.pointerId !== this.rightPointerId) return;

      // 손을 떼는 순간 발사 격발!
      if (this.aimDragged) {
        // 1. 유저가 손가락으로 직접 방향을 조종한 경우 ➔ 조종한 방향으로 1회 발사!
        this.triggerDirectionalAttack(this.aimAngle);
      } else {
        // 2. 방향 조작 없이 가볍게 탭만 하고 뗀 경우 ➔ 가장 가까운 적 오토에임 발사!
        this.triggerAutoAttack();
      }

      this._resetRightAim();
    };

    this.rightZone.addEventListener('pointerup', endRightAim);
    this.rightZone.addEventListener('pointercancel', endRightAim);

    // ------------------------------------------------------------------------
    // [우측 보조 액션 버튼 3종: 재장전 / 스킬 1 / 스킬 2]
    // ------------------------------------------------------------------------
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

    // ------------------------------------------------------------------------
    // [PC 마우스 조작: 화면 클릭 조준 & 뗄 때 발사]
    // ------------------------------------------------------------------------
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button === 0) {
        this.mouseAim.down = true;
        this.mouseAim.x = e.clientX;
        this.mouseAim.y = e.clientY;
        this.isAiming = true;
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (this.mouseAim.down && e.pointerType !== 'touch') {
        this.mouseAim.x = e.clientX;
        this.mouseAim.y = e.clientY;
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (this.mouseAim.down && e.pointerType !== 'touch') {
        this.mouseAim.down = false;
        this.isAiming = false;
        // 마우스 버튼을 뗄 때 마우스 커서 방향으로 1회 발사!
        this.triggerDirectionalAttack(this.aimAngle);
      }
    });
  }

  _updateLeftStick(clientX, clientY) {
    const dx = clientX - this.leftOrigin.x;
    const dy = clientY - this.leftOrigin.y;
    const dist = Math.hypot(dx, dy);
    const maxR = this.maxStickRadius;

    // 손가락이 범위를 크게 벗어나면 조이스틱 베이스가 부드럽게 따라옴 (Floating Follow)
    if (dist > maxR * 1.35) {
      const pull = dist - maxR * 1.35;
      const ang = Math.atan2(dy, dx);
      this.leftOrigin.x += Math.cos(ang) * pull;
      this.leftOrigin.y += Math.sin(ang) * pull;
      if (this.leftZone) {
        this.leftZone.style.left = `${Math.round(this.leftOrigin.x - 58)}px`;
        this.leftZone.style.top = `${Math.round(this.leftOrigin.y - 58)}px`;
      }
    }

    const clampedDist = Math.min(dist, maxR);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clampedDist;
    const ky = Math.sin(angle) * clampedDist;

    this.leftKnob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;

    if (dist > 5) {
      const norm = Math.min(1, dist / (maxR * 0.75));
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
    if (this.leftZone) {
      this.leftZone.classList.remove('active', 'floating');
      this.leftZone.style.left = '';
      this.leftZone.style.top = '';
      this.leftZone.style.bottom = '';
    }
    this.isLeftFloating = false;
  }

  _resetRightAim() {
    this.rightPointerId = null;
    this.isAiming = false;
    this.aimDragged = false;
    this.rightZone.classList.remove('active', 'aiming', 'firing');
    this.rightKnob.style.transform = 'translate(0px, 0px)';
  }

  sampleInputCommand(playerScreenX, playerScreenY, dt = 0.016) {
    let moveX = this.stickMove.x;
    let moveY = this.stickMove.y;

    // PC 키보드 WASD / 방향키 처리
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

    // PC 마우스 조준 각도 갱신
    if (this.mouseAim.down && typeof playerScreenX === 'number' && typeof playerScreenY === 'number') {
      const dx = this.mouseAim.x - playerScreenX;
      const dy = this.mouseAim.y - playerScreenY;
      if (Math.hypot(dx, dy) > 10) {
        this.aimAngle = Math.atan2(dy, dx);
      }
    }

    // 스킬 시전 시에도 목표가 없으면 가장 가까운 적을 보정
    if ((this.skill1Queued || this.skill2Queued) && this.getAutoAimAngle && !this.isAiming) {
      const autoAng = this.getAutoAimAngle();
      if (typeof autoAng === 'number' && !Number.isNaN(autoAng)) {
        this.aimAngle = autoAng;
      }
    }

    const firePressed = this.fireQueued;
    const isFiring = this.fireQueued;
    const autoAim = this.autoAimRequested;
    this.fireQueued = false;
    this.autoAimRequested = false;

    const cmd = {
      seq: ++this.seq,
      moveX,
      moveY,
      aimAngle: this.aimAngle,
      isAiming: this.isAiming,
      autoAim,
      firePressed,
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
