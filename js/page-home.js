import { loadEpkData, mountDraftBanner } from './data-store.js';
import { initSkyCanvas } from './sky-canvas.js';
import {
  escapeHtml,
  extractSpotifyEmbedUrl,
  initNavigation,
  initScrollReveal,
  openPhotoLightbox,
  openVideoModal,
  playAudioPreview,
  renderContactSection,
  renderErrorState,
  safeUrl,
  showToast
} from './ui-shared.js';

function renderHero(data) {
  const { meta, hero } = data;
  const eraWrap = document.getElementById('hero-era');
  if (eraWrap) {
    if (meta?.era?.enabled && meta.era.title) {
      eraWrap.hidden = false;
      eraWrap.innerHTML = `
        <svg class="hero__era-star" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2L12 2z"/>
        </svg>
        <span>${escapeHtml(meta.era.label || 'Rilisan Mendatang')}:</span>
        <span class="hero__era-title">${escapeHtml(meta.era.title)}</span>
      `;
    } else {
      eraWrap.hidden = true;
    }
  }

  const photo = document.getElementById('hero-photo');
  if (photo && hero?.image) {
    photo.src = safeUrl(hero.image);
    photo.alt = hero.imageAlt || `Foto formasi band ${meta?.bandName || "Eve's Lily"}`;
    if (hero.imageWidth) photo.width = Number(hero.imageWidth);
    if (hero.imageHeight) photo.height = Number(hero.imageHeight);
  }

  const logo = document.getElementById('hero-logo');
  if (logo && hero?.logoWordmark) {
    logo.src = safeUrl(hero.logoWordmark);
    if (hero.logoWordmarkWidth) logo.width = Number(hero.logoWordmarkWidth);
    if (hero.logoWordmarkHeight) logo.height = Number(hero.logoWordmarkHeight);
  }

  const quote = document.getElementById('hero-quote');
  if (quote && hero?.lyricQuote) {
    quote.textContent = `"${hero.lyricQuote}"`;
  }

  const quoteSource = document.getElementById('hero-quote-source');
  if (quoteSource) {
    quoteSource.textContent = hero?.lyricSource || '';
    quoteSource.hidden = !hero?.lyricSource;
  }
}

function renderProfilePreview(data) {
  const root = document.getElementById('profile-content');
  if (!root) return;
  const bio = data.biography || {};
  const highlights = Array.isArray(bio.highlights) ? bio.highlights : [];
  const paragraphs = Array.isArray(bio.paragraphs) ? bio.paragraphs : [];

  const factsHtml = highlights
    .map(
      (item, idx) => `
      <div class="fact-list__item ${idx === highlights.length - 1 && highlights.length % 2 === 1 ? 'fact-list__item--wide' : ''}">
        <dt class="fact-list__label">${escapeHtml(item.label)}</dt>
        <dd class="fact-list__value">${escapeHtml(item.value)}</dd>
      </div>`
    )
    .join('');

  const proseHtml = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');

  root.innerHTML = `
    <div class="profile-grid">
      <div class="profile-visual">
        <div class="torn-frame">
          <img
            src="${escapeHtml(safeUrl(bio.bandPhoto || 'assets/brand/bio-band.jpg'))}"
            alt="${escapeHtml(bio.bandPhotoAlt || "Foto personel Eve's Lily")}"
            width="${Number(bio.bandPhotoWidth) || 800}"
            height="${Number(bio.bandPhotoHeight) || 533}"
            loading="lazy"
          />
        </div>
        ${factsHtml ? `<dl class="fact-list">${factsHtml}</dl>` : ''}
      </div>

      <div class="profile-copy">
        <h2 class="profile-copy__heading">${escapeHtml(bio.headline || "Eve's Lily")}</h2>
        <div class="prose">${proseHtml}</div>
        <div class="profile-copy__cta">
          <a href="./biography.html" class="btn btn--gold">Baca Biografi &amp; Personel</a>
          <a href="#contact" class="btn btn--outline-dark">Hubungi Booking</a>
        </div>
      </div>
    </div>
  `;
}

