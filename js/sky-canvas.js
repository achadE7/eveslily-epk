/**
 * Dual-Layer Celestial Milky Way & Crossing Shooting Stars Engine
 * Theme: "Perayaan Bintang Jatuh" (Cobalt Cosmos, Cyan Milky Way, Rose Comet Dust)
 *
 * Layer 1 (backCanvas, z-index 1, behind band portrait):
 *   - Deep cobalt night sky + diagonal luminous Milky Way river (cobalt, cyan, rose-pink, white core)
 *   - Organic dark cosmic dust rifts for photographic depth
 *   - Billowing nocturnal clouds with backlit silver-cyan rims parting around the Milky Way
 *   - Dense twinkling starfield + 4-point celestial star glints
 *
 * Layer 2 (frontCanvas, z-index 5, in front of band portrait, pointer-events: none):
 *   - Graceful diagonal falling stars (cyan-white and signature rose-pink comets)
 *     passing directly across the sky AND across the Eve's Lily portrait
 *   - Subtle foreground floating cloud mist wisps at lower corners + occasional front glints
 *
 * Automatically freezes into a serene static Milky Way + static crossing meteors
 * under prefers-reduced-motion: reduce.
 */

export function initSkyCanvas(backCanvas, frontCanvas) {
  if (!backCanvas) return;
  const bCtx = backCanvas.getContext('2d');
  const fCtx = frontCanvas ? frontCanvas.getContext('2d') : null;
  if (!bCtx) return;

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let isPaused = reducedMotionQuery.matches;
  let rafId = 0;
  let width = 0;
  let height = 0;
  let dpr = 1;

  let staticBg = null;
  let stars = [];
  let frontGlints = [];
  let meteors = [];
  let lastTime = 0;
  let nextMeteorIn = 320;

  // Deterministic PRNG so Milky Way clouds & rifts keep a crafted composition across frames
  function createRng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function drawFourPointStar(ctx, x, y, radius, alpha, rgb) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
    ctx.lineWidth = 1.05;
    ctx.beginPath();
    ctx.moveTo(-radius, 0);
    ctx.lineTo(radius, 0);
    ctx.moveTo(0, -radius);
    ctx.lineTo(0, radius);
    ctx.stroke();

    // Soft core glow dot
    ctx.fillStyle = `rgba(255, 255, 255, ${(alpha * 0.9).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(1.1, radius * 0.2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCloudBank(ctx, cx, cy, rx, ry, puffCount, rng, fillRgba, rimRgba) {
    ctx.save();
    // Subtle backlit rim puff slightly above each dark night cloud
    if (rimRgba) {
      for (let i = 0; i < puffCount; i++) {
        const t = puffCount > 1 ? i / (puffCount - 1) : 0.5;
        const px = cx + (t - 0.5) * rx * 1.9 + (rng() - 0.5) * rx * 0.25;
        const py = cy - ry * 0.22 - Math.sin(t * Math.PI) * ry * 0.45 + (rng() - 0.5) * ry * 0.2;
        const pr = ry * (0.58 + rng() * 0.55);
        const g = ctx.createRadialGradient(px, py, pr * 0.08, px, py, pr);
        g.addColorStop(0, rimRgba);
        g.addColorStop(1, 'rgba(111, 216, 255, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Main dark cobalt-indigo billowing cloud body
    for (let i = 0; i < puffCount + 3; i++) {
      const t = i / (puffCount + 2);
      const px = cx + (t - 0.5) * rx * 2.1 + (rng() - 0.5) * rx * 0.22;
      const py = cy + (rng() - 0.5) * ry * 0.38 - Math.sin(t * Math.PI) * ry * 0.28;
      const pr = ry * (0.65 + rng() * 0.6);
      const g = ctx.createRadialGradient(px, py, pr * 0.15, px, py, pr);
      g.addColorStop(0, fillRgba);
      g.addColorStop(0.62, fillRgba);
      g.addColorStop(1, 'rgba(4, 10, 30, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function buildStaticMilkyWay() {
    const off = document.createElement('canvas');
    off.width = width * dpr;
    off.height = height * dpr;
    const ctx = off.getContext('2d');
    if (!ctx) return off;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rng = createRng(20261124);

    // 1. Deep royal cobalt sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, width * 0.35, height);
    skyGrad.addColorStop(0, '#040c26');
    skyGrad.addColorStop(0.42, '#081b4d');
    skyGrad.addColorStop(0.78, '#05102f');
    skyGrad.addColorStop(1, '#040a1e');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Diagonal Milky Way river sweeping from upper-left through center behind Eve's Lily to lower-right
    const startX = width * 0.14;
    const startY = -height * 0.08;
    const endX = width * 0.86;
    const endY = height * 1.06;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // Broad outer cobalt & cyan nebula glow along Milky Way spine (vivid Perayaan Bintang Jatuh tones)
    for (let i = 0; i < 56; i++) {
      const t = i / 55;
      const curveOffset = Math.sin(t * Math.PI * 1.65) * width * 0.06;
      const bx = startX + (endX - startX) * t + curveOffset + (rng() - 0.5) * width * 0.17;
      const by = startY + (endY - startY) * t + (rng() - 0.5) * height * 0.11;
      const r = Math.min(width, height) * (0.13 + rng() * 0.21);

      const pick = rng();
      let c0 = 'rgba(28, 118, 255, 0.22)';
      let c1 = 'rgba(18, 72, 198, 0.07)';
      if (pick < 0.42) {
        // Luminous Perayaan Bintang Jatuh sky cyan
        c0 = 'rgba(72, 222, 255, 0.24)';
        c1 = 'rgba(28, 138, 245, 0.08)';
      } else if (pick < 0.68) {
        // Signature comet rose-pink & violet nebula wisp
        c0 = 'rgba(245, 164, 216, 0.21)';
        c1 = 'rgba(168, 112, 245, 0.06)';
      } else if (pick < 0.84) {
        // Starlight pale aqua-white core glow
        c0 = 'rgba(224, 248, 255, 0.20)';
        c1 = 'rgba(92, 208, 255, 0.07)';
      }

      const g = ctx.createRadialGradient(bx, by, r * 0.05, bx, by, r);
      g.addColorStop(0, c0);
      g.addColorStop(0.5, c1);
      g.addColorStop(1, 'rgba(4, 10, 30, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Secondary brighter Milky Way clouds flanking left & right of the band portrait
    const flankSpots = [
      { x: width * 0.13, y: height * 0.2, r: width * 0.22, col: 'rgba(76, 224, 255, 0.28)' },
      { x: width * 0.22, y: height * 0.46, r: width * 0.19, col: 'rgba(245, 164, 216, 0.22)' },
      { x: width * 0.86, y: height * 0.28, r: width * 0.2, col: 'rgba(66, 192, 255, 0.22)' },
      { x: width * 0.8, y: height * 0.66, r: width * 0.22, col: 'rgba(245, 164, 216, 0.22)' },
      { x: width * 0.72, y: height * 0.84, r: width * 0.2, col: 'rgba(78, 222, 255, 0.24)' },
      { x: width * 0.5, y: height * 0.16, r: width * 0.24, col: 'rgba(111, 216, 255, 0.20)' }
    ];
    for (const sp of flankSpots) {
      const g = ctx.createRadialGradient(sp.x, sp.y, sp.r * 0.05, sp.x, sp.y, sp.r);
      g.addColorStop(0, sp.col);
      g.addColorStop(1, 'rgba(4, 10, 30, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // 3. Subtle dark cosmic dust rift carving depth along the Milky Way core
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      const rx = startX + (endX - startX) * t + (rng() - 0.5) * width * 0.08;
      const ry = startY + (endY - startY) * t + (rng() - 0.5) * height * 0.08;
      const rad = Math.min(width, height) * (0.07 + rng() * 0.09);
      const g = ctx.createRadialGradient(rx, ry, rad * 0.1, rx, ry, rad);
      g.addColorStop(0, 'rgba(4, 10, 30, 0.34)');
      g.addColorStop(1, 'rgba(4, 10, 30, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(rx, ry, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Fine static Milky Way stardust (hundreds of tiny sparkling specks concentrated on the river)
    const dustCount = Math.max(180, Math.min(420, Math.floor((width * height) / 3600)));
    for (let i = 0; i < dustCount; i++) {
      const alongBand = rng() < 0.72;
      let sx;
      let sy;
      if (alongBand) {
        const t = rng();
        const spread = (rng() + rng() - 1) * width * 0.24;
        sx = startX + (endX - startX) * t + spread;
        sy = startY + (endY - startY) * t + (rng() + rng() - 1) * height * 0.14;
      } else {
        sx = rng() * width;
        sy = rng() * height;
      }
      const r = 0.45 + rng() * 0.9;
      const a = 0.2 + rng() * 0.58;
      const colorPick = rng();
      const rgb =
        colorPick < 0.32 ? '111, 216, 255' : colorPick < 0.48 ? '245, 164, 216' : '242, 247, 255';
      ctx.fillStyle = `rgba(${rgb}, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. Subtle high-altitude night clouds framing upper sky flanks above the lunar horizon
    drawCloudBank(
      ctx,
      width * 0.88,
      height * 0.18,
      width * 0.22,
      height * 0.1,
      7,
      rng,
      'rgba(6, 18, 52, 0.45)',
      'rgba(111, 216, 255, 0.14)'
    );
    drawCloudBank(
      ctx,
      width * 0.1,
      height * 0.32,
      width * 0.2,
      height * 0.1,
      7,
      rng,
      'rgba(6, 18, 52, 0.42)',
      'rgba(111, 216, 255, 0.16)'
    );

    return off;
  }

  function seedDynamicStars() {
    const count = Math.max(60, Math.min(130, Math.floor((width * height) / 10500)));
    stars = Array.from({ length: count }, (_, idx) => {
      const isGlint = idx % 8 === 0;
      const tintPick = idx % 7;
      let tint = '242, 247, 255';
      if (tintPick === 0 || tintPick === 3) tint = '111, 216, 255';
      else if (tintPick === 5) tint = '245, 164, 216';

      return {
        x: Math.random() * width,
        y: Math.random() * height,
        r: isGlint ? 1.55 + Math.random() * 0.65 : 0.7 + Math.random() * 0.85,
        baseAlpha: isGlint ? 0.85 : 0.35 + Math.random() * 0.45,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.1,
        tint,
        isGlint
      };
    });

    // Subtle delicate star glints floating gently near the feathered edges of the band portrait
    frontGlints = Array.from({ length: 14 }, (_, idx) => {
      const edgeSide = idx % 2 === 0 ? 0.14 + Math.random() * 0.24 : 0.62 + Math.random() * 0.24;
      return {
        x: width * edgeSide,
        y: height * (0.12 + Math.random() * 0.58),
        r: 3.5 + Math.random() * 3.5,
        baseAlpha: 0.35 + Math.random() * 0.38,
        phase: Math.random() * Math.PI * 2,
        speed: 0.7 + Math.random() * 0.9,
        tint: idx % 3 === 0 ? '245, 164, 216' : '111, 216, 255'
      };
    });
  }

  function spawnMeteor(forceHeroCrossing = false, forcePink = false) {
    const isPink = forcePink || Math.random() < 0.46;
    // Roughly 65% of meteors arc cleanly across the central band portrait area
    const crossCenter = forceHeroCrossing || Math.random() < 0.65;
    const startX = crossCenter
      ? width * (0.46 + Math.random() * 0.44)
      : width * (0.18 + Math.random() * 0.8);
    const startY = crossCenter
      ? height * (0.04 + Math.random() * 0.36)
      : height * (0.02 + Math.random() * 0.45);

    const length = isPink
      ? Math.min(width * 0.32, 210 + Math.random() * 130)
      : Math.min(width * 0.24, 145 + Math.random() * 105);
    const speed = isPink ? 470 + Math.random() * 190 : 390 + Math.random() * 220;
    const angle = (142 + Math.random() * 13) * (Math.PI / 180);

    meteors.push({
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      length,
      life: 0,
      maxLife: 0.9 + Math.random() * 0.55,
      tailRgb: isPink ? '245, 164, 216' : '111, 216, 255',
      secondaryRgb: isPink ? '111, 216, 255' : '242, 247, 255',
      thickness: isPink ? 2.4 : 1.65
    });
  }

  function drawMeteorStreak(ctx, m, opacity) {
    const speedMag = Math.hypot(m.vx, m.vy) || 1;
    const tailX = m.x - (m.vx / speedMag) * m.length;
    const tailY = m.y - (m.vy / speedMag) * m.length;

    ctx.save();
    // Outer soft luminous comet tail
    const outerGrad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
    outerGrad.addColorStop(0, `rgba(${m.tailRgb}, 0)`);
    outerGrad.addColorStop(0.55, `rgba(${m.tailRgb}, ${(opacity * 0.4).toFixed(3)})`);
    outerGrad.addColorStop(1, `rgba(${m.secondaryRgb}, ${(opacity * 0.72).toFixed(3)})`);
    ctx.strokeStyle = outerGrad;
    ctx.lineWidth = m.thickness * 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(m.x, m.y);
    ctx.stroke();

    // Crisp inner comet core
    const coreGrad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
    coreGrad.addColorStop(0, `rgba(${m.tailRgb}, 0)`);
    coreGrad.addColorStop(0.68, `rgba(${m.tailRgb}, ${(opacity * 0.72).toFixed(3)})`);
    coreGrad.addColorStop(1, `rgba(255, 255, 255, ${(opacity * 0.98).toFixed(3)})`);
    ctx.strokeStyle = coreGrad;
    ctx.lineWidth = m.thickness;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(m.x, m.y);
    ctx.stroke();

    // Bright 4-point comet head flare
    drawFourPointStar(ctx, m.x, m.y, m.thickness * 3.4, opacity * 0.92, '242, 247, 255');
    ctx.restore();
  }

  function renderFrame(now, dtSec, staticOnly = false) {
    // 1. Background Milky Way + Night Clouds + Twinkling Stars
    bCtx.clearRect(0, 0, width, height);
    if (staticBg) {
      bCtx.drawImage(staticBg, 0, 0, width, height);
    }

    for (const s of stars) {
      const alpha = staticOnly
        ? s.baseAlpha
        : s.baseAlpha * (0.62 + 0.38 * Math.sin(now * 0.001 * s.speed + s.phase));

      bCtx.beginPath();
      bCtx.fillStyle = `rgba(${s.tint}, ${alpha.toFixed(3)})`;
      bCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      bCtx.fill();

      if (s.isGlint) {
        drawFourPointStar(bCtx, s.x, s.y, s.r * 3.3, alpha * 0.75, s.tint);
      }
    }

    // 2. Foreground Canvas (Meteors passing RIGHT ACROSS the band photo + delicate edge glints)
    const targetMeteorCtx = fCtx || bCtx;
    if (fCtx) {
      fCtx.clearRect(0, 0, width, height);
      for (const g of frontGlints) {
        const a = staticOnly
          ? g.baseAlpha * 0.75
          : g.baseAlpha * (0.5 + 0.5 * Math.sin(now * 0.001 * g.speed + g.phase));
        drawFourPointStar(fCtx, g.x, g.y, g.r, a, g.tint);
      }
    }

    if (staticOnly) {
      // Static crossing meteors across both sky and photo for reduced-motion preference
      const staticMeteors = [
        { x: width * 0.56, y: height * 0.44, vx: -420, vy: 285, length: Math.min(width * 0.28, 220), tailRgb: '245, 164, 216', secondaryRgb: '111, 216, 255', thickness: 2.3 },
        { x: width * 0.32, y: height * 0.28, vx: -390, vy: 255, length: Math.min(width * 0.2, 150), tailRgb: '111, 216, 255', secondaryRgb: '242, 247, 255', thickness: 1.6 },
        { x: width * 0.78, y: height * 0.24, vx: -400, vy: 270, length: Math.min(width * 0.22, 165), tailRgb: '111, 216, 255', secondaryRgb: '242, 247, 255', thickness: 1.6 }
      ];
      for (const sm of staticMeteors) {
        drawMeteorStreak(targetMeteorCtx, sm, 0.85);
      }
      return;
    }

    nextMeteorIn -= dtSec * 1000;
    if (nextMeteorIn <= 0 && meteors.length < 5) {
      spawnMeteor(false, false);
      nextMeteorIn = 800 + Math.random() * 1050;
    }

    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.life += dtSec;
      m.x += m.vx * dtSec;
      m.y += m.vy * dtSec;

      const progress = m.life / m.maxLife;
      if (progress >= 1) {
        meteors.splice(i, 1);
        continue;
      }

      const opacity = Math.sin(progress * Math.PI);
      drawMeteorStreak(targetMeteorCtx, m, opacity);
    }
  }

  function resize() {
    const rect = backCanvas.getBoundingClientRect();
    width = Math.max(300, Math.floor(rect.width));
    height = Math.max(300, Math.floor(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    backCanvas.width = width * dpr;
    backCanvas.height = height * dpr;
    bCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (frontCanvas && fCtx) {
      frontCanvas.width = width * dpr;
      frontCanvas.height = height * dpr;
      fCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    staticBg = buildStaticMilkyWay();
    seedDynamicStars();
    renderFrame(performance.now(), 0, true);
  }

  function loop(now) {
    if (isPaused) return;
    const dtSec = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0.016;
    lastTime = now;
    renderFrame(now, dtSec, false);
    rafId = window.requestAnimationFrame(loop);
  }

  function start() {
    if (isPaused) return;
    lastTime = 0;
    window.cancelAnimationFrame(rafId);
    if (!meteors.length) {
      spawnMeteor(true, true);
      spawnMeteor(true, false);
    }
    rafId = window.requestAnimationFrame(loop);
  }

  function stop() {
    window.cancelAnimationFrame(rafId);
    renderFrame(performance.now(), 0, true);
  }

  reducedMotionQuery.addEventListener('change', (event) => {
    isPaused = event.matches;
    if (isPaused) stop();
    else start();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      window.cancelAnimationFrame(rafId);
    } else if (!isPaused) {
      start();
    }
  });

  window.addEventListener('resize', resize, { passive: true });
  resize();
  if (!isPaused) start();
}
