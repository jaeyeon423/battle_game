# 🖥️ Windows에서 AI 작업을 100% 그대로 이어가는 가이드 (`CIRCLE ROYALE`)

이 문서는 Mac에서 진행하던 **AI 페어 프로그래밍 세션(맥락, 설계 히스토리, 자동 검증 방식)** 을 **Windows PC의 AI 에이전트(Antigravity 등)에서 끊김 없이 그대로 이어가기 위해** 작성되었습니다.

---

## 🤖 0. [가장 중요] Windows에서 AI 작업을 바로 이어가는 방법

프로젝트 루트에 AI 에이전트가 자동으로 읽는 규칙 파일인 **`AGENTS.md`** 와 **`GEMINI.md`**, 그리고 크로스플랫폼 자동 검증 스크립트인 **`scripts/verify_game.mjs` (`npm test`)** 를 함께 탑재해 두었습니다.

### 단계별 진행 방법 (Windows PC)
1. **GitHub에서 프로젝트 클론**:
   ```powershell
   git clone https://github.com/jaeyeon423/battle_game.git
   cd battle_game
   ```
2. **Antigravity (또는 사용하시는 AI 코딩 툴)에서 `battle_game` 폴더를 워크스페이스로 열기**:
   - 폴더를 여는 순간, AI 에이전트가 루트의 **`AGENTS.md` / `GEMINI.md`** 를 **자동으로 시스템 컨텍스트에 로드**합니다.
3. **새 채팅창에 아래 첫 마디(프롬프트)만 복사해서 붙여넣기**:
   ```text
   AGENTS.md와 WINDOWS_HANDOVER_GUIDE.md를 읽고 현재까지 작업한 원형 배틀로얄(CIRCLE ROYALE) 상태를 파악해줘. 그리고 서버를 띄운 뒤 이어서 작업할 준비를 해줘.
   ```
   - 위 한 줄만 입력하면 Windows의 AI가 **이전 대화에서 거친 모든 과정(방어전 ➔ 판타지 3직업 ➔ 군인 총기 다양화 ➔ 현재의 원형 배틀로얄 & 랜덤 무기 박스)** 과 **코드 구현 후 스스로 `npm test` 및 브라우저 캡처로 검증하는 규칙**까지 100% 동일하게 기억하고 작업을 이어갑니다!

---

## 1. Windows 환경 필수 준비물 (Prerequisites)

본 프로젝트는 **외부 라이브러리 의존성이 0개(Zero-Dependency)** 로 설계되어 있어, Windows에서 흔히 발생하는 패키지 설치 오류(`node-gyp` 등) 없이 **Node.js와 Git만 설치하면 1초 만에 바로 실행**됩니다.

| 준비물 | 권장 버전 | Windows 설치 방법 (택 1) |
| :--- | :--- | :--- |
| **1. Node.js** | `v18.0.0` 이상 (LTS 권장) | • 공식 사이트: https://nodejs.org/<br>• PowerShell 명령어: `winget install OpenJS.NodeJS.LTS` |
| **2. Git for Windows** | 최신 버전 | • 공식 사이트: https://git-scm.com/download/win<br>• PowerShell 명령어: `winget install Git.Git` |
| **3. 코드 에디터** | Antigravity / VS Code | • 프로젝트 폴더 열기 및 코드 수정용 |
| **4. 웹 브라우저** | Chrome 또는 Edge | • 로컬 멀티플레이 테스트 및 개발자 도구(F12) 확인용 |

### 설치 확인 (PowerShell 또는 명령 프롬프트 `cmd`)
```powershell
node -v   # v18.x.x 이상 출력 확인
git --version
```

---

## 2. Windows에서 프로젝트 다운로드 및 실행 방법

### (1) 저장소 복제(Clone) 및 서버 실행
Windows에서 작업할 폴더(예: `C:\work`)를 열고 **PowerShell** 또는 **터미널**에서 아래 명령어를 순서대로 입력합니다.

```powershell
# 1. GitHub 저장소 클론
git clone https://github.com/jaeyeon423/battle_game.git

# 2. 프로젝트 폴더 이동
cd battle_game

# 3. 실시간 멀티플레이 게임 서버 실행 (별도의 npm install 불필요!)
npm start
# 또는 직접 실행: node server/index.js
```

터미널에 아래와 같이 출력되면 정상 가동된 것입니다:
```text
[Room Created] 작전방 생성됨: ALPHA-01
====================================================================
🏰 CASTLE DEFENSE 멀티플레이 게임 서버 가동 완료!
🌐 웹 클라이언트 접속: http://localhost:8080
🔌 실시간 WebSocket: ws://localhost:8080/ws (30Hz Tick)
====================================================================
```

### (2) 브라우저 접속 및 멀티플레이 테스트
1. Chrome 또는 Edge 브라우저를 열고 **`http://localhost:8080`** 에 접속합니다.
2. **멀티플레이 동시 접속 테스트**:
   - 브라우저 창(또는 탭)을 **2~3개** 띄워 모두 `http://localhost:8080` 에 접속하면 같은 원형 경기장(`ROYALE-01`)에서 실시간으로 함께 싸울 수 있습니다.
