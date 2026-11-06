// ============================================================================
// [Shared] 원형 배틀로얄: 1대1 판타지 결투 (CIRCLE ROYALE: 1 vs 1 DUEL)
// 3대 판타지 클래스 밸런스:
// 1. ⚔️ 전사: 근접 공격 전용 (원거리 불가) · 초고속 기동 · 높은 체력 (HP 580)
// 2. 🏹 궁수: 원거리 일격필살 (데미지 125) · 1발 장전 메커니즘 (장전 1.5초)
// 3. 🔮 마법사: 원거리 제어 마법 · 궁수보다 약한 데미지 (42) · 부가 효과 (둔화 40% + 화상 DoT + 75px 광역 폭발)
// ============================================================================

export const WORLD_CONFIG = {
  WIDTH: 1600,
  HEIGHT: 1600,
  CENTER_X: 800,
  CENTER_Y: 800,
  ARENA_RADIUS: 700,       // 원형 경기장 외벽 반지름
  MIN_SAFE_RADIUS: 160,    // 자기장(마력 폭풍 링) 최소 축소 반지름
  SAFE_START_DELAY: 25.0,  // 시작 후 25초간 자기장 축소 대기 (1대1 탐색/심리전 보장)
  SAFE_SHRINK_RATE: 3.2,   // 초당 3.2px씩 아주 천천히 축소 (2분 30초 이상 여유로운 듀얼)
  STORM_DAMAGE: 8,         // 자기장 밖 초당 피해량
  TOTAL_FIGHTERS: 2,       // 적 1명만 남김 (총 2인 1대1 결투!)
  ROULETTE_DURATION: 3.0,  // 시작 시 무기 추첨 시간(초)
  ROUND_OVER_DURATION: 4.0,// 우승자 표시 시간(초)
  TILE_SIZE: 64,
  TICK_RATE: 60,
  GRID_CELL_SIZE: 96,
};

// ============================================================================
// 3대 판타지 클래스 상세 스펙 정의
// ============================================================================
const WARRIOR_SPEC = {
  id: 'warrior',
  name: '기동 돌격 전사',
  tier: 'EPIC',
  tierColor: '#ffa502',
  role: '근접 참격 · 초고속 기동 · 높은 체력',
  icon: '⚔️',
  weaponName: '기사의 대검',
  ammoLabel: 'STAM',
  reloadLabel: '자세 정돈',
  hp: 580,                 // ★ 체력이 매우 높음 (궁수/마법사의 약 2배)
  damageReduction: 0.30,   // ★ 상시 피해 30% 경감
  speed: 235,              // ★ 속도가 매우 빠름 (경쾌하고 민첩한 이동)
  fireMoveMult: 0.98,
  radius: 15,
  isMelee: true,           // ★ 완전한 근접 공격 (원거리 투사체 없음!)
  meleeRange: 100,         // 근접 유효 사거리 (100px)
  meleeArc: 1.85,          // 근접 휘두르기 호 (약 105도)
  maxAmmo: 100,            // 기력
  costPerShot: 20,         // 1회 베기당 기력 20 소모
  regenRate: 40,           // 초당 기력 40 자연 재생
  reloadTime: 0.8,         // R키: 기력 완충
  fireInterval: 0.52,      // 묵직한 0.52초 연속 근접 참격
  bulletDamage: 70,        // 근접 직격 시 70 데미지 + 강력 넉백
  bulletSpeed: 0,          // 원거리 없음
  bulletRange: 100,
  bulletRadius: 12,
  bulletPierce: 99,
  bulletKnockback: 220,
  bulletSplashRadius: 0,
  bulletSpread: 0,
  bulletType: 'melee_slash',
  bulletColor: '#ffa502',
  skill1: {
    id: 'charge_slash',
    name: '맹렬한 돌격',
    desc: '순간 쇄도 돌진 + 기력 완충 + 2.5초간 방어 50% 추가 상승',
    cooldown: 4.5,
    duration: 0.28,
    speedMult: 3.4,
  },
  skill2: {
    id: 'whirlwind',
    name: '회전 참격',
    desc: '전방위 360° 반경 135px 대검 회전 베기 (피해 95, 투사체 전원 소멸)',
    cooldown: 7.5,
    radius: 135,
    damage: 95,
  },
};

const ARCHER_SPEC = {
  id: 'archer',
  name: '엘프 저격 궁수',
  tier: 'LEGENDARY',
  tierColor: '#7bed9f',
  role: '초장거리 일격필살 · 1발 장전 필요',
  icon: '🏹',
  weaponName: '엘프 장궁',
  ammoLabel: 'ARROW',
  reloadLabel: '화살 거치',
  hp: 330,                 // 보통 체력
  damageReduction: 0.05,
  speed: 180,              // ★ 기동성 강화 (기존 148 대비 쾌적한 이동)
  fireMoveMult: 0.90,
  radius: 14,
  isMelee: false,
  maxAmmo: 1,              // ★ 탄창 단 1발!
  costPerShot: 1,
  regenRate: 0,            // 쏘고 나면 수동/자동 장전 필요
  reloadTime: 1.5,         // ★ 1발 쏘고 1.5초간 반드시 장전 필요!
  fireInterval: 0.35,
  bulletDamage: 125,       // ★ 단발 125 초강력 저격 데미지!
  bulletSpeed: 640,        // 시원하고 빠른 탄속
  bulletRange: 880,        // 초장거리 사거리
  bulletRadius: 7,
  bulletPierce: 1,
  bulletKnockback: 180,
  bulletSplashRadius: 0,
  bulletSpread: 0.005,
  bulletType: 'arrow',
  bulletColor: '#7bed9f',
  skill1: {
    id: 'wind_leap',
    name: '바람걸음 도약',
    desc: '빠른 후방 도약 회피 + 즉시 화살 1발 자동 장전',
    cooldown: 5.0,
    blinkDist: 125,
    novaRadius: 0,
  },
  skill2: {
    id: 'explosive_arrow',
    name: '폭발 관통 화살',
    desc: '조준 전방에 마법 폭발 화살 발사 (사거리 900px, 반경 125px, 피해 110)',
    cooldown: 8.5,
    castDist: 250,
    radius: 125,
    damage: 110,
  },
};

