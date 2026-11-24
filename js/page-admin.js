import {
  clearLocalDraft,
  fetchPublishedData,
  GITHUB_CONFIG_KEY,
  loadEpkData,
  saveLocalDraft
} from './data-store.js';
import { escapeHtml, extractYouTubeId, safeUrl, showToast } from './ui-shared.js';

let epkData = null;
let activeSection = 'hero';
let showFilterQuery = '';
let hasUnsavedChanges = false;
let ghConfig = loadGhConfig();

const SECTION_LABELS = {
  hero: 'Hero & Tema Era',
  biography: 'Biografi & Filosofi',
  members: 'Personel',
  discography: 'Discography',
  press: 'Press Photos',
  shows: 'Jadwal Panggung',
  videos: 'Video YouTube',
  contact: 'Kontak & DSP',
  github: 'Sinkronisasi GitHub',
  backup: 'Impor / Reset JSON'
};

function loadGhConfig() {
  try {
    const raw = window.localStorage.getItem(GITHUB_CONFIG_KEY);
    if (!raw) return { owner: '', repo: '', branch: 'main', token: '' };
    const parsed = JSON.parse(raw);
    return {
      owner: parsed.owner || '',
      repo: parsed.repo || '',
      branch: parsed.branch || 'main',
      token: parsed.token || ''
    };
  } catch {
    return { owner: '', repo: '', branch: 'main', token: '' };
  }
}

function saveGhConfig() {
  window.localStorage.setItem(GITHUB_CONFIG_KEY, JSON.stringify(ghConfig));
}

function setStatus(text, state = 'ok') {
  const el = document.getElementById('admin-status');
  if (!el) return;
  el.textContent = text;
  el.dataset.state = state;
}

function persistDraft() {
  if (!epkData) return;
  epkData.meta = epkData.meta || {};
  epkData.meta.updatedAt = new Date().toISOString().slice(0, 10);
  saveLocalDraft(epkData);
  hasUnsavedChanges = true;
  setStatus('Tersimpan di draft lokal (belum dipublikasikan ke GitHub)', 'dirty');
  updateCounts();
}

function updateCounts() {
  if (!epkData) return;
  const counts = {
    members: (epkData.members || []).length,
    discography: (epkData.discography || []).length,
    press: (epkData.pressPhotos || []).length,
    shows: (epkData.shows || []).length,
    videos: (epkData.videos || []).length
  };
  for (const [key, val] of Object.entries(counts)) {
    const badge = document.querySelector(`[data-count="${key}"]`);
    if (badge) badge.textContent = String(val);
  }
}

function slugify(str) {
  return String(str || 'item')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `item-${Date.now()}`;
}

/* ==========================================================================
   UTF-8 Safe Base64 + GitHub Contents API Helpers
   ========================================================================== */
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToUtf8(b64) {
  const clean = String(b64 || '').replace(/\s/g, '');
  const binary = window.atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function isGhConfigured() {
  return Boolean(ghConfig.owner.trim() && ghConfig.repo.trim() && ghConfig.token.trim());
}

async function githubFetch(path, options = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${ghConfig.token.trim()}`,
    'X-GitHub-Api-Version': '2022-11-28',
    ...(options.headers || {})
  };
  const res = await fetch(`https://api.github.com${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.message || `GitHub API error (HTTP ${res.status})`);
  }
  return body;
}

async function getRemoteFileSha(filePath) {
  const owner = encodeURIComponent(ghConfig.owner.trim());
  const repo = encodeURIComponent(ghConfig.repo.trim());
  const branch = encodeURIComponent(ghConfig.branch.trim() || 'main');
  try {
    const file = await githubFetch(`/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`);
    return file.sha || null;
  } catch (err) {
    if (String(err.message).toLowerCase().includes('not found')) return null;
    throw err;
  }
}

async function commitFileToGitHub(filePath, base64Content, message) {
  const owner = encodeURIComponent(ghConfig.owner.trim());
  const repo = encodeURIComponent(ghConfig.repo.trim());
  const branch = ghConfig.branch.trim() || 'main';
  const sha = await getRemoteFileSha(filePath);

  const payload = {
    message,
    content: base64Content,
    branch
  };
  if (sha) payload.sha = sha;

  return githubFetch(`/repos/${owner}/${repo}/contents/${filePath}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function publishJsonToGitHub(commitMsg) {
  if (!isGhConfigured()) {
    switchSection('github');
    showToast('Lengkapi pengaturan GitHub dulu sebelum menyimpan ke repository.');
    return null;
  }

  setStatus('Mengirim data/epk.json ke GitHub...', 'dirty');
  const jsonText = JSON.stringify(epkData, null, 2) + '\n';
  const result = await commitFileToGitHub(
    'data/epk.json',
    utf8ToBase64(jsonText),
    commitMsg || `Update EPK Eve's Lily (${new Date().toISOString().slice(0, 10)})`
  );
  clearLocalDraft();
  hasUnsavedChanges = false;
  setStatus('Tersinkron ke GitHub', 'ok');
  return result;
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
        resolve({
          dataUrl,
          base64,
          width: img.naturalWidth || 800,
          height: img.naturalHeight || 600
        });
      };
      img.onerror = () => reject(new Error('File bukan gambar yang valid.'));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });
}

async function handleImageSelection(file, onUpdate) {
  if (!file) return;
  try {
    const { dataUrl, base64, width, height } = await readImageFile(file);
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const baseName = slugify(file.name.replace(/\.[^.]+$/, ''));
    const repoPath = `assets/uploads/${Date.now()}-${baseName}.${ext}`;

    if (isGhConfigured()) {
      showToast(`Mengunggah ${file.name} ke GitHub...`);
      await commitFileToGitHub(repoPath, base64, `Upload asset ${file.name}`);
      onUpdate({ path: repoPath, width, height });
      showToast(`Gambar berhasil diunggah ke ${repoPath}.`);
    } else {
      if (file.size > 900 * 1024) {
        showToast('Gambar terlalu besar untuk preview draft lokal (>900KB). Hubungkan GitHub Sync atau kecilkan gambarnya.');
        return;
      }
      onUpdate({ path: dataUrl, width, height });
      showToast('Gambar dimasukkan ke preview draft lokal. Hubungkan GitHub Sync untuk upload langsung ke repo.');
    }
  } catch (err) {
    showToast(`Gagal memproses gambar: ${err.message}`);
  }
}

/* ==========================================================================
   Reusable Image Field Builder
   ========================================================================== */
function renderImageControl({ id, label, value, hint }) {
  const previewSrc = safeUrl(value) === '#' ? './assets/brand/lily-emblem-white.png' : safeUrl(value);
  return `
    <div class="field field--full">
      <label class="field__label" for="${escapeHtml(id)}">${escapeHtml(label)}</label>
      <div class="image-field">
        <img
          class="image-field__thumb"
          id="${escapeHtml(id)}-preview"
          src="${escapeHtml(previewSrc)}"
          alt="Pratinjau ${escapeHtml(label)}"
          width="96"
          height="96"
        >
        <div class="image-field__controls">
          <input
            type="text"
            id="${escapeHtml(id)}"
            class="field__input"
            value="${escapeHtml(value || '')}"
            placeholder="assets/covers/nama-file.jpg atau URL gambar"
          >
          <div class="image-field__upload-row">
            <label class="file-trigger">
              <span>Pilih File Gambar</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" data-file-for="${escapeHtml(id)}">
            </label>
            <span class="field__hint">${escapeHtml(hint || (isGhConfigured() ? 'File yang dipilih langsung diunggah ke assets/uploads/ di GitHub.' : 'Bisa pakai file lokal untuk preview atau hubungkan GitHub untuk upload ke repo.'))}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function bindImageControl(root, id, onValueChange) {
  const textInput = root.querySelector(`#${CSS.escape(id)}`);
  const preview = root.querySelector(`#${CSS.escape(id)}-preview`);
  const fileInput = root.querySelector(`[data-file-for="${CSS.escape(id)}"]`);

  textInput?.addEventListener('input', () => {
    const val = textInput.value.trim();
    if (preview) preview.src = safeUrl(val) === '#' ? './assets/brand/lily-emblem-white.png' : safeUrl(val);
    onValueChange({ path: val });
  });

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    await handleImageSelection(file, ({ path, width, height }) => {
      if (textInput) textInput.value = path;
      if (preview) preview.src = path;
      onValueChange({ path, width, height });
    });
    fileInput.value = '';
  });
}

/* ==========================================================================
   Section Renderers
   ========================================================================== */
