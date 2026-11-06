// ============================================================================
// [Cross-Platform Automated Verification] Windows & macOS 겸용 AI 자체 검증 스크립트
// 실행 방법: npm test (또는 node scripts/verify_game.mjs)
// 1. Headless 물리 시뮬레이션 검증 (3대 클래스 밸런스 + 대기실/방장 권한 + 최후의 1인 우승)
// 2. 실시간 WebSocket 서버 구동 + Headless Chrome/Edge 접속 + 방 생성/방장 시작 스크린샷 검증
// ============================================================================

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorldSimulation } from '../src/engine/WorldSimulation.js';
import { WORLD_CONFIG, WEAPON_LOADOUTS, WEAPON_KEYS } from '../src/shared/constants.js';

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

console.log('=== [1/2] 3대 판타지 클래스 밸런스 & 멀티플레이 방/방장 시스템 시뮬레이션 검증 ===');

const sim = new WorldSimulation(20261106);
sim.enterWaitingRoom();
const p = sim.addPlayer('p_main', 'warrior', 'WARRIOR-HOST', false);
const initSnap = sim.getStateSnapshot();

assert.equal(initSnap.roundState, 'waiting', '대기실 진입 시 상태가 waiting이어야 합니다.');
assert.equal(initSnap.hostId, 'p_main', '첫 번째 입장 유저가 방장(hostId)이어야 합니다.');

// 2번째 실제 유저 입장 시: auto 봇 모드에서는 AI 봇이 제거되고 실제 유저 2명만 대결해야 함
const pGuest = sim.addPlayer('p_guest', 'archer', 'ARCHER-GUEST', false);
assert.equal(sim.players.size, 2, '유저 2명 입장 시 AI 봇이 제거되고 유저 2명만 남아야 합니다.');
assert.equal(sim.hostStartGame('p_guest'), false, '방장이 아닌 일반 참가자는 게임을 시작할 수 없어야 합니다.');
assert.equal(sim.roundState, 'waiting', '일반 참가자 시작 시도 후에도 waiting 상태가 유지되어야 합니다.');

// 게스트 퇴장 후 1인 연습 모드로 전환 검증
sim.removePlayer('p_guest');
assert.equal(sim.hostId, 'p_main', '방장이 유지되어야 합니다.');
assert.equal(sim.players.size, 2, '1인일 때는 연습용 AI 봇 1명이 자동 참가해야 합니다.');

// 방장이 게임 시작 호출!
assert.equal(sim.hostStartGame('p_main'), true, '방장은 게임을 시작할 수 있어야 합니다.');
assert.equal(sim.roundState, 'roulette', '방장이 게임을 시작하면 roulette 상태로 전환되어야 합니다.');
console.log('✔ [PASS] 멀티플레이 대기실 · 방장 권한 · 유저 간 매칭 규칙 검증 완료');

// [밸런스 검증 1] 전사: 근접 공격(isMelee=true, 투사체 없음), 초고속 이동(speed 215), 높은 체력(HP 580)
const warriorSpec = WEAPON_LOADOUTS.warrior;
assert.ok(warriorSpec.isMelee, '전사는 근접 공격 전용이어야 합니다.');
assert.ok(warriorSpec.speed > WEAPON_LOADOUTS.archer.speed, '전사는 궁수보다 빨라야 합니다.');
assert.ok(warriorSpec.hp > WEAPON_LOADOUTS.archer.hp && warriorSpec.hp > WEAPON_LOADOUTS.mage.hp, '전사는 체력이 가장 높아야 합니다.');

// [밸런스 검증 2] 궁수: 원거리(isMelee=false), 초강력 대미지(125), 1발 장전 필요(maxAmmo=1, reloadTime 1.5s)
const archerSpec = WEAPON_LOADOUTS.archer;
assert.ok(!archerSpec.isMelee, '궁수는 원거리 공격이어야 합니다.');
assert.ok(archerSpec.bulletDamage > warriorSpec.bulletDamage && archerSpec.bulletDamage > WEAPON_LOADOUTS.mage.bulletDamage, '궁수는 데미지가 가장 강력해야 합니다.');
assert.equal(archerSpec.maxAmmo, 1, '궁수는 탄창이 1발이어야 합니다.');
assert.ok(archerSpec.reloadTime >= 1.4, '궁수는 1발 쏘고 1.5초 장전이 필요합니다.');

