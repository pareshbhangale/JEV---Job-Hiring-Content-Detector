/**
 * Hiring Content Detector - Encryption Utility
 * AES-256-GCM via Web Crypto API (Chromium native).
 * Derives a 256-bit key from a static passphrase + salt, then encrypts/decrypts strings.
 */

(() => {
  'use strict';

  const PASSPHRASE = 'hc-encrypt-v1';      // Application-level passphrase
  const SALT_HEX   = 'a7f3c8e91b2d4065';    // Fixed per-installation salt
  const KEY_ITER   = 100_000;                // PBKDF2 iterations

  /** Decode hex string to Uint8Array */
  function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  /** Encode ArrayBuffer/Uint8Array to lowercase hex */
  function bytesToHex(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /** Combine salt + password bytes for PBKDF2 */
  function getSalt() { return hexToBytes(SALT_HEX); }

  /** Derive AES-256 key from passphrase via PBKDF2-SHA256 */
  async function deriveKey() {
    if (deriveKey._promise) return deriveKey._promise;
    deriveKey._promise = (async () => {
      const enc = new TextEncoder();
      const pwkb = await crypto.subtle.importKey(
        'raw', enc.encode(PASSPHRASE), 'PBKDF2', false, ['deriveBits']
      );
      return crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: getSalt(), iterations: KEY_ITER, hash: 'SHA-256' },
        pwkb,
        256         // 256-bit key → AES-256
      );
    })();
    return deriveKey._promise;
  }

  /** Encrypt plaintext string → base64 JSON { iv, ciphertext } */
  async function encrypt(plaintext) {
    if (!plaintext) return '';
    const keyBytes = await deriveKey();
    const key = await crypto.subtle.importKey(
      'raw', keyBytes, 'AES-GCM', false, ['encrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));       // 96-bit nonce
    const data = new TextEncoder().encode(JSON.stringify(plaintext));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, key, data
    );
    return btoa(JSON.stringify({
      v: 1,                          // version header
      iv: bytesToHex(iv),
      ct: bytesToHex(encrypted)
    }));
  }

  /** Decrypt base64 JSON → original string */
  async function decrypt(data) {
    if (!data) return null;
    try {
      const parsed = JSON.parse(atob(data));
      if (parsed.v !== 1) throw new Error('Unsupported format version');

      const keyBytes = await deriveKey();
      const key = await crypto.subtle.importKey(
        'raw', keyBytes, 'AES-GCM', false, ['decrypt']
      );
      const iv  = hexToBytes(parsed.iv);
      const ct  = hexToBytes(parsed.ct);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv }, key, ct
      );
      return JSON.parse(new TextDecoder().decode(decrypted));
    } catch (err) {
      console.warn('[enc] Decrypt failed:', err.message);
      return null;
    }
  }

  (typeof window !== 'undefined' ? window : self).HCEncrypt = { encrypt, decrypt };

})();