function renderHeroSection(workspace) {
  const { meta, hero } = epkData;
  const era = meta.era || { enabled: false, label: '', title: '', subtitle: '' };

  workspace.innerHTML = `
    <section class="admin-panel" aria-labelledby="panel-hero-title">
      <div class="admin-panel__head">
        <div>
          <h2 id="panel-hero-title" class="admin-panel__title">Hero &amp; Tema Era</h2>
          <p class="admin-panel__desc">Atur identitas utama band, tema rilisan mendatang (seperti "Perayaan Bintang Jatuh"), foto utama, dan kutipan lirik pembuka.</p>
        </div>
      </div>

      <div class="field-grid">
        <div class="field">
          <label class="field__label" for="meta-bandName">Nama Band</label>
          <input id="meta-bandName" class="field__input" type="text" value="${escapeHtml(meta.bandName || '')}" placeholder="Eve's Lily">
        </div>
        <div class="field">
          <label class="field__label" for="meta-origin">Kota Asal</label>
          <input id="meta-origin" class="field__input" type="text" value="${escapeHtml(meta.origin || '')}" placeholder="Banjarmasin, Kalimantan Selatan">
        </div>
        <div class="field">
          <label class="field__label" for="meta-genre">Genre</label>
          <input id="meta-genre" class="field__input" type="text" value="${escapeHtml(meta.genre || '')}" placeholder="Pop-Alternatif / J-Pop">
        </div>
        <div class="field">
          <label class="field__label" for="meta-formed">Tahun Terbentuk</label>
          <input id="meta-formed" class="field__input" type="text" value="${escapeHtml(meta.formedYear || '')}" placeholder="2018">
        </div>

        <div class="field field--full">
          <label class="field__checkbox-row" for="era-enabled">
            <input id="era-enabled" type="checkbox" ${era.enabled ? 'checked' : ''}>
            <span>Tampilkan penanda tema rilisan mendatang di bagian atas Hero</span>
          </label>
        </div>
        <div class="field">
          <label class="field__label" for="era-label">Label Era</label>
          <input id="era-label" class="field__input" type="text" value="${escapeHtml(era.label || '')}" placeholder="Rilisan Mendatang">
        </div>
        <div class="field">
          <label class="field__label" for="era-title">Judul Era / Single Mendatang</label>
          <input id="era-title" class="field__input" type="text" value="${escapeHtml(era.title || '')}" placeholder="Perayaan Bintang Jatuh">
        </div>

        <div class="field field--full">
          <label class="field__label" for="hero-quote">Kutipan Lirik Pembuka</label>
          <textarea id="hero-quote" class="field__textarea" placeholder="Tulis potongan lirik lagu...">${escapeHtml(hero.lyricQuote || '')}</textarea>
        </div>
        <div class="field field--full">
          <label class="field__label" for="hero-quote-source">Sumber Lagu Kutipan Lirik</label>
          <input id="hero-quote-source" class="field__input" type="text" value="${escapeHtml(hero.lyricSource || '')}" placeholder="Contoh: Perayaan Bintang Jatuh (2026)">
        </div>

        ${renderImageControl({ id: 'hero-image', label: 'Foto Utama Hero', value: hero.image })}
      </div>
    </section>
  `;

  const bindText = (selector, setter) => {
    workspace.querySelector(selector)?.addEventListener('input', (e) => {
      setter(e.target.value);
      persistDraft();
    });
  };

  bindText('#meta-bandName', (v) => { epkData.meta.bandName = v; });
  bindText('#meta-origin', (v) => { epkData.meta.origin = v; });
  bindText('#meta-genre', (v) => { epkData.meta.genre = v; });
  bindText('#meta-formed', (v) => { epkData.meta.formedYear = v; });
  bindText('#era-label', (v) => { epkData.meta.era.label = v; });
  bindText('#era-title', (v) => { epkData.meta.era.title = v; });
  bindText('#hero-quote', (v) => { epkData.hero.lyricQuote = v; });
  bindText('#hero-quote-source', (v) => { epkData.hero.lyricSource = v; });

  workspace.querySelector('#era-enabled')?.addEventListener('change', (e) => {
    epkData.meta.era = epkData.meta.era || {};
    epkData.meta.era.enabled = e.target.checked;
    persistDraft();
  });

  bindImageControl(workspace, 'hero-image', ({ path, width, height }) => {
    epkData.hero.image = path;
    if (width) epkData.hero.imageWidth = width;
    if (height) epkData.hero.imageHeight = height;
    persistDraft();
  });
}

function renderBiographySection(workspace) {
  const bio = epkData.biography;
  const paragraphsText = (bio.paragraphs || []).join('\n\n');
  const philText = (bio.philosophyParagraphs || []).join('\n\n');
  const highlights = bio.highlights || [];

  workspace.innerHTML = `
    <section class="admin-panel" aria-labelledby="panel-bio-title">
      <div class="admin-panel__head">
        <div>
          <h2 id="panel-bio-title" class="admin-panel__title">Biografi &amp; Filosofi</h2>
          <p class="admin-panel__desc">Satu perubahan di sini langsung tersinkron ke halaman Home dan halaman Biography. Pisahkan antar paragraf dengan satu baris kosong.</p>
        </div>
      </div>

      <div class="field-grid">
        <div class="field field--full">
          <label class="field__label" for="bio-headline">Judul Profil</label>
          <input id="bio-headline" class="field__input" type="text" value="${escapeHtml(bio.headline || '')}" placeholder="Eve's Lily: Langit pun Bernyanyi">
        </div>

        ${renderImageControl({ id: 'bio-photo', label: 'Foto Band di Bagian Biografi', value: bio.bandPhoto })}

        <div class="field field--full">
          <label class="field__label" for="bio-paragraphs">Paragraf Biografi</label>
          <textarea id="bio-paragraphs" class="field__textarea" style="min-height:220px" placeholder="Tulis biografi band, pisahkan paragraf dengan satu baris kosong...">${escapeHtml(paragraphsText)}</textarea>
          <p class="field__hint">Jumlah paragraf saat ini: ${(bio.paragraphs || []).length}</p>
        </div>

        <div class="field field--full">
          <label class="field__label" for="phil-title">Judul Bagian Filosofi</label>
          <input id="phil-title" class="field__input" type="text" value="${escapeHtml(bio.philosophyTitle || '')}" placeholder="The Meaning of Eve's Lily">
        </div>

        <div class="field field--full">
          <label class="field__label" for="phil-paragraphs">Paragraf Filosofi Nama Band</label>
          <textarea id="phil-paragraphs" class="field__textarea" style="min-height:170px">${escapeHtml(philText)}</textarea>
        </div>
      </div>

      <div>
        <div class="item-card__head" style="margin-bottom:0.85rem">
          <h3 class="item-card__title">Ringkasan Fakta Band (Asal, Genre, Karya, Soundtrack)</h3>
          <button type="button" id="add-highlight-btn" class="btn btn--outline-dark btn--sm">+ Tambah Fakta</button>
        </div>
        <div class="item-stack" id="highlights-list">
          ${highlights
            .map(
              (h, idx) => `
              <div class="item-card" data-hl-idx="${idx}">
                <div class="field-grid">
                  <div class="field">
                    <label class="field__label" for="hl-label-${idx}">Label</label>
                    <input id="hl-label-${idx}" class="field__input" data-hl-field="label" value="${escapeHtml(h.label || '')}" placeholder="Contoh: Karya">
                  </div>
                  <div class="field">
                    <label class="field__label" for="hl-value-${idx}">Isi Fakta</label>
                    <input id="hl-value-${idx}" class="field__input" data-hl-field="value" value="${escapeHtml(h.value || '')}" placeholder="Contoh: 12 Lagu Dirilis">
                  </div>
                </div>
                <div class="item-card__controls">
                  <button type="button" class="btn btn--danger btn--sm" data-remove-hl="${idx}">Hapus Fakta</button>
                </div>
              </div>`
            )
            .join('')}
        </div>
      </div>
    </section>
  `;

  workspace.querySelector('#bio-headline')?.addEventListener('input', (e) => {
    epkData.biography.headline = e.target.value;
    persistDraft();
  });

  workspace.querySelector('#bio-paragraphs')?.addEventListener('input', (e) => {
    epkData.biography.paragraphs = e.target.value
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    persistDraft();
  });

  workspace.querySelector('#phil-title')?.addEventListener('input', (e) => {
    epkData.biography.philosophyTitle = e.target.value;
    persistDraft();
  });

  workspace.querySelector('#phil-paragraphs')?.addEventListener('input', (e) => {
    epkData.biography.philosophyParagraphs = e.target.value
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    persistDraft();
  });

  bindImageControl(workspace, 'bio-photo', ({ path, width, height }) => {
    epkData.biography.bandPhoto = path;
    if (width) epkData.biography.bandPhotoWidth = width;
    if (height) epkData.biography.bandPhotoHeight = height;
    persistDraft();
  });

  workspace.querySelector('#add-highlight-btn')?.addEventListener('click', () => {
    epkData.biography.highlights.push({ label: 'Label Baru', value: '' });
    persistDraft();
    renderWorkspace();
  });

  workspace.querySelectorAll('[data-hl-idx]').forEach((card) => {
    const idx = Number(card.dataset.hlIdx);
    card.querySelectorAll('[data-hl-field]').forEach((inp) => {
      inp.addEventListener('input', () => {
        epkData.biography.highlights[idx][inp.dataset.hlField] = inp.value;
        persistDraft();
      });
    });
  });

  workspace.querySelectorAll('[data-remove-hl]').forEach((btn) => {
    btn.addEventListener('click', () => {
      epkData.biography.highlights.splice(Number(btn.dataset.removeHl), 1);
      persistDraft();
      renderWorkspace();
    });
  });
}

