/**
 * Unified data loader for Eve's Lily EPK.
 * Supports reading live ./data/epk.json as well as local browser preview drafts
 * saved from ./admin.html so changes can be inspected before pushing to GitHub.
 */

export const DRAFT_STORAGE_KEY = 'eveslily_epk_draft_v1';
export const GITHUB_CONFIG_KEY = 'eveslily_epk_gh_config_v1';

export function hasLocalDraft() {
  try {
    return Boolean(window.localStorage.getItem(DRAFT_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function getLocalDraft() {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveLocalDraft(data) {
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(data));
}

export function clearLocalDraft() {
  window.localStorage.removeItem(DRAFT_STORAGE_KEY);
}

export async function fetchPublishedData() {
  const response = await fetch('./data/epk.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Gagal memuat data EPK (HTTP ${response.status}).`);
  }
  const json = await response.json();
  if (!json || typeof json !== 'object' || !json.meta || !json.biography) {
    throw new Error('Struktur data/epk.json tidak lengkap.');
  }
  return json;
}

export async function loadEpkData({ preferDraft = true } = {}) {
  const params = new URLSearchParams(window.location.search);
  const forcePublished = params.get('published') === '1';

  if (preferDraft && !forcePublished) {
    const draft = getLocalDraft();
    if (draft && draft.meta && draft.biography) {
      return { data: draft, source: 'draft' };
    }
  }

  const data = await fetchPublishedData();
  return { data, source: 'published' };
}

export function mountDraftBanner(source) {
  if (source !== 'draft') return;
  if (document.querySelector('.preview-banner')) return;

  const banner = document.createElement('div');
  banner.className = 'preview-banner';
  banner.setAttribute('role', 'status');

  const text = document.createElement('span');
  text.textContent = 'Mode Preview Draft Lokal: perubahan ini belum dipublikasikan ke GitHub.';

  const actions = document.createElement('div');
  actions.className = 'preview-banner__actions';

  const editLink = document.createElement('a');
  editLink.href = './admin.html';
  editLink.className = 'preview-banner__btn preview-banner__btn--solid';
  editLink.textContent = 'Kembali ke Editor';

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'preview-banner__btn';
  resetBtn.textContent = 'Lihat Versi Terbit';
  resetBtn.addEventListener('click', () => {
    clearLocalDraft();
    window.location.reload();
  });

  actions.append(editLink, resetBtn);
  banner.append(text, actions);
  document.body.prepend(banner);
}
