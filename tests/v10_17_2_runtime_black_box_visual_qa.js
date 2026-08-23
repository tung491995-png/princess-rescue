const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const recorderSource = fs.readFileSync(path.join(root, 'public', 'runtime-black-box.js'), 'utf8');

new vm.Script(recorderSource, { filename: 'runtime-black-box.js' });
for (const [index, match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()) {
  if (match[1].trim()) new vm.Script(match[1], { filename: `inline-${index}.js` });
}

for (const fragment of [
  '<title>Princess Rescue V10.17.2 — Runtime Black Box &amp; Visual QA</title>',
  '<script src="/runtime-black-box.js"></script>',
  'id="qaRecorderBadge"',
  'id="qaRecorderCapture"',
  'id="qaRecorderDownload"',
  'id="fullVisualQaOpen"',
  "window.PrincessBlackBox?.init?.({version:'10.17.2'",
  'function runtimeBlackBoxTelemetry(',
  'function updateRuntimeBlackBox(',
  'bugRecorder?.afterRender?.(renderer.domElement',
  "renderer.domElement.addEventListener('webglcontextlost'",
  "renderer.domElement.addEventListener('webglcontextrestored'",
  'const screenshotClips=new Set([18,8,13,14,9,12,7,17,15])',
  'AUDIT_VFX_SKILL_',
  'FULL_VISUAL_AUDIT_PASSED',
  'FULL_VISUAL_AUDIT_FAILED'
]) if (!html.includes(fragment)) throw new Error(`V10.17.2 integration missing: ${fragment}`);

for (const code of [
  'BOSS_MODEL_CHANGED','TRIPO_NOT_READY_DURING_MATCH','TRIPO_MODEL_HIDDEN','PROCEDURAL_FALLBACK_VISIBLE',
  'ROOT_XZ_DRIFT','NONFINITE_RIG_TRANSFORM','BONE_SCALE_OUT_OF_RANGE','INVALID_BOSS_MATERIAL','EMPTY_TRIPO_MODEL',
  'ARMAMENT_NOT_READY','ARMAMENT_FALLBACK_ACTIVE','ORB_OR_HALO_HIDDEN','HALO_FOLLOW_DRIFT','HALO_HEIGHT_INVALID','ORB_HAND_DISTANCE_INVALID',
  'BOSS_OUT_OF_CAMERA','CAMERA_POSITION_JUMP','INTRO_FRAMEBUFFER_CHANGED','INTRO_ANIMATION_MISSING',
  'CONTROLS_HIDDEN_AFTER_INTRO','HUD_ELEMENT_OFFSCREEN','PLAYER_INPUT_NOT_MOVING','FRAME_STALL','SUSTAINED_LOW_FPS',
  'EMPTY_WEBGL_FRAME','SNAPSHOT_STREAM_STALLED','BOSS_ANIMATION_STUCK','BOSS_TELEGRAPH_VFX_MISSING'
]) if (!html.includes(`'${code}'`)) throw new Error(`Historical defect check missing: ${code}`);

for (const fragment of [
  "const DB_NAME='princess-rescue-runtime-qa'",
  "schema:'princess-rescue-black-box/v1'",
  'maxEvents:800,maxSamples:480,maxScreenshots:18',
  'function scheduleCapture(',
  'function afterRender(',
  "shot.out.toBlob",
  "'image/jpeg',.72",
  'function persist()',
  'indexedDB.open(DB_NAME,1)',
  'function download()',
  'privacy:{sessionToken:',
  'PRIVATE_KEY.test(key)',
  'ctx.drawImage(canvas,0,0,width,height)',
  'FRAME ${telemetry.frame.emaMs',
  'link.download=`princess_rescue_v${recorder.version}_bug_report_'
]) if (!recorderSource.includes(fragment)) throw new Error(`Black-box recorder feature missing: ${fragment}`);

if (/preserveDrawingBuffer\s*:\s*true/.test(html)) throw new Error('Recorder enabled preserveDrawingBuffer and would reduce mobile performance');
if (/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket)\s*\(/.test(recorderSource)) throw new Error('Black-box recorder sends data off-device');

const frameStart = html.indexOf('function frame(now)');
const frameEnd = html.indexOf('\nrequestAnimationFrame(frame);', frameStart);
const frameSource = html.slice(frameStart, frameEnd);
const renderAt = frameSource.indexOf('renderer.render(scene,camera)');
const tickAt = frameSource.indexOf('updateRuntimeBlackBox(now,wallDt)');
const captureAt = frameSource.indexOf('bugRecorder?.afterRender?.(renderer.domElement');
const resolutionAt = frameSource.indexOf('updateDynamicResolution(rawDt,now)');
if (!(renderAt >= 0 && renderAt < tickAt && tickAt < captureAt && captureAt < resolutionAt)) throw new Error('Screenshot is not captured immediately after render and before resolution changes');

const context = {
  window:null,performance:{now:()=>1000},navigator:{userAgent:'QA',platform:'test',language:'vi',hardwareConcurrency:8,deviceMemory:8},
  innerWidth:1280,innerHeight:720,devicePixelRatio:1,screen:{width:1280,height:720,orientation:{type:'landscape-primary'}},
  document:{getElementById:()=>null,createElement:()=>({})},console:{error:()=>{},warn:()=>{}},
  setTimeout:()=>1,clearTimeout:()=>{},Date,Math,JSON,Object,Array,String,Number,Boolean,Error,RegExp
};
context.window=context;
vm.runInNewContext(recorderSource, context, { filename:'runtime-black-box-runtime.js' });
const box=context.PrincessBlackBox;
box.version='test';
box.record('info','PRIVACY_TEST',{sessionToken:'secret-token',roomCode:'ABC123',safe:'kept'},{capture:false});
for(let index=0;index<520;index++)box.sample({index});
const report=box.buildReport(),privacyEvent=report.events.find(event=>event.code==='PRIVACY_TEST');
if(privacyEvent.detail.sessionToken!=='[redacted]'||privacyEvent.detail.roomCode!=='[redacted]'||privacyEvent.detail.safe!=='kept')throw new Error('Report privacy redaction failed');
if(report.samples.length!==480)throw new Error(`Sample ring buffer is not bounded: ${report.samples.length}`);
box.check('THRESHOLD_TEST',true,{threshold:2,level:'info',capture:false});
if(box.events.some(event=>event.code==='THRESHOLD_TEST'))throw new Error('Threshold check fired too early');
box.check('THRESHOLD_TEST',true,{threshold:2,level:'info',capture:false});
if(!box.events.some(event=>event.code==='THRESHOLD_TEST'))throw new Error('Threshold check did not fire');

console.log('V10.17.2 BLACK BOX PASS · 120s bounded telemetry · 28 historical defect checks · automatic JPEG screenshots · IndexedDB recovery · one-tap JSON report · session/room privacy · no off-device upload');