function renderDiscography(data) {
  const spotlightEl = document.getElementById('discog-spotlight');
  const filterEl = document.getElementById('discog-filters');
  const gridEl = document.getElementById('discog-grid');
  if (!spotlightEl || !filterEl || !gridEl) return;

  const releases = Array.isArray(data.discography) ? data.discography : [];
  const dsp = data.dsp || {};
  const defaultSpotifyEmbed = dsp.spotifyArtistId
    ? `https://open.spotify.com/embed/artist/${encodeURIComponent(dsp.spotifyArtistId)}?utm_source=generator&theme=0`
    : extractSpotifyEmbedUrl(dsp.spotifyArtistUrl);

  const featured = releases.find((r) => r.featured) || releases[0];

  if (!releases.length) {
    spotlightEl.innerHTML = '';
    filterEl.innerHTML = '';
    gridEl.innerHTML = `
      <div class="state-box" style="grid-column:1/-1">
        <p class="state-box__title">Belum ada data rilis di discography</p>
        <p class="state-box__desc">Tambahkan single atau mini album melalui halaman Editor EPK agar muncul di sini.</p>
        <a href="./admin.html" class="btn btn--solid-light btn--sm">Buka Editor EPK</a>
      </div>
    `;
    return;
  }

  const dspButtons = [
    dsp.spotifyArtistUrl ? `<a class="btn btn--solid-light btn--sm" href="${escapeHtml(safeUrl(dsp.spotifyArtistUrl))}" target="_blank" rel="noopener noreferrer">Spotify</a>` : '',
    dsp.youtubeMusicUrl ? `<a class="btn btn--outline-light btn--sm" href="${escapeHtml(safeUrl(dsp.youtubeMusicUrl))}" target="_blank" rel="noopener noreferrer">YouTube Music</a>` : '',
    dsp.appleMusicUrl ? `<a class="btn btn--outline-light btn--sm" href="${escapeHtml(safeUrl(dsp.appleMusicUrl))}" target="_blank" rel="noopener noreferrer">Apple Music</a>` : ''
  ].join('');

  spotlightEl.innerHTML = `
    <div class="featured-release">
      <img
        class="featured-release__cover"
        src="${escapeHtml(safeUrl(featured.cover))}"
        alt="Sampul ${escapeHtml(featured.title)}"
        width="${Number(featured.coverWidth) || 480}"
        height="${Number(featured.coverHeight) || 480}"
        loading="lazy"
      />
      <div>
        <span class="featured-release__tag">Rilisan Terbaru</span>
        <h3 class="featured-release__title">${escapeHtml(featured.title)}</h3>
        <p class="featured-release__meta">${escapeHtml([featured.type, featured.releaseDate || featured.year].filter(Boolean).join(' / '))}</p>
        ${featured.subtitle ? `<p class="featured-release__meta">${escapeHtml(featured.subtitle)}</p>` : ''}
        <div class="dsp-row">${dspButtons}</div>
      </div>
    </div>

    <div class="spotify-box">
      ${
        defaultSpotifyEmbed
          ? `<div class="spotify-box__fallback" aria-hidden="true">
              <strong style="color:var(--ink-on-dark)">Pemutar Spotify Eve's Lily</strong>
              <span>Jika pemutar belum muncul, gunakan tombol Spotify di sebelah kiri.</span>
            </div>
            <iframe
              id="spotify-embed-frame"
              title="Pemutar Spotify Eve's Lily"
              src="${escapeHtml(defaultSpotifyEmbed)}"
              width="100%"
              height="352"
              loading="lazy"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            ></iframe>`
          : `<div class="state-box" style="height:100%;justify-content:center"><p class="state-box__title">Pemutar Spotify belum dikonfigurasi</p><p class="state-box__desc">Masukkan tautan Spotify Artist di Editor EPK.</p></div>`
      }
    </div>
  `;

  const categories = ['Semua', ...new Set(releases.map((r) => r.category || r.type).filter(Boolean))];
  let activeCategory = 'Semua';

  function renderFilterChips() {
    filterEl.innerHTML = categories
      .map(
        (cat) => `
        <button
          type="button"
          class="filter-chip"
          data-cat="${escapeHtml(cat)}"
          aria-pressed="${String(cat === activeCategory)}"
        >${escapeHtml(cat)}</button>`
      )
      .join('');

    filterEl.querySelectorAll('.filter-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.cat || 'Semua';
        renderFilterChips();
        renderCatalog();
      });
    });
  }

  function renderCatalog() {
    const filtered =
      activeCategory === 'Semua'
        ? releases
        : releases.filter((r) => (r.category || r.type) === activeCategory);

    if (!filtered.length) {
      gridEl.innerHTML = `
        <div class="state-box" style="grid-column:1/-1">
          <p class="state-box__title">Tidak ada rilis pada kategori "${escapeHtml(activeCategory)}"</p>
          <p class="state-box__desc">Pilih kategori lain untuk melihat katalog Eve's Lily.</p>
          <button type="button" class="btn btn--outline-light btn--sm" id="reset-discog-filter">Tampilkan Semua</button>
        </div>
      `;
      gridEl.querySelector('#reset-discog-filter')?.addEventListener('click', () => {
        activeCategory = 'Semua';
        renderFilterChips();
        renderCatalog();
      });
      return;
    }

    gridEl.innerHTML = filtered
      .map((item) => {
        const isEp = item.type === 'EP' || (Array.isArray(item.tracklist) && item.tracklist.length > 0);
        const tracklistHtml =
          Array.isArray(item.tracklist) && item.tracklist.length
            ? `<ol class="tracklist">${item.tracklist.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ol>`
            : '';

        const hasAudio = Boolean(item.audioPreviewUrl);
        const itemSpotifyEmbed = extractSpotifyEmbedUrl(item.spotifyUrl);
        const listenHref = safeUrl(item.spotifyUrl || dsp.spotifyArtistUrl);

        let actionHtml = '';
        if (hasAudio) {
          actionHtml += `<button type="button" class="btn btn--solid-light btn--sm" data-play-audio="${escapeHtml(item.id)}">Putar Pratinjau</button>`;
        }
        if (itemSpotifyEmbed) {
          actionHtml += `<button type="button" class="btn btn--outline-light btn--sm" data-load-spotify="${escapeHtml(itemSpotifyEmbed)}" data-track-title="${escapeHtml(item.title)}">Muat di Pemutar</button>`;
        } else if (listenHref !== '#') {
          actionHtml += `<a class="btn btn--outline-light btn--sm" href="${escapeHtml(listenHref)}" target="_blank" rel="noopener noreferrer">Dengarkan di Spotify</a>`;
        }

        return `
          <article class="release-card ${isEp ? 'release-card--ep' : ''}">
            <div class="release-card__media">
              <img
                class="release-card__cover"
                src="${escapeHtml(safeUrl(item.cover))}"
                alt="Sampul ${escapeHtml(item.title)}"
                width="${Number(item.coverWidth) || 480}"
                height="${Number(item.coverHeight) || 480}"
                loading="lazy"
              />
            </div>
            <div class="release-card__body">
              <span class="release-card__type">${escapeHtml(item.type)} (${escapeHtml(item.year)})</span>
              <h3 class="release-card__title">${escapeHtml(item.title)}</h3>
              ${item.subtitle ? `<p class="release-card__sub">${escapeHtml(item.subtitle)}</p>` : ''}
              ${tracklistHtml}
              <div class="release-card__actions">${actionHtml}</div>
            </div>
          </article>
        `;
      })
      .join('');

    gridEl.querySelectorAll('[data-play-audio]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const track = releases.find((r) => r.id === btn.dataset.playAudio);
        if (track) playAudioPreview(track);
      });
    });

    gridEl.querySelectorAll('[data-load-spotify]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const frame = document.getElementById('spotify-embed-frame');
        if (frame) {
          frame.src = btn.dataset.loadSpotify;
          frame.scrollIntoView({ behavior: 'smooth', block: 'center' });
          showToast(`Memuat "${btn.dataset.trackTitle}" di pemutar Spotify.`);
        }
      });
    });
  }

  renderFilterChips();
  renderCatalog();
}

