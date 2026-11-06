// ============================================================================
// [Client] Web Audio API 기반 판타지 무기별 공격음 & 폭발 효과음 합성기
// 6대 판타지 무기(장궁·대검·마도서·중석궁·화염 지팡이·쌍단검) 사운드 차별화
// ============================================================================

export class SynthAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.lastShootTime = 0;
    this.lastHitTime = 0;
  }

  unlock() {
    if (!this.enabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.ctx) {
        this.ctx = new AudioCtx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.28;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    } catch {}
  }

  toggleMute() {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.unlock();
      if (this.master) this.master.gain.value = 0.28;
    } else if (this.master) {
      this.master.gain.value = 0;
    }
    return this.enabled;
  }

  _tone(freqStart, freqEnd, duration, type = 'square', gainVal = 0.15, delay = 0) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd && freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration * 0.9);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainVal, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.master);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };

    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  playEvent(ev) {
    if (!this.enabled || !this.ctx) return;
    const now = performance.now();

    switch (ev.type) {
      case 'melee_slash':
        if (now - this.lastShootTime < 40) return;
        this.lastShootTime = now;
        // 전사 근접 대검 강타 사운드
        this._tone(220, 70, 0.18, 'sawtooth', 0.22);
        this._tone(750, 220, 0.1, 'triangle', 0.16, 0.02);
        break;

      case 'shoot':
        if (now - this.lastShootTime < 40) return;
        this.lastShootTime = now;
        if (ev.classId === 'warrior' || ev.classId === 'sword') {
          this._tone(260, 90, 0.16, 'sawtooth', 0.14);
          this._tone(900, 300, 0.1, 'triangle', 0.1, 0.02);
        } else if (ev.classId === 'mage' || ev.classId === 'staff' || ev.classId === 'tome') {
          this._tone(460, 920, 0.1, 'sine', 0.15);
          this._tone(240, 90, 0.16, 'sawtooth', 0.14, 0.02);
        } else {
          // 궁수 일격필살 화살 발사음
          this._tone(680, 200, 0.1, 'triangle', 0.22);
          this._tone(1600, 620, 0.06, 'sine', 0.12);
        }
        break;


      case 'bow_draw_start':
        // 활 시위 당김음 (팽팽해지는 저음 텐션)
        this._tone(180, 320, 0.16, 'triangle', 0.1);
        break;

      case 'bow_cancel':
        this._tone(240, 120, 0.08, 'triangle', 0.08);
        break;

      case 'bow_full_charged':
        // 풀차지 도달음 (맑은 마력 공명음)
        this._tone(680, 1040, 0.14, 'sine', 0.16);
        this._tone(1040, 1360, 0.1, 'triangle', 0.1, 0.02);
        break;

      case 'skill_cast':
        this._tone(360, 720, 0.14, 'triangle', 0.18, 0);
        this._tone(540, 960, 0.12, 'sine', 0.15, 0.05);
        break;

      case 'nova':
        this._tone(180, 55, 0.28, 'sawtooth', 0.22, 0);
        this._tone(480, 220, 0.2, 'triangle', 0.15, 0.03);
        break;

      case 'class_switch':
        // 무기 교체 효과음
        this._tone(380, 580, 0.06, 'triangle', 0.16, 0);
        this._tone(620, 840, 0.08, 'square', 0.14, 0.05);
        break;

      case 'reload_start':
        this._tone(320, 190, 0.07, 'triangle', 0.14, 0);
        break;

      case 'reload_complete':
        this._tone(420, 620, 0.08, 'triangle', 0.16, 0);
        this._tone(660, 880, 0.09, 'sine', 0.16, 0.06);
        break;

      case 'hit':
        if (now - this.lastHitTime < 35) return;
        this.lastHitTime = now;
        this._tone(200, 85, 0.05, 'triangle', 0.12);
        break;

      case 'kill':
        this._tone(160, 55, 0.13, 'sawtooth', 0.15);
        break;

      case 'player_hit':
        this._tone(145, 52, 0.2, 'sawtooth', 0.22);
        break;

      case 'base_hit':
        this._tone(120, 65, 0.22, 'sawtooth', 0.2);
        break;

      case 'rock_ricochet':
        if (now - this.lastHitTime < 45) return;
        this.lastHitTime = now;
        this._tone(980, 420, 0.04, 'triangle', 0.08);
        break;

      case 'explosion':
        this._tone(105, 26, 0.36, 'sawtooth', 0.28, 0);
        this._tone(230, 42, 0.26, 'square', 0.18, 0.02);
        break;

      default:
        break;
    }
  }
}