function moveItem(arr, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= arr.length) return;
  const [item] = arr.splice(index, 1);
  arr.splice(target, 0, item);
}

function renderMembersSection(workspace) {
  const members = epkData.members || [];
  workspace.innerHTML = `
    <section class="admin-panel" aria-labelledby="panel-members-title">
      <div class="admin-panel__head">
        <div>
          <h2 id="panel-members-title" class="admin-panel__title">Personel (${members.length})</h2>
          <p class="admin-panel__desc">Kelola formasi personel yang tampil di halaman Biography.</p>
        </div>
        <button type="button" id="add-member-btn" class="btn btn--gold btn--sm">+ Tambah Personel</button>
      </div>

      <div class="item-stack">
        ${members
          .map(
            (m, idx) => `
            <div class="item-card" data-member-idx="${idx}">
              <div class="item-card__head">
                <h3 class="item-card__title">${escapeHtml(m.name || 'Personel Baru')} (${escapeHtml(m.role || 'Posisi')})</h3>
                <div class="item-card__controls">
                  <button type="button" class="btn btn--outline-dark btn--sm" data-move-up="${idx}" ${idx === 0 ? 'disabled' : ''}>Naik</button>
                  <button type="button" class="btn btn--outline-dark btn--sm" data-move-down="${idx}" ${idx === members.length - 1 ? 'disabled' : ''}>Turun</button>
                  <button type="button" class="btn btn--danger btn--sm" data-delete-idx="${idx}">Hapus</button>
                </div>
              </div>
              <div class="field-grid">
                <div class="field">
                  <label class="field__label" for="mem-name-${idx}">Nama</label>
                  <input id="mem-name-${idx}" class="field__input" data-field="name" value="${escapeHtml(m.name || '')}" placeholder="Nama personel">
                </div>
                <div class="field">
                  <label class="field__label" for="mem-role-${idx}">Posisi / Instrumen</label>
                  <input id="mem-role-${idx}" class="field__input" data-field="role" value="${escapeHtml(m.role || '')}" placeholder="Contoh: Vocal, Guitar, Drum">
                </div>
                <div class="field field--full">
                  <label class="field__label" for="mem-note-${idx}">Catatan Singkat (Opsional)</label>
                  <input id="mem-note-${idx}" class="field__input" data-field="note" value="${escapeHtml(m.note || '')}" placeholder="Contoh: Bergabung sejak 2025">
                </div>
                ${renderImageControl({ id: `mem-photo-${idx}`, label: 'Foto Personel', value: m.photo })}
              </div>
            </div>`
          )
          .join('')}
      </div>
    </section>
  `;

  workspace.querySelector('#add-member-btn')?.addEventListener('click', () => {
    epkData.members.push({
      id: `member-${Date.now()}`,
      name: '',
      role: '',
      photo: 'assets/brand/bio-band.jpg',
      width: 800,
      height: 533,
      note: ''
    });
    persistDraft();
    renderWorkspace();
  });

  workspace.querySelectorAll('[data-member-idx]').forEach((card) => {
    const idx = Number(card.dataset.memberIdx);
    card.querySelectorAll('[data-field]').forEach((inp) => {
      inp.addEventListener('input', () => {
        epkData.members[idx][inp.dataset.field] = inp.value;
        persistDraft();
      });
    });
    bindImageControl(card, `mem-photo-${idx}`, ({ path, width, height }) => {
      epkData.members[idx].photo = path;
      if (width) epkData.members[idx].width = width;
      if (height) epkData.members[idx].height = height;
      persistDraft();
    });
  });

  workspace.querySelectorAll('[data-move-up]').forEach((btn) => {
    btn.addEventListener('click', () => {
      moveItem(epkData.members, Number(btn.dataset.moveUp), -1);
      persistDraft();
      renderWorkspace();
    });
  });

  workspace.querySelectorAll('[data-move-down]').forEach((btn) => {
    btn.addEventListener('click', () => {
      moveItem(epkData.members, Number(btn.dataset.moveDown), 1);
      persistDraft();
      renderWorkspace();
    });
  });

  workspace.querySelectorAll('[data-delete-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      epkData.members.splice(Number(btn.dataset.deleteIdx), 1);
      persistDraft();
      renderWorkspace();
    });
  });
}

