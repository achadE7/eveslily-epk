/**
 * Shared UI helpers for Eve's Lily EPK
 */

export function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function extractYouTubeId(urlOrId) {
  const raw = String(urlOrId || '').trim();
  if (!raw) return '';
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  const match = raw.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : '';
}

export function extractSpotifyEmbedUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const match = raw.match(/open\.spotify\.com\/(artist|album|track|playlist)\/([a-zA-Z0-9]+)/);
  if (!match) return '';
  return `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator&theme=0`;
}

export function safeUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '#';
  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('mailto:') ||
    raw.startsWith('./') ||
    raw.startsWith('assets/') ||
    raw.startsWith('data:image/')
  ) {
    return raw;
  }
  return '#';
}

/* ==========================================================================
   Toast
   ========================================================================== */
let toastTimer = 0;

export function showToast(message) {
  let el = document.getElementById('site-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'site-toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.hidden = true;
  }, 3200);
}

/* ==========================================================================
   Mobile Drawer Navigation
   ========================================================================== */
export function initNavigation() {
  const toggleBtn = document.getElementById('nav-toggle');
  const drawer = document.getElementById('mobile-drawer');
  const closeBtn = document.getElementById('drawer-close');
  const backdrop = document.getElementById('drawer-backdrop');

  if (!toggleBtn || !drawer) return;

  function openDrawer() {
    drawer.dataset.open = 'true';
    drawer.setAttribute('aria-hidden', 'false');
    toggleBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    if (closeBtn) closeBtn.focus();
  }

  function closeDrawer() {
    if (drawer.dataset.open !== 'true') return;
    drawer.dataset.open = 'false';
    drawer.setAttribute('aria-hidden', 'true');
    toggleBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    toggleBtn.focus();
  }

  toggleBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drawer.dataset.open === 'true') {
      closeDrawer();
    }
  });
}

/* ==========================================================================
   Scroll Reveal (Single Pass)
   ========================================================================== */
export function initScrollReveal() {
  const targets = document.querySelectorAll('.reveal');
  if (!targets.length) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.08, rootMargin: '0px 0px -24px 0px' }
  );

  targets.forEach((el) => observer.observe(el));
}

/* ==========================================================================
   Accessible Dialog Manager (Video Player & Photo Lightbox)
   ========================================================================== */
let activeModal = null;
let lastFocusBeforeModal = null;

function ensureModalRoot() {
  let modal = document.getElementById('media-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'media-modal';
  modal.className = 'modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal__dialog" role="dialog" aria-modal="true" aria-labelledby="media-modal-title">
      <div class="modal__header">
        <h2 id="media-modal-title" class="modal__title"></h2>
        <button type="button" class="icon-btn" id="media-modal-close" aria-label="Tutup jendela">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="modal__body" id="media-modal-body"></div>
      <div class="modal__footer" id="media-modal-footer"></div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeMediaModal();
  });

  modal.querySelector('#media-modal-close').addEventListener('click', closeMediaModal);

  document.addEventListener('keydown', (event) => {
    if (!activeModal || activeModal.hidden) return;
    if (event.key === 'Escape') closeMediaModal();
  });

  return modal;
}

export function closeMediaModal() {
  if (!activeModal) return;
  const body = activeModal.querySelector('#media-modal-body');
  if (body) body.innerHTML = '';
  activeModal.hidden = true;
  document.body.style.overflow = '';
  if (lastFocusBeforeModal && typeof lastFocusBeforeModal.focus === 'function') {
    lastFocusBeforeModal.focus();
  }
  activeModal = null;
}

