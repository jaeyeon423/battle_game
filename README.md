# CIRCLE ROYALE · 원형 배틀로얄 (랜덤 무기 박스 서바이벌)

원형 경기장(Circular Arena)에서 **시작 시 랜덤 무기 박스(`🎁 RANDOM WEAPON BOX`)** 로 무작위 총기를 지급받아 **최후의 1인(Last Man Standing)** 이 남을 때까지 싸우는 실시간 멀티플레이 2D 도트 서바이벌 게임입니다.

## 주요 특징
- **시작 시 랜덤 무기 박스(룰렛) 추첨**: 매 라운드 시작 시 화면 중앙에 6종 총기(`🔫 AR-15 돌격소총`, `💥 M870 전술 산탄총`, `🔥 M249 중기관총`, `🎯 AWM 대물저격총`, `🚀 M32 유탄발사기`, `⚡ KRISS 쌍기관단총`) 슬롯이 회전하며 무작위 총기와 전용 스킬 2종(`Shift` / `E`)이 부여됩니다.
- **원형 경기장 & 자기장(`RING`) 축소**: 반지름 `680m`의 원형 아레나 외곽에서 시간이 지날수록 자기장이 좁혀져 오며, 최후의 1인이 남으면 우승자가 발표되고 다음 라운드가 시작됩니다.
- **Zero-Dependency Node.js 실시간 WebSocket 멀티플레이 서버**: 별도의 외부 패키지 설치 없이 Node.js 기본 내장 모듈만으로 HTTP 정적 서빙과 30Hz Authoritative WebSocket 멀티플레이 룸(`ROYALE-01` 등)을 동시에 처리합니다.

## 실행 방법

```bash
npm start
# 또는
node server/index.js
```

브라우저에서 `http://localhost:8080` 접속
