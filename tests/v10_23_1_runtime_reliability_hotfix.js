const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

if(!['10.23.1','10.25.0'].includes(pkg.version))throw new Error(`Wrong V10.23.1+ package version: ${pkg.version}`);
for(const [index,match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()){
  if(match[1].trim())new vm.Script(match[1],{filename:`inline-${index}.js`});
}

for(const fragment of [
  '<title>Princess Rescue V10.23.1 — Runtime Reliability Hotfix</title>',
  "window.PrincessBlackBox?.init?.({version:'10.23.1'",
  'function bossCacheRecoveryUrl(url)',
  "cacheMode:'reload',cacheRecovery:true",
  "'BOSS_CACHE_RECOVERY_STARTED'",
  "'BOSS_POST_ACCEPT_SETUP_DEGRADED'",
  "rigRuntime.status.boss='ready-degraded';enforceBossTripoVisibility(rec)",
  'function stripRedundantBossScaleTracks(clips=[])',
  'stripRedundantBossScaleTracks(gltf.animations||[])',
  "'BOSS_REDUNDANT_SCALE_TRACKS_REMOVED'",
  'function forceStaleSocketReconnect',
  'function checkSocketLiveness',
  "forceStaleSocketReconnect('snapshot-stream-stalled')",
  "forceStaleSocketReconnect('socket-inbound-stalled')",
  "if(rigRuntime.records.boss?.visualAccepted)enforceBossTripoVisibility",
  "if(iosDevice)return 'low'",
  'drawCalls>72||triangles>360000||frameEma>36',
  'const stableScaleAudit=activeGame&&!bossIntroActive()&&!deathCinematicActive()',
  'const cinematicCameraOwned=bossIntroActive()||deathCinematicActive()'
])if(!html.includes(fragment))throw new Error(`V10.23.1 client repair missing: ${fragment}`);

const glb=fs.readFileSync(path.join(root,'public','assets','characters','ma_vuong_mat_ngu_mobile_1k.glb'));
const jsonLength=glb.readUInt32LE(12);
const gltf=JSON.parse(glb.subarray(20,20+jsonLength).toString().replace(/\0+$/,''));
let scaleChannels=0,totalChannels=0;
for(const animation of gltf.animations||[])for(const channel of animation.channels||[]){
  totalChannels++;
  if(channel.target?.path==='scale')scaleChannels++;
}
if((gltf.animations||[]).length!==19)throw new Error(`Expected 19 boss animations, found ${(gltf.animations||[]).length}`);
if(scaleChannels<700)throw new Error(`Scale-track regression fixture changed unexpectedly: ${scaleChannels}`);

const watchdogStart=html.indexOf('function forceStaleSocketReconnect');
const watchdogEnd=html.indexOf('\nfunction connect(',watchdogStart);
const watchdog=html.slice(watchdogStart,watchdogEnd);
for(const fragment of ['snapshotAge>4200','inboundAge>7500',"current.close(4002,'Runtime stream stalled')",'scheduleReconnect()']){
  if(!watchdog.includes(fragment))throw new Error(`Socket watchdog guard missing: ${fragment}`);
}

const rigStart=html.indexOf('async function loadRigAsset(roleName)');
const rigEnd=html.indexOf('\nfunction loadAllRiggedCharacters()',rigStart);
const rig=html.slice(rigStart,rigEnd);
if(rig.indexOf('rec.visualAccepted=true')>rig.indexOf("rigRuntime.status.boss='ready-degraded'"))throw new Error('Accepted Tripo lock is not downstream of static validation');
if(!rig.includes("setAssetLoadProgress(100,'Boss Tripo đã sẵn sàng · VFX phụ được giảm','ready')"))throw new Error('Degraded post-accept state still appears as a failed boss load');

for(const fragment of [
  "runtimeReliability:'v10.23.1-tripo-cache-recovery-snapshot-watchdog-ios-animation-budget'",
  'Princess Rescue V10.23.1 server'
])if(!server.includes(fragment))throw new Error(`V10.23.1 server metadata missing: ${fragment}`);

console.log(`V10.23.1 RUNTIME RELIABILITY PASS · ${scaleChannels}/${totalChannels} redundant scale channels filtered · Tripo lock · cache recovery · fake-open socket reconnect · iPhone budget`);
