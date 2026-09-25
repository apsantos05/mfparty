'use strict';
const crypto=require('node:crypto');
const QRCode=require('qrcode');
const {BASE,FEE,TICKETS,amount,send,sign,normalizeCoupon}=require('../lib/payment-shared');
const redis=require('../lib/redis');
const {expiry}=require('../lib/tickets');
function digits(v){return String(v||'').replace(/\D/g,'');}
function text(v,max=120){return String(v||'').trim().slice(0,max);}
function cpfValid(cpf){if(!/^\d{11}$/.test(cpf)||/^(\d)\1{10}$/.test(cpf))return false;let sum=0;for(let i=0;i<9;i++)sum+=Number(cpf[i])*(10-i);let d=(sum*10)%11;if(d===10)d=0;if(d!==Number(cpf[9]))return false;sum=0;for(let i=0;i<10;i++)sum+=Number(cpf[i])*(11-i);d=(sum*10)%11;if(d===10)d=0;return d===Number(cpf[10]);}
module.exports=async function handler(req,res){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return send(res,405,{error:'Método não permitido.'});}
 if(!process.env.BRAVOPAY_API_KEY||!process.env.ORDER_SIGNING_SECRET||process.env.ORDER_SIGNING_SECRET.length<32)return send(res,503,{error:'Pagamento temporariamente indisponível.'});
 const b=req.body||{};const ticket=String(b.ticket||'');const quantity=Number(b.quantity);const coupon=normalizeCoupon(b.coupon);
 if(coupon===null)return send(res,422,{error:'Cupom inválido. Confira o código ou remova o cupom.'});
 const expected=amount(ticket,quantity,coupon);
 if(ticket==='combo')return send(res,422,{error:'O Combo Amigo não está mais disponível. Escolha outro ingresso.'});
 if(expected===null)return send(res,422,{error:'Selecione um ingresso e uma quantidade válida (1 a 5).'});
 const name=text(b.customer?.name);const email=text(b.customer?.email,180).toLowerCase();const cpf=digits(b.customer?.cpf);const phone=digits(b.customer?.phone);
 if(name.length<3||!/^\S+@\S+\.\S+$/.test(email)||!cpfValid(cpf)||phone.length<10||phone.length>13)return send(res,422,{error:'Revise nome, e-mail, CPF e WhatsApp.'});
 const requestId=String(b.request_id||'');if(!/^[a-f0-9-]{36}$/i.test(requestId))return send(res,422,{error:'Atualize a página e tente novamente.'});
 // Referência estável por tentativa + conteúdo; retry do mesmo envio reutiliza a chave da adquirente.
 const fingerprint=JSON.stringify({requestId,ticket,quantity,amount_cents:expected,name,email,cpf,phone,...(coupon?{coupon}:{})});
 const digest=crypto.createHmac('sha256',process.env.ORDER_SIGNING_SECRET).update(fingerprint).digest('hex').slice(0,32);
 const ref=`hp10_${ticket}_${digest}`;
 const utm={};for(const key of ['source','medium','campaign','content','term','fbclid','ttclid','gclid'])utm[key]=text(b.utm?.[key],180);
 const discount=coupon?Math.round(TICKETS[ticket].cents*quantity*25/100):0;
 const payload={amount_cents:expected,method:'pix',customer:{name,email,cpf,phone},description:`Halloween da Mari Ferro - ${TICKETS[ticket].label} - ${quantity*TICKETS[ticket].admissions} ingresso(s) + taxa de serviço`,external_reference:ref,metadata:{event:'Halloween da Mari Ferro',ticket,coupon,discount_cents:String(discount),quantity:String(quantity),ticket_subtotal_cents:String(TICKETS[ticket].cents*quantity),service_fee_cents:String(FEE*quantity*TICKETS[ticket].admissions)},expires_in:1800,utm};
 const product=process.env[{mulher:'BRAVOPAY_PRODUCT_ID_MULHER',homem:'BRAVOPAY_PRODUCT_ID_HOMEM',combo:'BRAVOPAY_PRODUCT_ID_COMBO',jovem:'BRAVOPAY_PRODUCT_ID_JOVEM'}[ticket]];
 if(product)payload.product_id=product;
 try{
  const quota=await redis.limit('create',30);
  if(!quota.allowed)return send(res,429,{error:'Muitas compras simultâneas. Aguarde alguns instantes e tente novamente.',retry_after:quota.retryAfter},{'Retry-After':String(quota.retryAfter)});
  const upstream=await fetch(BASE,{method:'POST',headers:{Authorization:`Bearer ${process.env.BRAVOPAY_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':ref},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
  const data=await upstream.json().catch(()=>({}));
  if(upstream.status===429){const retry=Math.min(180,Math.max(5,Number(upstream.headers.get('Retry-After'))||60));return send(res,429,{error:'Pagamento temporariamente ocupado. Aguarde e tente novamente.',retry_after:retry},{'Retry-After':String(retry)});}
  if(!upstream.ok)return send(res,502,{error:'Não foi possível criar o PIX. Se já tentou, aguarde e repita sem atualizar os dados.'});
  // A API pode omitir campos opcionais na resposta da CRIACAO. Nao rejeite
  // um PIX valido por falta de method/currency/external_reference. Nunca
  // aceite um valor informado que difere do total calculado no servidor.
  const pix=typeof data?.pix?.copy_paste==='string'?data.pix.copy_paste.trim():'';
  const txId=String(data?.id||'');
  let rejectReason=null;
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(txId))rejectReason='invalid_transaction_id';
  else if(!pix||pix.length<16||pix.length>10000)rejectReason='missing_pix_code';
  else if(data.amount_cents!=null&&(!Number.isInteger(Number(data.amount_cents))||Number(data.amount_cents)!==expected))rejectReason='amount_mismatch';
  else if(data.method!=null&&String(data.method).toUpperCase()!=='PIX')rejectReason='wrong_method';
  else if(data.currency!=null&&String(data.currency).toUpperCase()!=='BRL')rejectReason='wrong_currency';
  else if(data.external_reference!=null&&data.external_reference!==ref)rejectReason='reference_mismatch';
  // Se o valor nao vier na criacao, consulte a propria cobranca ANTES de
  // exibir o PIX, e exija ID, referencia, valor, metodo e moeda corretos.
  if(!rejectReason&&data.amount_cents==null){
   try{
    const url=new URL(BASE);url.searchParams.set('external_reference',ref);url.searchParams.set('limit','5');
    const check=await fetch(url,{headers:{Authorization:`Bearer ${process.env.BRAVOPAY_API_KEY}`,Accept:'application/json'},signal:AbortSignal.timeout(12000)});
    if(!check.ok)rejectReason='amount_lookup_unavailable';
    else{
     const body=await check.json();
     const confirmed=Array.isArray(body?.data)&&body.data.some(tx=>tx?.id===txId&&tx.external_reference===ref&&Number(tx.amount_cents)===expected&&String(tx.method||'').toUpperCase()==='PIX'&&String(tx.currency||'').toUpperCase()==='BRL');
     if(!confirmed)rejectReason='amount_not_confirmed';
    }
   }catch{rejectReason='amount_lookup_failed';}
  }
  if(rejectReason){
   console.error('[create-pix] rejected provider response', {reason:rejectReason});
   return send(res,502,{error:'Não foi possível validar a cobrança PIX. Não efetue pagamento.'});
  }
  const token=sign({v:1,id:txId,ref,ticket,quantity,...(coupon?{coupon}:{}),amount:expected,name,expires:Math.max(Date.now()+7*86400000,Number.isFinite(expiry())?expiry():0)});
  let qr=null;try{qr=await QRCode.toDataURL(pix,{width:440,margin:1,errorCorrectionLevel:'M'});}catch{/* O código copia e cola continua disponível. */}
  return send(res,200,{token,coupon,discount_cents:discount,amount_cents:expected,subtotal_cents:TICKETS[ticket].cents*quantity,service_fee_cents:FEE*quantity*TICKETS[ticket].admissions,copy_paste:pix,expires_at:data.pix.expires_at||null,qr_data_url:qr});
 }catch{return send(res,502,{error:'Não foi possível conectar ao pagamento. Repita a tentativa sem alterar os dados.'});}
};