function renderPressHighlights(data) {
  const root = document.getElementById('press-spotlight');
  const countBtn = document.getElementById('press-all-btn');
  if (!root) return;

  const allPhotos = Array.isArray(data.pressPhotos) ? data.pressPhotos : [];
  if (countBtn && allPhotos.length) {
    countBtn.textContent = `Lihat Semua ${allPhotos.length} Foto Panggung`;
  }

  const highlights = allPhotos.filter((p) => p.highlight).slice(0, 3);
  const items = highlights.length ? highlights : allPhotos.slice(0, 3);

  if (!items.length) {
    root.innerHTML = `
      <div class="state-box">
        <p class="state-box__title">Belum ada foto panggung</p>
        <p class="state-box__desc">Tambahkan dokumentasi panggung Eve's Lily melalui Editor EPK.</p>
      </div>
    `;
    return;
  }

  function cardMarkup(photo, index, isHero) {
    const igHref = safeUrl(photo.instagramUrl);
    return `
      <article class="photo-card ${isHero ? 'press-spotlight__hero' : ''}">
        <button type="button" class="photo-card__trigger" data-lightbox-index="${index}" aria-label="Perbesar foto ${escapeHtml(photo.title)}">
          <img
            class="photo-card__img"
            src="${escapeHtml(safeUrl(photo.image))}"
            alt="${escapeHtml(`${photo.title} di ${photo.venue || ''} ${photo.year || ''}`.trim())}"
            width="${Number(photo.width) || 800}"
            height="${Number(photo.height) || 533}"
            loading="lazy"
          />
          <span class="photo-card__zoom-hint" aria-hidden="true">Perbesar</span>
        </button>
        <div class="photo-card__body">
          <h3 class="photo-card__title">${escapeHtml(photo.title)}</h3>
          <p class="photo-card__meta">${escapeHtml([photo.venue, photo.year].filter(Boolean).join(', '))}</p>
          <div class="photo-card__footer">
            ${igHref !== '#' ? `<a href="${escapeHtml(igHref)}" target="_blank" rel="noopener noreferrer" class="btn btn--outline-dark btn--sm">Buka di Instagram</a>` : ''}
          </div>
        </div>
      </article>
    `;
  }

  const [first, ...rest] = items;
  root.innerHTML = `
    <div class="press-spotlight">
      ${cardMarkup(first, 0, true)}
      <div class="press-spotlight__stack">
        ${rest.map((item, idx) => cardMarkup(item, idx + 1, false)).join('')}
      </div>
    </div>
  `;

  root.querySelectorAll('[data-lightbox-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openPhotoLightbox(items, Number(btn.dataset.lightboxIndex), btn);
    });
  });
}

