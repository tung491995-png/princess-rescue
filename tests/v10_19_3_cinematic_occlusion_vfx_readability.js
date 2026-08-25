const fs=require('fs');
const path=require('path');
const vm=require('vm');
const crypto=require('crypto');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');

for(const [index,match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()){
  if(match[1].trim())new vm.Script(match[1],{filename:`inline-${index}.js`});
}
if(pkg.version!=='10.19.3')throw new Error(`Wrong package version: ${pkg.version}`);
for(const fragment of [
  '<title>Princess Rescue V10.19.3 — Cinematic Occlusion &amp; VFX Readability</title>',
  "window.PrincessBlackBox?.init?.({version:'10.19.3'",
  "orbScale=.74+.035*Math.sin(ctx.pre*Math.PI*4)",
  "blackMoon.name='UltimateBlackMoon';blackMoon.visible=false;blackMoon.position.set(0,.10,-.46)",
  'blackMoon.renderOrder=-2',
  'fx.blackMoon.scale.setScalar(.12+.68*link)',
  'fx.blackMoon.material.opacity=.08+.54*link',
  'fx.runeA.material.opacity=.06+.11*ctx.pre',
  'fx.runeA.material.opacity=(.10+.36*pre)*(1-after*.72)',
  'fx.runeA.material.opacity=.12+.35*link',
  "state==='introWaltz'?.66:state==='introFinale'?.76:state==='aoe'?.70:1",
  '@keyframes introCardV95{0%,54%{opacity:0',
  '60%,78%{opacity:1',
  '86%,100%{opacity:0',
  'float alpha=sat(art)*(.11+.43*uPre)*fade*pulse',
  "bossTelegraphRing.material.opacity=now<c.impactAt?(mobileDevice?.26:.16)+(mobileDevice?.36:.40)*pre:(mobileDevice?.55:.45)*(1-after)",
  'bossTelegraphRing.material.opacity=.28+.32*kickPre',
  '@keyframes impactRingV96{0%{opacity:0',
  '18%{opacity:.64}'
])if(!html.includes(fragment))throw new Error(`V10.19.3 readability fragment missing: ${fragment}`);

// V10.19.2 camera function must remain byte-identical in this VFX-only pass.
const cameraStart=html.indexOf('function updateCam(dt){');
const cameraEnd=html.indexOf('\nfunction runtimeBlackBoxTelemetry(',cameraStart);
const cameraSha=sha(html.slice(cameraStart,cameraEnd));
if(cameraSha!=='d503d82848d3af111ea5cea48d69cf5b1c3cf08b78371707cebbec87c1b92b96')throw new Error('V10.19.2 camera path changed');

// Server is unchanged except its console version label.
const normalizedServer=server.replace('Princess Rescue V10.19.3 server','Princess Rescue V10.19.2 server');
if(sha(normalizedServer)!=='f1456b837771657bb863a4e4912f712658c505da003cf262c5fb54e8ad0feaa5')throw new Error('Server/gameplay changed in VFX-only pass');

const oldMoonMax=.18+1.15,newMoonMax=.12+.68,reduction=1-newMoonMax/oldMoonMax;
if(reduction<.35||reduction>.45)throw new Error(`Black moon reduction outside 35–45%: ${reduction}`);
const pullbackStart=7750/8600,titleGone=.86;
if(titleGone>=pullbackStart)throw new Error('Boss title does not disappear before pullback');
const ringMaxMobile=.26+.36,ringMaxDesktop=.16+.40;
if(ringMaxMobile>.65||ringMaxDesktop>.60)throw new Error('Combat rings remain too opaque');

for(const fragment of [
  'id="pauseGameBtn"','id="pauseExitBtn"','function exitMatchFromPause()',
  "send({type:'pauseRequest'})","send({type:'resumeRequest'})",
  "$('pauseExitBtn').onclick=exitMatchFromPause"
])if(!html.includes(fragment))throw new Error(`Pause/Exit regression: ${fragment}`);

console.log('V10.19.3 OCCLUSION/VFX PASS · moon -40%/behind · small dance orb · early title fade · AOE readability · camera/server preserved');