export function openVideoModal(video, triggerEl) {
  const modal = ensureModalRoot();
  lastFocusBeforeModal = triggerEl || document.activeElement;
  activeModal = modal;

  const titleEl = modal.querySelector('#media-modal-title');
  const bodyEl = modal.querySelector('#media-modal-body');
  const footerEl = modal.querySelector('#media-modal-footer');

  const ytId = extractYouTubeId(video.youtubeId || video.youtubeUrl);
  titleEl.textContent = video.title || 'Video Penampilan';

  if (ytId) {
    bodyEl.innerHTML = `
      <div class="modal__video-wrap">
        <iframe
          src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(ytId)}?autoplay=1&rel=0"
          title="${escapeHtml(video.title || "Video YouTube Eve's Lily")}"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
          width="854"
          height="480"
        ></iframe>
      </div>
    `;
  } else {
    bodyEl.innerHTML = `
      <div class="state-box">
        <p class="state-box__title">Tautan video YouTube belum valid</p>
        <p class="state-box__desc">Buka video langsung di YouTube.</p>
      </div>
    `;
  }

  const externalUrl = safeUrl(video.youtubeUrl);
  footerEl.innerHTML = `
    <span class="modal__meta">${escapeHtml([video.venue, video.year].filter(Boolean).join(', '))}</span>
    <div style="display:flex;gap:0.65rem;flex-wrap:wrap">
      ${externalUrl !== '#' ? `<a href="${escapeHtml(externalUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn--primary btn--sm">Buka di YouTube</a>` : ''}
      <button type="button" class="btn btn--outline-dark btn--sm" data-close-modal>Tutup</button>
    </div>
  `;
  footerEl.querySelector('[data-close-modal]')?.addEventListener('click', closeMediaModal);

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  modal.querySelector('#media-modal-close')?.focus();
}

export function openPhotoLightbox(photos, startIndex, triggerEl) {
  if (!Array.isArray(photos) || !photos.length) return;
  const modal = ensureModalRoot();
  lastFocusBeforeModal = triggerEl || document.activeElement;
  activeModal = modal;

  let current = Math.max(0, Math.min(startIndex, photos.length - 1));

  function renderSlide() {
    const item = photos[current];
    const titleEl = modal.querySelector('#media-modal-title');
    const bodyEl = modal.querySelector('#media-modal-body');
    const footerEl = modal.querySelector('#media-modal-footer');

    titleEl.textContent = `${item.title} (${current + 1}/${photos.length})`;
    bodyEl.innerHTML = `
      <div class="modal__photo-wrap">
        <img
          src="${escapeHtml(safeUrl(item.image))}"
          alt="${escapeHtml(`${item.title} di ${item.venue || ''} ${item.year || ''}`.trim())}"
          width="${Number(item.width) || 800}"
          height="${Number(item.height) || 533}"
        />
      </div>
    `;

    const igUrl = safeUrl(item.instagramUrl);
    footerEl.innerHTML = `
      <span class="modal__meta">${escapeHtml([item.venue, item.year].filter(Boolean).join(', '))}</span>
      <div style="display:flex;gap:0.55rem;flex-wrap:wrap">
        <button type="button" class="btn btn--outline-dark btn--sm" id="lb-prev" ${photos.length <= 1 ? 'disabled' : ''}>Sebelumnya</button>
        <button type="button" class="btn btn--outline-dark btn--sm" id="lb-next" ${photos.length <= 1 ? 'disabled' : ''}>Berikutnya</button>
        ${igUrl !== '#' ? `<a href="${escapeHtml(igUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn--primary btn--sm">Lihat di Instagram</a>` : ''}
      </div>
    `;

    footerEl.querySelector('#lb-prev')?.addEventListener('click', () => {
      current = (current - 1 + photos.length) % photos.length;
      renderSlide();
    });

    footerEl.querySelector('#lb-next')?.addEventListener('click', () => {
      current = (current + 1) % photos.length;
      renderSlide();
    });
  }

  function onKeyNav(event) {
    if (!activeModal || activeModal.hidden) {
      document.removeEventListener('keydown', onKeyNav);
      return;
    }
    if (event.key === 'ArrowLeft') {
      current = (current - 1 + photos.length) % photos.length;
      renderSlide();
    } else if (event.key === 'ArrowRight') {
      current = (current + 1) % photos.length;
      renderSlide();
    }
  }

  document.addEventListener('keydown', onKeyNav);
  renderSlide();
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  modal.querySelector('#media-modal-close')?.focus();
}

