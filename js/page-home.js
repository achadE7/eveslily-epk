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
  safeUrl
} from './ui-shared.js';

const DSP_ICONS = {
  spotify: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.58 14.42a.75.75 0 0 1-1.03.25c-2.82-1.72-6.37-2.11-10.55-1.16a.75.75 0 1 1-.33-1.46c4.57-1.04 8.5-.6 11.66 1.33a.75.75 0 0 1 .25 1.04zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.23-1.98-8.15-2.56-11.96-1.4a.94.94 0 1 1-.55-1.8c4.36-1.32 9.78-.68 13.49 1.6a.94.94 0 0 1 .31 1.29zm.13-3.4c-3.87-2.3-10.26-2.51-13.96-1.39a1.12 1.12 0 1 1-.65-2.15c4.24-1.29 11.3-1.04 15.75 1.6a1.12 1.12 0 1 1-1.14 1.94z"/></svg>`,
  appleMusic: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.75 3.25a1 1 0 0 0-1.02-.12l-8 3.2A1 1 0 0 0 9.1 7.26v8.02a3.45 3.45 0 1 0 1.8 3.02V10.1l6.4-2.56v5.74a3.45 3.45 0 1 0 1.8 3.02V4.1a1 1 0 0 0-.35-.85z"/></svg>`,
  youtubeMusic: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 17.5a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zm0-13.7a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4zm-2.1 9.1V9.1l5.1 2.9-5.1 2.9z"/></svg>`
};

function renderDspIconButtons(title, urls, fallbackDsp, variant = 'light') {
  const spotifyHref = safeUrl(urls.spotifyUrl || fallbackDsp.spotifyArtistUrl);
  const appleHref = safeUrl(urls.appleMusicUrl || fallbackDsp.appleMusicUrl);
  const ytmHref = safeUrl(urls.youtubeMusicUrl || fallbackDsp.youtubeMusicUrl);
  const cls = variant === 'dark' ? 'dsp-icon-btn dsp-icon-btn--dark' : 'dsp-icon-btn';

  const items = [
    spotifyHref !== '#'
      ? `<a class="${cls}" href="${escapeHtml(spotifyHref)}" target="_blank" rel="noopener noreferrer" aria-label="Dengarkan ${escapeHtml(title)} di Spotify" title="Spotify">${DSP_ICONS.spotify}</a>`
      : '',
    appleHref !== '#'
      ? `<a class="${cls}" href="${escapeHtml(appleHref)}" target="_blank" rel="noopener noreferrer" aria-label="Dengarkan ${escapeHtml(title)} di Apple Music" title="Apple Music">${DSP_ICONS.appleMusic}</a>`
      : '',
    ytmHref !== '#'
      ? `<a class="${cls}" href="${escapeHtml(ytmHref)}" target="_blank" rel="noopener noreferrer" aria-label="Dengarkan ${escapeHtml(title)} di YouTube Music" title="YouTube Music">${DSP_ICONS.youtubeMusic}</a>`
      : ''
  ].join('');

  return `<div class="dsp-icon-group">${items}</div>`;
}

