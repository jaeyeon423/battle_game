// ============================================================================
// [Server] 원형 배틀로얄 (CIRCLE ROYALE) 실시간 멀티플레이 Node.js 게임 서버
// - 외부 패키지 의존성 0개 (Node.js 내장 http, crypto, fs만으로 HTTP + WebSocket 구동)
// - 방 생성(Create Room), 대기실(Waiting Room), 방장(Host) 권한 게임 시작, 30Hz 권위 서버 루프
// ============================================================================

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorldSimulation } from '../src/engine/WorldSimulation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const SERVER_TICK_HZ = 30; // 초당 30회 물리 시뮬레이션 및 스냅샷 브로드캐스트

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// ============================================================================
// 1. RFC 6455 경량 WebSocket 프레임 인코더 / 디코더
// ============================================================================

function encodeWsFrame(jsonString) {
  const payload = Buffer.from(jsonString, 'utf8');
  const len = payload.length;
  let header;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + Text frame
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, payload]);
}

function decodeWsFrames(buffer) {
  const messages = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const byte0 = buffer[offset];
    const byte1 = buffer[offset + 1];
    const opcode = byte0 & 0x0f;
    const isMasked = (byte1 & 0x80) !== 0;
    let payloadLen = byte1 & 0x7f;
    let headerLen = 2;

    if (payloadLen === 126) {
      if (offset + 4 > buffer.length) break;
      payloadLen = buffer.readUInt16BE(offset + 2);
      headerLen = 4;
    } else if (payloadLen === 127) {
      if (offset + 10 > buffer.length) break;
      payloadLen = Number(buffer.readBigUInt64BE(offset + 2));
      headerLen = 10;
    }

    const maskLen = isMasked ? 4 : 0;
    const totalFrameLen = headerLen + maskLen + payloadLen;
    if (offset + totalFrameLen > buffer.length) break;

    if (opcode === 0x8) {
      messages.push({ type: '__close__' });
      offset += totalFrameLen;
      break;
    }

    if (opcode === 0x1) {
      const payloadStart = offset + headerLen + maskLen;
      const raw = Buffer.alloc(payloadLen);
      if (isMasked) {
        const maskOffset = offset + headerLen;
        for (let i = 0; i < payloadLen; i++) {
          raw[i] = buffer[payloadStart + i] ^ buffer[maskOffset + (i & 3)];
        }
      } else {
        buffer.copy(raw, 0, payloadStart, payloadStart + payloadLen);
      }

      try {
        messages.push(JSON.parse(raw.toString('utf8')));
      } catch {}
    }

    offset += totalFrameLen;
  }

  return {
    messages,
    remaining: buffer.subarray(offset),
  };
}

// ============================================================================
// 2. 멀티플레이어 방(Room) 및 방장(Host) 관리 매니저
// ============================================================================

class GameRoom {
  constructor(roomId, options = {}) {
    this.roomId = roomId;
    this.roomName = String(options.roomName || `${roomId} 결투장`).slice(0, 24);
    this.maxPlayers = Math.max(2, Math.min(8, Number(options.maxPlayers) || 4));
    this.sim = new WorldSimulation(Date.now() & 0x7fffffff);
    this.sim.roomName = this.roomName;
    this.sim.maxPlayers = this.maxPlayers;
    this.sim.botFillMode = options.botFillMode || 'auto';
    this.sim.returnToWaitingAfterRound = true;
    this.sim.enterWaitingRoom();

    this.clients = new Map(); // Map<playerId, socket>
    this.lastStepTime = performance.now();
  }

  addClient(playerId, socket, playerName, preferredClass) {
    const cleanName = String(playerName || '').trim().slice(0, 14);
    const safeName =
      cleanName || `HERO-${String(this.clients.size + 1).padStart(2, '0')}`;

    this.clients.set(playerId, socket);
    const player = this.sim.addPlayer(playerId, preferredClass || '', safeName, false);
    return player;
  }

  removeClient(playerId) {
    this.clients.delete(playerId);
    this.sim.removePlayer(playerId);
    // 방에 남은 유저가 없고 게임 중이었다면 대기실 상태로 초기화
    if (this.clients.size === 0 && this.sim.roundState !== 'waiting') {
      this.sim.enterWaitingRoom();
    }
  }