function renderShowsPreview(data) {
  const root = document.getElementById('shows-preview');
  const ctaBtn = document.getElementById('shows-all-btn');
  if (!root) return;

  const shows = Array.isArray(data.shows) ? data.shows : [];
  if (ctaBtn && shows.length) {
    ctaBtn.textContent = `Lihat Semua ${shows.length} Jadwal & Arsip`;
  }

  if (!shows.length) {
    root.innerHTML = `
      <div class="state-box">
        <p class="state-box__title">Belum ada jadwal panggung tercatat</p>
        <p class="state-box__desc">Tambahkan jadwal panggung mendatang atau arsip penampilan melalui Editor EPK.</p>
      </div>
    `;
    return;
  }

  const upcoming = shows.filter((s) => s.upcoming);
  const past = shows.filter((s) => !s.upcoming).slice(0, upcoming.length ? 3 : 4);
  const previewList = [...upcoming, ...past];

  root.innerHTML = `
    <ol class="shows-ledger">
      ${previewList
        .map(
          (show) => `
          <li class="show-row">
            <span class="show-row__date">${escapeHtml(show.date)}</span>
            <span class="show-row__event">
              ${escapeHtml(show.event)}
              ${show.upcoming ? '<span class="show-row__badge">Akan Datang</span>' : ''}
            </span>
            <span class="show-row__meta">${escapeHtml([show.location ? `(${show.location})` : '', show.featuring].filter(Boolean).join(' '))}</span>
          </li>`
        )
        .join('')}
    </ol>
  `;
}

function renderVideos(data) {
  const root = document.getElementById('videos-grid');
  if (!root) return;

  const videos = Array.isArray(data.videos) ? data.videos : [];
  if (!videos.length) {
    root.innerHTML = `
      <div class="state-box">
        <p class="state-box__title">Belum ada video penampilan</p>
        <p class="state-box__desc">Tambahkan tautan YouTube melalui Editor EPK.</p>
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="video-layout">
      ${videos
        .map(
          (video, idx) => `
          <article class="video-card ${idx === 0 || video.featured ? 'video-card--featured' : ''}">
            <button type="button" class="video-card__thumb-btn" data-video-index="${idx}" aria-label="Putar video ${escapeHtml(video.title)}">
              <img
                class="video-card__img"
                src="${escapeHtml(safeUrl(video.thumbnail))}"
                alt="Cuplikan video ${escapeHtml(video.title)}"
                width="${Number(video.thumbWidth) || 854}"
                height="${Number(video.thumbHeight) || 480}"
                loading="lazy"
              />
              <span class="video-card__play" aria-hidden="true">
                <span class="video-card__play-circle">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </span>
              </span>
            </button>
            <div class="video-card__body">
              <span class="video-card__meta">${escapeHtml([video.venue, video.year].filter(Boolean).join(' / '))}</span>
              <h3 class="video-card__title">${escapeHtml(video.title)}</h3>
              <div class="video-card__actions">
                <button type="button" class="btn btn--gold btn--sm" data-video-index="${idx}">Putar Video</button>
                <a href="${escapeHtml(safeUrl(video.youtubeUrl))}" target="_blank" rel="noopener noreferrer" class="btn btn--outline-dark btn--sm">Buka di YouTube</a>
              </div>
            </div>
          </article>`
        )
        .join('')}
    </div>
  `;

  root.querySelectorAll('[data-video-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = videos[Number(btn.dataset.videoIndex)];
      if (item) openVideoModal(item, btn);
    });
  });
}

async function boot() {
  initNavigation();
  initSkyCanvas(document.getElementById('cosmos-sky'), document.getElementById('sky-toggle'));
  initScrollReveal();

  try {
    const { data, source } = await loadEpkData();
    mountDraftBanner(source);
    renderHero(data);
    renderProfilePreview(data);
    renderDiscography(data);
    renderPressHighlights(data);
    renderShowsPreview(data);
    renderVideos(data);
    renderContactSection(document.getElementById('contact'), data);
  } catch (err) {
    renderErrorState(document.getElementById('profile-content'), err.message, boot);
  }
}

boot();
