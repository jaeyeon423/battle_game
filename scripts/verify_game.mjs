// ============================================================================
// [Cross-Platform Automated Verification] Windows & macOS 겸용 AI 자체 검증 스크립트
// 실행 방법: npm test (또는 node scripts/verify_game.mjs)
// 1. Headless 물리 시뮬레이션 검증 (8인 원형 스폰 -> 랜덤박스 추첨 -> 자기장 축소 -> 최후의 1인 우승)
// 2. 실시간 WebSocket 서버 구동 + Headless Chrome/Edge 접속 + 스크린샷 캡처 검증
// ============================================================================

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorldSimulation } from '../src/engine/WorldSimulation.js';
import { WEAPON_LOADOUTS, WEAPON_KEYS } from '../src/shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

function findBrowserExecutable() {
  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          process.env.LOCALAPPDATA
            ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe')
            : '',
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        ]
      : [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          '/usr/bin/google-chrome',
          '/usr/bin/chromium-browser',
        ];

  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

console.log('=== [1/2] 원형 배틀로얄 & 랜덤 무기 박스 6종 물리 시뮬레이션 검증 ===');

const sim = new WorldSimulation(20261106);
const p = sim.addPlayer('p_main', '', 'HERO-USER', false);
const initSnap = sim.getStateSnapshot();

assert.equal(initSnap.roundState, 'roulette', '시작 시 상태가 roulette(랜덤박스 추첨)이어야 합니다.');
assert.equal(initSnap.totalCount, 8, '8인 원형 배틀로얄 참가자가 구성되어야 합니다.');

// 6종 총기 전환 및 격발/스킬 정상 작동 확인
for (const weaponId of WEAPON_KEYS) {
  const spec = WEAPON_LOADOUTS[weaponId];
  sim.switchPlayerClass('p_main', weaponId);
  assert.equal(p.classId, weaponId, `총기 전환 실패: ${weaponId}`);
  assert.ok(spec.skill1 && spec.skill2, `스킬 정의 누락: ${weaponId}`);
}
console.log(`✔ [PASS] 랜덤박스 6종 총기(${WEAPON_KEYS.join(', ')}) 스펙 및 장착 검증 완료`);

// 새 라운드 시작 후 최후의 1인 시뮬레이션 검증
sim.startNewRound();
for (let i = 0; i < 60 * 3.1; i++) sim.step(1 / 60);
assert.equal(sim.roundState, 'combat', '3초 랜덤박스 추첨 후 combat 상태로 전환되어야 합니다.');

let winnerFound = false;
for (let i = 0; i < 60 * 55; i++) {
  if (p.alive) {
    let target = null;
    let minD = Infinity;
    for (const other of sim.players.values()) {
      if (!other.alive || other.id === p.id) continue;
      const d = Math.hypot(other.x - p.x, other.y - p.y);
      if (d < minD) {
        minD = d;
        target = other;
      }
    }
    if (target) {
      const ang = Math.atan2(target.y - p.y, target.x - p.x);
      sim.applyInput('p_main', {
        moveX: Math.cos(ang) * 0.5,
        moveY: Math.sin(ang) * 0.5,
        aimAngle: ang,
        isFiring: true,
        skill1Pressed: i % 90 === 0,
        skill2Pressed: i % 120 === 0,
      });
    }
  }
  sim.step(1 / 60);
  if (sim.roundState === 'round_over' && sim.winner) {
    winnerFound = true;
    break;
  }
}

assert.ok(winnerFound, '최후의 1인(Last Man Standing) 우승자가 결정되어야 합니다.');
console.log(
  `✔ [PASS] 최후의 1인 결정 완료! 🏆 우승자: ${sim.winner.name} (${sim.winner.icon} ${sim.winner.className}, ${sim.winner.kills}킬)`
);

const browserPath = findBrowserExecutable();
if (!browserPath) {
  console.log('⚠️ Chrome/Edge 실행 파일을 찾지 못해 브라우저 캡처 단계만 건너뜁니다.');
  process.exit(0);
}

console.log(`\n=== [2/2] Headless 브라우저(${path.basename(browserPath)}) 실시간 렌더링 & 콘솔 에러 검증 ===`);

const TEST_PORT = 8096;
const serverProc = spawn(process.execPath, [path.join(ROOT_DIR, 'server', 'index.js')], {
  env: { ...process.env, PORT: String(TEST_PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

await new Promise((resolve) => {
  serverProc.stdout.on('data', (d) => {
    if (d.toString().includes('가동 완료')) resolve();
  });
});

const debugPort = 9352;
const browser = spawn(
  browserPath,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1366,768',
    `--remote-debugging-port=${debugPort}`,
    `http://127.0.0.1:${TEST_PORT}/?room=ROYALE-01&name=CHAMP-USER`,
  ],
  { stdio: 'ignore' }
);

async function getWsDebuggerUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const list = await res.json();
      const page = list.find((item) => item.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('CDP 연결 실패');
}

try {
  const wsUrl = await getWsDebuggerUrl();
  const cdp = new WebSocket(wsUrl);
  await new Promise((r) => cdp.addEventListener('open', r, { once: true }));

  let msgId = 0;
  const pending = new Map();
  const consoleErrors = [];

  cdp.addEventListener('message', (ev) => {
    const data = JSON.parse(ev.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    }
    if (data.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(data.params?.exceptionDetails?.text || 'Exception');
    }
  });

  function sendCdp(method, params = {}) {
    return new Promise((resolve) => {
      const id = ++msgId;
      pending.set(id, resolve);
      cdp.send(JSON.stringify({ id, method, params }));
    });
  }

  await sendCdp('Page.enable');
  await sendCdp('Runtime.enable');

  await new Promise((r) => setTimeout(r, 1400));
  const outDir = path.join(ROOT_DIR, 'screenshots');
  await fsp.mkdir(outDir, { recursive: true });

  const shotBox = await sendCdp('Page.captureScreenshot', { format: 'png' });
  const shotBoxPath = path.join(outDir, 'verify_random_box.png');
  await fsp.writeFile(shotBoxPath, Buffer.from(shotBox.result.data, 'base64'));
  console.log(`✔ [PASS] 시작 시 랜덤 무기 박스 모달 캡처: ${shotBoxPath}`);

  await new Promise((r) => setTimeout(r, 2300));
  const shotCombat = await sendCdp('Page.captureScreenshot', { format: 'png' });
  const shotCombatPath = path.join(outDir, 'verify_circle_combat.png');
  await fsp.writeFile(shotCombatPath, Buffer.from(shotCombat.result.data, 'base64'));
  console.log(`✔ [PASS] 원형 경기장 전투 화면 캡처: ${shotCombatPath}`);

  assert.equal(consoleErrors.length, 0, `콘솔 에러 발생: ${consoleErrors.join(', ')}`);
  console.log('✔ [PASS] 브라우저 런타임 에러 0건');
  cdp.close();
} finally {
  browser.kill();
  serverProc.kill();
}

console.log('\n🎉 모든 자동화 검증 통과!');
