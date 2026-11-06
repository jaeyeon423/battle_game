// ============================================================================
// [Engine] 원형 배틀로얄: 랜덤 무기 서바이벌 (CIRCLE ROYALE) 시뮬레이션 코어
// - 원형 경기장 물리 & 자기장(Safe Zone) 축소 시스템
// - 라운드 시작 시 랜덤박스 무기 추첨(ROULETTE) -> 최후의 1인 서바이벌(COMBAT) -> 우승자 발표(ROUND_OVER)
// ============================================================================

import {
  WORLD_CONFIG,
  WEAPON_LOADOUTS,
  WEAPON_KEYS,
  resolveWeaponSpec,
  OBSTACLE_TYPES,
} from '../shared/constants.js';
import { clamp, distSq, createSeededRandom } from '../shared/math.js';

const BOT_CALLSIGNS = [
  'ARWEN-02',
  'RAGNAR-03',
  'MERLIN-04',
  'THORIN-05',
  'MORGANA-06',
  'IGNIS-07',
  'SHADE-08',
  'LYRA-09',
];

export class WorldSimulation {
  constructor(seed = 20261106) {
    this.seed = seed;
    this.rng = createSeededRandom(seed);
    this.tick = 0;
    this.time = 0;

    // 원형 경기장 & 라운드 상태
    this.round = 1;
    this.roundState = 'roulette'; // 'roulette' | 'combat' | 'round_over'
    this.stateTimer = WORLD_CONFIG.ROULETTE_DURATION;
    this.roundTime = 0;

    this.centerX = WORLD_CONFIG.CENTER_X;
    this.centerY = WORLD_CONFIG.CENTER_Y;
    this.arenaRadius = WORLD_CONFIG.ARENA_RADIUS;
    this.safeRadius = WORLD_CONFIG.ARENA_RADIUS;

    // 참가자(유저 + AI 서바이벌 봇): Map<playerId, FighterState>
    this.players = new Map();
    this.inputs = new Map();

    this.obstacles = [];
    this.bullets = [];
    this.enemies = []; // 하위 호환용 빈 배열 유지
    this.events = [];
    this.killFeed = [];

    this.winner = null;
    this.nextEntityId = 1;
    this.botsEnabled = true;
    this.swarmEnabled = true;
    this.partyEnabled = true;

    // 멀티플레이 방 & 방장(Host) 관리 상태
    this.hostId = null;
    this.roomName = '원형 결투장';
    this.maxPlayers = 4;
    this.botFillMode = 'auto'; // 'auto': 1명일 때만 봇 1명, 2명 이상이면 유저끼리만 | 'on': 빈자리 봇 채움 | 'off': 봇 없음
    this.returnToWaitingAfterRound = false;

    this._initCircularArenaObstacles();
  }

  /**
   * 원형 경기장 내부에 대칭형 전술 지형지물(암석 기둥, 샌드백 엄폐물, 폭발 드럼통)을 배치합니다.
   */
  _initCircularArenaObstacles() {
    this.obstacles = [];
    const cx = this.centerX;
    const cy = this.centerY;

    // 1. 중앙 코어 4방향 암석 기둥 (반지름 170px 링)
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2 + Math.PI / 4;
      this.spawnObstacle('rock', cx + Math.cos(ang) * 175, cy + Math.sin(ang) * 175);
    }

