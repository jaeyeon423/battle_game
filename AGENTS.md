# AI Agent Workspace Instructions & Session Handover (`CIRCLE ROYALE`)

이 파일(`AGENTS.md`)은 사용자가 Mac에서 진행하던 AI 페어 프로그래밍 세션을 **Windows PC 환경에서도 맥락 손실 없이 100% 동일하게 이어가기 위해** 작성된 AI 에이전트 전용 지침서입니다. 새로운 대화 세션이 시작되면 이 문서의 히스토리와 작업 원칙을 즉시 숙지하고 작업을 이어가세요.

---

## 1. AI 에이전트 핵심 행동 지침 (Behavioral Rules)

1. **항상 한국어로 답변**: 모든 설명, 코드 요약, 검증 리포트는 한국어로 명확하고 간결하게 작성합니다.
2. **구현 후 반드시 자체 검증(Self-Verification) 수행**:
   - 사용자가 *"너가 검증해"* 라고 요청했던 워크플로우를 유지합니다.
   - 코드를 수정한 뒤에는 반드시 **`node scripts/verify_game.mjs` (`npm test`)** 를 실행하여:
     1. Headless 물리 시뮬레이션(`WorldSimulation`) 수치/규칙 검증
     2. 실제 멀티플레이 WebSocket 서버 구동 + Headless Chrome/Edge 접속 + 스크린샷 캡처 및 콘솔 에러 `0건` 검증
   - 캡처된 스크린샷 이미지를 `read_file` 도구로 직접 눈으로 확인하여 UI/렌더링 깨짐이 없는지 검증한 뒤 사용자에게 보고합니다.
3. **Zero-Dependency 원칙 유지**:
   - 서버(`server/index.js`)와 클라이언트(`src/`)는 외부 npm 패키지 설치 없이 순수 Node.js 내장 모듈(`node:http`, `node:crypto`, `node:fs`, `node:path`)과 브라우저 표준 ES Module + Canvas 2D + Web Audio API만으로 동작해야 합니다.

---

## 2. 이전 대화 세션 히스토리 요약 (Context Summary)

사용자와 함께 다음과 같은 순서로 게임을 설계·발전시켜 현재의 **원형 배틀로얄 (`CIRCLE ROYALE`)** 버전에 도달했습니다:

1. **초기 아키텍처 구축**:
   - 실시간 온라인 멀티플레이 확장을 고려하여 물리/게임 로직 코어(`src/engine/WorldSimulation.js`)를 렌더링(`src/client/Renderer.js`) 및 네트워크 통신(`src/transport/WebSocketTransport.js`)과 완전히 분리(Decoupled Headless Core)했습니다.
   - 가로 모드(Landscape) 양손 트윈 스틱 조작계:
     - **좌측 하단**: 360° 이동 조이스틱 (`#leftStickZone`, PC: `WASD`/방향키)
     - **우측 하단**: 360° 수동 조준·발사 스틱 (`#rightStickZone`, PC: 마우스 조준/좌클릭) + 보조 액션 버튼 3종 (`🔄 재장전 R`, `⚡ 스킬1 Shift`, `💥 스킬2 E`)
2. **과정 중 거친 프로토타입 단계**:
   - (1단계) 우측 스폰 적 웨이브 방어전 + 지형지물 3종(`rock` 암석, `barricade` 바리케이드, `barrel` 폭발 드럼통)
   - (2단계) 판타지 성문 방어전 (전사·궁수·마법사 3직업 상성 및 스킬)
   - (3단계) 특수부대 군인 컨셉 + 다양한 총기(돌격소총, 산탄총, 중기관총, 대물저격총, 유탄발사기)
3. **현재 최종 확정된 게임 컨셉 (`CIRCLE ROYALE: 원형 랜덤 무기 서바이벌`)**:
   - **원형 경기장(`Circular Arena`, 반지름 `680m`)** 에서 **최후의 1인(`Last Man Standing`)이 남을 때까지 싸우는 배틀로얄 서바이벌 게임**으로 변경 완료.
   - **시작할 때 화면 중앙에 랜덤 무기 박스(`🎁 RANDOM WEAPON BOX`)가 뜨고 무기가 무작위로 지급**됨 (`3.0초` 룰렛 연출 후 전투 시작).
   - 전투 중 외곽에서 **붉은 자기장(`RING`)** 이 중심부(`150m`)로 좁혀오며, 생존자가 1명 남으면 **`🏆 LAST MAN STANDING`** 우승자 발표 후 다음 라운드(전원 랜덤박스 재추첨)가 자동 시작됨.