  getHostName() {
    const hostId = this.sim.hostId;
    if (!hostId) return '대기중';
    const hostPlayer = this.sim.players.get(hostId);
    return hostPlayer ? hostPlayer.name : '대기중';
  }

  broadcastNow() {
    const snapshot = this.sim.getStateSnapshot();
    const packet = encodeWsFrame(
      JSON.stringify({
        type: 'state',
        roomId: this.roomId,
        roomName: this.roomName,
        hostId: this.sim.hostId,
        onlineCount: this.clients.size,
        maxPlayers: this.maxPlayers,
        snapshot,
      })
    );

    for (const [playerId, socket] of this.clients.entries()) {
      if (socket.destroyed || !socket.writable) {
        this.removeClient(playerId);
        continue;
      }
      try {
        socket.write(packet);
      } catch {
        this.removeClient(playerId);
      }
    }
  }

  stepAndBroadcast() {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.005, (now - this.lastStepTime) / 1000));
    this.lastStepTime = now;

    if (this.clients.size === 0) return;

    this.sim.step(dt);
    this.broadcastNow();
  }
}

const rooms = new Map();
const userAccounts = new Map(); // Map<usernameLower, { username, password, nickname, isAdmin }>
// 기본 운영자(Admin) 계정 사전 등록
userAccounts.set('kim423', {
  username: 'kim423',
  password: '1234',
  nickname: '재연킴',
  isAdmin: true,
});
let nextClientCounter = 1;
let nextRoomSeq = 101;

function sanitizeRoomId(roomId) {
  return (
    String(roomId || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '')
      .slice(0, 16) || 'ROYALE-01'
  );
}

function getOrCreateRoom(roomId = 'ROYALE-01', options = {}) {
  const cleanId = sanitizeRoomId(roomId);
  if (!rooms.has(cleanId)) {
    rooms.set(cleanId, new GameRoom(cleanId, options));
    console.log(`[Room Created] 방 생성됨: ${cleanId} (${options.roomName || '기본 결투장'})`);
  } else if (options.roomName) {
    const existing = rooms.get(cleanId);
    if (existing.clients.size === 0) {
      existing.roomName = String(options.roomName).slice(0, 24);
      existing.sim.roomName = existing.roomName;
      if (options.maxPlayers) {
        existing.maxPlayers = Math.max(2, Math.min(8, Number(options.maxPlayers) || 4));
        existing.sim.maxPlayers = existing.maxPlayers;
      }
      if (options.botFillMode) {
        existing.sim.botFillMode = options.botFillMode;
      }
    }
  }
  return rooms.get(cleanId);
}

function getRoomListSummary() {
  return Array.from(rooms.values()).map((r) => ({
    roomId: r.roomId,
    roomName: r.roomName,
    hostId: r.sim.hostId,
    hostName: r.getHostName(),
    onlineCount: r.clients.size,
    maxPlayers: r.maxPlayers,
    roundState: r.sim.roundState,
    botFillMode: r.sim.botFillMode,
    round: r.sim.round,
  }));
}

// 기본 오픈 방 생성
getOrCreateRoom('ROYALE-01', { roomName: '공식 1번 결투장', maxPlayers: 4 });

// 서버 메인 물리 루프 (30Hz)
setInterval(() => {
  for (const [roomId, room] of rooms.entries()) {
    room.stepAndBroadcast();
    // 기본 방이 아닌데 인원이 0명이면 정리
    if (roomId !== 'ROYALE-01' && room.clients.size === 0) {
      rooms.delete(roomId);
    }
  }
}, Math.round(1000 / SERVER_TICK_HZ));

