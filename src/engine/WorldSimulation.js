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
  'VORTEX-02',
  'VIPER-03',
  'GHOST-04',
  'TITAN-05',
  'RAVEN-06',
  'BLAZE-07',
  'COBRA-08',
  'HAWKE-09',
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
    this.botsEnabled = true;   // 기본 8인 배틀로얄 유지를 위한 AI 참가자 활성화
    this.swarmEnabled = true;  // 자기장 축소 활성화 토글 호환
    this.partyEnabled = true;

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
    return pool[idx] || 'rifle';
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
      stormTickTimer: 0,
      boxRollSeq: 1, // 랜덤박스 추첨 시퀀스 번호 (클라이언트 룰렛 연출 트리거용)
      kills: 0,
      wins: 0,
      deaths: 0,
      level: 1,
      xp: 0,
      nextXp: 10,
      walkCycle: 0,
      aiStrafeDir: this.rng() > 0.5 ? 1 : -1,
      aiStrafeTimer: 1.5,
    };

    this.players.set(playerId, player);
    this.inputs.set(playerId, {
      moveX: 0,
      moveY: 0,
      aimAngle: player.aimAngle,
      isFiring: false,
      reloadPressed: false,
      skill1Pressed: false,
      skill2Pressed: false,
    });

    if (!isBot) {
      this._syncArenaBots();
      this._positionAllFightersInCircle();
    }

    return player;
  }

  /**
   * 참가 인원이 총 8명이 되도록 AI 생존자들을 자동으로 채우거나 제거합니다.
   */
  _syncArenaBots() {
    if (!this.botsEnabled) {
      for (const [id, p] of this.players.entries()) {
        if (p.isBot) {
          this.players.delete(id);
          this.inputs.delete(id);
        }
      }
      return;
    }

    const humanCount = Array.from(this.players.values()).filter((p) => !p.isBot).length;
    if (humanCount === 0) return;

    const targetBotCount = Math.max(1, WORLD_CONFIG.TOTAL_FIGHTERS - humanCount);
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
   * 새로운 배틀로얄 라운드를 시작하고, 전원에게 랜덤박스 무기를 추첨하여 지급합니다!
   */
  startNewRound() {
    this.round++;
    this.roundState = 'roulette';
    this.stateTimer = WORLD_CONFIG.ROULETTE_DURATION;
    this.roundTime = 0;
    this.safeRadius = WORLD_CONFIG.ARENA_RADIUS;
    this.winner = null;
    this.bullets = [];

    this._initCircularArenaObstacles();
    this._syncArenaBots();
    this._positionAllFightersInCircle();

    // 모든 참가자에게 새로운 랜덤 무기 박스 추첨!
    for (const p of this.players.values()) {
      const randomWeaponId = this._pickRandomWeaponId();
      this._applyWeaponToPlayer(p, randomWeaponId, true);
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

  switchPlayerClass(playerId, newClassId) {
    const p = this.players.get(playerId);
    if (!p) return null;
    if (newClassId === 'random' || !WEAPON_LOADOUTS[newClassId]) {
      return this.rollRandomWeapon(playerId);
    }
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
    p.skill1Cooldown = 0;
    p.skill1MaxCd = spec.skill1.cooldown;
    p.skill1Name = spec.skill1.name;
    p.skill2Cooldown = 0;
    p.skill2MaxCd = spec.skill2.cooldown;
    p.skill2Name = spec.skill2.name;
    p.dashTimer = 0;
    p.guardBuffTimer = 0;
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
    // 1. 라운드 페이즈 관리 (ROULETTE -> COMBAT -> ROUND_OVER)
    // ========================================================================
    if (this.roundState === 'roulette') {
      this.stateTimer -= dt;
      // 룰렛 추첨 중에도 조준 방향은 회전 가능하도록 허용
      for (const [playerId, p] of this.players.entries()) {
        const inp = this.inputs.get(playerId);
        if (inp) {
          p.aimAngle = inp.aimAngle;
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
        this.startNewRound();
      }
      return;
    }

    // ========================================================================
    // 2. COMBAT 페이즈: 자기장 축소, AI 서바이벌 전투, 총기 격발 & 스킬 판정
    // ========================================================================
    this.roundTime += dt;

    if (this.swarmEnabled && this.safeRadius > WORLD_CONFIG.MIN_SAFE_RADIUS) {
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

        const idealDist =
          spec.id === 'shotgun'
            ? 155
            : spec.id === 'sniper'
              ? 420
              : spec.id === 'smg'
                ? 210
                : 290;

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

        isFiring = dist <= spec.bulletRange * 0.95;
        if (dist < 280 && bot.skill2Cooldown <= 0 && this.rng() < 0.08) {
          skill2Pressed = true;
        }
        if ((dist < 170 || bot.hp < bot.maxHp * 0.45) && bot.skill1Cooldown <= 0 && this.rng() < 0.1) {
          skill1Pressed = true;
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

  _updatePlayer(p, input, dt) {
    const spec = resolveWeaponSpec(p.classId);

    p.aimAngle = input.aimAngle;
    p.isFiring = input.isFiring;

    if (p.fireCooldown > 0) p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    if (p.skill1Cooldown > 0) p.skill1Cooldown = Math.max(0, p.skill1Cooldown - dt);
    if (p.skill2Cooldown > 0) p.skill2Cooldown = Math.max(0, p.skill2Cooldown - dt);
    if (p.guardBuffTimer > 0) p.guardBuffTimer = Math.max(0, p.guardBuffTimer - dt);
    if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    if (p.swingVisualTimer > 0) p.swingVisualTimer = Math.max(0, p.swingVisualTimer - dt);

    // ========================================================================
    // [⚡ 총기별 전술 스킬 1 발동] (Shift / Space / 스킬 1 버튼)
    // ========================================================================
    if (input.skill1Pressed && p.skill1Cooldown <= 0 && p.dashTimer <= 0) {
      p.skill1Cooldown = spec.skill1.cooldown;

      const moveLen = Math.hypot(input.moveX, input.moveY);
      const dirX = moveLen > 0.1 ? input.moveX / moveLen : Math.cos(p.aimAngle);
      const dirY = moveLen > 0.1 ? input.moveY / moveLen : Math.sin(p.aimAngle);

      if (spec.id === 'rifle') {
        p.dashTimer = spec.skill1.duration;
        p.dashDirX = dirX;
        p.dashDirY = dirY;
        p.invulnTimer = spec.skill1.duration + 0.12;
        p.ammo = Math.min(p.maxAmmo, p.ammo + 10);
        p.isReloading = false;

        for (let k = -1; k <= 1; k++) {
          this._spawnProjectile(p, spec, p.aimAngle + k * 0.08, spec.bulletDamage + 4, 2);
        }
        this.events.push({
          type: 'skill_cast',
          skillId: 'tactical_roll',
          label: '🔫 전술 회피 구르기!',
          color: '#7bed9f',
          x: p.x,
          y: p.y,
        });
      } else if (spec.id === 'shotgun') {
        p.dashTimer = spec.skill1.duration;
        p.dashDirX = dirX;
        p.dashDirY = dirY;
        p.guardBuffTimer = 2.5;
        p.invulnTimer = spec.skill1.duration + 0.15;
        p.ammo = Math.min(p.maxAmmo, p.ammo + 3);
        p.isReloading = false;
        this.events.push({
          type: 'skill_cast',
          skillId: 'breacher_rush',
          label: '🛡️ 방탄 돌격 대시!',
          color: '#ffa502',
          x: p.x,
          y: p.y,
        });
      } else if (spec.id === 'lmg') {
        this._triggerFighterNova(p, p.x, p.y, spec.skill1.radius, spec.skill1.damage);
        this.events.push({
          type: 'nova',
          skillId: 'shock_grenade',
          label: '⚡ 충격 수류탄!',
          color: '#ffd32a',
          x: p.x,
          y: p.y,
          radius: spec.skill1.radius,
        });
      } else if (spec.id === 'sniper') {
        const blinkDist = spec.skill1.blinkDist;
        const backX = moveLen > 0.1 ? dirX : -Math.cos(p.aimAngle);
        const backY = moveLen > 0.1 ? dirY : -Math.sin(p.aimAngle);
        const oldX = p.x;
        const oldY = p.y;
        p.x += backX * blinkDist;
        p.y += backY * blinkDist;
        this._clampInsideCircularArena(p);
        this._resolveObstacleCollision(p);
        p.invulnTimer = 0.3;
        p.ammo = Math.min(p.maxAmmo, p.ammo + 2);
        p.isReloading = false;

        this._triggerFighterNova(p, oldX, oldY, spec.skill1.novaRadius, spec.skill1.damage);
        this.events.push({
          type: 'nova',
          skillId: 'smoke_grapple',
          label: '💨 연막 후방 도약!',
          color: '#5ef2ff',
          x: oldX,
          y: oldY,
          radius: spec.skill1.novaRadius,
        });
      } else if (spec.id === 'launcher') {
        const oldX = p.x;
        const oldY = p.y;
        p.x += dirX * spec.skill1.blinkDist;
        p.y += dirY * spec.skill1.blinkDist;
        this._clampInsideCircularArena(p);
        this._resolveObstacleCollision(p);
        p.invulnTimer = 0.3;

        this._triggerFighterNova(p, oldX, oldY, spec.skill1.novaRadius, spec.skill1.damage);
        this.events.push({
          type: 'nova',
          skillId: 'jet_mine',
          label: '💣 제트 점프 & 지뢰!',
          color: '#ff6b81',
          x: oldX,
          y: oldY,
          radius: spec.skill1.novaRadius,
        });
      } else if (spec.id === 'smg') {
        p.dashTimer = spec.skill1.duration;
        p.dashDirX = dirX;
        p.dashDirY = dirY;
        p.invulnTimer = spec.skill1.duration + 0.15;
        p.hp = Math.min(p.maxHp, p.hp + 25);
        p.ammo = p.maxAmmo;
        p.isReloading = false;
        this.events.push({
          type: 'skill_cast',
          skillId: 'adrenaline_dash',
          label: '⚡ 아드레날린 부스트 (+25 HP)!',
          color: '#a29bfe',
          x: p.x,
          y: p.y,
        });
      }
    }

    // ========================================================================
    // [💥 총기별 화력 스킬 2 발동] (E키 / Q키 / 스킬 2 버튼)
    // ========================================================================
    if (input.skill2Pressed && p.skill2Cooldown <= 0) {
      p.skill2Cooldown = spec.skill2.cooldown;

      if (spec.id === 'rifle') {
        const gx = p.x + Math.cos(p.aimAngle) * spec.skill2.castDist;
        const gy = p.y + Math.sin(p.aimAngle) * spec.skill2.castDist;
        this._triggerExplosion(gx, gy, spec.skill2.radius, spec.skill2.damage, p.id);
        this.events.push({
          type: 'skill_cast',
          skillId: 'm203_grenade',
          label: '💥 M203 고폭 유탄!',
          color: '#7bed9f',
          x: gx,
          y: gy,
        });
      } else if (spec.id === 'shotgun') {
        const count = spec.skill2.pelletCount;
        const spread = spec.skill2.spreadAngle;
        for (let i = 0; i < count; i++) {
          const offset = ((i / (count - 1)) - 0.5) * spread;
          this._spawnProjectile(
            p,
            spec,
            p.aimAngle + offset,
            spec.skill2.damage,
            spec.skill2.pierce,
            '#ff4757'
          );
        }
        this.events.push({
          type: 'skill_cast',
          skillId: 'dragons_breath',
          label: '🔥 드래곤 브레스 소이탄!',
          color: '#ffa502',
          x: p.x,
          y: p.y,
        });
      } else if (spec.id === 'lmg') {
        const count = spec.skill2.bulletCount;
        const spread = spec.skill2.spreadAngle;
        for (let i = 0; i < count; i++) {
          const offset = ((i / (count - 1)) - 0.5) * spread;
          this._spawnProjectile(
            p,
            spec,
            p.aimAngle + offset,
            spec.skill2.damage,
            spec.skill2.pierce,
            '#ffd32a'
          );
        }
        this.events.push({
          type: 'skill_cast',
          skillId: 'overdrive_barrage',
          label: '🔥 오버드라이브 탄막!',
          color: '#ffd32a',
          x: p.x,
          y: p.y,
        });
      } else if (spec.id === 'sniper') {
        const count = spec.skill2.shotCount;
        const spread = spec.skill2.spreadAngle;
        for (let i = 0; i < count; i++) {
          const offset = ((i / (count - 1)) - 0.5) * spread;
          this._spawnProjectile(
            p,
            spec,
            p.aimAngle + offset,
            spec.skill2.damage,
            spec.skill2.pierce,
            '#5ef2ff'
          );
        }
        this.events.push({
          type: 'skill_cast',
          skillId: 'railgun_shot',
          label: '⚡ 레일건 초관통 사격!',
          color: '#5ef2ff',
          x: p.x,
          y: p.y,
        });
      } else if (spec.id === 'launcher') {
        const mx = p.x + Math.cos(p.aimAngle) * spec.skill2.castDist;
        const my = p.y + Math.sin(p.aimAngle) * spec.skill2.castDist;
        this._triggerExplosion(mx, my, spec.skill2.radius, spec.skill2.damage, p.id);
        this.events.push({
          type: 'skill_cast',
          skillId: 'napalm_airstrike',
          label: '🚀 네이팜 공습 폭격!',
          color: '#ff4757',
          x: mx,
          y: my,
        });
      } else if (spec.id === 'smg') {
        const count = spec.skill2.bulletCount;
        for (let i = 0; i < count; i++) {
          const ang = p.aimAngle + (i * Math.PI * 2) / count;
          this._spawnProjectile(
            p,
            spec,
            ang,
            spec.skill2.damage,
            spec.skill2.pierce,
            '#a29bfe'
          );
        }
        this.events.push({
          type: 'skill_cast',
          skillId: 'bullet_storm',
          label: '⚡ 360° 블릿 스톰!',
          color: '#a29bfe',
          x: p.x,
          y: p.y,
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
      const fireMoveMult = p.isFiring && !p.isReloading ? spec.fireMoveMult : 1.0;
      p.vx = mx * p.speed * fireMoveMult;
      p.vy = my * p.speed * fireMoveMult;

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

    // 수동 탄창 교체(R)
    if (input.reloadPressed && !p.isReloading && p.ammo < p.maxAmmo) {
      this._startReload(p);
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

    // 총기 격발 처리 (산탄총은 6펠릿, 아킴보 기관단총은 2펠릿 동시 발사!)
    if (p.isFiring && p.fireCooldown <= 0) {
      if (p.ammo > 0) {
        p.ammo--;
        p.fireCooldown = spec.fireInterval;
        p.swingVisualTimer = 0.08;

        const pellets = spec.pelletCount || 1;
        if (pellets > 1) {
          for (let k = 0; k < pellets; k++) {
            const fanOffset =
              ((k / (pellets - 1)) - 0.5) * spec.bulletSpread +
              (this.rng() - 0.5) * 0.04;
            this._spawnProjectile(
              p,
              spec,
              p.aimAngle + fanOffset,
              spec.bulletDamage,
              spec.bulletPierce
            );
          }
        } else {
          const spread = (this.rng() - 0.5) * 2 * spec.bulletSpread;
          const shotAngle = p.aimAngle + spread;
          this._spawnProjectile(p, spec, shotAngle, spec.bulletDamage, spec.bulletPierce);
        }

        this.events.push({
          type: 'shoot',
          playerId: p.id,
          classId: p.classId,
          x: p.x + Math.cos(p.aimAngle) * 18,
          y: p.y + Math.sin(p.aimAngle) * 18,
          angle: p.aimAngle,
        });

        if (p.ammo === 0) {
          this._startReload(p);
        }
      } else {
        this._startReload(p);
      }
    }
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

  _spawnProjectile(p, spec, angle, damage, pierce, colorOverride = null) {
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
      maxRange: spec.bulletRange,
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
        // 배틀로얄 처치 보상: 체력 +40 회복 & 탄약 즉시 재장전!
        killer.hp = Math.min(killer.maxHp, killer.hp + 40);
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
      safeRadius: Math.round(this.safeRadius),
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
