'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const crypto=require('node:crypto');
const {Readable}=require('node:stream');
const Module=require('node:module');
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){if(request==='qrcode')return {toDataURL:async()=> 'data:image/png;base64,ZmFrZQ=='};return originalLoad.apply(this,arguments);};
process.env.BRAVOPAY_API_KEY='TEST_TOKEN_NEVER_REAL';
process.env.ORDER_SIGNING_SECRET='TEST_KEY_FOR_LOCAL_ONLY_1234567890123456';
process.env.BRAVOPAY_WEBHOOK_SECRET='whsec_TEST_NOT_REAL_123456';
process.env.UPSTASH_REDIS_REST_URL='https://fake-redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN='TEST_TOKEN';
const create=require('../api/create-pix');
const status=require('../api/pix-status');
const webhook=require('../api/bravopay-webhook');
const {sign,verify,amount}=require('../lib/payment-shared');
const redisMap=new Map();
const txMap=new Map();
const counters=new Map();
let providerCalls=0;
let creationResponseOverride=null;
const copyPaste='000201BR.GOV.BCB.PIX.TEST';
const originalFetch=global.fetch;
global.fetch=async(url,init={})=>{
 const u=String(url);
 if(u.endsWith('/pipeline')){
  const [[op,key,...args]]=JSON.parse(init.body);let result;
  switch(op){case 'GET':result=redisMap.get(key)||null;break;
   case 'SET':if(args.includes('NX')&&redisMap.has(key)){result=null;}else{redisMap.set(key,args[0]);result='OK';}break;
   case 'INCR':result=(counters.get(key)||0)+1;counters.set(key,result);break;
   case 'EXPIRE':result=1;break;
   case 'DEL':redisMap.delete(key);result=1;break;
   default:throw Error('Unexpected redis command '+op);
  }
  return {ok:true,json:async()=>[{result}]};
 }
 if(u==='https://bravopay.club/api/v1/transactions'&&init.method==='POST'){
  providerCalls++;
  const payload=JSON.parse(init.body);let tx=txMap.get(payload.external_reference);
  if(!tx){tx={id:'tx_'+crypto.createHash('sha256').update(payload.external_reference).digest('hex').slice(0,12),status:'PENDING',amount_cents:payload.amount_cents,external_reference:payload.external_reference,method:'PIX',currency:'BRL',metadata:payload.metadata,pix:{copy_paste:copyPaste,expires_at:new Date(Date.now()+1800000).toISOString()}};txMap.set(payload.external_reference,tx);}
  return {ok:true,status:200,json:async()=>creationResponseOverride?creationResponseOverride(tx):tx};
 }
 if(u.startsWith('https://bravopay.club/api/v1/transactions?')){
  providerCalls++;
  const ref=new URL(u).searchParams.get('external_reference');
  return {ok:true,status:200,json:async()=>({data:[txMap.get(ref)].filter(Boolean)})};
 }
 throw Error('Unexpected external network request: '+u);
};
function res(){return {statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};}
const customer={name:'Teste Comprador',email:'comprador@example.com',cpf:'52998224725',phone:'12988859882'};
async function call(handler,body){const response=res();await handler({method:'POST',body},response);return response;}
let created;
test('cálculos corretos da taxa por ingresso',()=>{assert.equal(amount('mulher',1),4449);assert.equal(amount('homem',1),6449);assert.equal(amount('mulher',2),8898);assert.equal(amount('homem',2),12898);assert.equal(amount('mulher',0),null);assert.equal(amount('homem',6),null);});
test('combo retirado rejeita novas cobranças e preserva confirmação de pedidos antigos',async()=>{
 const before=providerCalls;
 for(const quantity of [1,2]){
  const result=await call(create,{ticket:'combo',quantity,customer,request_id:'c1234567-1234-4234-8234-123456789012'});
  assert.equal(result.statusCode,422);
  assert.match(result.body.error,/não está mais disponível/);
 }
 assert.equal(providerCalls,before);
 const order={v:1,id:'tx_legacycombo',ref:'hp10_combo_'+'a'.repeat(32),ticket:'combo',quantity:1,amount:8898,name:customer.name,expires:Date.now()+86400000};
 const token=sign(order);
 assert.ok(verify(token));
 txMap.set(order.ref,{id:order.id,external_reference:order.ref,amount_cents:8898,method:'PIX',currency:'BRL',metadata:{ticket:'combo',quantity:'1'},status:'PAID'});
 const result=await call(status,{token});
 assert.equal(result.body.paid,true);
 assert.equal(result.body.order.quantity,2);
 assert.match(result.body.order.ticket,/Combo Amigo/);
});