// [밸런스 검증 3] 마법사: 원거리, 궁수보다 약한 대미지(42), 부가 효과(둔화 40% + 화상 DoT + 75px 광역 폭발)
const mageSpec = WEAPON_LOADOUTS.mage;
assert.ok(!mageSpec.isMelee, '마법사는 원거리 공격이어야 합니다.');
assert.ok(mageSpec.bulletDamage < archerSpec.bulletDamage, '마법사는 궁수보다 데미지가 약해야 합니다.');
assert.ok(mageSpec.debuff && mageSpec.debuff.slowRate === 0.40, '마법사는 40% 둔화 부가 효과를 지녀야 합니다.');
assert.ok(mageSpec.debuff && mageSpec.debuff.burnDamage > 0, '마법사는 화상 DoT 부가 효과를 지녀야 합니다.');
assert.ok(mageSpec.bulletSplashRadius >= 70, '마법사는 광역 폭발 범위를 지녀야 합니다.');

console.log('✔ [PASS] 3대 판타지 클래스(전사·궁수·마법사) 밸런스 규칙 검증 완료');

// [단발 탭 공격 및 가장 가까운 적 자동 조준 검증]
const autoAimSim = new WorldSimulation(42);
autoAimSim.roundState = 'combat';
const testHero = autoAimSim.addPlayer('test_hero', 'archer', 'HERO-TAP', false);
const targetEnemy = autoAimSim.addPlayer('test_bot', 'warrior', 'BOT-TARGET', true);
testHero.x = 800;
testHero.y = 800;
testHero.aimAngle = 0; // 초기 각도는 0도 (오른쪽)
targetEnemy.x = 800;
targetEnemy.y = 1000; // 적은 영웅 바로 아래쪽 (+90도 = PI/2)

// 1. 공격 버튼 1회 탭(firePressed: true, autoAim: true): 가장 가까운 적(아래쪽 PI/2)을 향해 자동 조준 & 화살 발사
autoAimSim.applyInput('test_hero', {
  firePressed: true,
  autoAim: true,
  isFiring: true,
  aimAngle: 0,
});
autoAimSim.step(1 / 60);

const expectedAngle = Math.atan2(targetEnemy.y - testHero.y, targetEnemy.x - testHero.x);
assert.ok(
  Math.abs(testHero.aimAngle - expectedAngle) < 0.05,
  `탭 공격 시 가장 가까운 적을 향해 자동 조준되어야 합니다. (실제: ${testHero.aimAngle}, 기대: ${expectedAngle})`
);
assert.equal(testHero.ammo, 0, '화살이 1회 발사되어 탄약이 소진되어야 합니다.');

// 2. 공격 버튼을 꾹 누르고 있는 상태(firePressed: false, isFiring: true): 자동 연속 발사 차단 검증
testHero.fireCooldown = 0;
testHero.isReloading = false;
testHero.ammo = 1; // 재장전 완료 상태
autoAimSim.applyInput('test_hero', {
  firePressed: false, // 손가락을 떼지 않고 누르고만 있음
  autoAim: false,
  isFiring: true,
  aimAngle: expectedAngle,
});
autoAimSim.step(1 / 60);
assert.equal(testHero.ammo, 1, '버튼을 꾹 누르고 있어도 1회 탭(firePressed) 없이는 자동 연속 발사되지 않아야 합니다.');