function renderHero(data) {
  const { meta, hero } = data;

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
          <a href="./biography.html" class="btn btn--primary">Baca Biografi &amp; Personel</a>
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

  const featured =
    releases.find((r) => r.featured && !r.upcoming) ||
    releases.find((r) => !r.upcoming) ||
    releases[0];

  if (!releases.length) {
    spotlightEl.innerHTML = '';
    filterEl.innerHTML = '';
    gridEl.innerHTML = `
      <div class="state-box" style="grid-column:1/-1">
        <p class="state-box__title">Belum ada data rilis di discography</p>
      </div>
    `;
    return;
  }

  const featuredDspIcons = featured.upcoming
    ? `<span class="release-card__coming-note">Segera hadir di DSP</span>`
    : renderDspIconButtons(featured.title, featured, dsp);

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
        <div style="margin-top:0.85rem">${featuredDspIcons}</div>
      </div>
    </div>

    <div class="spotify-box">
      ${
        defaultSpotifyEmbed
          ? `<div class="spotify-box__fallback" aria-hidden="true">
              <strong style="color:var(--ink-on-dark)">Pemutar Spotify Eve's Lily</strong>
              <span>Gunakan ikon DSP di samping bila pemutar belum muncul.</span>
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
          : `<div class="state-box" style="height:100%;justify-content:center"><p class="state-box__title">Pemutar Spotify belum dikonfigurasi</p></div>`
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
        const isUpcoming = Boolean(item.upcoming);
        const tracks = Array.isArray(item.tracklist) ? item.tracklist : [];
        const tracklistHtml = tracks.length
          ? `<ol class="tracklist">${tracks
              .map(
                (t, idx) =>
                  `<li class="tracklist__item"><span class="tracklist__num">${String(idx + 1).padStart(2, '0')}</span><span>${escapeHtml(t)}</span></li>`
              )
              .join('')}</ol>`
          : '';

        const hasAudio = Boolean(item.audioPreviewUrl);
        let actionsHtml = '';

        if (isUpcoming) {
          actionsHtml = `<span class="release-card__coming-note">Rilisan Mendatang</span>`;
        } else if (isEp) {
          actionsHtml = `
            <span class="ep-listen-label">Dengarkan Mini Album</span>
            ${renderDspIconButtons(item.title, item, dsp, 'dark')}
            ${hasAudio ? `<button type="button" class="btn btn--primary btn--sm" data-play-audio="${escapeHtml(item.id)}">Pratinjau</button>` : ''}
          `;
        } else {
          actionsHtml = renderDspIconButtons(item.title, item, dsp, 'light');
          if (hasAudio) {
            actionsHtml += `<button type="button" class="btn btn--solid-light btn--sm" data-play-audio="${escapeHtml(item.id)}">Pratinjau</button>`;
          }
        }

        const cardClasses = [
          'release-card',
          isEp ? 'release-card--ep' : '',
          isUpcoming ? 'release-card--upcoming' : ''
        ]
          .filter(Boolean)
          .join(' ');

        const metaHeaderHtml = isEp
          ? `<div class="ep-head">
              <span class="release-card__type">Mini Album / ${escapeHtml(item.type)} (${escapeHtml(item.year)})</span>
              ${tracks.length ? `<span class="ep-count">${tracks.length} Lagu</span>` : ''}
            </div>`
          : `<span class="release-card__type ${isUpcoming ? 'release-card__type--upcoming' : ''}">
              ${isUpcoming ? `${escapeHtml(item.type)} / Rilisan Mendatang` : `${escapeHtml(item.type)} (${escapeHtml(item.year)})`}
            </span>`;

        const subtitleText = isEp
          ? [item.subtitle, item.releaseDate].filter(Boolean).join(' · ')
          : item.subtitle && !isUpcoming
            ? item.subtitle
            : '';

        return `
          <article class="${cardClasses}">
            <div class="release-card__media">
              <img
                class="release-card__cover ${item.blurredCover ? 'release-card__cover--blur' : ''}"
                src="${escapeHtml(safeUrl(item.cover))}"
                alt="${isUpcoming ? `Teaser sampul ${escapeHtml(item.title)}` : `Sampul ${escapeHtml(item.title)}`}"
                width="${Number(item.coverWidth) || 480}"
                height="${Number(item.coverHeight) || 480}"
                loading="lazy"
              />
              ${
                isUpcoming
                  ? `<div class="release-card__upcoming-overlay"><span class="release-card__upcoming-tag">Rilisan Mendatang</span></div>`
                  : ''
              }
            </div>
            <div class="release-card__body">
              ${metaHeaderHtml}
              <h3 class="release-card__title">${escapeHtml(item.title)}</h3>
              ${subtitleText ? `<p class="release-card__sub">${escapeHtml(subtitleText)}</p>` : ''}
              ${tracklistHtml}
              <div class="release-card__actions">${actionsHtml}</div>
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
    root.innerHTML = `<div class="state-box"><p class="state-box__title">Belum ada foto panggung</p></div>`;
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
    root.innerHTML = `<div class="state-box"><p class="state-box__title">Belum ada jadwal panggung tercatat</p></div>`;
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
    root.innerHTML = `<div class="state-box"><p class="state-box__title">Belum ada video penampilan</p></div>`;
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
                <button type="button" class="btn btn--primary btn--sm" data-video-index="${idx}">Putar Video</button>
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
  initSkyCanvas(
    document.getElementById('cosmos-sky-back'),
    document.getElementById('cosmos-sky-front')
  );
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
