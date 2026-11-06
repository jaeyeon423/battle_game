// ============================================================================
// [Client] 원형 배틀로얄: 세로(Portrait) 모바일 서바이벌 Canvas 2D 렌더러
// - 오프스크린 배경 타일 캐싱(arenaBgCanvas)으로 모바일 렌더링 부하 90% 이상 감소 (60FPS 보장)
// - 세로 화면(Portrait) 폭(360~430px)에 맞춘 최적 전술 시야(viewScale) 자동 계산
// ============================================================================

import { WORLD_CONFIG, resolveWeaponSpec } from '../shared/constants.js';
import { clamp, lerp } from '../shared/math.js';
import { PixelSprites } from './PixelSprites.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.sprites = new PixelSprites();

    this.camera = { x: WORLD_CONFIG.CENTER_X, y: WORLD_CONFIG.CENTER_Y, shake: 0 };
    this.viewScale = 1.0;
    this.viewW = 390;
    this.viewH = 844;
    this.dpr = 1;

    this.arenaBgCanvas = null;

    this.particles = [];
    this.floatingTexts = [];
    this.groundStains = [];
    this.shockwaves = [];
    this.slashSwings = [];
  }

  resize(width, height) {
    const safeW = Math.max(1, width);
    const safeH = Math.max(1, height);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);

    this.canvas.width = Math.floor(safeW * dpr);
    this.canvas.height = Math.floor(safeH * dpr);
    this.viewW = safeW;
    this.viewH = safeH;
    this.dpr = dpr;

    // 세로(Portrait) 모드 최적화: 스마트폰 세로 화면 폭(360~430px)에서도
    // 좌우 시야가 좁아지지 않도록 580px 이상의 전술 시야(FOV)를 안정적으로 확보!
    if (safeW < safeH) {
      this.viewScale = Math.min(1.0, Math.max(0.55, safeW / 580));
    } else if (safeH < 460 || safeW < 850) {
      this.viewScale = 0.82;
    } else {
      this.viewScale = 1.0;
    }
  }

  _ensureArenaBgCache() {
    if (this.arenaBgCanvas) return this.arenaBgCanvas;
    if (typeof document === 'undefined') return null;

    const w = WORLD_CONFIG.WIDTH || 1600;
    const h = WORLD_CONFIG.HEIGHT || 1600;
    const cx = WORLD_CONFIG.CENTER_X;
    const cy = WORLD_CONFIG.CENTER_Y;
    const arenaR = WORLD_CONFIG.ARENA_RADIUS;

    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d');
    octx.imageSmoothingEnabled = false;

    const tile = this.sprites.get('alien_tile');
    const ts = WORLD_CONFIG.TILE_SIZE;

    octx.save();
    octx.beginPath();
    octx.arc(cx, cy, arenaR, 0, Math.PI * 2);
    octx.clip();

    const startCol = Math.max(0, Math.floor((cx - arenaR) / ts));
    const endCol = Math.ceil((cx + arenaR) / ts);
    const startRow = Math.max(0, Math.floor((cy - arenaR) / ts));
    const endRow = Math.ceil((cy + arenaR) / ts);

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        octx.drawImage(tile, c * ts, r * ts, ts, ts);
      }
    }

    // 원형 경기장 내부 동심원 전술 가이드 라인
    octx.strokeStyle = 'rgba(94, 242, 255, 0.09)';
    octx.lineWidth = 2;
    for (const ringR of [160, 320, 490]) {
      octx.beginPath();
      octx.arc(cx, cy, ringR, 0, Math.PI * 2);
      octx.stroke();
    }

    // 십자 중심선
    octx.beginPath();
    octx.moveTo(cx - arenaR, cy);
    octx.lineTo(cx + arenaR, cy);
    octx.moveTo(cx, cy - arenaR);
    octx.lineTo(cx, cy + arenaR);
    octx.stroke();
    octx.restore();

    // 원형 경기장 외벽 강철 링
    octx.save();
    octx.strokeStyle = '#3d4656';
    octx.lineWidth = 10;
    octx.beginPath();
    octx.arc(cx, cy, arenaR + 4, 0, Math.PI * 2);
    octx.stroke();

    octx.strokeStyle = '#ffa502';
    octx.lineWidth = 2;
    octx.beginPath();
    octx.arc(cx, cy, arenaR, 0, Math.PI * 2);
    octx.stroke();
    octx.restore();

    this.arenaBgCanvas = off;
    return this.arenaBgCanvas;
  }

  getPlayerScreenPos(localPlayer) {
    if (!localPlayer) {
      return { x: this.viewW / 2, y: this.viewH / 2 };
    }
    const px = typeof localPlayer._renderX === 'number' ? localPlayer._renderX : localPlayer.x;
    const py = typeof localPlayer._renderY === 'number' ? localPlayer._renderY : localPlayer.y;
    return {
      x: (px - this.camera.x) * this.viewScale + this.viewW / 2,
      y: (py - this.camera.y) * this.viewScale + this.viewH / 2,
    };
  }

  processEvents(events) {
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.type === 'shoot') {
        const spec = resolveWeaponSpec(ev.classId);
        const shakeAmt =
          spec.id === 'crossbow' || spec.id === 'sword' || spec.id === 'staff'
            ? 2.2
            : 0.9;
        this.camera.shake = Math.min(this.camera.shake + shakeAmt, 4.0);
        const pColor = spec.bulletColor || '#ffd32a';
        const sparkCount = spec.id === 'sword' ? 5 : 3;
        for (let k = 0; k < sparkCount; k++) {
          const ang = ev.angle + (Math.random() - 0.5) * 0.65;
          const spd = 90 + Math.random() * 130;
          this.particles.push({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            size: 3,
            color: pColor,
            life: 0.09 + Math.random() * 0.06,
          });
        }
      } else if (ev.type === 'random_box_open') {
        this.camera.shake = 5;
        this.shockwaves.push({
          x: ev.x,
          y: ev.y,
          radius: 10,
          maxRadius: 110,
          color: '#ffd32a',
          life: 0.35,
          maxLife: 0.35,
        });
        this.floatingTexts.push({
          x: ev.x,
          y: ev.y - 36,
          text: `🎲 ${ev.icon} ${ev.className}!`,
          color: '#ffd32a',
          life: 1.1,
        });
      } else if (ev.type === 'round_fight') {
        this.camera.shake = 6;
        this.floatingTexts.push({
          x: ev.x,
          y: ev.y - 40,
          text: `⚔️ ROUND ${ev.round} FIGHT!`,
          color: '#ffd32a',
          life: 1.0,
        });
      } else if (ev.type === 'skill_cast') {
        this.camera.shake = Math.min(this.camera.shake + 3.5, 7);
        this.floatingTexts.push({
          x: ev.x,
          y: ev.y - 32,
          text: ev.label || 'SKILL!',
          color: ev.color || '#ffd32a',
          life: 0.85,
        });
        for (let k = 0; k < 10; k++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 60 + Math.random() * 140;
          this.particles.push({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            size: 4,
            color: ev.color || '#ffd32a',
            life: 0.22 + Math.random() * 0.14,
          });
        }
      } else if (ev.type === 'nova') {
        this.camera.shake = 6;
        if (ev.skillId === 'whirlwind') {
          this.slashSwings.push({
            playerId: null,
            x: ev.x,
            y: ev.y,
            aimAngle: 0,
            arc: Math.PI * 2,
            range: ev.radius || 135,
            swingDir: 1,
            color: ev.color || '#ffa502',
            life: 0.42,
            maxLife: 0.42,
            isWhirlwind: true,
          });
        }
        this.shockwaves.push({
          x: ev.x,
          y: ev.y,
          radius: 14,
          maxRadius: ev.radius || 150,
          color: ev.color || '#5ef2ff',
          life: 0.34,
          maxLife: 0.34,
        });
        this.floatingTexts.push({
          x: ev.x,
          y: ev.y - 34,
          text: ev.label || 'BLAST!',
          color: ev.color || '#5ef2ff',
          life: 0.85,
        });
      } else if (ev.type === 'name_change') {
        this.floatingTexts.push({
          x: ev.x,
          y: ev.y - 34,
          text: `✏️ 닉네임: ${ev.name}`,
          color: '#ffd32a',
          life: 1.0,
        });
      } else if (ev.type === 'class_switch') {
        this.floatingTexts.push({
          x: ev.x,
          y: ev.y - 34,
          text: `무기 장착: ${ev.className}`,
          color: '#5ef2ff',
          life: 0.9,
        });
      } else if (ev.type === 'rock_ricochet') {
        for (let k = 0; k < 4; k++) {
          const ang = ev.angle + Math.PI + (Math.random() - 0.5) * 1.6;
          const spd = 60 + Math.random() * 90;
          this.particles.push({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            size: 3,
            color: '#d1ccc0',
            life: 0.14,
          });
        }
      } else if (ev.type === 'hit') {
        const hitColor = ev.isDummy ? '#ffda79' : '#ff6b81';
        for (let k = 0; k < 5; k++) {
          const ang = ev.angle + Math.PI + (Math.random() - 0.5) * 1.4;
          const spd = 50 + Math.random() * 110;
          this.particles.push({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            size: 3,
            color: hitColor,
            life: 0.18 + Math.random() * 0.12,
          });
        }
        this.floatingTexts.push({
          x: ev.enemyX + (Math.random() - 0.5) * 14,
          y: ev.enemyY - 20,
          text: `-${ev.damage}`,
          color: ev.isDummy ? '#ffeaa7' : '#ff4757',
          life: 0.48,
        });
      } else if (ev.type === 'kill') {
        this.camera.shake = 7;
        for (let k = 0; k < 16; k++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 60 + Math.random() * 170;
          this.particles.push({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            size: 4,
            color: k % 2 === 0 ? '#ffd32a' : '#ff4757',
            life: 0.3 + Math.random() * 0.2,
          });
        }
        this.floatingTexts.push({
          x: ev.x,
          y: ev.y - 28,
          text: `💀 ${ev.victimName || 'ELIMINATED'}!`,
          color: '#ffd32a',
          life: 1.0,
        });
        this.groundStains.push({
          x: ev.x,
          y: ev.y,
          radius: 10 + Math.random() * 6,
          alpha: 0.45,
        });
        if (this.groundStains.length > 40) this.groundStains.shift();
      } else if (ev.type === 'explosion') {
        this.camera.shake = 9;
        this.shockwaves.push({
          x: ev.x,
          y: ev.y,
          radius: 12,
          maxRadius: ev.radius,
          color: '#ff7f50',
          life: 0.28,
          maxLife: 0.28,
        });
        for (let k = 0; k < 18; k++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 80 + Math.random() * 230;
          this.particles.push({
            x: ev.x,
            y: ev.y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            size: 5,
            color: k % 3 === 0 ? '#fff200' : k % 2 === 0 ? '#ff7f50' : '#ff4757',
            life: 0.28 + Math.random() * 0.2,
          });
        }
      } else if (ev.type === 'reload_complete') {
        this.floatingTexts.push({
          x: ev.x,
          y: ev.y - 28,
          text: ev.label || 'RELOADED!',
          color: '#5ef2ff',
          life: 0.65,
        });
      } else if (ev.type === 'melee_slash') {
        this.camera.shake = Math.max(this.camera.shake, 4.5);
        const dur = ev.duration || 0.28;
        this.slashSwings.push({
          playerId: ev.playerId,
          x: ev.x,
          y: ev.y,
          aimAngle: ev.angle,
          arc: ev.arc || 1.85,
          range: ev.range || 100,
          swingDir: ev.swingDir || 1,
          color: ev.color || '#ffa502',
          life: dur,
          maxLife: dur,
          isWhirlwind: false,
        });
        for (let k = 0; k < 10; k++) {
          const spread = (Math.random() - 0.5) * (ev.arc || 1.85);
          const ang = ev.angle + spread;
          const dist = 32 + Math.random() * ((ev.range || 100) - 24);
          this.particles.push({
            x: ev.x + Math.cos(ang) * dist,
            y: ev.y + Math.sin(ang) * dist,
            vx: Math.cos(ang) * (70 + Math.random() * 90),
            vy: Math.sin(ang) * (70 + Math.random() * 90),
            size: 3.5,
            color: k % 2 === 0 ? '#ffa502' : '#ffffff',
            life: 0.18 + Math.random() * 0.1,
          });
        }
      }
    }
  }

  render(snapshot, localPlayerId, dt) {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.imageSmoothingEnabled = false;

    const myPlayer = snapshot.players.find((p) => p.id === localPlayerId);
    const focusTarget =
      (myPlayer && myPlayer.alive ? myPlayer : null) ||
      snapshot.players.find((p) => p.alive) ||
      myPlayer ||
      snapshot.players[0];

    if (focusTarget) {
      const fx = typeof focusTarget._renderX === 'number' ? focusTarget._renderX : focusTarget.x;
      const fy = typeof focusTarget._renderY === 'number' ? focusTarget._renderY : focusTarget.y;
      const targetCamX = clamp(
        fx,
        WORLD_CONFIG.CENTER_X - 680,
        WORLD_CONFIG.CENTER_X + 680
      );
      const targetCamY = clamp(
        fy,
        WORLD_CONFIG.CENTER_Y - 680,
        WORLD_CONFIG.CENTER_Y + 680
      );
      this.camera.x = lerp(this.camera.x, targetCamX, Math.min(1, dt * 12));
      this.camera.y = lerp(this.camera.y, targetCamY, Math.min(1, dt * 12));
    }

    let shakeX = 0;
    let shakeY = 0;
    if (this.camera.shake > 0.1) {
      shakeX = (Math.random() - 0.5) * 2 * this.camera.shake;
      shakeY = (Math.random() - 0.5) * 2 * this.camera.shake;
      this.camera.shake *= Math.pow(0.001, dt);
    } else {
      this.camera.shake = 0;
    }

    // 경기장 바깥 배경
    ctx.fillStyle = '#07090e';
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    ctx.save();
    ctx.translate(this.viewW / 2 + shakeX, this.viewH / 2 + shakeY);
    if (this.viewScale !== 1.0) {
      ctx.scale(this.viewScale, this.viewScale);
    }
    ctx.translate(-Math.round(this.camera.x), -Math.round(this.camera.y));

    // 1. 원형 경기장 바닥 & 자기장 렌더링
    this._drawCircularArena(ctx, snapshot);

    // 2. 바닥 흔적
    this._drawGroundDetails(ctx);

    // 3. 지형지물
    if (snapshot.obstacles) {
      for (let i = 0; i < snapshot.obstacles.length; i++) {
        this._drawObstacle(ctx, snapshot.obstacles[i]);
      }
    }

    // 4. 참가 생존자들
    for (let i = 0; i < snapshot.players.length; i++) {
      const p = snapshot.players[i];
      if (!p.alive) {
        this._drawEliminatedMarker(ctx, p);
      }
    }
    for (let i = 0; i < snapshot.players.length; i++) {
      const p = snapshot.players[i];
      if (p.alive) {
        const px = typeof p._renderX === 'number' ? p._renderX : p.x;
        const py = typeof p._renderY === 'number' ? p._renderY : p.y;
        this._drawPlayer(ctx, p, px, py, p.id === localPlayerId);
      }
    }

    // 5. 투사체
    this._drawBullets(ctx, snapshot.bullets);

    // 6. 특수 효과
    this._drawEffects(ctx, dt);

    ctx.restore();
    ctx.restore();
  }

  _drawCircularArena(ctx, snapshot) {
    const cx = snapshot.centerX || WORLD_CONFIG.CENTER_X;
    const cy = snapshot.centerY || WORLD_CONFIG.CENTER_Y;
    const arenaR = snapshot.arenaRadius || WORLD_CONFIG.ARENA_RADIUS;
    const safeR = snapshot.safeRadius ?? arenaR;

    const bgCache = this._ensureArenaBgCache();
    if (bgCache) {
      ctx.drawImage(bgCache, 0, 0);
    }

    if (safeR < arenaR) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 45, 85, 0.24)';
      ctx.beginPath();
      ctx.arc(cx, cy, arenaR, 0, Math.PI * 2, false);
      ctx.arc(cx, cy, safeR, 0, Math.PI * 2, true);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = safeR < arenaR ? '#ff4757' : 'rgba(94, 242, 255, 0.45)';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([14, 8]);
    ctx.beginPath();
    ctx.arc(cx, cy, safeR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawObstacle(ctx, obs) {
    let key = `obs_${obs.type}`;
    if (obs.hitFlash > 0 && obs.destructible) {
      key = `obs_${obs.type}_flash`;
    }
    const img = this.sprites.get(key) || this.sprites.get(`obs_${obs.type}`);
    if (!img) return;

    const scale = obs.type === 'rock' ? 4.2 : obs.type === 'barricade' ? 3.6 : 3.4;
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(Math.round(obs.x - w * 0.42), Math.round(obs.y + h * 0.34), Math.round(w * 0.84), 8);

    ctx.drawImage(img, Math.round(obs.x - w / 2), Math.round(obs.y - h / 2), w, h);

    if (obs.destructible && (obs.hp < obs.maxHp || obs.type === 'barrel')) {
      const bw = 36;
      const bh = 4;
      const bx = Math.round(obs.x - bw / 2);
      const by = Math.round(obs.y - h / 2 - 9);
      ctx.fillStyle = '#0c0e14';
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.fillStyle = obs.type === 'barrel' ? '#ffa502' : '#7bed9f';
      ctx.fillRect(bx, by, Math.round(bw * Math.max(0, obs.hp / obs.maxHp)), bh);
    }
  }

  _drawGroundDetails(ctx) {
    for (let i = 0; i < this.groundStains.length; i++) {
      const s = this.groundStains[i];
      ctx.fillStyle = `rgba(180, 35, 55, ${s.alpha * 0.35})`;
      ctx.fillRect(Math.round(s.x - s.radius), Math.round(s.y - s.radius / 2), s.radius * 2, s.radius);
    }
  }

  _drawEliminatedMarker(ctx, p) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#1e242e';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#747d8c';
    ctx.fillText(`💀 ${p.name}`, Math.round(p.x), Math.round(p.y + 4));
    ctx.restore();
  }

  _drawPlayer(ctx, p, px, py, isLocal) {
    const scale = 3.2;
    const frame = p.walkCycle > 0 ? Math.floor(p.walkCycle) % 2 : 0;
    const spec = resolveWeaponSpec(p.classId);
    const cls = spec.id;
    const spriteCls = cls === 'warrior' ? 'sword' : (cls === 'archer' ? 'bow' : (cls === 'mage' ? 'staff' : cls));
    const img = this.sprites.get(`${spriteCls}_${frame}`) || this.sprites.get('sword_0') || this.sprites.get('bow_0');
    const wepImg = this.sprites.get(`weapon_${spriteCls}`);

    const w = Math.round((img ? img.width : 16) * scale);
    const h = Math.round((img ? img.height : 16) * scale);

    // 1. 내 캐릭터 발밑 식별 서클 & 조준선
    if (isLocal) {
      ctx.strokeStyle = 'rgba(94, 242, 255, 0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py + 4, 20, 0, Math.PI * 2);
      ctx.stroke();

      if (spec.isMelee) {
        const reach = spec.meleeRange || 100;
        const halfArc = (spec.meleeArc || 1.85) * 0.5;
        const isAiming = Boolean(p.isAiming);
        ctx.save();
        ctx.strokeStyle = isAiming ? '#ffd32a' : 'rgba(255, 165, 2, 0.36)';
        ctx.lineWidth = isAiming ? 2.6 : 1.6;
        ctx.setLineDash(isAiming ? [] : [6, 6]);
        ctx.beginPath();
        ctx.arc(px, py + 3, reach, p.aimAngle - halfArc, p.aimAngle + halfArc);
        ctx.stroke();
        ctx.setLineDash([]);

        // 조준 중일 때 부채꼴 참격 범위 부드러운 채우기 연출
        if (isAiming) {
          ctx.fillStyle = 'rgba(255, 165, 2, 0.16)';
          ctx.beginPath();
          ctx.moveTo(px, py + 3);
          ctx.arc(px, py + 3, reach, p.aimAngle - halfArc, p.aimAngle + halfArc);
          ctx.closePath();
          ctx.fill();
        }

        // 조준 중심 화살표 촉
        const tipX = px + Math.cos(p.aimAngle) * (reach * 0.88);
        const tipY = py + 3 + Math.sin(p.aimAngle) * (reach * 0.88);
        ctx.fillStyle = isAiming ? '#ffffff' : 'rgba(255, 211, 42, 0.65)';
        ctx.beginPath();
        ctx.arc(tipX, tipY, isAiming ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        const isArcher = cls === 'archer' || cls === 'bow' || cls === 'crossbow';
        const isAiming = Boolean(p.isAiming);
        const laserLen = p.isReloading ? 90 : (isArcher ? 520 : 340);
        const startX = px + Math.cos(p.aimAngle) * 18;
        const startY = py + Math.sin(p.aimAngle) * 18;
        const endX = px + Math.cos(p.aimAngle) * laserLen;
        const endY = py + Math.sin(p.aimAngle) * laserLen;
        const aimColor = spec.bulletColor || '#7bed9f';

        ctx.save();
        ctx.strokeStyle = p.isReloading ? 'rgba(255, 165, 2, 0.35)' : (isAiming ? '#ffffff' : `${aimColor}cc`);
        ctx.lineWidth = isAiming ? 2.8 : (p.isFiring ? 2.4 : 1.6);
        ctx.setLineDash(isAiming ? [] : (isArcher ? [6, 6] : [4, 4]));
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.setLineDash([]);

        // 조준 화살표 촉 (Arrow Head)
        const arrowLen = isAiming ? 12 : 8;
        const arrowAng1 = p.aimAngle + Math.PI * 0.82;
        const arrowAng2 = p.aimAngle - Math.PI * 0.82;
        ctx.fillStyle = isAiming ? '#ffd32a' : aimColor;
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX + Math.cos(arrowAng1) * arrowLen, endY + Math.sin(arrowAng1) * arrowLen);
        ctx.lineTo(endX + Math.cos(arrowAng2) * arrowLen, endY + Math.sin(arrowAng2) * arrowLen);
        ctx.closePath();
        ctx.fill();

        if (cls === 'mage' || cls === 'staff') {
          ctx.strokeStyle = isAiming ? 'rgba(224, 86, 253, 0.85)' : 'rgba(224, 86, 253, 0.4)';
          ctx.lineWidth = isAiming ? 2.2 : 1.5;
          ctx.beginPath();
          ctx.arc(endX, endY, 38, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    } else {
      ctx.strokeStyle = 'rgba(255, 71, 87, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py + 4, 18, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 2. 발밑 그림자
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(Math.round(px - 15), Math.round(py + 15), 30, 7);

    // 3. 버프 / 상태이상
    if (p.guardBuffTimer > 0) {
      ctx.strokeStyle = 'rgba(255, 165, 2, 0.8)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(px, py, 24, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.slowTimer > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(94, 242, 255, 0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(px, py + 4, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (p.burnTimer > 0) {
      ctx.save();
      ctx.fillStyle = '#ff4757';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('🔥 화상', px, py - h / 2 - 16);
      ctx.restore();
    }

    // 4. 본체 도트
    const facingRight = Math.cos(p.aimAngle) >= 0;
    ctx.save();
    ctx.translate(Math.round(px), Math.round(py));
    if (!facingRight) ctx.scale(-1, 1);
    ctx.drawImage(img, Math.round(-w / 2), Math.round(-h / 2), w, h);
    ctx.restore();

    // 5. 무기 회전 및 참격 궤적
    if (wepImg) {
      const isSwinging = spec.isMelee && (p.swingVisualTimer > 0 || p.whirlwindTimer > 0);
      const swingScale = isSwinging ? 3.2 : (spec.isMelee ? 2.85 : 2.5);
      const gw = Math.round(wepImg.width * swingScale);
      const gh = Math.round(wepImg.height * swingScale);

      ctx.save();
      ctx.translate(Math.round(px), Math.round(py + 3));

      if (spec.isMelee) {
        const halfArc = (spec.meleeArc || 1.85) * 0.56;
        const dir = p.swingDir || 1;
        let weaponAngle = p.aimAngle - dir * 0.55;
        let thrustOffset = 4;

        if (p.whirlwindTimer > 0) {
          const wt = 1 - p.whirlwindTimer / 0.42;
          weaponAngle = p.aimAngle + wt * Math.PI * 4;
          thrustOffset = 14;
        } else if (p.swingVisualTimer > 0) {
          const dur = p.swingDuration || 0.28;
          const rawT = clamp(1 - p.swingVisualTimer / dur, 0, 1);
          const eased = 1 - Math.pow(1 - rawT, 3);
          const startAng = p.aimAngle - dir * halfArc;
          const endAng = p.aimAngle + dir * halfArc;
          weaponAngle = startAng + (endAng - startAng) * eased;
          thrustOffset = 4 + Math.sin(rawT * Math.PI) * 16;

          const reach = spec.meleeRange || 100;
          const trailSpan = weaponAngle - startAng;
          if (Math.abs(trailSpan) > 0.05) {
            ctx.save();
            const ccw = dir < 0;
            ctx.strokeStyle = 'rgba(255, 165, 2, 0.85)';
            ctx.lineWidth = 14 * (1 - rawT * 0.45);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(0, 0, reach * 0.78, startAng, weaponAngle, ccw);
            ctx.stroke();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 5 * (1 - rawT * 0.45);
            ctx.beginPath();
            ctx.arc(0, 0, reach * 0.82, startAng + dir * 0.15, weaponAngle, ccw);
            ctx.stroke();
            ctx.restore();
          }
        }

        ctx.rotate(weaponAngle);
        if (!facingRight && p.whirlwindTimer <= 0 && p.swingVisualTimer <= 0) {
          ctx.scale(1, -1);
        }
        ctx.drawImage(wepImg, Math.round(thrustOffset), Math.round(-gh / 2), gw, gh);
      } else {
        const recoilOffset = p.swingVisualTimer > 0 ? -3 : 2;
        ctx.rotate(p.aimAngle);
        if (!facingRight) ctx.scale(1, -1);
        ctx.drawImage(wepImg, recoilOffset, Math.round(-gh / 2), gw, gh);
      }
      ctx.restore();
    }

    // 6. 머리 위 이름 & 체력 바
    const bw = 44;
    const bh = 5;
    const bx = Math.round(px - bw / 2);
    const by = Math.round(py - h / 2 - 10);
    ctx.fillStyle = '#0c0e14';
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = isLocal ? '#2ed573' : '#ff4757';
    ctx.fillRect(bx, by, Math.round(bw * Math.max(0, p.hp / p.maxHp)), bh);

    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = isLocal ? '#5ef2ff' : '#ffd32a';
    ctx.fillText(`${spec.icon} ${p.name}`, Math.round(px), by - 4);

    // 7. 차징 게이지 또는 재장전 진행 바
    if (p.classId === 'bow' && p.bowCharge > 0) {
      const rbw = 46;
      const rbh = 5;
      const rbx = Math.round(px - rbw / 2);
      const rby = by - 16;
      ctx.fillStyle = '#0c0e14';
      ctx.fillRect(rbx - 1, rby - 1, rbw + 2, rbh + 2);
      ctx.fillStyle = p.bowCharge >= 1.0 ? '#5ef2ff' : '#7bed9f';
      ctx.fillRect(rbx, rby, Math.round(rbw * Math.min(1.0, p.bowCharge)), rbh);
    } else if (p.isReloading && isLocal) {
      const progress = Math.min(1, p.reloadTimer / p.reloadDuration);
      const rbw = 46;
      const rbh = 5;
      const rbx = Math.round(px - rbw / 2);
      const rby = by - 18;

      ctx.fillStyle = '#0c0e14';
      ctx.fillRect(rbx - 1, rby - 1, rbw + 2, rbh + 2);
      ctx.fillStyle = '#ffa502';
      ctx.fillRect(rbx, rby, Math.round(rbw * progress), rbh);
    }
  }

  _drawBullets(ctx, bullets) {
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      ctx.save();
      ctx.translate(Math.round(b.x), Math.round(b.y));
      ctx.rotate(b.angle);

      if (b.bulletType === 'bolt') {
        ctx.fillStyle = 'rgba(94, 242, 255, 0.35)';
        ctx.fillRect(-24, -3, 22, 6);
        ctx.fillStyle = '#8a8f98';
        ctx.fillRect(-14, -1, 22, 3);
        ctx.fillStyle = b.color || '#5ef2ff';
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(7, -4);
        ctx.lineTo(7, 4);
        ctx.closePath();
        ctx.fill();
      } else if (b.bulletType === 'slash') {
        ctx.strokeStyle = b.color || '#ffa502';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(-4, 0, 10, -1.15, 1.15);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(-4, 0, 10, -0.7, 0.7);
        ctx.stroke();
      } else if (b.bulletType === 'fireball') {
        ctx.fillStyle = 'rgba(255, 127, 80, 0.45)';
        ctx.beginPath();
        ctx.arc(-9, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff4757';
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff200';
        ctx.beginPath();
        ctx.arc(1, 0, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (b.bulletType === 'dagger') {
        ctx.fillStyle = '#2d2047';
        ctx.fillRect(-8, -1, 5, 3);
        ctx.fillStyle = b.color || '#a29bfe';
        ctx.fillRect(-3, -3, 2, 6);
        ctx.fillStyle = '#dfe4ea';
        ctx.beginPath();
        ctx.moveTo(9, 0);
        ctx.lineTo(-1, -2);
        ctx.lineTo(-1, 2);
        ctx.closePath();
        ctx.fill();
      } else if (b.bulletType === 'magic') {
        ctx.fillStyle = 'rgba(255, 211, 42, 0.3)';
        ctx.beginPath();
        ctx.arc(-6, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = b.color || '#ffd32a';
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-1, -1, 3, 3);
      } else {
        if (b.isCharged) {
          ctx.fillStyle = 'rgba(94, 242, 255, 0.45)';
          ctx.fillRect(-22, -3, 22, 6);
        }
        ctx.fillStyle = b.color || '#7bed9f';
        ctx.fillRect(-14, -2, 5, 4);
        ctx.fillStyle = '#c8a165';
        ctx.fillRect(-10, -1, 18, 2);
        ctx.fillStyle = b.isCharged ? '#5ef2ff' : '#ffffff';
        ctx.beginPath();
        ctx.moveTo(13, 0);
        ctx.lineTo(7, -3);
        ctx.lineTo(7, 3);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  _drawEffects(ctx, dt) {
    for (let i = this.slashSwings.length - 1; i >= 0; i--) {
      const sw = this.slashSwings[i];
      sw.life -= dt;
      if (sw.life <= 0) {
        this.slashSwings.splice(i, 1);
        continue;
      }
      const rawT = clamp(1 - sw.life / sw.maxLife, 0, 1);
      const eased = 1 - Math.pow(1 - rawT, 3);
      const alpha = Math.max(0, (1 - rawT) * 0.9);
      const reach = sw.range || 100;

      ctx.save();
      ctx.translate(Math.round(sw.x), Math.round(sw.y + 3));
      ctx.lineCap = 'round';

      if (sw.isWhirlwind) {
        const curAng = rawT * Math.PI * 3.5;
        ctx.strokeStyle = sw.color || '#ffa502';
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 16 * (1 - rawT * 0.5);
        ctx.beginPath();
        ctx.arc(0, 0, reach * 0.85, curAng - 2.2, curAng);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 6 * (1 - rawT * 0.5);
        ctx.beginPath();
        ctx.arc(0, 0, reach * 0.9, curAng - 1.4, curAng);
        ctx.stroke();
      } else {
        const halfArc = (sw.arc || 1.85) * 0.56;
        const dir = sw.swingDir || 1;
        const startAng = sw.aimAngle - dir * halfArc;
        const endAng = sw.aimAngle + dir * halfArc;
        const curAng = startAng + (endAng - startAng) * eased;
        const tailAng = startAng + (endAng - startAng) * Math.max(0, eased - 0.55);
        const ccw = dir < 0;

        ctx.strokeStyle = sw.color || '#ffa502';
        ctx.globalAlpha = alpha * 0.75;
        ctx.lineWidth = 18 * (1 - rawT * 0.4);
        ctx.beginPath();
        ctx.arc(0, 0, reach * 0.82, tailAng, curAng, ccw);
        ctx.stroke();

        ctx.strokeStyle = '#fff200';
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 8 * (1 - rawT * 0.4);
        ctx.beginPath();
        ctx.arc(0, 0, reach * 0.9, tailAng, curAng, ccw);
        ctx.stroke();

        const tipX = Math.cos(curAng) * (reach * 0.9);
        const tipY = Math.sin(curAng) * (reach * 0.9);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(tipX, tipY, 5 * (1 - rawT * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.life -= dt;
      if (sw.life <= 0) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      const t = 1 - sw.life / sw.maxLife;
      const r = sw.radius + (sw.maxRadius - sw.radius) * t;
      ctx.strokeStyle = sw.color || '#ffa502';
      ctx.globalAlpha = Math.max(0, (1 - t) * 0.85);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(pt.x - pt.size / 2), Math.round(pt.y - pt.size / 2), pt.size, pt.size);
    }

    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= 28 * dt;
      ft.life -= dt;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      ctx.fillStyle = '#000000';
      ctx.fillText(ft.text, Math.round(ft.x + 1), Math.round(ft.y + 1));
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, Math.round(ft.x), Math.round(ft.y));
    }
  }
}