const MAGE_SPEC = {
  id: 'mage',
  name: '원소 제어 마법사',
  tier: 'LEGENDARY',
  tierColor: '#9b59b6',
  role: '원거리 제어 · 둔화 및 화상 DoT 부가효과',
  icon: '🔮',
  weaponName: '원소 마법 지팡이',
  ammoLabel: 'MANA',
  reloadLabel: '마나 명상',
  hp: 300,                 // 낮은 체력
  damageReduction: 0.0,
  speed: 175,              // ★ 기동성 강화 (기존 142 대비 쾌적한 이동)
  fireMoveMult: 0.90,
  radius: 14,
  isMelee: false,
  maxAmmo: 100,            // 마나 100
  costPerShot: 18,
  regenRate: 26,           // 초당 마나 26 자연 회복
  reloadTime: 1.1,         // R키: 마나 명상
  fireInterval: 0.70,      // 0.70초 캐스팅 간격
  bulletDamage: 42,        // ★ 궁수보다 약한 데미지 (42)
  bulletSpeed: 430,
  bulletRange: 620,
  bulletRadius: 9,
  bulletPierce: 1,
  bulletKnockback: 80,
  bulletSplashRadius: 75,  // ★ 착탄 시 반경 75px 광역 폭발!
  bulletSpread: 0.02,
  bulletType: 'fireball',
  bulletColor: '#e056fd',
  // ★ 부가 효과: 피격 시 적에게 둔화(이동속도 40% 감소) + 화상(2초간 DoT 피해)
  debuff: {
    slowDuration: 2.0,     // 2.0초 둔화
    slowRate: 0.40,        // 40% 이동속도 감소
    burnDuration: 2.0,     // 2.0초 지속 화상
    burnDamage: 6,         // 0.5초마다 6 피해 (총 +24 추가 피해)
  },
  skill1: {
    id: 'frost_blink',
    name: '서리 점멸',
    desc: '120px 순간이동 + 출발지에 서리 폭발 (반경 130px 적 1.5초 70% 빙결)',
    cooldown: 5.5,
    blinkDist: 120,
    novaRadius: 130,
    damage: 35,
    slowDuration: 1.5,
    slowRate: 0.70,
  },
  skill2: {
    id: 'meteor',
    name: '메테오 소환',
    desc: '조준 위치에 거대 운석 소환 (반경 165px, 피해 75 + 적 2.5초 감전/둔화)',
    cooldown: 9.0,
    castDist: 230,
    radius: 165,
    damage: 75,
  },
};

// ============================================================================
// 메인 3대 클래스 & 기존 호환 무기 매핑
// ============================================================================
export const WEAPON_LOADOUTS = {
  // 메인 3대 판타지 클래스
  warrior: WARRIOR_SPEC,
  archer: ARCHER_SPEC,
  mage: MAGE_SPEC,

  // 기존 6종 무기 ID 하위 호환 매핑
  sword: { ...WARRIOR_SPEC, id: 'sword' },
  bow: { ...ARCHER_SPEC, id: 'bow' },
  staff: { ...MAGE_SPEC, id: 'staff' },
  tome: { ...MAGE_SPEC, id: 'tome', name: '비전 마도서', icon: '📖' },
  crossbow: { ...ARCHER_SPEC, id: 'crossbow', name: '드워프 중석궁', icon: '🎯' },
  daggers: { ...WARRIOR_SPEC, id: 'daggers', name: '그림자 쌍단검', icon: '🗡️', speed: 220, hp: 520 },
};

// 룰렛 및 기본 추첨 대상: 메인 3대 직업
export const WEAPON_KEYS = ['warrior', 'archer', 'mage'];
export const HERO_CLASSES = WEAPON_LOADOUTS;
export const SOLDIER_CLASSES = WEAPON_LOADOUTS;

export function resolveWeaponSpec(id) {
  if (WEAPON_LOADOUTS[id]) return WEAPON_LOADOUTS[id];
  return WEAPON_LOADOUTS.warrior;
}

export const OBSTACLE_TYPES = {
  rock: {
    id: 'rock',
    name: '고대 바위 기둥',
    radius: 34,
    destructible: false,
    blocksMovement: true,
    blocksPlayerBullets: true,
  },
  barricade: {
    id: 'barricade',
    name: '나무 방책',
    radius: 26,
    hp: 220,
    destructible: true,
    blocksMovement: true,
    blocksPlayerBullets: true,
  },
  barrel: {
    id: 'barrel',
    name: '폭발 화약통',
    radius: 18,
    hp: 35,
    destructible: true,
    explosive: true,
    explosionRadius: 150,
    explosionDamage: 80,
    blocksMovement: true,
    blocksPlayerBullets: true,
  },
};
