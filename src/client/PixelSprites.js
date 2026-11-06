// ============================================================================
// [Client] 원형 배틀로얄 (CIRCLE ROYALE) 판타지 도트(Pixel Art) 스프라이트 생성기
// 판타지 전사 6종(궁수·기사·마법사·석궁병·화염술사·암살자) + 판타지 무기 6종 + 지형지물
// ============================================================================

function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function buildDotSprite(rows, palette, flashWhite = false) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');

  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
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
    // 1. 판타지 전사 기본 도트 프레임 (후드/투구 + 빛나는 눈 + 로브/튜닉 + 허리띠)
    // 무기별로 후드/눈빛/로브 색상을 달리해 멀티플레이 시인성 극대화
    // ========================================================================
    const heroF0 = [
      '.....OOOO.....',
      '...OOHHHHOO...',
      '..OHHLLLLHHO..',
      '..OHFFFFFFHO..',
      '..OHFGFFGFHO..',
      '..OOFFFFFFOO..',
      '.OVVVVVVVVVVO.',
      '.OVVDDDDDDVVO.',
      '.OOVVVVVVVVOO.',
      '...OOB..BOO...',
      '...OOO..OOO...',
    ];
    const heroF1 = [
      '.....OOOO.....',
      '...OOHHHHOO...',
      '..OHHLLLLHHO..',
      '..OHFFFFFFHO..',
      '..OHFGFFGFHO..',
      '..OOFFFFFFOO..',
      '.OVVVVVVVVVVO.',
      '.OVVDDDDDDVVO.',
      '..OVVV..VVVOO.',
      '..OOB....BOO..',
      '..OOO....OOO..',
    ];

    const loadoutPalettes = {
      // [1] 엘프 궁수 — 숲의 녹색 후드 + 에메랄드 눈빛
      bow: {
        O: '#0b0e14',
        H: '#2f6b3a', // 녹색 후드
        L: '#4c9a58', // 후드 하이라이트
        G: '#7bed9f', // 에메랄드 눈빛
        F: '#f3d2a8', // 피부
        V: '#3d5a2e', // 레인저 튜닉
        D: '#8a6a3c', // 가죽 허리띠
        B: '#3b2a1a', // 가죽 장화
      },
      // [2] 대검 기사 — 강철 투구 + 앰버 바이저
      sword: {
        O: '#0b0e14',
        H: '#9aa3b0',
        L: '#d0d6de',
        G: '#ffa502',
        F: '#c9ccd2',
        V: '#6b7380',
        D: '#b8862e',
        B: '#2f3542',
      },
      // [3] 비전 마법사 — 남색 고깔 후드 + 황금 룬 눈빛
      tome: {
        O: '#0b0e14',
        H: '#2b3a8c',
        L: '#4a5fc4',
        G: '#ffd32a',
        F: '#f3d2a8',
        V: '#26307a',
        D: '#ffd32a',
        B: '#1a1f3d',
      },
      // [4] 드워프 석궁병 — 갈색 가죽 모자 + 시안 서리 눈빛
      crossbow: {
        O: '#0b0e14',
        H: '#6b4a2b',
        L: '#8f6a43',
        G: '#5ef2ff',
        F: '#e8b98c',
        V: '#4a5a6a',
        D: '#c0c6cf',
        B: '#2b1d12',
      },
      // [5] 화염술사 — 진홍색 로브 + 불꽃 눈빛
      staff: {
        O: '#0b0e14',
        H: '#8c1f2b',
        L: '#c23a48',
        G: '#ffb142',
        F: '#f3d2a8',
        V: '#6e1822',
        D: '#ffb142',
        B: '#2e0f14',
      },
      // [6] 그림자 암살자 — 보라색 복면 + 바이올렛 눈빛
      daggers: {
        O: '#0b0e14',
        H: '#3d2c5e',
        L: '#5f468c',
        G: '#a29bfe',
        F: '#2d2047',
        V: '#2d2047',
        D: '#a29bfe',
        B: '#1d142e',
      },
    };

    for (const [id, pal] of Object.entries(loadoutPalettes)) {
      this.cache.set(`${id}_0`, buildDotSprite(heroF0, pal));
      this.cache.set(`${id}_1`, buildDotSprite(heroF1, pal));
      this.cache.set(`${id}_flash`, buildDotSprite(heroF0, pal, true));
    }

    // ========================================================================
    // 2. 판타지 무기 6종 도트 스프라이트 (조준 방향 = 오른쪽 기준)
    // ========================================================================

    // [1] 엘프 장궁 (Elven Longbow) — 활대 + 시위 + 메긴 화살
    const bowMatrix = [
      '....SWO....',
      '....S.WO...',
      '....S..WO..',
      '....S...WO.',
      '....S...WO.',
      '.FFAAAAAAWH',
      '....S...WO.',
      '....S...WO.',
      '....S..WO..',
      '....S.WO...',
      '....SWO....',
    ];
    this.cache.set(
      'weapon_bow',
      buildDotSprite(bowMatrix, {
        O: '#0b0d12',
        W: '#a0703c', // 나무 활대
        S: '#e8e8e8', // 시위
        A: '#c8a165', // 화살대
        F: '#7bed9f', // 깃털
        H: '#dfe4ea', // 화살촉
      })
    );

    // [2] 기사의 대검 (Knight Greatsword)
    const swordMatrix = [
      '...OGO..........',
      '...OGOOOOOOOOOO.',
      'OHHOGLLLLLLLLLLO',
      'OHHOGMMMMMMMMMMWO',
      '...OGOOOOOOOOOO.',
      '...OGO..........',
    ];
    this.cache.set(
      'weapon_sword',
      buildDotSprite(swordMatrix, {
        O: '#0b0d12',
        H: '#6b4423', // 가죽 손잡이
        G: '#ffa502', // 황금 가드
        L: '#f1f2f6', // 칼날 하이라이트
        M: '#a4b0be', // 칼날
        W: '#ffffff', // 칼끝
      })
    );

    // [3] 비전 마도서 (Arcane Tome) — 펼쳐진 책 + 떠오르는 룬
    const tomeMatrix = [
      '......Y..',
      '.OOOOOOO.',
      'OPPPPPPPO',
      'OPYYPYYPO',
      'OPPPPPPPO',
      'OWWWOWWWO',
      '.OOOOOOO.',
    ];
    this.cache.set(
      'weapon_tome',
      buildDotSprite(tomeMatrix, {
        O: '#0b0d12',
        P: '#3742fa', // 마도서 표지
        Y: '#ffd32a', // 황금 룬
        W: '#f5f0dc', // 책장
      })
    );

    // [4] 드워프 중석궁 (Dwarven Heavy Crossbow)
    const crossbowMatrix = [
      '.......OO....',
      '........OW...',
      '........OW...',
      'OBBBBBBBBWMMC',
      '........OW...',
      '........OW...',
      '.......OO....',
    ];
    this.cache.set(
      'weapon_crossbow',
      buildDotSprite(crossbowMatrix, {
        O: '#0b0d12',
        B: '#7a5230', // 참나무 개머리
        W: '#a4b0be', // 강철 활대
        M: '#dfe4ea', // 볼트
        C: '#5ef2ff', // 룬 볼트촉
      })
    );

    // [5] 화염 지팡이 (Flame Staff) — 긴 나무 지팡이 + 불꽃 보주
    const staffMatrix = [
      '.............OOO.',
      '............ORRRO',
      'OWWWWWWWWWWWORYRO',
      '............ORRRO',
      '.............OOO.',
    ];
    this.cache.set(
      'weapon_staff',
      buildDotSprite(staffMatrix, {
        O: '#0b0d12',
        W: '#8a5a2b', // 나무 지팡이
        R: '#ff4757', // 화염 보주
        Y: '#fff200', // 보주 코어
      })
    );

    // [6] 그림자 쌍단검 (Shadow Twin Daggers)
    const daggersMatrix = [
      'OHHGMMMMLO..',
      '............',
      '..OHHGMMMMLO',
    ];
    this.cache.set(
      'weapon_daggers',
      buildDotSprite(daggersMatrix, {
        O: '#0b0d12',
        H: '#2d2047', // 손잡이
        G: '#a29bfe', // 보랏빛 가드
        M: '#c8d0dc', // 칼날
        L: '#ffffff', // 칼끝
      })
    );

    // ========================================================================
    // 3. 판타지 지형지물 3종 (고대 바위 기둥 / 나무 방책 / 폭발 화약통)
    // ========================================================================

    // (1) 고대 바위 기둥 (Ancient Rock Pillar)
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

    // (2) 나무 방책 (Wooden Palisade — 화살·마법탄을 막는 파괴 가능 엄폐물)
    const barricadePalette = {
      O: '#14100a',
      W: '#8a5a2b', // 통나무 베이스
      L: '#b07a43', // 통나무 하이라이트
      D: '#5e3b1a', // 통나무 암부
      S: '#57606f', // 철제 띠
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

    // (3) 폭발 화약통 (Explosive Powder Keg)
    const barrelPalette = {
      O: '#140a0e',
      W: '#7a4a24',
      L: '#a86a38',
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
