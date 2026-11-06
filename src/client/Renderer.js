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
          spec.id === 'sniper' || spec.id === 'shotgun' || spec.id === 'launcher'
            ? 2.2
            : 0.9;
        this.camera.shake = Math.min(this.camera.shake + shakeAmt, 4.0);
        const pColor = spec.bulletColor || '#ffd32a';
        const sparkCount = spec.id === 'shotgun' ? 5 : 3;
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

    // 3. 원형 경기장 지형지물 (암석 기둥 / 강철 샌드백 / 고폭 드럼통)
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

    // 5. 총기별 탄환 궤적 렌더링
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
    const img = this.sprites.get(`${cls}_${frame}`) || this.sprites.get('rifle_0');
    const wepImg = this.sprites.get(`weapon_${cls}`);

    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);

    // 1. 내 캐릭터 발밑 식별 서클 & 총기별 조준선
    if (isLocal) {
      ctx.strokeStyle = 'rgba(94, 242, 255, 0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py + 4, 20, 0, Math.PI * 2);
      ctx.stroke();

      const maxAimLen =
        cls === 'shotgun'
          ? 210
          : cls === 'sniper'
            ? 460
            : cls === 'launcher'
              ? 300
              : 320;
      const laserLen = p.isReloading ? 80 : maxAimLen;
      const startX = px + Math.cos(p.aimAngle) * 18;
      const startY = py + Math.sin(p.aimAngle) * 18;
      const endX = px + Math.cos(p.aimAngle) * laserLen;
      const endY = py + Math.sin(p.aimAngle) * laserLen;

      const aimColor = spec.bulletColor || '#7bed9f';

      ctx.save();
      if (cls === 'shotgun' && !p.isReloading) {
        ctx.strokeStyle = 'rgba(255, 165, 2, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(
          px + Math.cos(p.aimAngle - 0.18) * laserLen,
          py + Math.sin(p.aimAngle - 0.18) * laserLen
        );
        ctx.moveTo(startX, startY);
        ctx.lineTo(
          px + Math.cos(p.aimAngle + 0.18) * laserLen,
          py + Math.sin(p.aimAngle + 0.18) * laserLen
        );
        ctx.stroke();
      }

      ctx.strokeStyle = p.isReloading ? 'rgba(255, 165, 2, 0.3)' : `${aimColor}88`;
      ctx.lineWidth = p.isFiring ? 2.2 : 1.5;
      ctx.setLineDash(cls === 'sniper' ? [] : [6, 6]);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = aimColor;
      ctx.fillRect(Math.round(endX - 3), Math.round(endY - 3), 6, 6);

      if (cls === 'launcher' && !p.isReloading) {
        ctx.strokeStyle = 'rgba(255, 107, 129, 0.32)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(endX, endY, 44, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
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

    // 3. 방탄 버프 오라 표시
    if (p.guardBuffTimer > 0) {
      ctx.strokeStyle = 'rgba(255, 165, 2, 0.8)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(px, py, 24, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 4. 군인 본체 도트 렌더링
    const facingRight = Math.cos(p.aimAngle) >= 0;
    ctx.save();
    ctx.translate(Math.round(px), Math.round(py));
    if (!facingRight) ctx.scale(-1, 1);
    ctx.drawImage(img, Math.round(-w / 2), Math.round(-h / 2), w, h);
    ctx.restore();

    // 5. 장착 총기 회전 렌더링
    if (wepImg) {
      const gw = Math.round(wepImg.width * 2.5);
      const gh = Math.round(wepImg.height * 2.5);
      const recoilOffset = p.swingVisualTimer > 0 ? -3 : 2;
      ctx.save();
      ctx.translate(Math.round(px), Math.round(py + 3));
      ctx.rotate(p.aimAngle);
      if (!facingRight) ctx.scale(1, -1);
      ctx.drawImage(wepImg, recoilOffset, Math.round(-gh / 2), gw, gh);
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

    // 7. 재장전 게이지 바
    if (p.isReloading && isLocal) {
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

      if (b.bulletType === 'sniper') {
        ctx.fillStyle = b.color || '#5ef2ff';
        ctx.fillRect(-18, -2, 30, 5);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-6, -1, 18, 3);
      } else if (b.bulletType === 'shotgun') {
        ctx.fillStyle = b.color || '#ffa502';
        ctx.fillRect(-4, -3, 9, 6);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(1, -2, 4, 4);
      } else if (b.bulletType === 'launcher') {
        ctx.fillStyle = '#57606f';
        ctx.fillRect(-8, -5, 16, 10);
        ctx.fillStyle = '#ff4757';
        ctx.fillRect(0, -5, 9, 10);
        ctx.fillStyle = '#ffd32a';
        ctx.fillRect(3, -3, 5, 6);
      } else if (b.bulletType === 'smg') {
        ctx.fillStyle = b.color || '#a29bfe';
        ctx.fillRect(-8, -2, 15, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(2, -1, 4, 2);
      } else if (b.bulletType === 'lmg') {
        ctx.fillStyle = b.color || '#ffd32a';
        ctx.fillRect(-9, -2, 16, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(2, -1, 5, 2);
      } else {
        ctx.fillStyle = b.color || '#7bed9f';
        ctx.fillRect(-10, -2, 17, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(3, -1, 4, 2);
      }
      ctx.restore();
    }
  }

  _drawEffects(ctx, dt) {
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
