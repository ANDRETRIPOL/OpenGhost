(() => {
'use strict';

// A chat's password is never stored. Each protected chat keeps a random salt; the password, stretched through PBKDF2,
// becomes an AES-GCM key that seals the chat's messages and title on disk.
const ITERATIONS = 600000;
const encoder = new TextEncoder(), decoder = new TextDecoder();

function toBase64(bytes) {
 if (bytes.toBase64) return bytes.toBase64();
 let text = '';
 for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
 return btoa(text);
}

function fromBase64(text) {
 if (Uint8Array.fromBase64) return Uint8Array.fromBase64(text);
 return Uint8Array.from(atob(text), char => char.charCodeAt(0));
}

const salt = () => toBase64(crypto.getRandomValues(new Uint8Array(16)));

async function derive(password, saltText, iterations = ITERATIONS) {
 const base = await crypto.subtle.importKey('raw', encoder.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
 return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: fromBase64(saltText), iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function seal(key, value) {
 const iv = crypto.getRandomValues(new Uint8Array(12));
 const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(value)));
 return { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
}

// Throws unless the key is the one the value was sealed with: AES-GCM checks every byte.
async function open(key, sealed) {
 const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(sealed.iv) }, key, fromBase64(sealed.data));
 return JSON.parse(decoder.decode(data));
}

window.ChatLock = { ITERATIONS, salt, derive, seal, open };
})();
