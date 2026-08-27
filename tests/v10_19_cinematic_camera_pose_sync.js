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

if(!['10.23.1','10.25.0'].includes(pkg.version))throw new Error(`Wrong V10.23+ package version: ${pkg.version}`);
for(const fragment of [
  '<title>Princess Rescue V10.23.1 — Runtime Reliability Hotfix</title>',
  "window.PrincessBlackBox?.init?.({version:'10.23.1'",
  'const BOSS_INTRO_FULL_MS=8600',
  'const V10192_CAMERA_KEYS=Object.freeze([',
  'function v10192CameraTangent(keys,index,property)',
  'function v10192Hermite(p0,p1,m0,m1,u,span)',
  'function v10192SampleCamera(ms,portrait,out=v10192CameraState)',
  'function v10192UpdateBossLookTargets(rec)',
  'chest.getWorldPosition(v10192ChestWorld);head.getWorldPosition(v10192HeadWorld)',
  'v10192UpperLook.copy(v10192ChestWorld).lerp(v10192HeadWorld,.68)',
  'function beginBossIntroPoseBridge(rec,durationMs=420,now=performance.now())',
  'item.bone.quaternion.slerpQuaternions(item.from,item.bone.quaternion,u)',
  'function updateBossIntroCinematicAnimation(rec,now=performance.now())',
  "setBossIntroCinematicStage(br,'combat',performance.now())",
  'if(rec.role===\'boss\'&&bossIntroActive())updateBossIntroCinematicAnimation(rec,nowMs)',
  'applyBossIntroPoseBridge(rec,nowMs)',
  'applyBossRootLock(rec,true)',
  'rec.active.time=v1019IntroSourceTime(',
  'animation:introCardV95 var(--boss-intro-duration,8.6s)',
  "el.style.setProperty('--boss-intro-duration',`${bossIntroV9Duration}ms`)"
])if(!html.includes(fragment))throw new Error(`V10.19.4 cinematic fragment missing: ${fragment}`);

for(const fragment of [
  'const BOSS_INTRO_MS = 9000',
  'room.state.introUntil=Date.now()+BOSS_INTRO_MS',
  '8.6s synchronized camera/pose timeline plus a 400ms network safety margin'
])if(!server.includes(fragment))throw new Error(`Authoritative intro lock missing: ${fragment}`);

const cameraStart=html.indexOf('function updateCam(dt){');
const cameraIntroEnd=html.indexOf(' cameraZoom+=',cameraStart);
if(cameraStart<0||cameraIntroEnd<0)throw new Error('V10.19.4 camera block is missing');
const camera=html.slice(cameraStart,cameraIntroEnd);
for(const fragment of [
  'const ms=v1019IntroTimelineMs()',
  'v10192UpdateBossLookTargets(rec)',
  'v10192SampleCamera(Math.min(ms,V1019_INTRO_CUES.finaleHold),portrait)',
  'v10192DesiredLook.copy(v10192FullLook).lerp(v10192UpperLook,state.upper)',
  'const exitU=v1019SmootherStep(',
  '1-Math.exp(-Math.min(.05,Math.max(0,dt))',
  'v108IntroLook.lerp(v10192DesiredLook,follow)',
  'camera.position.copy(v108IntroCamTarget)',
  'camera.lookAt(v108IntroLook)'
])if(!camera.includes(fragment))throw new Error(`Camera polish fragment missing: ${fragment}`);
if(camera.includes('const cue=(start,end)'))throw new Error('Old stop/start per-cue smootherstep camera is still active');
if(camera.includes('frameBossFullBody('))throw new Error('Intro camera still fights a per-frame framing correction');
if(camera.includes('cameraKick')||camera.includes('camTrauma'))throw new Error('Intro camera still applies combat shake');

for(const fragment of [
  '{ms:2800,angle:.02,radiusLandscape:5.60,radiusPortrait:9.20,height:4.28,upper:1.00}',
  'v10192FullLook.y=clamp(v10192FullLook.y,2.68,3.10)',
  'v10192UpperLook.y=clamp(v10192UpperLook.y,3.48,3.96)'
])if(!html.includes(fragment))throw new Error(`Upper-body safe-frame guard missing: ${fragment}`);

// Verify the Hermite formulation is velocity-continuous at a representative
// non-hold cue (1100 ms).
const H=(p0,p1,m0,m1,u,span)=>{const t=Math.max(0,Math.min(1,u)),t2=t*t,t3=t2*t;return (2*t3-3*t2+1)*p0+(t3-2*t2+t)*m0*span+(-2*t3+3*t2)*p1+(t3-t2)*m1*span};
const keys=[{ms:700,v:8.75},{ms:1100,v:6.60},{ms:2800,v:5.60}];
const tangent=(keys[2].v-keys[0].v)/(keys[2].ms-keys[0].ms),eps=.0001;
const left=(H(keys[0].v,keys[1].v,(keys[1].v-keys[0].v)/400,tangent,1,400)-H(keys[0].v,keys[1].v,(keys[1].v-keys[0].v)/400,tangent,1-eps,400))/(eps*400);
const right=(H(keys[1].v,keys[2].v,tangent,(keys[2].v-keys[1].v)/1700,eps,1700)-H(keys[1].v,keys[2].v,tangent,(keys[2].v-keys[1].v)/1700,0,1700))/(eps*1700);
if(Math.abs(left-right)>1e-5)throw new Error(`Camera velocity is discontinuous at cue: ${left} vs ${right}`);

console.log('V10.19.4 CINEMATIC CAMERA SYNC PASS · V10.19.2 C1 path preserved · rig target · 850 ms exit');