function renderDiscographySection(workspace) {
  const items = epkData.discography || [];
  workspace.innerHTML = `
    <section class="admin-panel" aria-labelledby="panel-discog-title">
      <div class="admin-panel__head">
        <div>
          <h2 id="panel-discog-title" class="admin-panel__title">Discography (${items.length})</h2>
          <p class="admin-panel__desc">Tambah single baru (misalnya "Perayaan Bintang Jatuh"), atur rilisan unggulan, tracklist EP, tautan Spotify per lagu, atau pratinjau MP3.</p>
        </div>
        <button type="button" id="add-release-btn" class="btn btn--gold btn--sm">+ Tambah Rilis di Atas</button>
      </div>

      <div class="item-stack">
        ${items
          .map(
            (r, idx) => `
            <div class="item-card" data-rel-idx="${idx}">
              <div class="item-card__head">
                <h3 class="item-card__title">${escapeHtml(r.title || 'Rilis Baru')} (${escapeHtml(r.year || 'Tahun')})${r.featured ? ' [Sorotan Terbaru]' : ''}</h3>
                <div class="item-card__controls">
                  <button type="button" class="btn btn--outline-dark btn--sm" data-set-featured="${idx}" ${r.featured ? 'disabled' : ''}>Jadikan Terbaru</button>
                  <button type="button" class="btn btn--outline-dark btn--sm" data-move-up="${idx}" ${idx === 0 ? 'disabled' : ''}>Naik</button>
                  <button type="button" class="btn btn--outline-dark btn--sm" data-move-down="${idx}" ${idx === items.length - 1 ? 'disabled' : ''}>Turun</button>
                  <button type="button" class="btn btn--danger btn--sm" data-delete-idx="${idx}">Hapus</button>
                </div>
              </div>

              <div class="field-grid">
                <div class="field">
                  <label class="field__label" for="rel-title-${idx}">Judul Lagu / EP</label>
                  <input id="rel-title-${idx}" class="field__input" data-field="title" value="${escapeHtml(r.title || '')}" placeholder="Contoh: Perayaan Bintang Jatuh">
                </div>
                <div class="field">
                  <label class="field__label" for="rel-type-${idx}">Format</label>
                  <select id="rel-type-${idx}" class="field__select" data-field="type">
                    <option value="Single" ${r.type === 'Single' ? 'selected' : ''}>Single</option>
                    <option value="EP" ${r.type === 'EP' ? 'selected' : ''}>EP</option>
                    <option value="Album" ${r.type === 'Album' ? 'selected' : ''}>Album</option>
                  </select>
                </div>
                <div class="field">
                  <label class="field__label" for="rel-year-${idx}">Tahun</label>
                  <input id="rel-year-${idx}" class="field__input" data-field="year" value="${escapeHtml(r.year || '')}" placeholder="2026">
                </div>
                <div class="field">
                  <label class="field__label" for="rel-cat-${idx}">Kategori Filter</label>
                  <input id="rel-cat-${idx}" class="field__input" data-field="category" value="${escapeHtml(r.category || r.type || 'Single')}" placeholder="Single / EP / Trilogi">
                </div>
                <div class="field">
                  <label class="field__label" for="rel-date-${idx}">Tanggal Rilis Lengkap</label>
                  <input id="rel-date-${idx}" class="field__input" data-field="releaseDate" value="${escapeHtml(r.releaseDate || '')}" placeholder="Contoh: 29 Agustus 2025">
                </div>
                <div class="field">
                  <label class="field__label" for="rel-sub-${idx}">Keterangan Tambahan</label>
                  <input id="rel-sub-${idx}" class="field__input" data-field="subtitle" value="${escapeHtml(r.subtitle || '')}" placeholder="Contoh: Trilogy Opener, OST Game">
                </div>
                <div class="field">
                  <label class="field__label" for="rel-spotify-${idx}">URL Spotify Track/Album (Opsional)</label>
                  <input id="rel-spotify-${idx}" class="field__input" data-field="spotifyUrl" value="${escapeHtml(r.spotifyUrl || '')}" placeholder="https://open.spotify.com/track/...">
                </div>
                <div class="field">
                  <label class="field__label" for="rel-audio-${idx}">URL File Audio Preview MP3/M4A (Opsional)</label>
                  <input id="rel-audio-${idx}" class="field__input" data-field="audioPreviewUrl" value="${escapeHtml(r.audioPreviewUrl || '')}" placeholder="assets/audio/preview.mp3 atau URL MP3">
                </div>
                <div class="field field--full">
                  <label class="field__label" for="rel-tracks-${idx}">Tracklist (Khusus EP/Album, 1 baris per lagu)</label>
                  <textarea id="rel-tracks-${idx}" class="field__textarea" style="min-height:84px" data-tracklist="${idx}" placeholder="Kosongkan jika Single">${escapeHtml((r.tracklist || []).join('\n'))}</textarea>
                </div>
                ${renderImageControl({ id: `rel-cover-${idx}`, label: 'Sampul Artwork (1:1)', value: r.cover })}
              </div>
            </div>`
          )
          .join('')}
      </div>
    </section>
  `;

  workspace.querySelector('#add-release-btn')?.addEventListener('click', () => {
    epkData.discography.unshift({
      id: `release-${Date.now()}`,
      title: '',
      type: 'Single',
      year: String(new Date().getFullYear()),
      releaseDate: '',
      subtitle: '',
      featured: false,
      category: 'Single',
      cover: 'assets/covers/10-langit-pun-bernyanyi.jpg',
      coverWidth: 480,
      coverHeight: 480,
      tracklist: [],
      spotifyUrl: '',
      audioPreviewUrl: ''
    });
    persistDraft();
    renderWorkspace();
  });

  workspace.querySelectorAll('[data-rel-idx]').forEach((card) => {
    const idx = Number(card.dataset.relIdx);
    card.querySelectorAll('[data-field]').forEach((inp) => {
      const evt = inp.tagName === 'SELECT' ? 'change' : 'input';
      inp.addEventListener(evt, () => {
        epkData.discography[idx][inp.dataset.field] = inp.value;
        persistDraft();
      });
    });
    card.querySelector('[data-tracklist]')?.addEventListener('input', (e) => {
      epkData.discography[idx].tracklist = e.target.value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      persistDraft();
    });
    bindImageControl(card, `rel-cover-${idx}`, ({ path, width, height }) => {
      epkData.discography[idx].cover = path;
      if (width) epkData.discography[idx].coverWidth = width;
      if (height) epkData.discography[idx].coverHeight = height;
      persistDraft();
    });
  });

  workspace.querySelectorAll('[data-set-featured]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = Number(btn.dataset.setFeatured);
      epkData.discography.forEach((item, i) => {
        item.featured = i === target;
      });
      persistDraft();
      renderWorkspace();
    });
  });

  workspace.querySelectorAll('[data-move-up]').forEach((btn) => {
    btn.addEventListener('click', () => {
      moveItem(epkData.discography, Number(btn.dataset.moveUp), -1);
      persistDraft();
      renderWorkspace();
    });
  });

  workspace.querySelectorAll('[data-move-down]').forEach((btn) => {
    btn.addEventListener('click', () => {
      moveItem(epkData.discography, Number(btn.dataset.moveDown), 1);
      persistDraft();
      renderWorkspace();
    });
  });

  workspace.querySelectorAll('[data-delete-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      epkData.discography.splice(Number(btn.dataset.deleteIdx), 1);
      persistDraft();
      renderWorkspace();
    });
  });
}

function renderPressSection(workspace) {
  const photos = epkData.pressPhotos || [];
  workspace.innerHTML = `
    <section class="admin-panel" aria-labelledby="panel-press-title">
      <div class="admin-panel__head">
        <div>
          <h2 id="panel-press-title" class="admin-panel__title">Press Photos (${photos.length})</h2>
          <p class="admin-panel__desc">Tambahkan foto panggung baru dan centang "Tampilkan di Sorotan Home" pada 3 foto terbaik untuk halaman depan.</p>
        </div>
        <button type="button" id="add-press-btn" class="btn btn--gold btn--sm">+ Tambah Foto Panggung</button>
      </div>

      <div class="item-stack">
        ${photos
          .map(
            (p, idx) => `
            <div class="item-card" data-press-idx="${idx}">
              <div class="item-card__head">
                <h3 class="item-card__title">${escapeHtml(p.title || 'Foto Baru')} (${escapeHtml(p.year || '')})</h3>
                <div class="item-card__controls">
                  <button type="button" class="btn btn--outline-dark btn--sm" data-move-up="${idx}" ${idx === 0 ? 'disabled' : ''}>Naik</button>
                  <button type="button" class="btn btn--outline-dark btn--sm" data-move-down="${idx}" ${idx === photos.length - 1 ? 'disabled' : ''}>Turun</button>
                  <button type="button" class="btn btn--danger btn--sm" data-delete-idx="${idx}">Hapus</button>
                </div>
              </div>
              <div class="field-grid">
                <div class="field">
                  <label class="field__label" for="pr-title-${idx}">Nama Event</label>
                  <input id="pr-title-${idx}" class="field__input" data-field="title" value="${escapeHtml(p.title || '')}" placeholder="Contoh: Liburland Festival 2026">
                </div>
                <div class="field">
                  <label class="field__label" for="pr-venue-${idx}">Lokasi / Venue</label>
                  <input id="pr-venue-${idx}" class="field__input" data-field="venue" value="${escapeHtml(p.venue || '')}" placeholder="Contoh: Amanah Borneo Park">
                </div>
                <div class="field">
                  <label class="field__label" for="pr-year-${idx}">Tahun</label>
                  <input id="pr-year-${idx}" class="field__input" data-field="year" value="${escapeHtml(p.year || '')}" placeholder="2026">
                </div>
                <div class="field">
                  <label class="field__label" for="pr-ig-${idx}">Tautan Instagram</label>
                  <input id="pr-ig-${idx}" class="field__input" data-field="instagramUrl" value="${escapeHtml(p.instagramUrl || '')}" placeholder="https://www.instagram.com/p/...">
                </div>
                <div class="field field--full">
                  <label class="field__checkbox-row" for="pr-hl-${idx}">
                    <input id="pr-hl-${idx}" type="checkbox" data-highlight="${idx}" ${p.highlight ? 'checked' : ''}>
                    <span>Tampilkan di Sorotan Home (maksimal 3 foto sorotan utama)</span>
                  </label>
                </div>
                ${renderImageControl({ id: `pr-img-${idx}`, label: 'Foto Panggung', value: p.image })}
              </div>
            </div>`
          )
          .join('')}
      </div>
    </section>
  `;

  workspace.querySelector('#add-press-btn')?.addEventListener('click', () => {
    epkData.pressPhotos.unshift({
      id: `press-${Date.now()}`,
      title: '',
      venue: '',
      year: String(new Date().getFullYear()),
      image: 'assets/press/01-hollowfest-2025.jpg',
      width: 800,
      height: 533,
      instagramUrl: '',
      highlight: false
    });
    persistDraft();
    renderWorkspace();
  });

  workspace.querySelectorAll('[data-press-idx]').forEach((card) => {
    const idx = Number(card.dataset.pressIdx);
    card.querySelectorAll('[data-field]').forEach((inp) => {
      inp.addEventListener('input', () => {
        epkData.pressPhotos[idx][inp.dataset.field] = inp.value;
        persistDraft();
      });
    });
    card.querySelector('[data-highlight]')?.addEventListener('change', (e) => {
      epkData.pressPhotos[idx].highlight = e.target.checked;
      persistDraft();
    });
    bindImageControl(card, `pr-img-${idx}`, ({ path, width, height }) => {
      epkData.pressPhotos[idx].image = path;
      if (width) epkData.pressPhotos[idx].width = width;
      if (height) epkData.pressPhotos[idx].height = height;
      persistDraft();
    });
  });

  workspace.querySelectorAll('[data-move-up]').forEach((btn) => {
    btn.addEventListener('click', () => {
      moveItem(epkData.pressPhotos, Number(btn.dataset.moveUp), -1);
      persistDraft();
      renderWorkspace();
    });
  });

  workspace.querySelectorAll('[data-move-down]').forEach((btn) => {
    btn.addEventListener('click', () => {
      moveItem(epkData.pressPhotos, Number(btn.dataset.moveDown), 1);
      persistDraft();
      renderWorkspace();
    });
  });

  workspace.querySelectorAll('[data-delete-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      epkData.pressPhotos.splice(Number(btn.dataset.deleteIdx), 1);
      persistDraft();
      renderWorkspace();
    });
  });
}

