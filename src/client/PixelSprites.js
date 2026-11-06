// ============================================================================
// [Client] 방어 기지 전선 사수 (FRONTLINE DEFENSE) 도트(Pixel Art) 스프라이트 생성기
// 특수부대 군인 5대 무장(돌격소총·산탄총·중기관총·저격소총·유탄발사기), 지형지물, 감염체 크롤러
// ============================================================================

function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function buildDotSprite(rows, palette, flashWhite = false) {
  const h = rows.length;
  const w = rows[0].length;
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');

  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.' || !palette[ch]) continue;
      ctx.fillStyle = flashWhite ? '#ffffff' : palette[ch];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

export class PixelSprites {
  constructor() {
    this.cache = new Map();
    this._initSprites();
  }

  _initSprites() {
    // ========================================================================
    // 1. 특수부대 군인 (Tactical Soldier) 기본 도트 프레임 (방탄 헬멧 + 고글 + 전술 조끼)
    // 무장별로 헬멧/고글/어깨 패드 식별 색상을 달리해 멀티플레이 시인성 극대화
    // ========================================================================
    const soldierF0 = [
      '....OOOOOO....',
      '...OHHHHHHO...',
      '..OHHLLLLHHO..',
      '..OHGGGGGGHO..',
      '..OOFFFFFFOO..',
      '.OOVVVVVVVVOO.',
      '.OVVDDDDDDVVO.',
      '.OOVDDDDDDVOO.',
      '...OOB..BOO...',
      '...OOB..BOO...',
      '...OOO..OOO...',
    ];
    const soldierF1 = [
      '....OOOOOO....',
      '...OHHHHHHO...',
      '..OHHLLLLHHO..',
      '..OHGGGGGGHO..',
      '..OOFFFFFFOO..',
      '.OOVVVVVVVVOO.',
      '.OVVDDDDDDVVO.',
      '..OOB...DDVOO.',
      '..OOO....BOO..',
      '.........OOO..',
      '..............',
    ];

    const loadoutPalettes = {
      // [1] 돌격소총병 (Rifleman) — 올리브 드랍 군복 + 에메랄드 전술 고글
      rifle: {
        O: '#0b0e14',
        H: '#4b6548', // 방탄 헬멧
        L: '#6c8c68', // 헬멧 하이라이트
        G: '#7bed9f', // 야간투시 전술 고글
        F: '#f3c68f', // 피부
        V: '#3b4d38', // 전투복
        D: '#283626', // 방탄조끼
        B: '#1e242b', // 군화
      },
      // [2] 산탄총 브리처 (Shotgun Breacher) — 중장갑 건메탈 + 앰버 바이저
      shotgun: {
        O: '#0b0e14',
        H: '#57606f',
        L: '#747d8c',
        G: '#ffa502',
        F: '#f3c68f',
        V: '#3d4454',
        D: '#2f3542',
        B: '#1e242b',
      },
      // [3] 중기관총 사수 (LMG Heavy Gunner) — 헤비 카키 + 골드 탄띠/고글
      lmg: {
        O: '#0b0e14',
        H: '#5c5338',
        L: '#827651',
        G: '#ffd32a',
        F: '#f3c68f',
        V: '#4a432d',
        D: '#332e1e',
        B: '#1e242b',
      },
      // [4] 대물 저격수 (Recon Sniper) — 네이비 스텔스 + 시안 스코프 고글
      sniper: {
        O: '#0b0e14',
        H: '#2f3e52',
        L: '#485e7a',
        G: '#5ef2ff',
        F: '#f3c68f',
        V: '#243040',
        D: '#19222e',
        B: '#1e242b',
      },
      // [5] 유탄 폭파병 (Demolition Launcher) — 다크 크림슨 EOD 방폭복
      launcher: {
        O: '#0b0e14',
        H: '#5c2d38',
        L: '#824352',
        G: '#ff6b81',
        F: '#f3c68f',
        V: '#47232b',
        D: '#2e161b',
        B: '#1e242b',
      },
      // [6] 아킴보 기관단총 요원 (KRISS Dual SMG) — 바이올렛 특수부대 슈트
      smg: {
        O: '#0b0e14',
        H: '#3d2c5e',
        L: '#5f468c',
        G: '#a29bfe',
        F: '#f3c68f',
        V: '#2d2047',
        D: '#1d142e',
        B: '#1e242b',
      },
    };

    for (const [id, pal] of Object.entries(loadoutPalettes)) {
      this.cache.set(`${id}_0`, buildDotSprite(soldierF0, pal));
      this.cache.set(`${id}_1`, buildDotSprite(soldierF1, pal));
      this.cache.set(`${id}_flash`, buildDotSprite(soldierF0, pal, true));
    }

    // ========================================================================
    // 2. 5대 총기 도트 스프라이트 (돌격소총 / 산탄총 / 중기관총 / 저격총 / 유탄발사기)
    // ========================================================================

    // [1] AR-15 돌격소총 (Assault Rifle)
    const rifleMatrix = [
      '....OOOO.....',
      'OOOOOMMMOOOOO',
      'OBBBBMMMBBBBO',
      '.OO.OMM..OO..',
      '....OO.......',
    ];
    this.cache.set(
      'weapon_rifle',
      buildDotSprite(rifleMatrix, {
        O: '#0b0d12',
        B: '#57606f',
        M: '#7bed9f',
      })
    );

    // [2] M870 전술 산탄총 (Tactical Pump-Action Shotgun)
    const shotgunMatrix = [
      '..OOOOOOOOOOO',
      'OWWWBBBBBBBBO',
      'OWWWBGGGGGBOO',
      '.OO.OOOOOOO..',
    ];
    this.cache.set(
      'weapon_shotgun',
      buildDotSprite(shotgunMatrix, {
        O: '#0b0d12',
        W: '#b87d56', // 우드 개머리판
        B: '#a4b0be', // 대구경 총열
        G: '#ffa502', // 펌프 핸드가드
      })
    );

    // [3] M249 중기관총 (Heavy LMG with Ammo Box)
    const lmgMatrix = [
      '...OOOOOO.....',
      'OOOMMMMMMOOOOO',
      'OBBBBBBBBBBBBO',
      '.OOOGGGGGGOO..',
      '...OGYYYYGO...',
      '....OOOOOO....',
    ];
    this.cache.set(
      'weapon_lmg',
      buildDotSprite(lmgMatrix, {
        O: '#0b0d12',
        B: '#57606f',
        M: '#a4b0be',
        G: '#2ed573', // 대용량 탄통 박스
        Y: '#ffd32a', // 7.62mm 황동 탄띠
      })
    );

    // [4] AWM 대물 저격소총 (Anti-Materiel Sniper with Scope)
    const sniperMatrix = [
      '....OCCCCO......',
      '.....OOOO.......',
      'OOOOOOOOOOOOOOO.',
      'OGGGGGGGGGMMMMMO',
      '.OO..OO.........',
    ];
    this.cache.set(
      'weapon_sniper',
      buildDotSprite(sniperMatrix, {
        O: '#0b0d12',
        G: '#2ed573', // 국방색 바디
        M: '#dfe4ea', // 롱배럴 총열 & 소염기
        C: '#5ef2ff', // 고배율 스코프 렌즈
      })
    );

    // [5] M32 6연발 유탄발사기 (Revolver Grenade Launcher)
    const launcherMatrix = [
      '...OOOOOO....',
      'OOORRRRRROOOO',
      'OBBRYYYYRBBBO',
      'OOORRRRRROOOO',
      '...OO..OO....',
    ];
    this.cache.set(
      'weapon_launcher',
      buildDotSprite(launcherMatrix, {
        O: '#0b0d12',
        B: '#57606f',
        R: '#ff4757', // 6연발 회전 실린더
        Y: '#ffd32a', // 40mm 고폭 유탄 탄두
      })
    );

    // [6] KRISS 아킴보 기관단총 (Dual Vector SMG)
    const smgMatrix = [
      '..OOOOOOOOO.',
      '.OBBBPPBBBBO',
      '.OOBBOOOBOO.',
      '...OO...OO..',
    ];
    this.cache.set(
      'weapon_smg',
      buildDotSprite(smgMatrix, {
        O: '#0b0d12',
        B: '#57606f',
        P: '#a29bfe',
      })
    );

    // ========================================================================
    // 3. 전술 지형지물 3종 (전술 암석 바위 / 강철 샌드백 바리케이드 / 고폭 연료 드럼통)
    // ========================================================================

    // (1) 전술 암석 바위 (High Tactical Crag Rock)
    const rockPalette = {
      O: '#0c0b14',
      D: '#2c2c3a',
      M: '#47475c',
      L: '#686882',
      C: '#82829e',
    };
    const rockMatrix = [
      '.....OOOOOOOO.....',
      '...OOMLLLLLLMOO...',
      '..OMLLLLLLLLLLMO..',
      '.OMLLCCLLLLLLLLMO.',
      '.OMLCCCLLLLMMMMDO.',
      'OMLLLLMMMMMDDDDDDO',
      'OMLLMMMMMDDDDDDDDO',
      'OMMMMMCCDDDDDDDDDO',
      'ODDDDDCCDDDDDDDDDO',
      '.ODDDDDDDDDDDDDDO.',
      '..OODDDDDDDDDDOO..',
      '....OOOOOOOOOO....',
    ];
    this.cache.set('obs_rock', buildDotSprite(rockMatrix, rockPalette));

    // (2) 강철 샌드백 바리케이드 (Sandbag & Steel Barricade — 아군 총알 통과!)
    const barricadePalette = {
      O: '#14120d',
      W: '#9c8867', // 모래주머니(샌드백) 베이스
      L: '#bfb093', // 샌드백 하이라이트
      D: '#6e5e44', // 샌드백 암부
      S: '#57606f', // 강철 보강판
    };
    const barricadeMatrix = [
      '.OOOOOO..OOOOOO.',
      'OWLLLLWOOWLLLLWO',
      'OWDDDDWOOWDDDDWO',
      'OSSSSSSSSSSSSSSO',
      'OWLLWOOWLLWOOWLO',
      'OWDDWOOWDDWOOWDO',
      'OSSSSSSSSSSSSSSO',
      '.OOOOOOOOOOOOOO.',
    ];
    this.cache.set('obs_barricade', buildDotSprite(barricadeMatrix, barricadePalette));
    this.cache.set('obs_barricade_flash', buildDotSprite(barricadeMatrix, barricadePalette, true));

    // (3) 고폭 연료 드럼통 (Explosive Fuel Drum)
    const barrelPalette = {
      O: '#140a0e',
      W: '#b33939',
      L: '#ff5252',
      S: '#2f3542',
      R: '#ffa502',
      Y: '#fff200',
    };
    const barrelMatrix = [
      '....OOSSOO....',
      '..OOOOOOOOOO..',
      '.OSSSSSSSSSSO.',
      '.OWLLLLLLLLWO.',
      '.OWLRRRRRRLWO.',
      '.OWLRYYYYRLWO.',
      '.OSSSSSSSSSSO.',
      '.OWWWWWWWWWWO.',
      '..OOOOOOOOOO..',
    ];
    this.cache.set('obs_barrel', buildDotSprite(barrelMatrix, barrelPalette));
    this.cache.set('obs_barrel_flash', buildDotSprite(barrelMatrix, barrelPalette, true));

    // ========================================================================
    // 4. 감염체 크롤러 (Infected Crawler — 우측 스폰 돌격 몬스터)
    // ========================================================================
    const crawlerPalette = {
      O: '#111a0e',
      G: '#4b8b3b',
      L: '#78b856',
      D: '#2d5723',
      R: '#ff4757',
      A: '#3d4454',
    };
    const crawlerF0 = [
      '..OO......OO..',
      '.OGGOOOOOOGGO.',
      '..OOGLLLLGOO..',
      '.OOGLRLLRLGOO.',
      '.OOGGGGGGGGGO.',
      '.OOAAAAAAAADO.',
      '..OOAAAAAADO..',
      '..OGO....OGO..',
      '..OO......OO..',
    ];
    const crawlerF1 = [
      '..OO......OO..',
      '.OGGOOOOOOGGO.',
      '..OOGLLLLGOO..',
      '.OOGLRLLRLGOO.',
      '.OOGGGGGGGGGO.',
      '.OOAAAAAAAADO.',
      '..OGO....ADO..',
      '..OO......OGO.',
      '..........OO..',
    ];
    this.cache.set('crawler_0', buildDotSprite(crawlerF0, crawlerPalette));
    this.cache.set('crawler_1', buildDotSprite(crawlerF1, crawlerPalette));
    this.cache.set('crawler_flash', buildDotSprite(crawlerF0, crawlerPalette, true));

    // 5. 전술 아스팔트/황무지 바닥 타일
    this.cache.set('alien_tile', this._createTacticalGroundTile());
  }

  _createTacticalGroundTile() {
    const size = 64;
    const c = createCanvas(size, size);
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#13161b';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = '#1a1e26';
    ctx.fillRect(0, 0, size, 1);
    ctx.fillRect(0, 0, 1, size);

    const dots = [
      [10, 14, '#1e242e', 2, 2],
      [30, 8, '#232936', 3, 1],
      [48, 20, '#1b2029', 2, 2],
      [16, 44, '#232936', 3, 2],
      [38, 36, '#171b22', 4, 3],
      [54, 52, '#1e242e', 2, 2],
      [24, 56, '#272e3b', 2, 1],
    ];

    for (const [x, y, color, w, h] of dots) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    }

    return c;
  }

  get(key) {
    return this.cache.get(key);
  }
}
