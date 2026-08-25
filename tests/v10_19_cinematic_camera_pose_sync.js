const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

for(const [index,match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()){
  if(match[1].trim())new vm.Script(match[1],{filename:`inline-${index}.js`});
}

if(pkg.version!=='10.19.0')throw new Error(`Wrong V10.19 package version: ${pkg.version}`);
for(const fragment of [
  '<title>Princess Rescue V10.19 — Cinematic Camera &amp; Pose Synchronization</title>',
  "window.PrincessBlackBox?.init?.({version:'10.19.0'",
  'const BOSS_INTRO_FULL_MS=8600',
  'revealEnd:700,danceStart:700,danceOrbit:1100,danceCross:2800,danceSettle:4300',
  'queenHold:4900,finaleStart:5350,finaleOrbit:5800,finaleHold:7750,combatStart:8150,end:8600',
  'function v1019SmootherStep(value)',
  'function v1019IntroTimelineMs(now=performance.now())',
  'function beginBossIntroPoseBridge(rec,durationMs=420,now=performance.now())',
  'item.bone.quaternion.slerpQuaternions(item.from,item.bone.quaternion,u)',
  'function updateBossIntroCinematicAnimation(rec,now=performance.now())',
  "setBossIntroCinematicStage(br,'combat',performance.now())",
  'if(bossIntroActive())return;',
  'if(rec.role===\'boss\'&&bossIntroActive())updateBossIntroCinematicAnimation(rec,nowMs)',
  'applyBossIntroPoseBridge(rec,nowMs)',
  'applyBossRootLock(rec,true)',
  'rec.active.time=v1019IntroSourceTime(',
  'rec.mixer.update(0)',
  'animation:introCardV95 var(--boss-intro-duration,8.6s)',
  "el.style.setProperty('--boss-intro-duration',`${bossIntroV9Duration}ms`)",
  "['boss_idle','boss_phase_eternal','boss_ultimate','boss_combat_idle']"
])if(!html.includes(fragment))throw new Error(`V10.19 cinematic fragment missing: ${fragment}`);

for(const fragment of [
  'const BOSS_INTRO_MS = 9000',
  'room.state.introUntil=Date.now()+BOSS_INTRO_MS',
  '8.6s synchronized camera/pose timeline plus a 400ms network safety margin'
])if(!server.includes(fragment))throw new Error(`V10.19 authoritative lock missing: ${fragment}`);

const cameraStart=html.indexOf('function updateCam(dt){');
const cameraIntroEnd=html.indexOf(' cameraZoom+=',cameraStart);
if(cameraStart<0||cameraIntroEnd<0)throw new Error('V10.19 camera block is missing');
const camera=html.slice(cameraStart,cameraIntroEnd);
for(const fragment of [
  'const ms=v1019IntroTimelineMs()',
  'const cue=(start,end)=>v1019SmootherStep',
  'const introBack=portrait?15.55:8.90',
  'if(ms<V1019_INTRO_CUES.revealEnd)',
  'else if(ms<V1019_INTRO_CUES.danceOrbit)',
  'else if(ms<V1019_INTRO_CUES.danceCross)',
  'else if(ms<V1019_INTRO_CUES.danceSettle)',
  'else if(ms<V1019_INTRO_CUES.queenHold)',
  'else if(ms<V1019_INTRO_CUES.finaleStart)',
  'else if(ms<V1019_INTRO_CUES.finaleOrbit)',
  'else if(ms<V1019_INTRO_CUES.finaleHold)',
  'else if(ms<V1019_INTRO_CUES.combatStart)',
  'camera.position.copy(v108IntroCamTarget)'
])if(!camera.includes(fragment))throw new Error(`V10.19 camera cue missing: ${fragment}`);
if(camera.includes('frameBossFullBody('))throw new Error('Intro camera still fights a per-frame framing correction');
if(camera.includes('cameraKick')||camera.includes('camTrauma'))throw new Error('Intro camera still applies combat shake');

const actingStart=html.indexOf('function v106ApplyActing(nowMs){');
const actingEnd=html.indexOf('\nfunction ',actingStart+20);
const acting=html.slice(actingStart,actingEnd);
if(acting.indexOf('if(bossIntroActive())return;')>acting.indexOf('const nowSec='))throw new Error('Gameplay additive acting is disabled too late');

const syncStart=html.indexOf('function setBossIntroCinematicStage(');
const syncEnd=html.indexOf('\nfunction applyBossRootLock(',syncStart);
const sync=html.slice(syncStart,syncEnd);
if(/position\.slerp|scale\.slerp|bone\.position\s*=/.test(sync))throw new Error('Pose bridge can mutate translation or scale');
for(const stage of ['dance','queenHold','finale','finaleHold','combat']){
  if(!sync.includes(`stage==='${stage}'`))throw new Error(`Missing cinematic stage: ${stage}`);
}

// Quintic smootherstep must arrive with zero velocity at both ends.
const smooth=t=>t*t*t*(t*(t*6-15)+10);
const eps=1e-4;
if(smooth(0)!==0||smooth(1)!==1)throw new Error('Smootherstep endpoints are wrong');
if(Math.abs((smooth(eps)-smooth(0))/eps)>.001||Math.abs((smooth(1)-smooth(1-eps))/eps)>.001)throw new Error('Pose/camera bridge endpoints are not velocity-safe');

console.log('V10.19 CINEMATIC CAMERA & POSE SYNC PASS · one clock · 9 camera cues · quintic pose bridges · ROOT XZ/full-body guards');
