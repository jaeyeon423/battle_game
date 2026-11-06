// ============================================================================
// [Transport] 원형 배틀로얄 실시간 온라인 멀티플레이 WebSocket 통신 어댑터
// - 해외 리전(US East 등) 핑 지연 대응: 내 캐릭터 클라이언트 이동 예측(Client-Side Prediction)
// - 투사체(bullets) 60FPS 프레임간 보간(Interpolation)으로 끊김 없는 부드러운 렌더링
// ============================================================================

import { WorldSimulation } from '../engine/WorldSimulation.js';
import { WORLD_CONFIG, resolveWeaponSpec } from '../shared/constants.js';
import { lerp } from '../shared/math.js';

export class WebSocketTransport {
  constructor() {
    this.fallbackSim = new WorldSimulation();
    this.fallbackSim.returnToWaitingAfterRound = true;
    this.fallbackSim.enterWaitingRoom();

    this.localPlayerId = 'p_local_1';
    this.roomId = 'ROYALE-01';
    this.roomName = '공식 1번 결투장';
    this.hostId = 'p_local_1';
    this.onlineCount = 1;
    this.maxPlayers = 4;
    this.isOnline = false;

    this.ws = null;
    this.stateCallback = null;
    this.statusCallback = null;
    this.roomListCallback = null;
    this.authCallback = null;
    this.authErrorCallback = null;
    this.autoJoinOnOpen = false;

    this.serverSnapshot = null;
    this.displaySnapshot = null;
    this.lastSendTime = 0;
    this.latestInputCmd = { moveX: 0, moveY: 0, aimAngle: 0, isFiring: false };

    // 실시간 핑(Ping / RTT) 측정
    this.currentPing = 0;
    this.pingTimer = 0;
  }

  connect(playerName = '', classId = '', roomId = 'ROYALE-01', autoJoin = false) {
    this.roomId = roomId || '';
    this.playerName = playerName || 'HERO-01';
    this.preferredClass = classId;
    this.autoJoinOnOpen = Boolean(autoJoin);

    this.fallbackSim.addPlayer(
      this.localPlayerId,
      classId || '',
      this.playerName
    );
    this.fallbackSim.enterWaitingRoom();
    this.displaySnapshot = this.fallbackSim.getStateSnapshot();

    this._connectWebSocket();
    return this.localPlayerId;
  }

