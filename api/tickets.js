'use strict';
const {send, verify} = require('../lib/payment-shared');
const redis = require('../lib/redis');
const tickets = require('../lib/tickets');
const QRCode = require('qrcode');
module.exports = async (req,res) => {
  if(req.method !== 'POST') { res.setHeader('Allow','POST'); return send(res,405,{error:'Método não permitido.'}); }
  if(!tickets.ready()) return send(res,503,{error:'Emissão de ingressos temporariamente indisponível. Guarde a referência da compra e tente novamente.'});
  const order=verify(req.body?.token);
  if(!order) return send(res,403,{error:'Referência inválida ou expirada. Entre em contato com a organização.'});
  try {
    const quota=await redis.limit('issue:'+order.id,8);
    if(!quota.allowed) return send(res,429,{error:'Aguarde um minuto antes de tentar novamente.'});
    const result=await tickets.issue(order);
    if(result.status!==200) return send(res,result.status,{error:result.error});
    const items=await Promise.all(result.tickets.map(async ticket=>({...ticket,qr:await QRCode.toDataURL(ticket.code,{width:360,margin:4,errorCorrectionLevel:'M'})})));
    return send(res,200,{tickets:items});
  } catch { return send(res,503,{error:'Não foi possível emitir agora. Seu pagamento não foi cancelado. Tente novamente.'}); }
};
