'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
process.env.BRAVOPAY_API_KEY='TEST_ONLY_PROVIDER';
process.env.ORDER_SIGNING_SECRET='TEST_ONLY_ORDER_SECRET_12345678901234567890';
process.env.TICKET_SIGNING_SECRET='TEST_ONLY_TICKET_SECRET_12345678901234567890';
process.env.GATE_PASSWORD='TEST_ONLY_GATE_PASSWORD';
process.env.UPSTASH_REDIS_REST_URL='https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN='TEST_ONLY_REDIS';
process.env.TICKET_VALID_UNTIL=new Date(Date.now()+90*86400000).toISOString();
const issue=require('../api/tickets'), gate=require('../api/gate-check'), session=require('../api/gate-session');
const {sign,amount}=require('../lib/payment-shared');
const {key}=require('../lib/tickets');
const map=new Map();let providerStatus='PAID',offline=false,redisOffline=false;let beforeAdmit=null;
// Fake network boundaries only: no real charges or stored production records.
global.fetch=async(url,options={})=>{
 if(String(url).endsWith('/pipeline')){
  if(redisOffline)throw Error('Redis offline');
  const [[op,...args]]=JSON.parse(options.body);let result;
  if(op==='PING')result='PONG';else if(op==='GET')result=map.get(args[0])||null;
  else if(op==='SET'){if(args.includes('NX')&&map.has(args[0]))result=null;else{map.set(args[0],args[1]);result='OK';}}
  else if(op==='DEL')result=Number(map.delete(args[0]));
  else if(op==='INCR'){result=Number(map.get(args[0])||0)+1;map.set(args[0],result);}
  else if(op==='EXPIRE')result=1;
  else if(op==='EVAL'){
   const [,count,ticketKey,usedKey,blockedKey,now,checkin]=args;assert.equal(count,3);
   if(beforeAdmit){beforeAdmit();beforeAdmit=null;}
   const record=JSON.parse(map.get(ticketKey)||'null');
   if(!record)result=['missing'];else if(record.expires<=Number(now))result=['expired'];else if(map.has(blockedKey))result=['revoked'];else if(map.has(usedKey))result=['used',map.get(usedKey)];else{map.set(usedKey,checkin);result=['admitted',checkin];}
  }else throw Error('Unexpected '+op);
  return {ok:true,json:async()=>[{result}]};
 }
 if(offline)throw Error('Provider offline');
 const ref=new URL(url).searchParams.get('external_reference');const order=orders.get(ref);
 return {ok:true,json:async()=>({data:order?[{id:order.id,external_reference:ref,amount_cents:order.amount,method:'PIX',currency:'BRL',metadata:{ticket:order.ticket,quantity:order.quantity},status:providerStatus}]:[]})};
};
const orders=new Map();
function order(ticket='mulher',quantity=1){const id=crypto.randomBytes(16).toString('hex');const o={v:1,id:'tx_'+id,ref:'hp10_'+ticket+'_'+id,ticket,quantity,amount:amount(ticket,quantity),name:'Comprador Teste',expires:Date.now()+86400000};orders.set(o.ref,o);return o;}
const headers={'content-type':'application/json','x-mfparty':'portaria','sec-fetch-site':'same-origin'};
async function call(handler,body,extra={}){const res={headers:{},statusCode:0,setHeader(k,v){this.headers[k]=v;},status(c){this.statusCode=c;return this;},json(v){this.body=v;return this;}};await handler({method:'POST',headers:{...headers,...extra.headers},body,...Object.fromEntries(Object.entries(extra).filter(([k])=>k!=='headers'))},res);return res;}
async function login(){const r=await call(session,{password:process.env.GATE_PASSWORD,station:'Portaria Teste'});assert.equal(r.statusCode,200);return r.headers['Set-Cookie'].split(';')[0];}
async function scan(code,cookie,action='preview'){return call(gate,{code,action},{headers:{cookie}});}
test('emite um QR único por pessoa, inclusive combo legado, com reemissão idempotente',async()=>{for(const [category,quantity,total] of [['jovem',3,3],['combo',2,4]]){const token=sign(order(category,quantity));const a=await call(issue,{token}),b=await call(issue,{token});assert.equal(a.statusCode,200);assert.equal(a.body.tickets.length,total);assert.equal(new Set(a.body.tickets.map(t=>t.code)).size,total);assert.deepEqual(a.body,b.body);assert.match(a.body.tickets[0].qr,/^data:image\/png;base64,/);}});
test('pendente, reembolsado e token adulterado não emitem ingresso',async()=>{const token=sign(order());for(const state of ['PENDING','REFUNDED','CHARGEBACK']){providerStatus=state;assert.equal((await call(issue,{token})).statusCode,409);}providerStatus='PAID';assert.equal((await call(issue,{token:token+'x'})).statusCode,403);});
test('senha, sessão, expiração e proteção contra solicitações externas',async()=>{assert.equal((await call(session,{password:'wrong',station:'X'})).statusCode,401);const cookie=await login();assert.equal((await scan('MF1-'+'a'.repeat(48),'')).statusCode,401);assert.equal((await call(gate,{},{headers:{cookie,'sec-fetch-site':'cross-site'}})).statusCode,403);assert.equal((await call(gate,{},{headers:{cookie,'x-mfparty':''}})).statusCode,403);process.env.GATE_PASSWORD+='rotated';assert.equal((await scan('MF1-'+'a'.repeat(48),cookie)).statusCode,401);process.env.GATE_PASSWORD=process.env.GATE_PASSWORD.replace('rotated','');});
test('consulta não consome; duas portarias simultâneas permitem somente uma entrada',async()=>{const o=order(),token=sign(o);const emitted=await call(issue,{token});const code=emitted.body.tickets[0].code;const a=await login(),b=await login();assert.equal((await scan(code,a)).body.state,'valid');assert.equal((await scan(code,a)).body.state,'valid');const results=await Promise.all([scan(code,a,'admit'),scan(code,b,'admit')]);assert.deepEqual(results.map(r=>r.body.state).sort(),['admitted','used']);assert.equal((await scan(code,a)).body.state,'used');await call(issue,{token});assert.equal((await scan(code,b,'admit')).body.state,'used');});
test('rotação do segredo de emissão preserva os mesmos códigos e o uso registrado',async()=>{const token=sign(order());const a=await call(issue,{token});const code=a.body.tickets[0].code;const cookie=await login();await scan(code,cookie,'admit');process.env.TICKET_SIGNING_SECRET+='rotation';const b=await call(issue,{token});assert.equal(b.body.tickets[0].code,code);assert.equal((await scan(code,cookie)).body.state,'used');});
test('código inventado, expirado e reembolso após consulta são bloqueados',async()=>{const cookie=await login();assert.equal((await scan('MF1-'+'f'.repeat(48),cookie)).statusCode,404);assert.equal((await scan('not-a-ticket',cookie)).statusCode,422);const o=order();const r=await call(issue,{token:sign(o)});const code=r.body.tickets[0].code;assert.equal((await scan(code,cookie)).body.state,'valid');providerStatus='REFUNDED';assert.equal((await scan(code,cookie,'admit')).body.state,'revoked');providerStatus='PAID';beforeAdmit=()=>map.set(key('blocked',o.id),JSON.stringify({status:'REFUNDED'}));assert.equal((await scan(code,cookie,'admit')).statusCode,409);map.delete(key('blocked',o.id));const record=JSON.parse(map.get(key('ticket',code)));record.expires=Date.now()-1;map.set(key('ticket',code),JSON.stringify(record));assert.equal((await scan(code,cookie)).body.state,'expired');});
test('falha do banco ou provedor não libera entrada; logout revoga sessão',async()=>{const code=(await call(issue,{token:sign(order())})).body.tickets[0].code;const cookie=await login();offline=true;assert.equal((await scan(code,cookie,'admit')).statusCode,503);offline=false;redisOffline=true;assert.equal((await scan(code,cookie,'admit')).statusCode,503);redisOffline=false;assert.equal((await scan(code,cookie)).body.state,'valid');await call(session,{action:'logout'},{headers:{cookie}});assert.equal((await scan(code,cookie)).statusCode,401);});
test('sem configuração, emissão e portaria falham fechadas',async()=>{const saved=process.env.UPSTASH_REDIS_REST_TOKEN;delete process.env.UPSTASH_REDIS_REST_TOKEN;assert.equal((await call(issue,{token:sign(order())})).statusCode,503);assert.equal((await call(gate,{})).statusCode,503);process.env.UPSTASH_REDIS_REST_TOKEN=saved;});
