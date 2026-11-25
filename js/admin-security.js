/**
 * Zero-Trust Security Module for Eve's Lily EPK Admin Studio
 *
 * Security layers:
 * 1. Locked target repository (achadE7/eveslily-epk) verified directly against GitHub REST API
 *    requiring authenticated push/admin permission before unlocking any editor UI.
 * 2. Client-side AES-256-GCM + PBKDF2-SHA256 (310,000 iterations, random 128-bit salt,
 *    random 96-bit IV, authenticated AAD) encrypted vault via native Web Crypto API.
 * 3. Automatic purge of legacy plaintext token key (eveslily_epk_gh_config_v1).
 * 4. Brute-force protection: cooldown after 3 failed passphrase tries and automatic
 *    vault self-destruct after 5 consecutive failed passphrase attempts.
 * 5. RAM-only decrypted token session (never persisted in plaintext, never rendered in DOM)
 *    with 15-minute idle auto-lock and 1-click lock/logout.
 */

import { GITHUB_CONFIG_KEY } from './data-store.js';

export const LOCKED_REPO = Object.freeze({
  owner: 'achadE7',
  repo: 'eveslily-epk',
  defaultBranch: 'main'
});

export const VAULT_STORAGE_KEY = 'eveslily_epk_vault_v2';
const ATTEMPTS_STORAGE_KEY = 'eveslily_epk_vault_attempts_v2';
const VAULT_AAD = 'eveslily-epk-vault-v2:achadE7/eveslily-epk';
const PBKDF2_ITERATIONS = 310000;
const MAX_FAILED_ATTEMPTS = 5;
const COOLDOWN_THRESHOLD = 3;
const COOLDOWN_MS = 15000;
export const IDLE_LOCK_MS = 15 * 60 * 1000;

// Private in-memory session (never attached to window, never written to storage)
let activeSession = null;

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return window.btoa(bin);
}

