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

if(pkg.version!=='10.22.0')throw new Error(`Wrong package version: ${pkg.version}`);
for(const fragment of [
  '<title>Princess Rescue V10.22 — Player Combat Animation &amp; Skill VFX</title>',
  "window.PrincessBlackBox?.init?.({version:'10.22'",
  'function makePlayerCombatFx(character,roleName)',
  'makePlayerCombatFx(r,role)',
  'for(let i=0;i<5;i++)',
  'for(let i=0;i<6;i++)',
  'function spawnPlayerSlashFx(p)',
  'function spawnPlayerDashFx(who,dirX=0,dirZ=0)',
  "function triggerPlayerSkillFx(who,aid='')",
  'function triggerPlayerHitFx(who)',
  'function updatePlayerCombatFx(now)',
  "if(e==='swordImpact')",
  "if(e==='playerHit')",
  "runVisualPass('player-combat-fx',()=>updatePlayerCombatFx(now))",
  "?{kind:'starWave',count:3,spread:.065,speed:12.4}",
  ":{kind:'roseWave',count:5,spread:.115,speed:11.2}"
])if(!html.includes(fragment))throw new Error(`V10.22 client feature missing: ${fragment}`);

for(const fragment of [
  'function resolvePlayerSwordImpact(room,strike)',
  'const impactDelayMs=[118,138,205][combo]',
  "scheduleTask(room,Math.max(0,impactAt-Date.now()),'player_sword_impact'",
  "e:'swordSlash'",
  "e:'swordImpact'",
  "if(task.type==='player_sword_impact')",
  "broadcast(room,{type:'event',e:'playerHit'",
  "broadcast(room,{type:'event',e:'dash',p:{role,x,z,aid,startAt:actionTs}})",
  "combatFeel:'v10.22-server-timed-sword-impact-player-animation-vfx'"
])if(!serverSource.includes(fragment))throw new Error(`V10.22 server feature missing: ${fragment}`);

const attackStart=serverSource.indexOf('if(!skill){');
const attackEnd=serverSource.indexOf('if(p.skillCd>0)',attackStart);
const attackBranch=serverSource.slice(attackStart,attackEnd);
if(attackStart<0||attackEnd<0)throw new Error('Sword branch could not be isolated');
if(attackBranch.includes('hitBoss(room'))throw new Error('Sword damage still occurs on button-down');
if(!attackBranch.includes("'player_sword_impact'"))throw new Error('Sword branch does not schedule its contact frame');

const resolveStart=serverSource.indexOf('function resolvePlayerSwordImpact(');
const resolveEnd=serverSource.indexOf('\nfunction spawnShot(',resolveStart);
const events=[],hits=[];
const context={
  Math,
  segmentCircleHit:(x1,z1,x2,z2,cx,cz,r)=>{
    const vx=x2-x1,vz=z2-z1,wx=cx-x1,wz=cz-z1;
    const t=Math.max(0,Math.min(1,(wx*vx+wz*vz)/Math.max(.0001,vx*vx+vz*vz)));
    return Math.hypot(cx-(x1+vx*t),cz-(z1+vz*t))<=r;
  },
  bossCanBeHit:()=>true,
  hitBoss:(_room,projectile)=>hits.push(projectile),
  broadcast:(_room,event)=>events.push(event),
  markDirty:()=>{}
};
vm.runInNewContext(serverSource.slice(resolveStart,resolveEnd),context,{filename:'v10.22-sword-impact.js'});
const room={state:{players:{hero:{down:false}},boss:{x:0,z:0,hp:2200},summons:[],trust:0}};
context.resolvePlayerSwordImpact(room,{role:'hero',aid:'timed-contact',food:2,combo:2,finisher:true,damage:24,x:0,z:2.4,dx:0,dz:-1,reach:3.02,startAt:1000,impactAt:1205});
if(hits.length!==1||hits[0].hitTs!==1205||hits[0].kind!=='sword')throw new Error(`Timed sword hit metadata mismatch: ${JSON.stringify(hits)}`);
const impact=events.find(event=>event.e==='swordImpact')?.p;
if(!impact?.hit||impact.target!=='boss'||impact.combo!==2||!impact.finisher)throw new Error(`Sword impact event mismatch: ${JSON.stringify(impact)}`);

const pauseBlock=serverSource.slice(serverSource.indexOf('function shiftPauseClock('),serverSource.indexOf('\nfunction beginRoomPause(',serverSource.indexOf('function shiftPauseClock(')));
if(!pauseBlock.includes("'impactAt'")||!pauseBlock.includes("'startAt'"))throw new Error('Pause does not shift scheduled sword contact clocks');

console.log('V10.22 PLAYER COMBAT PASS · contact-frame sword authority · 3 slash poses · pooled crescents/afterimages · role skill blooms · synchronized recoil');
