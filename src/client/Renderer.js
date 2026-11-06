// ============================================================================
// [Client] 원형 배틀로얄: 랜덤 무기 서바이벌 (CIRCLE ROYALE) Canvas 2D 렌더러
// 원형 경기장, 축소되는 자기장(Storm Ring), 6종 랜덤 무기 궤적 및 생존자 렌더링
// ============================================================================

import { WORLD_CONFIG, resolveWeaponSpec } from '../shared/constants.js';
import { clamp, lerp } from '../shared/math.js';
import { PixelSprites } from './PixelSprites.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sprites = new PixelSprites();

    this.camera = { x: WORLD_CONFIG.CENTER_X, y: WORLD_CONFIG.CENTER_Y, shake: 0 };
    this.particles = [];
    this.floatingTexts = [];
    this.groundStains = [];
    this.shockwaves = [];
    this.slashSwings = [];
  }

  resize(width, height) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.viewW = width;
    this.viewH = height;
    this.dpr = dpr;
  }

  getPlayerScreenPos(localPlayer) {
    if (!localPlayer) {
      return { x: this.viewW / 2, y: this.viewH / 2 };
    }
    return {
      x: localPlayer.x - this.camera.x + this.viewW / 2,
      y: localPlayer.y - this.camera.y + this.viewH / 2,
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
        for (let k = 0; k < 12; k++) {
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
        for (let k = 0; k < 18; k++) {
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
        for (let k = 0; k < 22; k++) {
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
        for (let k = 0; k < 12; k++) {
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
    // 본인이 살아있으면 본인을 비추고, 탈락했으면 살아있는 생존자를 관전!
    const focusTarget =
      (myPlayer && myPlayer.alive ? myPlayer : null) ||
      snapshot.players.find((p) => p.alive) ||
      myPlayer ||
      snapshot.players[0];

    if (focusTarget) {
      const targetCamX = clamp(
        focusTarget.x,
        WORLD_CONFIG.CENTER_X - 420,
        WORLD_CONFIG.CENTER_X + 420
      );
      const targetCamY = clamp(
        focusTarget.y,
        WORLD_CONFIG.CENTER_Y - 420,
        WORLD_CONFIG.CENTER_Y + 420
      );
      this.camera.x = lerp(this.camera.x, targetCamX, Math.min(1, dt * 8));
      this.camera.y = lerp(this.camera.y, targetCamY, Math.min(1, dt * 8));
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

    // 원형 경기장 바깥 배경 (심연의 블랙/네이비)
    ctx.fillStyle = '#07090e';
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    ctx.save();
    const camLeft = Math.round(this.camera.x - this.viewW / 2 + shakeX);
    const camTop = Math.round(this.camera.y - this.viewH / 2 + shakeY);
    ctx.translate(-camLeft, -camTop);

    // 1. 원형 경기장 바닥 & 동심원 전술 링 & 자기장(Safe Zone) 렌더링
    this._drawCircularArena(ctx, snapshot, camLeft, camTop);

    // 2. 바닥 흔적
    this._drawGroundDetails(ctx);

    // 3. 원형 경기장 지형지물 (고대 바위 기둥 / 나무 방책 / 폭발 화약통)
    if (snapshot.obstacles) {
      for (let i = 0; i < snapshot.obstacles.length; i++) {
        this._drawObstacle(ctx, snapshot.obstacles[i]);
      }
    }

    // 4. 참가 생존자들 (탈락자 마커 -> 생존자 순으로 렌더링)
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

    // 5. 무기별 투사체(화살·검기·마법탄) 궤적 렌더링
    this._drawBullets(ctx, snapshot.bullets);

    // 6. 충격파, 파티클, 플로팅 텍스트
    this._drawEffects(ctx, dt);

    ctx.restore();
    ctx.restore();
  }

  _drawCircularArena(ctx, snapshot, camLeft, camTop) {
    const cx = snapshot.centerX || WORLD_CONFIG.CENTER_X;
    const cy = snapshot.centerY || WORLD_CONFIG.CENTER_Y;
    const arenaR = snapshot.arenaRadius || WORLD_CONFIG.ARENA_RADIUS;
    const safeR = snapshot.safeRadius ?? arenaR;

    const tile = this.sprites.get('alien_tile');
    const ts = WORLD_CONFIG.TILE_SIZE;

    // 원형 경기장 내부만 클리핑하여 타일 바닥 렌더링
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, arenaR, 0, Math.PI * 2);
    ctx.clip();

    const startCol = Math.max(0, Math.floor((cx - arenaR) / ts));
    const endCol = Math.ceil((cx + arenaR) / ts);
    const startRow = Math.max(0, Math.floor((cy - arenaR) / ts));
    const endRow = Math.ceil((cy + arenaR) / ts);

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        ctx.drawImage(tile, c * ts, r * ts, ts, ts);
      }
    }

    // 원형 경기장 내부 동심원 전술 가이드 라인
    ctx.strokeStyle = 'rgba(94, 242, 255, 0.08)';
    ctx.lineWidth = 2;
    for (const ringR of [160, 320, 490]) {
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 십자 중심선
    ctx.beginPath();
    ctx.moveTo(cx - arenaR, cy);
    ctx.lineTo(cx + arenaR, cy);
    ctx.moveTo(cx, cy - arenaR);
    ctx.lineTo(cx, cy + arenaR);
    ctx.stroke();

    // [자기장 / 독가스 위험 구역] safeR 바깥 ~ arenaR 사이를 붉은 반투명 도넛으로 표시
    if (safeR < arenaR) {
      ctx.fillStyle = 'rgba(255, 45, 85, 0.24)';
      ctx.beginPath();
      ctx.arc(cx, cy, arenaR, 0, Math.PI * 2, false);
      ctx.arc(cx, cy, safeR, 0, Math.PI * 2, true);
      ctx.fill();
    }
    ctx.restore();

    // 안전지대(Safe Zone) 경계 링
    ctx.save();
    ctx.strokeStyle = safeR < arenaR ? '#ff4757' : 'rgba(94, 242, 255, 0.45)';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([14, 8]);
    ctx.beginPath();
    ctx.arc(cx, cy, safeR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 원형 경기장 외벽 강철 링
    ctx.strokeStyle = '#3d4656';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, arenaR + 4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#ffa502';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, arenaR, 0, Math.PI * 2);
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

    // 1. 내 캐릭터 발밑 식별 서클 & 무기별 조준선
    if (isLocal) {
      ctx.strokeStyle = 'rgba(94, 242, 255, 0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py + 4, 20, 0, Math.PI * 2);
      ctx.stroke();

      if (spec.isMelee) {
        // [전사]: 정적인 색칠 부채꼴 대신 깔끔한 전방 사거리 가이드 호(Arc)와 중심 방향 마커만 은은하게 표시
        const reach = spec.meleeRange || 100;
        const halfArc = (spec.meleeArc || 1.85) * 0.5;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 165, 2, 0.36)';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(px, py + 3, reach, p.aimAngle - halfArc, p.aimAngle + halfArc);
        ctx.stroke();
        ctx.setLineDash([]);

        // 전방 끝점 조준 포인터
        const tipX = px + Math.cos(p.aimAngle) * (reach * 0.82);
        const tipY = py + 3 + Math.sin(p.aimAngle) * (reach * 0.82);
        ctx.fillStyle = 'rgba(255, 211, 42, 0.65)';
        ctx.beginPath();
        ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        // [궁수 및 마법사]: 원거리 조준선
        const isArcher = cls === 'archer' || cls === 'bow' || cls === 'crossbow';
        const laserLen = p.isReloading ? 90 : (isArcher ? 520 : 340);
        const startX = px + Math.cos(p.aimAngle) * 18;
        const startY = py + Math.sin(p.aimAngle) * 18;
        const endX = px + Math.cos(p.aimAngle) * laserLen;
        const endY = py + Math.sin(p.aimAngle) * laserLen;
        const aimColor = spec.bulletColor || '#7bed9f';

        ctx.save();
        ctx.strokeStyle = p.isReloading ? 'rgba(255, 165, 2, 0.35)' : `${aimColor}aa`;
        ctx.lineWidth = p.isFiring ? 2.4 : 1.6;
        ctx.setLineDash(isArcher ? [6, 6] : [4, 4]);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = aimColor;
        ctx.fillRect(Math.round(endX - 3), Math.round(endY - 3), 6, 6);

        if (cls === 'mage' || cls === 'staff') {
          // 마법 폭발 반경 가이드 서클
          ctx.strokeStyle = 'rgba(224, 86, 253, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(endX, endY, 38, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    } else {
      // 적 생존자 발밑 붉은 링
      ctx.strokeStyle = 'rgba(255, 71, 87, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py + 4, 18, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 2. 발밑 그림자
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(Math.round(px - 15), Math.round(py + 15), 30, 7);

    // 3. 강철 수호(가드) 버프 오라 표시
    if (p.guardBuffTimer > 0) {
      ctx.strokeStyle = 'rgba(255, 165, 2, 0.8)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(px, py, 24, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 상태이상: 둔화(Slow) 서리 링
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
    // 상태이상: 화상(Burn)
    if (p.burnTimer > 0) {
      ctx.save();
      ctx.fillStyle = '#ff4757';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('🔥 화상', px, py - h / 2 - 16);
      ctx.restore();
    }

    // 4. 판타지 전사 본체 도트 렌더링
    const facingRight = Math.cos(p.aimAngle) >= 0;
    ctx.save();
    ctx.translate(Math.round(px), Math.round(py));
    if (!facingRight) ctx.scale(-1, 1);
    ctx.drawImage(img, Math.round(-w / 2), Math.round(-h / 2), w, h);
    ctx.restore();

    // 5. 장착 무기 회전 및 전사 대검 휘두르기(Swing) 모션 렌더링
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
        let weaponAngle = p.aimAngle - dir * 0.55; // 평상시 대검 준비 자세(어깨 옆으로 비스듬히 파지)
        let thrustOffset = 4;

        if (p.whirlwindTimer > 0) {
          // [회전 참격 스킬]: 360도 고속 2회전 스핀 모션
          const wt = 1 - p.whirlwindTimer / 0.42;
          weaponAngle = p.aimAngle + wt * Math.PI * 4;
          thrustOffset = 14;
        } else if (p.swingVisualTimer > 0) {
          // [기본 공격]: 대검을 반대편에서 반대편 끝까지 호쾌하게 가로베는 휘두르기 모션
          const dur = p.swingDuration || 0.28;
          const rawT = clamp(1 - p.swingVisualTimer / dur, 0, 1);
          // 빠른 초반 가속 후 묵직한 마무리 (Ease-out cubic)
          const eased = 1 - Math.pow(1 - rawT, 3);
          const startAng = p.aimAngle - dir * halfArc;
          const endAng = p.aimAngle + dir * halfArc;
          weaponAngle = startAng + (endAng - startAng) * eased;
          thrustOffset = 4 + Math.sin(rawT * Math.PI) * 16;

          // 휘두르는 동안 실시간 초승달 검기 잔상(Crescent Blade Trail) 렌더링
          const reach = spec.meleeRange || 100;
          const trailSpan = (weaponAngle - startAng);
          if (Math.abs(trailSpan) > 0.05) {
            ctx.save();
            const ccw = dir < 0;
            // 바깥쪽 황금빛 검기 호
            ctx.strokeStyle = 'rgba(255, 165, 2, 0.85)';
            ctx.lineWidth = 14 * (1 - rawT * 0.45);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(0, 0, reach * 0.78, startAng, weaponAngle, ccw);
            ctx.stroke();

            // 안쪽 눈부신 백색 칼날 궤적
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

    // 6. 머리 위 이름 + 현재 들고 있는 랜덤 무기 아이콘 + HP 바 표시
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

    // 7. 차징 게이지 바 (활 시위 당김) 또는 재장전 게이지 바
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
        // 드워프 석궁 룬 볼트: 굵은 강철 몸체 + 시안 룬 잔광
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
        // 대검 검기: 초승달 모양 베기 궤적
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
        // 화염구: 불꽃 꼬리 + 붉은 구체 + 노란 코어
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
        // 투척 단검: 보랏빛 손잡이 + 은빛 칼날
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
        // 비전 마력탄: 빛나는 구체 + 잔상
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
        // 엘프 화살: 나무 화살대 + 깃털 + 화살촉
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

        // 검기 외곽 황금 궤적
        ctx.strokeStyle = sw.color || '#ffa502';
        ctx.globalAlpha = alpha * 0.75;
        ctx.lineWidth = 18 * (1 - rawT * 0.4);
        ctx.beginPath();
        ctx.arc(0, 0, reach * 0.82, tailAng, curAng, ccw);
        ctx.stroke();

        // 날카로운 검끝 코어 궤적
        ctx.strokeStyle = '#fff200';
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 8 * (1 - rawT * 0.4);
        ctx.beginPath();
        ctx.arc(0, 0, reach * 0.9, tailAng, curAng, ccw);
        ctx.stroke();

        // 칼끝 위치에 번쩍이는 참격 스파크
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
