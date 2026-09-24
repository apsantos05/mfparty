'use strict';
const {send} = require('../lib/payment-shared');
const redis = require('../lib/redis');
const auth = require('../lib/gate-auth');
const tickets = require('../lib/tickets');
module.exports = async (req,res) => {
  if(req.method!=='POST') {res.setHeader('Allow','POST');return send(res,405,{error:'Método não permitido.'});}
  if(!auth.ready()||!tickets.ready())return send(res,503,{error:'Portaria indisponível. Não autorize a entrada.'});
  if(!auth.requestAllowed(req))return send(res,403,{error:'Solicitação não permitida.'});
  try {
    const session=await auth.session(req);
    if(!session)return send(res,401,{error:'Sua sessão terminou. Entre novamente.'});
    if(!tickets.validCode(req.body?.code)||!['preview','admit'].includes(req.body?.action))return send(res,422,{error:'Código de ingresso inválido.'});
    const quota=await redis.limit('gate:'+auth.hash(String(req.headers.cookie)),90);
    if(!quota.allowed)return send(res,429,{error:'Aguarde um minuto antes de continuar.'});
    const result=await tickets.check(req.body.code,req.body.action==='admit',session);
    const {status,...body}=result;return send(res,status,body);
  } catch {return send(res,503,{error:'Não foi possível confirmar. Não autorize a entrada sem confirmação. Consulte o mesmo código novamente.'});}
};
