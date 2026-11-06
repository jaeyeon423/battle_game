// ============================================================================
// [Client] 메인 엔트리 포인트 — 원형 배틀로얄: 랜덤 무기 서바이벌 (CIRCLE ROYALE)
// 시작 시 랜덤 무기 박스(룰렛) 추첨 연출 + 최후의 1인 서바이벌 + 실시간 멀티플레이 연동
// ============================================================================

import { WEAPON_KEYS, resolveWeaponSpec, WORLD_CONFIG } from '../shared/constants.js';
import { WebSocketTransport } from '../transport/WebSocketTransport.js';
import { InputController } from './InputController.js';
import { Renderer } from './Renderer.js';
import { SynthAudio } from './SynthAudio.js';

const $ = (id) => document.getElementById(id);

class GameClient {
  constructor() {
    this.canvas = $('arenaCanvas');
    this.renderer = new Renderer(this.canvas);
    this.audio = new SynthAudio();
    this.transport = new WebSocketTransport();

    const params = new URLSearchParams(window.location.search);
    const initRoom = params.get('room') || 'ROYALE-01';
    const initName = params.get('name') || '';
    const initClass = params.get('class') || '';

    this.localPlayerId = this.transport.connect(initName, initClass, initRoom);
    this.latestSnapshot = this.transport.displaySnapshot;

    // 로컬 랜덤박스 모달 표시 타이머 (처음 입장했거나 수동으로 다시 뽑았을 때 연출 보장)
    this.localBoxModalTimer = 2.6;
    this.lastSeenBoxSeq = 0;
    this.rouletteAnimTime = 0;

    this.input = new InputController({
      canvas: this.canvas,
      leftZone: $('leftStickZone'),
      leftKnob: $('leftStickKnob'),
      rightZone: $('rightStickZone'),
      rightKnob: $('rightStickKnob'),
      reloadBtn: $('reloadBtn'),
      skill1Btn: $('skill1Btn'),
      skill2Btn: $('skill2Btn'),
      onInteract: () => this.audio.unlock(),
      onSelectClass: (classId) => this.selectClass(classId),
    });

    this.transport.onStatusUpdate((status) => {
      this.localPlayerId = status.localPlayerId || this.localPlayerId;
      const roomEl = $('roomStatusText');
      const roomBtn = $('roomChangeBtn');
      if (status.isOnline) {
        roomEl.textContent = `🟢 ${status.roomId} (${status.onlineCount}P)`;
        if (roomBtn) roomBtn.textContent = `📡 경기장: ${status.roomId} (${status.onlineCount}명)`;
      } else {
        roomEl.textContent = `⚪ OFFLINE (LOCAL)`;
      }
      if (status.isWelcome) {
        this.localBoxModalTimer = 2.6;
        this.rouletteAnimTime = 0;
      }
    });

    this.transport.onStateUpdate((snapshot) => {
      this.latestSnapshot = snapshot;
      if (snapshot.events && snapshot.events.length > 0) {
        this.renderer.processEvents(snapshot.events);
        for (let i = 0; i < snapshot.events.length; i++) {
          this.audio.playEvent(snapshot.events[i]);
        }
      }
    });

    this._bindUI();
    this._handleResize();
    window.addEventListener('resize', () => this._handleResize());

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }

  selectClass(classId) {
    this.audio.unlock();
    if (classId === 'random') {
      this.localBoxModalTimer = 2.2;
      this.rouletteAnimTime = 0;
      this.transport.rollRandomBox();
    } else {
      this.transport.switchClass(classId);
    }
  }

  _bindUI() {
    const rerollBtn = $('rerollBoxBtn');
    rerollBtn?.addEventListener('click', () => {
      this.selectClass('random');
    });

    const newRoundBtn = $('newRoundBtn');
    newRoundBtn?.addEventListener('click', () => {
      this.audio.unlock();
      this.localBoxModalTimer = 2.8;
      this.rouletteAnimTime = 0;
      this.transport.startNewRound();
    });

    const roomBtn = $('roomChangeBtn');
    roomBtn?.addEventListener('click', () => {
      this.audio.unlock();
      const nextRoom = window.prompt(
        '입장할 원형 배틀로얄 경기장 코드를 입력하세요 (예: ROYALE-01, ROYALE-02):',
        this.transport.roomId
      );
      if (nextRoom && nextRoom.trim()) {
        this.transport.joinRoom(nextRoom.trim().toUpperCase());
      }
    });

    const soundBtn = $('soundBtn');
    soundBtn?.addEventListener('click', () => {
      const on = this.audio.toggleMute();
      soundBtn.textContent = on ? '🔊 사운드 ON' : '🔇 사운드 OFF';
      soundBtn.classList.toggle('muted', !on);
    });
  }

  _handleResize() {
    const viewport = $('viewport');
    const rect = viewport.getBoundingClientRect();
    this.renderer.resize(rect.width, rect.height);
  }

