'use strict';
const crypto=require('node:crypto');
const BASE='https://bravopay.club/api/v1/transactions';
const FEE=449;
const TICKETS=Object.freeze({mulher:{label:'Mulher',cents:4000,admissions:1},homem:{label:'Homem',cents:6000,admissions:1},jovem:{label:'+16 anos · Open bar sem álcool (refrigerante, água e energético)',cents:2500,admissions:1},combo:{label:'Combo Amigo · Unissex',cents:8000,admissions:2}});
const COUPONS=Object.freeze(['DOLCE25','MARIF25','BRUNOJ25','PROMO25']);
function normalizeCoupon(value){if(value==null)return '';if(typeof value!=='string')return null;const code=value.trim().toUpperCase();return code===''||COUPONS.includes(code)?code:null;}
function amount(ticket,quantity,coupon=''){if(normalizeCoupon(coupon)===null)return null;if(!Object.hasOwn(TICKETS,ticket)||!Number.isInteger(quantity)||quantity<1||quantity>5)return null;const subtotal=TICKETS[ticket].cents*quantity;return subtotal-(normalizeCoupon(coupon)?Math.round(subtotal*25/100):0)+FEE*TICKETS[ticket].admissions*quantity;}
// Apenas tokens já assinados podem confirmar pedidos da promoção anterior.
function orderAmount(order){
 if(['DOLCE10','MARIF10','BRUNOJ10','PROMO10'].includes(order.coupon)){
  const full=amount(order.ticket,order.quantity);
  return full===null?null:full-Math.round(TICKETS[order.ticket].cents*order.quantity*10/100);
 }
 return amount(order.ticket,order.quantity,order.coupon);
}
function send(res,status,value,headers={}){res.setHeader('Cache-Control','no-store');for(const [k,v] of Object.entries(headers))res.setHeader(k,v);return res.status(status).json(value);}
function sign(value){const secret=process.env.ORDER_SIGNING_SECRET;if(!secret||secret.length<32)throw new Error('Missing signing secret');const body=Buffer.from(JSON.stringify(value)).toString('base64url');const sig=crypto.createHmac('sha256',secret).update(body).digest('base64url');return `${body}.${sig}`;}
function verify(token){try{if(typeof token!=='string'||token.length>2400)return null;const [body,sig,...more]=token.split('.');if(!body||!sig||more.length)return null;const secret=process.env.ORDER_SIGNING_SECRET;if(!secret||secret.length<32)return null;const expected=crypto.createHmac('sha256',secret).update(body).digest();const actual=Buffer.from(sig,'base64url');if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return null;const order=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));if(!order||order.v!==1||order.expires<Date.now()||!/^hp10_(mulher|homem|combo|jovem)_[a-f0-9]{32}$/.test(order.ref)||!/^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(order.id)||orderAmount(order)!==order.amount||typeof order.name!=='string'||order.name.length>120)return null;return order;}catch{return null;}}
function matching(order,tx){return tx&&tx.external_reference===order.ref&&tx.id===order.id&&Number(tx.amount_cents)===order.amount&&String(tx.method||'').toUpperCase()==='PIX'&&String(tx.currency||'').toUpperCase()==='BRL'&&tx.metadata?.ticket===order.ticket&&Number(tx.metadata?.quantity)===order.quantity;}
async function lookup(order){const url=new URL(BASE);url.searchParams.set('external_reference',order.ref);url.searchParams.set('limit','5');const response=await fetch(url,{headers:{Authorization:`Bearer ${process.env.BRAVOPAY_API_KEY}`,Accept:'application/json'},signal:AbortSignal.timeout(12000)});if(response.status===429){const error=new Error('Rate limited');error.rateLimited=true;error.retryAfter=Math.min(180,Math.max(5,Number(response.headers.get('Retry-After'))||60));throw error;}if(!response.ok)throw new Error('Provider unavailable');const payload=await response.json();const tx=Array.isArray(payload?.data)?payload.data.find(t=>matching(order,t)):null;return tx||null;}
module.exports={normalizeCoupon,BASE,FEE,TICKETS,amount,send,sign,verify,lookup,matching};
