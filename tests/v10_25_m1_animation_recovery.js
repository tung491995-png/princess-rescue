'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const near=(actual,expected,message)=>assert(Math.abs(actual-expected)<1e-9,`${message}: expected ${expected}, found ${actual}`);

function extractFunction(name){
  const marker=`function ${name}(`,start=html.indexOf(marker);
  assert(start>=0,`Missing browser function ${name}`);
  const paramsStart=start+marker.length-1;
  let parenDepth=0,paramEnd=-1,paramQuote='',paramEscaped=false;
  for(let i=paramsStart;i<html.length;i++){
    const char=html[i];
    if(paramQuote){if(paramEscaped){paramEscaped=false;continue}if(char==='\\'){paramEscaped=true;continue}if(char===paramQuote)paramQuote='';continue}
    if(char==='\''||char==='"'||char==='`'){paramQuote=char;continue}
    if(char==='(')parenDepth++;
    else if(char===')'&&--parenDepth===0){paramEnd=i;break}
  }
  assert(paramEnd>=0,`Unterminated browser parameters for ${name}`);
  const bodyStart=html.indexOf('{',paramEnd+1);
  let depth=0,quote='',escaped=false,lineComment=false,blockComment=false;
  for(let i=bodyStart;i<html.length;i++){
    const char=html[i],next=html[i+1];
    if(lineComment){if(char==='\n')lineComment=false;continue}
    if(blockComment){if(char==='*'&&next==='/'){blockComment=false;i++}continue}
    if(quote){if(escaped){escaped=false;continue}if(char==='\\'){escaped=true;continue}if(char===quote)quote='';continue}
    if(char==='/'&&next==='/'){lineComment=true;i++;continue}
    if(char==='/'&&next==='*'){blockComment=true;i++;continue}
    if(char==='\''||char==='"'||char==='`'){quote=char;continue}
    if(char==='{')depth++;
    else if(char==='}'&&--depth===0)return html.slice(start,i+1);
  }
  throw new Error(`Unterminated browser function ${name}`);
}

for(const [index,match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()){
  if(match[1].trim())new vm.Script(match[1],{filename:`inline-${index}.js`});
}

const historicalSentinel='!bossIntroActive()&&!br.activeSegment&&!bossComboRuntime.id&&serverNow()>=bossStaggerUntil&&/^boss_(quick_cast|aoe|teleport|spin_kick|ultimate)$/.test';
assert(html.includes(historicalSentinel),'Historical V10.23.1 animation watchdog sentinel changed');
assert(html.includes('const durationMs=endAt-startAt,progress=clamp((now-startAt)/durationMs,0,1);'),'Authoritative cast progress is not derived from startAt/endAt');
assert(html.includes('speed:clipDuration*1000/durationMs'),'Logical clip duration is not fitted to the authoritative action duration');
assert(html.includes('rec.active.time=timing.seekTime'),'Full-body logical playback does not seek on receipt');
assert(html.includes('upper.time=timing.seekTime'),'Layered logical playback does not seek on receipt');
assert(html.includes('if(!canRecover||v1025LogicalCastVisuallyActive(cast))return false;'),'Snapshot recovery is missing its no-replay guard');
assert(html.includes('if(refitV1025LogicalPlayback(cast,now))return true;'),'Shifted authoritative timelines do not use the in-place refit path');
assert(html.includes('if(!rec?.active||!c||c.actionId)return;'),'Legacy acting curves can still overwrite logical action timing');
assert(html.includes('setBossCast(c,{recovered:true});recoverV1025LogicalCastPlayback();'),'Snapshot casts are not marked as recovered');
assert(html.includes("if(e==='bossUltimateInterrupted')clearV1025LogicalCastPresentation();"),'Ultimate interruption does not clear logical presentation');
assert(html.includes("if(e==='bossComboInterrupted'){clearV1025LogicalCastPresentation();"),'Combo interruption does not clear logical presentation');
assert((html.match(/recoverV1025LogicalCastPlayback\(\);/g)||[]).length>=3,'Late rig/library recovery hooks are missing');
assert(html.includes("else{const ap=bossCastAnimProfile(p.i);playRigAnimation('boss',ap.state"),'Legacy cast fallback path was removed');

const timingContext={clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),serverNow:()=>1600};
vm.createContext(timingContext);
vm.runInContext(extractFunction('v1025AuthoritativeActionTiming'),timingContext);
const timing=timingContext.v1025AuthoritativeActionTiming({getClip:()=>({duration:2.4})},{startAt:1000,endAt:2200},.98);
assert(timing.valid,'Valid authoritative timing was rejected');
near(timing.progress,.5,'Authoritative progress mismatch');
near(timing.seekTime,1.2,'Authoritative seek mismatch');
near(timing.speed,2,'Authoritative duration-fit speed mismatch');
const malformed=timingContext.v1025AuthoritativeActionTiming({getClip:()=>({duration:2.4})},{startAt:2200,endAt:2200},1.05);
assert(!malformed.valid&&malformed.speed===1.05&&malformed.seekTime===0,'Malformed timing did not preserve the phase-speed fallback');