  _connectWebSocket() {
    if (typeof window === 'undefined' || !window.location.host) return;
    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.addEventListener('open', () => {
        if (this.autoJoinOnOpen && this.roomId) {
          ws.send(
            JSON.stringify({
              type: 'join',
              roomId: this.roomId,
              name: this.playerName,
              classId: this.preferredClass,
            })
          );
        } else {
          ws.send(JSON.stringify({ type: 'list_rooms' }));
        }
      });

      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'welcome') {
            this.isOnline = true;
            this.localPlayerId = msg.playerId;
            this.roomId = msg.roomId;
            this.roomName = msg.roomName || msg.roomId;
            this.hostId = msg.hostId || msg.snapshot?.hostId;
            this.onlineCount = msg.onlineCount || 1;
            this.maxPlayers = msg.maxPlayers || msg.snapshot?.maxPlayers || 4;
            if (msg.playerName) this.playerName = msg.playerName;
            this.serverSnapshot = msg.snapshot;
            this.displaySnapshot = msg.snapshot;

            if (Array.isArray(msg.rooms)) {
              this.roomListCallback?.(msg.rooms);
            }

            this.statusCallback?.({
              isOnline: true,
              roomId: this.roomId,
              roomName: this.roomName,
              hostId: this.hostId,
              onlineCount: this.onlineCount,
              maxPlayers: this.maxPlayers,
              localPlayerId: this.localPlayerId,
              playerName: this.playerName,
              classId: msg.classId,
              isWelcome: true,
            });
            if (this.stateCallback) {
              this.stateCallback(this.displaySnapshot);
            }
          } else if (msg.type === 'state') {
            this.isOnline = true;
            this.roomId = msg.roomId || this.roomId;
            this.roomName = msg.roomName || msg.snapshot?.roomName || this.roomName;
            this.hostId = msg.hostId || msg.snapshot?.hostId || this.hostId;
            this.onlineCount = msg.onlineCount || 1;
            this.maxPlayers = msg.maxPlayers || msg.snapshot?.maxPlayers || this.maxPlayers;
            this._applyServerSnapshot(msg.snapshot);
            this.statusCallback?.({
              isOnline: true,
              roomId: this.roomId,
              roomName: this.roomName,
              hostId: this.hostId,
              onlineCount: this.onlineCount,
              maxPlayers: this.maxPlayers,
              localPlayerId: this.localPlayerId,
            });
          } else if (msg.type === 'pong') {
            const rtt = Math.round(performance.now() - msg.t);
            this.currentPing = Math.max(1, rtt);
            this.statusCallback?.({
              isOnline: true,
              ping: this.currentPing,
            });
          } else if (msg.type === 'room_list' && Array.isArray(msg.rooms)) {
            this.roomListCallback?.(msg.rooms);
          } else if (msg.type === 'auth_ok') {
            this.isOnline = true;
            if (msg.playerId) this.localPlayerId = msg.playerId;
            if (msg.nickname) this.playerName = msg.nickname;
            if (Array.isArray(msg.rooms)) {
              this.roomListCallback?.(msg.rooms);
            }
            this.authCallback?.(msg);
          } else if (msg.type === 'auth_error') {
            this.authErrorCallback?.(msg.message || '로그인 실패');
          }
        } catch {}
      });

      ws.addEventListener('close', () => {
        this.isOnline = false;
        this.statusCallback?.({
          isOnline: false,
          roomId: 'OFFLINE',
          roomName: '오프라인 연습장',
          hostId: this.localPlayerId,
          onlineCount: 1,
          maxPlayers: 4,
          localPlayerId: this.localPlayerId,
        });
      });
    } catch {
      this.isOnline = false;
    }
  }

  _applyServerSnapshot(incoming) {
    if (!this.displaySnapshot) {
      this.displaySnapshot = incoming;
    } else {
      const prevPlayers = new Map(
        this.displaySnapshot.players.map((p) => [p.id, p])
      );

      for (const p of incoming.players) {
        const old = prevPlayers.get(p.id);
        if (old) {
          const oldRx = typeof old._renderX === 'number' ? old._renderX : old.x;
          const oldRy = typeof old._renderY === 'number' ? old._renderY : old.y;
          const dist = Math.hypot(p.x - oldRx, p.y - oldRy);
          // 순간이동(점멸/도약/라운드 스폰)이 아닌 일반 이동 범위 내에서는 이전 렌더링 위치를 보존하여 부드럽게 보간
          if (dist < 160) {
            p._renderX = oldRx;
            p._renderY = oldRy;
          } else {
            p._renderX = p.x;
            p._renderY = p.y;
          }
          if (p.id === this.localPlayerId && this.latestInputCmd) {
            p.aimAngle = this.latestInputCmd.aimAngle;
          }
        } else {
          p._renderX = p.x;
          p._renderY = p.y;
        }
      }

      this.serverSnapshot = incoming;
      this.displaySnapshot = incoming;
    }

    if (this.stateCallback) {
      this.stateCallback(this.displaySnapshot);
    }
  }

  onAuthSuccess(cb) {
    this.authCallback = cb;
  }

  onAuthError(cb) {
    this.authErrorCallback = cb;
  }

  authenticate({ mode = 'login', username = '', password = '', nickname = '' } = {}) {
    const cleanUser = String(username || '').trim().slice(0, 16) || 'hero01';
    const cleanNick = mode === 'signup' ? String(nickname || '').trim().slice(0, 12) : '';
    if (cleanNick) this.playerName = cleanNick;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: mode === 'signup' ? 'auth_signup' : 'auth_login',
          username: cleanUser,
          password,
          nickname: cleanNick,
        })
      );
    } else {
      this.authCallback?.({
        username: cleanUser,
        nickname: cleanNick,
        rooms: [],
      });
    }
  }

  leaveRoom() {
    this.roomId = '';
    if (this.isOnline && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'leave_room' }));
    }
  }

  createRoom({ roomId = '', roomName = '', maxPlayers = 4, botFillMode = 'auto', playerName = '', classId = '' } = {}) {
    if (playerName) this.playerName = playerName;
    if (classId !== undefined) this.preferredClass = classId;

    if (this.isOnline && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'create_room',
          roomId,
          roomName,
          maxPlayers,
          botFillMode,
          name: this.playerName,
          classId: this.preferredClass,
        })
      );
    } else {
      this.roomId = roomId || 'LOCAL-01';
      this.roomName = roomName || '로컬 결투장';
      this.fallbackSim.roomName = this.roomName;
      this.fallbackSim.maxPlayers = maxPlayers;
      this.fallbackSim.botFillMode = botFillMode;
      this.fallbackSim.enterWaitingRoom();
    }
  }

  joinRoom(roomId, playerName = '', classId = '') {
    this.roomId = roomId || 'ROYALE-01';
    if (playerName) this.playerName = playerName;
    if (classId !== undefined && classId !== '') this.preferredClass = classId;

    if (this.isOnline && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'join',
          roomId: this.roomId,
          name: this.playerName,
          classId: this.preferredClass,
        })
      );
    } else {
      this.fallbackSim.enterWaitingRoom();
    }
  }

  requestRoomList() {
    if (this.isOnline && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'list_rooms' }));
    }
    if (typeof window !== 'undefined' && window.fetch) {
      fetch('/api/rooms')
        .then((r) => r.json())
        .then((data) => {
          if (data && Array.isArray(data.rooms)) {
            this.roomListCallback?.(data.rooms);
          }
        })
        .catch(() => {});
    }
  }

  hostStartGame() {
    if (this.isOnline && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'host_start_game' }));
    } else {
      this.fallbackSim.hostStartGame(this.localPlayerId);
    }
  }

  returnToWaiting() {
    if (this.isOnline && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'return_to_waiting' }));
    } else {
      this.fallbackSim.enterWaitingRoom();
    }
  }

  toggleReady() {
    if (this.isOnline && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'toggle_ready' }));
    } else {
      const p = this.fallbackSim.players.get(this.localPlayerId);
      if (p) p.ready = !p.ready;
    }
  }

  setRoomConfig(config = {}) {
    if (this.isOnline && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'set_room_config',
          ...config,
        })
      );
    } else {
      if (config.botFillMode) {
        this.fallbackSim.botFillMode = config.botFillMode;
        this.fallbackSim._syncArenaBots();
      }
      if (config.maxPlayers) {
        this.fallbackSim.maxPlayers = config.maxPlayers;
      }
    }
  }

  setPlayerName(newName) {
    const clean = String(newName || '').trim().slice(0, 14);
    if (!clean) return;
    this.playerName = clean;
    if (this.isOnline && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'set_name', name: clean }));
    } else {
      const p = this.fallbackSim.players.get(this.localPlayerId);
      if (p) p.name = clean;
    }
  }

  switchClass(newClassId) {
    this.preferredClass = newClassId === 'random' ? '' : newClassId;
    if (this.isOnline && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'switch_class', classId: newClassId }));
    } else {
      this.fallbackSim.switchPlayerClass(this.localPlayerId, newClassId);
    }
  }

  rollRandomBox() {
    this.switchClass('random');
  }

  startNewRound() {
    if (this.isOnline && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'start_new_round' }));
    } else {
      this.fallbackSim.startNewRound();
    }
  }

  sendInput(inputCmd) {
    this.latestInputCmd = inputCmd;
    if (this.isOnline && this.ws && this.ws.readyState === WebSocket.OPEN) {
      const now = performance.now();
      const hasTrigger =
        inputCmd.firePressed ||
        inputCmd.reloadPressed ||
        inputCmd.skill1Pressed ||
        inputCmd.skill2Pressed;
      if (hasTrigger || now - this.lastSendTime >= 30) {
        this.lastSendTime = now;
        this.ws.send(JSON.stringify({ type: 'input', cmd: inputCmd }));
      }
    } else {
      this.fallbackSim.applyInput(this.localPlayerId, inputCmd);
    }
  }

  onStateUpdate(callback) {
    this.stateCallback = callback;
  }

  onStatusUpdate(callback) {
    this.statusCallback = callback;
  }

  onRoomListUpdate(callback) {
    this.roomListCallback = callback;
  }

  tick(dt) {
    if (this.isOnline && this.displaySnapshot) {
      // 2초마다 경량 핑(Ping-Pong) 전송하여 지연시간 정밀 측정
      this.pingTimer += dt;
      if (this.pingTimer >= 2.0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.pingTimer = 0;
        try {
          this.ws.send(JSON.stringify({ type: 'ping', t: performance.now() }));
        } catch {}
      }

      const canMove =
        this.displaySnapshot.roundState === 'combat' ||
        this.displaySnapshot.roundState === 'waiting';

      for (const p of this.displaySnapshot.players) {
        if (typeof p._renderX !== 'number') p._renderX = p.x;
        if (typeof p._renderY !== 'number') p._renderY = p.y;

        if (p.id === this.localPlayerId && p.alive && canMove) {
          // [핵심 1] 내 캐릭터 클라이언트 즉시 이동 예측 (0ms 지연)
          const spec = resolveWeaponSpec(p.classId);
          const cmd = this.latestInputCmd || { moveX: 0, moveY: 0, aimAngle: p.aimAngle };
          p.aimAngle = cmd.aimAngle;

          let mx = cmd.moveX || 0;
          let my = cmd.moveY || 0;
          const len = Math.hypot(mx, my);
          if (len > 1) {
            mx /= len;
            my /= len;
          }
          const spd = (p.speed || spec.speed || 230) * (p.slowTimer > 0 ? 0.6 : 1.0);
          p._renderX += mx * spd * dt;
          p._renderY += my * spd * dt;

          // 경기장 경계 클램핑
          const cx = WORLD_CONFIG.CENTER_X;
          const cy = WORLD_CONFIG.CENTER_Y;
          const maxR = WORLD_CONFIG.ARENA_RADIUS - 18;
          const distFromCenter = Math.hypot(p._renderX - cx, p._renderY - cy);
          if (distFromCenter > maxR) {
            const ang = Math.atan2(p._renderY - cy, p._renderX - cx);
            p._renderX = cx + Math.cos(ang) * maxR;
            p._renderY = cy + Math.sin(ang) * maxR;
          }

          // 장애물 클라이언트 즉시 슬라이딩 충돌 처리 (벽에 닿아도 튕김 방지)
          if (this.displaySnapshot.obstacles) {
            for (let i = 0; i < this.displaySnapshot.obstacles.length; i++) {
              const obs = this.displaySnapshot.obstacles[i];
              if (!obs.blocksMovement || obs.hp <= 0) continue;
              const odx = p._renderX - obs.x;
              const ody = p._renderY - obs.y;
              const minDist = (p.radius || 15) + obs.radius;
              const d2 = odx * odx + ody * ody;
              if (d2 < minDist * minDist && d2 > 0.0001) {
                const d = Math.sqrt(d2);
                const push = minDist - d;
                p._renderX += (odx / d) * push;
                p._renderY += (ody / d) * push;
              }
            }
          }

          // 서버 권위 위치(p.x, p.y)와의 오차 부드러운 수렴 (Soft Reconciliation)
          const errDist = Math.hypot(p._renderX - p.x, p._renderY - p.y);
          if (errDist > 140) {
            // 점멸/순간이동/라운드 시작 리셋 시 즉각 스냅
            p._renderX = p.x;
            p._renderY = p.y;
          } else if (errDist > 0.5) {
            // 미세 오차는 눈에 안 띄게 부드럽게 지수 보정하여 떨림 방지
            const reconcile = Math.min(1, dt * 8.0);
            p._renderX = lerp(p._renderX, p.x, reconcile);
            p._renderY = lerp(p._renderY, p.y, reconcile);
          }
        } else if (p.alive) {
          // [핵심 2] 타 플레이어 및 AI 봇: 60FPS 데드 레커닝 (Dead Reckoning) & 스무스 보간
          // 패킷 간격 사이에서도 이전 속도(vx, vy)로 부드럽게 예측 전진
          if (Math.hypot(p.vx || 0, p.vy || 0) > 1) {
            p._renderX += (p.vx || 0) * dt;
            p._renderY += (p.vy || 0) * dt;
          }
          const factor = Math.min(1, dt * 14);
          p._renderX = lerp(p._renderX, p.x, factor);
          p._renderY = lerp(p._renderY, p.y, factor);
        }
      }

      // 투사체(화살/마법탄)도 60fps로 매끄럽게 전진 렌더링
      if (this.displaySnapshot.bullets) {
        for (let i = 0; i < this.displaySnapshot.bullets.length; i++) {
          const b = this.displaySnapshot.bullets[i];
          if (typeof b.vx === 'number' && typeof b.vy === 'number') {
            b.x += b.vx * dt;
            b.y += b.vy * dt;
          }
        }
      }
      return;
    }

    this.fallbackSim.step(dt);
    this.displaySnapshot = this.fallbackSim.getStateSnapshot();
    if (this.stateCallback) {
      this.stateCallback(this.displaySnapshot);
    }
  }
}