function renderShowsSection(workspace) {
  const shows = epkData.shows || [];
  const q = showFilterQuery.trim().toLowerCase();
  const indexed = shows
    .map((show, idx) => ({ show, idx }))
    .filter(({ show }) => {
      if (!q) return true;
      return `${show.date} ${show.event} ${show.location} ${show.featuring} ${show.year}`.toLowerCase().includes(q);
    });

  workspace.innerHTML = `
    <section class="admin-panel" aria-labelledby="panel-shows-title">
      <div class="admin-panel__head">
        <div>
          <h2 id="panel-shows-title" class="admin-panel__title">Jadwal Panggung (${shows.length})</h2>
          <p class="admin-panel__desc">Tambahkan jadwal panggung baru di urutan paling atas. Centang "Akan Datang" agar otomatis muncul di bagian teratas Home dan Schedule.</p>
        </div>
        <button type="button" id="add-show-btn" class="btn btn--gold btn--sm">+ Tambah Jadwal Baru</button>
      </div>

      <div class="field">
        <label class="field__label" for="admin-show-search">Filter daftar jadwal (${indexed.length} tampil)</label>
        <input id="admin-show-search" class="field__input" type="search" value="${escapeHtml(showFilterQuery)}" placeholder="Cari nama event, kota, atau tahun...">
      </div>

      <div class="item-stack">
        ${
          indexed.length
            ? indexed
                .map(
                  ({ show, idx }) => `
                <div class="item-card" data-show-idx="${idx}">
                  <div class="item-card__head">
                    <h3 class="item-card__title">${escapeHtml(show.date || 'Tanggal')} / ${escapeHtml(show.event || 'Event Baru')}${show.upcoming ? ' [Akan Datang]' : ''}</h3>
                    <div class="item-card__controls">
                      <button type="button" class="btn btn--outline-dark btn--sm" data-move-up="${idx}" ${idx === 0 ? 'disabled' : ''}>Naik</button>
                      <button type="button" class="btn btn--outline-dark btn--sm" data-move-down="${idx}" ${idx === shows.length - 1 ? 'disabled' : ''}>Turun</button>
                      <button type="button" class="btn btn--danger btn--sm" data-delete-idx="${idx}">Hapus</button>
                    </div>
                  </div>
                  <div class="field-grid">
                    <div class="field">
                      <label class="field__label" for="sh-date-${idx}">Tanggal Tampil</label>
                      <input id="sh-date-${idx}" class="field__input" data-field="date" value="${escapeHtml(show.date || '')}" placeholder="Contoh: 12 Des '26">
                    </div>
                    <div class="field">
                      <label class="field__label" for="sh-year-${idx}">Tahun (untuk Filter)</label>
                      <input id="sh-year-${idx}" class="field__input" data-field="year" value="${escapeHtml(show.year || '')}" placeholder="2026">
                    </div>
                    <div class="field field--full">
                      <label class="field__label" for="sh-event-${idx}">Nama Event / Festival</label>
                      <input id="sh-event-${idx}" class="field__input" data-field="event" value="${escapeHtml(show.event || '')}" placeholder="Nama acara">
                    </div>
                    <div class="field">
                      <label class="field__label" for="sh-loc-${idx}">Kota</label>
                      <input id="sh-loc-${idx}" class="field__input" data-field="location" value="${escapeHtml(show.location || '')}" placeholder="Banjarmasin">
                    </div>
                    <div class="field">
                      <label class="field__label" for="sh-feat-${idx}">Kolaborator / Featuring (Opsional)</label>
                      <input id="sh-feat-${idx}" class="field__input" data-field="featuring" value="${escapeHtml(show.featuring || '')}" placeholder="feat. Rosa Graviela">
                    </div>
                    <div class="field field--full">
                      <label class="field__checkbox-row" for="sh-up-${idx}">
                        <input id="sh-up-${idx}" type="checkbox" data-upcoming="${idx}" ${show.upcoming ? 'checked' : ''}>
                        <span>Tandai sebagai Jadwal Akan Datang (Upcoming)</span>
                      </label>
                    </div>
                  </div>
                </div>`
                )
                .join('')
            : `<div class="state-box"><p class="state-box__title">Tidak ada jadwal cocok dengan "${escapeHtml(showFilterQuery)}"</p><button type="button" id="clear-show-search" class="btn btn--outline-dark btn--sm">Hapus Pencarian</button></div>`
        }
      </div>
    </section>
  `;

  workspace.querySelector('#add-show-btn')?.addEventListener('click', () => {
    showFilterQuery = '';
    epkData.shows.unshift({
      id: `show-${Date.now()}`,
      date: '',
      year: String(new Date().getFullYear()),
      event: '',
      location: 'Banjarmasin',
      featuring: '',
      upcoming: true
    });
    persistDraft();
    renderWorkspace();
  });

  const searchInp = workspace.querySelector('#admin-show-search');
  searchInp?.addEventListener('input', () => {
    showFilterQuery = searchInp.value;
    const pos = searchInp.selectionStart || showFilterQuery.length;
    renderWorkspace();
    const nextInp = workspace.querySelector('#admin-show-search');
    if (nextInp) {
      nextInp.focus();
      nextInp.setSelectionRange(pos, pos);
    }
  });

  workspace.querySelector('#clear-show-search')?.addEventListener('click', () => {
    showFilterQuery = '';
    renderWorkspace();
  });

  workspace.querySelectorAll('[data-show-idx]').forEach((card) => {
    const idx = Number(card.dataset.showIdx);
    card.querySelectorAll('[data-field]').forEach((inp) => {
      inp.addEventListener('input', () => {
        epkData.shows[idx][inp.dataset.field] = inp.value;
        persistDraft();
      });
    });
    card.querySelector('[data-upcoming]')?.addEventListener('change', (e) => {
      epkData.shows[idx].upcoming = e.target.checked;
      persistDraft();
    });
  });

  workspace.querySelectorAll('[data-move-up]').forEach((btn) => {
    btn.addEventListener('click', () => {
      moveItem(epkData.shows, Number(btn.dataset.moveUp), -1);
      persistDraft();
      renderWorkspace();
    });
  });

  workspace.querySelectorAll('[data-move-down]').forEach((btn) => {
    btn.addEventListener('click', () => {
      moveItem(epkData.shows, Number(btn.dataset.moveDown), 1);
      persistDraft();
      renderWorkspace();
    });
  });

  workspace.querySelectorAll('[data-delete-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      epkData.shows.splice(Number(btn.dataset.deleteIdx), 1);
      persistDraft();
      renderWorkspace();
    });
  });
}

