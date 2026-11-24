import { loadEpkData, mountDraftBanner } from './data-store.js';
import {
  escapeHtml,
  initNavigation,
  initScrollReveal,
  renderContactSection,
  renderErrorState
} from './ui-shared.js';

async function boot() {
  initNavigation();
  initScrollReveal();

  const filtersEl = document.getElementById('schedule-filters');
  const searchInput = document.getElementById('schedule-search');
  const ledgerRoot = document.getElementById('schedule-ledger');

  try {
    const { data, source } = await loadEpkData();
    mountDraftBanner(source);
    renderContactSection(document.getElementById('contact'), data);

    const shows = Array.isArray(data.shows) ? data.shows : [];
    const years = ['Semua', ...new Set(shows.map((s) => s.year).filter(Boolean))];
    let activeYear = 'Semua';
    let query = '';

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
          renderList();
        });
      });
    }

    function renderGroup(label, items) {
      if (!items.length) return '';
      return `
        <div class="ledger-group">
          <h2 class="ledger-group__label">${escapeHtml(label)} (${items.length})</h2>
          <ol class="shows-ledger">
            ${items
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
        </div>
      `;
    }

    function renderList() {
      const normalized = query.trim().toLowerCase();
      const filtered = shows.filter((s) => {
        const yearOk = activeYear === 'Semua' || s.year === activeYear;
        if (!yearOk) return false;
        if (!normalized) return true;
        const haystack = `${s.date} ${s.event} ${s.location} ${s.featuring} ${s.year}`.toLowerCase();
        return haystack.includes(normalized);
      });

      if (!filtered.length) {
        ledgerRoot.innerHTML = `
          <div class="state-box">
            <p class="state-box__title">Tidak ada jadwal yang cocok</p>
            <p class="state-box__desc">Ubah kata kunci pencarian atau pilih tahun lain.</p>
            <button type="button" class="btn btn--primary btn--sm" id="reset-schedule-filter">Reset Pencarian</button>
          </div>
        `;
        ledgerRoot.querySelector('#reset-schedule-filter')?.addEventListener('click', () => {
          activeYear = 'Semua';
          query = '';
          if (searchInput) searchInput.value = '';
          renderFilters();
          renderList();
        });
        return;
      }

      const upcoming = filtered.filter((s) => s.upcoming);
      const past = filtered.filter((s) => !s.upcoming);

      ledgerRoot.innerHTML = `${renderGroup('Jadwal Akan Datang', upcoming)}${renderGroup('Riwayat Panggung & Guesting', past)}`;
    }

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        query = searchInput.value;
        renderList();
      });
    }

    renderFilters();
    renderList();
  } catch (err) {
    renderErrorState(ledgerRoot, err.message, boot);
  }
}

boot();
