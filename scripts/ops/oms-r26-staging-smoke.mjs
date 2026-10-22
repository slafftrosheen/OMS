#!/usr/bin/env node
/**
 * OMS staging-only, read-only production and inventory HTTP smoke.
 *
 * Set OMS_STAGING_URL=https://staging.example and OMS_STAGING_COOKIE='...'
 * before running: npm run oms:staging-smoke
 *
 * Never stores/logs cookies, order records or credential-bearing URLs.
 * Refuses public HTTP targets and production domains unless explicitly
 * allowed with OMS_ALLOW_NONSTAGING=1.
 */
const env=process.env;
const supplied=env.OMS_STAGING_URL, cookie=env.OMS_STAGING_COOKIE;
if(!supplied||!cookie){
  console.error('Set OMS_STAGING_URL and OMS_STAGING_COOKIE in your local environment.');
  process.exit(2);
}
let base;
try{base=new URL(supplied);}
catch{console.error('Invalid OMS_STAGING_URL');process.exit(2);}
if(base.username||base.password||base.search||base.hash||
   !['https:','http:'].includes(base.protocol)){
  console.error('Use a clean staging URL with no credentials or query string.');
  process.exit(2);
}
const isLocal=['localhost','127.0.0.1','::1'].includes(base.hostname);
if(base.protocol!=='https:'&&!isLocal){
  console.error('Staging smoke requires HTTPS, except for localhost.');
  process.exit(2);
}
if(env.OMS_ALLOW_NONSTAGING!=='1'&&!isLocal&&
   !/(stage|staging|test|dev)/i.test(base.hostname)){
  console.error('Unrecognized staging host. Set OMS_ALLOW_NONSTAGING=1 only after verifying it is safe.');
  process.exit(2);
}
const root=base.origin+base.pathname.replace(/\/$/,'');
const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Riga',
 year:'numeric',month:'2-digit',day:'2-digit'});
const todayParts=fmt.formatToParts(new Date());
const part=type=>todayParts.find(x=>x.type===type)?.value??'';
const today=`${part('year')}-${part('month')}-${part('day')}`;
const [year,month,day]=today.split('-').map(Number);
const next=new Date(Date.UTC(year,month-1,day+7)).toISOString().slice(0,10);
const endpoints=[
  ['/api/production/board',obj=>obj?.success===true&&!!obj.totals&&!!obj.stations],
  ['/api/production/capacity',obj=>Array.isArray(obj?.settings)],
  ['/api/production/commitments',obj=>
    Array.isArray(obj?.commitments)&&obj.total===obj.commitments.length],
  [`/api/production/reservations?from=${today}&to=${next}`,obj=>
    Array.isArray(obj?.items)&&Number.isInteger(obj.total)&&obj.total>=obj.items.length],
  ['/api/production/performance?days=7',obj=>
    obj?.days===7&&!!obj.totals&&Array.isArray(obj.stations)&&
    Array.isArray(obj.active)&&Array.isArray(obj.completed)],
  ['/api/production/exception-reviews',obj=>
    Array.isArray(obj?.reviews)&&obj.total===obj.reviews.length],
  ['/api/inventory/movements?limit=1',obj=>Array.isArray(obj)],
  ['/api/inventory/consistency?page=1',obj=>
    obj?.page===1&&Number.isInteger(obj.totalMaterials)&&
    Number.isInteger(obj.scannedMaterials)&&Array.isArray(obj.rows)],
  ['/api/inventory/replenishment',obj=>
    Number.isInteger(obj?.candidateCount)&&Number.isInteger(obj?.totalMaterials)&&
    Number.isInteger(obj?.invalidBalanceCount)&&Number.isInteger(obj?.noThresholdCount)&&
    Array.isArray(obj.candidates)&&Array.isArray(obj.requests)&&
    obj.stockIsCanonical===true&&obj.physicalCountVerified===false&&
    obj.supplierOrderingAutomated===false&&obj.receiptsAffectStock===false]
];
const failures=[];
const sessionHeaders={Cookie:cookie,Accept:'application/json'};
async function request(path,headers){
 const res=await fetch(root+path,{
   method:'GET',headers,redirect:'manual',signal:AbortSignal.timeout(20000),cache:'no-store'
 });
 return res;
}
try{
 const r=await request('/api/build-info',{Accept:'application/json'});
 if(r.status!==200)throw Error(`status ${r.status}`);
 const info=await r.json();
 if(typeof info?.revision!=='string'||!info.revision||
    typeof info?.builtAt!=='string'||Number.isNaN(Date.parse(info.builtAt))||
    typeof info?.design!=='string')throw Error('missing or invalid build fingerprint');
 console.log(`PASS  /api/build-info (${info.revision}, ${info.builtAt})`);
}catch(e){
 const note=e instanceof Error?e.message:'unknown error';
 failures.push(`/api/build-info: ${note}`);
 console.error(`FAIL  /api/build-info (${note})`);
}
for(const [path,check] of endpoints){
 let label=path.split('?')[0];
 try{
   const r=await request(path,sessionHeaders);
   if(r.status!==200)throw Error(`status ${r.status}`);
   const data=await r.json();
   if(!check(data))throw Error('incomplete or unexpected response');
   console.log(`PASS  ${label}`);
   if(path==='/api/inventory/replenishment'){
     const requestId=data.requests.find(x=>typeof x?.id==='string')?.id;
     if(requestId){
       const eventsPath=`/api/inventory/replenishment/events?requestId=${encodeURIComponent(requestId)}`;
       const eventsResponse=await request(eventsPath,sessionHeaders);
       if(eventsResponse.status!==200)throw Error(`audit history status ${eventsResponse.status}`);
       const history=await eventsResponse.json();
       if(!Array.isArray(history?.events)||!Number.isInteger(history?.total)||
          history.total<history.events.length||typeof history?.truncated!=='boolean')
         throw Error('incomplete replenishment audit history');
       console.log('PASS  /api/inventory/replenishment/events');
     }else console.log('SKIP  /api/inventory/replenishment/events (no saved requests)');
   }
 }catch(e){
   const note=e instanceof Error?e.message:'unknown error';
   failures.push(`${label}: ${note}`);
   console.error(`FAIL  ${label} (${note})`);
 }
}
for(const path of ['/api/production/board','/api/production/exception-reviews',
 '/api/inventory/movements?limit=1','/api/inventory/consistency?page=1',
 '/api/inventory/replenishment']){
 try{
   const r=await request(path,{Accept:'application/json'});
   if(r.status!==401)throw Error(`expected 401, received ${r.status}`);
   console.log(`PASS  anonymous denied ${path}`);
 }catch(e){
   const note=e instanceof Error?e.message:'unknown error';
   failures.push(`Anonymous guard ${path}: ${note}`);
   console.error(`FAIL  anonymous denied ${path} (${note})`);
 }
}
if(failures.length){
 console.error(`OMS staging smoke FAILED: ${failures.length} check(s). No data was changed.`);
 process.exitCode=1;
}else console.log('OMS staging smoke PASS. No mutations were performed.');
