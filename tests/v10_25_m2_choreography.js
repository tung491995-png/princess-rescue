'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const V1025=require('../lib/v10_25_combat');

const root=path.resolve(__dirname,'..');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');

function extractFunction(source,name){
  const marker=`function ${name}(`,start=source.indexOf(marker);
  assert(start>=0,`Missing function ${name}`);
  const paramsStart=start+marker.length-1;
  let parenDepth=0,paramEnd=-1,paramQuote='',paramEscaped=false;
  for(let i=paramsStart;i<source.length;i++){
    const char=source[i];
    if(paramQuote){if(paramEscaped){paramEscaped=false;continue}if(char==='\\'){paramEscaped=true;continue}if(char===paramQuote)paramQuote='';continue}
    if(char==='\''||char==='"'||char==='`'){paramQuote=char;continue}
    if(char==='(')parenDepth++;
    else if(char===')'&&--parenDepth===0){paramEnd=i;break}
  }
  assert(paramEnd>=0,`Unterminated parameters for ${name}`);
  const bodyStart=source.indexOf('{',paramEnd+1);
  let depth=0,quote='',escaped=false,lineComment=false,blockComment=false;
  for(let i=bodyStart;i<source.length;i++){
    const char=source[i],next=source[i+1];
    if(lineComment){if(char==='\n')lineComment=false;continue}
    if(blockComment){if(char==='*'&&next==='/'){blockComment=false;i++}continue}
    if(quote){if(escaped){escaped=false;continue}if(char==='\\'){escaped=true;continue}if(char===quote)quote='';continue}
    if(char==='/'&&next==='/'){lineComment=true;i++;continue}
    if(char==='/'&&next==='*'){blockComment=true;i++;continue}
    if(char==='\''||char==='"'||char==='`'){quote=char;continue}
    if(char==='{')depth++;
    else if(char==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`Unterminated function ${name}`);
}

for(const [index,match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()){
  if(match[1].trim())new vm.Script(match[1],{filename:`inline-${index}.js`});
}

const strafe=V1025.ACTIONS.strafe_cast;
assert(strafe.upperBody&&strafe.lowerAnimation==='dodge_left','Strafe Cast is not an upper/lower-body action');
assert(strafe.trajectory?.side===-1&&strafe.trajectory.distance>2,'Strafe Cast has no authoritative lateral trajectory');
const floating=V1025.ACTIONS.floating_cast;
assert(floating.animation==='heavy_cast'&&floating.lowerAnimation==='floating'&&floating.lowerLoop,'Floating Cast is not Heavy Cast over floating locomotion');

const falseOpening=V1025.COMBO_GRAPHS.find(combo=>combo.id==='false_opening');
assert(falseOpening,'False Opening graph is missing');
const aggressiveBranch=V1025.resolveNextNode(falseOpening,falseOpening.nodes.heavy,{distance:4,memory:{playerAggression:.8}});
assert.deepStrictEqual(aggressiveBranch,{next:'cancel',branch:'aggressive'},'Aggressive player did not select the controlled cancel branch');
const releaseBranch=V1025.resolveNextNode(falseOpening,falseOpening.nodes.heavy,{distance:4,memory:{playerAggression:.1}});
assert.deepStrictEqual(releaseBranch,{next:'release',branch:'default'},'Readable release branch regressed');

let graphSkillOptions=null;
const graphContext={
  V1025,Date,
  bossCombatContext:()=>({distance:4,phase:2,memory:{playerAggression:.8}}),
  broadcast:()=>{},finishBossCombo:()=>{},bossSkill:(_room,options)=>{graphSkillOptions=options}
};
vm.createContext(graphContext);
vm.runInContext(`${extractFunction(server,'advanceBossCombo')}\nglobalThis.advanceBossCombo=advanceBossCombo;`,graphContext);
const graphRoom={state:{activeCast:null,activeCombo:{id:'false-opening-1',comboId:'false_opening',name:'FALSE OPENING',tier:'signature',nodes:falseOpening.nodes,currentNode:'heavy',step:0,total:4,visited:[],selectedBranch:'',nextAt:0,steps:[]},boss:{evade:null,staggerUntil:0,selectedBranch:'',aiMemory:{}}}};
assert(graphContext.advanceBossCombo(graphRoom,1000),'False Opening graph did not advance');
assert(graphSkillOptions?.feintCancel===true&&graphSkillOptions.nextActionId==='teleport_behind','Selected cancel branch was not passed into authoritative cast scheduling');

const events=[],scheduled=[],hazards=[];
const skillContext={
  V1025,V1025_HIT_STOP_MS:{quick:32,normal:54,heavy:88,critical:120},
  livingBossTarget:s=>s.players.hero,
  setBossOrbState:(room,state,until,extra={})=>{room.state.boss.orb={...(room.state.boss.orb||{}),state,until,...extra}},
  setBossHaloState:(room,state,until)=>{room.state.boss.halo={state,until}},
  startBossTrajectory:(_room,action,_role,now)=>({actionId:action.id,startAt:now,endAt:now+action.trajectory.durationMs,curve:action.trajectory.curve}),
  broadcast:(_room,event)=>events.push(event),castDialogue:()=>{},markDirty:()=>{},spawnOneEyeMob:()=>{},
  scheduleTask:(_room,delay,type,data)=>scheduled.push({delay,type,data}),
  addArenaHazard:(_room,type,data)=>{hazards.push({type,...data});return hazards.at(-1)},
  Date,Math,Number
};
vm.createContext(skillContext);
vm.runInContext(`${extractFunction(server,'bossSkill')}\nglobalThis.bossSkill=bossSkill;`,skillContext);

function makeSkillRoom(){
  return{state:{
    nextCast:1,tasks:[],arenaHazards:[],summons:[],
    players:{hero:{role:'hero',x:3,z:2,rot:0,down:false},princess:{role:'princess',x:-3,z:2,rot:0,down:false}},
    boss:{x:0,y:0,z:0,phase:2,orb:{state:'ORBIT',cooldownUntil:0},halo:{state:'IDLE'},aiMemory:{},currentAction:'combat_idle',sourceAnimation:'combat_idle',supportCue:'IDLE'}
  }};
}

events.length=0;scheduled.length=0;hazards.length=0;
let room=makeSkillRoom(),combo={id:'false-opening-1',comboId:'false_opening',name:'FALSE OPENING',tier:'signature',steps:[{action:'delayed_heavy'}],total:4};
skillContext.bossSkill(room,{skill:1,actionId:'delayed_heavy',combo,comboStep:0,chain:true,feintCancel:true,nextActionId:'teleport_behind'});
const feintCast=room.state.activeCast;
assert(feintCast.feint&&feintCast.startAt<feintCast.feintCancelAt&&feintCast.feintCancelAt<feintCast.impactAt,'False Opening cancel is not inside heavy anticipation');
assert.strictEqual(scheduled[0]?.type,'v1025_feint_cancel','Feint cancellation is not scheduled before its damaging task');
assert(scheduled.some(task=>task.type==='boss_orb_radial'&&task.delay>scheduled[0].delay),'Heavy impact task is not positioned after the cancel');
assert(hazards.length===1&&hazards[0].castId===feintCast.id,'False Opening telegraph is not cast-scoped for cleanup');
assert(events.some(event=>event.e==='bossFakeOpening'&&event.p.castId===feintCast.id),'False Opening does not broadcast its readable cancel window');

events.length=0;scheduled.length=0;hazards.length=0;
room=makeSkillRoom();
skillContext.bossSkill(room,{skill:3,actionId:'teleport_above',combo,comboStep:1,chain:true});
const teleportCast=room.state.activeCast,teleportTask=scheduled.find(task=>task.type==='v1025_teleport');
assert.strictEqual(teleportCast.teleportAt,teleportCast.startAt+V1025.ACTIONS.teleport_above.startupMs,'Logical teleportAt is not server-authored from startup');
assert(teleportTask&&teleportTask.data.teleportAt===teleportCast.teleportAt&&teleportTask.delay===V1025.ACTIONS.teleport_above.startupMs,'Teleport task and cast do not share one timestamp');

events.length=0;scheduled.length=0;hazards.length=0;
room=makeSkillRoom();
skillContext.bossSkill(room,{skill:0,actionId:'strafe_cast',combo,comboStep:2,chain:true});
const strafeCast=room.state.activeCast;
assert(strafeCast.upperBody&&strafeCast.lowerAnimation==='dodge_left','Moving cast did not replicate its lower-body animation');
assert(strafeCast.movementStartAt===strafeCast.startAt&&strafeCast.movementEndAt-strafeCast.movementStartAt===strafe.trajectory.durationMs,'Moving cast did not replicate its authoritative movement interval');

const cancelEvents=[];
const cancelContext={
  Date,Number,
  setBossOrbState:(target,state,until)=>{target.state.boss.orb={state,until}},
  setBossHaloState:(target,state,until)=>{target.state.boss.halo={state,until}},
  broadcast:(_room,event)=>cancelEvents.push(event),markDirty:()=>{}
};
vm.createContext(cancelContext);
vm.runInContext(`${extractFunction(server,'cancelBossFeint')}\nglobalThis.cancelBossFeint=cancelBossFeint;`,cancelContext);
const cancelRoom={state:{
  activeCast:{id:8,actionId:'delayed_heavy',feint:true,feintCancelAt:1700},
  activeCombo:{id:'false-opening-1',nextAt:2400},
  tasks:[{id:1,type:'boss_orb_radial',data:{castId:8}},{id:2,type:'boss_orb_volley',data:{castId:99}}],
  arenaHazards:[{id:1,castId:8},{id:2,castId:99}],projectiles:[{id:1,castId:8},{id:2,castId:99}],
  boss:{trajectory:{id:'old'},orb:{},halo:{}}
}};
assert(cancelContext.cancelBossFeint(cancelRoom,{castId:8,comboId:'false-opening-1',nextActionId:'teleport_behind'},1700),'Due False Opening did not cancel');
assert.strictEqual(cancelRoom.state.activeCast,null,'Cancelled heavy cast remained active');
assert.deepStrictEqual(cancelRoom.state.tasks.map(task=>task.data.castId),[99],'Cancelled cast tasks were not purged by cast id');
assert.deepStrictEqual(cancelRoom.state.arenaHazards.map(hazard=>hazard.castId),[99],'Cancelled cast telegraph was not purged by cast id');
assert.deepStrictEqual(cancelRoom.state.projectiles.map(projectile=>projectile.castId),[99],'Cancelled cast projectiles were not purged by cast id');
assert.strictEqual(cancelRoom.state.activeCombo.nextAt,1700,'Cancel did not release the combo into its teleport step');
assert(cancelEvents.some(event=>event.e==='bossFeintCancel'&&event.p.nextActionId==='teleport_behind'),'Cancel event lost its transition action');

const motionEvents=[];
const motionContext={
  Math,Number,
  livingBossTarget:(state,role)=>state.players[role||'hero'],
  clampBossToArena:(x,z)=>({x,z}),
  broadcast:(_room,event)=>motionEvents.push(event)
};
vm.createContext(motionContext);
for(const name of ['trajectoryEase','startBossTrajectory','updateBossTrajectory','v1025Teleport'])vm.runInContext(extractFunction(server,name),motionContext);
const motionRoom={state:{
  players:{hero:{role:'hero',x:0,z:5,rot:0,down:false}},
  boss:{x:0,y:0,z:0,aiMemory:{}}
}};
motionContext.v1025Teleport(motionRoom,V1025.ACTIONS.teleport_above,'hero',{castId:17,teleportAt:2000});
assert.strictEqual(motionRoom.state.boss.y,2.6,'Teleport Above did not create authoritative altitude');
const teleportEvent=motionEvents.find(event=>event.e==='bossTeleport');
assert(teleportEvent&&teleportEvent.p.castId===17&&teleportEvent.p.teleportAt===2000&&teleportEvent.p.y===2.6,'Teleport event lost cast/timing/altitude authority');
const slamTrajectory=motionContext.startBossTrajectory(motionRoom,V1025.ACTIONS.aerial_slam,'hero',2200);
assert(slamTrajectory.fromY===2.6&&slamTrajectory.toY===0,'Aerial Slam trajectory does not descend from Teleport Above');
assert.strictEqual(slamTrajectory.endAt,2200+V1025.ACTIONS.aerial_slam.impactMs,'Aerial Slam descent does not land on its authoritative impact');
motionContext.updateBossTrajectory(motionRoom,slamTrajectory.endAt);
assert.strictEqual(motionRoom.state.boss.y,0,'Aerial Slam did not land at authoritative ground height');

function fakeAction(duration){
  return{enabled:false,paused:false,time:0,speed:0,loop:null,repetitions:0,clampWhenFinished:false,
    getClip(){return{duration}},getEffectiveTimeScale(){return this.speed},reset(){this.time=0;return this},
    setLoop(loop,repetitions){this.loop=loop;this.repetitions=repetitions;return this},setEffectiveTimeScale(value){this.speed=value;return this},
    setEffectiveWeight(){return this},fadeIn(){return this},fadeOut(){return this},play(){return this},stop(){return this}};
}
let clientNow=1450;
const upper=fakeAction(2.1),strafeLower=fakeAction(1.8),idleLower=fakeAction(2),clientRec={
  active:null,activeState:'',finishedHandler:null,layerActions:null,
  actions:{v1025_upper_quick_cast_a:upper,v1025_lower_dodge_left:strafeLower,v1025_lower_combat_idle:idleLower},
  mixer:{update(){},addEventListener(){},removeEventListener(){}}
};
const clientContext={
  Number,Math,clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),serverNow:()=>clientNow,
  rigRuntime:{records:{boss:clientRec}},bossCastVisual:{cast:null},bossRestAnimationState:()=> 'boss_combat_idle',playRigAnimation:()=>true,
  v1025AnimationLibrary:{stateFor:(id,_variant,layer)=>layer==='upper'?`v1025_upper_${id}`:`v1025_${id}`},
  THREE:{LoopRepeat:'repeat',LoopOnce:'once'},setTimeout,clearTimeout
};
vm.createContext(clientContext);
for(const name of ['stopV1025Layers','v1025AuthoritativeActionTiming','playV1025LayeredAction'])vm.runInContext(extractFunction(html,name),clientContext);
const movingCast={logicalAnimation:'quick_cast_a',lowerAnimation:'dodge_left',upperBody:true,startAt:1000,endAt:2050,movementStartAt:1000,movementEndAt:1900};
assert(clientContext.playV1025LayeredAction(movingCast,'quick_cast_a',.075,1,clientNow),'Moving cast failed to create its layers');
assert(clientRec.layerActions.lower===strafeLower&&clientRec.layerActions.moving,'Moving cast used idle legs instead of strafe locomotion');
assert.strictEqual(strafeLower.loop,'once','Finite strafe trajectory did not use a finite lower-body action');
assert.strictEqual(strafeLower.clampWhenFinished,true,'Finite strafe lower body does not settle at movement end');
assert(Math.abs(strafeLower.speed-2)<1e-9&&Math.abs(strafeLower.time-.9)<1e-9,'Strafe lower body is not fitted/sought to its movement interval');

assert(html.includes("if(e==='bossFeintCancel')"),'Client has no False Opening cancel handler');
assert(html.includes('boss.position.y=lerp(Number(sa.boss.y)||0,Number(sb.boss.y)||0,t)+.1'),'Client does not interpolate authoritative boss altitude');
assert((html.match(/rec\.layerActions\?\.lower!==preferredLower/g)||[]).length>=2,'Late-loaded moving lower body cannot repair the active layered cast');
assert(server.includes("const feintCancel=combo.comboId==='false_opening'&&nodeId==='heavy'&&branch.next==='cancel';"),'False Opening graph does not wire its selected cancel branch into the cast');

console.log('V10.25 M2 CHOREOGRAPHY PASS · real False Opening cancel · timestamped 3D teleports · authoritative strafe/floating layers');
