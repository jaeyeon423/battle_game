// ============================================================================
// [Client] 가로모드 트윈 스틱 & 스킬 1·2 & 직업 전환 통합 입력 컨트롤러
// - 좌측 하단: 360도 이동 조이스틱 (PC: WASD / 방향키)
// - 우측 하단: 360도 수동 조준 및 기본 공격 스틱
// - 우측 보조 버튼: [🔄 재장전(R)] / [⚡ 스킬 1(Shift)] / [💥 스킬 2(E)]
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

    this.seq = 0;
    this.keys = new Set();

    this.leftPointerId = null;
    this.leftOrigin = { x: 0, y: 0 };
    this.stickMove = { x: 0, y: 0 };

    this.rightPointerId = null;
    this.rightOrigin = { x: 0, y: 0 };
    this.stickAim = { active: false, angle: 0, firing: false };

    this.mouseAim = { active: false, x: 0, y: 0, down: false };

    this.aimAngle = 0;
    this.reloadQueued = false;
    this.skill1Queued = false;
    this.skill2Queued = false;

    this.maxStickRadius = 42;
    this.fireDeadzone = 10;

    this._bindEvents();
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
      if (code === 'Digit1') this.onSelectClass?.('bow');
      if (code === 'Digit2') this.onSelectClass?.('sword');
      if (code === 'Digit3') this.onSelectClass?.('tome');
      if (code === 'Digit4') this.onSelectClass?.('crossbow');
      if (code === 'Digit5') this.onSelectClass?.('staff');
      if (code === 'Digit6') this.onSelectClass?.('daggers');
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

    // 좌측 이동 조이스틱
    this.leftZone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onInteract?.();
      try {
        this.leftZone.setPointerCapture(e.pointerId);
      } catch {}
      this.leftPointerId = e.pointerId;
      const rect = this.leftZone.getBoundingClientRect();
      this.leftOrigin = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
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

    // 우측 360도 조준·발사 스틱
    this.rightZone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onInteract?.();
      try {
        this.rightZone.setPointerCapture(e.pointerId);
      } catch {}
      this.rightPointerId = e.pointerId;
      const rect = this.rightZone.getBoundingClientRect();
      this.rightOrigin = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      this.rightZone.classList.add('active');
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
      const rect = this.canvas.getBoundingClientRect();
      this.mouseAim.active = true;
      this.mouseAim.x = e.clientX - rect.left;
      this.mouseAim.y = e.clientY - rect.top;
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button === 0) {
        this.onInteract?.();
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
    const dx = clientX - this.leftOrigin.x;
    const dy = clientY - this.leftOrigin.y;
    const dist = Math.hypot(dx, dy);
    const maxR = this.maxStickRadius;

    const clampedDist = Math.min(dist, maxR);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clampedDist;
    const ky = Math.sin(angle) * clampedDist;

    this.leftKnob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;
    this.leftZone.classList.add('active');

    if (dist > 6) {
      this.stickMove.x = kx / maxR;
      this.stickMove.y = ky / maxR;
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
    const dx = clientX - this.rightOrigin.x;
    const dy = clientY - this.rightOrigin.y;
    const dist = Math.hypot(dx, dy);
    const maxR = this.maxStickRadius;

    const clampedDist = Math.min(dist, maxR);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clampedDist;
    const ky = Math.sin(angle) * clampedDist;

    this.rightKnob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;

    this.stickAim.active = true;
    if (dist >= this.fireDeadzone) {
      this.aimAngle = angle;
      this.stickAim.angle = angle;
      this.stickAim.firing = true;
      this.rightZone.classList.add('firing');
    } else {
      this.stickAim.firing = false;
      this.rightZone.classList.remove('firing');
    }
  }

  _resetRightStick() {
    this.rightPointerId = null;
    this.stickAim.active = false;
    this.stickAim.firing = false;
    this.rightKnob.style.transform = 'translate(0px, 0px)';
    this.rightZone.classList.remove('active', 'firing');
  }

  sampleInputCommand(playerScreenX, playerScreenY) {
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
      isFiring = this.stickAim.firing;
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
