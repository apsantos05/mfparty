'use strict';
const crypto=require('node:crypto');
const redis=require('../lib/redis');
function send(res,status,body){res.setHeader('Cache-Control','no-store');return res.status(status).json(body);}
function signatureOk(raw,header,secret){
 if(typeof header!=='string')return false;
 const fields=Object.fromEntries(header.split(',').map(s=>s.trim().split('=')));
 const ts=Number(fields.t);
 if(!Number.isSafeInteger(ts)||Math.abs(Math.floor(Date.now()/1000)-ts)>300||!/^[a-f0-9]{64}$/i.test(fields.v1||''))return false;
 const expected=crypto.createHmac('sha256',secret).update(`${ts}.${raw.toString('utf8')}`).digest();
 return crypto.timingSafeEqual(expected,Buffer.from(fields.v1,'hex'));
}
async function readRaw(req){
 if(req.rawBody)return Buffer.isBuffer(req.rawBody)?req.rawBody:Buffer.from(req.rawBody);
 const chunks=[];let size=0;
 for await(const part of req){const piece=Buffer.from(part);size+=piece.length;if(size>100000)throw Error('too large');chunks.push(piece);}
 const raw=Buffer.concat(chunks);if(!raw.length)throw Error('missing raw body');return raw;
}
module.exports=async function handler(req,res){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return send(res,405,{error:'Método não permitido.'});}
 const secret=process.env.BRAVOPAY_WEBHOOK_SECRET;if(!secret)return send(res,503,{error:'Webhook não configurado.'});
 let raw;try{raw=await readRaw(req);}catch{return send(res,503,{error:'Corpo original indisponível para validação.'});}
 if(!signatureOk(raw,req.headers['bravopay-signature']||req.headers['x-bravopay-signature'],secret))return send(res,401,{error:'Assinatura inválida.'});
 let event;try{event=JSON.parse(raw.toString('utf8'));}catch{return send(res,400,{error:'JSON inválido.'});}
 if(!/^evt_[a-zA-Z0-9_-]+$/.test(event.id||'')||typeof event.type!=='string')return send(res,422,{error:'Evento inválido.'});
 const tx=event.data||{};
 if(event.type.startsWith('transaction.')&&/^tx_[a-zA-Z0-9_-]+$/.test(tx.id||'')&&/^hp10_(mulher|homem|combo|jovem)_[a-f0-9]{32}$/.test(tx.external_reference||'')){
  const types={'transaction.paid':'PAID','transaction.expired':'EXPIRED','transaction.failed':'FAILED','transaction.refunded':'REFUNDED','transaction.chargeback':'CHARGEBACK'};
  const status=types[event.type];
  if(status){
   if(!redis.configured()){
    // Sem armazenamento compartilhado, apenas confirmar recebimento; o checkout consulta o provedor.
    return send(res,200,{received:true});
   }
   try{
    const key=`hp10:event-state:${tx.id}`;
    const previous=await redis.get(key);
    const priority={'transaction.refunded':5,'transaction.chargeback':5,'transaction.paid':4,'transaction.expired':3,'transaction.failed':3};
    if(!previous || Number(event.created||0)>Number(previous.created||0) || (Number(event.created||0)===Number(previous.created||0) && (priority[event.type]||0)>=(priority[previous.type]||0))){
     const snapshot={id:tx.id,external_reference:tx.external_reference,amount_cents:tx.amount_cents,method:tx.method,currency:tx.currency,metadata:tx.metadata,status,paid_at:tx.paid_at||null};
     await redis.set(key,{created:Number(event.created||0),type:event.type},8*86400);
     // PAID só é aceito se recebido com assinatura real do provedor e todos os atributos combinarem com a ordem assinada.
     if(status==='PAID')await redis.set(`hp10:paid:${tx.id}`,snapshot,8*86400);
     else await redis.command(['DEL',`hp10:paid:${tx.id}`]);
     await redis.set(`hp10:status:${tx.id}`,snapshot,8*86400);
    }
   }catch{
    // Falha transitória: 503 para a BravoPay reenviar a notificação.
    return send(res,503,{error:'Falha temporária ao processar notificação.'});
   }
  }
 }
 return send(res,200,{received:true});
};
// Não tocar em req.body antes de ler o stream; requer corpo bruto, sem reserializar.
module.exports.config={api:{bodyParser:false}};
