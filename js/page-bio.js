import { loadEpkData, mountDraftBanner } from './data-store.js';
import {
  escapeHtml,
  initNavigation,
  initScrollReveal,
  renderContactSection,
  renderErrorState,
  safeUrl
} from './ui-shared.js';

async function boot() {
  initNavigation();
  initScrollReveal();

  const bioRoot = document.getElementById('bio-story');
  const philosophyRoot = document.getElementById('bio-philosophy');
  const membersRoot = document.getElementById('bio-members');

  try {
    const { data, source } = await loadEpkData();
    mountDraftBanner(source);
    renderContactSection(document.getElementById('contact'), data);

    const bio = data.biography || {};
    const hero = data.hero || {};
    const highlights = Array.isArray(bio.highlights) ? bio.highlights : [];
    const paragraphs = Array.isArray(bio.paragraphs) ? bio.paragraphs : [];

    bioRoot.innerHTML = `
      <div class="profile-grid">
        <div class="profile-visual">
          <div class="torn-frame">
            <img
              src="${escapeHtml(safeUrl(bio.bandPhoto || 'assets/brand/bio-band.jpg'))}"
              alt="${escapeHtml(bio.bandPhotoAlt || "Foto personel Eve's Lily")}"
              width="${Number(bio.bandPhotoWidth) || 800}"
              height="${Number(bio.bandPhotoHeight) || 533}"
              fetchpriority="high"
            />
          </div>
          ${
            highlights.length
              ? `<dl class="fact-list">${highlights
                  .map(
                    (h, idx) => `
                  <div class="fact-list__item ${idx === highlights.length - 1 && highlights.length % 2 === 1 ? 'fact-list__item--wide' : ''}">
                    <dt class="fact-list__label">${escapeHtml(h.label)}</dt>
                    <dd class="fact-list__value">${escapeHtml(h.value)}</dd>
                  </div>`
                  )
                  .join('')}</dl>`
              : ''
          }
        </div>
        <div class="profile-copy">
          <h2 class="profile-copy__heading">${escapeHtml(bio.headline || "Eve's Lily")}</h2>
          <div class="prose">
            ${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}
          </div>
        </div>
      </div>
    `;

    const philParagraphs = Array.isArray(bio.philosophyParagraphs) ? bio.philosophyParagraphs : [];
    philosophyRoot.innerHTML = `
      <div class="philosophy-grid">
        <div>
          <h2 class="section-title" style="margin-bottom:1.5rem">${escapeHtml(bio.philosophyTitle || "The Meaning of Eve's Lily")}</h2>
          <div class="prose">
            ${philParagraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}
          </div>
        </div>
        <figure class="philosophy-emblem" style="margin:0">
          <img
            src="${escapeHtml(safeUrl(hero.lilyEmblem || 'assets/brand/lily-emblem-white.png'))}"
            alt="Emblem bunga lily melingkar Eve's Lily"
            width="${Number(hero.lilyEmblemWidth) || 1599}"
            height="${Number(hero.lilyEmblemHeight) || 1035}"
            loading="lazy"
          />
          <figcaption class="philosophy-emblem__caption">Simbol kehidupan dan harapan baru</figcaption>
        </figure>
      </div>
    `;

    const members = Array.isArray(data.members) ? data.members : [];
    if (!members.length) {
      membersRoot.innerHTML = `
        <div class="state-box">
          <p class="state-box__title">Belum ada data personel</p>
          <p class="state-box__desc">Tambahkan daftar personel melalui Editor EPK.</p>
        </div>
      `;
    } else {
      membersRoot.innerHTML = `
        <div class="members-list">
          ${members
            .map(
              (m, idx) => `
              <article class="member-row">
                <div class="member-row__media">
                  <img
                    class="member-row__img"
                    src="${escapeHtml(safeUrl(m.photo))}"
                    alt="${escapeHtml(`${m.name}, ${m.role} Eve's Lily`)}"
                    width="${Number(m.width) || 800}"
                    height="${Number(m.height) || 533}"
                    loading="lazy"
                  />
                </div>
                <div>
                  <p class="member-row__index">0${idx + 1} / LINEUP</p>
                  <h3 class="member-row__name">${escapeHtml(m.name)}</h3>
                  <p class="member-row__role">${escapeHtml(m.role)}</p>
                  ${m.note ? `<p class="member-row__note">${escapeHtml(m.note)}</p>` : ''}
                </div>
              </article>`
            )
            .join('')}
        </div>
      `;
    }
  } catch (err) {
    renderErrorState(bioRoot, err.message, boot);
  }
}

boot();
