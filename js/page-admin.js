import {
  authenticatedRepoFetch,
  clearEncryptedVault,
  decryptStoredVault,
  getFailedAttemptCount,
  getMaxFailedAttempts,
  getSessionPublicInfo,
  getStoredVaultMeta,
  hasEncryptedVault,
  IDLE_LOCK_MS,
  isSessionUnlocked,
  isWebCryptoAvailable,
  LOCKED_REPO,
  lockSessionInMemory,
  purgeLegacyPlaintextConfig,
  saveEncryptedVault,
  setActiveSession,
  verifyGitHubAccess
} from './admin-security.js';
import {
  clearLocalDraft,
  fetchPublishedData,
  loadEpkData,
  saveLocalDraft
} from './data-store.js';
import { escapeHtml, extractYouTubeId, safeUrl, showToast } from './ui-shared.js';

let epkData = null;
let activeSection = 'hero';
let showFilterQuery = '';
let hasUnsavedChanges = false;
let editorChromeBound = false;
let idleTimerId = 0;
let lastActivityAt = 0;
let lastActivityMark = 0;

const SECTION_LABELS = {
  hero: 'Hero & Identitas',
  biography: 'Biografi & Filosofi',
  members: 'Personel',
  discography: 'Discography',
  press: 'Press Photos',
  shows: 'Jadwal Panggung',
  videos: 'Video YouTube',
  contact: 'Kontak & DSP',
  github: 'Keamanan & Sinkronisasi',
  backup: 'Impor / Reset JSON'
};

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
  return isSessionUnlocked();
}

async function getRemoteFileSha(filePath) {
  const session = getSessionPublicInfo();
  const branch = encodeURIComponent(session?.branch || LOCKED_REPO.defaultBranch);
  try {
    const file = await authenticatedRepoFetch(`/contents/${filePath}?ref=${branch}`);
    return file.sha || null;
  } catch (err) {
    if (err?.authRevoked) {
      lockAdminStudio(err.message, 'error');
      throw err;
    }
    if (String(err.message).toLowerCase().includes('not found')) return null;
    throw err;
  }
}

