/**
 * OpenClaw Gateway WebSocket Client
 *
 * Connects to a live OpenClaw gateway via its native WS protocol.
 * Handles device identity, challenge-response auth, and streaming chat.
 *
 * Works on HTTP (non-secure) origins by using @noble/ed25519 instead of crypto.subtle.
 */

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

// Wire up SHA-512 for @noble/ed25519 — works everywhere, no crypto.subtle needed
ed.hashes.sha512Async = async (msg) => sha512(msg);
ed.hashes.sha512 = (msg) => sha512(msg);

export class OpenClawClient {
  constructor({ url, token, onChat, onEvent, onConnect, onDisconnect, onError }) {
    this.url = url;
    this.token = token;
    this.onChat = onChat || (() => {});
    this.onEvent = onEvent || (() => {});
    this.onConnect = onConnect || (() => {});
    this.onDisconnect = onDisconnect || (() => {});
    this.onError = onError || (() => {});
    this.ws = null;
    this.connected = false;
    this.pending = new Map();
    this._id = 0;
    this._device = null;
    this._hello = null;
  }

  async connect() {
    this._device = await this._generateDevice();

    return new Promise((resolve, reject) => {
      const wsUrl = this.url.replace(/^http/, 'ws');
      this.ws = new WebSocket(wsUrl);

      this.ws.onclose = (e) => {
        this.connected = false;
        this.onDisconnect({ code: e.code, reason: e.reason });
      };
      this.ws.onerror = () => reject(new Error('WebSocket connection failed'));
      this.ws.onmessage = async (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }

        if (msg.type === 'event' && msg.event === 'connect.challenge') {
          try { await this._sendConnect(msg.payload.nonce); }
          catch (err) { reject(err); }
          return;
        }

        if (msg.type === 'res') {
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            if (msg.ok) p.resolve(msg.payload);
            else p.reject(new Error(msg.error?.message || 'request failed'));
          }
          if (msg.ok && !this.connected) {
            this.connected = true;
            this._hello = msg.payload;
            this.onConnect(msg.payload);
            resolve(msg.payload);
          } else if (!msg.ok && !this.connected) {
            reject(new Error(msg.error?.message || 'connect failed'));
          }
          return;
        }

        if (msg.type === 'event') {
          if (msg.event === 'chat') this.onChat(msg.payload);
          this.onEvent(msg.event, msg.payload);
        }
      };
    });
  }

  disconnect() {
    if (this.ws) { this.ws.close(); this.ws = null; }
    this.connected = false;
  }

  request(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
      return Promise.reject(new Error('not connected'));
    const id = String(++this._id);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ type: 'req', id, method, params }));
    });
  }

  chat(message, opts = {}) {
    return this.request('chat.send', {
      sessionKey: opts.sessionKey || 'main',
      message,
      deliver: opts.deliver ?? false,
      idempotencyKey: opts.idempotencyKey || _uuid(),
    });
  }

  abort() { return this.request('chat.abort', {}); }
  status() { return this.request('status', {}); }
  health() { return this.request('health', {}); }
  agents() { return this.request('agents.list', {}); }
  sessions() { return this.request('sessions.list', {}); }
  models() { return this.request('models.list', {}); }

  // ── Internal ─────────────────────────────────────────

  async _sendConnect(nonce) {
    const dev = this._device;
    const scopes = ['operator.admin', 'operator.approvals', 'operator.pairing'];
    const signedAt = Date.now();

    const sigPayload = [
      'v2', dev.deviceId, 'openclaw-control-ui', 'webchat', 'operator',
      scopes.join(','), String(signedAt), this.token || '', nonce,
    ].join('|');

    const sigBytes = await ed.signAsync(
      new TextEncoder().encode(sigPayload),
      dev.privateKey,
    );

    return this.request('connect', {
      minProtocol: 3, maxProtocol: 3,
      client: { id: 'openclaw-control-ui', version: 'dev', platform: navigator?.platform || 'web', mode: 'webchat' },
      role: 'operator', scopes,
      device: { id: dev.deviceId, publicKey: _b64url(dev.publicKey), signature: _b64url(sigBytes), signedAt, nonce },
      caps: [],
      auth: this.token ? { token: this.token } : {},
      userAgent: navigator?.userAgent || 'almostnode',
      locale: navigator?.language || 'en',
    });
  }

  async _generateDevice() {
    const privateKey = ed.utils.randomSecretKey();
    const publicKey = await ed.getPublicKeyAsync(privateKey);
    const deviceId = _sha256hex(publicKey);
    return { deviceId, publicKey, privateKey };
  }
}

// ── Helpers ──────────────────────────────────────────

function _b64url(buf) {
  let s = '';
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Pure JS SHA-256 for device ID — no crypto.subtle needed
function _sha256hex(data) {
  const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  const rr = (v, n) => (v >>> n) | (v << (32 - n));
  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
  const len = bytes.length;
  const padded = new Uint8Array(((len + 9 + 63) & ~63));
  padded.set(bytes);
  padded[len] = 0x80;
  new DataView(padded.buffer).setUint32(padded.length - 4, len * 8, false);
  const W = new Int32Array(64);
  const view = new DataView(padded.buffer);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getInt32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rr(W[i-15],7) ^ rr(W[i-15],18) ^ (W[i-15]>>>3);
      const s1 = rr(W[i-2],17) ^ rr(W[i-2],19) ^ (W[i-2]>>>10);
      W[i] = (W[i-16] + s0 + W[i-7] + s1) | 0;
    }
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rr(e,6) ^ rr(e,11) ^ rr(e,25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
      const S0 = rr(a,2) ^ rr(a,13) ^ rr(a,22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    h0=(h0+a)|0; h1=(h1+b)|0; h2=(h2+c)|0; h3=(h3+d)|0;
    h4=(h4+e)|0; h5=(h5+f)|0; h6=(h6+g)|0; h7=(h7+h)|0;
  }
  return [h0,h1,h2,h3,h4,h5,h6,h7].map(v => (v>>>0).toString(16).padStart(8,'0')).join('');
}
