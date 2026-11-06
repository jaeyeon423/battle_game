// ============================================================================
// [Server] 판타지 성 방어전 (CASTLE DEFENSE) 실시간 멀티플레이 Node.js 게임 서버
// - 외부 패키지 의존성 0개 (Node.js 내장 http, crypto, fs만으로 HTTP + WebSocket 구동)
// - 다중 방(Room) 생성/입장, 3대 직업(전사·궁수·마법사) 파티 동기화, 30Hz 권위 서버 루프
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
// 2. 멀티플레이어 방(Room) 및 월드 시뮬레이션 매니저
// ============================================================================

class GameRoom {
  constructor(roomId) {
    this.roomId = roomId;
    this.sim = new WorldSimulation(20261104);
    this.clients = new Map(); // Map<playerId, socket>
    this.lastStepTime = performance.now();
  }

  addClient(playerId, socket, playerName, preferredClass) {
    const safeName =
      playerName || `SOLDIER-${String(this.clients.size + 1).padStart(2, '0')}`;

    this.clients.set(playerId, socket);
    // preferredClass가 없으면 WorldSimulation.addPlayer 내부에서 랜덤박스 무기를 무작위로 추첨합니다!
    const player = this.sim.addPlayer(playerId, preferredClass || '', safeName, false);
    return player;
  }

  removeClient(playerId) {
    this.clients.delete(playerId);
    this.sim.removePlayer(playerId);
  }

  stepAndBroadcast() {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.005, (now - this.lastStepTime) / 1000));
    this.lastStepTime = now;

    if (this.clients.size === 0) return;

    this.sim.step(dt);
    const snapshot = this.sim.getStateSnapshot();

    const packet = encodeWsFrame(
      JSON.stringify({
        type: 'state',
        roomId: this.roomId,
        onlineCount: this.clients.size,
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
}

const rooms = new Map();
let nextClientCounter = 1;

function getOrCreateRoom(roomId = 'ALPHA-01') {
  const cleanId = String(roomId).trim().toUpperCase().slice(0, 16) || 'ALPHA-01';
  if (!rooms.has(cleanId)) {
    rooms.set(cleanId, new GameRoom(cleanId));
    console.log(`[Room Created] 작전방 생성됨: ${cleanId}`);
  }
  return rooms.get(cleanId);
}

// 기본 오픈 방 생성
getOrCreateRoom('ALPHA-01');

// 서버 메인 물리 루프 (30Hz)
setInterval(() => {
  for (const [roomId, room] of rooms.entries()) {
    room.stepAndBroadcast();
    // 기본 방이 아닌데 인원이 0명이면 정리
    if (roomId !== 'ALPHA-01' && room.clients.size === 0) {
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

    // 활성 방 목록 조회 API
    if (url.pathname === '/api/rooms') {
      const roomList = Array.from(rooms.values()).map((r) => ({
        roomId: r.roomId,
        onlineCount: r.clients.size,
        wave: r.sim.wave,
        baseHp: r.sim.baseHp,
      }));
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify({ status: 'ok', rooms: roomList }));
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

  socket.on('data', (chunk) => {
    recvBuffer = Buffer.concat([recvBuffer, chunk]);
    const { messages, remaining } = decodeWsFrames(recvBuffer);
    recvBuffer = remaining;

    for (const msg of messages) {
      if (msg.type === '__close__') {
        socket.end();
        return;
      }

      if (msg.type === 'join') {
        if (currentRoom) {
          currentRoom.removeClient(playerId);
        }
        currentRoom = getOrCreateRoom(msg.roomId || 'CASTLE-01');
        const player = currentRoom.addClient(
          playerId,
          socket,
          msg.name,
          msg.classId
        );

        socket.write(
          encodeWsFrame(
            JSON.stringify({
              type: 'welcome',
              playerId,
              roomId: currentRoom.roomId,
              classId: player.classId,
              playerName: player.name,
              onlineCount: currentRoom.clients.size,
              snapshot: currentRoom.sim.getStateSnapshot(),
            })
          )
        );
        console.log(
          `[Join] ${player.name} (${player.classId}) -> Room [${currentRoom.roomId}] (접속자: ${currentRoom.clients.size}명)`
        );
      } else if (msg.type === 'input' && currentRoom && msg.cmd) {
        currentRoom.sim.applyInput(playerId, msg.cmd);
      } else if (msg.type === 'switch_class' && currentRoom && msg.classId) {
        currentRoom.sim.switchPlayerClass(playerId, msg.classId);
      } else if (msg.type === 'start_new_round' && currentRoom) {
        currentRoom.sim.startNewRound();
      } else if (msg.type === 'toggle_party' && currentRoom) {
        const on = currentRoom.sim.setPartyMode(
          !currentRoom.sim.partyEnabled,
          playerId
        );
        socket.write(
          encodeWsFrame(JSON.stringify({ type: 'party_status', enabled: on }))
        );
      } else if (msg.type === 'toggle_swarm' && currentRoom) {
        currentRoom.sim.swarmEnabled = !currentRoom.sim.swarmEnabled;
      }
    }
  });

  const cleanup = () => {
    if (currentRoom) {
      currentRoom.removeClient(playerId);
      console.log(
        `[Leave] ${playerId} 퇴장 -> Room [${currentRoom.roomId}] (남은 인원: ${currentRoom.clients.size}명)`
      );
      currentRoom = null;
    }
  };

  socket.on('close', cleanup);
  socket.on('error', cleanup);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================================`);
  console.log(`🏰 CASTLE DEFENSE 멀티플레이 게임 서버 가동 완료!`);
  console.log(`🌐 웹 클라이언트 접속: http://localhost:${PORT}`);
  console.log(`🔌 실시간 WebSocket: ws://localhost:${PORT}/ws (${SERVER_TICK_HZ}Hz Tick)`);
  console.log(`====================================================================`);
});