function fakeAction(duration){
  return{
    enabled:false,paused:false,time:0,speed:0,weight:0,userData:{},resetCalls:0,
    getClip(){return{duration}},getEffectiveTimeScale(){return this.speed},reset(){this.resetCalls++;this.time=0;return this},setLoop(){return this},
    setEffectiveTimeScale(value){this.speed=value;return this},setEffectiveWeight(value){this.weight=value;return this},
    fadeIn(){return this},fadeOut(){return this},play(){this.played=true;return this},stop(){this.stopped=true;return this},crossFadeTo(){return this}
  };
}

let authoritativeNow=1600,introActive=false,deathActive=false,playRequests=0;
const full=fakeAction(2.4),upper=fakeAction(3),lower=fakeAction(1.8),idle=fakeAction(2);
const rec={
  ready:true,active:null,activeState:'',finishedHandler:null,layerActions:null,
  actions:{v1025_magic_cast:full,v1025_upper_magic_cast:upper,v1025_lower_combat_idle:lower,boss_idle:idle},
  mixer:{updates:[],update(value){this.updates.push(value)},addEventListener(){},removeEventListener(){}}
};
const playbackContext={
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),serverNow:()=>authoritativeNow,
  rigRuntime:{records:{boss:rec}},latestState:{boss:{phase:2}},v1025AnimationLibrary:{stateFor:(id,_variant,layer)=>layer==='upper'?`v1025_upper_${id}`:`v1025_${id}`},
  rigBossCastState:()=> 'boss_quick_cast',bossCastVisual:{cast:null},bossRestAnimationState:()=> 'boss_combat_idle',
  recoverZeroHourSlamPlayback:()=>false,
  gameInitialized:true,bossStaggerUntil:0,bossIntroActive:()=>introActive,deathCinematicActive:()=>deathActive,
  THREE:{LoopRepeat:'repeat',LoopOnce:'once'},setTimeout,clearTimeout
};
playbackContext.playRigAnimation=(role,state,options)=>{
  playRequests++;
  playbackContext.lastPlay={role,state,options};
  rec.active=rec.actions[state]||rec.actions.boss_idle;rec.activeState=state;return true;
};
vm.createContext(playbackContext);
for(const name of ['stopV1025Layers','v1025LogicalCastKey','v1025AuthoritativeActionTiming','rememberV1025LogicalPlayback','v1025LogicalCastVisuallyActive','refitV1025LogicalPlayback','recoverV1025LogicalCastPlayback','playV1025LayeredAction','v1025PlayLogicalAction'])vm.runInContext(extractFunction(name),playbackContext);

const fullCast={id:41,i:0,actionId:'moon_bolt',logicalAnimation:'magic_cast',startAt:1000,endAt:2200};
assert(playbackContext.v1025PlayLogicalAction(fullCast),'Full-body logical action did not play');
near(playbackContext.lastPlay.options.speed,2,'Full-body play request used the wrong speed');
near(full.speed,2,'Full-body action used the wrong effective speed');
near(full.time,1.2,'Full-body action was not sought to server progress');
assert(rec.v1025LogicalPlayback?.key==='41|moon_bolt','Full-body playback identity was not recorded');
assert(playbackContext.v1025LogicalCastVisuallyActive(fullCast),'Active full-body cast was not recognized');
playbackContext.bossCastVisual.cast=fullCast;
const stableRequests=playRequests,stableResets=full.resetCalls;
assert(!playbackContext.recoverV1025LogicalCastPlayback(),'An unchanged active snapshot reported a recovery');
assert(playRequests===stableRequests&&full.resetCalls===stableResets,'An unchanged active snapshot replayed the action');

