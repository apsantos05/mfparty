'use strict';
const URL_KEY='UPSTASH_REDIS_REST_URL';
const TOKEN_KEY='UPSTASH_REDIS_REST_TOKEN';
function configured(){return Boolean(process.env[URL_KEY]&&process.env[TOKEN_KEY]);}
async function command(args){
  if(!configured())return null;
  const res=await fetch(process.env[URL_KEY].replace(/\/$/,'')+'/pipeline',{
    method:'POST',headers:{Authorization:`Bearer ${process.env[TOKEN_KEY]}`,'Content-Type':'application/json'},
    body:JSON.stringify([args]),signal:AbortSignal.timeout(3500)
  });
  if(!res.ok)throw new Error('Redis temporarily unavailable');
  const result=await res.json();
  if(!Array.isArray(result)||result[0]?.error)throw new Error('Redis command failed');
  return result[0].result;
}
async function get(key){const value=await command(['GET',key]);return value?JSON.parse(value):null;}
async function set(key,value,seconds){return command(['SET',key,JSON.stringify(value),'EX',seconds]);}
async function limit(name,max){
  if(!configured())return {allowed:true};
  const bucket=Math.floor(Date.now()/60000);
  const key=`hp10:limit:${name}:${bucket}`;
  const count=Number(await command(['INCR',key]));
  if(count===1)await command(['EXPIRE',key,125]);
  return {allowed:count<=max,retryAfter:60-(Math.floor(Date.now()/1000)%60)+2};
}
module.exports={configured,get,set,limit,command};