async function commitFileToGitHub(filePath, base64Content, message) {
  const session = getSessionPublicInfo();
  const branch = session?.branch || LOCKED_REPO.defaultBranch;
  const sha = await getRemoteFileSha(filePath);

  const payload = { message, content: base64Content, branch };
  if (sha) payload.sha = sha;

  try {
    return await authenticatedRepoFetch(`/contents/${filePath}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    if (err?.authRevoked) {
      lockAdminStudio(err.message, 'error');
    }
    throw err;
  }
}

async function publishJsonToGitHub(commitMsg) {
  if (!isGhConfigured()) {
    lockAdminStudio('Sesi autentikasi terkunci. Silakan masuk kembali untuk mempublikasikan perubahan.', 'info');
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

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function estimateBase64Bytes(base64) {
  return Math.floor((base64.length * 3) / 4);
}

function canvasHasTransparency(ctx, width, height) {
  try {
    const sampleStep = Math.max(1, Math.floor(Math.min(width, height) / 64));
    const data = ctx.getImageData(0, 0, width, height).data;
    for (let y = 0; y < height; y += sampleStep) {
      for (let x = 0; x < width; x += sampleStep) {
        if (data[(y * width + x) * 4 + 3] < 250) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function compressImageFile(file, { maxDimension = 1600, maxBytes = 320 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const originalDataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const srcW = img.naturalWidth || 800;
        const srcH = img.naturalHeight || 600;
        const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
        const targetW = Math.max(1, Math.round(srcW * scale));
        const targetH = Math.max(1, Math.round(srcH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Browser tidak mendukung kompresi gambar canvas.'));
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetW, targetH);

        const isPng = file.type === 'image/png';
        const keepTransparentPng = isPng && canvasHasTransparency(ctx, targetW, targetH);

        let outDataUrl = '';
        let outExt = 'jpg';

        if (keepTransparentPng) {
          outDataUrl = canvas.toDataURL('image/png');
          outExt = 'png';
        } else {
          // Fill white/dark matte behind opaque PNGs before JPEG export
          if (isPng) {
            ctx.globalCompositeOperation = 'destination-over';
            ctx.fillStyle = '#040a1e';
            ctx.fillRect(0, 0, targetW, targetH);
            ctx.globalCompositeOperation = 'source-over';
          }
          const qualities = [0.84, 0.76, 0.68, 0.6];
          for (const q of qualities) {
            outDataUrl = canvas.toDataURL('image/jpeg', q);
            const b64 = outDataUrl.split(',')[1] || '';
            if (estimateBase64Bytes(b64) <= maxBytes) break;
          }
          outExt = 'jpg';
        }

        const base64 = outDataUrl.includes(',') ? outDataUrl.split(',')[1] : '';
        const compressedBytes = estimateBase64Bytes(base64);

        resolve({
          dataUrl: outDataUrl,
          base64,
          ext: outExt,
          width: targetW,
          height: targetH,
          originalBytes: file.size,
          compressedBytes
        });
      };
      img.onerror = () => reject(new Error('File bukan gambar yang valid.'));
      img.src = originalDataUrl;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });
}

async function handleImageSelection(file, fieldId, onUpdate) {
  if (!file) return;
  try {
    const isCover = String(fieldId || '').startsWith('rel-cover-');
    const result = await compressImageFile(file, {
      maxDimension: isCover ? 1000 : 1600,
      maxBytes: isCover ? 220 * 1024 : 340 * 1024
    });

    const baseName = slugify(file.name.replace(/\.[^.]+$/, ''));
    const repoPath = `assets/uploads/${Date.now()}-${baseName}.${result.ext}`;
    const sizeNote = `${formatBytes(result.originalBytes)} -> ${formatBytes(result.compressedBytes)} (${result.width}x${result.height})`;

    if (isGhConfigured()) {
      showToast(`Dikompres (${sizeNote}), mengunggah ke GitHub...`);
      await commitFileToGitHub(repoPath, result.base64, `Upload compressed asset ${baseName}.${result.ext}`);
      onUpdate({ path: repoPath, width: result.width, height: result.height });
      showToast(`Foto terkompres (${sizeNote}) & tersimpan di ${repoPath}.`);
    } else {
      if (result.compressedBytes > 900 * 1024) {
        showToast(`Ukuran masih ${formatBytes(result.compressedBytes)} (>900KB untuk draft lokal). Hubungkan GitHub Sync untuk unggah langsung.`);
        return;
      }
      onUpdate({ path: result.dataUrl, width: result.width, height: result.height });
      showToast(`Foto dikompres otomatis (${sizeNote}) untuk preview lokal.`);
    }
  } catch (err) {
    showToast(`Gagal memproses gambar: ${err.message}`);
  }
}

function renderImageControl({ id, label, value, hint }) {
  const previewSrc = safeUrl(value) === '#' ? './assets/brand/lily-icon-only.png' : safeUrl(value);
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
            ${hint ? `<span class="field__hint">${escapeHtml(hint)}</span>` : ''}
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
    if (preview) preview.src = safeUrl(val) === '#' ? './assets/brand/lily-icon-only.png' : safeUrl(val);
    onValueChange({ path: val });
  });

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    await handleImageSelection(file, id, ({ path, width, height }) => {
      if (textInput) textInput.value = path;
      if (preview) preview.src = path;
      onValueChange({ path, width, height });
    });
    fileInput.value = '';
  });
}

function moveItem(arr, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= arr.length) return;
  const [item] = arr.splice(index, 1);
  arr.splice(target, 0, item);
}

/* ==========================================================================
   Section Renderers
   ========================================================================== */
function renderHeroSection(workspace) {
  const { meta, hero } = epkData;

  workspace.innerHTML = `
    <section class="admin-panel" aria-labelledby="panel-hero-title">
      <div class="admin-panel__head">
        <div>
          <h2 id="panel-hero-title" class="admin-panel__title">Hero &amp; Identitas</h2>
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
  bindText('#hero-quote', (v) => { epkData.hero.lyricQuote = v; });
  bindText('#hero-quote-source', (v) => { epkData.hero.lyricSource = v; });

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
        </div>
      </div>

      <div class="field-grid">
        <div class="field field--full">
          <label class="field__label" for="bio-headline">Judul Profil (Opsional)</label>
          <input id="bio-headline" class="field__input" type="text" value="${escapeHtml(bio.headline || '')}" placeholder="Kosongkan jika tidak ingin menampilkan judul">
        </div>

        ${renderImageControl({ id: 'bio-photo', label: 'Foto Band di Bagian Biografi', value: bio.bandPhoto })}

        <div class="field field--full">
          <label class="field__label" for="bio-paragraphs">Paragraf Biografi</label>
          <textarea id="bio-paragraphs" class="field__textarea" style="min-height:220px" placeholder="Tulis biografi band...">${escapeHtml(paragraphsText)}</textarea>
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
          <h3 class="item-card__title">Ringkasan Fakta Band</h3>
          <button type="button" id="add-highlight-btn" class="btn btn--outline-dark btn--sm">Tambah Fakta</button>
        </div>
        <div class="item-stack">
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
    epkData.biography.paragraphs = e.target.value.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    persistDraft();
  });

  workspace.querySelector('#phil-title')?.addEventListener('input', (e) => {
    epkData.biography.philosophyTitle = e.target.value;
    persistDraft();
  });

  workspace.querySelector('#phil-paragraphs')?.addEventListener('input', (e) => {
    epkData.biography.philosophyParagraphs = e.target.value.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
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

function renderMembersSection(workspace) {
  const members = epkData.members || [];
  workspace.innerHTML = `
    <section class="admin-panel" aria-labelledby="panel-members-title">
      <div class="admin-panel__head">
        <div>
          <h2 id="panel-members-title" class="admin-panel__title">Personel (${members.length})</h2>
        </div>
        <button type="button" id="add-member-btn" class="btn btn--primary btn--sm">Tambah Personel</button>
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
                  <input id="mem-role-${idx}" class="field__input" data-field="role" value="${escapeHtml(m.role || '')}" placeholder="Contoh: Vocal, Guitar, Bass, Drum">
                </div>
                <div class="field">
                  <label class="field__label" for="mem-note-${idx}">Catatan Singkat (Opsional)</label>
                  <input id="mem-note-${idx}" class="field__input" data-field="note" value="${escapeHtml(m.note || '')}" placeholder="Contoh: Bergabung sejak 2025">
                </div>
                <div class="field">
                  <label class="field__label" for="mem-pos-${idx}">Posisi Crop Foto (CSS object-position)</label>
                  <input id="mem-pos-${idx}" class="field__input" data-field="photoPosition" value="${escapeHtml(m.photoPosition || '50% 24%')}" placeholder="50% 24% (atas) / 50% 56% (tengah)">
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
      photoPosition: '50% 24%',
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
  const latestReleasedIdx = items.findIndex((item) => !item.upcoming);
  workspace.innerHTML = `
    <section class="admin-panel" aria-labelledby="panel-discog-title">
      <div class="admin-panel__head">
        <div>
          <h2 id="panel-discog-title" class="admin-panel__title">Discography (${items.length})</h2>
        </div>
        <button type="button" id="add-release-btn" class="btn btn--primary btn--sm">Tambah Rilisan</button>
      </div>

      <div class="item-stack">
        ${items
          .map(
            (r, idx) => `
            <div class="item-card" data-rel-idx="${idx}">
              <div class="item-card__head">
                <h3 class="item-card__title">${escapeHtml(r.title || 'Rilis Baru')} (${escapeHtml(r.year || 'Tahun')})${r.upcoming ? ' [Rilisan Mendatang]' : ''}${idx === latestReleasedIdx ? ' [Rilisan Terbaru · Otomatis]' : ''}</h3>
                <div class="item-card__controls">
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
                  <label class="field__label" for="rel-year-${idx}">Tahun / Status Waktu</label>
                  <input id="rel-year-${idx}" class="field__input" data-field="year" value="${escapeHtml(r.year || '')}" placeholder="2026 atau Segera Hadir">
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
                  <input id="rel-sub-${idx}" class="field__input" data-field="subtitle" value="${escapeHtml(r.subtitle || '')}" placeholder="Contoh: Rilisan Mendatang / OST Game">
                </div>

                <div class="field">
                  <label class="field__checkbox-row" for="rel-upcoming-${idx}">
                    <input id="rel-upcoming-${idx}" type="checkbox" data-bool="upcoming" ${r.upcoming ? 'checked' : ''}>
                    <span>Tandai sebagai Rilisan Mendatang</span>
                  </label>
                </div>
                <div class="field">
                  <label class="field__checkbox-row" for="rel-blur-${idx}">
                    <input id="rel-blur-${idx}" type="checkbox" data-bool="blurredCover" ${r.blurredCover ? 'checked' : ''}>
                    <span>Tambahkan efek blur CSS pada cover</span>
                  </label>
                </div>

                <div class="field">
                  <label class="field__label" for="rel-spotify-${idx}">URL Spotify (Opsional, kosong = profil artis)</label>
                  <input id="rel-spotify-${idx}" class="field__input" data-field="spotifyUrl" value="${escapeHtml(r.spotifyUrl || '')}" placeholder="https://open.spotify.com/track/...">
                </div>
                <div class="field">
                  <label class="field__label" for="rel-apple-${idx}">URL Apple Music (Opsional)</label>
                  <input id="rel-apple-${idx}" class="field__input" data-field="appleMusicUrl" value="${escapeHtml(r.appleMusicUrl || '')}" placeholder="https://music.apple.com/...">
                </div>
                <div class="field">
                  <label class="field__label" for="rel-ytm-${idx}">URL YouTube Music (Opsional)</label>
                  <input id="rel-ytm-${idx}" class="field__input" data-field="youtubeMusicUrl" value="${escapeHtml(r.youtubeMusicUrl || '')}" placeholder="https://music.youtube.com/...">
                </div>
                <div class="field">
                  <label class="field__label" for="rel-audio-${idx}">URL Audio Preview MP3/M4A (Opsional)</label>
                  <input id="rel-audio-${idx}" class="field__input" data-field="audioPreviewUrl" value="${escapeHtml(r.audioPreviewUrl || '')}" placeholder="assets/audio/preview.mp3">
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
      upcoming: false,
      blurredCover: false,
      featured: false,
      category: 'Single',
      cover: 'assets/covers/11-perayaan-bintang-jatuh-blur.jpg',
      coverWidth: 480,
      coverHeight: 480,
      tracklist: [],
      spotifyUrl: '',
      appleMusicUrl: '',
      youtubeMusicUrl: '',
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
    card.querySelectorAll('[data-bool]').forEach((chk) => {
      chk.addEventListener('change', () => {
        epkData.discography[idx][chk.dataset.bool] = chk.checked;
        persistDraft();
        renderWorkspace();
      });
    });
    card.querySelector('[data-tracklist]')?.addEventListener('input', (e) => {
      epkData.discography[idx].tracklist = e.target.value.split('\n').map((line) => line.trim()).filter(Boolean);
      persistDraft();
    });
    bindImageControl(card, `rel-cover-${idx}`, ({ path, width, height }) => {
      epkData.discography[idx].cover = path;
      if (width) epkData.discography[idx].coverWidth = width;
      if (height) epkData.discography[idx].coverHeight = height;
      persistDraft();
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
        </div>
        <button type="button" id="add-press-btn" class="btn btn--primary btn--sm">Tambah Foto</button>
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
        </div>
        <button type="button" id="add-show-btn" class="btn btn--primary btn--sm">Tambah Jadwal</button>
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
        </div>
        <button type="button" id="add-video-btn" class="btn btn--primary btn--sm">Tambah Video</button>
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
          <button type="button" id="add-social-btn" class="btn btn--outline-dark btn--sm">Tambah Sosial Media</button>
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
  const session = getSessionPublicInfo();
  const vaultMeta = getStoredVaultMeta();
  const repoFull = session?.repoFullName || `${LOCKED_REPO.owner}/${LOCKED_REPO.repo}`;
  const branch = session?.branch || LOCKED_REPO.defaultBranch;
  const modeLabel =
    session?.mode === 'vault' || vaultMeta
      ? 'Vault Terenkripsi AES-256-GCM (PBKDF2 310k)'
      : 'Sesi Sementara (RAM Saja, Tanpa Simpan)';

  workspace.innerHTML = `
    <section class="admin-panel" aria-labelledby="panel-gh-title">
      <div class="admin-panel__head">
        <div>
          <h2 id="panel-gh-title" class="admin-panel__title">Keamanan &amp; Sinkronisasi</h2>
        </div>
      </div>

      <div class="security-summary-grid">
        <div class="security-stat">
          <p class="security-stat__label">Repository Terkunci</p>
          <p class="security-stat__value">${escapeHtml(repoFull)} (${escapeHtml(branch)})</p>
        </div>
        <div class="security-stat">
          <p class="security-stat__label">Otorisasi Server</p>
          <p class="security-stat__value security-stat__value--ok">Terverifikasi (Izin Push Aktif)</p>
        </div>
        <div class="security-stat">
          <p class="security-stat__label">Penyimpanan Token</p>
          <p class="security-stat__value">${escapeHtml(modeLabel)}</p>
        </div>
        <div class="security-stat">
          <p class="security-stat__label">Auto-Lock Idle</p>
          <p class="security-stat__value">Otomatis terkunci setelah ${Math.round(IDLE_LOCK_MS / 60000)} menit</p>
        </div>
      </div>

      <div id="gh-feedback" class="feedback-box" hidden role="status" aria-live="polite"></div>

      <div class="field-grid">
        <div class="field field--full">
          <label class="field__label" for="gh-commit">Pesan Commit Publikasi</label>
          <input id="gh-commit" class="field__input" value="Update konten EPK Eve's Lily" placeholder="Pesan perubahan">
        </div>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:0.65rem">
        <button type="button" id="gh-publish-btn" class="btn btn--primary">Simpan &amp; Publikasikan ke GitHub</button>
        <button type="button" id="gh-test-btn" class="btn btn--outline-dark">Verifikasi Ulang Koneksi</button>
        <button type="button" id="gh-pull-btn" class="btn btn--outline-dark">Ambil Data Terbaru dari GitHub</button>
      </div>

      <div class="item-card">
        <div class="item-card__head">
          <h3 class="item-card__title">Kontrol Sesi &amp; Vault Enkripsi</h3>
        </div>
        <p class="field__hint">
          Klik <strong>Kunci Sesi Sekarang</strong> untuk menghapus token dari memori RAM segera (vault terenkripsi tetap aman di browser ini). Klik <strong>Hapus Vault &amp; Logout Penuh</strong> jika kamu memakai perangkat bersama atau ingin mengganti token / passphrase.
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:0.65rem">
          <button type="button" id="gh-lock-now-btn" class="btn btn--outline-dark btn--sm">Kunci Sesi Sekarang</button>
          <button type="button" id="gh-wipe-vault-btn" class="btn btn--danger btn--sm">Hapus Vault &amp; Logout Penuh</button>
        </div>
      </div>
    </section>
  `;

  const fb = workspace.querySelector('#gh-feedback');
  function showFeedback(text, kind = 'info') {
    fb.textContent = text;
    fb.dataset.kind = kind;
    fb.hidden = false;
  }

  workspace.querySelector('#gh-test-btn')?.addEventListener('click', async () => {
    showFeedback('Memverifikasi ulang koneksi & izin tulis ke server GitHub...', 'info');
    try {
      const info = await authenticatedRepoFetch('');
      const canPush = Boolean(info?.permissions?.push || info?.permissions?.admin);
      if (!canPush) {
        lockAdminStudio('Izin tulis pada repository sudah tidak aktif. Sesi dikunci.', 'error');
        return;
      }
      showFeedback(`Terverifikasi ke ${info.full_name} (branch aktif: ${branch}). Izin tulis aktif.`, 'ok');
    } catch (err) {
      if (err?.authRevoked) return;
      showFeedback(`Verifikasi gagal: ${err.message}`, 'error');
    }
  });

  workspace.querySelector('#gh-pull-btn')?.addEventListener('click', async () => {
    showFeedback('Mengambil data/epk.json terbaru dari GitHub...', 'info');
    try {
      const file = await authenticatedRepoFetch(`/contents/data/epk.json?ref=${encodeURIComponent(branch)}`);
      const parsed = JSON.parse(base64ToUtf8(file.content));
      epkData = parsed;
      clearLocalDraft();
      hasUnsavedChanges = false;
      updateCounts();
      setStatus('Data terbaru diambil dari GitHub', 'ok');
      showFeedback('Berhasil mengambil data/epk.json terbaru dari GitHub ke editor.', 'ok');
    } catch (err) {
      if (err?.authRevoked) return;
      showFeedback(`Gagal mengambil data: ${err.message}`, 'error');
    }
  });

  workspace.querySelector('#gh-publish-btn')?.addEventListener('click', async () => {
    const msg = workspace.querySelector('#gh-commit')?.value.trim() || "Update EPK Eve's Lily";
    showFeedback('Menyimpan data/epk.json ke GitHub...', 'info');
    try {
      const res = await publishJsonToGitHub(msg);
      if (!res) return;
      const commitSha = res?.commit?.sha ? res.commit.sha.slice(0, 7) : '';
      showFeedback(`Berhasil dipublikasikan ke GitHub (commit ${commitSha}). GitHub Pages akan memperbarui halaman dalam 1 sampai 2 menit.`, 'ok');
      showToast('Data EPK berhasil disimpan ke GitHub.');
    } catch (err) {
      if (err?.authRevoked) return;
      setStatus('Gagal simpan ke GitHub', 'error');
      showFeedback(`Gagal menyimpan ke GitHub: ${err.message}`, 'error');
    }
  });

  workspace.querySelector('#gh-lock-now-btn')?.addEventListener('click', () => {
    lockAdminStudio('Sesi dikunci. Token telah dihapus dari memori RAM.', 'info');
  });

  workspace.querySelector('#gh-wipe-vault-btn')?.addEventListener('click', () => {
    clearEncryptedVault();
    lockAdminStudio('Vault terenkripsi dan sesi aktif telah dihapus sepenuhnya dari browser ini.', 'ok');
  });
}

function renderBackupSection(workspace) {
  workspace.innerHTML = `
    <section class="admin-panel" aria-labelledby="panel-backup-title">
      <div class="admin-panel__head">
        <div>
          <h2 id="panel-backup-title" class="admin-panel__title">Impor, Export &amp; Reset Data JSON</h2>
        </div>
      </div>

      <div id="backup-feedback" class="feedback-box" hidden role="status" aria-live="polite"></div>

      <div style="display:flex;flex-wrap:wrap;gap:0.75rem">
        <button type="button" id="backup-download-btn" class="btn btn--primary">Download data/epk.json</button>
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
    case 'hero': renderHeroSection(workspace); break;
    case 'biography': renderBiographySection(workspace); break;
    case 'members': renderMembersSection(workspace); break;
    case 'discography': renderDiscographySection(workspace); break;
    case 'press': renderPressSection(workspace); break;
    case 'shows': renderShowsSection(workspace); break;
    case 'videos': renderVideosSection(workspace); break;
    case 'contact': renderContactSectionAdmin(workspace); break;
    case 'github': renderGitHubSection(workspace); break;
    case 'backup': renderBackupSection(workspace); break;
    default: renderHeroSection(workspace);
  }
}

function switchSection(sectionId) {
  activeSection = sectionId;
  document.querySelectorAll('.admin-nav-btn').forEach((btn) => {
    btn.setAttribute('aria-current', btn.dataset.section === sectionId ? 'true' : 'false');
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

function showGateFeedback(text, kind = 'info') {
  const fb = document.getElementById('auth-feedback');
  if (!fb) return;
  if (!text) {
    fb.hidden = true;
    fb.textContent = '';
    return;
  }
  fb.textContent = text;
  fb.dataset.kind = kind;
  fb.hidden = false;
}

function updateVaultAttemptHint() {
  const hint = document.getElementById('vault-attempts-hint');
  if (!hint) return;
  const used = getFailedAttemptCount();
  const max = getMaxFailedAttempts();
  const left = Math.max(0, max - used);
  hint.textContent =
    used > 0
      ? `Sisa percobaan sebelum vault otomatis terhapus: ${left} dari ${max}.`
      : `Vault akan otomatis terhapus setelah ${max} kali percobaan salah.`;
}

function setGateMode(mode) {
  const unlockForm = document.getElementById('auth-unlock-form');
  const tokenForm = document.getElementById('auth-token-form');
  const backToVaultWrap = document.getElementById('auth-back-to-vault-wrap');
  const vaultExists = hasEncryptedVault();

  if (mode === 'unlock' && vaultExists) {
    if (unlockForm) unlockForm.hidden = false;
    if (tokenForm) tokenForm.hidden = true;
    updateVaultAttemptHint();
    document.getElementById('vault-passphrase')?.focus();
  } else {
    if (unlockForm) unlockForm.hidden = true;
    if (tokenForm) tokenForm.hidden = false;
    if (backToVaultWrap) backToVaultWrap.hidden = !vaultExists;
    document.getElementById('login-gh-token')?.focus();
  }
}

function stopIdleMonitor() {
  if (idleTimerId) {
    window.clearTimeout(idleTimerId);
    idleTimerId = 0;
  }
}

function scheduleIdleLock() {
  stopIdleMonitor();
  if (!isSessionUnlocked()) return;
  lastActivityAt = Date.now();
  idleTimerId = window.setTimeout(() => {
    if (isSessionUnlocked()) {
      lockAdminStudio(
        `Sesi dikunci otomatis setelah ${Math.round(IDLE_LOCK_MS / 60000)} menit tidak aktif. Buka kunci kembali untuk melanjutkan.`,
        'info'
      );
    }
  }, IDLE_LOCK_MS);
}

function recordUserActivity() {
  if (!isSessionUnlocked()) return;
  const now = Date.now();
  if (now - lastActivityMark < 2000) return;
  lastActivityMark = now;
  scheduleIdleLock();
}

function checkElapsedIdleOnResume() {
  if (!isSessionUnlocked()) return;
  if (lastActivityAt && Date.now() - lastActivityAt >= IDLE_LOCK_MS) {
    lockAdminStudio(
      `Sesi dikunci otomatis setelah ${Math.round(IDLE_LOCK_MS / 60000)} menit tidak aktif. Buka kunci kembali untuk melanjutkan.`,
      'info'
    );
  }
}

function lockAdminStudio(reasonMessage = '', kind = 'info') {
  if (epkData && hasUnsavedChanges) {
    saveLocalDraft(epkData);
  }
  stopIdleMonitor();
  lockSessionInMemory();
  epkData = null;

  const workspace = document.getElementById('admin-workspace');
  if (workspace) workspace.innerHTML = '';

  const protectedApp = document.getElementById('admin-protected-app');
  const gate = document.getElementById('admin-gate');
  if (protectedApp) protectedApp.hidden = true;
  if (gate) gate.hidden = false;

  document.body.dataset.locked = 'true';
  document.title = "Akses Terkunci | Editor EPK Eve's Lily";

  // Clear any sensitive fields on lock
  const passEl = document.getElementById('vault-passphrase');
  const tokEl = document.getElementById('login-gh-token');
  const newPassEl = document.getElementById('login-passphrase');
  const confPassEl = document.getElementById('login-passphrase-confirm');
  if (passEl) passEl.value = '';
  if (tokEl) tokEl.value = '';
  if (newPassEl) newPassEl.value = '';
  if (confPassEl) confPassEl.value = '';

  setGateMode(hasEncryptedVault() ? 'unlock' : 'token');
  showGateFeedback(reasonMessage, kind);
}

function bindEditorChromeOnce() {
  if (editorChromeBound) return;
  editorChromeBound = true;

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
    if (epkData && hasUnsavedChanges) saveLocalDraft(epkData);
  });

  document.getElementById('btn-lock-session')?.addEventListener('click', () => {
    lockAdminStudio('Sesi Editor EPK telah dikunci dengan aman.', 'info');
  });

  document.getElementById('btn-quick-publish')?.addEventListener('click', async () => {
    if (!isGhConfigured()) {
      lockAdminStudio('Sesi autentikasi terkunci. Masuk kembali untuk menyimpan ke GitHub.', 'info');
      return;
    }
    try {
      const res = await publishJsonToGitHub("Update konten EPK Eve's Lily");
      if (res) showToast('Perubahan EPK berhasil disimpan ke GitHub.');
    } catch (err) {
      if (err?.authRevoked) return;
      setStatus('Gagal simpan ke GitHub', 'error');
      showToast(`Gagal simpan ke GitHub: ${err.message}`);
      switchSection('github');
    }
  });

  ['pointerdown', 'keydown', 'input', 'scroll'].forEach((evt) => {
    window.addEventListener(evt, recordUserActivity, { passive: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkElapsedIdleOnResume();
  });
  window.addEventListener('focus', checkElapsedIdleOnResume);
}

async function unlockAdminStudio() {
  if (!isSessionUnlocked()) return;
  bindEditorChromeOnce();

  const gate = document.getElementById('admin-gate');
  const protectedApp = document.getElementById('admin-protected-app');
  if (gate) gate.hidden = true;
  if (protectedApp) protectedApp.hidden = false;

  document.body.dataset.locked = 'false';
  document.title = "Editor EPK | Eve's Lily Content Studio";
  showGateFeedback('');
  scheduleIdleLock();

  try {
    const { data, source } = await loadEpkData({ preferDraft: true });
    epkData = data;
    updateCounts();
    if (source === 'draft') {
      hasUnsavedChanges = true;
      setStatus('Memuat draft lokal (belum dipublikasikan)', 'dirty');
    } else {
      setStatus('Terverifikasi · Sesuai data/epk.json terbit', 'ok');
    }
    switchSection('hero');
  } catch (err) {
    setStatus('Gagal memuat data', 'error');
    const workspace = document.getElementById('admin-workspace');
    workspace.innerHTML = `
      <div class="state-box" role="alert">
        <p class="state-box__title">Gagal membuka data EPK</p>
        <p class="state-box__desc">${escapeHtml(err.message)}. Pastikan situs dibuka melalui server web atau GitHub Pages.</p>
        <button type="button" class="btn btn--primary btn--sm" id="retry-admin-load">Muat Ulang</button>
      </div>
    `;
    workspace.querySelector('#retry-admin-load')?.addEventListener('click', () => window.location.reload());
  }
}

function initAuthGate() {
  const purgedLegacy = purgeLegacyPlaintextConfig();
  const cryptoOk = isWebCryptoAvailable();
  const saveVaultChk = document.getElementById('login-save-vault');
  const vaultFields = document.getElementById('login-vault-fields');

  if (!cryptoOk && saveVaultChk && vaultFields) {
    saveVaultChk.checked = false;
    saveVaultChk.disabled = true;
    vaultFields.hidden = true;
  }

  saveVaultChk?.addEventListener('change', () => {
    if (vaultFields) vaultFields.hidden = !saveVaultChk.checked;
  });

  document.getElementById('btn-switch-to-token')?.addEventListener('click', () => {
    showGateFeedback('');
    setGateMode('token');
  });

  document.getElementById('btn-back-to-vault')?.addEventListener('click', () => {
    showGateFeedback('');
    setGateMode('unlock');
  });

  document.getElementById('btn-wipe-vault-gate')?.addEventListener('click', () => {
    clearEncryptedVault();
    setGateMode('token');
    showGateFeedback('Vault terenkripsi di browser ini telah dihapus. Kamu dapat masuk kembali dengan Fine-Grained Token GitHub.', 'ok');
  });

  // Mode A: Decrypt local AES-256-GCM vault + verify live with GitHub server
  const unlockForm = document.getElementById('auth-unlock-form');
  unlockForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const passInput = document.getElementById('vault-passphrase');
    const submitBtn = document.getElementById('btn-vault-unlock');
    const passphrase = passInput?.value || '';

    if (!passphrase) {
      showGateFeedback('Masukkan Passphrase Lokal terlebih dahulu.', 'error');
      passInput?.focus();
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    showGateFeedback('Membuka enkripsi AES-256-GCM & memverifikasi token ke server GitHub...', 'info');

    try {
      const { token, branch } = await decryptStoredVault(passphrase);
      if (passInput) passInput.value = '';
      const verified = await verifyGitHubAccess(token, branch);
      setActiveSession({
        token,
        branch: verified.branch,
        mode: 'vault',
        repoFullName: verified.fullName
      });
      await unlockAdminStudio();
    } catch (err) {
      if (passInput) passInput.value = '';
      updateVaultAttemptHint();
      if (err?.vaultWiped) {
        setGateMode('token');
      }
      showGateFeedback(err.message || 'Gagal membuka kunci vault.', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // Mode B: Authenticate directly with GitHub server + optional AES-256-GCM vault encryption
  const tokenForm = document.getElementById('auth-token-form');
  tokenForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const tokenInput = document.getElementById('login-gh-token');
    const branchInput = document.getElementById('login-gh-branch');
    const passInput = document.getElementById('login-passphrase');
    const confirmInput = document.getElementById('login-passphrase-confirm');
    const submitBtn = document.getElementById('btn-token-login');

    const token = tokenInput?.value.trim() || '';
    const branch = branchInput?.value.trim() || LOCKED_REPO.defaultBranch;
    const wantVault = Boolean(saveVaultChk?.checked && cryptoOk);
    const passphrase = passInput?.value || '';
    const confirmPass = confirmInput?.value || '';

    if (!token) {
      showGateFeedback('Masukkan GitHub Fine-Grained Personal Access Token terlebih dahulu.', 'error');
      tokenInput?.focus();
      return;
    }

    if (wantVault) {
      if (passphrase.length < 8) {
        showGateFeedback('Passphrase lokal wajib minimal 8 karakter agar enkripsi AES-256-GCM kuat.', 'error');
        passInput?.focus();
        return;
      }
      if (passphrase !== confirmPass) {
        showGateFeedback('Konfirmasi Passphrase lokal tidak sama. Periksa kembali ketikan kamu.', 'error');
        confirmInput?.focus();
        return;
      }
    }

    if (submitBtn) submitBtn.disabled = true;
    showGateFeedback(`Memverifikasi izin tulis ke server GitHub (${LOCKED_REPO.owner}/${LOCKED_REPO.repo})...`, 'info');

    try {
      const verified = await verifyGitHubAccess(token, branch);
      if (wantVault) {
        showGateFeedback('Token terverifikasi. Mengenkripsi vault dengan PBKDF2-SHA256 & AES-256-GCM...', 'info');
        await saveEncryptedVault(token, passphrase, verified.branch);
      }
      // Wipe sensitive inputs from DOM immediately after verification
      if (tokenInput) tokenInput.value = '';
      if (passInput) passInput.value = '';
      if (confirmInput) confirmInput.value = '';

      setActiveSession({
        token,
        branch: verified.branch,
        mode: wantVault ? 'vault' : 'ephemeral',
        repoFullName: verified.fullName
      });
      await unlockAdminStudio();
    } catch (err) {
      showGateFeedback(err.message || 'Autentikasi ke GitHub gagal.', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  setGateMode(hasEncryptedVault() ? 'unlock' : 'token');

  if (purgedLegacy) {
    showGateFeedback(
      'Pembaruan Keamanan: token lama yang sebelumnya tersimpan polos telah dihapus otomatis dari browser. Silakan masuk ulang dan buat Passphrase Lokal untuk enkripsi AES-256-GCM.',
      'info'
    );
  } else if (!cryptoOk) {
    showGateFeedback(
      'Mode Sesi Sementara aktif: penyimpanan vault terenkripsi membutuhkan HTTPS atau localhost.',
      'info'
    );
  }
}

initAuthGate();