/* ==========================================================================
   Audio Preview Player
   ========================================================================== */
let audioElement = null;
let currentTrackId = null;

function ensureAudioDock() {
  let dock = document.getElementById('audio-dock');
  if (dock) return dock;

  dock = document.createElement('div');
  dock.id = 'audio-dock';
  dock.className = 'audio-dock';
  dock.hidden = true;
  dock.setAttribute('role', 'region');
  dock.setAttribute('aria-label', 'Pemutar pratinjau audio');
  dock.innerHTML = `
    <button type="button" class="btn btn--primary btn--sm" id="audio-dock-toggle">Jeda</button>
    <div class="audio-dock__info">
      <p class="audio-dock__title" id="audio-dock-title"></p>
      <p class="audio-dock__status" id="audio-dock-status">Memutar pratinjau lagu</p>
    </div>
    <button type="button" class="icon-btn" id="audio-dock-close" aria-label="Tutup pemutar audio">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    </button>
  `;
  document.body.appendChild(dock);

  audioElement = new Audio();
  const toggleBtn = dock.querySelector('#audio-dock-toggle');
  const statusEl = dock.querySelector('#audio-dock-status');
  const closeBtn = dock.querySelector('#audio-dock-close');

  toggleBtn.addEventListener('click', () => {
    if (!audioElement) return;
    if (audioElement.paused) {
      audioElement.play().catch(() => {
        statusEl.textContent = 'Gagal memutar file audio. Periksa URL pratinjau.';
      });
    } else {
      audioElement.pause();
    }
  });

  closeBtn.addEventListener('click', () => {
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }
    currentTrackId = null;
    dock.hidden = true;
  });

  audioElement.addEventListener('play', () => {
    toggleBtn.textContent = 'Jeda';
    statusEl.textContent = 'Sedang diputar';
  });

  audioElement.addEventListener('pause', () => {
    toggleBtn.textContent = 'Putar';
    statusEl.textContent = 'Dijeda';
  });

  audioElement.addEventListener('ended', () => {
    toggleBtn.textContent = 'Putar ulang';
    statusEl.textContent = 'Pratinjau selesai';
  });

  audioElement.addEventListener('error', () => {
    statusEl.textContent = 'Audio tidak dapat diputar. Pastikan tautan MP3/M4A aktif.';
  });

  return dock;
}

export function playAudioPreview(release) {
  const dock = ensureAudioDock();
  const titleEl = dock.querySelector('#audio-dock-title');
  const statusEl = dock.querySelector('#audio-dock-status');

  if (currentTrackId === release.id && audioElement && !audioElement.paused) {
    audioElement.pause();
    return;
  }

  currentTrackId = release.id;
  titleEl.textContent = `${release.title} (${release.year})`;
  statusEl.textContent = 'Memuat audio...';
  dock.hidden = false;

  audioElement.src = release.audioPreviewUrl;
  audioElement.play().catch(() => {
    statusEl.textContent = 'Audio tidak dapat diputar otomatis. Klik Putar.';
  });
}

/* ==========================================================================
   Shared Contact Section Renderer (Items 6, 11, 12)
   ========================================================================== */
