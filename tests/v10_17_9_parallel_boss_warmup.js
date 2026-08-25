const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');

function readGlbJson(file){
  const data=fs.readFileSync(file);
  if(data.readUInt32LE(0)!==0x46546c67||data.readUInt32LE(4)!==2||data.readUInt32LE(8)!==data.length)throw new Error(`Invalid GLB: ${file}`);
  let offset=12;
  while(offset<data.length){
    const length=data.readUInt32LE(offset),kind=data.readUInt32LE(offset+4);offset+=8;
    if(kind===0x4e4f534a)return JSON.parse(data.subarray(offset,offset+length).toString('utf8').replace(/[\0 ]+$/,''));
    offset+=length;
  }
  throw new Error(`Missing GLB JSON: ${file}`);
}

for(const fragment of [
  '<title>Princess Rescue V10.22 — Player Combat Animation &amp; Skill VFX</title>',
  "window.PrincessBlackBox?.init?.({version:'10.22'",
  'function fetchGlbBuffer(url,timeoutMs)',
  'function parseGlbBuffer(loader,buffer,timeoutMs)',
  'function prefetchBossArmamentBuffers()',
  "orb:'/assets/props/ma_vuong_orb_startup_512.glb?v=10.17.9'",
  "halo:'/assets/props/ma_vuong_halo_startup_512.glb?v=10.17.9'",
  'const BOSS_PROP_FALLBACK_ASSETS=',
  "const armamentBuffers=roleName==='boss'?prefetchBossArmamentBuffers():null",
  'await loadBossArmament(rec,armamentBuffers)',
  'prewarmBossIntroPrograms(bossArmament)',
  "bugRecorder?.record?.('info','BOSS_ASSET_READY'",
  'const shouldRender=activeRender||now-lobbyLastRender>=160'
])if(!html.includes(fragment))throw new Error(`V10.17.9 parallel warmup fragment missing: ${fragment}`);

const rigStart=html.indexOf('async function loadRigAsset(roleName)');
const rigEnd=html.indexOf('\nfunction loadAllRiggedCharacters()',rigStart);
const rigBlock=html.slice(rigStart,rigEnd);
if(rigBlock.indexOf('prefetchBossArmamentBuffers()')>rigBlock.indexOf('loadGlbCandidate(loader,url'))throw new Error('Orb/halo prefetch does not start before the boss download');
if(rigBlock.includes('renderer?.compile?.(scene,camera)'))throw new Error('Duplicate full-scene compile remains after combined prewarm');

const armStart=html.indexOf('async function loadBossArmament(');
const armEnd=html.indexOf('\nfunction triggerBossArmamentHit(',armStart);
const armBlock=html.slice(armStart,armEnd);
if(armBlock.includes('prewarmBossIntroPrograms(armament)'))throw new Error('Armament still compiles before the boss becomes visible');
if(!armBlock.includes('const prefetched=buffers[index]'))throw new Error('Prefetched prop buffers are not consumed');
if(!armBlock.includes("console.warn('[V10.17.9 prop startup fallback]'"))throw new Error('Startup props do not retry the stable fallback assets');

for(const name of ['orb','halo']){
  const source=path.join(root,'public','assets','props',`ma_vuong_${name}_mobile.glb`);
  const startup=path.join(root,'public','assets','props',`ma_vuong_${name}_startup_512.glb`);
  if(!fs.existsSync(startup))throw new Error(`Missing startup prop: ${startup}`);
  if(fs.statSync(startup).size>=fs.statSync(source).size)throw new Error(`Startup ${name} is not smaller than its fallback`);
  const original=readGlbJson(source),optimized=readGlbJson(startup);
  for(const key of ['meshes','nodes','skins','accessors','animations','scenes','scene']){
    if(JSON.stringify(original[key]??null)!==JSON.stringify(optimized[key]??null))throw new Error(`Startup ${name} changed GLB ${key}`);
  }
  if((optimized.images||[]).some(image=>image.mimeType!=='image/jpeg'))throw new Error(`Startup ${name} contains a non-JPEG texture`);
}

for(const fragment of [
  "const STATIC_ASSET_OPTIONS = { maxAge:'30d', immutable:true, etag:true }",
  "app.use('/assets',express.static(path.join(PUBLIC_DIR,'assets'),STATIC_ASSET_OPTIONS))",
  "app.use(express.static(PUBLIC_DIR,{maxAge:0,etag:true}))"
])if(!server.includes(fragment))throw new Error(`Static asset cache fragment missing: ${fragment}`);

console.log('V10.17.9 PARALLEL BOSS WARMUP PASS · concurrent network · single compile · cached GLB · throttled lobby render');