function renderVideosSection(workspace) {
  const videos = epkData.videos || [];
  workspace.innerHTML = `
    <section class="admin-panel" aria-labelledby="panel-videos-title">
      <div class="admin-panel__head">
        <div>
          <h2 id="panel-videos-title" class="admin-panel__title">Video YouTube (${videos.length})</h2>
          <p class="admin-panel__desc">Tempel link YouTube biasa (youtu.be atau youtube.com/watch). ID video otomatis terbaca untuk pemutar modal di EPK.</p>
        </div>
        <button type="button" id="add-video-btn" class="btn btn--gold btn--sm">+ Tambah Video</button>
      </div>

      <div class="item-stack">
        ${videos
          .map(
            (v, idx) => `
            <div class="item-card" data-vid-idx="${idx}">
              <div class="item-card__head">
                <h3 class="item-card__title">${escapeHtml(v.title || 'Video Baru')}</h3>
                <div class="item-card__controls">
                  <button type="button" class="btn btn--outline-dark btn--sm" data-move-up="${idx}" ${idx === 0 ? 'disabled' : ''}>Naik</button>
                  <button type="button" class="btn btn--outline-dark btn--sm" data-move-down="${idx}" ${idx === videos.length - 1 ? 'disabled' : ''}>Turun</button>
                  <button type="button" class="btn btn--danger btn--sm" data-delete-idx="${idx}">Hapus</button>
                </div>
              </div>
              <div class="field-grid">
                <div class="field field--full">
                  <label class="field__label" for="vid-title-${idx}">Judul Video</label>
                  <input id="vid-title-${idx}" class="field__input" data-field="title" value="${escapeHtml(v.title || '')}" placeholder="Contoh: Eve's Lily - Perayaan Bintang Jatuh (Official MV)">
                </div>
                <div class="field">
                  <label class="field__label" for="vid-venue-${idx}">Venue / Konteks</label>
                  <input id="vid-venue-${idx}" class="field__input" data-field="venue" value="${escapeHtml(v.venue || '')}" placeholder="Contoh: Official Music Video / Live Festival">
                </div>
                <div class="field">
                  <label class="field__label" for="vid-year-${idx}">Tahun</label>
                  <input id="vid-year-${idx}" class="field__input" data-field="year" value="${escapeHtml(v.year || '')}" placeholder="2026">
                </div>
                <div class="field field--full">
                  <label class="field__label" for="vid-url-${idx}">URL YouTube</label>
                  <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
                    <input id="vid-url-${idx}" class="field__input" style="flex:1;min-width:220px" data-yt-url="${idx}" value="${escapeHtml(v.youtubeUrl || '')}" placeholder="https://youtu.be/...">
                    <button type="button" class="btn btn--outline-dark btn--sm" data-grab-thumb="${idx}">Pakai Thumbnail YouTube</button>
                  </div>
                  <p class="field__hint">ID YouTube terdeteksi: <strong data-yt-id-out="${idx}">${escapeHtml(v.youtubeId || extractYouTubeId(v.youtubeUrl) || 'belum ada')}</strong></p>
                </div>
                ${renderImageControl({ id: `vid-thumb-${idx}`, label: 'Thumbnail Video (16:9)', value: v.thumbnail })}
              </div>
            </div>`
          )
          .join('')}
      </div>
    </section>
  `;

  workspace.querySelector('#add-video-btn')?.addEventListener('click', () => {
    epkData.videos.unshift({
      id: `video-${Date.now()}`,
      title: '',
      venue: '',
      year: String(new Date().getFullYear()),
      youtubeId: '',
      youtubeUrl: '',
      thumbnail: 'assets/videos/liburland-2025.jpg',
      thumbWidth: 854,
      thumbHeight: 480,
      featured: false
    });
    persistDraft();
    renderWorkspace();
  });

  workspace.querySelectorAll('[data-vid-idx]').forEach((card) => {
    const idx = Number(card.dataset.vidIdx);
    card.querySelectorAll('[data-field]').forEach((inp) => {
      inp.addEventListener('input', () => {
        epkData.videos[idx][inp.dataset.field] = inp.value;
        persistDraft();
      });
    });

    card.querySelector(`[data-yt-url="${idx}"]`)?.addEventListener('input', (e) => {
      const url = e.target.value;
      const ytId = extractYouTubeId(url);
      epkData.videos[idx].youtubeUrl = url;
      epkData.videos[idx].youtubeId = ytId;
      const out = card.querySelector(`[data-yt-id-out="${idx}"]`);
      if (out) out.textContent = ytId || 'belum valid';
      persistDraft();
    });

    card.querySelector(`[data-grab-thumb="${idx}"]`)?.addEventListener('click', () => {
      const ytId = extractYouTubeId(epkData.videos[idx].youtubeUrl || epkData.videos[idx].youtubeId);
      if (!ytId) {
        showToast('Tempel URL YouTube yang valid terlebih dahulu.');
        return;
      }
      const thumbUrl = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
      epkData.videos[idx].thumbnail = thumbUrl;
      epkData.videos[idx].thumbWidth = 480;
      epkData.videos[idx].thumbHeight = 360;
      persistDraft();
      renderWorkspace();
      showToast('Thumbnail otomatis diambil dari YouTube.');
    });

    bindImageControl(card, `vid-thumb-${idx}`, ({ path, width, height }) => {
      epkData.videos[idx].thumbnail = path;
      if (width) epkData.videos[idx].thumbWidth = width;
      if (height) epkData.videos[idx].thumbHeight = height;
      persistDraft();
    });
  });

  workspace.querySelectorAll('[data-move-up]').forEach((btn) => {
    btn.addEventListener('click', () => {
      moveItem(epkData.videos, Number(btn.dataset.moveUp), -1);
      persistDraft();
      renderWorkspace();
    });
  });

  workspace.querySelectorAll('[data-move-down]').forEach((btn) => {
    btn.addEventListener('click', () => {
      moveItem(epkData.videos, Number(btn.dataset.moveDown), 1);
      persistDraft();
      renderWorkspace();
    });
  });

  workspace.querySelectorAll('[data-delete-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      epkData.videos.splice(Number(btn.dataset.deleteIdx), 1);
      persistDraft();
      renderWorkspace();
    });
  });
}

function renderContactSectionAdmin(workspace) {
  const c = epkData.contact;
  const dsp = epkData.dsp;

  workspace.innerHTML = `
    <section class="admin-panel" aria-labelledby="panel-contact-title">
      <div class="admin-panel__head">
        <div>
          <h2 id="panel-contact-title" class="admin-panel__title">Kontak Booking, DSP &amp; Media Sosial</h2>
          <p class="admin-panel__desc">Semua tombol WhatsApp, Email, Salin Kontak, dan pemutar Spotify mengambil datanya dari bagian ini.</p>
        </div>
      </div>

      <div class="field-grid">
        <div class="field">
          <label class="field__label" for="c-picRole">Jabatan PIC</label>
          <input id="c-picRole" class="field__input" value="${escapeHtml(c.picRole || '')}" placeholder="PIC & Booking">
        </div>
        <div class="field">
          <label class="field__label" for="c-picName">Nama PIC</label>
          <input id="c-picName" class="field__input" value="${escapeHtml(c.picName || '')}" placeholder="Nama kontak resmi">
        </div>
        <div class="field">
          <label class="field__label" for="c-waDisp">Nomor WhatsApp (Tampilan)</label>
          <input id="c-waDisp" class="field__input" value="${escapeHtml(c.whatsappDisplay || '')}" placeholder="0851-5549-4199">
        </div>
        <div class="field">
          <label class="field__label" for="c-waNum">Nomor WhatsApp (Format Internasional 62...)</label>
          <input id="c-waNum" class="field__input" value="${escapeHtml(c.whatsappNumber || '')}" placeholder="6285155494199">
        </div>
        <div class="field field--full">
          <label class="field__label" for="c-email">Email Booking / Press</label>
          <input id="c-email" class="field__input" type="email" value="${escapeHtml(c.email || '')}" placeholder="email@band.com">
        </div>

        ${renderImageControl({ id: 'c-backdrop', label: 'Foto Latar Bagian Contact', value: c.backdrop })}

        <div class="field field--full">
          <label class="field__label" for="dsp-spotify">URL Artis Spotify</label>
          <input id="dsp-spotify" class="field__input" value="${escapeHtml(dsp.spotifyArtistUrl || '')}" placeholder="https://open.spotify.com/artist/...">
        </div>
        <div class="field">
          <label class="field__label" for="dsp-ytm">URL YouTube Music</label>
          <input id="dsp-ytm" class="field__input" value="${escapeHtml(dsp.youtubeMusicUrl || '')}" placeholder="https://music.youtube.com/channel/...">
        </div>
        <div class="field">
          <label class="field__label" for="dsp-apple">URL Apple Music</label>
          <input id="dsp-apple" class="field__input" value="${escapeHtml(dsp.appleMusicUrl || '')}" placeholder="https://music.apple.com/...">
        </div>
      </div>

      <div>
        <div class="item-card__head" style="margin-bottom:0.85rem">
          <h3 class="item-card__title">Tautan Media Sosial</h3>
          <button type="button" id="add-social-btn" class="btn btn--outline-dark btn--sm">+ Tambah Sosial Media</button>
        </div>
        <div class="item-stack">
          ${(c.socials || [])
            .map(
              (s, idx) => `
              <div class="item-card" data-soc-idx="${idx}">
                <div class="field-grid">
                  <div class="field">
                    <label class="field__label" for="soc-plat-${idx}">Platform</label>
                    <input id="soc-plat-${idx}" class="field__input" data-field="platform" value="${escapeHtml(s.platform || '')}" placeholder="Instagram / TikTok / X">
                  </div>
                  <div class="field">
                    <label class="field__label" for="soc-handle-${idx}">Username / Label</label>
                    <input id="soc-handle-${idx}" class="field__input" data-field="handle" value="${escapeHtml(s.handle || '')}" placeholder="@eveslily.official">
                  </div>
                  <div class="field field--full">
                    <label class="field__label" for="soc-url-${idx}">URL Profil</label>
                    <input id="soc-url-${idx}" class="field__input" data-field="url" value="${escapeHtml(s.url || '')}" placeholder="https://...">
                  </div>
                </div>
                <div class="item-card__controls">
                  <button type="button" class="btn btn--danger btn--sm" data-del-soc="${idx}">Hapus</button>
                </div>
              </div>`
            )
            .join('')}
        </div>
      </div>
    </section>
  `;

  const bind = (sel, fn) => workspace.querySelector(sel)?.addEventListener('input', (e) => { fn(e.target.value); persistDraft(); });
  bind('#c-picRole', (v) => { epkData.contact.picRole = v; });
  bind('#c-picName', (v) => { epkData.contact.picName = v; });
  bind('#c-waDisp', (v) => { epkData.contact.whatsappDisplay = v; });
  bind('#c-waNum', (v) => { epkData.contact.whatsappNumber = v.replace(/\D/g, ''); });
  bind('#c-email', (v) => { epkData.contact.email = v; });
  bind('#dsp-spotify', (v) => {
    epkData.dsp.spotifyArtistUrl = v;
    const m = v.match(/open\.spotify\.com\/artist\/([a-zA-Z0-9]+)/);
    epkData.dsp.spotifyArtistId = m ? m[1] : '';
  });
  bind('#dsp-ytm', (v) => { epkData.dsp.youtubeMusicUrl = v; });
  bind('#dsp-apple', (v) => { epkData.dsp.appleMusicUrl = v; });

  bindImageControl(workspace, 'c-backdrop', ({ path, width, height }) => {
    epkData.contact.backdrop = path;
    if (width) epkData.contact.backdropWidth = width;
    if (height) epkData.contact.backdropHeight = height;
    persistDraft();
  });

  workspace.querySelector('#add-social-btn')?.addEventListener('click', () => {
    epkData.contact.socials.push({ platform: '', handle: '', url: '' });
    persistDraft();
    renderWorkspace();
  });

  workspace.querySelectorAll('[data-soc-idx]').forEach((card) => {
    const idx = Number(card.dataset.socIdx);
    card.querySelectorAll('[data-field]').forEach((inp) => {
      inp.addEventListener('input', () => {
        epkData.contact.socials[idx][inp.dataset.field] = inp.value;
        persistDraft();
      });
    });
  });

  workspace.querySelectorAll('[data-del-soc]').forEach((btn) => {
    btn.addEventListener('click', () => {
      epkData.contact.socials.splice(Number(btn.dataset.delSoc), 1);
      persistDraft();
      renderWorkspace();
    });
  });
}

