// ============================================================================
// [Client] 모바일 세로(Portrait) 최적화 트윈 조작계 & 원탭 자동 조준 공격 컨트롤러
// - 좌측: 360° 플로팅 이동 조이스틱 (PC: WASD / 방향키)
// - 우측: [⚔️ ATK] 버튼 누를 때마다 가장 가까운 적을 향해 1회 공격 (누르고 있어도 연속 자동발사 안 됨)
// - 우측 보조 버튼: [🔄 재장전/충전(R)] / [⚡ 기동스킬 1(Shift)] / [💥 필살기 2(E)]
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

    this.leftPointerId = null;
    this.leftOrigin = { x: 0, y: 0 };
    this.stickMove = { x: 0, y: 0 };

    this.rightPointerId = null;
    this.aimAngle = 0;
    this.fireQueued = false;
    this.reloadQueued = false;
    this.skill1Queued = false;
    this.skill2Queued = false;

    this.maxStickRadius = 36;

    this._bindEvents();
  }

  /**
   * 버튼 1회 터치/클릭당 가장 가까운 적을 향해 1회 공격을 격발합니다.
   */
  triggerAttack() {
    this.onInteract?.();
    if (this.getAutoAimAngle) {
      const autoAng = this.getAutoAimAngle();
      if (typeof autoAng === 'number' && !Number.isNaN(autoAng)) {
        this.aimAngle = autoAng;
      }
    }
    this.fireQueued = true;
  }

  _bindEvents() {
    window.addEventListener('keydown', (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      this.onInteract?.();
      const code = e.code;
      this.keys.add(code);

      // 공격 단축키 (KeyJ, KeyF): 1회 누를 때마다 가장 가까운 적에게 1회 공격
      if (code === 'KeyJ' || code === 'KeyF') {
        if (!e.repeat) {
          this.triggerAttack();
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
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this._resetLeftStick();
      this._resetRightAttackBtn();
    });

    // 좌측 이동 조이스틱 (손가락이 닿은 위치를 시작 중심으로 잡는 플로팅 방식)
    this.leftZone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onInteract?.();
      try {
        this.leftZone.setPointerCapture(e.pointerId);
      } catch {}
      this.leftPointerId = e.pointerId;
      this.leftOrigin = { x: e.clientX, y: e.clientY };
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

    // 우측 [⚔️ ATK] 공격 버튼
    // - 버튼을 1번 누를 때마다 가장 가까운 적을 향해 1회 공격 발동!
    // - 버튼을 꾹 누르고 있어도 연속으로 자동 공격되지 않습니다.
    this.rightZone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        this.rightZone.setPointerCapture(e.pointerId);
      } catch {}
      this.rightPointerId = e.pointerId;
      this.rightZone.classList.add('active', 'firing');
      this.triggerAttack();
    });

    const endRight = (e) => {
      if (e.pointerId !== this.rightPointerId) return;
      this._resetRightAttackBtn();
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

    // PC 마우스 좌클릭 (화면 클릭 1회마다 가장 가까운 적을 향해 1회 공격)
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button === 0) {
        this.triggerAttack();
      }
    });
  }

  _updateLeftStick(clientX, clientY) {
    const dx = clientX - this.leftOrigin.x;
    const dy = clientY - this.leftOrigin.y;
    const dist = Math.hypot(dx, dy);
    const maxR = this.maxStickRadius;

    if (dist > maxR * 1.3) {
      const pull = dist - maxR * 1.3;
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

  _resetRightAttackBtn() {
    this.rightPointerId = null;
    this.rightZone.classList.remove('active', 'firing');
  }

  sampleInputCommand(playerScreenX, playerScreenY, dt = 0.016) {
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

    // 스킬 시전 시에도 가장 가까운 적을 향하도록 자동 보정
    if ((this.skill1Queued || this.skill2Queued) && this.getAutoAimAngle) {
      const autoAng = this.getAutoAimAngle();
      if (typeof autoAng === 'number' && !Number.isNaN(autoAng)) {
        this.aimAngle = autoAng;
      }
    }

    const firePressed = this.fireQueued;
    const isFiring = this.fireQueued;
    this.fireQueued = false;

    const cmd = {
      seq: ++this.seq,
      moveX,
      moveY,
      aimAngle: this.aimAngle,
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