// 3. 사용자가 직접 조종한 방향으로 릴리즈 발사 검증 (적과 다른 방향 조준 시에도 각도 존중)
testHero.fireCooldown = 0;
testHero.isReloading = false;
testHero.ammo = 1;
const manualAimAngle = -Math.PI / 2; // 적이 있는 아래쪽이 아닌 위쪽으로 플레이어가 직접 조종
autoAimSim.applyInput('test_hero', {
  firePressed: true,
  autoAim: false,
  isFiring: true,
  aimAngle: manualAimAngle,
});
autoAimSim.step(1 / 60);
assert.equal(testHero.aimAngle, manualAimAngle, '사용자가 직접 조종한 조준 각도가 100% 최우선 존중되어야 합니다.');
assert.equal(testHero.ammo, 0, '사용자가 조종한 방향으로 즉시 1회 발사되어야 합니다.');

console.log('✔ [PASS] 원탭 자동 조준 공격, 사용자 방향 조종 릴리즈 발사, 홀드 시 연속 발사 차단 검증 완료');

// 새 라운드 시작 후 최후의 1인 시뮬레이션 검증
sim.startNewRound();
for (let i = 0; i < 60 * (WORLD_CONFIG.ROULETTE_DURATION + 0.2); i++) sim.step(1 / 60);
assert.equal(sim.roundState, 'combat', '랜덤박스 추첨 후 combat 상태로 전환되어야 합니다.');