function renderGitHubSection(workspace) {
  workspace.innerHTML = `
    <section class="admin-panel" aria-labelledby="panel-gh-title">
      <div class="admin-panel__head">
        <div>
          <h2 id="panel-gh-title" class="admin-panel__title">Sinkronisasi Langsung ke GitHub</h2>
          <p class="admin-panel__desc">Hubungkan repository GitHub kamu agar tombol "Simpan ke GitHub" dan upload foto langsung memperbarui situs GitHub Pages tanpa perlu menyentuh kode.</p>
        </div>
      </div>

      <ol class="guide-steps">
        <li>Buat repository GitHub untuk EPK ini (misalnya <strong>eveslily-epk</strong>) dan aktifkan <strong>Settings &gt; Pages &gt; Deploy from branch main</strong>.</li>
        <li>Buka <strong>GitHub Settings &gt; Developer settings &gt; Personal access tokens &gt; Fine-grained tokens</strong>, lalu buat token baru khusus untuk <strong>Only select repositories</strong> (pilih repo EPK ini) dengan izin <strong>Contents: Read and write</strong>.</li>
        <li>Masukkan detail repo dan token di bawah. Token hanya disimpan di browser ini (<code>localStorage</code>) dan tidak pernah ikut tersimpan ke file <code>epk.json</code>.</li>
      </ol>

      <div id="gh-feedback" class="feedback-box" hidden role="status" aria-live="polite"></div>

      <div class="field-grid">
        <div class="field">
          <label class="field__label" for="gh-owner">Username / Organisasi GitHub</label>
          <input id="gh-owner" class="field__input" value="${escapeHtml(ghConfig.owner)}" placeholder="Contoh: eveslily">
        </div>
        <div class="field">
          <label class="field__label" for="gh-repo">Nama Repository</label>
          <input id="gh-repo" class="field__input" value="${escapeHtml(ghConfig.repo)}" placeholder="Contoh: eveslily-epk">
        </div>
        <div class="field">
          <label class="field__label" for="gh-branch">Branch</label>
          <input id="gh-branch" class="field__input" value="${escapeHtml(ghConfig.branch || 'main')}" placeholder="main">
        </div>
        <div class="field">
          <label class="field__label" for="gh-commit">Pesan Commit</label>
          <input id="gh-commit" class="field__input" value="Update konten EPK Eve's Lily" placeholder="Pesan perubahan">
        </div>
        <div class="field field--full">
          <label class="field__label" for="gh-token">Fine-Grained Personal Access Token</label>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
            <input id="gh-token" class="field__input" style="flex:1;min-width:220px" type="password" autocomplete="off" value="${escapeHtml(ghConfig.token)}" placeholder="github_pat_...">
            <button type="button" id="gh-toggle-token" class="btn btn--outline-dark btn--sm">Tampilkan Token</button>
          </div>
        </div>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:0.65rem">
        <button type="button" id="gh-publish-btn" class="btn btn--gold">Simpan &amp; Publikasikan ke GitHub</button>
        <button type="button" id="gh-test-btn" class="btn btn--outline-dark">Uji Koneksi Repo</button>
        <button type="button" id="gh-pull-btn" class="btn btn--outline-dark">Ambil Data dari GitHub</button>
        <button type="button" id="gh-clear-token-btn" class="btn btn--danger btn--sm">Hapus Token dari Browser</button>
      </div>
    </section>
  `;

  const fb = workspace.querySelector('#gh-feedback');
  function showFeedback(text, kind = 'info') {
    fb.textContent = text;
    fb.dataset.kind = kind;
    fb.hidden = false;
  }

  workspace.querySelector('#gh-owner')?.addEventListener('input', (e) => { ghConfig.owner = e.target.value; saveGhConfig(); });
  workspace.querySelector('#gh-repo')?.addEventListener('input', (e) => { ghConfig.repo = e.target.value; saveGhConfig(); });
  workspace.querySelector('#gh-branch')?.addEventListener('input', (e) => { ghConfig.branch = e.target.value; saveGhConfig(); });
  workspace.querySelector('#gh-token')?.addEventListener('input', (e) => { ghConfig.token = e.target.value; saveGhConfig(); });

  workspace.querySelector('#gh-toggle-token')?.addEventListener('click', (e) => {
    const inp = workspace.querySelector('#gh-token');
    const isPass = inp.type === 'password';
    inp.type = isPass ? 'text' : 'password';
    e.currentTarget.textContent = isPass ? 'Sembunyikan Token' : 'Tampilkan Token';
  });

  workspace.querySelector('#gh-test-btn')?.addEventListener('click', async () => {
    if (!isGhConfigured()) {
      showFeedback('Lengkapi Username GitHub, Nama Repository, dan Token terlebih dahulu.', 'error');
      return;
    }
    showFeedback('Menguji koneksi ke repository GitHub...', 'info');
    try {
      const owner = encodeURIComponent(ghConfig.owner.trim());
      const repo = encodeURIComponent(ghConfig.repo.trim());
      const info = await githubFetch(`/repos/${owner}/${repo}`);
      showFeedback(`Terhubung ke ${info.full_name} (branch default: ${info.default_branch}). Siap menyimpan data dan mengunggah foto.`, 'ok');
    } catch (err) {
      showFeedback(`Koneksi gagal: ${err.message}. Pastikan nama repo dan izin token Contents (Read & Write) sudah benar.`, 'error');
    }
  });

  workspace.querySelector('#gh-pull-btn')?.addEventListener('click', async () => {
    if (!isGhConfigured()) {
      showFeedback('Lengkapi pengaturan GitHub dulu.', 'error');
      return;
    }
    showFeedback('Mengambil data/epk.json terbaru dari GitHub...', 'info');
    try {
      const owner = encodeURIComponent(ghConfig.owner.trim());
      const repo = encodeURIComponent(ghConfig.repo.trim());
      const branch = encodeURIComponent(ghConfig.branch.trim() || 'main');
      const file = await githubFetch(`/repos/${owner}/${repo}/contents/data/epk.json?ref=${branch}`);
      const parsed = JSON.parse(base64ToUtf8(file.content));
      epkData = parsed;
      clearLocalDraft();
      hasUnsavedChanges = false;
      updateCounts();
      setStatus('Data terbaru diambil dari GitHub', 'ok');
      showFeedback('Berhasil mengambil data/epk.json terbaru dari GitHub ke editor.', 'ok');
    } catch (err) {
      showFeedback(`Gagal mengambil data: ${err.message}`, 'error');
    }
  });

  workspace.querySelector('#gh-publish-btn')?.addEventListener('click', async () => {
    if (!isGhConfigured()) {
      showFeedback('Lengkapi Username GitHub, Nama Repository, dan Token terlebih dahulu.', 'error');
      return;
    }
    const msg = workspace.querySelector('#gh-commit')?.value.trim() || "Update EPK Eve's Lily";
    showFeedback('Menyimpan data/epk.json ke GitHub...', 'info');
    try {
      const res = await publishJsonToGitHub(msg);
      const commitSha = res?.commit?.sha ? res.commit.sha.slice(0, 7) : '';
      showFeedback(`Berhasil dipublikasikan ke GitHub (commit ${commitSha}). GitHub Pages akan memperbarui halaman dalam 1 sampai 2 menit.`, 'ok');
      showToast('Data EPK berhasil disimpan ke GitHub.');
    } catch (err) {
      setStatus('Gagal simpan ke GitHub', 'error');
      showFeedback(`Gagal menyimpan ke GitHub: ${err.message}`, 'error');
    }
  });

  workspace.querySelector('#gh-clear-token-btn')?.addEventListener('click', () => {
    ghConfig.token = '';
    saveGhConfig();
    const inp = workspace.querySelector('#gh-token');
    if (inp) inp.value = '';
    showFeedback('Token dihapus dari browser ini.', 'ok');
  });
}