// ============================================================================
// 3. HTTP 정적 파일 서빙 + WebSocket 업그레이드 서버
// ============================================================================

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // 클라우드 배포 환경 헬스체크 API
    if (url.pathname === '/health' || url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'ok', uptime: Math.round(process.uptime()) }));
      return;
    }

    // 활성 방 목록 조회 API
    if (url.pathname === '/api/rooms') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify({ status: 'ok', rooms: getRoomListSummary() }));
      return;
    }

    let relPath = url.pathname === '/' ? '/index.html' : url.pathname;
    const safePath = path.normalize(path.join(ROOT_DIR, relPath));
    if (!safePath.startsWith(ROOT_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const data = await fs.readFile(safePath);
    const ext = path.extname(safePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const acceptKey = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '\r\n',
    ].join('\r\n')
  );

  socket.setNoDelay(true);

  const playerId = `p_net_${nextClientCounter++}`;
  let currentRoom = null;
  let recvBuffer = Buffer.alloc(0);

  const sendJson = (obj) => {
    if (!socket.destroyed && socket.writable) {
      try {
        socket.write(encodeWsFrame(JSON.stringify(obj)));
      } catch {}
    }
  };

  const joinRoomInternal = (targetRoomId, msg, options = {}) => {
    if (currentRoom) {
      currentRoom.removeClient(playerId);
      currentRoom.broadcastNow();
    }
    currentRoom = getOrCreateRoom(targetRoomId, options);
    const player = currentRoom.addClient(
      playerId,
      socket,
      msg.name,
      msg.classId
    );

    sendJson({
      type: 'welcome',
      playerId,
      roomId: currentRoom.roomId,
      roomName: currentRoom.roomName,
      hostId: currentRoom.sim.hostId,
      classId: player.classId,
      playerName: player.name,
      onlineCount: currentRoom.clients.size,
      maxPlayers: currentRoom.maxPlayers,
      snapshot: currentRoom.sim.getStateSnapshot(),
      rooms: getRoomListSummary(),
    });

    currentRoom.broadcastNow();
    console.log(
      `[Join] ${player.name} (${player.classId}) -> Room [${currentRoom.roomId}] (방장: ${currentRoom.sim.hostId}, 인원: ${currentRoom.clients.size}/${currentRoom.maxPlayers}명)`
    );
  };

  socket.on('data', (chunk) => {
    recvBuffer = Buffer.concat([recvBuffer, chunk]);
    const { messages, remaining } = decodeWsFrames(recvBuffer);
    recvBuffer = remaining;

    for (const msg of messages) {
      if (msg.type === '__close__') {
        socket.end();
        return;
      }

      if (msg.type === 'auth_login' || msg.type === 'auth_signup') {
        const rawUser = String(msg.username || '').trim().slice(0, 16) || `user${nextClientCounter}`;
        const key = rawUser.toLowerCase();
        const rawPass = String(msg.password || '');
        const rawNick = String(msg.nickname || '').trim().slice(0, 12);

        let acc = userAccounts.get(key);
        if (acc && acc.password && msg.type === 'auth_login' && rawPass !== acc.password) {
          sendJson({
            type: 'auth_error',
            message: '비밀번호가 일치하지 않습니다.',
          });
          continue;
        }

        if (!acc) {
          acc = {
            username: rawUser,
            password: rawPass,
            nickname: rawNick || rawUser.slice(0, 12),
            isAdmin: false,
          };
          userAccounts.set(key, acc);
        } else if (msg.type === 'auth_signup' && rawNick) {
          acc.nickname = rawNick;
        }

        sendJson({
          type: 'auth_ok',
          playerId,
          username: acc.username,
          nickname: acc.nickname,
          isAdmin: Boolean(acc.isAdmin),
          rooms: getRoomListSummary(),
        });
      } else if (msg.type === 'leave_room') {
        if (currentRoom) {
          const prev = currentRoom;
          currentRoom = null;
          prev.removeClient(playerId);
          prev.broadcastNow();
        }
        sendJson({
          type: 'room_list',
          rooms: getRoomListSummary(),
        });
      } else if (msg.type === 'create_room') {
        // 새로운 방 코드 발급 또는 지정된 방 코드로 새 방 생성
        let newRoomId = msg.roomId ? sanitizeRoomId(msg.roomId) : `ROOM-${nextRoomSeq++}`;
        while (!msg.roomId && rooms.has(newRoomId)) {
          newRoomId = `ROOM-${nextRoomSeq++}`;
        }
        const defaultTitle = msg.name ? `${String(msg.name).slice(0, 10)}의 결투장` : `${newRoomId} 결투장`;
        joinRoomInternal(newRoomId, msg, {
          roomName: msg.roomName || defaultTitle,
          maxPlayers: msg.maxPlayers || 4,
          botFillMode: msg.botFillMode || 'auto',
        });
      } else if (msg.type === 'join') {
        joinRoomInternal(msg.roomId || 'ROYALE-01', msg, {
          roomName: msg.roomName,
          maxPlayers: msg.maxPlayers,
          botFillMode: msg.botFillMode,
        });
      } else if (msg.type === 'list_rooms') {
        sendJson({
          type: 'room_list',
          rooms: getRoomListSummary(),
        });
      } else if (msg.type === 'host_start_game' && currentRoom) {
        // 방장 권한 확인 후 게임 시작!
        const started = currentRoom.sim.hostStartGame(playerId);
        if (started) {
          console.log(`[Game Start] 방장(${playerId})이 Room [${currentRoom.roomId}] 게임을 시작했습니다!`);
          currentRoom.broadcastNow();
        } else {
          sendJson({
            type: 'error_msg',
            message: '방장만 게임을 시작할 수 있습니다.',
          });
        }
      } else if (msg.type === 'start_new_round' && currentRoom) {
        // 방장이거나 1인 연습 모드일 때 라운드 시작 허용
        if (currentRoom.sim.hostId === playerId || currentRoom.clients.size <= 1) {
          currentRoom.sim.startNewRound();
          currentRoom.broadcastNow();
        }
      } else if (msg.type === 'return_to_waiting' && currentRoom) {
        if (currentRoom.sim.hostId === playerId || currentRoom.clients.size <= 1) {
          currentRoom.sim.enterWaitingRoom();
          currentRoom.broadcastNow();
        }
      } else if (msg.type === 'toggle_ready' && currentRoom) {
        const p = currentRoom.sim.players.get(playerId);
        if (p && !p.isHost) {
          p.ready = !p.ready;
          currentRoom.broadcastNow();
        }
      } else if (msg.type === 'set_room_config' && currentRoom) {
        if (currentRoom.sim.hostId === playerId) {
          if (msg.botFillMode && ['auto', 'on', 'off'].includes(msg.botFillMode)) {
            currentRoom.sim.botFillMode = msg.botFillMode;
            currentRoom.sim._syncArenaBots();
            if (currentRoom.sim.roundState === 'waiting') {
              currentRoom.sim._positionAllFightersInCircle();
            }
          }
          if (msg.maxPlayers) {
            currentRoom.maxPlayers = Math.max(2, Math.min(8, Number(msg.maxPlayers) || 4));
            currentRoom.sim.maxPlayers = currentRoom.maxPlayers;
            currentRoom.sim._syncArenaBots();
          }
          if (msg.roomName) {
            currentRoom.roomName = String(msg.roomName).trim().slice(0, 24) || currentRoom.roomName;
            currentRoom.sim.roomName = currentRoom.roomName;
          }
          currentRoom.broadcastNow();
        }
      } else if (msg.type === 'set_name' && currentRoom && msg.name) {
        const updated = currentRoom.sim.setPlayerName(playerId, msg.name);
        if (updated) {
          currentRoom.broadcastNow();
        }
      } else if (msg.type === 'input' && currentRoom && msg.cmd) {
        currentRoom.sim.applyInput(playerId, msg.cmd);
      } else if (msg.type === 'switch_class' && currentRoom && msg.classId) {
        currentRoom.sim.switchPlayerClass(playerId, msg.classId);
        currentRoom.broadcastNow();
      } else if (msg.type === 'toggle_party' && currentRoom) {
        const on = currentRoom.sim.setPartyMode(
          !currentRoom.sim.partyEnabled,
          playerId
        );
        sendJson({ type: 'party_status', enabled: on });
      } else if (msg.type === 'toggle_swarm' && currentRoom) {
        currentRoom.sim.swarmEnabled = !currentRoom.sim.swarmEnabled;
      }
    }
  });

  const cleanup = () => {
    if (currentRoom) {
      const prevRoom = currentRoom;
      currentRoom = null;
      prevRoom.removeClient(playerId);
      prevRoom.broadcastNow();
      console.log(
        `[Leave] ${playerId} 퇴장 -> Room [${prevRoom.roomId}] (남은 인원: ${prevRoom.clients.size}명, 새 방장: ${prevRoom.sim.hostId || '없음'})`
      );
    }
  };

  socket.on('close', cleanup);
  socket.on('error', cleanup);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================================`);
  console.log(`⚔️ CIRCLE ROYALE 멀티플레이 게임 서버 가동 완료!`);
  console.log(`🌐 웹 클라이언트 접속: http://localhost:${PORT}`);
  console.log(`🔌 실시간 WebSocket: ws://localhost:${PORT}/ws (${SERVER_TICK_HZ}Hz Tick)`);
  console.log(`====================================================================`);
});
