'use strict';
const crypto = require('node:crypto');
const redis = require('./redis');
const {lookup, TICKETS} = require('./payment-shared');
const EVENT = 'mfparty-halloween-2026';
const PREFIX = 'mf:{halloween2026}:';
const key = (type, id) => `${PREFIX}${type}:${id}`;
function expiry() { return Date.parse(process.env.TICKET_VALID_UNTIL || '2026-11-02T12:00:00-03:00'); }
function signingSecret() {
  if(process.env.TICKET_SIGNING_SECRET)return process.env.TICKET_SIGNING_SECRET;
  const base=process.env.ORDER_SIGNING_SECRET||'';
  return base.length>=32?crypto.createHmac('sha256',base).update('mfparty-ticket-key-v1').digest('hex'):'';
}
function ready() { return redis.configured() && signingSecret().length >= 32 && Boolean(process.env.BRAVOPAY_API_KEY) && Number.isFinite(expiry()); }
function codeFor(order, index) {
  return 'MF1-' + crypto.createHmac('sha256', signingSecret()).update(`${EVENT}:${order.id}:${order.ref}:${index}`).digest('hex').slice(0, 48);
}
function validCode(code) { return typeof code === 'string' && /^MF1-[a-f0-9]{48}$/.test(code); }
function publicTicket(ticket) {
  return {code:ticket.code, event:'Halloween da Mari Ferro', date:'31/10/2026', buyer:ticket.order.name, category:TICKETS[ticket.order.ticket].label, index:ticket.index, total:ticket.total, expires:ticket.expires};
}
async function paidNow(order) {
  if (await redis.get(key('blocked', order.id))) return false;
  const tx = await lookup(order);
  return tx?.status?.toUpperCase() === 'PAID';
}
async function issue(order) {
  if (!ready()) throw new Error('Ticket service unavailable');
  if (Date.now() >= expiry()) return {status:410, error:'O prazo deste evento terminou.'};
  if (!await paidNow(order)) return {status:409, error:'Os ingressos só são liberados após a confirmação do pagamento.'};
  const total = order.quantity * TICKETS[order.ticket].admissions;
  const manifestKey=key('order',order.id);
  const candidates=Array.from({length:total},(_,i)=>codeFor(order,i+1));
  await redis.command(['SET',manifestKey,JSON.stringify(candidates),'NX','EXAT',Math.floor(expiry()/1000)+30*86400]);
  const codes=await redis.get(manifestKey);
  if(!Array.isArray(codes)||codes.length!==total||!codes.every(validCode))throw new Error('Invalid ticket manifest');
  const tickets = [];
  for (let index = 1; index <= total; index++) {
    const code = codes[index-1];
    const record = {event:EVENT, code, index, total, expires:expiry(), order:{id:order.id, ref:order.ref, name:order.name, ticket:order.ticket, quantity:order.quantity, amount:order.amount}};
    // Repetir a emissão nunca apaga uma entrada já registrada, nem cria novos códigos.
    await redis.command(['SET', key('ticket', code), JSON.stringify(record), 'NX', 'EXAT', Math.floor(record.expires / 1000) + 30 * 86400]);
    const saved = await redis.get(key('ticket', code));
    if (!saved) throw new Error('Ticket persistence failed');
    tickets.push(publicTicket(saved));
  }
  return {status:200, tickets};
}
// O teste e a gravação acontecem juntos no Redis, inclusive com duas portarias concorrentes.
const ADMIT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local ticket = cjson.decode(raw)
if ticket.expires <= tonumber(ARGV[1]) then return {'expired'} end
if redis.call('EXISTS', KEYS[3]) == 1 then return {'revoked'} end
local used = redis.call('GET', KEYS[2])
if used then return {'used', used} end
redis.call('SET', KEYS[2], ARGV[2], 'EXAT', ARGV[3])
return {'admitted', ARGV[2]}
`;
async function check(code, consume, session) {
  const record = await redis.get(key('ticket', code));
  if (!record || record.event !== EVENT) return {status:404, state:'invalid', error:'Ingresso não encontrado. Não autorize a entrada.'};
  const ticket = publicTicket(record);
  if (Date.now() >= record.expires) return {status:410, state:'expired', error:'Ingresso fora do prazo de validade.'};
  const used = await redis.get(key('used', code));
  if (used) return {status:409, state:'used', ticket, checkin:used, error:'Este ingresso já foi utilizado.'};
  if (!await paidNow(record.order)) return {status:409, state:'revoked', error:'Pagamento não aprovado ou ingresso cancelado. Não autorize a entrada.'};
  if (!consume) return {status:200, state:'valid', ticket};
  const checkin = {at:new Date().toISOString(), station:session.station};
  const result = await redis.command(['EVAL', ADMIT, 3, key('ticket', code), key('used', code), key('blocked', record.order.id), Date.now(), JSON.stringify(checkin), Math.floor(record.expires / 1000) + 30 * 86400]);
  if (result?.[0] === 'admitted') return {status:200, state:'admitted', ticket, checkin};
  if (result?.[0] === 'used') return {status:409, state:'used', ticket, checkin:JSON.parse(result[1]), error:'Este ingresso já foi utilizado.'};
  return {status:409, state:'invalid', error:'Ingresso indisponível ou cancelado. Não autorize a entrada.'};
}
module.exports = {EVENT, key, expiry, ready, validCode, issue, check};