export function renderContactSection(containerEl, data) {
  if (!containerEl || !data || !data.contact) return;
  const c = data.contact;
  const textWordmark = data.hero?.wordmarkTextOnly || 'assets/brand/wordmark-text-only.png';
  const waHref = c.whatsappNumber
    ? `https://wa.me/${encodeURIComponent(c.whatsappNumber)}?text=${encodeURIComponent("Halo Eve's Lily, kami ingin bertanya mengenai jadwal booking/press kit.")}`
    : '#';
  const mailHref = c.email ? `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent("Booking & Press Inquiry - Eve's Lily")}` : '#';

  const socialsHtml = (c.socials || [])
    .map(
      (s) => `
      <a class="social-item" href="${escapeHtml(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">
        <span>${escapeHtml(s.platform)}</span>
        <span class="social-item__handle">${escapeHtml(s.handle || 'Kunjungi')}</span>
      </a>`
    )
    .join('');

  containerEl.innerHTML = `
    <img
      class="contact-band__bg"
      src="${escapeHtml(safeUrl(c.backdrop || 'assets/brand/contact-backdrop.jpg'))}"
      alt=""
      aria-hidden="true"
      width="${Number(c.backdropWidth) || 1599}"
      height="${Number(c.backdropHeight) || 1066}"
      loading="lazy"
    />
    <div class="contact-band__scrim" aria-hidden="true"></div>
    <div class="container contact-band__inner">
      <h2 class="section-title contact-band__title">Contact</h2>

      <div class="contact-grid">
        <div class="contact-panel">
          <p class="contact-panel__label">${escapeHtml(c.picRole || 'PIC & Booking')}</p>
          <h3 class="contact-panel__name">${escapeHtml(c.picName)}</h3>
          <div class="contact-panel__details">
            <a class="contact-link" href="${escapeHtml(waHref)}" target="_blank" rel="noopener noreferrer">
              WhatsApp: ${escapeHtml(c.whatsappDisplay)}
            </a>
            <a class="contact-link" href="${escapeHtml(mailHref)}">
              Email: ${escapeHtml(c.email)}
            </a>
          </div>
          <div class="contact-actions">
            <a class="btn btn--primary btn--sm" href="${escapeHtml(waHref)}" target="_blank" rel="noopener noreferrer">Chat WhatsApp</a>
            <a class="btn btn--outline-dark btn--sm" href="${escapeHtml(mailHref)}">Kirim Email</a>
            <button type="button" class="btn btn--outline-dark btn--sm" id="copy-booking-btn">Salin Kontak</button>
          </div>
        </div>

        <div class="contact-panel">
          <p class="contact-panel__label">Get Social</p>
          <div class="social-list">
            ${socialsHtml || '<p class="modal__meta">Belum ada tautan media sosial.</p>'}
          </div>
        </div>
      </div>

      <img
        class="contact-wordmark"
        src="${escapeHtml(safeUrl(textWordmark))}"
        alt="Eve's Lily"
        width="${Number(data.hero?.wordmarkTextWidth) || 1308}"
        height="${Number(data.hero?.wordmarkTextHeight) || 208}"
        loading="lazy"
      />
    </div>
  `;

  const copyBtn = containerEl.querySelector('#copy-booking-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const formatted = `Eve's Lily (${c.picRole || 'PIC & Booking'})\nPIC: ${c.picName}\nWhatsApp: ${c.whatsappDisplay}\nEmail: ${c.email}`;
      try {
        await navigator.clipboard.writeText(formatted);
        copyBtn.textContent = 'Kontak Tersalin';
        showToast("Info kontak booking Eve's Lily berhasil disalin.");
        window.setTimeout(() => {
          copyBtn.textContent = 'Salin Kontak';
        }, 2400);
      } catch {
        showToast(`Kontak: ${c.picName} | WA ${c.whatsappDisplay} | ${c.email}`);
      }
    });
  }
}

export function renderErrorState(containerEl, message, onRetry) {
  if (!containerEl) return;
  containerEl.innerHTML = `
    <div class="state-box" role="alert">
      <p class="state-box__title">Data EPK belum berhasil dimuat</p>
      <p class="state-box__desc">${escapeHtml(message || 'Periksa koneksi atau pastikan file data/epk.json tersedia.')}</p>
      <button type="button" class="btn btn--primary btn--sm" data-retry-load>Muat Ulang Data</button>
    </div>
  `;
  containerEl.querySelector('[data-retry-load]')?.addEventListener('click', () => {
    if (typeof onRetry === 'function') onRetry();
    else window.location.reload();
  });
}
