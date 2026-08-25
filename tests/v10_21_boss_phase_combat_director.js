const {spawn}=require('child_process');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const serverSource=fs.readFileSync(path.join(root,'server.js'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

for(const [index,match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()){
  if(match[1].trim())new vm.Script(match[1],{filename:`inline-${index}.js`});
}

if(pkg.version!=='10.23.0')throw new Error(`Wrong package version: ${pkg.version}`);
for(const fragment of [
  '<title>Princess Rescue V10.23 — Boss Combat Intelligence &amp; Combo Overhaul</title>',
  "window.PrincessBlackBox?.init?.({version:'10.23'",
  'id="bossExposeUi"',
  'CƠ HỘI PHẢN CÔNG',
  'function updateBossExposeUi(now=serverNow())',
  "if(e==='bossPattern')",
  "if(e==='bossExposed')",
  "p.exposed&&p.owner===role",
  'PHẢN CÔNG ×1.30'
])if(!html.includes(fragment))throw new Error(`V10.21 client feature missing: ${fragment}`);

for(const fragment of [
  'const BOSS_PHASE_THRESHOLDS = [1,.70,.35]',
  'const BOSS_EXPOSE_DAMAGE_MULTIPLIER = 1.30',
  'const BOSS_COMBAT_DIRECTOR=',
  'function chooseBossDirectorSkill(room)',
  "name:'SLEEPLESS WALTZ'",
  "name:'ETERNAL ECLIPSE'",
  "e:'bossPattern'",
  "e:'bossExposed'",
  'exposed?BOSS_EXPOSE_DAMAGE_MULTIPLIER:1',
  'function enterBossPhase(room,next,now)',
  'targetPhase=ratio>BOSS_PHASE_THRESHOLDS[1]?1:ratio>BOSS_PHASE_THRESHOLDS[2]?2:3',
  "combatFeel:'v10.23-poise-weakpoint-critical-adaptive-combo-ai'"
])if(!serverSource.includes(fragment))throw new Error(`V10.21 server feature missing: ${fragment}`);

const directorStart=serverSource.indexOf('const BOSS_COMBAT_DIRECTOR=');
const directorEnd=serverSource.indexOf('\nfunction bossSkill(',directorStart);
if(directorStart<0||directorEnd<0)throw new Error('Combat director could not be isolated');
const directorContext={TEST_BOSS_SKILL:null};
vm.runInNewContext(
  `${serverSource.slice(directorStart,directorEnd)}\nglobalThis.director=BOSS_COMBAT_DIRECTOR;globalThis.choose=chooseBossDirectorSkill;`,
  directorContext,{filename:'v10.21-director.js'}
);

const allowed={1:new Set([0,1,3]),2:new Set([0,1,2,3]),3:new Set([0,1,2,3,4])};
for(const phase of [1,2,3]){
  const room={state:{boss:{phase,patternIndex:-1,patternStep:0,lastSkill:-1,skillIndex:-1}}};
  const skills=[],patternStarts=[];
  for(let index=0;index<18;index++){
    const pick=directorContext.choose(room);skills.push(pick.skill);
    if(pick.isPatternStart)patternStarts.push(pick.pattern.id);
    if(!allowed[phase].has(pick.skill))throw new Error(`Phase ${phase} selected illegal skill ${pick.skill}`);
  }
  for(let index=1;index<skills.length;index++)if(skills[index]===skills[index-1])throw new Error(`Phase ${phase} repeated skill ${skills[index]}`);
  if(new Set(patternStarts).size!==directorContext.director[phase].patterns.length)throw new Error(`Phase ${phase} did not rotate every pattern`);
  if(phase===3&&![0,1,2,3,4].every(skill=>skills.includes(skill)))throw new Error(`Phase 3 did not use the full skill set: ${skills}`);
}

const canHitStart=serverSource.indexOf('function bossCanBeHit(');
const canHitEnd=serverSource.indexOf('\nfunction spawnPickup(',canHitStart);
const canHitContext={};
vm.runInNewContext(serverSource.slice(canHitStart,canHitEnd),canHitContext,{filename:'v10.21-boss-hit-lock.js'});
const now=Date.now();
if(canHitContext.bossCanBeHit({evadeInvUntil:now+1000,phaseLockUntil:0},now))throw new Error('Evade invulnerability was lost');
if(canHitContext.bossCanBeHit({evadeInvUntil:0,phaseLockUntil:now+1000},now))throw new Error('Phase transition invulnerability was lost');
if(!canHitContext.bossCanBeHit({evadeInvUntil:0,phaseLockUntil:0},now))throw new Error('Boss remained invulnerable outside locks');

const hitStart=serverSource.indexOf('function bossWeakPointForHit(');
const hitEnd=serverSource.indexOf('\nfunction fastForwardPlayerProjectile(',hitStart);
const hitEvents=[];
const hitContext={
  Math:Object.assign(Object.create(Math),{random:()=>1}),FOODS:[{el:'crispy'}],BOSS_EXPOSE_DAMAGE_MULTIPLIER:1.30,
  BOSS_BODY_CRIT_CHANCE:.015,TEST_BOSS_CRIT:false,BOSS_CRIT_MULTIPLIER:1.75,
  BOSS_POISE_REGEN_DELAY_MS:2350,BOSS_BREAK_STAGGER_MS:950,BOSS_BREAK_RESIST_MS:5200,BOSS_CRITICAL_STAGGER_MS:190,
  reaction:()=>null,broadcast:(_room,event)=>hitEvents.push(event),markDirty:()=>{}
};
vm.runInNewContext(serverSource.slice(hitStart,hitEnd),hitContext,{filename:'v10.21-expose-damage.js'});
const makeRoom=exposed=>({state:{trust:0,tasks:[],activeCast:null,activeCombo:null,players:{hero:{score:0,counterUntil:0}},boss:{hp:1000,poise:100,poiseMax:100,staggerResistUntil:0,lastEl:null,lastElT:0,exposedUntil:exposed?Date.now()+5000:0,exposedHitCount:0}}});
const normalRoom=makeRoom(false),exposedRoom=makeRoom(true),projectile={food:0,owner:'hero',dmg:20,kind:'sword'};
hitContext.hitBoss(normalRoom,projectile);hitContext.hitBoss(exposedRoom,projectile);
const normalDamage=1000-normalRoom.state.boss.hp,exposedDamage=1000-exposedRoom.state.boss.hp;
if(Math.abs(exposedDamage/normalDamage-1.30)>.001)throw new Error(`Expose multiplier mismatch: ${normalDamage} -> ${exposedDamage}`);
const exposedEvent=hitEvents.at(-1)?.p;
if(!exposedEvent?.exposed||exposedEvent.damageMultiplier!==1.30)throw new Error(`Expose hit metadata missing: ${JSON.stringify(exposedEvent)}`);

const port=32221;
const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),REDIS_URL:''},stdio:['ignore','pipe','pipe']});
let done=false,output='',timeout=null;
const stop=code=>{if(done)return;done=true;clearTimeout(timeout);child.kill('SIGTERM');setTimeout(()=>process.exit(code),60)};
const fail=error=>{console.error(error?.stack||error);stop(1)};
timeout=setTimeout(()=>fail(new Error('V10.21 health test timed out')),12000);
child.stdout.on('data',async chunk=>{
  output+=chunk.toString();
  if(!done&&output.includes('server on')){
    try{
      const health=await fetch(`http://127.0.0.1:${port}/healthz`).then(response=>response.json());
      if(health.network?.combatFeel!=='v10.23-poise-weakpoint-critical-adaptive-combo-ai')throw new Error(`Health label mismatch: ${JSON.stringify(health)}`);
      if(health.network?.bossDirector?.thresholds?.join(',')!=='70,35'||health.network?.bossDirector?.exposedDamageMultiplier!==1.3)throw new Error(`Health director metadata mismatch: ${JSON.stringify(health.network?.bossDirector)}`);
      console.log('V10.21 BOSS DIRECTOR PASS · 3 authored phase decks · no immediate repeats · 70/35 thresholds · phase lock · x1.30 punish window · HUD timer');
      stop(0);
    }catch(error){fail(error)}
  }
});
child.stderr.on('data',chunk=>process.stderr.write(chunk));
child.on('exit',code=>{if(!done&&code)fail(new Error(`Server exited with ${code}`))});