function renderBackupSection(workspace) {
  workspace.innerHTML = `
    <section class="admin-panel" aria-labelledby="panel-backup-title">
      <div class="admin-panel__head">
        <div>
          <h2 id="panel-backup-title" class="admin-panel__title">Impor, Export &amp; Reset Data JSON</h2>
          <p class="admin-panel__desc">Kalau sedang tidak ingin memakai token GitHub, kamu bisa mengunduh file <code>epk.json</code> dari sini lalu mengunggahnya manual ke folder <code>data/</code> di GitHub.</p>
        </div>
      </div>

      <div id="backup-feedback" class="feedback-box" hidden role="status" aria-live="polite"></div>

      <div style="display:flex;flex-wrap:wrap;gap:0.75rem">
        <button type="button" id="backup-download-btn" class="btn btn--gold">Download data/epk.json</button>
        <label class="file-trigger" style="min-height:46px;padding-inline:1.25rem">
          <span>Impor File epk.json</span>
          <input type="file" id="backup-import-input" accept="application/json,.json">
        </label>
        <button type="button" id="backup-reset-btn" class="btn btn--danger">Reset Draft ke Versi Terbit</button>
      </div>
    </section>
  `;

  const fb = workspace.querySelector('#backup-feedback');
  function showFb(text, kind) {
    fb.textContent = text;
    fb.dataset.kind = kind;
    fb.hidden = false;
  }

  workspace.querySelector('#backup-download-btn')?.addEventListener('click', downloadEpkJson);

  workspace.querySelector('#backup-import-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || !parsed.meta || !parsed.biography) {
        throw new Error('Format JSON tidak memiliki struktur EPK yang valid (meta dan biography wajib ada).');
      }
      epkData = parsed;
      persistDraft();
      showFb(`File "${file.name}" berhasil dimuat ke draft lokal. Klik Preview EPK atau Simpan ke GitHub.`, 'ok');
      showToast('Data epk.json berhasil diimpor.');
    } catch (err) {
      showFb(`Gagal mengimpor file: ${err.message}`, 'error');
    }
    e.target.value = '';
  });

  workspace.querySelector('#backup-reset-btn')?.addEventListener('click', async () => {
    try {
      clearLocalDraft();
      epkData = await fetchPublishedData();
      hasUnsavedChanges = false;
      updateCounts();
      setStatus('Sesuai data/epk.json terbit', 'ok');
      showFb('Draft lokal telah dihapus. Editor kembali memuat versi terbit dari data/epk.json.', 'ok');
      showToast('Draft direset ke versi terbit.');
    } catch (err) {
      showFb(`Gagal memuat ulang versi terbit: ${err.message}`, 'error');
    }
  });
}

/* ==========================================================================
   Download Helper & Navigation Controller
   ========================================================================== */
function downloadEpkJson() {
  if (!epkData) return;
  const blob = new Blob([JSON.stringify(epkData, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'epk.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('File epk.json berhasil diunduh.');
}

function renderWorkspace() {
  const workspace = document.getElementById('admin-workspace');
  if (!workspace || !epkData) return;

  switch (activeSection) {
    case 'hero':
      renderHeroSection(workspace);
      break;
    case 'biography':
      renderBiographySection(workspace);
      break;
    case 'members':
      renderMembersSection(workspace);
      break;
    case 'discography':
      renderDiscographySection(workspace);
      break;
    case 'press':
      renderPressSection(workspace);
      break;
    case 'shows':
      renderShowsSection(workspace);
      break;
    case 'videos':
      renderVideosSection(workspace);
      break;
    case 'contact':
      renderContactSectionAdmin(workspace);
      break;
    case 'github':
      renderGitHubSection(workspace);
      break;
    case 'backup':
      renderBackupSection(workspace);
      break;
    default:
      renderHeroSection(workspace);
  }
}

function switchSection(sectionId) {
  activeSection = sectionId;
  document.querySelectorAll('.admin-nav-btn').forEach((btn) => {
    const active = btn.dataset.section === sectionId;
    btn.setAttribute('aria-current', active ? 'true' : 'false');
  });

  const mobileLabel = document.getElementById('admin-mobile-active-label');
  if (mobileLabel) {
    mobileLabel.textContent = `Bagian: ${SECTION_LABELS[sectionId] || sectionId}`;
  }

  const sidebar = document.getElementById('admin-sidebar');
  const toggleBtn = document.getElementById('admin-nav-toggle');
  if (sidebar && sidebar.dataset.open === 'true') {
    sidebar.dataset.open = 'false';
    toggleBtn?.setAttribute('aria-expanded', 'false');
  }

  renderWorkspace();
}

async function boot() {
  const sidebar = document.getElementById('admin-sidebar');
  const navToggle = document.getElementById('admin-nav-toggle');

  navToggle?.addEventListener('click', () => {
    const willOpen = sidebar.dataset.open !== 'true';
    sidebar.dataset.open = String(willOpen);
    navToggle.setAttribute('aria-expanded', String(willOpen));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar?.dataset.open === 'true') {
      sidebar.dataset.open = 'false';
      navToggle?.setAttribute('aria-expanded', 'false');
      navToggle?.focus();
    }
  });

  document.querySelectorAll('.admin-nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchSection(btn.dataset.section));
  });

  document.getElementById('btn-download-json')?.addEventListener('click', downloadEpkJson);

  document.getElementById('btn-preview-epk')?.addEventListener('click', () => {
    if (epkData && hasUnsavedChanges) {
      saveLocalDraft(epkData);
    }
  });

  document.getElementById('btn-quick-publish')?.addEventListener('click', async () => {
    if (!isGhConfigured()) {
      switchSection('github');
      showToast('Isi pengaturan repository & token GitHub untuk menyimpan langsung.');
      return;
    }
    try {
      await publishJsonToGitHub("Update konten EPK Eve's Lily");
      showToast('Perubahan EPK berhasil disimpan ke GitHub.');
    } catch (err) {
      setStatus('Gagal simpan ke GitHub', 'error');
      showToast(`Gagal simpan ke GitHub: ${err.message}`);
      switchSection('github');
    }
  });

  try {
    const { data, source } = await loadEpkData({ preferDraft: true });
    epkData = data;
    updateCounts();
    if (source === 'draft') {
      hasUnsavedChanges = true;
      setStatus('Memuat draft lokal (belum dipublikasikan)', 'dirty');
    } else {
      setStatus('Sesuai data/epk.json terbit', 'ok');
    }
    switchSection('hero');
  } catch (err) {
    setStatus('Gagal memuat data', 'error');
    const workspace = document.getElementById('admin-workspace');
    workspace.innerHTML = `
      <div class="state-box" role="alert">
        <p class="state-box__title">Gagal membuka data EPK</p>
        <p class="state-box__desc">${escapeHtml(err.message)}. Pastikan situs dibuka melalui server web (bukan langsung klik file HTML) atau melalui GitHub Pages.</p>
        <button type="button" class="btn btn--gold btn--sm" id="retry-admin-load">Muat Ulang</button>
      </div>
    `;
    workspace.querySelector('#retry-admin-load')?.addEventListener('click', () => window.location.reload());
  }
}

boot();
