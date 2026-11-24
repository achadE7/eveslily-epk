/**
 * Celestial Shooting Star Canvas for "Perayaan Bintang Jatuh" Hero.
 * - Sparse pinpoint night-sky stars with gentle magnitude twinkle.
 * - Periodic diagonal warm-gold meteor trails (falling stars).
 * - Automatically paused under prefers-reduced-motion: reduce.
 * - Controlled by an explicit accessible Pause/Play toggle button (R-39).
 */

export function initSkyCanvas(canvasEl, toggleBtn) {
  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');
  if (!ctx) return;

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let isPaused = reducedMotionQuery.matches;
  let rafId = 0;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let stars = [];
  let meteors = [];
  let lastTime = 0;
  let nextMeteorIn = 1800;

  function syncToggleUI() {
    if (!toggleBtn) return;
    toggleBtn.setAttribute('aria-pressed', String(isPaused));
    const label = toggleBtn.querySelector('[data-sky-label]');
    if (label) {
      label.textContent = isPaused ? 'Putar langit bintang' : 'Jeda langit bintang';
    }
  }

  function seedStars() {
    const count = Math.max(48, Math.min(130, Math.floor((width * height) / 11500)));
    stars = Array.from({ length: count }, (_, idx) => {
      const bright = idx % 9 === 0;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        r: bright ? 1.35 + Math.random() * 0.7 : 0.65 + Math.random() * 0.75,
        baseAlpha: bright ? 0.62 : 0.25 + Math.random() * 0.35,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.8,
        tint: bright ? '242, 201, 125' : '226, 232, 248'
      };
    });
  }

  function spawnMeteor() {
    const startX = width * (0.28 + Math.random() * 0.65);
    const startY = height * (0.04 + Math.random() * 0.32);
    const length = Math.min(width * 0.22, 160 + Math.random() * 110);
    const speed = 420 + Math.random() * 240;
    const angle = (142 + Math.random() * 14) * (Math.PI / 180);

    meteors.push({
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      length,
      life: 0,
      maxLife: 0.85 + Math.random() * 0.45
    });
  }

  function resize() {
    const rect = canvasEl.getBoundingClientRect();
    width = Math.max(300, Math.floor(rect.width));
    height = Math.max(300, Math.floor(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvasEl.width = width * dpr;
    canvasEl.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seedStars();
    renderFrame(performance.now(), 0, true);
  }

  function renderFrame(now, dtSec, staticOnly = false) {
    ctx.clearRect(0, 0, width, height);

    for (const s of stars) {
      const alpha = staticOnly
        ? s.baseAlpha
        : s.baseAlpha * (0.72 + 0.28 * Math.sin(now * 0.001 * s.speed + s.phase));
      ctx.beginPath();
      ctx.fillStyle = `rgba(${s.tint}, ${alpha.toFixed(3)})`;
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (staticOnly) {
      // Draw one delicate static falling-star streak so reduced-motion still shows the motif
      const sx = width * 0.78;
      const sy = height * 0.14;
      const ex = sx - 115;
      const ey = sy + 64;
      const grad = ctx.createLinearGradient(sx, sy, ex, ey);
      grad.addColorStop(0, 'rgba(242, 201, 125, 0)');
      grad.addColorStop(1, 'rgba(242, 201, 125, 0.75)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      return;
    }

    nextMeteorIn -= dtSec * 1000;
    if (nextMeteorIn <= 0 && meteors.length < 2) {
      spawnMeteor();
      nextMeteorIn = 2600 + Math.random() * 3400;
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
      const speedMag = Math.hypot(m.vx, m.vy) || 1;
      const tailX = m.x - (m.vx / speedMag) * m.length;
      const tailY = m.y - (m.vy / speedMag) * m.length;

      const grad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
      grad.addColorStop(0, 'rgba(242, 201, 125, 0)');
      grad.addColorStop(0.7, `rgba(242, 201, 125, ${(opacity * 0.45).toFixed(3)})`);
      grad.addColorStop(1, `rgba(255, 246, 224, ${(opacity * 0.95).toFixed(3)})`);

      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(m.x, m.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 248, 232, ${(opacity * 0.95).toFixed(3)})`;
      ctx.arc(m.x, m.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
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
    rafId = window.requestAnimationFrame(loop);
  }

  function stop() {
    window.cancelAnimationFrame(rafId);
    renderFrame(performance.now(), 0, true);
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      isPaused = !isPaused;
      syncToggleUI();
      if (isPaused) {
        stop();
      } else {
        start();
      }
    });
  }

  reducedMotionQuery.addEventListener('change', (event) => {
    isPaused = event.matches;
    syncToggleUI();
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
  syncToggleUI();
  resize();
  if (!isPaused) start();
}