authoritativeNow=1800;
const shiftedFullCast={...fullCast,startAt:1100,endAt:2500};playbackContext.bossCastVisual.cast=shiftedFullCast;
assert(playbackContext.recoverV1025LogicalCastPlayback(),'A pause-shifted same-ID cast was not re-fitted');
assert(playRequests===stableRequests&&full.resetCalls===stableResets,'A pause-shifted same-ID cast restarted instead of re-fitting in place');
near(full.speed,2.4/1.4,'Pause-shifted full-body speed mismatch');
near(full.time,1.2,'Pause-shifted full-body seek mismatch');
assert(rec.v1025LogicalPlayback.startAt===1100&&rec.v1025LogicalPlayback.endAt===2500,'Pause-shifted playback timeline was not refreshed');
assert(!playbackContext.recoverV1025LogicalCastPlayback()&&playRequests===stableRequests,'Unchanged post-refit snapshot replayed the action');

rec.active=idle;rec.activeState='boss_idle';
assert(!playbackContext.v1025LogicalCastVisuallyActive(shiftedFullCast),'Interrupted full-body cast was incorrectly treated as active');
assert(playbackContext.recoverV1025LogicalCastPlayback()&&playRequests===stableRequests+1,'Missing mid-cast playback was not restarted once');

rec.active=idle;rec.activeState='boss_idle';introActive=true;
assert(!playbackContext.recoverV1025LogicalCastPlayback()&&playRequests===stableRequests+1,'Recovery overwrote the boss intro');
introActive=false;deathActive=true;
assert(!playbackContext.recoverV1025LogicalCastPlayback()&&playRequests===stableRequests+1,'Recovery overwrote the death cinematic');
deathActive=false;playbackContext.bossStaggerUntil=authoritativeNow+200;
assert(!playbackContext.recoverV1025LogicalCastPlayback()&&playRequests===stableRequests+1,'Recovery overwrote a stagger');
playbackContext.bossStaggerUntil=0;rec.activeSegment={};
assert(!playbackContext.recoverV1025LogicalCastPlayback()&&playRequests===stableRequests+1,'Recovery overwrote an authored segment');
rec.activeSegment=null;rec.ready=false;
assert(!playbackContext.recoverV1025LogicalCastPlayback()&&playRequests===stableRequests+1,'Recovery ran before the boss rig was ready');
rec.ready=true;
assert(playbackContext.recoverV1025LogicalCastPlayback()&&playRequests===stableRequests+2,'Late rig readiness did not repair the active snapshot cast');

authoritativeNow=1750;rec.active=idle;rec.activeState='boss_idle';rec.v1025LogicalPlayback=null;
const layeredCast={id:42,i:0,actionId:'moving_cast',logicalAnimation:'magic_cast',startAt:1000,endAt:2500,upperBody:true};
assert(playbackContext.v1025PlayLogicalAction(layeredCast),'Layered logical action did not play');
near(upper.speed,2,'Layered upper action used the wrong effective speed');
near(upper.time,1.5,'Layered upper action was not sought to server progress');
assert(rec.active===upper&&rec.layerActions?.lower===lower,'Layered upper/lower actions were not preserved');
assert(playbackContext.v1025LogicalCastVisuallyActive(layeredCast),'Active layered cast was not recognized');

authoritativeNow=2600;
assert(!playbackContext.v1025PlayLogicalAction(layeredCast),'Expired logical event replayed a stale action');
authoritativeNow=900;
assert(!playbackContext.v1025PlayLogicalAction(layeredCast),'Future logical event started before authoritative startAt');

let castNow=1800,skillUiUpdates=0;
const castContext={
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),serverNow:()=>castNow,
  bossCastVisual:{cast:null,impactShown:false,kickShown:false,teleportShown:false,warningShown:false},
  clearBossSkillUi(){},setBossSkillUi(){skillUiUpdates++},eyeEls:[]
};
vm.createContext(castContext);
for(const name of ['normalizeBossCastPayload','recoveredBossCastMilestones','setBossCast'])vm.runInContext(extractFunction(name),castContext);
const recoveredCast={id:70,i:3,actionId:'blink_kick',logicalAnimation:'roundhouse',startAt:1000,warningAt:1200,teleportAt:1350,kickAt:1500,impactAt:1650,endAt:2300};
castContext.setBossCast(recoveredCast,{recovered:true});
assert(castContext.bossCastVisual.warningShown&&castContext.bossCastVisual.teleportShown&&castContext.bossCastVisual.kickShown&&castContext.bossCastVisual.impactShown,'Recovered mid-cast milestones were not seeded from server time');
const shiftedRecoveredCast={...recoveredCast,startAt:1100,warningAt:1300,teleportAt:1450,kickAt:1600,impactAt:1750,endAt:2500};
castContext.setBossCast(shiftedRecoveredCast,{recovered:true});
assert(castContext.bossCastVisual.cast.startAt===1100&&castContext.bossCastVisual.cast.endAt===2500,'Same-ID authoritative timestamps were not merged');
assert(castContext.bossCastVisual.warningShown&&castContext.bossCastVisual.impactShown,'Same-ID merge reset elapsed one-shot milestones');
assert(skillUiUpdates===2,'Same-ID cast refresh did not retain UI metadata');

