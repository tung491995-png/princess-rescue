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
if(pkg.version!=='10.22.0')throw new Error(`Wrong V10.22 package version: ${pkg.version}`);

for(const fragment of [
  'id="pauseGameBtn"',
  'id="gamePauseOverlay"',
  'id="pauseResumeBtn"',
  'id="pauseExitBtn"',
  'function requestManualPause()',
  'function requestManualResume()',
  'function exitMatchFromPause()',
  "send({type:'pauseRequest'})",
  "send({type:'resumeRequest'})",
  "if(m.type==='manualPause')",
  "if(m.type==='manualResume')",
  'const manuallyPaused=!!latestState?.paused,hitStopActive=now<hitStopUntil',
  'const visualFrozen=hitStopActive||manuallyPaused',
  "if(e.code==='Escape')",
  "$('pauseGameBtn').onclick=requestManualPause",
  "$('pauseExitBtn').onclick=exitMatchFromPause"
])if(!html.includes(fragment))throw new Error(`Pause client fragment missing: ${fragment}`);

for(const fragment of [
  'manualPause:false,manualPauseRole:null,pauseStartedAt:0',
  'function shiftPauseClock(room,delta)',
  'function beginRoomPause(room,role,{manual=false}={})',
  'function resumeRoomPause(room)',
  "if(m.type==='pauseRequest')",
  "if(m.type==='resumeRequest')",
  "broadcast(room,{type:'manualPause'",
  "broadcast(room,{type:'manualResume'",
  "if(s.manualPauseRole!==role)",
  'room.state.paused&&!room.state.manualPause',
  'manualPause:!!s.manualPause,manualPauseRole:s.manualPauseRole||null'
])if(!server.includes(fragment))throw new Error(`Pause server fragment missing: ${fragment}`);

const pauseGuard=server.indexOf("if(m.type==='pauseRequest')");
const introGuard=server.indexOf("if(s.introUntil&&Date.now()<s.introUntil)",pauseGuard);
if(pauseGuard<0||introGuard<pauseGuard)throw new Error('Pause request is not protected during cinematic intro');

console.log('V10.19.1 PAUSE + EXIT PASS · authoritative freeze · owner resume · exit · ESC/mobile UI · timer shift');
