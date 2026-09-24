'use strict';
const crypto = require('node:crypto');
const redis = require('./redis');
const {key} = require('./tickets');
const COOKIE = '__Host-mf_gate';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function ready() { return redis.configured() && (process.env.GATE_PASSWORD || '').length >= 16; }
function fingerprint() { return hash(process.env.GATE_PASSWORD || ''); }
function samePassword(input) { return typeof input === 'string' && input.length <= 256 && crypto.timingSafeEqual(Buffer.from(hash(input)), Buffer.from(fingerprint())); }
function requestAllowed(req) { return String(req.headers?.['content-type'] || '').split(';')[0].trim() === 'application/json' && req.headers?.['x-mfparty'] === 'portaria' && !['cross-site','same-site'].includes(req.headers?.['sec-fetch-site']); }
function cookieValue(req) { const part = String(req.headers?.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '=')); const value = part?.slice(COOKIE.length + 1); return /^[a-f0-9]{64}$/.test(value || '') ? value : null; }
function cookie(value, age) { return `${COOKIE}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Strict`; }
async function session(req) {
  if (!ready()) return null;
  const value = cookieValue(req); if (!value) return null;
  const result = await redis.get(key('session', hash(value)));
  return result && result.expires > Date.now() && result.passwordVersion === fingerprint() ? result : null;
}
async function login(station) {
  const value = crypto.randomBytes(32).toString('hex');
  await redis.set(key('session', hash(value)), {station, expires:Date.now() + 8 * 3600000, passwordVersion:fingerprint()}, 8 * 3600);
  return cookie(value, 8 * 3600);
}
async function logout(req) { const value=cookieValue(req); if(value) await redis.command(['DEL',key('session',hash(value))]); return cookie('',0); }
module.exports = {ready, hash, samePassword, requestAllowed, session, login, logout};
