// ============================================================================
// [Transport] 원형 배틀로얄 실시간 온라인 멀티플레이 WebSocket 통신 어댑터
// ============================================================================

import { WorldSimulation } from '../engine/WorldSimulation.js';
import { lerp } from '../shared/math.js';

export class WebSocketTransport {
  constructor() {
    this.fallbackSim = new WorldSimulation();
    this.localPlayerId = 'p_local_1';
    this.roomId = 'ROYALE-01';
    this.onlineCount = 1;
    this.isOnline = false;

    this.ws = null;
    this.stateCallback = null;
    this.statusCallback = null;

    this.serverSnapshot = null;
    this.displaySnapshot = null;
    this.lastSendTime = 0;
  }

  connect(playerName = '', classId = '', roomId = 'ROYALE-01') {
    this.roomId = roomId || 'ROYALE-01';
    this.playerName = playerName;
    this.preferredClass = classId; // 빈 문자열이면 서버/엔진이 랜덤박스에서 무작위 추첨!

    this.fallbackSim.addPlayer(
      this.localPlayerId,
      classId || '',
      playerName || 'SOLDIER-01'
    );
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
        ws.send(
          JSON.stringify({
            type: 'join',
            roomId: this.roomId,
            name: this.playerName,
            classId: this.preferredClass,
          })
        );
      });

      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'welcome') {
            this.isOnline = true;
            this.localPlayerId = msg.playerId;
            this.roomId = msg.roomId;
            this.onlineCount = msg.onlineCount || 1;
            this.serverSnapshot = msg.snapshot;
            this.displaySnapshot = structuredClone(msg.snapshot);
            this.statusCallback?.({
              isOnline: true,
              roomId: this.roomId,
              onlineCount: this.onlineCount,
              localPlayerId: this.localPlayerId,
              classId: msg.classId,
              isWelcome: true,
            });
            if (this.stateCallback) {
              this.stateCallback(this.displaySnapshot);
            }
          } else if (msg.type === 'state') {
            this.isOnline = true;
            this.roomId = msg.roomId || this.roomId;
            this.onlineCount = msg.onlineCount || 1;
            this._applyServerSnapshot(msg.snapshot);
            this.statusCallback?.({
              isOnline: true,
              roomId: this.roomId,
              onlineCount: this.onlineCount,
              localPlayerId: this.localPlayerId,
            });
          }
        } catch {}
      });

      ws.addEventListener('close', () => {
        this.isOnline = false;
        this.statusCallback?.({
          isOnline: false,
          roomId: 'OFFLINE',
          onlineCount: 1,
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
        if (old && Math.hypot(p.x - old.x, p.y - old.y) < 120) {
          p._renderX = old.x;
          p._renderY = old.y;
        }
      }

      this.serverSnapshot = incoming;
      this.displaySnapshot = incoming;
    }

    if (this.stateCallback) {
      this.stateCallback(this.displaySnapshot);
    }
  }

  joinRoom(roomId, playerName = '', classId = '') {
    this.roomId = roomId || 'ROYALE-01';
    if (playerName) this.playerName = playerName;
    if (classId) this.preferredClass = classId;

    if (this.isOnline && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'join',
          roomId: this.roomId,
          name: this.playerName,
          classId: this.preferredClass,
        })
      );
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
    if (this.isOnline && this.ws && this.ws.readyState === WebSocket.OPEN) {
      const now = performance.now();
      const hasTrigger =
        inputCmd.reloadPressed ||
        inputCmd.skill1Pressed ||
        inputCmd.skill2Pressed;
      if (hasTrigger || now - this.lastSendTime >= 22) {
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

  tick(dt) {
    if (this.isOnline && this.displaySnapshot) {
      const factor = Math.min(1, dt * 18);
      for (const p of this.displaySnapshot.players) {
        if (typeof p._renderX === 'number') {
          p._renderX = lerp(p._renderX, p.x, factor);
          p._renderY = lerp(p._renderY, p.y, factor);
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