test('ingresso +16 cobra 25 reais mais taxa e mantém identificação sem álcool',async()=>{
 assert.equal(amount('jovem',1),2949);
 assert.equal(amount('jovem',2),5898);
 assert.equal(amount('jovem',5),14745);
 assert.equal(amount('jovem',0),null);
 assert.equal(amount('jovem',6),null);
 const data={ticket:'jovem',quantity:2,customer,request_id:'a1234567-1234-4234-8234-123456789099'};
 const a=await call(create,data),retry=await call(create,data);
 assert.equal(a.statusCode,200);
 assert.equal(a.body.amount_cents,5898);
 assert.equal(a.body.subtotal_cents,5000);
 assert.equal(a.body.service_fee_cents,898);
 const order=verify(a.body.token);
 assert.equal(order.ticket,'jovem');
 assert.equal(order.ref,verify(retry.body.token).ref);
 assert.equal(verify(sign({...order,amount:2500})),null);
 assert.equal((await call(status,{token:a.body.token})).body.paid,false);
 const tx=txMap.get(order.ref);
 const event={id:'evt_testjovem',created:Math.floor(Date.now()/1000),type:'transaction.paid',data:{...tx,status:'PAID'}};
 const raw=Buffer.from(JSON.stringify(event));
 const ts=Math.floor(Date.now()/1000);
 const sig=crypto.createHmac('sha256',process.env.BRAVOPAY_WEBHOOK_SECRET).update(`${ts}.${raw.toString('utf8')}`).digest('hex');
 const response=res();
 await webhook({method:'POST',rawBody:raw,headers:{'bravopay-signature':`t=${ts},v1=${sig}`}},response);
 assert.equal(response.statusCode,200);
 const before=providerCalls;
 const paid=await call(status,{token:a.body.token});
 assert.equal(providerCalls,before);
 assert.equal(paid.body.paid,true);
 assert.equal(paid.body.order.quantity,2);
 assert.equal(paid.body.order.amount_cents,5898);
 assert.match(paid.body.order.ticket,/sem álcool.*refrigerante, água e energético/);
});

test('cupons descontam 25% apenas dos ingressos e rejeitam códigos inválidos',async()=>{
 for(const code of ['DOLCE25','MARIF25','BRUNOJ25','PROMO25']){
  assert.equal(amount('mulher',1,code),3449);
  assert.equal(amount('homem',1,code),4949);
  assert.equal(amount('jovem',1,code),2324);
  assert.equal(amount('combo',1,code),6898);
  assert.equal(amount('jovem',5,code),11620);
 }
 assert.equal(amount('mulher',1,' dolce25 '),3449);
 assert.equal(amount('mulher',1,'INVALIDO'),null);
 const data={ticket:'mulher',quantity:2,customer,coupon:' dolce25 ',request_id:'a1234567-1234-4234-8234-123456789088'};
 const before=providerCalls;
 for(const coupon of ['INVALIDO',{},['DOLCE25'],'DOLCE25 MARIF25','DOLCE10','MARIF10','BRUNOJ10','PROMO10']){
  assert.equal((await call(create,{...data,coupon})).statusCode,422);
 }
 assert.equal(providerCalls,before);
 const a=await call(create,data),retry=await call(create,{...data,coupon:'DOLCE25'});
 assert.equal(a.statusCode,200);
 assert.equal(a.body.amount_cents,6898);
 assert.equal(a.body.subtotal_cents,8000);
 assert.equal(a.body.discount_cents,2000);
 assert.equal(a.body.service_fee_cents,898);
 assert.equal(a.body.coupon,'DOLCE25');
 const order=verify(a.body.token);
 assert.equal(order.coupon,'DOLCE25');
 assert.equal(order.ref,verify(retry.body.token).ref);
 assert.equal(verify(sign({...order,coupon:''})),null);
 const changed=await call(create,{...data,coupon:'MARIF25'});
 assert.notEqual(verify(changed.body.token).ref,order.ref);
 const tx=txMap.get(order.ref);
 assert.equal(tx.metadata.discount_cents,'2000');
 assert.equal(tx.metadata.coupon,'DOLCE25');
 const event={id:'evt_testcoupon',created:Math.floor(Date.now()/1000),type:'transaction.paid',data:{...tx,status:'PAID'}};
 const raw=Buffer.from(JSON.stringify(event));const ts=Math.floor(Date.now()/1000);
 const sig=crypto.createHmac('sha256',process.env.BRAVOPAY_WEBHOOK_SECRET).update(`${ts}.${raw.toString('utf8')}`).digest('hex');
 const response=res();await webhook({method:'POST',rawBody:raw,headers:{'bravopay-signature':`t=${ts},v1=${sig}`}},response);
 assert.equal(response.statusCode,200);
 const paid=await call(status,{token:a.body.token});
 assert.equal(paid.body.paid,true);
 assert.equal(paid.body.order.amount_cents,6898);
 const reserved=await call(create,{ticket:'combo',quantity:1,customer,coupon:'PROMO25',request_id:'a1234567-1234-4234-8234-123456789087'});
 assert.equal(reserved.statusCode,422);
});