  _loop(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;

    if (this.localBoxModalTimer > 0) {
      this.localBoxModalTimer = Math.max(0, this.localBoxModalTimer - dt);
    }
    this.rouletteAnimTime += dt;

    this.localPlayerId = this.transport.localPlayerId;
    const localPlayer =
      this.latestSnapshot?.players.find((p) => p.id === this.localPlayerId) ||
      this.latestSnapshot?.players[0];
    const screenPos = this.renderer.getPlayerScreenPos(localPlayer);

    const inputCmd = this.input.sampleInputCommand(screenPos.x, screenPos.y);
    this.transport.sendInput(inputCmd);

    this.transport.tick(dt);

    if (this.latestSnapshot) {
      this.renderer.render(this.latestSnapshot, this.localPlayerId, dt);
      this._updateHUD(localPlayer, this.latestSnapshot);
    }

    requestAnimationFrame((t) => this._loop(t));
  }

  _updateHUD(p, snapshot) {
    if (!p) return;

    // 서버에서 새 라운드 랜덤박스 추첨(boxRollSeq 증가)이 일어났으면 룰렛 모달 활성화!
    if (p.boxRollSeq && p.boxRollSeq !== this.lastSeenBoxSeq) {
      this.lastSeenBoxSeq = p.boxRollSeq;
      this.localBoxModalTimer = Math.max(this.localBoxModalTimer, 2.4);
      this.rouletteAnimTime = 0;
    }

    const spec = resolveWeaponSpec(p.classId);
    $('heroTitleText').textContent = `${spec.icon} ${p.name} · ${spec.name}`;
    const tierBadge = $('tierBadgeText');
    if (tierBadge) {
      tierBadge.textContent = spec.tier || 'RARE';
      tierBadge.style.color = spec.tierColor || '#ffd32a';
      tierBadge.style.borderColor = spec.tierColor || '#ffd32a';
    }

    // 1. 자기장 반경(RING) 및 내 체력(HP) · 탄약(AMMO) 표시
    const safeR = snapshot.safeRadius ?? WORLD_CONFIG.ARENA_RADIUS;
    const maxR = snapshot.arenaRadius || WORLD_CONFIG.ARENA_RADIUS;
    const ringPct = Math.max(0, Math.min(100, (safeR / maxR) * 100));
    $('baseFill').style.width = `${ringPct}%`;
    $('baseText').textContent = `${Math.round(safeR)}m`;

    const hpPct = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));
    $('hpFill').style.width = `${hpPct}%`;
    $('hpText').textContent = p.alive ? `${Math.ceil(p.hp)} / ${p.maxHp}` : '💀 ELIMINATED';

    $('ammoLabel').textContent = (p.ammoLabel || 'AMMO').slice(0, 4);
    $('reloadBtnName').textContent = p.reloadLabel || '탄창교체';

    const ammoText = $('ammoText');
    const ammoFill = $('ammoFill');
    const reloadBtn = $('reloadBtn');

    if (p.isReloading) {
      const reloadPct = Math.min(100, (p.reloadTimer / p.reloadDuration) * 100);
      ammoText.textContent = `${p.reloadLabel} ${Math.floor(reloadPct)}%`;
      ammoText.classList.add('reloading');
      ammoFill.style.width = `${reloadPct}%`;
      ammoFill.classList.add('reloading');
      reloadBtn.classList.add('reloading');
    } else {
      ammoText.textContent = `${String(p.ammo).padStart(2, '0')} / ${p.maxAmmo}`;
      ammoText.classList.remove('reloading');
      ammoFill.style.width = `${(p.ammo / p.maxAmmo) * 100}%`;
      ammoFill.classList.remove('reloading');
      reloadBtn.classList.remove('reloading');
    }

    // 2. 총기 전용 전술 스킬 1·2 버튼 표시
    const skill1Btn = $('skill1Btn');
    $('skill1Name').textContent = p.skill1Name || '스킬 1';
    if (p.skill1Cooldown > 0) {
      skill1Btn.classList.add('cooldown');
      $('skill1CdText').textContent = `${p.skill1Cooldown.toFixed(1)}s`;
    } else {
      skill1Btn.classList.remove('cooldown');
      $('skill1CdText').textContent = 'SHIFT';
    }

    const skill2Btn = $('skill2Btn');
    $('skill2Name').textContent = p.skill2Name || '스킬 2';
    if (p.skill2Cooldown > 0) {
      skill2Btn.classList.add('cooldown');
      $('skill2CdText').textContent = `${p.skill2Cooldown.toFixed(1)}s`;
    } else {
      skill2Btn.classList.remove('cooldown');
      $('skill2CdText').textContent = 'KEY E';
    }

    // 3. 라운드 & 생존 인원(ALIVE) & 처치/우승 카운트
    const roundNum = snapshot.round || 1;
    const aliveCount = snapshot.aliveCount ?? snapshot.players.length;
    const totalCount = snapshot.totalCount ?? snapshot.players.length;
    $('waveText').textContent = `ROUND ${String(roundNum).padStart(2, '0')}`;
    $('aliveText').textContent = `${aliveCount} / ${totalCount}`;
    $('killText').textContent = `${p.kills || 0}K · ${p.wins || 0}W`;

    // 4. 생존자 로스터 (누가 어떤 랜덤 무기를 들고 살아남았는지 실시간 표시)
    const rosterEl = $('squadRoster');
    if (rosterEl && snapshot.players) {
      rosterEl.innerHTML = snapshot.players
        .map((member) => {
          const mSpec = resolveWeaponSpec(member.classId);
          const isMe = member.id === this.localPlayerId;
          const deadClass = member.alive ? '' : 'dead';
          const statusStr = member.alive
            ? `HP ${Math.ceil(member.hp)}`
            : '💀 탈락';
          return `<div class="squad-member ${isMe ? 'me' : ''} ${deadClass}">
            <span>${mSpec.icon} ${member.name}${isMe ? ' (나)' : ''}</span>
            <span>${statusStr}</span>
          </div>`;
        })
        .join('');
    }

    // 5. 실시간 킬피드 배너
    const killFeedEl = $('killFeedBox');
    if (killFeedEl && snapshot.killFeed) {
      killFeedEl.innerHTML = snapshot.killFeed
        .slice(0, 3)
        .map((item) => `<div class="kill-item">⚔️ ${item.text}</div>`)
        .join('');
    }

    // ========================================================================
    // 6. [핵심 연출 1] 라운드 시작 랜덤 무기 박스(Random Weapon Box) 모달 제어
    // ========================================================================
    const boxOverlay = $('randomBoxOverlay');
    const isRoulettePhase =
      snapshot.roundState === 'roulette' || this.localBoxModalTimer > 0;

    if (boxOverlay) {
      boxOverlay.classList.toggle('hidden', !isRoulettePhase);
      if (isRoulettePhase) {
        $('boxRoundBadge').textContent = `ROUND ${String(roundNum).padStart(2, '0')} · ${totalCount}인 원형 서바이벌`;

        // 초반 1.1초 동안은 6개 무기 슬롯이 빠르게 회전하고, 이후 당첨된 무기에 고정!
        const isSpinning = this.rouletteAnimTime < 1.1;
        const spinWeaponKey =
          WEAPON_KEYS[Math.floor(this.rouletteAnimTime * 16) % WEAPON_KEYS.length];

        document.querySelectorAll('.roulette-item').forEach((el) => {
          const wKey = el.dataset.weapon;
          if (isSpinning) {
            el.classList.toggle('spinning', wKey === spinWeaponKey);
            el.classList.remove('selected');
          } else {
            el.classList.remove('spinning');
            el.classList.toggle('selected', wKey === spec.id);
          }
        });

        if (isSpinning) {
          const tempSpec = resolveWeaponSpec(spinWeaponKey);
          $('drawnWeaponTitle').textContent = `🎲 랜덤박스 추첨 중... [${tempSpec.icon} ${tempSpec.name}]`;
          $('drawnWeaponDesc').textContent = `${tempSpec.role} · ${tempSpec.weaponName}`;
        } else {
          $('drawnWeaponTitle').textContent = `✨ 당첨 무기: ${spec.icon} ${spec.name} [${spec.tier}]`;
          $('drawnWeaponDesc').textContent = `[Shift] ${spec.skill1.name}  |  [E] ${spec.skill2.name}`;
        }

        const remainSec =
          snapshot.roundState === 'roulette'
            ? Math.max(0, snapshot.stateTimer || 0)
            : this.localBoxModalTimer;
        $('drawnTimerText').textContent =
          snapshot.roundState === 'roulette'
            ? `원형 경기장 전투 개시까지 ${remainSec.toFixed(1)}초`
            : `랜덤 무기 지급 완료! (${remainSec.toFixed(1)}s)`;
      }
    }

    // ========================================================================
    // 7. [핵심 연출 2] 최후의 1인(WINNER) 우승자 발표 모달 제어
    // ========================================================================
    const winOverlay = $('winnerOverlay');
    if (winOverlay) {
      const isRoundOver = snapshot.roundState === 'round_over' && snapshot.winner;
      winOverlay.classList.toggle('hidden', !isRoundOver);
      if (isRoundOver && snapshot.winner) {
        const w = snapshot.winner;
        $('winnerNameText').textContent = `${w.icon || '🏆'} ${w.name} 승리!`;
        $('winnerWeaponText').textContent = `당첨 랜덤 무기: ${w.className} · 이번 라운드 ${w.kills}킬 (누적 ${w.wins}승)`;
        $('winnerNextText').textContent = `${Math.max(0, snapshot.stateTimer || 0).toFixed(1)}초 후 다음 라운드 랜덤박스가 시작됩니다...`;
      }
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new GameClient();
});
