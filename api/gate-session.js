'use strict';
const {send} = require('../lib/payment-shared');
const redis = require('../lib/redis');
const auth = require('../lib/gate-auth');
const tickets = require('../lib/tickets');
module.exports = async (req,res) => {
  if(!['GET','POST'].includes(req.method)) { res.setHeader('Allow','GET, POST'); return send(res,405,{error:'Método não permitido.'}); }
  if(!auth.ready() || !tickets.ready()) return send(res,503,{error:'Portaria ainda não configurada. A organização precisa ativar o serviço de ingressos.'});
  try {
    if(req.method==='GET') { if(await redis.command(['PING'])!=='PONG')throw new Error('Storage unavailable'); const session=await auth.session(req); return send(res,session?200:401,session?{station:session.station}:{error:'Entre para acessar a portaria.'}); }
    if(!auth.requestAllowed(req)) return send(res,403,{error:'Solicitação não permitida.'});
    if(req.body?.action==='logout') { res.setHeader('Set-Cookie',await auth.logout(req));return send(res,200,{ok:true}); }
    const address=String(req.headers?.['x-vercel-forwarded-for']||req.headers?.['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
    const quota=await redis.limit('gate-login:'+auth.hash(address),10);
    if(!quota.allowed) return send(res,429,{error:'Muitas tentativas. Aguarde um minuto.'});
    if(!auth.samePassword(req.body?.password)) return send(res,401,{error:'Senha incorreta.'});
    const station=typeof req.body?.station==='string'?req.body.station.trim():'';
    if(!station || station.length>40 || /[\x00-\x1f]/.test(station)) return send(res,422,{error:'Informe o nome do porteiro (até 40 caracteres).'});
    res.setHeader('Set-Cookie',await auth.login(station));return send(res,200,{station});
  } catch {return send(res,503,{error:'Portaria indisponível. Tente novamente.'});}
};