    // 2. 중앙 정가운데 고폭 드럼통 클러스터 & 샌드백 바리케이드
    this.spawnObstacle('barrel', cx, cy);
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2;
      this.spawnObstacle('barricade', cx + Math.cos(ang) * 115, cy + Math.sin(ang) * 115);
    }

    // 3. 중거리 교전 링 (반지름 340px): 암석 기둥 6개 + 폭발 드럼통 6개 + 샌드백 6개
    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI * 2) / 6;
      this.spawnObstacle('rock', cx + Math.cos(ang) * 345, cy + Math.sin(ang) * 345);

      const barrelAng = ang + Math.PI / 6;
      this.spawnObstacle('barrel', cx + Math.cos(barrelAng) * 310, cy + Math.sin(barrelAng) * 310);
      this.spawnObstacle('barricade', cx + Math.cos(barrelAng) * 405, cy + Math.sin(barrelAng) * 405);
    }
  }

  spawnObstacle(typeId, x, y) {
    const spec = OBSTACLE_TYPES[typeId];
    if (!spec) return null;
    const obs = {
      id: `obs_${this.nextEntityId++}`,
      type: spec.id,
      name: spec.name,
      x: Math.round(x),
      y: Math.round(y),
      radius: spec.radius,
      hp: spec.hp || 9999,
      maxHp: spec.hp || 9999,
      destructible: Boolean(spec.destructible),
      explosive: Boolean(spec.explosive),
      explosionRadius: spec.explosionRadius || 0,
      explosionDamage: spec.explosionDamage || 0,
      blocksMovement: Boolean(spec.blocksMovement),
      blocksPlayerBullets: Boolean(spec.blocksPlayerBullets),
      hitFlash: 0,
    };
    this.obstacles.push(obs);
    return obs;
  }

  _pickRandomWeaponId(excludeId = null) {
    const pool = excludeId
      ? WEAPON_KEYS.filter((k) => k !== excludeId)
      : WEAPON_KEYS;
    const idx = Math.floor(this.rng() * pool.length);
    return pool[idx] || 'bow';
  }

  addPlayer(playerId, preferredClass = '', name = 'PLAYER-01', isBot = false) {
    const randomWeaponId =
      preferredClass && WEAPON_LOADOUTS[preferredClass]
        ? preferredClass
        : this._pickRandomWeaponId();
    const spec = resolveWeaponSpec(randomWeaponId);

    const idx = this.players.size;
    const spawnAngle = (idx * Math.PI * 2) / WORLD_CONFIG.TOTAL_FIGHTERS;
    const spawnDist = 490;
    const startX = this.centerX + Math.cos(spawnAngle) * spawnDist;
    const startY = this.centerY + Math.sin(spawnAngle) * spawnDist;

    const player = {
      id: playerId,
      name,
      isBot,
      alive: true,
      classId: spec.id,
      className: spec.name,
      tier: spec.tier,
      tierColor: spec.tierColor,
      icon: spec.icon,
      role: spec.role,
      ammoLabel: spec.ammoLabel,
      reloadLabel: spec.reloadLabel,
      x: startX,
      y: startY,
      vx: 0,
      vy: 0,
      aimAngle: spawnAngle + Math.PI, // 경기장 중앙을 바라보도록 정렬
      isFiring: false,
      hp: spec.hp,
      maxHp: spec.hp,
      damageReduction: spec.damageReduction,
      speed: spec.speed,
      radius: spec.radius,
      ammo: spec.maxAmmo,
      maxAmmo: spec.maxAmmo,
      isReloading: false,
      reloadTimer: 0,
      reloadDuration: spec.reloadTime,
      fireCooldown: 0,
      skill1Cooldown: 0,
      skill1MaxCd: spec.skill1.cooldown,
      skill1Name: spec.skill1.name,
      skill2Cooldown: 0,
      skill2MaxCd: spec.skill2.cooldown,
      skill2Name: spec.skill2.name,
      dashTimer: 0,
      dashDirX: 1,
      dashDirY: 0,
      guardBuffTimer: 0,
      invulnTimer: 0,
      swingVisualTimer: 0,
      swingDuration: 0.28,
      swingDir: 1,
      whirlwindTimer: 0,
      stormTickTimer: 0,
      boxRollSeq: 1, // 랜덤박스 추첨 시퀀스 번호 (클라이언트 룰렛 연출 트리거용)
      isMelee: Boolean(spec.isMelee),
      meleeRange: spec.meleeRange || 0,
      slowTimer: 0,
      slowRate: 0,
      burnTimer: 0,
      burnDamage: 0,
      burnTickTimer: 0,
      burnAttackerId: null,
      bowCharge: 0,
      isCharging: false,
      bowOverhold: 0,
      aiBowCharging: false,
      aiBowTimer: 0,
      kills: 0,
      wins: 0,
      deaths: 0,
      level: 1,
      xp: 0,
      nextXp: 10,
      walkCycle: 0,
      aiStrafeDir: this.rng() > 0.5 ? 1 : -1,
      aiStrafeTimer: 1.5,
      pendingAttack: false,
      isHost: false,
      ready: true,
      preferredClass: !isBot && preferredClass && WEAPON_LOADOUTS[preferredClass] ? preferredClass : '',
    };

    this.players.set(playerId, player);
    this.inputs.set(playerId, {
      moveX: 0,
      moveY: 0,
      aimAngle: player.aimAngle,
      firePressed: false,
      isFiring: false,
      reloadPressed: false,
      skill1Pressed: false,
      skill2Pressed: false,
    });

    if (!isBot) {
      this._ensureHost();
      this._syncArenaBots();
      if (this.roundState === 'waiting' || this.roundState === 'roulette') {
        this._positionAllFightersInCircle();
      }
    }

    return player;
  }

  /**
   * 방 안에 실제 유저 중 방장(hostId)을 지정하고, 방장이 나가면 다음 유저에게 방장을 위임합니다.
   */
  _ensureHost() {
    const currentHost = this.hostId ? this.players.get(this.hostId) : null;
    if (!currentHost || currentHost.isBot) {
      this.hostId = null;
      for (const p of this.players.values()) {
        if (!p.isBot) {
          this.hostId = p.id;
          break;
        }
      }
    }
    for (const p of this.players.values()) {
      p.isHost = !p.isBot && p.id === this.hostId;
      if (p.isHost) p.ready = true;
    }
  }

  /**
   * 참가 인원이 총 8명이 되도록 AI 생존자들을 자동으로 채우거나 제거합니다.
   */
  _syncArenaBots() {
    const humanCount = Array.from(this.players.values()).filter((p) => !p.isBot).length;
    if (!this.botsEnabled || this.botFillMode === 'off' || humanCount === 0) {
      for (const [id, p] of this.players.entries()) {
        if (p.isBot) {
          this.players.delete(id);
          this.inputs.delete(id);
        }
      }
      return;
    }

    let targetBotCount = 0;
    if (this.botFillMode === 'on') {
      targetBotCount = Math.max(1, Math.min(7, (this.maxPlayers || WORLD_CONFIG.TOTAL_FIGHTERS) - humanCount));
    } else {
      // 'auto' 모드: 유저가 1명일 때만 연습용 AI 봇 1명 추가, 실제 유저가 2명 이상 모이면 AI 봇 없이 유저끼리만 대결!
      targetBotCount = humanCount === 1 ? 1 : 0;
    }

    const currentBots = Array.from(this.players.values()).filter((p) => p.isBot);

    if (currentBots.length > targetBotCount) {
      for (let i = targetBotCount; i < currentBots.length; i++) {
        this.players.delete(currentBots[i].id);
        this.inputs.delete(currentBots[i].id);
      }
    } else if (currentBots.length < targetBotCount) {
      for (let i = currentBots.length; i < targetBotCount; i++) {
        const botId = `bot_royale_${i + 1}`;
        const callsign = BOT_CALLSIGNS[i % BOT_CALLSIGNS.length];
        if (!this.players.has(botId)) {
          this.addPlayer(botId, '', callsign, true);
        }
      }
    }
  }

  _positionAllFightersInCircle() {
    const list = Array.from(this.players.values());
    const count = Math.max(1, list.length);
    const spawnDist = 490;

    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const ang = (i * Math.PI * 2) / count;
      p.x = this.centerX + Math.cos(ang) * spawnDist;
      p.y = this.centerY + Math.sin(ang) * spawnDist;
      p.aimAngle = ang + Math.PI;
    }
  }

  /**
   * 대기실(Waiting Room) 상태로 전환합니다. 방장이 게임을 시작하기 전까지 대기합니다.
   */
  enterWaitingRoom() {
    this.roundState = 'waiting';
    this.stateTimer = 0;
    this.roundTime = 0;
    this.safeRadius = WORLD_CONFIG.ARENA_RADIUS;
    this.safeDelayLeft = WORLD_CONFIG.SAFE_START_DELAY;
    this.isSafeShrinking = false;
    this.winner = null;
    this.bullets = [];

    this._initCircularArenaObstacles();
    this._ensureHost();
    this._syncArenaBots();
    this._positionAllFightersInCircle();

    for (const p of this.players.values()) {
      p.alive = true;
      p.hp = p.maxHp;
      p.ammo = p.maxAmmo;
      p.isReloading = false;
      p.slowTimer = 0;
      p.burnTimer = 0;
    }
  }

  /**
   * 방장(Host)이 게임을 시작합니다.
   */
  hostStartGame(requesterId = null) {
    this._ensureHost();
    if (requesterId && this.hostId && requesterId !== this.hostId) {
      return false;
    }
    this.startNewRound();
    return true;
  }

  /**
   * 새로운 배틀로얄 라운드를 시작하고, 전원에게 선택한 직업 또는 랜덤박스 무기를 추첨하여 지급합니다!
   */
  startNewRound() {
    this.round++;
    this.roundState = 'roulette';
    this.stateTimer = WORLD_CONFIG.ROULETTE_DURATION;
    this.roundTime = 0;
    this.safeRadius = WORLD_CONFIG.ARENA_RADIUS;
    this.safeDelayLeft = WORLD_CONFIG.SAFE_START_DELAY;
    this.isSafeShrinking = false;
    this.winner = null;
    this.bullets = [];

    this._initCircularArenaObstacles();
    this._ensureHost();
    this._syncArenaBots();
    this._positionAllFightersInCircle();

    for (const p of this.players.values()) {
      const chosenWeaponId =
        !p.isBot && p.preferredClass && WEAPON_LOADOUTS[p.preferredClass]
          ? p.preferredClass
          : this._pickRandomWeaponId();
      this._applyWeaponToPlayer(p, chosenWeaponId, true);
      p.alive = true;
      p.kills = 0;
      p.boxRollSeq = (p.boxRollSeq || 1) + 1;
    }

    this.events.push({
      type: 'round_roulette',
      round: this.round,
      x: this.centerX,
      y: this.centerY,
    });
  }

  /**
   * 특정 플레이어의 랜덤박스를 즉시 다시 굴려 무작위 무기를 새로 지급합니다.
   */
  rollRandomWeapon(playerId) {
    const p = this.players.get(playerId);
    if (!p) return null;
    const nextWeapon = this._pickRandomWeaponId(p.classId);
    this._applyWeaponToPlayer(p, nextWeapon, true);
    p.alive = true;
    p.boxRollSeq = (p.boxRollSeq || 1) + 1;

    this.events.push({
      type: 'random_box_open',
      playerId: p.id,
      classId: p.classId,
      className: p.className,
      icon: p.icon,
      x: p.x,
      y: p.y,
    });
    return p;
  }

  setPlayerName(playerId, newName) {
    const p = this.players.get(playerId);
    const clean = String(newName || '').trim().slice(0, 12);
    if (!p || !clean) return null;
    p.name = clean;
    this.events.push({
      type: 'name_change',
      playerId: p.id,
      name: clean,
      x: p.x,
      y: p.y,
    });
    return p;
  }

  switchPlayerClass(playerId, newClassId) {
    const p = this.players.get(playerId);
    if (!p) return null;
    if (newClassId === 'random' || !WEAPON_LOADOUTS[newClassId]) {
      p.preferredClass = '';
      return this.rollRandomWeapon(playerId);
    }
    p.preferredClass = newClassId;
    this._applyWeaponToPlayer(p, newClassId, true);
    this.events.push({
      type: 'class_switch',
      playerId: p.id,
      classId: p.classId,
      className: p.className,
      x: p.x,
      y: p.y,
    });
    return p;
  }

  _applyWeaponToPlayer(p, weaponId, fullHeal = true) {
    const spec = resolveWeaponSpec(weaponId);
    p.classId = spec.id;
    p.className = spec.name;
    p.tier = spec.tier;
    p.tierColor = spec.tierColor;
    p.icon = spec.icon;
    p.role = spec.role;
    p.ammoLabel = spec.ammoLabel;
    p.reloadLabel = spec.reloadLabel;
    p.maxHp = spec.hp;
    if (fullHeal || p.hp <= 0) {
      p.hp = spec.hp;
    } else {
      p.hp = Math.min(p.hp, spec.hp);
    }
    p.damageReduction = spec.damageReduction;
    p.speed = spec.speed;
    p.radius = spec.radius;
    p.maxAmmo = spec.maxAmmo;
    p.ammo = spec.maxAmmo;
    p.isReloading = false;
    p.reloadTimer = 0;
    p.reloadDuration = spec.reloadTime;
    p.fireCooldown = 0;
    p.pendingAttack = false;
    p.skill1Cooldown = 0;
    p.skill1MaxCd = spec.skill1.cooldown;
    p.skill1Name = spec.skill1.name;
    p.skill2Cooldown = 0;
    p.skill2MaxCd = spec.skill2.cooldown;
    p.skill2Name = spec.skill2.name;
    p.dashTimer = 0;
    p.guardBuffTimer = 0;
    p.swingVisualTimer = 0;
    p.swingDuration = 0.28;
    p.swingDir = 1;
    p.whirlwindTimer = 0;
    p.isMelee = Boolean(spec.isMelee);
    p.meleeRange = spec.meleeRange || 0;
    p.slowTimer = 0;
    p.slowRate = 0;
    p.burnTimer = 0;
    p.burnDamage = 0;
    p.burnTickTimer = 0;
    p.burnAttackerId = null;
    p.bowCharge = 0;
    p.isCharging = false;
    p.bowOverhold = 0;
    p.aiBowCharging = false;
    p.aiBowTimer = 0;
  }

  setPartyMode(enabled) {
    this.botsEnabled = Boolean(enabled);
    this.partyEnabled = this.botsEnabled;
    this._syncArenaBots();
    return this.botsEnabled;
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    this.inputs.delete(playerId);
    this._ensureHost();
    this._syncArenaBots();
  }

  applyInput(playerId, inputCmd) {
    const prev = this.inputs.get(playerId);
    if (!prev) return;

    const s1 = Boolean(inputCmd.skill1Pressed || inputCmd.dashPressed);
    const s2 = Boolean(inputCmd.skill2Pressed);

    this.inputs.set(playerId, {
      moveX: clamp(Number(inputCmd.moveX) || 0, -1, 1),
      moveY: clamp(Number(inputCmd.moveY) || 0, -1, 1),
      aimAngle: typeof inputCmd.aimAngle === 'number' ? inputCmd.aimAngle : prev.aimAngle,
      firePressed: prev.firePressed || Boolean(inputCmd.firePressed || inputCmd.attackPressed),
      isFiring: Boolean(inputCmd.isFiring),
      reloadPressed: prev.reloadPressed || Boolean(inputCmd.reloadPressed),
      skill1Pressed: prev.skill1Pressed || s1,
      skill2Pressed: prev.skill2Pressed || s2,
    });
  }

  step(dt) {
    this.tick++;
    this.time += dt;
    this.events = [];

    for (let i = 0; i < this.obstacles.length; i++) {
      if (this.obstacles[i].hitFlash > 0) {
        this.obstacles[i].hitFlash = Math.max(0, this.obstacles[i].hitFlash - dt);
      }
    }

    // ========================================================================
    // 1. 라운드 페이즈 관리 (WAITING -> ROULETTE -> COMBAT -> ROUND_OVER)
    // ========================================================================
    if (this.roundState === 'waiting') {
      // 대기실 상태: 방장이 게임을 시작하기 전까지 플레이어들은 안전하게 이동/방향 전환 가능
      for (const [playerId, p] of this.players.entries()) {
        if (p.isBot) continue;
        const inp = this.inputs.get(playerId);
        if (inp) {
          p.aimAngle = inp.aimAngle;
          let mx = inp.moveX || 0;
          let my = inp.moveY || 0;
          const len = Math.hypot(mx, my);
          if (len > 1) {
            mx /= len;
            my /= len;
          }
          p.vx = mx * p.speed;
          p.vy = my * p.speed;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (len > 0.05) p.walkCycle += dt * 10;
          else p.walkCycle = 0;
          this._clampInsideCircularArena(p);
          this._resolveObstacleCollision(p);
          inp.firePressed = false;
          inp.reloadPressed = false;
          inp.skill1Pressed = false;
          inp.skill2Pressed = false;
        }
      }
      return;
    }

    if (this.roundState === 'roulette') {
      this.stateTimer -= dt;
      // 룰렛 추첨 중에도 조준 방향은 회전 가능하도록 허용
      for (const [playerId, p] of this.players.entries()) {
        const inp = this.inputs.get(playerId);
        if (inp) {
          p.aimAngle = inp.aimAngle;
          inp.firePressed = false;
          inp.reloadPressed = false;
          inp.skill1Pressed = false;
          inp.skill2Pressed = false;
        }
      }
      if (this.stateTimer <= 0) {
        this.roundState = 'combat';
        this.stateTimer = 0;
        this.events.push({
          type: 'round_fight',
          round: this.round,
          x: this.centerX,
          y: this.centerY,
        });
      }
      return;
    }

    if (this.roundState === 'round_over') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        if (this.returnToWaitingAfterRound) {
          this.enterWaitingRoom();
        } else {
          this.startNewRound();
        }
      }
      return;
    }

    // ========================================================================
    // 2. COMBAT 페이즈: 자기장 축소, AI 서바이벌 전투, 무기 공격 & 스킬 판정
    // ========================================================================
    this.roundTime += dt;

    const safeDelay = WORLD_CONFIG.SAFE_START_DELAY || 16.0;
    this.safeDelayLeft = Math.max(0, safeDelay - this.roundTime);
    this.isSafeShrinking = this.roundTime >= safeDelay;

    if (this.swarmEnabled && this.isSafeShrinking && this.safeRadius > WORLD_CONFIG.MIN_SAFE_RADIUS) {
      this.safeRadius = Math.max(
        WORLD_CONFIG.MIN_SAFE_RADIUS,
        this.safeRadius - WORLD_CONFIG.SAFE_SHRINK_RATE * dt
      );
    }

    if (this.botsEnabled) {
      this._updateBotInputs(dt);
    }

    for (const [playerId, player] of this.players.entries()) {
      const input = this.inputs.get(playerId);
      if (!input) continue;

      if (player.alive) {
        this._updatePlayer(player, input, dt);
      }
      input.firePressed = false;
      input.reloadPressed = false;
      input.skill1Pressed = false;
      input.skill2Pressed = false;
    }

    this._updateBullets(dt);
    this._cleanupObstaclesAndCheckWinner();
  }

  /**
   * AI 생존자들의 배틀로얄 전투 인공지능:
   * - 자기장(Safe Zone) 밖이면 원형 경기장 중앙으로 진입
   * - 가장 가까운 다른 생존자(유저 또는 다른 AI)를 조준·추격·사격 및 스킬 사용
   */
  _updateBotInputs(dt) {
    const living = Array.from(this.players.values()).filter((p) => p.alive);

    for (const bot of living) {
      if (!bot.isBot) continue;

      bot.aiStrafeTimer -= dt;
      if (bot.aiStrafeTimer <= 0) {
        bot.aiStrafeTimer = 1.2 + this.rng() * 1.5;
        bot.aiStrafeDir = this.rng() > 0.5 ? 1 : -1;
      }

      let nearestTarget = null;
      let minD2 = Infinity;
      for (const other of living) {
        if (other.id === bot.id) continue;
        const d2 = distSq(bot.x, bot.y, other.x, other.y);
        if (d2 < minD2) {
          minD2 = d2;
          nearestTarget = other;
        }
      }

      let moveX = 0;
      let moveY = 0;
      let aimAngle = bot.aimAngle;
      let isFiring = false;
      let skill1Pressed = false;
      let skill2Pressed = false;

      const distFromCenter = Math.hypot(bot.x - this.centerX, bot.y - this.centerY);
      const spec = resolveWeaponSpec(bot.classId);

      if (nearestTarget) {
        const dist = Math.sqrt(minD2);
        aimAngle = Math.atan2(nearestTarget.y - bot.y, nearestTarget.x - bot.x);

        const isWarrior = Boolean(spec.isMelee || spec.id === 'warrior' || spec.id === 'sword' || spec.id === 'daggers');
        const isArcher = Boolean(spec.id === 'archer' || spec.id === 'bow' || spec.id === 'crossbow');
        const idealDist = isWarrior ? 65 : (isArcher ? 490 : 380);

        // 목표와의 거리 조절 + 좌우 무빙(Strafe)
        const dirToEnemyX = Math.cos(aimAngle);
        const dirToEnemyY = Math.sin(aimAngle);
        const perpX = -dirToEnemyY * bot.aiStrafeDir;
        const perpY = dirToEnemyX * bot.aiStrafeDir;

        if (dist > idealDist + 50) {
          moveX = dirToEnemyX * 0.8 + perpX * 0.45;
          moveY = dirToEnemyY * 0.8 + perpY * 0.45;
        } else if (dist < idealDist - 45) {
          moveX = -dirToEnemyX * 0.75 + perpX * 0.55;
          moveY = -dirToEnemyY * 0.75 + perpY * 0.55;
        } else {
          moveX = perpX * 0.85;
          moveY = perpY * 0.85;
        }

        // 엄폐물 우회 조향
        for (let i = 0; i < this.obstacles.length; i++) {
          const obs = this.obstacles[i];
          if (obs.hp <= 0) continue;
          const odx = obs.x - bot.x;
          const ody = obs.y - bot.y;
          const odist = Math.hypot(odx, ody);
          if (odist < bot.radius + obs.radius + 26) {
            moveX -= (odx / (odist || 1)) * 1.1;
            moveY -= (ody / (odist || 1)) * 1.1;
          }
        }

        if (isWarrior) {
          // 전사 봇: 초근접 시 베기, 중거리 시 돌진기, 초근접 시 회전참격
          if (dist <= (spec.meleeRange || 100)) {
            isFiring = true;
          }
          if (dist > 130 && dist < 320 && bot.skill1Cooldown <= 0 && this.rng() < 0.18) {
            skill1Pressed = true; // 맹렬한 돌격!
          }
          if (dist <= 135 && bot.skill2Cooldown <= 0 && this.rng() < 0.14) {
            skill2Pressed = true; // 회전 참격!
          }
        } else if (isArcher) {
          // 궁수 봇: 1발 저격, 접근 시 도약 탈출
          if (dist <= 820 && bot.ammo >= 1 && bot.fireCooldown <= 0 && !bot.isReloading) {
            isFiring = true;
          }
          if (dist < 220 && bot.skill1Cooldown <= 0 && this.rng() < 0.18) {
            skill1Pressed = true; // 바람걸음 도약 & 자동 장전
          }
          if (dist < 400 && bot.skill2Cooldown <= 0 && this.rng() < 0.1) {
            skill2Pressed = true; // 폭발 화살
          }
        } else {
          // 마법사 봇: 원거리 마법탄으로 둔화/화상 지속 부여, 근접 시 서리 점멸
          bot.aiAttackCooldown = (bot.aiAttackCooldown || 0) - dt;
          if (dist <= (spec.bulletRange || 620) && bot.aiAttackCooldown <= 0) {
            isFiring = true;
            bot.aiAttackCooldown = spec.fireInterval + 0.15;
          }
          if (dist < 190 && bot.skill1Cooldown <= 0 && this.rng() < 0.18) {
            skill1Pressed = true; // 서리 점멸 (빙결 둔화)
          }
          if (dist < 320 && bot.skill2Cooldown <= 0 && this.rng() < 0.1) {
            skill2Pressed = true; // 메테오 소환
          }
        }
      }

      // 자기장 경계 근처면 최우선으로 안전지대(원형 중심) 쪽으로 이동!
      if (distFromCenter > this.safeRadius - 42) {
        const toCenterAng = Math.atan2(this.centerY - bot.y, this.centerX - bot.x);
        moveX = Math.cos(toCenterAng);
        moveY = Math.sin(toCenterAng);
      }

      this.applyInput(bot.id, {
        moveX,
        moveY,
        aimAngle,
        isFiring,
        skill1Pressed,
        skill2Pressed,
      });
    }
  }

  /**
   * 플레이어의 탭 공격(Auto-Aim)을 위해 가장 가까운 적(또는 파괴 가능한 장애물)의 각도를 탐색합니다.
   */
  _findNearestEnemyAngleForPlayer(p) {
    let nearestTarget = null;
    let minD2 = Infinity;

    // 1. 살아있는 다른 플레이어 우선 탐색
    for (const other of this.players.values()) {
      if (!other.alive || other.id === p.id) continue;
      const d2 = distSq(p.x, p.y, other.x, other.y);
      if (d2 < minD2) {
        minD2 = d2;
        nearestTarget = other;
      }
    }

    if (nearestTarget) {
      return Math.atan2(nearestTarget.y - p.y, nearestTarget.x - p.x);
    }

    // 2. 적 플레이어가 없으면 파괴 가능한 장애물 탐색
    if (this.obstacles && this.obstacles.length > 0) {
      for (const obs of this.obstacles) {
        if (obs.hp <= 0 || !obs.destructible) continue;
        const d2 = distSq(p.x, p.y, obs.x, obs.y);
        if (d2 < minD2) {
          minD2 = d2;
          nearestTarget = obs;
        }
      }
      if (nearestTarget) {
        return Math.atan2(nearestTarget.y - p.y, nearestTarget.x - p.x);
      }
    }

    return null;
  }

  _updatePlayer(p, input, dt) {
    const spec = resolveWeaponSpec(p.classId);

    // [원탭 자동 조준 공격] 유저가 공격 버튼을 1회 누를 때 가장 가까운 적을 향해 자동 조준
    if (input.firePressed && !p.isBot) {
      const autoAngle = this._findNearestEnemyAngleForPlayer(p);
      if (typeof autoAngle === 'number' && !Number.isNaN(autoAngle)) {
        p.aimAngle = autoAngle;
      } else {
        p.aimAngle = input.aimAngle;
      }
    } else {
      p.aimAngle = input.aimAngle;
    }
    p.isFiring = input.isFiring;

    if (p.fireCooldown > 0) p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    if (p.skill1Cooldown > 0) p.skill1Cooldown = Math.max(0, p.skill1Cooldown - dt);
    if (p.skill2Cooldown > 0) p.skill2Cooldown = Math.max(0, p.skill2Cooldown - dt);
    if (p.guardBuffTimer > 0) p.guardBuffTimer = Math.max(0, p.guardBuffTimer - dt);
    if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    if (p.swingVisualTimer > 0) p.swingVisualTimer = Math.max(0, p.swingVisualTimer - dt);
    if (p.whirlwindTimer > 0) p.whirlwindTimer = Math.max(0, p.whirlwindTimer - dt);

    // 쿨다운 종료 직전(<=0.20초) 탭 연타 시 씹힘 방지 버퍼링
    if (input.firePressed && !p.isBot) {
      if (p.fireCooldown > 0 && p.fireCooldown <= 0.20 && !p.isReloading) {
        p.pendingAttack = true;
      }
    }

    // 공격 의사 판정: 유저는 버튼을 누를 때마다(firePressed) 또는 버퍼링된 1회 탭(pendingAttack)에 의해 격발되며,
    // 버튼을 꾹 누르고 있어도 연속 자동 발사되지 않습니다. (AI 봇은 isFiring 상태로 공격)
    const wantAttack = (!p.isBot ? (input.firePressed || (p.pendingAttack && p.fireCooldown <= 0)) : input.isFiring);

    // ========================================================================
    // [⚡ 무기별 기동 스킬 1 발동] (Shift / Space / 스킬 1 버튼)
    // ========================================================================
    if (input.skill1Pressed && p.skill1Cooldown <= 0 && p.dashTimer <= 0) {
      p.skill1Cooldown = spec.skill1.cooldown;

      const moveLen = Math.hypot(input.moveX, input.moveY);
      const dirX = moveLen > 0.1 ? input.moveX / moveLen : Math.cos(p.aimAngle);
      const dirY = moveLen > 0.1 ? input.moveY / moveLen : Math.sin(p.aimAngle);

      if (spec.id === 'warrior' || spec.id === 'sword' || spec.id === 'daggers' || spec.isMelee) {
        // [전사] 맹렬한 돌격: 고속 쇄도 + 기력 완충 + 2.5초간 방어 50% 추가
        p.dashTimer = spec.skill1.duration || 0.28;
        p.dashDirX = dirX;
        p.dashDirY = dirY;
        p.guardBuffTimer = 2.5;
        p.invulnTimer = (spec.skill1.duration || 0.28) + 0.15;
        p.ammo = p.maxAmmo;
        p.isReloading = false;
        this.events.push({
          type: 'skill_cast',
          skillId: 'charge_slash',
          label: '🛡️ 맹렬한 돌격!',
          color: '#ffa502',
          x: p.x,
          y: p.y,
        });
      } else if (spec.id === 'archer' || spec.id === 'bow' || spec.id === 'crossbow') {
        // [궁수] 바람걸음 도약: 후방 도약 + 화살 1발 즉시 자동 장전
        const blinkDist = spec.skill1.blinkDist || 125;
        const backX = moveLen > 0.1 ? dirX : -Math.cos(p.aimAngle);
        const backY = moveLen > 0.1 ? dirY : -Math.sin(p.aimAngle);
        p.x += backX * blinkDist;
        p.y += backY * blinkDist;
        this._clampInsideCircularArena(p);
        this._resolveObstacleCollision(p);
        p.invulnTimer = 0.35;
        p.ammo = 1;
        p.isReloading = false;
        p.reloadTimer = 0;
        this.events.push({
          type: 'skill_cast',
          skillId: 'wind_leap',
          label: '🏹 바람걸음 도약 (화살 즉시 장전)!',
          color: '#7bed9f',
          x: p.x,
          y: p.y,
        });
      } else {
        // [마법사] 서리 점멸: 120px 순간이동 + 출발지 서리 폭발 (반경 130px 적 1.5초 70% 빙결 둔화)
        const oldX = p.x;
        const oldY = p.y;
        const blinkDist = spec.skill1.blinkDist || 120;
        p.x += dirX * blinkDist;
        p.y += dirY * blinkDist;
        this._clampInsideCircularArena(p);
        this._resolveObstacleCollision(p);
        p.invulnTimer = 0.35;

        // 출발지 적에게 빙결 둔화 디버프 부여
        const novaR = spec.skill1.novaRadius || 130;
        const novaR2 = novaR * novaR;
        for (const target of this.players.values()) {
          if (!target.alive || target.id === p.id) continue;
          if (distSq(oldX, oldY, target.x, target.y) <= novaR2) {
            target.slowTimer = 1.5;
            target.slowRate = 0.70; // 70% 강력 빙결
            this._applyDamageToFighter(target, spec.skill1.damage || 35, p.id, '서리 폭발');
          }
        }
        this.events.push({
          type: 'nova',
          skillId: 'frost_blink',
          label: '❄️ 서리 점멸 (빙결 70% 둔화)!',
          color: '#5ef2ff',
          x: oldX,
          y: oldY,
          radius: novaR,
        });
      }
    }

    // ========================================================================
    // [💥 무기별 필살 스킬 2 발동] (E키 / Q키 / 스킬 2 버튼)
    // ========================================================================
    if (input.skill2Pressed && p.skill2Cooldown <= 0) {
      p.skill2Cooldown = spec.skill2.cooldown;

      if (spec.id === 'warrior' || spec.id === 'sword' || spec.id === 'daggers' || spec.isMelee) {
        // [전사] 회전 참격: 반경 135px 360° 대검 회전 베기 (피해 95, 모든 투사체 소멸)
        p.whirlwindTimer = 0.42;
        p.swingVisualTimer = 0.42;
        p.swingDuration = 0.42;
        const radius = spec.skill2.radius || 135;
        const damage = spec.skill2.damage || 95;
        this._triggerFighterNova(p, p.x, p.y, radius, damage);

        // 주변 적 투사체 전원 소멸
        for (let k = this.bullets.length - 1; k >= 0; k--) {
          const b = this.bullets[k];
          if (b.ownerId !== p.id && distSq(p.x, p.y, b.x, b.y) <= (radius + 20) * (radius + 20)) {
            b.parried = true;
          }
        }
        this.events.push({
          type: 'nova',
          skillId: 'whirlwind',
          label: '⚔️ 회전 참격 (반경 135px)!',
          color: '#ffa502',
          x: p.x,
          y: p.y,
          radius,
        });
      } else if (spec.id === 'archer' || spec.id === 'bow' || spec.id === 'crossbow') {
        // [궁수] 폭발 관통 화살
        const gx = p.x + Math.cos(p.aimAngle) * (spec.skill2.castDist || 250);
        const gy = p.y + Math.sin(p.aimAngle) * (spec.skill2.castDist || 250);
        const radius = spec.skill2.radius || 125;
        const damage = spec.skill2.damage || 110;
        this._triggerExplosion(gx, gy, radius, damage, p.id);
        this.events.push({
          type: 'skill_cast',
          skillId: 'explosive_arrow',
          label: '💥 폭발 관통 화살!',
          color: '#7bed9f',
          x: gx,
          y: gy,
        });
      } else {
        // [마법사] 메테오 소환: 반경 165px 폭발 + 적 2.5초 감전/둔화
        const mx = p.x + Math.cos(p.aimAngle) * (spec.skill2.castDist || 230);
        const my = p.y + Math.sin(p.aimAngle) * (spec.skill2.castDist || 230);
        const radius = spec.skill2.radius || 165;
        const damage = spec.skill2.damage || 75;
        this._triggerExplosion(mx, my, radius, damage, p.id);
        this.events.push({
          type: 'skill_cast',
          skillId: 'meteor',
          label: '☄️ 메테오 소환!',
          color: '#e056fd',
          x: mx,
          y: my,
        });
      }
    }

    // 이동 및 대시 물리
    if (p.dashTimer > 0) {
      p.dashTimer = Math.max(0, p.dashTimer - dt);
      const dashSpeed = p.speed * (spec.skill1.speedMult || 2.8);
      p.vx = p.dashDirX * dashSpeed;
      p.vy = p.dashDirY * dashSpeed;
    } else {
      let mx = input.moveX;
      let my = input.moveY;
      const len = Math.hypot(mx, my);
      if (len > 1) {
        mx /= len;
        my /= len;
      }
      let speedMult = 1.0;
      if (p.slowTimer > 0) {
        speedMult *= (1 - (p.slowRate || 0.40));
      }
      const fireMoveMult = p.isFiring && !p.isReloading ? spec.fireMoveMult : 1.0;
      p.vx = mx * p.speed * fireMoveMult * speedMult;
      p.vy = my * p.speed * fireMoveMult * speedMult;

      if (len > 0.05) {
        p.walkCycle += dt * 10;
      } else {
        p.walkCycle = 0;
      }
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    this._clampInsideCircularArena(p);
    this._resolveObstacleCollision(p);

    // 원형 자기장(Storm Ring) 외부 구역 피해 처리
    const distFromCenter = Math.hypot(p.x - this.centerX, p.y - this.centerY);
    if (distFromCenter > this.safeRadius) {
      p.stormTickTimer += dt;
      if (p.stormTickTimer >= 0.45) {
        p.stormTickTimer = 0;
        const stormDmg = Math.round(WORLD_CONFIG.STORM_DAMAGE * 0.45);
        this._applyDamageToFighter(p, stormDmg, null, '자기장');
      }
    } else {
      p.stormTickTimer = 0;
    }

    if (!p.alive) return;

    // 상태이상 (둔화 및 화상 DoT) 업데이트
    if (p.slowTimer > 0) {
      p.slowTimer = Math.max(0, p.slowTimer - dt);
    }
    if (p.burnTimer > 0) {
      p.burnTimer = Math.max(0, p.burnTimer - dt);
      p.burnTickTimer = (p.burnTickTimer || 0) + dt;
      if (p.burnTickTimer >= 0.5) {
        p.burnTickTimer = 0;
        this._applyDamageToFighter(p, p.burnDamage || 6, p.burnAttackerId, '화상');
        this.events.push({
          type: 'burn_tick',
          playerId: p.id,
          x: p.x,
          y: p.y,
          damage: p.burnDamage || 6,
        });
      }
    }

    // 판타지 자원(기력/마나) 자연 재생
    if (spec.regenRate > 0 && !p.isReloading && p.ammo < p.maxAmmo) {
      p.ammo = Math.min(p.maxAmmo, p.ammo + spec.regenRate * dt);
    }

    // 석궁: 단발 쇠뇌는 쿨다운이 끝나면 자동으로 다음 룬 볼트 장전!
    if (spec.id === 'crossbow' && p.ammo === 0 && p.fireCooldown <= 0) {
      p.ammo = 1;
    }

    // 수동 재장전/충전/명상 (R) - 활은 무한 화살통이므로 재장전 불필요
    if (spec.id !== 'bow') {
      if (input.reloadPressed && !p.isReloading && p.ammo < p.maxAmmo) {
        this._startReload(p);
      }
    }

    if (p.isReloading) {
      p.reloadTimer += dt;
      if (p.reloadTimer >= p.reloadDuration) {
        p.ammo = p.maxAmmo;
        p.isReloading = false;
        p.reloadTimer = 0;
        this.events.push({
          type: 'reload_complete',
          playerId: p.id,
          label: `${p.reloadLabel} 완료!`,
          x: p.x,
          y: p.y,
        });
      }
      return;
    }

    // ========================================================================
    // [1. ⚔️ 전사 (Warrior)]: 완전한 근접 베기 (원거리 투사체 절대 없음!)
    // ========================================================================
    if (spec.isMelee) {
      if (wantAttack && p.fireCooldown <= 0 && !p.isReloading) {
        const cost = spec.costPerShot || 20;
        if (p.ammo >= cost) {
          p.pendingAttack = false;
          p.ammo -= cost;
          p.fireCooldown = spec.fireInterval;
          p.swingDuration = 0.28;
          p.swingVisualTimer = p.swingDuration;
          p.swingDir = p.swingDir === 1 ? -1 : 1;
          this._executeMeleeAttack(p, spec);
        }
      }
      return;
    }

    // ========================================================================
    // [2. 🏹 궁수 (Archer)]: 초장거리 일격필살 1발 저격 & 1.5초 장전 필수
    // ========================================================================
    if (spec.id === 'archer' || spec.id === 'bow' || spec.id === 'crossbow') {
      if (wantAttack && p.fireCooldown <= 0 && !p.isReloading) {
        if (p.ammo >= 1) {
          p.pendingAttack = false;
          p.ammo = 0;
          p.fireCooldown = spec.fireInterval;
          p.swingVisualTimer = 0.16;

          this._spawnProjectile(
            p,
            spec,
            p.aimAngle,
            spec.bulletDamage,
            spec.bulletPierce || 1
          );

          this.events.push({
            type: 'shoot',
            playerId: p.id,
            classId: p.classId,
            x: p.x + Math.cos(p.aimAngle) * 22,
            y: p.y + Math.sin(p.aimAngle) * 22,
            angle: p.aimAngle,
          });

          // 1발 사격 즉시 1.5초간 화살 거치 장전 돌입!
          this._startReload(p);
        }
      }
      return;
    }

    // ========================================================================
    // [3. 🔮 마법사 (Mage)]: 원거리 제어 마법탄 (궁수보다 낮은 데미지 + 둔화/화상 DoT)
    // ========================================================================
    const cost = spec.costPerShot || 18;
    if (wantAttack && p.fireCooldown <= 0 && !p.isReloading) {
      if (p.ammo >= cost) {
        p.pendingAttack = false;
        p.ammo -= cost;
        p.fireCooldown = spec.fireInterval;
        p.swingVisualTimer = 0.15;

        this._spawnProjectile(
          p,
          spec,
          p.aimAngle,
          spec.bulletDamage,
          spec.bulletPierce || 1
        );

        this.events.push({
          type: 'shoot',
          playerId: p.id,
          classId: p.classId,
          x: p.x + Math.cos(p.aimAngle) * 20,
          y: p.y + Math.sin(p.aimAngle) * 20,
          angle: p.aimAngle,
        });

        if (p.ammo < cost && (!spec.regenRate || spec.regenRate <= 0)) {
          this._startReload(p);
        }
      } else if (!spec.regenRate || spec.regenRate <= 0) {
        this._startReload(p);
      }
    }
  }

  /**
   * 엘프 장궁 화살 발사 처리: 시위 당긴 장력(ratio)에 비례하여 데미지/속도/사거리/관통 차등 적용!
   */
  
  /**
   * [전사 근접 공격] 전방 100px 부채꼴 내의 적에게 즉시 피해 + 강력 넉백 + 투사체 패링!
   */
  _executeMeleeAttack(p, spec) {
    const reach = spec.meleeRange || 100;
    const halfArc = (spec.meleeArc || 1.85) * 0.5;
    const aim = p.aimAngle;

    // 1. 적 생존자 근접 타격 판정
    for (const target of this.players.values()) {
      if (!target.alive || target.id === p.id) continue;
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= reach + target.radius) {
        const angleToTarget = Math.atan2(dy, dx);
        let diff = Math.abs(angleToTarget - aim);
        while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
        if (diff <= halfArc) {
          // 근접 타격 성공: 70 피해 + 강력 넉백
          target.x += Math.cos(aim) * (spec.bulletKnockback * 0.15);
          target.y += Math.sin(aim) * (spec.bulletKnockback * 0.15);
          this._clampInsideCircularArena(target);
          this._resolveObstacleCollision(target);
          this._applyDamageToFighter(target, spec.bulletDamage, p.id, '대검 베기', aim);
        }
      }
    }

    // 2. 장애물(나무 방책, 폭발 화약통) 근접 타격 판정
    for (let k = 0; k < this.obstacles.length; k++) {
      const obs = this.obstacles[k];
      if (obs.hp <= 0) continue;
      const dx = obs.x - p.x;
      const dy = obs.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= reach + obs.radius) {
        const angleToObs = Math.atan2(dy, dx);
        let diff = Math.abs(angleToObs - aim);
        while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
        if (diff <= halfArc) {
          if (obs.destructible) {
            obs.hp -= spec.bulletDamage;
            obs.hitFlash = 0.15;
            if (obs.hp <= 0 && obs.explosive) {
              this._triggerExplosion(obs.x, obs.y, obs.explosionRadius, obs.explosionDamage, p.id);
            }
          }
        }
      }
    }

    // 3. 근접 패링: 전방으로 날아오는 적 투사체(화살/마법탄) 베어 없애기!
    for (let k = this.bullets.length - 1; k >= 0; k--) {
      const b = this.bullets[k];
      if (b.ownerId === p.id || b.parried) continue;
      const dist = Math.hypot(b.x - p.x, b.y - p.y);
      if (dist <= reach + b.radius + 15) {
        const angleToBullet = Math.atan2(b.y - p.y, b.x - p.x);
        let diff = Math.abs(angleToBullet - aim);
        while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
        if (diff <= halfArc + 0.25) {
          b.parried = true;
          this.events.push({
            type: 'rock_ricochet',
            x: b.x,
            y: b.y,
            angle: b.angle,
          });
        }
      }
    }

    this.events.push({
      type: 'melee_slash',
      playerId: p.id,
      classId: p.classId,
      x: p.x,
      y: p.y,
      angle: aim,
      range: reach,
      arc: spec.meleeArc || 1.85,
      swingDir: p.swingDir || 1,
      duration: p.swingDuration || 0.28,
      color: spec.bulletColor || '#ffa502',
    });
  }

  _fireBowArrow(p, spec, ratio) {
    p.isCharging = false;
    p.bowCharge = 0;
    p.bowDrawTimer = 0;
    p.bowOverhold = 0;
    p.fireCooldown = spec.fireInterval; // 화살 메기는 손동작 0.48초
    p.swingVisualTimer = 0.15;

    const damage = Math.round(spec.bulletDamage * (0.6 + 0.7 * ratio));
    const speed = spec.bulletSpeed * (0.8 + 0.4 * ratio);
    const range = spec.bulletRange * (0.7 + 0.5 * ratio);
    const pierce = ratio >= 0.85 ? 2 : 1;
    const knockback = spec.bulletKnockback * (0.7 + 0.6 * ratio);

    const shotAngle = p.aimAngle;
    const bullet = {
      id: `b_${this.nextEntityId++}`,
      ownerId: p.id,
      classId: p.classId,
      bulletType: 'arrow',
      x: p.x + Math.cos(shotAngle) * 20,
      y: p.y + Math.sin(shotAngle) * 20,
      vx: Math.cos(shotAngle) * speed,
      vy: Math.sin(shotAngle) * speed,
      angle: shotAngle,
      damage,
      radius: ratio >= 0.85 ? 8 : 6,
      pierceLeft: pierce,
      hitIds: new Set(),
      knockback,
      splashRadius: 0,
      traveled: 0,
      maxRange: range,
      color: ratio >= 0.85 ? '#5ef2ff' : spec.bulletColor,
      isCharged: ratio >= 0.85,
    };
    this.bullets.push(bullet);

    this.events.push({
      type: 'shoot',
      playerId: p.id,
      classId: p.classId,
      x: bullet.x,
      y: bullet.y,
      angle: shotAngle,
      isCharged: ratio >= 0.85,
      ratio,
    });

  }

    _clampInsideCircularArena(entity) {
    const dx = entity.x - this.centerX;
    const dy = entity.y - this.centerY;
    const dist = Math.hypot(dx, dy);
    const maxR = this.arenaRadius - entity.radius - 6;
    if (dist > maxR && dist > 0.001) {
      entity.x = this.centerX + (dx / dist) * maxR;
      entity.y = this.centerY + (dy / dist) * maxR;
    }
  }

  _spawnProjectile(p, spec, angle, damage, pierce, colorOverride = null, rangeOverride = null) {
    const muzzleDist = 18;
    this.bullets.push({
      id: `b_${this.nextEntityId++}`,
      ownerId: p.id,
      classId: p.classId,
      bulletType: spec.bulletType,
      x: p.x + Math.cos(angle) * muzzleDist,
      y: p.y + Math.sin(angle) * muzzleDist,
      vx: Math.cos(angle) * spec.bulletSpeed,
      vy: Math.sin(angle) * spec.bulletSpeed,
      angle,
      damage,
      radius: spec.bulletRadius || 6,
      pierceLeft: pierce,
      hitIds: new Set(),
      knockback: spec.bulletKnockback || 100,
      splashRadius: spec.bulletSplashRadius || 0,
      traveled: 0,
      maxRange: rangeOverride || spec.bulletRange,
      color: colorOverride || spec.bulletColor,
    });
  }

  _startReload(p) {
    if (p.isReloading || p.ammo >= p.maxAmmo) return;
    p.isReloading = true;
    p.reloadTimer = 0;
    this.events.push({
      type: 'reload_start',
      playerId: p.id,
      x: p.x,
      y: p.y,
    });
  }

  _resolveObstacleCollision(entity) {
    for (let i = 0; i < this.obstacles.length; i++) {
      const obs = this.obstacles[i];
      if (!obs.blocksMovement || obs.hp <= 0) continue;
      const dx = entity.x - obs.x;
      const dy = entity.y - obs.y;
      const minDist = entity.radius + obs.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 < minDist * minDist && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = minDist - d;
        entity.x += (dx / d) * push;
        entity.y += (dy / d) * push;
      }
    }
  }

  _updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (b.parried) {
        this.bullets.splice(i, 1);
        continue;
      }
      // [대검 패시브: 검기 패링] 대검 검기는 경로상의 적 화살·마법탄·단검을 베어 소멸시킴
      if (b.bulletType === 'slash') {
        for (let k = 0; k < this.bullets.length; k++) {
          const o = this.bullets[k];
          if (o === b || o.parried || o.ownerId === b.ownerId || o.bulletType === 'slash') continue;
          const pr = b.radius + o.radius + 6;
          if (distSq(b.x, b.y, o.x, o.y) <= pr * pr) {
            o.parried = true;
            this.events.push({ type: 'rock_ricochet', x: o.x, y: o.y, angle: o.angle });
          }
        }
      }
      const stepX = b.vx * dt;
      const stepY = b.vy * dt;
      b.x += stepX;
      b.y += stepY;
      b.traveled += Math.hypot(stepX, stepY);

      // 원형 경기장 외벽 충돌 또는 최대 사거리 도달 시 소멸
      const distFromCenter = Math.hypot(b.x - this.centerX, b.y - this.centerY);
      if (b.traveled >= b.maxRange || distFromCenter >= this.arenaRadius) {
        if (b.splashRadius > 0) {
          this._triggerExplosion(b.x, b.y, b.splashRadius, b.damage, b.ownerId);
        }
        this.bullets.splice(i, 1);
        continue;
      }

      // 1. 지형지물(암석 기둥, 샌드백, 폭발 드럼통) 충돌 검사
      let blockedByObstacle = false;
      for (let k = 0; k < this.obstacles.length; k++) {
        const obs = this.obstacles[k];
        if (!obs.blocksPlayerBullets || obs.hp <= 0) continue;
        const r = obs.radius + b.radius * 0.5;
        if (distSq(b.x, b.y, obs.x, obs.y) <= r * r) {
          blockedByObstacle = true;
          if (obs.destructible) {
            obs.hp -= b.damage;
            obs.hitFlash = 0.12;
            this.events.push({
              type: 'hit',
              x: b.x,
              y: b.y,
              enemyX: obs.x,
              enemyY: obs.y,
              damage: b.damage,
              isDummy: true,
              angle: b.angle,
            });
            if (obs.hp <= 0 && obs.explosive) {
              this._triggerExplosion(
                obs.x,
                obs.y,
                obs.explosionRadius,
                obs.explosionDamage,
                b.ownerId
              );
            }
          } else {
            this.events.push({
              type: 'rock_ricochet',
              x: b.x,
              y: b.y,
              angle: b.angle,
            });
          }

          if (b.splashRadius > 0) {
            this._triggerExplosion(b.x, b.y, b.splashRadius, b.damage, b.ownerId);
          }
          break;
        }
      }

      if (blockedByObstacle) {
        this.bullets.splice(i, 1);
        continue;
      }

      // 2. 다른 생존자(유저 및 AI 참가자) 피격 판정 (Free-For-All)
      for (const target of this.players.values()) {
        if (!target.alive || target.id === b.ownerId || b.hitIds.has(target.id)) {
          continue;
        }
        const r = target.radius + b.radius;
        if (distSq(b.x, b.y, target.x, target.y) <= r * r) {
          b.hitIds.add(target.id);
          b.pierceLeft--;

          // 발사자의 디버프(둔화 40% + 화상 DoT) 적용
          const owner = this.players.get(b.ownerId);
          const ownerSpec = owner ? resolveWeaponSpec(owner.classId) : null;
          if (ownerSpec && ownerSpec.debuff) {
            target.slowTimer = Math.max(target.slowTimer || 0, ownerSpec.debuff.slowDuration || 2.0);
            target.slowRate = ownerSpec.debuff.slowRate || 0.40;
            target.burnTimer = Math.max(target.burnTimer || 0, ownerSpec.debuff.burnDuration || 2.0);
            target.burnDamage = ownerSpec.debuff.burnDamage || 6;
            target.burnAttackerId = b.ownerId;
          }

          if (b.splashRadius > 0) {
            this._triggerExplosion(b.x, b.y, b.splashRadius, b.damage, b.ownerId);
            b.pierceLeft = 0;
            break;
          } else {
            // 넉백 적용
            target.x += Math.cos(b.angle) * (b.knockback * 0.08);
            target.y += Math.sin(b.angle) * (b.knockback * 0.08);
            this._clampInsideCircularArena(target);
            this._resolveObstacleCollision(target);

            this._applyDamageToFighter(target, b.damage, b.ownerId, null, b.angle);
          }

          if (b.pierceLeft <= 0) break;
        }
      }

      if (b.pierceLeft <= 0) {
        this.bullets.splice(i, 1);
      }
    }
  }

  _triggerFighterNova(caster, x, y, radius, damage) {
    const r2 = radius * radius;
    for (const target of this.players.values()) {
      if (!target.alive || target.id === caster.id) continue;
      if (distSq(x, y, target.x, target.y) <= r2) {
        const ang = Math.atan2(target.y - y, target.x - x);
        target.x += Math.cos(ang) * 28;
        target.y += Math.sin(ang) * 28;
        this._clampInsideCircularArena(target);
        this._resolveObstacleCollision(target);
        this._applyDamageToFighter(target, damage, caster.id, null, ang);
      }
    }
  }

  _triggerExplosion(x, y, radius, damage, ownerId) {
    this.events.push({
      type: 'explosion',
      x,
      y,
      radius,
    });

    const r2 = radius * radius;
    for (const target of this.players.values()) {
      if (!target.alive) continue;
      // 폭발은 본인이 너무 가까우면 절반 피해, 적에게는 100% 피해
      const d2 = distSq(x, y, target.x, target.y);
      if (d2 <= r2) {
        const finalDmg = target.id === ownerId ? Math.round(damage * 0.25) : damage;
        const ang = Math.atan2(target.y - y, target.x - x);
        target.x += Math.cos(ang) * 26;
        target.y += Math.sin(ang) * 26;
        this._clampInsideCircularArena(target);
        this._resolveObstacleCollision(target);

        const owner = this.players.get(ownerId);
        const ownerSpec = owner ? resolveWeaponSpec(owner.classId) : null;
        if (ownerSpec && ownerSpec.debuff && target.id !== ownerId) {
          target.slowTimer = Math.max(target.slowTimer || 0, ownerSpec.debuff.slowDuration || 2.0);
          target.slowRate = ownerSpec.debuff.slowRate || 0.40;
          target.burnTimer = Math.max(target.burnTimer || 0, ownerSpec.debuff.burnDuration || 2.0);
          target.burnDamage = ownerSpec.debuff.burnDamage || 6;
          target.burnAttackerId = ownerId;
        }

        this._applyDamageToFighter(target, finalDmg, ownerId, '폭발', ang);
      }
    }
  }

  _applyDamageToFighter(target, rawDamage, attackerId, reasonLabel = null, hitAngle = 0) {
    if (!target.alive || target.invulnTimer > 0) return;

    let dmgMult = 1 - (target.damageReduction || 0);
    if (target.guardBuffTimer > 0) dmgMult *= 0.45;
    const finalDamage = Math.max(1, Math.round(rawDamage * dmgMult));

    target.hp = Math.max(0, target.hp - finalDamage);

    this.events.push({
      type: 'hit',
      x: target.x,
      y: target.y,
      enemyX: target.x,
      enemyY: target.y,
      damage: finalDamage,
      isDummy: false,
      angle: hitAngle,
    });

    if (target.hp <= 0) {
      target.alive = false;
      target.deaths = (target.deaths || 0) + 1;

      const killer = attackerId ? this.players.get(attackerId) : null;
      let killerName = reasonLabel || '자기장';
      if (killer && killer.id !== target.id) {
        killerName = killer.name;
        killer.kills++;
        killer.xp += 5;
        if (killer.xp >= killer.nextXp) {
          killer.xp -= killer.nextXp;
          killer.level++;
        }
        // 배틀로얄 처치 보상: 체력 +40 회복 & 탄약(화살/마나) 즉시 완충!
        killer.hp = Math.min(killer.maxHp, killer.hp + 60);
        killer.ammo = killer.maxAmmo;
        killer.isReloading = false;
      }

      const feedMsg = `${killerName} ➔ ${target.name} 처치!`;
      this.killFeed.unshift({ id: this.nextEntityId++, text: feedMsg, time: this.time });
      if (this.killFeed.length > 5) this.killFeed.pop();

      this.events.push({
        type: 'kill',
        x: target.x,
        y: target.y,
        victimName: target.name,
        killerName,
      });
    }
  }

  _cleanupObstaclesAndCheckWinner() {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      if (this.obstacles[i].hp <= 0) {
        this.obstacles.splice(i, 1);
      }
    }

    const allFighters = Array.from(this.players.values());
    if (allFighters.length < 2) return;

    const survivors = allFighters.filter((p) => p.alive);
    if (survivors.length <= 1) {
      this.roundState = 'round_over';
      this.stateTimer = WORLD_CONFIG.ROUND_OVER_DURATION;

      const champ = survivors[0] || allFighters[0];
      if (champ) {
        champ.wins = (champ.wins || 0) + 1;
        this.winner = {
          id: champ.id,
          name: champ.name,
          className: champ.className,
          icon: champ.icon,
          kills: champ.kills,
          wins: champ.wins,
        };
      }

      this.events.push({
        type: 'round_winner',
        winnerName: this.winner ? this.winner.name : 'DRAW',
        weaponName: this.winner ? this.winner.className : '',
        x: champ ? champ.x : this.centerX,
        y: champ ? champ.y : this.centerY,
      });
    }
  }

  getStateSnapshot() {
    const allPlayers = Array.from(this.players.values());
    const aliveCount = allPlayers.filter((p) => p.alive).length;

    return {
      tick: this.tick,
      time: this.time,
      round: this.round,
      wave: this.round,
      roundState: this.roundState,
      stateTimer: this.stateTimer,
      hostId: this.hostId,
      roomName: this.roomName,
      maxPlayers: this.maxPlayers,
      botFillMode: this.botFillMode,
      safeRadius: Math.round(this.safeRadius),
      safeDelayLeft: Math.round(this.safeDelayLeft || 0),
      isSafeShrinking: Boolean(this.isSafeShrinking),
      arenaRadius: this.arenaRadius,
      centerX: this.centerX,
      centerY: this.centerY,
      aliveCount,
      totalCount: allPlayers.length,
      winner: this.winner,
      killFeed: this.killFeed,
      players: allPlayers,
      obstacles: this.obstacles,
      enemies: this.enemies,
      bullets: this.bullets,
      events: this.events,
    };
  }
}
