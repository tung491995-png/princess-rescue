const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');

for(const fragment of [
  '<title>Princess Rescue V10.23.1 — Runtime Reliability Hotfix</title>',
  'function scheduleBossIntroUiUnlock(minDelay=0)',
  'scheduleBossIntroUiUnlock(finishAt)',
  'bugRuntime.lastCamera=null',
  "if(source==='start'||source==='state-repair')playBossIntroV9()",
  'function recoverUltimateChannelMotion(rec)',
  "return playRigAnimation('boss','boss_combat_idle',{fade:.24,speed:.72})",
  "const reason=m.reason||'COOLDOWN'"
])if(!html.includes(fragment))throw new Error(`V10.17.7 client repair missing: ${fragment}`);

for(const fragment of [
  "reason:'DOWN'",
  "reason:'COOLDOWN'",
  "reason:result.reason||''"
])if(!server.includes(fragment))throw new Error(`V10.17.7 server rejection reason missing: ${fragment}`);

const unlockStart=html.indexOf('function scheduleBossIntroUiUnlock(minDelay=0){');
const unlockEnd=html.indexOf('\nfunction playBossIntroV9(',unlockStart);
let visualIntro=true,serverIntro=true,unlocks=0;
const timers=[];
const unlockContext={
  running:true,
  bossIntroActive:()=>visualIntro,
  gameplayIntroLocked:()=>serverIntro,
  lockBossIntroUI:value=>{if(value===false)unlocks++},
  setTimeout:fn=>{timers.push(fn)},
  Math
};
vm.runInNewContext(html.slice(unlockStart,unlockEnd),unlockContext,{filename:'intro-unlock.js'});
unlockContext.scheduleBossIntroUiUnlock(0);
timers.shift()();
if(unlocks!==0||timers.length!==1)throw new Error('Intro UI unlocked before both clocks were ready');
visualIntro=false;serverIntro=false;timers.shift()();
if(unlocks!==1)throw new Error('Intro UI did not unlock after both live clocks cleared');

const recoverStart=html.indexOf('function recoverUltimateChannelMotion(rec){');
const recoverEnd=html.indexOf('\n\nconst BOSS_UI_SKILLS',recoverStart);
let transitions=0,now=1000;
const recoverContext={
  bossCastVisual:{cast:{i:4,endAt:2500}},
  serverNow:()=>now,
  playRigAnimation:(role,state,opts)=>{transitions++;return role==='boss'&&state==='boss_combat_idle'&&opts.speed===.72},
  Number
};
vm.runInNewContext(html.slice(recoverStart,recoverEnd),recoverContext,{filename:'ultimate-recovery.js'});
const rec={role:'boss',activeState:'boss_ultimate',activeSegment:null,active:{time:3.53,getClip:()=>({duration:3.54})}};
if(!recoverContext.recoverUltimateChannelMotion(rec)||transitions!==1)throw new Error('Ultimate did not transition to channel motion');
rec.activeSegment={};
if(recoverContext.recoverUltimateChannelMotion(rec)||transitions!==1)throw new Error('Intro/presentation segment was altered by Ultimate recovery');

console.log('V10.17.7 DEBUG REPAIR PASS · live intro unlock · clean cinematic cut · Ultimate channel motion · cooldown reason');