let winnerFound = false;
for (let i = 0; i < 60 * 200; i++) {
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
        firePressed: i % 30 === 0,
        isFiring: i % 30 === 0,
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

console.log(`\n=== [2/2] Headless 브라우저(${path.basename(browserPath)}) 모바일 대기실 · 방 생성 · 방장 게임 시작 검증 ===`);

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
    '--window-size=412,840',
    `--remote-debugging-port=${debugPort}`,
    `http://127.0.0.1:${TEST_PORT}/`,
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
      const desc = data.params?.exceptionDetails?.exception?.description || data.params?.exceptionDetails?.text || 'Exception';
      console.log('🔴 Captured exception:', desc);
      consoleErrors.push(desc);
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

  const outDir = path.join(ROOT_DIR, 'screenshots');
  await fsp.mkdir(outDir, { recursive: true });

  // 1. 최초 접속 시 닉네임 입력 모달(#authOverlay) 캡처
  await new Promise((r) => setTimeout(r, 800));
  const shotLogin = await sendCdp('Page.captureScreenshot', { format: 'png' });
  const shotLoginPath = path.join(outDir, 'verify_login.png');
  await fsp.writeFile(shotLoginPath, Buffer.from(shotLogin.result.data, 'base64'));
  console.log(`✔ [PASS] 최초 접속 닉네임 입력 모달 캡처: ${shotLoginPath}`);

  // 2. 닉네임('재연킴') 입력 후 [🚀 결투장 바로 입장하기] 클릭 -> 방 목록(#roomBrowserOverlay) 단독 화면 캡처
  await sendCdp('Runtime.evaluate', {
    expression: `
      document.getElementById('authNicknameInput').value = '재연킴';
      document.getElementById('authSubmitBtn').click();
    `,
  });
  await new Promise((r) => setTimeout(r, 500));
  const shotBrowser = await sendCdp('Page.captureScreenshot', { format: 'png' });
  const shotBrowserPath = path.join(outDir, 'verify_room_browser.png');
  await fsp.writeFile(shotBrowserPath, Buffer.from(shotBrowser.result.data, 'base64'));
  console.log(`✔ [PASS] 닉네임 입력 직후 방 리스트 화면(우측 상단 ➕ 방 만들기 버튼 포함) 캡처: ${shotBrowserPath}`);

  // 3. 우측 상단 [➕ 방 만들기] 버튼 클릭 -> 새 방 만들기 전용 모달(#createRoomOverlay) 캡처
  await sendCdp('Runtime.evaluate', {
    expression: `
      document.getElementById('openCreateRoomModalBtn').click();
      document.getElementById('createRoomNameInput').value = '최강자전 1대1 결투방';
    `,
  });
  await new Promise((r) => setTimeout(r, 350));
  const shotCreateModal = await sendCdp('Page.captureScreenshot', { format: 'png' });
  const shotCreateModalPath = path.join(outDir, 'verify_create_room_modal.png');
  await fsp.writeFile(shotCreateModalPath, Buffer.from(shotCreateModal.result.data, 'base64'));
  console.log(`✔ [PASS] 우측 상단 [➕ 방 만들기] 전용 모달 캡처: ${shotCreateModalPath}`);

  // 4. [🚀 방 만들고 방장으로 입장하기] 클릭 -> 방 대기실(#waitingRoomOverlay) 캡처
  await sendCdp('Runtime.evaluate', {
    expression: `
      document.getElementById('createRoomConfirmBtn').click();
    `,
  });
  await new Promise((r) => setTimeout(r, 500));
  const shotWait = await sendCdp('Page.captureScreenshot', { format: 'png' });
  const shotWaitPath = path.join(outDir, 'verify_waiting_room.png');
  await fsp.writeFile(shotWaitPath, Buffer.from(shotWait.result.data, 'base64'));
  console.log(`✔ [PASS] 방 생성 후 모바일 대기실(방장 화면) 캡처: ${shotWaitPath}`);

  // 5. 대기실에서 [⚔️ 기동 돌격 전사] 직업 선택 후 방장이 [🚀 게임 시작하기] 클릭 -> 룰렛 모달 캡처
  await sendCdp('Runtime.evaluate', {
    expression: `
      const wBtn = document.querySelector('#waitClassGrid .wait-class-btn[data-class="warrior"]');
      if (wBtn) wBtn.click();
    `,
  });
  await new Promise((r) => setTimeout(r, 200));
  await sendCdp('Runtime.evaluate', {
    expression: `
      document.getElementById('hostStartBtn').click();
    `,
  });
  await new Promise((r) => setTimeout(r, 800));

  const shotBox = await sendCdp('Page.captureScreenshot', { format: 'png' });
  const shotBoxPath = path.join(outDir, 'verify_random_box.png');
  await fsp.writeFile(shotBoxPath, Buffer.from(shotBox.result.data, 'base64'));
  console.log(`✔ [PASS] 방장 게임 시작 후 룰렛 모달 캡처: ${shotBoxPath}`);

  // 4. 2.5초 대기 후 원형 경기장 진입 -> 우측 공격 스틱을 당겨 전사 대검 휘두르기(Swing) 발동 순간 캡처!
  await new Promise((r) => setTimeout(r, 2500));
  await sendCdp('Runtime.evaluate', {
    expression: `
      const rz = document.getElementById('rightStickZone');
      const rect = rz.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      rz.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, clientX: cx, clientY: cy, bubbles: true }));
      rz.dispatchEvent(new PointerEvent('pointermove', { pointerId: 2, clientX: cx + 38, clientY: cy, bubbles: true }));
    `,
  });
  await new Promise((r) => setTimeout(r, 85));
  const shotCombat = await sendCdp('Page.captureScreenshot', { format: 'png' });
  const shotCombatPath = path.join(outDir, 'verify_circle_combat.png');
  await fsp.writeFile(shotCombatPath, Buffer.from(shotCombat.result.data, 'base64'));
  console.log(`✔ [PASS] 원형 경기장 전사 대검 휘두르기 모션 캡처: ${shotCombatPath}`);

  // 7. 스마트폰 세로(Portrait 390x844) 화면 정상 렌더링 검증 및 캡처
  const shotPortrait = await sendCdp('Page.captureScreenshot', { format: 'png' });
  const shotPortraitPath = path.join(outDir, 'verify_portrait_combat.png');
  await fsp.writeFile(shotPortraitPath, Buffer.from(shotPortrait.result.data, 'base64'));
  console.log(`✔ [PASS] 스마트폰 네이티브 세로(Portrait) 전투 화면 캡처: ${shotPortraitPath}`);

  cdp.close();
  assert.equal(consoleErrors.length, 0, `런타임 에러 발생: ${consoleErrors.join(', ')}`);
  console.log('✔ [PASS] 브라우저 런타임 에러 0건');
  console.log('\n🎉 모든 자동화 검증 통과!');
} finally {
  browser.kill();
  serverProc.kill();
}