let snapshotRecoveries=0,snapshotClears=0,recoveredOption=false;
const snapshotContext={
  bossCastVisual:{cast:null},rigRuntime:{records:{boss:{}}},v1025TimeDilationUntil:0,
  setBossCast(c,options){recoveredOption=options?.recovered===true;snapshotContext.bossCastVisual.cast=c?{...c}:null},
  recoverV1025LogicalCastPlayback(){snapshotRecoveries++;return true},
  clearV1025LogicalCastPresentation(){snapshotClears++;snapshotContext.bossCastVisual.cast=null}
};
vm.createContext(snapshotContext);
vm.runInContext(extractFunction('syncBossCastFromSnapshot'),snapshotContext);
const snapshotCast={id:77,actionId:'eclipse_cast',logicalAnimation:'heavy_cast',startAt:1000,endAt:2400};
snapshotContext.syncBossCastFromSnapshot(snapshotCast);
assert(recoveredOption&&snapshotRecoveries===1,'Snapshot cast did not enter the recovered-cast path');
snapshotContext.syncBossCastFromSnapshot(null);
assert(snapshotClears===1&&snapshotContext.bossCastVisual.cast===null,'Authoritative cast:null did not clear immediately');

let scaleWrites=0;
const scaleContext={
  bossV106:{rec:{active:{paused:false,setEffectiveTimeScale(){scaleWrites++}}}},serverNow:()=>1500,
  lerp:(a,b,t)=>a+(b-a)*t,v106Ease:value=>value
};
vm.createContext(scaleContext);
vm.runInContext(extractFunction('v106UpdateActionTimeScale'),scaleContext);
scaleContext.v106UpdateActionTimeScale({i:0,actionId:'logical_cast',impactAt:1800},{pre:.5,after:0});
assert(scaleWrites===0,'Legacy acting layer overwrote authoritative logical speed');
scaleContext.v106UpdateActionTimeScale({i:0,actionId:'',impactAt:1800},{pre:.5,after:0});
assert(scaleWrites===1,'Legacy cast speed curve was not preserved');

let stoppedLayers=0,clearedCast=false,vignette=null,phantomsCleared=0;
const art={classList:{remove(value){this.removed=value}}};
const clearContext={
  rigRuntime:{records:{boss:{layerActions:{},v1025LogicalPlayback:{key:'old'}}}},
  stopV1025Layers(){stoppedLayers++},setBossCast(c){clearedCast=c===null},v1025TimeDilationUntil:9999,
  v1025ZeroHourSlamPresentation:null,v1025ZeroHourArrayState:null,v1025ZeroHourOrbMeshes:[],clearZeroHourFxTimers(){},
  cameraZoomTarget:.92,$:()=>art,setVignette(value){vignette=value},v1025ImpactStack:{clearPhantoms(){phantomsCleared++}},bossStaggerUntil:4242
};
vm.createContext(clearContext);
vm.runInContext(extractFunction('clearV1025LogicalCastPresentation'),clearContext);
clearContext.clearV1025LogicalCastPresentation();
assert(stoppedLayers===1&&clearedCast&&clearContext.rigRuntime.records.boss.v1025LogicalPlayback===null,'Interruption did not clear logical cast/layers');
assert(clearContext.v1025TimeDilationUntil===0&&clearContext.cameraZoomTarget===1&&art.classList.removed==='show'&&vignette===.12,'Interruption did not reset Zero Hour presentation');
assert(phantomsCleared===1,'Interruption did not clear Zero Hour phantoms');
assert(clearContext.bossStaggerUntil===4242,'Interruption cleanup clobbered the following stagger window');

console.log('V10.25 M1 CLIENT ANIMATION RECOVERY PASS · authoritative duration-fit speed · server-time seek · layered seek · guarded snapshot/reconnect recovery');