function base64ToBytes(b64) {
  const bin = window.atob(String(b64 || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export function isWebCryptoAvailable() {
  return Boolean(window.crypto && window.crypto.subtle && window.crypto.getRandomValues);
}

/**
 * Purges any legacy plaintext token stored in localStorage by older versions.
 * Returns true if a legacy plaintext token was found and purged.
 */
export function purgeLegacyPlaintextConfig() {
  try {
    const raw = window.localStorage.getItem(GITHUB_CONFIG_KEY);
    if (!raw) return false;
    let hadToken = false;
    try {
      const parsed = JSON.parse(raw);
      hadToken = Boolean(parsed && parsed.token && String(parsed.token).trim());
    } catch {
      hadToken = true;
    }
    window.localStorage.removeItem(GITHUB_CONFIG_KEY);
    return hadToken;
  } catch {
    return false;
  }
}

export function getStoredVaultMeta() {
  try {
    const raw = window.localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 2 || !parsed.salt || !parsed.iv || !parsed.ct) return null;
    if (
      String(parsed.owner || '').toLowerCase() !== LOCKED_REPO.owner.toLowerCase() ||
      String(parsed.repo || '').toLowerCase() !== LOCKED_REPO.repo.toLowerCase()
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function hasEncryptedVault() {
  return Boolean(getStoredVaultMeta());
}

export function clearEncryptedVault() {
  try {
    window.localStorage.removeItem(VAULT_STORAGE_KEY);
    window.localStorage.removeItem(ATTEMPTS_STORAGE_KEY);
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

function getAttemptState() {
  try {
    const raw = window.localStorage.getItem(ATTEMPTS_STORAGE_KEY);
    if (!raw) return { count: 0, cooldownUntil: 0 };
    const parsed = JSON.parse(raw);
    return {
      count: Number(parsed.count) || 0,
      cooldownUntil: Number(parsed.cooldownUntil) || 0
    };
  } catch {
    return { count: 0, cooldownUntil: 0 };
  }
}

function setAttemptState(state) {
  try {
    window.localStorage.setItem(ATTEMPTS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore
  }
}

export function resetAttemptState() {
  try {
    window.localStorage.removeItem(ATTEMPTS_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function getUnlockCooldownRemainingMs() {
  const state = getAttemptState();
  return Math.max(0, state.cooldownUntil - Date.now());
}

export function getFailedAttemptCount() {
  return getAttemptState().count;
}

export function getMaxFailedAttempts() {
  return MAX_FAILED_ATTEMPTS;
}

async function deriveAesKey(passphrase, saltBytes, iterations = PBKDF2_ITERATIONS) {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts the GitHub PAT using AES-256-GCM + PBKDF2-SHA256 and saves the ciphertext vault.
 */
export async function saveEncryptedVault(token, passphrase, branch = LOCKED_REPO.defaultBranch) {
  if (!isWebCryptoAvailable()) {
    throw new Error('Browser tidak mendukung Web Crypto (butuh koneksi HTTPS atau localhost).');
  }
  const cleanPass = String(passphrase || '');
  if (cleanPass.length < 8) {
    throw new Error('Passphrase lokal wajib minimal 8 karakter.');
  }

  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(cleanPass, salt, PBKDF2_ITERATIONS);
  const enc = new TextEncoder();
  const payload = JSON.stringify({
    token: String(token).trim(),
    branch: String(branch || LOCKED_REPO.defaultBranch).trim() || LOCKED_REPO.defaultBranch
  });

  const cipherBuf = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: enc.encode(VAULT_AAD)
    },
    key,
    enc.encode(payload)
  );

  const vaultRecord = {
    v: 2,
    kdf: 'PBKDF2-SHA256',
    iter: PBKDF2_ITERATIONS,
    alg: 'AES-256-GCM',
    owner: LOCKED_REPO.owner,
    repo: LOCKED_REPO.repo,
    branch: String(branch || LOCKED_REPO.defaultBranch).trim() || LOCKED_REPO.defaultBranch,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(cipherBuf)),
    createdAt: new Date().toISOString()
  };

  window.localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vaultRecord));
  resetAttemptState();
  return vaultRecord;
}

/**
 * Decrypts the local AES-256-GCM vault with brute-force cooldown and 5-strike auto-wipe.
 */
export async function decryptStoredVault(passphrase) {
  if (!isWebCryptoAvailable()) {
    throw new Error('Web Crypto tidak tersedia di konteks browser ini.');
  }
  const cooldownMs = getUnlockCooldownRemainingMs();
  if (cooldownMs > 0) {
    const secs = Math.ceil(cooldownMs / 1000);
    throw new Error(`Terlalu banyak percobaan salah. Tunggu ${secs} detik sebelum mencoba lagi.`);
  }

  const vault = getStoredVaultMeta();
  if (!vault) {
    throw new Error('Vault terenkripsi tidak ditemukan di browser ini.');
  }

  try {
    const salt = base64ToBytes(vault.salt);
    const iv = base64ToBytes(vault.iv);
    const ct = base64ToBytes(vault.ct);
    const iterations = Number(vault.iter) || PBKDF2_ITERATIONS;
    const key = await deriveAesKey(String(passphrase || ''), salt, iterations);
    const enc = new TextEncoder();
    const plainBuf = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: enc.encode(VAULT_AAD)
      },
      key,
      ct
    );
    const parsed = JSON.parse(new TextDecoder().decode(plainBuf));
    if (!parsed || !parsed.token) {
      throw new Error('Isi vault rusak.');
    }
    resetAttemptState();
    return {
      token: String(parsed.token).trim(),
      branch: String(parsed.branch || vault.branch || LOCKED_REPO.defaultBranch).trim()
    };
  } catch {
    const state = getAttemptState();
    const nextCount = state.count + 1;
    if (nextCount >= MAX_FAILED_ATTEMPTS) {
      clearEncryptedVault();
      const err = new Error(
        `Passphrase salah ${MAX_FAILED_ATTEMPTS} kali berturut-turut. Vault terenkripsi otomatis dihapus demi keamanan. Masuk ulang menggunakan Fine-Grained Token GitHub.`
      );
      err.vaultWiped = true;
      throw err;
    }
    const nextCooldown = nextCount >= COOLDOWN_THRESHOLD ? Date.now() + COOLDOWN_MS : 0;
    setAttemptState({ count: nextCount, cooldownUntil: nextCooldown });
    const remaining = MAX_FAILED_ATTEMPTS - nextCount;
    const cooldownNote = nextCooldown ? ` Tunggu ${COOLDOWN_MS / 1000} detik.` : '';
    throw new Error(`Passphrase lokal salah. Sisa percobaan sebelum vault terhapus otomatis: ${remaining}.${cooldownNote}`);
  }
}

/**
 * Verifies a GitHub PAT live against GitHub's servers specifically for LOCKED_REPO
 * and confirms write/push authorization plus branch accessibility.
 */
export async function verifyGitHubAccess(token, branch = LOCKED_REPO.defaultBranch) {
  const cleanToken = String(token || '').trim();
  const cleanBranch = String(branch || LOCKED_REPO.defaultBranch).trim() || LOCKED_REPO.defaultBranch;

  if (!cleanToken || cleanToken.length < 20 || /\s/.test(cleanToken)) {
    throw new Error('Format token GitHub tidak valid. Masukkan Fine-Grained Personal Access Token yang lengkap.');
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${cleanToken}`,
    'X-GitHub-Api-Version': '2022-11-28'
  };

  const repoUrl = `https://api.github.com/repos/${encodeURIComponent(LOCKED_REPO.owner)}/${encodeURIComponent(LOCKED_REPO.repo)}`;
  let repoRes;
  try {
    repoRes = await fetch(repoUrl, { method: 'GET', headers, cache: 'no-store' });
  } catch {
    throw new Error('Tidak dapat menghubungi server GitHub API. Periksa koneksi internet kamu.');
  }

  const repoBody = await repoRes.json().catch(() => ({}));
  if (repoRes.status === 401) {
    throw new Error('Token GitHub ditolak server (401 Unauthorized). Periksa kembali token atau buat token baru.');
  }
  if (repoRes.status === 403) {
    throw new Error('Akses ditolak server GitHub (403 Forbidden). Pastikan token aktif dan memiliki izin pada repo achadE7/eveslily-epk.');
  }
  if (repoRes.status === 404) {
    throw new Error('Repository achadE7/eveslily-epk tidak dapat diakses oleh token ini.');
  }
  if (!repoRes.ok) {
    throw new Error(repoBody.message || `Gagal verifikasi GitHub (HTTP ${repoRes.status}).`);
  }

  const fullName = String(repoBody.full_name || '').toLowerCase();
  const expectedName = `${LOCKED_REPO.owner}/${LOCKED_REPO.repo}`.toLowerCase();
  if (fullName !== expectedName) {
    throw new Error('Repository yang dikembalikan GitHub tidak cocok dengan target terkunci.');
  }

  // Server-enforced authorization check: public repos return push: false for non-owners/strangers
  const perms = repoBody.permissions || {};
  if (!perms.push && !perms.admin) {
    throw new Error(
      `Akses ditolak: token GitHub ini tidak memiliki hak tulis (push) pada ${LOCKED_REPO.owner}/${LOCKED_REPO.repo}.`
    );
  }

  // Confirm branch exists and Contents metadata is accessible with this token
  const branchUrl = `${repoUrl}/branches/${encodeURIComponent(cleanBranch)}`;
  const branchRes = await fetch(branchUrl, { method: 'GET', headers, cache: 'no-store' });
  if (!branchRes.ok) {
    if (branchRes.status === 404) {
      throw new Error(`Branch "${cleanBranch}" tidak ditemukan di ${LOCKED_REPO.owner}/${LOCKED_REPO.repo}.`);
    }
    if (branchRes.status === 403) {
      throw new Error('Token tidak memiliki izin Contents (Read and write) pada repository ini.');
    }
    throw new Error(`Gagal memeriksa branch "${cleanBranch}" (HTTP ${branchRes.status}).`);
  }

  return {
    owner: LOCKED_REPO.owner,
    repo: LOCKED_REPO.repo,
    branch: cleanBranch,
    fullName: repoBody.full_name,
    defaultBranch: repoBody.default_branch || cleanBranch,
    permissions: {
      admin: Boolean(perms.admin),
      push: Boolean(perms.push)
    }
  };
}

export function setActiveSession({ token, branch, mode, verifiedAt, repoFullName }) {
  activeSession = Object.freeze({
    owner: LOCKED_REPO.owner,
    repo: LOCKED_REPO.repo,
    branch: String(branch || LOCKED_REPO.defaultBranch).trim() || LOCKED_REPO.defaultBranch,
    token: String(token).trim(),
    mode: mode === 'vault' ? 'vault' : 'ephemeral',
    verifiedAt: verifiedAt || new Date().toISOString(),
    repoFullName: repoFullName || `${LOCKED_REPO.owner}/${LOCKED_REPO.repo}`
  });
}

export function isSessionUnlocked() {
  return Boolean(activeSession && activeSession.token);
}

/**
 * Returns non-sensitive session metadata for UI display (NEVER returns the raw token).
 */
export function getSessionPublicInfo() {
  if (!activeSession) return null;
  return {
    owner: activeSession.owner,
    repo: activeSession.repo,
    branch: activeSession.branch,
    mode: activeSession.mode,
    verifiedAt: activeSession.verifiedAt,
    repoFullName: activeSession.repoFullName
  };
}

/**
 * Clears decrypted token from RAM immediately.
 */
export function lockSessionInMemory() {
  activeSession = null;
}

/**
 * Executes an authenticated GitHub REST API request scoped strictly to LOCKED_REPO.
 */
export async function authenticatedRepoFetch(relativePath, options = {}) {
  if (!activeSession || !activeSession.token) {
    throw new Error('Sesi terkunci. Silakan buka kunci terlebih dahulu.');
  }

  const normalized = String(relativePath || '');
  if (normalized && !normalized.startsWith('/')) {
    throw new Error('Path GitHub API tidak valid.');
  }

  const base = `https://api.github.com/repos/${encodeURIComponent(LOCKED_REPO.owner)}/${encodeURIComponent(LOCKED_REPO.repo)}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${activeSession.token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    ...(options.headers || {})
  };

  const res = await fetch(`${base}${normalized}`, {
    ...options,
    headers,
    cache: 'no-store'
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      lockSessionInMemory();
      const err = new Error('Token GitHub sudah tidak aktif atau dicabut (401). Sesi dikunci kembali.');
      err.authRevoked = true;
      throw err;
    }
    throw new Error(body.message || `GitHub API error (HTTP ${res.status})`);
  }
  return body;
}