---

## 3. 현재 코드베이스 구조 및 핵심 메커니즘

- **`src/shared/constants.js`**:
  - `WORLD_CONFIG`: 원형 경기장 크기(`1600×1600`), 중심(`800, 800`), 반지름(`ARENA_RADIUS: 680`), 자기장 최소 반지름(`MIN_SAFE_RADIUS: 150`), 초당 축소 속도(`SAFE_SHRINK_RATE: 11.5`), 총 참가자 수(`TOTAL_FIGHTERS: 8`).
  - `WEAPON_LOADOUTS` (랜덤박스 추첨 대상 **6종 총기**):
    1. `rifle` (**🔫 AR-15 돌격소총**, `RARE`): 30발 연사 + `전술 회피 구르기(Shift)` & `M203 총열 유탄(E)`
    2. `shotgun` (**💥 M870 전술 산탄총**, `EPIC`): 1회 격발 시 **6펠릿 산탄 동시 발사** + `방탄 돌격 대시(Shift)` & `드래곤 브레스 소이탄(E)`
    3. `lmg` (**🔥 M249 중기관총**, `EPIC`): **80발 탄통** 초고속 연사 + `충격 수류탄 투척(Shift)` & `오버드라이브 탄막(E)`
    4. `sniper` (**🎯 AWM 대물저격총**, `LEGENDARY`): 초장거리 고위력 단발 + `연막 후방 도약(Shift)` & `레일건 초관통 사격(E)`
    5. `launcher` (**🚀 M32 유탄발사기**, `LEGENDARY`): **착탄 시 반경 92px 광역 폭발** + `제트 점프 & 지뢰(Shift)` & `네이팜 공습 폭격(E)`
    6. `smg` (**⚡ KRISS 쌍기관단총**, `SPECIAL`): 최고 이동속도 & **2발 동시 발사** + `아드레날린 부스트(+25 HP 회복, Shift)` & `360° 블릿 스톰(E)`
- **`src/engine/WorldSimulation.js`**:
  - 라운드 상태 머신: `'roulette'` (3.0초 랜덤박스 추첨) ➔ `'combat'` (자기장 축소 및 전원 개인전 교전) ➔ `'round_over'` (최후의 1인 우승자 발표 후 `startNewRound()` 자동 호출).
  - 참가자 8명 유지: 온라인 접속 유저 외 빈자리는 AI 생존자(`BOT_CALLSIGNS`)가 자동으로 채워 원형 8방향에서 스폰됨.
  - 처치 보상: 적 처치 시 킬러 체력 `+40 HP` 회복 및 탄창 즉시 완충.
- **`server/index.js` & `src/transport/WebSocketTransport.js`**:
  - 단일 포트(`8080`)에서 정적 파일 서빙 + RFC 6455 WebSocket 멀티플레이 룸(`ROYALE-01` 등)을 30Hz 서버 틱으로 동기화.
- **`index.html` & `src/client/main.js` & `src/client/Renderer.js`**:
  - `#randomBoxOverlay`: 라운드 시작 시(또는 `B`키 / `🎁 랜덤박스 다시 뽑기` 클릭 시) 6종 총기 슬롯이 회전하다가 당첨 무기를 하이라이트하는 모달.
  - `#winnerOverlay`: 최후의 1인 결정 시 우승자 이름·당첨 무기·킬 수를 보여주는 배너.

---

## 4. Windows 환경에서 서버 실행 및 자동 검증 명령어

- **라이브 멀티플레이 서버 실행**:
  ```powershell
  node server/index.js
  ```
  (기본 접속 주소: `http://localhost:8080`)
- **자동화 시뮬레이션 + Headless 브라우저 스크린샷 검증 실행**:
  ```powershell
  npm test
  # 또는: node scripts/verify_game.mjs
  ```