test('pedidos já assinados com cupom antigo mantêm 10% para confirmação',()=>{
 for(const coupon of ['DOLCE10','MARIF10','BRUNOJ10','PROMO10']){
  assert.equal(amount('mulher',1,coupon),null);
  const order={v:1,id:'tx_legacycoupon',ref:'hp10_mulher_'+'b'.repeat(32),ticket:'mulher',quantity:1,coupon,amount:4049,name:customer.name,expires:Date.now()+86400000};
  assert.ok(verify(sign(order)));
  assert.equal(verify(sign({...order,amount:3449})),null);
 }
});

test('gera PIX uma vez e conserva referência/idempotência nos retries',async()=>{
 const previousCount=txMap.size;
 const data={ticket:'mulher',quantity:1,customer,request_id:'d1234567-1234-4234-8234-123456789012'};
 const a=await call(create,data),b=await call(create,data);
 assert.equal(a.statusCode,200);assert.equal(b.statusCode,200);assert.equal(a.body.amount_cents,4449);assert.equal(a.body.service_fee_cents,449);assert.equal(a.body.copy_paste,copyPaste);assert.equal(verify(a.body.token).ref,verify(b.body.token).ref);created=a.body;
 assert.equal(txMap.size,previousCount+1);
});

test('resposta de criacao sem campos opcionais exibe PIX e preserva valor',async()=>{
 creationResponseOverride=tx=>({id:tx.id,amount_cents:tx.amount_cents,pix:tx.pix});
 try{
  const r=await call(create,{ticket:'mulher',quantity:1,customer,request_id:'a1234567-1234-4234-8234-123456789013'});
  assert.equal(r.statusCode,200);assert.equal(r.body.copy_paste,copyPaste);assert.equal(r.body.amount_cents,4449);
 }finally{creationResponseOverride=null;}
});
test('se resposta nao informar valor, consultar gateway antes de exibir PIX',async()=>{
 creationResponseOverride=tx=>({id:tx.id,pix:tx.pix});
 try{
  const before=providerCalls;
  const r=await call(create,{ticket:'homem',quantity:1,customer,request_id:'a1234567-1234-4234-8234-123456789014'});
  assert.equal(r.statusCode,200);assert.equal(r.body.amount_cents,6449);assert.equal(providerCalls,before+2);
 }finally{creationResponseOverride=null;}
});
test('valor incorreto informado pelo gateway bloqueia PIX',async()=>{
 creationResponseOverride=tx=>({...tx,amount_cents:tx.amount_cents+1});
 try{
  const r=await call(create,{ticket:'mulher',quantity:1,customer,request_id:'a1234567-1234-4234-8234-123456789015'});
  assert.equal(r.statusCode,502);assert.match(r.body.error,/Não efetue pagamento/);
 }finally{creationResponseOverride=null;}
});
test('codigo PIX ausente bloqueia apresentacao',async()=>{
 creationResponseOverride=tx=>({...tx,pix:{}});
 try{
  const r=await call(create,{ticket:'mulher',quantity:1,customer,request_id:'a1234567-1234-4234-8234-123456789016'});
  assert.equal(r.statusCode,502);
 }finally{creationResponseOverride=null;}
});
test('token adulterado, valor divergente e CPF inválido são rejeitados',async()=>{
 assert.equal(verify(created.token+'x'),null);
 assert.equal((await call(status,{token:created.token+'x'})).statusCode,403);
 assert.equal((await call(create,{ticket:'homem',quantity:1,customer:{...customer,cpf:'11111111111'},request_id:'a1234567-1234-4234-8234-123456789012'})).statusCode,422);
});
test('status pendente não libera ingresso',async()=>{const r=await call(status,{token:created.token});assert.equal(r.statusCode,200);assert.equal(r.body.paid,false);assert.equal(r.body.poll_after,30);});
test('webhook sem assinatura é rejeitado',async()=>{const r=res();const req=Object.assign(Readable.from(['{}']),{method:'POST',headers:{}});await webhook(req,r);assert.equal(r.statusCode,401);});
test('webhook PAID assinado libera compra e consulta não sobrecarrega provedor',async()=>{
 const order=verify(created.token);const tx=txMap.get(order.ref);tx.status='PAID';tx.paid_at=new Date().toISOString();
 const event={id:'evt_testpayment1',created:Math.floor(Date.now()/1000),type:'transaction.paid',data:tx};
 const raw=JSON.stringify(event);const ts=Math.floor(Date.now()/1000);const sig=crypto.createHmac('sha256',process.env.BRAVOPAY_WEBHOOK_SECRET).update(`${ts}.${raw}`).digest('hex');
 const r=res();const req=Object.assign(Readable.from([raw]),{method:'POST',headers:{'bravopay-signature':`t=${ts},v1=${sig}`}});await webhook(req,r);assert.equal(r.statusCode,200);
 const before=providerCalls;for(let i=0;i<150;i++){const response=await call(status,{token:created.token});assert.equal(response.statusCode,200);assert.equal(response.body.paid,true);assert.equal(response.body.order.amount_cents,4449);}
 assert.equal(providerCalls,before);
});
test('reembolso assinado revoga a aprovação em cache',async()=>{
 const order=verify(created.token);const tx=txMap.get(order.ref);tx.status='REFUNDED';const event={id:'evt_testrefund1',created:Math.floor(Date.now()/1000)+1,type:'transaction.refunded',data:tx};
 const raw=JSON.stringify(event);const ts=Math.floor(Date.now()/1000);const sig=crypto.createHmac('sha256',process.env.BRAVOPAY_WEBHOOK_SECRET).update(`${ts}.${raw}`).digest('hex');
 const r=res();await webhook(Object.assign(Readable.from([raw]),{method:'POST',headers:{'bravopay-signature':`t=${ts},v1=${sig}`}}),r);assert.equal(r.statusCode,200);
 const result=await call(status,{token:created.token});assert.equal(result.body.paid,false);assert.equal(result.body.status,'REFUNDED');
});
test('sem armazenamento compartilhado, status usa consulta menos frequente',async()=>{
 const url=process.env.UPSTASH_REDIS_REST_URL;
 delete process.env.UPSTASH_REDIS_REST_URL;
 try{const r=await call(status,{token:created.token});assert.equal(r.statusCode,200);assert.equal(r.body.poll_after,180);}
 finally{process.env.UPSTASH_REDIS_REST_URL=url;}
});
test('limite compartilhado impede excesso de consultas externas',async()=>{
 for(let i=0;i<27;i++){const id='tx_nonexistent'+i;const ref='hp10_mulher_'+i.toString(16).padStart(32,'0');const token=sign({v:1,id,ref,ticket:'mulher',quantity:1,amount:4449,name:'Teste',expires:Date.now()+86400000});await call(status,{token});}
 const over=await call(status,{token:sign({v:1,id:'tx_nonexistent999',ref:'hp10_mulher_'+'f'.repeat(32),ticket:'mulher',quantity:1,amount:4449,name:'Teste',expires:Date.now()+86400000})});
 assert.equal(over.statusCode,429);assert.ok(over.body.retry_after>0);
});
test('nenhuma chave ou código PIX real embutido no teste',()=>assert.equal(process.env.BRAVOPAY_API_KEY,'TEST_TOKEN_NEVER_REAL'));
