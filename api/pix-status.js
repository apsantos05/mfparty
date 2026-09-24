'use strict';
const {send,verify,lookup,TICKETS,matching}=require('../lib/payment-shared');
const redis=require('../lib/redis');
module.exports=async function handler(req,res){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return send(res,405,{error:'Método não permitido.'});}
 if(!process.env.BRAVOPAY_API_KEY)return send(res,503,{error:'Consulta temporariamente indisponível.'});
 const order=verify(req.body?.token);if(!order)return send(res,403,{error:'Referência inválida ou expirada.'});
 try{
  let tx=null;
  // Evento autenticamente assinado preserva estado PAID para leitura leve de muitos clientes.
  if(redis.configured()){
   const event=await redis.get(`hp10:paid:${order.id}`);
   if(event&&matching(order,event)&&event.status==='PAID')tx=event;
   if(!tx){const cache=await redis.get(`hp10:status:${order.id}`);if(cache&&matching(order,cache))tx=cache;}
  }
  if(!tx){
   const quota=await redis.limit('status',25);
   if(!quota.allowed)return send(res,429,{error:'Estamos confirmando os pagamentos. Aguarde alguns instantes.',retry_after:quota.retryAfter},{'Retry-After':String(quota.retryAfter)});
   tx=await lookup(order);
   if(tx&&redis.configured())await redis.set(`hp10:status:${order.id}`,{id:tx.id,external_reference:tx.external_reference,amount_cents:tx.amount_cents,method:tx.method,currency:tx.currency,metadata:{ticket:tx.metadata.ticket,quantity:tx.metadata.quantity},status:tx.status,paid_at:tx.paid_at||null},120);
  }
  if(!tx)return send(res,409,{error:'Ainda não foi possível identificar a cobrança. Tente novamente ou fale com a organização.'});
  const status=String(tx.status||'').toUpperCase();const paid=status==='PAID';
  return send(res,200,{status,paid,poll_after:redis.configured()?30:180,paid_at:paid?tx.paid_at||null:null,...(paid?{order:{name:order.name,ticket:TICKETS[order.ticket].label,quantity:order.quantity*TICKETS[order.ticket].admissions,amount_cents:order.amount,reference:order.ref,event:'Halloween da Mari Ferro',date:'31/10/2026'}}:{})});
 }catch(error){
  if(error?.rateLimited){const retry=error.retryAfter||60;return send(res,429,{error:'Estamos confirmando os pagamentos. Aguarde alguns instantes.',retry_after:retry},{'Retry-After':String(retry)});}
  return send(res,502,{error:'Não foi possível consultar agora. Tente novamente.'});
 }
};
