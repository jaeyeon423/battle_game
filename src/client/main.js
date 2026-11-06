// ============================================================================
// [Client] 메인 엔트리 포인트 — 원형 배틀로얄: 모바일 멀티플레이 & 방장 시작 시스템
// - 세로(Portrait) 화면 시 자동 90도 가로 회전(.force-landscape) 및 전체화면(Fullscreen) 지원
// - 자동 조준 보조(Auto-Aim Assist) + HUD DOM 캐싱으로 모바일 60FPS 최적화
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
    const initRoomParam = params.get('room') || '';
    const savedName = (() => {
      try {
        return localStorage.getItem('cr_player_name') || '';
      } catch {
        return '';
      }
    })();
    const savedUser = (() => {
      try {
        return localStorage.getItem('cr_auth_user') || '';
      } catch {
        return '';
      }
    })();
    const initName = params.get('name') || savedName || '';
    const initClass = params.get('class') || '';
    this.autoStartParam = params.get('autostart') === '1';

    this.authMode = 'login';
    this.isLoggedIn = false;
    this.currentUser = savedUser || '';
    this.inRoom = false;

    this.selectedWaitClass = initClass || 'random';
    this.createRoomMaxPlayers = 2;
    this.createRoomBotMode = 'auto';
    this.roomBrowserOpen = false;
    this.availableRooms = [];

    // DOM 리플로우 방지용 캐시 문자열
    this._cachedRosterHtml = '';
    this._cachedKillFeedHtml = '';
    this._cachedWaitListHtml = '';

    // 접속 시에는 방에 바로 들어가지 않고 로그인 -> 방 목록 순서로 진행
    this.localPlayerId = this.transport.connect(initName, initClass, initRoomParam, false);
    this.latestSnapshot = this.transport.displaySnapshot;

    // 로컬 랜덤박스 모달 표시 타이머 (전투 중 수동 다시 뽑기 시에만 사용)
    this.localBoxModalTimer = 0;
    this.lastSeenBoxSeq = 0;
    this.rouletteAnimTime = 0;

    this.input = new InputController({
      canvas: this.canvas,
      moveTouchPad: $('moveTouchPad'),
      leftZone: $('leftStickZone'),
      leftKnob: $('leftStickKnob'),
      rightZone: $('rightStickZone'),
      rightKnob: $('rightStickKnob'),
      reloadBtn: $('reloadBtn'),
      skill1Btn: $('skill1Btn'),
      skill2Btn: $('skill2Btn'),
      onInteract: () => this.audio.unlock(),
      onSelectClass: (classId) => this.selectClass(classId),
      getAutoAimAngle: () => this._findNearestEnemyAngle(),
    });

    this.transport.onStatusUpdate((status) => {
      this.localPlayerId = status.localPlayerId || this.localPlayerId;
      const roomEl = $('roomStatusText');
      const roomBtn = $('roomChangeBtn');
      const pingEl = $('pingStatusText');

      if (typeof status.ping === 'number' && pingEl) {
        const pVal = status.ping;
        pingEl.textContent = `${pVal}ms`;
        if (pVal <= 65) {
          pingEl.style.color = '#7bed9f'; // 원활
        } else if (pVal <= 140) {
          pingEl.style.color = '#ffd32a'; // 보통
        } else {
          pingEl.style.color = '#ff4757'; // 지연
        }
      }

      if (status.isOnline) {
        if (roomEl) roomEl.textContent = `🟢 ${status.roomId} (${status.onlineCount}P)`;
        if (roomBtn) roomBtn.textContent = `🏠 방 목록`;
      } else {
        if (roomEl) roomEl.textContent = `⚪ OFFLINE`;
        if (pingEl) pingEl.textContent = `0ms`;
      }

      if (status.isWelcome) {
        this.inRoom = true;
        this.closeRoomBrowser();
        this.closeCreateRoomModal();
        const nickInput = $('waitNicknameInput');
        if (nickInput && status.playerName) {
          nickInput.value = status.playerName;
        }
        if (this.autoStartParam && status.hostId === this.localPlayerId) {
          this.autoStartParam = false;
          this.transport.hostStartGame();
        }
      }
    });

    this.transport.onAuthSuccess((authMsg) => {
      this.isLoggedIn = true;
      this.currentUser = authMsg.username || this.currentUser || 'hero01';
      const finalNick = authMsg.nickname || this._getEnteredNickname() || this.currentUser;
      try {
        localStorage.setItem('cr_auth_user', this.currentUser);
        localStorage.setItem('cr_player_name', finalNick);
      } catch {}

      const waitInput = $('waitNicknameInput');
      if (waitInput) waitInput.value = finalNick;
      this.isAdmin = Boolean(authMsg.isAdmin || this.currentUser.toLowerCase() === 'kim423');
      const rolePrefix = this.isAdmin ? '👑 운영자 · ' : '👤 ';
      const profileEl = $('lobbyUserProfileText');
      if (profileEl) profileEl.textContent = `${rolePrefix}${finalNick} (${this.currentUser})`;
      const nickBtn = $('nicknameBtn');
      if (nickBtn) nickBtn.textContent = `✏️ ${finalNick}`;

      $('authOverlay')?.classList.add('hidden');
      this.openRoomBrowser();
    });

    this.transport.onAuthError((errMsg) => {
      const msgEl = $('authStatusMsg');
      if (msgEl) {
        msgEl.textContent = `⚠️ ${errMsg}`;
        msgEl.style.color = '#ff4757';
      }
    });

    this.transport.onRoomListUpdate((rooms) => {
      this.availableRooms = rooms || [];
      this._renderRoomBrowserList();
    });

    this.transport.onStateUpdate((snapshot) => {
      this.latestSnapshot = snapshot;
      if (snapshot.events && snapshot.events.length > 0) {
        this.renderer.processEvents(snapshot.events);
        for (let i = 0; i < snapshot.events.length; i++) {
          const ev = snapshot.events[i];
          this.audio.playEvent(ev);
          if (ev.type === 'round_roulette') {
            this.rouletteAnimTime = 0;
          }
        }
      }
    });

    this._bindUI();
    this._handleResize();
    window.addEventListener('resize', () => this._handleResize());
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this._handleResize(), 80);
    });

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }

  /**
   * 가장 가까운 생존 적(또는 파괴 가능한 화약통) 방향 각도를 계산하여 탭 공격(Auto-Aim)을 돕습니다.
   */
  _findNearestEnemyAngle() {
    const snap = this.latestSnapshot;
    if (!snap || !snap.players) return null;
    const me = snap.players.find((p) => p.id === this.localPlayerId);
    if (!me || !me.alive) return null;

    const myX = typeof me._renderX === 'number' ? me._renderX : me.x;
    const myY = typeof me._renderY === 'number' ? me._renderY : me.y;

    let bestDistSq = Infinity;
    let bestAngle = null;

    // 1. 가장 가까운 살아있는 적 플레이어 탐색
    for (let i = 0; i < snap.players.length; i++) {
      const other = snap.players[i];
      if (!other.alive || other.id === me.id) continue;
      const ox = typeof other._renderX === 'number' ? other._renderX : other.x;
      const oy = typeof other._renderY === 'number' ? other._renderY : other.y;
      const dx = ox - myX;
      const dy = oy - myY;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestAngle = Math.atan2(dy, dx);
      }
    }

    // 2. 만약 살아있는 적이 없으면 가까운 파괴 가능한 장애물(폭발 화약통/방책) 탐색
    if (bestAngle === null && snap.obstacles) {
      for (let i = 0; i < snap.obstacles.length; i++) {
        const obs = snap.obstacles[i];
        if (obs.hp <= 0 || !obs.destructible) continue;
        const dx = obs.x - myX;
        const dy = obs.y - myY;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDistSq) {
          bestDistSq = d2;
          bestAngle = Math.atan2(dy, dx);
        }
      }
    }

    return bestAngle !== null ? bestAngle : me.aimAngle;
  }

  async toggleFullscreen() {
    this.audio.unlock();
    try {
      const docEl = document.documentElement;
      if (!document.fullscreenElement && docEl.requestFullscreen) {
        await docEl.requestFullscreen();
        if (screen.orientation && screen.orientation.lock) {
          try {
            await screen.orientation.lock('portrait');
          } catch {}
        }
      } else if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {}
    setTimeout(() => this._handleResize(), 100);
  }

  selectClass(classId) {
    this.audio.unlock();
    this.selectedWaitClass = classId || 'random';
    this._updateWaitClassButtons();

    if (classId === 'random') {
      if (this.latestSnapshot?.roundState === 'combat') {
        this.localBoxModalTimer = 2.0;
        this.rouletteAnimTime = 0;
      }
      this.transport.rollRandomBox();
    } else {
      this.transport.switchClass(classId);
    }
  }

  _updateWaitClassButtons() {
    document.querySelectorAll('.wait-class-btn').forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.class === this.selectedWaitClass);
    });
  }

  setAuthTab(mode) {
    this.authMode = mode === 'signup' ? 'signup' : 'login';
    $('tabLoginBtn')?.classList.toggle('active', this.authMode === 'login');
    $('tabSignupBtn')?.classList.toggle('active', this.authMode === 'signup');
    $('authNicknameField')?.classList.toggle('hidden', this.authMode !== 'signup');
    const submitBtn = $('authSubmitBtn');
    if (submitBtn) {
      submitBtn.textContent =
        this.authMode === 'signup'
          ? '📝 회원가입 완료 및 방 목록 입장'
          : '🚀 로그인하고 방 목록 입장';
    }
  }

  submitAuth() {
    this.audio.unlock();
    const rawUser = $('authUsernameInput')?.value.trim() || 'hero01';
    const rawPass = $('authPasswordInput')?.value || '1234';
    const rawNick =
      this.authMode === 'signup'
        ? $('authNicknameInput')?.value.trim() || rawUser.slice(0, 12)
        : '';

    this.transport.authenticate({
      mode: this.authMode,
      username: rawUser,
      password: rawPass,
      nickname: rawNick,
    });
  }

  logout() {
    this.audio.unlock();
    this.isLoggedIn = false;
    this.inRoom = false;
    this.transport.leaveRoom();
    this.closeRoomBrowser();
    this.closeCreateRoomModal();
    $('waitingRoomOverlay')?.classList.add('hidden');
    $('authOverlay')?.classList.remove('hidden');
  }

  openRoomBrowser() {
    this.audio.unlock();
    this.roomBrowserOpen = true;
    $('roomBrowserOverlay')?.classList.remove('hidden');
    $('closeRoomBrowserBtn')?.classList.toggle('hidden', !this.inRoom);
    this.transport.requestRoomList();
  }

  closeRoomBrowser() {
    this.roomBrowserOpen = false;
    $('roomBrowserOverlay')?.classList.add('hidden');
  }

  openCreateRoomModal() {
    this.audio.unlock();
    $('createRoomOverlay')?.classList.remove('hidden');
    const nameInput = $('createRoomNameInput');
    if (nameInput && !nameInput.value) {
      const myNick = this._getEnteredNickname() || this.currentUser || '영웅';
      nameInput.value = `${myNick}의 결투장`.slice(0, 20);
    }
    setTimeout(() => nameInput?.focus(), 40);
  }

  closeCreateRoomModal() {
    $('createRoomOverlay')?.classList.add('hidden');
  }

  _renderRoomBrowserList() {
    const listEl = $('activeRoomList');
    if (!listEl) return;

    if (!this.availableRooms || this.availableRooms.length === 0) {
      listEl.innerHTML = `<div class="rb-room-item"><div class="rb-room-info"><b>열려있는 방이 없습니다</b><small>우측 상단 [➕ 방 만들기]로 새 방을 만들어 방장이 되어보세요!</small></div></div>`;
      return;
    }

    listEl.innerHTML = this.availableRooms
      .map((r) => {
        const isCurrent = this.inRoom && r.roomId === this.transport.roomId;
        const stateLabel =
          r.roundState === 'waiting'
            ? '🟢 대기실 (입장 가능)'
            : r.roundState === 'roulette'
              ? '🎲 무기 추첨중'
              : '⚔️ 전투 진행중';
        return `<div class="rb-room-item ${isCurrent ? 'current' : ''}">
          <div class="rb-room-info">
            <b>${r.roomName || r.roomId} <span style="color:#5ef2ff">[${r.roomId}]</span></b>
            <small>👑 방장: ${r.hostName || '대기중'} · 👥 ${r.onlineCount}/${r.maxPlayers || 4}명 · ${stateLabel}</small>
          </div>
          <button type="button" class="rb-join-btn" data-join-room="${r.roomId}">
            ${isCurrent ? '현재 방' : '입장하기'}
          </button>
        </div>`;
      })
      .join('');

    listEl.querySelectorAll('[data-join-room]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetRoomId = btn.getAttribute('data-join-room');
        if (targetRoomId) {
          this.transport.joinRoom(targetRoomId, this._getEnteredNickname(), this.selectedWaitClass === 'random' ? '' : this.selectedWaitClass);
          this.closeRoomBrowser();
        }
      });
    });
  }

  generateRandomNickname() {
    const prefixes = ['성검', '신궁', '대마법사', '불꽃', '서리', '폭풍', '어둠', '황금', '푸른달', '홍련'];
    const suffixes = ['아서스', '레골라스', '멀린', '발키리', '랜슬롯', '아르웬', '가웨인', '제이나', '드래곤', '나이트'];
    const p = prefixes[Math.floor(Math.random() * prefixes.length)];
    const s = suffixes[Math.floor(Math.random() * suffixes.length)];
    const num = Math.floor(10 + Math.random() * 89);
    return `${p}${s}${num}`.slice(0, 12);
  }

  applyNickname(rawName) {
    const clean = String(rawName || '').trim().slice(0, 12);
    if (!clean) return;
    try {
      localStorage.setItem('cr_player_name', clean);
    } catch {}
    const waitInput = $('waitNicknameInput');
    if (waitInput) waitInput.value = clean;
    const modalInput = $('modalNicknameInput');
    if (modalInput) modalInput.value = clean;
    const nickBtn = $('nicknameBtn');
    if (nickBtn) nickBtn.textContent = `✏️ ${clean}`;
    const profileEl = $('lobbyUserProfileText');
    if (profileEl) profileEl.textContent = `${this.isAdmin ? '👑 운영자 · ' : '👤 '}${clean} (${this.currentUser || '게스트'})`;
    this.transport.setPlayerName(clean);
  }

  openNicknameModal() {
    this.audio.unlock();
    const overlay = $('nicknameOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    const modalInput = $('modalNicknameInput');
    const curName =
      this.latestSnapshot?.players.find((p) => p.id === this.localPlayerId)?.name ||
      this._getEnteredNickname() ||
      '';
    if (modalInput) {
      modalInput.value = curName;
      setTimeout(() => modalInput.focus(), 40);
    }
  }

  closeNicknameModal() {
    $('nicknameOverlay')?.classList.add('hidden');
  }

  _getEnteredNickname() {
    const nickInput = $('waitNicknameInput');
    const val = nickInput ? nickInput.value.trim().slice(0, 12) : '';
    if (val) {
      try {
        localStorage.setItem('cr_player_name', val);
      } catch {}
    }
    return val;
  }

  _bindUI() {
    // 0. 로그인 / 회원가입 모달 이벤트
    if (this.currentUser && $('authUsernameInput')) {
      $('authUsernameInput').value = this.currentUser;
    }

    $('tabLoginBtn')?.addEventListener('click', () => this.setAuthTab('login'));
    $('tabSignupBtn')?.addEventListener('click', () => this.setAuthTab('signup'));

    $('authRandomNickBtn')?.addEventListener('click', () => {
      const rand = this.generateRandomNickname();
      if ($('authNicknameInput')) $('authNicknameInput').value = rand;
    });

    $('authSubmitBtn')?.addEventListener('click', () => {
      this.submitAuth();
    });

    ['authUsernameInput', 'authPasswordInput', 'authNicknameInput'].forEach((id) => {
      $(id)?.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') this.submitAuth();
      });
    });

    $('logoutBtn')?.addEventListener('click', () => {
      this.logout();
    });

    $('openCreateRoomModalBtn')?.addEventListener('click', () => {
      this.openCreateRoomModal();
    });

    $('closeCreateRoomModalBtn')?.addEventListener('click', () => {
      this.closeCreateRoomModal();
    });

    // 1. 상단 HUD 버튼들
    $('fullscreenBtn')?.addEventListener('click', () => {
      this.toggleFullscreen();
    });

    $('roomChangeBtn')?.addEventListener('click', () => {
      this.openRoomBrowser();
    });

    $('openRoomBrowserBtn')?.addEventListener('click', () => {
      this.inRoom = false;
      this.transport.leaveRoom();
      $('waitingRoomOverlay')?.classList.add('hidden');
      this.openRoomBrowser();
    });

    $('closeRoomBrowserBtn')?.addEventListener('click', () => {
      if (this.inRoom) this.closeRoomBrowser();
    });

    $('refreshRoomsBtn')?.addEventListener('click', () => {
      this.transport.requestRoomList();
    });

    $('rerollBoxBtn')?.addEventListener('click', () => {
      this.selectClass('random');
    });

    $('newRoundBtn')?.addEventListener('click', () => {
      this.audio.unlock();
      if (this.latestSnapshot?.roundState === 'waiting') {
        this.transport.hostStartGame();
      } else {
        this.transport.returnToWaiting();
      }
    });

    const soundBtn = $('soundBtn');
    soundBtn?.addEventListener('click', () => {
      const on = this.audio.toggleMute();
      soundBtn.textContent = on ? '🔊 사운드' : '🔇 음소거';
      soundBtn.classList.toggle('muted', !on);
    });

    // 1-2. 상단 HUD 및 캐릭터 타이틀 닉네임 변경 모달 연결
    $('nicknameBtn')?.addEventListener('click', () => {
      this.openNicknameModal();
    });

    $('heroTitleText')?.addEventListener('click', () => {
      this.openNicknameModal();
    });

    $('closeNicknameModalBtn')?.addEventListener('click', () => {
      this.closeNicknameModal();
    });

    $('modalRandomNickBtn')?.addEventListener('click', () => {
      const rand = this.generateRandomNickname();
      const modalInput = $('modalNicknameInput');
      if (modalInput) modalInput.value = rand;
    });

    $('confirmNicknameModalBtn')?.addEventListener('click', () => {
      const val = $('modalNicknameInput')?.value.trim();
      if (val) this.applyNickname(val);
      this.closeNicknameModal();
    });

    $('modalNicknameInput')?.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const val = $('modalNicknameInput')?.value.trim();
        if (val) this.applyNickname(val);
        this.closeNicknameModal();
      }
    });

    // 2. 대기실(Waiting Room) 내부 인터랙션
    $('saveNicknameBtn')?.addEventListener('click', () => {
      const name = this._getEnteredNickname();
      if (name) {
        this.applyNickname(name);
      }
    });

    $('randomNicknameBtn')?.addEventListener('click', () => {
      const rand = this.generateRandomNickname();
      this.applyNickname(rand);
    });

    $('waitNicknameInput')?.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const name = this._getEnteredNickname();
        if (name) this.applyNickname(name);
      }
    });

    document.querySelectorAll('.wait-class-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cls = btn.dataset.class || 'random';
        this.selectClass(cls);
      });
    });

    $('botModeToggleBtn')?.addEventListener('click', () => {
      const cur = this.latestSnapshot?.botFillMode || 'auto';
      const next = cur === 'auto' ? 'off' : cur === 'off' ? 'on' : 'auto';
      this.transport.setRoomConfig({ botFillMode: next });
    });

    $('maxPlayersToggleBtn')?.addEventListener('click', () => {
      const cur = this.latestSnapshot?.maxPlayers || 4;
      const next = cur === 2 ? 4 : cur === 4 ? 8 : 2;
      this.transport.setRoomConfig({ maxPlayers: next });
    });

    $('hostStartBtn')?.addEventListener('click', () => {
      this.audio.unlock();
      const name = this._getEnteredNickname();
      if (name) this.transport.setPlayerName(name);
      this.rouletteAnimTime = 0;
      this.transport.hostStartGame();
    });

    $('guestReadyBtn')?.addEventListener('click', () => {
      this.audio.unlock();
      const name = this._getEnteredNickname();
      if (name) this.transport.setPlayerName(name);
      this.transport.toggleReady();
    });

    // 3. 방 목록 / 새 방 만들기 모달 인터랙션
    $('joinByCodeBtn')?.addEventListener('click', () => {
      const code = $('joinCodeInput')?.value.trim().toUpperCase();
      if (code) {
        this.transport.joinRoom(code, this._getEnteredNickname(), this.selectedWaitClass === 'random' ? '' : this.selectedWaitClass);
        this.closeRoomBrowser();
      }
    });

    document.querySelectorAll('#createMaxPlayersRow .rb-opt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.createRoomMaxPlayers = Number(btn.dataset.max) || 2;
        document.querySelectorAll('#createMaxPlayersRow .rb-opt-btn').forEach((b) => {
          b.classList.toggle('selected', b === btn);
        });
      });
    });

    document.querySelectorAll('#createBotModeRow .rb-opt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.createRoomBotMode = btn.dataset.bot || 'auto';
        document.querySelectorAll('#createBotModeRow .rb-opt-btn').forEach((b) => {
          b.classList.toggle('selected', b === btn);
        });
      });
    });

    $('createRoomConfirmBtn')?.addEventListener('click', () => {
      this.audio.unlock();
      const roomName = $('createRoomNameInput')?.value.trim() || '';
      const playerName = this._getEnteredNickname();
      this.transport.createRoom({
        roomName,
        maxPlayers: this.createRoomMaxPlayers,
        botFillMode: this.createRoomBotMode,
        playerName,
        classId: this.selectedWaitClass === 'random' ? '' : this.selectedWaitClass,
      });
      this.closeCreateRoomModal();
      this.closeRoomBrowser();
    });

    // 4. 우승자 화면 버튼
    $('winnerRestartBtn')?.addEventListener('click', () => {
      this.audio.unlock();
      this.rouletteAnimTime = 0;
      this.transport.hostStartGame();
    });

    $('winnerToLobbyBtn')?.addEventListener('click', () => {
      this.audio.unlock();
      this.transport.returnToWaiting();
    });
  }

  /**
   * 모바일 세로(Portrait) 화면 크기에 맞춰 캔버스와 렌더러를 리사이즈합니다.
   */
  _handleResize() {
    const viewport = $('viewport');
    if (!viewport) return;
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
    if (localPlayer) {
      localPlayer.isAiming = this.input.isAiming;
      if (this.input.isAiming && typeof this.input.aimAngle === 'number') {
        localPlayer.aimAngle = this.input.aimAngle;
      }
    }
    const screenPos = this.renderer.getPlayerScreenPos(localPlayer);

    const inputCmd = this.input.sampleInputCommand(screenPos.x, screenPos.y, dt);
    this.transport.sendInput(inputCmd);

    this.transport.tick(dt);

    if (this.latestSnapshot) {
      this.renderer.render(this.latestSnapshot, this.localPlayerId, dt);
      this._updateHUD(localPlayer, this.latestSnapshot);
    }

    requestAnimationFrame((t) => this._loop(t));
  }

  _updateWaitingRoomUI(p, snapshot) {
    const waitOverlay = $('waitingRoomOverlay');
    if (!waitOverlay) return;

    const isWaiting = this.isLoggedIn && this.inRoom && !this.roomBrowserOpen && snapshot.roundState === 'waiting';
    waitOverlay.classList.toggle('hidden', !isWaiting);
    if (!isWaiting) return;

    const roomId = this.transport.roomId || 'ROYALE-01';
    const roomName = snapshot.roomName || this.transport.roomName || `${roomId} 결투장`;
    const maxPlayers = snapshot.maxPlayers || this.transport.maxPlayers || 4;
    const isMeHost = snapshot.hostId === this.localPlayerId || (!snapshot.hostId && p?.isHost);

    $('waitRoomCodeBadge').textContent = `방 코드: ${roomId}`;
    $('waitRoomTitleText').textContent = roomName;

    const humans = snapshot.players.filter((m) => !m.isBot);
    const bots = snapshot.players.filter((m) => m.isBot);
    $('waitPlayerCountText').textContent = `${humans.length} / ${maxPlayers}명`;

    const botMode = snapshot.botFillMode || 'auto';
    const botTag = $('waitBotStatusTag');
    if (botTag) {
      if (botMode === 'off') {
        botTag.textContent = '🚫 AI 봇 없음 (실제 유저 전용)';
      } else if (botMode === 'on') {
        botTag.textContent = `🤖 빈자리 AI 봇 자동 참가 (${bots.length}기)`;
      } else {
        botTag.textContent =
          humans.length === 1
            ? '🤖 1인 시작 시 AI 상대 1명 자동 대결'
            : '⚔️ 유저 2명 이상: 유저끼리 진검승부!';
      }
    }

    // 참가자 카드 목록 렌더링 (문자열 변경 시에만 innerHTML 갱신)
    const playerListEl = $('waitingPlayerList');
    if (playerListEl) {
      const nextWaitHtml = snapshot.players
        .map((member) => {
          const mSpec = resolveWeaponSpec(member.classId);
          const isMe = member.id === this.localPlayerId;
          const isHost = member.id === snapshot.hostId || member.isHost;

          let roleBadge = '';
          if (member.isBot) {
            roleBadge = `<span class="wp-role-badge wait">🤖 AI 상대</span>`;
          } else if (isHost) {
            roleBadge = `<span class="wp-role-badge host">👑 방장</span>`;
          } else if (member.ready) {
            roleBadge = `<span class="wp-role-badge ready">✅ 준비완료</span>`;
          } else {
            roleBadge = `<span class="wp-role-badge wait">⏳ 대기중</span>`;
          }

          const classLabel =
            !member.isBot && !member.preferredClass
              ? `🎲 랜덤 (${mSpec.icon} ${mSpec.name})`
              : `${mSpec.icon} ${mSpec.name}`;

          return `<div class="wait-player-card ${isMe ? 'is-me' : ''} ${member.isBot ? 'is-bot' : ''}">
            <div class="wp-left">
              ${roleBadge}
              <span>${member.name}${isMe ? ' (나)' : ''}</span>
            </div>
            <span class="wp-class-tag">${classLabel}</span>
          </div>`;
        })
        .join('');

      if (nextWaitHtml !== this._cachedWaitListHtml) {
        this._cachedWaitListHtml = nextWaitHtml;
        playerListEl.innerHTML = nextWaitHtml;
      }
    }

    $('hostActionBar')?.classList.toggle('hidden', !isMeHost);
    $('guestActionBar')?.classList.toggle('hidden', isMeHost);

    if (isMeHost) {
      const botBtn = $('botModeToggleBtn');
      if (botBtn) {
        const modeText =
          botMode === 'auto'
            ? '🤖 AI 봇: 자동(1인용)'
            : botMode === 'on'
              ? '🤖 AI 봇: 항상 켜짐'
              : '🚫 AI 봇: 끄기(유저만)';
        botBtn.textContent = modeText;
      }
      const maxBtn = $('maxPlayersToggleBtn');
      if (maxBtn) {
        maxBtn.textContent = `👥 정원: ${maxPlayers}명`;
      }
    } else {
      const hostPlayer = snapshot.players.find((m) => m.id === snapshot.hostId);
      const hostName = hostPlayer ? hostPlayer.name : '방장';
      const hintEl = $('guestWaitHint');
      if (hintEl) {
        hintEl.textContent = `⏳ 방장(👑 ${hostName})이 게임을 시작하기를 기다리는 중...`;
      }
      const readyBtn = $('guestReadyBtn');
      if (readyBtn && p) {
        readyBtn.textContent = p.ready ? '✅ 준비 완료됨 (터치하여 해제)' : '🙋 준비 완료하기 (READY)';
      }
    }
  }

  _updateHUD(p, snapshot) {
    if (!p) return;

    this._updateWaitingRoomUI(p, snapshot);

    if (p.boxRollSeq && p.boxRollSeq !== this.lastSeenBoxSeq) {
      this.lastSeenBoxSeq = p.boxRollSeq;
      this.rouletteAnimTime = 0;
    }

    const spec = resolveWeaponSpec(p.classId);
    const isMeHost = snapshot.hostId === this.localPlayerId || p.isHost;
    $('heroTitleText').textContent = `${isMeHost ? '👑 ' : ''}${spec.icon} ${p.name} · ${spec.name}`;
    const nickBtn = $('nicknameBtn');
    if (nickBtn) {
      nickBtn.textContent = `✏️ ${p.name}`;
    }
    const tierBadge = $('tierBadgeText');
    if (tierBadge) {
      tierBadge.textContent = spec.tier || 'RARE';
      tierBadge.style.color = spec.tierColor || '#ffd32a';
      tierBadge.style.borderColor = spec.tierColor || '#ffd32a';
    }

    const safeR = snapshot.safeRadius ?? WORLD_CONFIG.ARENA_RADIUS;
    const maxR = snapshot.arenaRadius || WORLD_CONFIG.ARENA_RADIUS;
    const ringPct = Math.max(0, Math.min(100, (safeR / maxR) * 100));
    $('baseFill').style.width = `${ringPct}%`;
    if (snapshot.safeDelayLeft && snapshot.safeDelayLeft > 0) {
      $('baseText').textContent = `${Math.round(safeR)}m (${snapshot.safeDelayLeft}s)`;
    } else {
      $('baseText').textContent = `${Math.round(safeR)}m`;
    }

    const hpPct = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));
    $('hpFill').style.width = `${hpPct}%`;
    $('hpText').textContent = p.alive ? `${Math.ceil(p.hp)} / ${p.maxHp}` : '💀 탈락';

    const ammoText = $('ammoText');
    const ammoFill = $('ammoFill');
    const reloadBtn = $('reloadBtn');

    $('ammoLabel').textContent = (p.ammoLabel || 'AMMO').slice(0, 4);
    $('reloadBtnName').textContent = p.reloadLabel || '재장전';
    if (reloadBtn) {
      reloadBtn.style.opacity = '1.0';
      reloadBtn.style.pointerEvents = 'auto';
    }

    if (p.isReloading) {
      const reloadPct = Math.min(100, (p.reloadTimer / (p.reloadDuration || 1.5)) * 100);
      ammoText.textContent = `${p.reloadLabel} ${Math.floor(reloadPct)}%`;
      ammoText.classList.add('reloading');
      ammoFill.style.width = `${reloadPct}%`;
      ammoFill.style.background = '#ffa502';
      ammoFill.classList.add('reloading');
      reloadBtn?.classList.add('reloading');
    } else {
      const curAmmo = Math.floor(p.ammo);
      ammoText.classList.remove('reloading');
      ammoFill.classList.remove('reloading');
      reloadBtn?.classList.remove('reloading');

      if (p.classId === 'archer' || p.classId === 'bow' || p.classId === 'crossbow') {
        ammoText.textContent = curAmmo > 0 ? '🏹 1 / 1 (장전됨)' : '🏹 장전 필요';
        ammoFill.style.width = curAmmo > 0 ? '100%' : '0%';
        ammoFill.style.background = '#7bed9f';
      } else if (p.classId === 'warrior' || p.classId === 'sword' || spec.isMelee) {
        ammoText.textContent = `⚔️ ${curAmmo} / ${p.maxAmmo}`;
        ammoFill.style.width = `${Math.min(100, (p.ammo / p.maxAmmo) * 100)}%`;
        ammoFill.style.background = '#ffa502';
      } else {
        ammoText.textContent = `🔮 ${curAmmo} / ${p.maxAmmo}`;
        ammoFill.style.width = `${Math.min(100, (p.ammo / p.maxAmmo) * 100)}%`;
        ammoFill.style.background = '#e056fd';
      }
    }

    // 2. 무기 전용 스킬 1·2 버튼 표시
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
    $('waveText').textContent =
      snapshot.roundState === 'waiting'
        ? '대기실'
        : `R${String(roundNum).padStart(2, '0')}`;
    $('aliveText').textContent = `${aliveCount}/${totalCount}`;
    $('killText').textContent = `${p.kills || 0}K·${p.wins || 0}W`;

    // 4. 생존자 로스터 (변경 시에만 DOM 업데이트하여 리플로우 렉 제거!)
    const rosterEl = $('squadRoster');
    if (rosterEl && snapshot.players) {
      const nextRosterHtml = snapshot.players
        .map((member) => {
          const mSpec = resolveWeaponSpec(member.classId);
          const isMe = member.id === this.localPlayerId;
          const isHost = member.id === snapshot.hostId || member.isHost;
          const deadClass = member.alive ? '' : 'dead';
          const statusStr = member.alive
            ? `HP ${Math.ceil(member.hp)}`
            : '💀 탈락';
          return `<div class="squad-member ${isMe ? 'me' : ''} ${deadClass}">
            <span>${isHost ? '👑 ' : ''}${mSpec.icon} ${member.name}${isMe ? ' (나)' : ''}</span>
            <span>${statusStr}</span>
          </div>`;
        })
        .join('');

      if (nextRosterHtml !== this._cachedRosterHtml) {
        this._cachedRosterHtml = nextRosterHtml;
        rosterEl.innerHTML = nextRosterHtml;
      }
    }

    // 5. 실시간 킬피드 배너 (변경 시에만 DOM 업데이트)
    const killFeedEl = $('killFeedBox');
    if (killFeedEl && snapshot.killFeed) {
      const nextKillHtml = snapshot.killFeed
        .slice(0, 2)
        .map((item) => `<div class="kill-item">⚔️ ${item.text}</div>`)
        .join('');
      if (nextKillHtml !== this._cachedKillFeedHtml) {
        this._cachedKillFeedHtml = nextKillHtml;
        killFeedEl.innerHTML = nextKillHtml;
      }
    }

    // 6. 라운드 시작 랜덤 무기 박스(Random Weapon Box) 모달 제어
    const boxOverlay = $('randomBoxOverlay');
    const isRoulettePhase =
      snapshot.roundState === 'roulette' ||
      (snapshot.roundState === 'combat' && this.localBoxModalTimer > 0);

    if (boxOverlay) {
      boxOverlay.classList.toggle('hidden', !isRoulettePhase);
      if (isRoulettePhase) {
        $('boxRoundBadge').textContent =
          totalCount === 2
            ? `ROUND ${String(roundNum).padStart(2, '0')} · 1 vs 1 판타지 결투`
            : `ROUND ${String(roundNum).padStart(2, '0')} · ${totalCount}인 결투`;

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
            const isMatch =
              wKey === spec.id ||
              (wKey === 'warrior' && (spec.id === 'sword' || spec.id === 'daggers' || spec.isMelee)) ||
              (wKey === 'archer' && (spec.id === 'bow' || spec.id === 'crossbow')) ||
              (wKey === 'mage' && (spec.id === 'staff' || spec.id === 'tome'));
            el.classList.toggle('selected', isMatch);
          }
        });

        if (isSpinning) {
          const tempSpec = resolveWeaponSpec(spinWeaponKey);
          $('drawnWeaponTitle').textContent = `🎲 직업 추첨 중... [${tempSpec.icon} ${tempSpec.name}]`;
          $('drawnWeaponDesc').textContent = `${tempSpec.role} · ${tempSpec.weaponName}`;
        } else {
          $('drawnWeaponTitle').textContent = `✨ 출전 직업: ${spec.icon} ${spec.name} [${spec.tier}]`;
          $('drawnWeaponDesc').textContent = `[Shift] ${spec.skill1.name}  |  [E] ${spec.skill2.name}`;
        }

        const remainSec =
          snapshot.roundState === 'roulette'
            ? Math.max(0, snapshot.stateTimer || 0)
            : this.localBoxModalTimer;
        $('drawnTimerText').textContent =
          snapshot.roundState === 'roulette'
            ? `원형 경기장 전투 개시까지 ${remainSec.toFixed(1)}초`
            : `직업 변경 완료! (${remainSec.toFixed(1)}s)`;
      }
    }

    // 7. 최후의 1인(WINNER) 우승자 발표 모달 제어
    const winOverlay = $('winnerOverlay');
    if (winOverlay) {
      const isRoundOver = snapshot.roundState === 'round_over' && snapshot.winner;
      winOverlay.classList.toggle('hidden', !isRoundOver);
      if (isRoundOver && snapshot.winner) {
        const w = snapshot.winner;
        $('winnerNameText').textContent = `${w.icon || '🏆'} ${w.name} 승리!`;
        $('winnerWeaponText').textContent = `출전 직업: ${w.className} · 이번 라운드 ${w.kills}킬 (누적 ${w.wins}승)`;
        $('winnerNextText').textContent = `${Math.max(0, snapshot.stateTimer || 0).toFixed(1)}초 후 대기실로 복귀합니다...`;
        const restartBtn = $('winnerRestartBtn');
        if (restartBtn) {
          restartBtn.classList.toggle('hidden', !isMeHost);
        }
      }
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new GameClient();
});
