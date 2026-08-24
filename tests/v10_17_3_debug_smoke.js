const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const recorderSource=fs.readFileSync(path.join(root,'public','runtime-black-box.js'),'utf8');

new vm.Script(recorderSource,{filename:'runtime-black-box.js'});
for(const [index,match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()){
  if(match[1].trim())new vm.Script(match[1],{filename:`inline-${index}.js`});
}

for(const fragment of [
  '<title>Princess Rescue V10.17.9.1 — Desktop 1K Startup</title>',
  'TẢI DEBUG ZIP','JPG riêng · 1280px','🧪 CHECK 19 ANIMATION',
  "window.PrincessBlackBox?.init?.({version:'10.17.9.1'",
  'function runtimeBlackBoxTelemetry(','entities:{','hero:state?.players?.hero','princess:state?.players?.princess',
  "'INTRO_FRAMEBUFFER_CHANGED'","'INTRO_ANIMATION_MISSING'","'BOSS_OUT_OF_CAMERA'","'ROOT_XZ_DRIFT'",
  "'TRIPO_MODEL_HIDDEN'","'PLAYER_INPUT_NOT_MOVING'","'BOSS_TELEGRAPH_VFX_MISSING'","'HUD_ELEMENT_OFFSCREEN'",
  '3-hit sword combo','TẠO PHÒNG — HERO','VÀO PHÒNG — PRINCESS'
])if(!html.includes(fragment))throw new Error(`Current-area smoke fragment missing: ${fragment}`);

for(const fragment of [
  'const outlineRoot=rec?.visualAccepted&&rec.model?rec.model:boss;',
  'if(rec?.visualAccepted&&rec.model)setFallback(boss,false,rec.model);',
  '!bossIntroActive()&&!br.activeSegment&&/^boss_(quick_cast|aoe|teleport|spin_kick|ultimate)$/.test',
  "const authorizedCameraReframe=bossCastVisual.cast?.i===3||/^boss_(teleport|spin_kick)$/.test",
  'coneExpected=!cast.teleportAt||serverTime<cast.teleportAt',
  'cone:!!bossTelegraphCone?.visible,coneExpected'
])if(!html.includes(fragment))throw new Error(`V10.17.7 visual guard missing: ${fragment}`);

const hideStart=html.indexOf('function hideBossCastVisual(){');
const hideEnd=html.indexOf('\nfunction retriggerClass(',hideStart);
if(hideStart<0||hideEnd<0)throw new Error('Boss cast cleanup function is missing');
let cleanupTransitions=0,introActive=true;
const cleanupContext={
  rigRuntime:{records:{boss:{ready:true,activeState:'boss_ultimate',activeSegment:{state:'boss_ultimate'},active:{paused:true}}}},
  bossIntroActive:()=>introActive,
  bossV10Phase:1,
  playRigAnimation:()=>{cleanupTransitions++},
  bossCastVisual:{cast:null},
  clearBossSkillUi(){},bossTelegraphRing:null,bossTelegraphRing2:null,bossTelegraphMoon:null,bossTelegraphCone:null,bossTelegraphRune:null,bossMoonCracks3D:null,
  $:()=>({style:{},classList:{remove(){}}}),setVignette(){}
};
vm.runInNewContext(html.slice(hideStart,hideEnd),cleanupContext,{filename:'boss-cast-cleanup.js'});
cleanupContext.hideBossCastVisual();
if(cleanupTransitions!==0)throw new Error('Intro finale was cancelled by combat cleanup');
introActive=false;cleanupContext.rigRuntime.records.boss.activeSegment=null;cleanupContext.hideBossCastVisual();
if(cleanupTransitions!==1)throw new Error('Finished combat cast did not return to combat idle');

const outlineStart=html.indexOf('function setBossOutlineVisible(v){');
const outlineEnd=html.indexOf('\nfunction updateHeavyCombatMode(',outlineStart);
if(outlineStart<0||outlineEnd<0)throw new Error('Boss outline guard function is missing');
const placeholderOutline={userData:{isOutline:true},visible:false},tripoOutline={userData:{isOutline:true},visible:false};
let fallbackHidden=false;
const outlineContext={
  bossOutlineVisible:false,
  boss:{traverse(fn){fn(placeholderOutline)}},
  rigRuntime:{records:{boss:{visualAccepted:true,model:{traverse(fn){fn(tripoOutline)}}}}},
  setFallback(_boss,visible){fallbackHidden=visible===false}
};
vm.runInNewContext(html.slice(outlineStart,outlineEnd),outlineContext,{filename:'boss-outline-guard.js'});
outlineContext.setBossOutlineVisible(true);
if(placeholderOutline.visible)throw new Error('Procedural boss outline was re-enabled');
if(!tripoOutline.visible||!fallbackHidden)throw new Error('Tripo outline guard did not preserve the accepted model');

const armamentStart=html.indexOf('function bossArmamentPlayerDistanceSq(');
const armamentEnd=html.indexOf('\nfunction updateBossArmament(',armamentStart);
if(armamentStart<0||armamentEnd<0)throw new Error('Armament distance helper is missing');
const armamentContext={Number};
vm.runInNewContext(html.slice(armamentStart,armamentEnd),armamentContext,{filename:'armament-distance-helper.js'});
if(armamentContext.bossArmamentPlayerDistanceSq({x:3,z:4},{x:0,z:0})!==25)throw new Error('Armament distance helper returned the wrong distance');
if(armamentContext.bossArmamentPlayerDistanceSq({x:'bad',z:4},{x:0,z:0})!==Infinity)throw new Error('Armament distance helper did not reject invalid coordinates');
const armamentUpdate=html.slice(armamentEnd,html.indexOf('\nfunction ',armamentEnd+10));
if(/\bd2\s*\(/.test(armamentUpdate))throw new Error('Undefined d2 helper remains in armament runtime');
if(!armamentUpdate.includes('bossArmamentPlayerDistanceSq(a,boss.position)'))throw new Error('Armament target sorting does not use the guarded helper');

if(html.includes('const screenshotClips='))throw new Error('Successful clip audit still schedules screenshots');
if(html.includes('AUDIT_VFX_SKILL_'))throw new Error('Successful VFX audit still schedules screenshots');

for(const fragment of [
  'const DB_VERSION=2',"const DB_SCREENSHOTS='screenshotFiles'",'maxScreenshots:20','const maxWidth=1280',
  "},'image/jpeg',.75)","schema:'princess-rescue-black-box/v2'",'format:\'separate-files\'',
  "filePath=`screenshots/${recorder.runId}/${filename}`",'filename,path:filePath','timestamp:new Date(at).toISOString()',
  'gameState:redact(','camera:redact(','entityTransforms:redact(','event:redact(',
  'function createZip(','DEBUG_BUNDLE_EXPORTED','debug_bundle_${stamp}.zip'
])if(!recorderSource.includes(fragment))throw new Error(`Separate screenshot feature missing: ${fragment}`);

for(const forbidden of ['FileReader','readAsDataURL','toDataURL','dataUrl',';base64,']){
  if(recorderSource.includes(forbidden))throw new Error(`Legacy embedded screenshot path remains: ${forbidden}`);
}
if(/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket)\s*\(/.test(recorderSource))throw new Error('Recorder sends debug data off-device');
if(/preserveDrawingBuffer\s*:\s*true/.test(html))throw new Error('Recorder enabled preserveDrawingBuffer');

const mockCtx={fillStyle:'',font:'',textBaseline:'',fillRect(){},drawImage(){},fillText(){}};
let encoded={type:null,quality:null};
const outputCanvas={width:0,height:0,getContext:()=>mockCtx,toBlob:(callback,type,quality)=>{encoded={type,quality};callback(new Blob([new Uint8Array([1,2,3,4])],{type}))}};
const document={
  getElementById:()=>null,
  createElement:tag=>tag==='canvas'?outputCanvas:{click(){},remove(){},classList:{add(){},toggle(){}}},
  body:{appendChild(){}}
};
const context={
  window:null,performance:{now:()=>1000},navigator:{userAgent:'QA',platform:'test',language:'vi',hardwareConcurrency:8,deviceMemory:8},
  innerWidth:1920,innerHeight:1080,devicePixelRatio:1,screen:{width:1920,height:1080,orientation:{type:'landscape-primary'}},
  document,console:{error(){},warn(){}},setTimeout:()=>1,clearTimeout(){},Date,Math,JSON,Object,Array,String,Number,Boolean,Error,RegExp,
  Map,Set,Promise,Blob,TextEncoder,Uint8Array,DataView,ArrayBuffer,URL:{createObjectURL:()=>'',revokeObjectURL(){} }
};
context.window=context;
vm.runInNewContext(recorderSource,context,{filename:'runtime-black-box-runtime.js'});
const box=context.PrincessBlackBox;

box.milestone('INTRO_ESTABLISH',{progress:.12},{force:true});
if(box.pendingCapture)throw new Error('Milestone created a screenshot request');
box.record('info','BOSS_CAST_STARTED',{skill:1},{capture:false});
if(box.pendingCapture)throw new Error('Normal event created a screenshot request');
box.check('SNAPSHOT_STREAM_STALLED',true,{threshold:1,level:'warning'});
if(box.pendingCapture)throw new Error('Non-visual runtime anomaly created a screenshot request');
box.check('BOSS_OUT_OF_CAMERA',true,{threshold:1,detail:{screen:'outside'}});
if(!box.pendingCapture)throw new Error('Visual anomaly did not request a screenshot');

box.afterRender({width:1920,height:1080},{
  game:{running:true,intro:false,role:'hero'},camera:{position:{x:0,y:8,z:14}},
  entities:{hero:{position:{x:-2,y:0,z:2}},princess:{position:{x:2,y:0,z:2}},boss:{renderPosition:{x:0,y:0,z:-4.7}}},
  frame:{emaMs:16.7,renderScale:1,calls:4},boss:{activeState:'boss_combat_idle',rootResidual:0},armament:{orbHandDistance:.52,haloTargetResidual:.01}
});

(async()=>{
  await new Promise(resolve=>setImmediate(resolve));
  const report=box.buildReport(),json=JSON.stringify(report);
  if(report.screenshots.length!==1)throw new Error(`Expected one anomaly screenshot, got ${report.screenshots.length}`);
  const shot=report.screenshots[0];
  if(shot.width!==1280||shot.height!==720)throw new Error(`Screenshot resize is wrong: ${shot.width}x${shot.height}`);
  if(encoded.type!=='image/jpeg'||encoded.quality!==.75)throw new Error(`JPEG encoding is wrong: ${encoded.type} ${encoded.quality}`);
  if(!shot.filename.endsWith('.jpg')||!shot.path.startsWith('screenshots/')||!shot.timestamp)throw new Error('Screenshot file metadata is incomplete');
  if(!shot.gameState||!shot.camera||!shot.entityTransforms||!shot.event)throw new Error('Screenshot diagnostic metadata is incomplete');
  if('dataUrl' in shot||/data:image|base64/i.test(json))throw new Error('JSON still embeds screenshot bytes');
  if(report.attachments.maxPerRun!==20||report.attachments.format!=='separate-files')throw new Error('Attachment policy is wrong');

  const zip=await box.createZip([{name:'debug_log.json',data:'{"ok":true}'},{name:shot.path,data:new Blob([new Uint8Array([1,2,3])],{type:'image/jpeg'})}]);
  const bytes=new Uint8Array(await zip.arrayBuffer()),text=Buffer.from(bytes).toString('latin1');
  if(bytes[0]!==0x50||bytes[1]!==0x4b||!text.includes('debug_log.json')||!text.includes(shot.path))throw new Error('ZIP does not contain separate log and image entries');

  console.log('V10.17.9.1 SHORT SMOKE PASS · intro finale · Tripo outline guard · teleport telegraph/camera · armament runtime · combat/UI · separate JPG files');
})().catch(error=>{console.error(error);process.exitCode=1});