3. **같은 공유기(Wi-Fi) 내 스마트폰/다른 PC에서 접속할 때**:
   - Windows PowerShell에서 `ipconfig` 입력 후 `IPv4 주소`(예: `192.168.0.15`)를 확인합니다.
   - 스마트폰 브라우저에서 `http://192.168.0.15:8080` 으로 접속하면 모바일 터치 트윈스틱으로 함께 대전할 수 있습니다. (접속 시 Windows 방화벽 알림이 뜨면 **'액세스 허용'** 클릭)

### (3) 기본 포트(`8080`)가 다른 프로그램과 겹칠 때 (Windows PowerShell)
```powershell
$env:PORT=3000; node server/index.js
```

---

## 3. 현재까지 완료된 작업 내용 요약

### (1) 핵심 게임 규칙: 원형 배틀로얄 (`CIRCLE ROYALE`)
- **원형 경기장 (Circular Arena)**:
  - 전체 월드 크기 `1600 × 1600`, 중심 좌표 `(800, 800)`, 외벽 반지름 **`680m`**.
  - 경기장 내부에 대칭형 전술 지형지물 3종 배치:
    - **전술 암석 기둥 (`rock`)**: 파괴 불가, 이동 및 모든 총알 차단.
    - **강철 샌드백 엄폐물 (`barricade`)**: 내구도 `180 HP`를 가진 파괴 가능 엄폐물.
    - **고폭 연료 드럼통 (`barrel`)**: 총알에 맞아 파괴되면 반경 `145px` 내 생존자들에게 `75` 폭발 피해.
- **라운드 진행 3단계 상태 머신 (`ROULETTE` ➔ `COMBAT` ➔ `ROUND_OVER`)**:
  1. **`roulette` (시작 후 3.0초)**:
     - 8명의 생존자(접속한 유저들 + 빈자리를 채우는 AI 생존자)가 원형 경기장 가장자리(반지름 `490m`) 8방향에 배치됩니다.
     - 화면 중앙에 **`🎁 RANDOM WEAPON BOX`** 모달이 뜨며 6가지 총기 슬롯이 회전한 뒤, 각 참가자에게 **무작위 총기 1종과 전용 스킬 2종(`Shift` / `E`)** 이 지급됩니다.
  2. **`combat` (최후의 1인이 남을 때까지 교전)**:
     - 전원이 서로 적(Free-For-All)이 되어 원형 경기장 안에서 사격·전술 스킬·엄폐물을 활용해 교전합니다.
     - 시간이 지날수록 외곽에서 **붉은 자기장(`RING`)** 이 초당 `11.5m` 속도로 중심부(`150m`)까지 좁혀오며, 자기장 밖에서는 지속 피해를 입습니다.
     - 적 생존자를 처치할 때마다 **체력 `+40 HP` 즉시 회복 + 탄약 즉시 완충** 보상을 얻습니다.
  3. **`round_over` (최후의 1인 우승자 발표, 4.0초)**:
     - 생존자가 **단 1명(`ALIVE: 1 / 8`)** 남으면 화면 중앙에 **`🏆 LAST MAN STANDING`** 우승자 배너가 표시됩니다.
     - 4초 후 자동으로 다음 라운드(`ROUND 02...`)가 시작되며 전원이 다시 랜덤 무기 박스를 추첨합니다.
- **수동 랜덤박스 재추첨 및 라운드 리셋 기능**:
  - 플레이 중 언제든 키보드 **`B` 키** 또는 우측 상단 **`🎁 랜덤박스 다시 뽑기 (B)`** 버튼을 누르면 즉시 랜덤박스가 다시 돌아가며 새 무기가 지급됩니다.
  - 우측 상단 **`🔄 새 라운드 시작`** 버튼을 누르면 즉시 8인 전원 추첨부터 새 라운드를 시작할 수 있습니다.

---

### (2) 랜덤 무기 박스(`🎁 RANDOM WEAPON BOX`) 추첨 총기 6종 및 스킬 12종

