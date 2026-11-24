import { loadEpkData, mountDraftBanner } from './data-store.js';
import {
  escapeHtml,
  initNavigation,
  initScrollReveal,
  openPhotoLightbox,
  renderContactSection,
  renderErrorState,
  safeUrl
} from './ui-shared.js';

async function boot() {
  initNavigation();
  initScrollReveal();

  const filtersEl = document.getElementById('press-filters');
  const gridEl = document.getElementById('press-gallery');
  const summaryEl = document.getElementById('press-summary');

  try {
    const { data, source } = await loadEpkData();
    mountDraftBanner(source);
    renderContactSection(document.getElementById('contact'), data);

    const photos = Array.isArray(data.pressPhotos) ? data.pressPhotos : [];
    const years = ['Semua', ...new Set(photos.map((p) => p.year).filter(Boolean))];
    let activeYear = 'Semua';

    function renderFilters() {
      filtersEl.innerHTML = years
        .map(
          (yr) => `
          <button
            type="button"
            class="filter-chip"
            data-year="${escapeHtml(yr)}"
            aria-pressed="${String(yr === activeYear)}"
          >${escapeHtml(yr)}</button>`
        )
        .join('');

      filtersEl.querySelectorAll('.filter-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
          activeYear = btn.dataset.year || 'Semua';
          renderFilters();
          renderGallery();
        });
      });
    }

    function renderGallery() {
      const visible = activeYear === 'Semua' ? photos : photos.filter((p) => p.year === activeYear);
      if (summaryEl) {
        summaryEl.textContent = `Menampilkan ${visible.length} dari ${photos.length} dokumentasi panggung Eve's Lily. Klik foto untuk melihat ukuran penuh.`;
      }

      if (!visible.length) {
        gridEl.innerHTML = `
          <div class="state-box" style="grid-column:1/-1">
            <p class="state-box__title">Belum ada foto untuk filter ini</p>
            <p class="state-box__desc">Pilih tahun lain atau tambahkan dokumentasi baru melalui halaman Editor EPK.</p>
            <button type="button" class="btn btn--gold btn--sm" id="reset-press-filter">Tampilkan Semua Foto</button>
          </div>
        `;
        gridEl.querySelector('#reset-press-filter')?.addEventListener('click', () => {
          activeYear = 'Semua';
          renderFilters();
          renderGallery();
        });
        return;
      }

      gridEl.innerHTML = visible
        .map((photo, idx) => {
          const igHref = safeUrl(photo.instagramUrl);
          return `
            <article class="photo-card">
              <button type="button" class="photo-card__trigger" data-photo-idx="${idx}" aria-label="Perbesar foto ${escapeHtml(photo.title)}">
                <img
                  class="photo-card__img"
                  src="${escapeHtml(safeUrl(photo.image))}"
                  alt="${escapeHtml(`${photo.title} di ${photo.venue || ''} ${photo.year || ''}`.trim())}"
                  width="${Number(photo.width) || 800}"
                  height="${Number(photo.height) || 533}"
                  loading="${idx < 3 ? 'eager' : 'lazy'}"
                />
                <span class="photo-card__zoom-hint" aria-hidden="true">Perbesar</span>
              </button>
              <div class="photo-card__body">
                <h2 class="photo-card__title">${escapeHtml(photo.title)}</h2>
                <p class="photo-card__meta">${escapeHtml([photo.venue, photo.year].filter(Boolean).join(', '))}</p>
                <div class="photo-card__footer">
                  ${igHref !== '#' ? `<a href="${escapeHtml(igHref)}" target="_blank" rel="noopener noreferrer" class="btn btn--outline-dark btn--sm">Lihat di Instagram</a>` : ''}
                </div>
              </div>
            </article>
          `;
        })
        .join('');

      gridEl.querySelectorAll('[data-photo-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          openPhotoLightbox(visible, Number(btn.dataset.photoIdx), btn);
        });
      });
    }

    renderFilters();
    renderGallery();
  } catch (err) {
    renderErrorState(gridEl, err.message, boot);
  }
}

boot();
