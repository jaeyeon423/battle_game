// ============================================================================
// [Client] Web Audio API 기반 총기별 격발음 & 폭발 효과음 합성기
// 5대 총기(돌격소총·산탄총·중기관총·대물저격총·유탄발사기) 사운드 차별화
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
      case 'shoot':
        if (now - this.lastShootTime < 40) return;
        this.lastShootTime = now;
        if (ev.classId === 'shotgun') {
          // 묵직한 12게이지 산탄총 파열음
          this._tone(180, 48, 0.13, 'sawtooth', 0.22);
          this._tone(320, 85, 0.09, 'square', 0.14);
        } else if (ev.classId === 'sniper') {
          // 날카롭고 묵직한 .50구경 대물 저격총 격발음
          this._tone(780, 90, 0.16, 'sawtooth', 0.24);
          this._tone(220, 45, 0.18, 'triangle', 0.18);
        } else if (ev.classId === 'lmg') {
          // 중기관총 연사 타격음
          this._tone(360, 110, 0.055, 'sawtooth', 0.15);
        } else if (ev.classId === 'launcher') {
          // 40mm 유탄발사기 텅- 하는 발사음
          this._tone(210, 75, 0.14, 'triangle', 0.2);
          this._tone(140, 55, 0.12, 'sine', 0.18);
        } else {
          // AR-15 돌격소총 경쾌한 격발음
          this._tone(520, 150, 0.06, 'square', 0.14);
        }
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
        // 철컥 하는 총기 장전/교체 효과음
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