| 코드 (`id`) | 등급 | 총기명 | 장탄 (장전) | 기본 사격 특징 | 스킬 1 (`Shift` / 기동) | 스킬 2 (`E` / 특수 화력) |
| :---: | :---: | :--- | :---: | :--- | :--- | :--- |
| `rifle` | `RARE` | **🔫 AR-15 돌격소총** | `30발` (`1.25s`) | 고속 연사 올라운더 (`18` 피해) | **전술 회피 구르기** (구르기 + 탄약 10발 보급 + 3점사) | **M203 총열 유탄** (전방 반경 `145px` 폭발, `68` 피해) |
| `shotgun` | `EPIC` | **💥 M870 전술 산탄총** | `8발` (`1.45s`) | **1회 격발 시 `6펠릿` 산탄 동시 발사** + 강넉백 | **방탄 돌격 대시** (전방 돌진 + 산탄 3발 장전 + 방탄 버프) | **드래곤 브레스 소이탄** (`10발` 관통 화염 산탄 일제 발사) |
| `lmg` | `EPIC` | **🔥 M249 중기관총** | **`80발`** (`2.30s`) | 대용량 탄통 초고속 탄막 제압 | **충격 수류탄 투척** (반경 `165px` 적 밀치기 & 둔화) | **오버드라이브 탄막** (`11발` 대구경 철갑탄 부채꼴 난사) |
| `sniper` | `LEGENDARY` | **🎯 AWM 대물저격총** | `6발` (`1.50s`) | 초장거리(`840px`) 고위력(`62` 피해) 저격 | **연막 후방 도약** (후방 도약 + 반경 `135px` 연막 피해) | **레일건 초관통 사격** (초고속 레일건 3연발, 발당 `75` 피해) |
| `launcher` | `LEGENDARY` | **🚀 M32 유탄발사기** | `6발` (`1.95s`) | **착탄 즉시 반경 `92px` 광역 폭발(AoE)** | **제트 점프 & 지뢰** (도약 회피 + 발밑 충격 지뢰 폭파) | **네이팜 공습 폭격** (조준 전방 반경 `165px`, `85` 폭격 피해) |
| `smg` | `SPECIAL` | **⚡ KRISS 쌍기관단총** | `40발` (`0.95s`) | 최고 이동속도(`222`) + **2발 동시 속사** | **아드레날린 부스트** (초고속 대시 + **체력 `+25` 회복** + 완충) | **360° 블릿 스톰** (전방위 16방향 탄환 동시 난사) |

---

## 4. 프로젝트 폴더 구조 및 파일별 수정 가이드

Windows에서 기능을 추가하거나 밸런스를 수정할 때 아래 파일을 참고하시면 됩니다.

```text
battle_game/
├── index.html                      # 상단 HUD, 랜덤 무기 박스 모달(#randomBoxOverlay), 우승자 모달(#winnerOverlay), 하단 트윈스틱 UI
├── css/
│   └── style.css                   # 전체 다크/네온 전술 UI 스타일 및 랜덤박스 룰렛 애니메이션 스타일
├── server/
│   └── index.js                    # Node.js HTTP 정적 서버 + RFC 6455 WebSocket 실시간 멀티플레이 룸 서버 (30Hz Tick)
├── src/
│   ├── shared/
│   │   ├── constants.js            # ★ 원형 경기장 크기, 자기장 축소 속도, 6종 총기 데미지/탄창/스킬 밸런스 수치 테이블
│   │   └── math.js                 # 벡터 연산, 시드 기반 난수 생성기(PRNG), SpatialHash 격자
│   ├── engine/
│   │   └── WorldSimulation.js      # ★ 원형 경기장 물리, 라운드(ROULETTE->COMBAT->ROUND_OVER), 총기 발사, 스킬 12종, AI 생존자 로직
│   ├── transport/
│   │   ├── WebSocketTransport.js   # 클라이언트 WebSocket 통신 + 60fps 위치 보간(Lerp) + 오프라인 자동 폴백
│   │   └── LocalTransport.js       # 로컬 단독 실행용 어댑터
│   └── client/
│       ├── main.js                 # 클라이언트 메인 루프, HUD 갱신, 랜덤 무기 박스 슬롯 룰렛 연출 제어
│       ├── Renderer.js             # Canvas 2D 원형 경기장 클리핑, 자기장 도넛 링, 캐릭터/총기/탄환/폭발 이펙트 렌더링
│       ├── PixelSprites.js         # 외부 이미지 없이 코드로 생성하는 2D 도트(Pixel Art) 캐릭터·총기 6종·지형지물 스프라이트
│       ├── InputController.js      # 모바일 터치 트윈스틱 + PC 키보드(WASD, Shift, E, R, B) & 마우스 입력 통합 처리
│       └── SynthAudio.js           # Web Audio API 기반 총기별 격발음·스킬·폭발 효과음 실시간 신디사이저
├── package.json                    # npm start 스크립트 설정
└── Dockerfile                      # 클라우드/Docker 컨테이너 배포용 설정
```

### 자주 수정하게 될 작업별 포인트
1. **새로운 총기를 추가하거나 데미지/쿨타임을 바꾸고 싶을 때**:
   - `src/shared/constants.js` 의 `WEAPON_LOADOUTS` 객체에서 수치를 수정하거나 새 무기를 추가합니다.
   - 새 무기의 도트 그래픽은 `src/client/PixelSprites.js`, 특수 스킬 동작은 `src/engine/WorldSimulation.js` 의 `_updatePlayer` 에서 추가할 수 있습니다.
2. **원형 경기장 크기나 자기장 속도를 조절하고 싶을 때**:
   - `src/shared/constants.js` 상단의 `WORLD_CONFIG` (`ARENA_RADIUS`, `MIN_SAFE_RADIUS`, `SAFE_SHRINK_RATE`, `STORM_DAMAGE`, `TOTAL_FIGHTERS`) 값만 바꾸면 서버와 클라이언트에 동시에 반영됩니다.
3. **Windows에서 작업 후 GitHub에 다시 올릴 때**:
   ```powershell
   git add .
   git commit -m "업데이트 내용 입력"
   git push
   ```
