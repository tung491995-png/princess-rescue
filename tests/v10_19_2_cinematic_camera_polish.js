const fs=require('fs');
const path=require('path');
const crypto=require('crypto');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');

const cameraStart=html.indexOf('function updateCam(dt){');
const cameraEnd=html.indexOf(' cameraZoom+=',cameraStart);
const intro=html.slice(cameraStart,cameraEnd);
if(!intro.includes('const rec=rigRuntime.records.boss'))throw new Error('Camera is not connected to the accepted Tripo rig');
if(!intro.includes('state.upper>.72?7.4:6.2'))throw new Error('Weighted rig-target damping is missing');
if(!intro.includes('ms>=V1019_INTRO_CUES.finaleHold?9.0'))throw new Error('Combat-exit camera damping is missing');
if(!html.includes('let v10192LookReady=false'))throw new Error('Intro target reset guard is missing');
if(!html.includes('v10192LookReady=false;'))throw new Error('Intro target is not reset between matches');

// Pause + Exit Match must remain reachable and server-authoritative.
for(const fragment of [
  'id="pauseGameBtn"','id="pauseExitBtn"','function exitMatchFromPause()',
  "send({type:'pauseRequest'})","send({type:'resumeRequest'})",
  "$('pauseExitBtn').onclick=exitMatchFromPause"
])if(!html.includes(fragment))throw new Error(`Pause/Exit regression: ${fragment}`);

console.log('V10.19.2 CAMERA REGRESSION PASS · C1 framing preserved · Pause/Exit preserved');
