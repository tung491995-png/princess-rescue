const {spawn}=require('child_process');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const WebSocket=require('ws');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const serverSource=fs.readFileSync(path.join(root,'server.js'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

for(const [index,match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()){
  if(match[1].trim())new vm.Script(match[1],{filename:`inline-${index}.js`});
}

if(!['10.20.0','10.21.0'].includes(pkg.version))throw new Error(`Wrong package version: ${pkg.version}`);
for(const fragment of [
  pkg.version==='10.21.0'?'<title>Princess Rescue V10.21 — Boss Phase &amp; Combat Director</title>':'<title>Princess Rescue V10.20 — Combat Feel Upgrade</title>',
  pkg.version==='10.21.0'?"window.PrincessBlackBox?.init?.({version:'10.21'":"window.PrincessBlackBox?.init?.({version:'10.20'",
  'id="combatLock"',
  'id="comboFeedback"',
  'function combatLockCandidates(s)',
  'function selectCombatLockTarget(s)',
  'current.score<=selected.score+.72',
  "role==='princess'?'ROSE FAN':'STAR WAVE'",
  "kind:'starWave',count:3,spread:.065,speed:12.4",
  "kind:'roseWave',count:5,spread:.115,speed:11.2",
  "p.finisher?'split':'slash'",
  'if(!manuallyPaused)try{simulatePrediction(dt)}',
  'function resolvePredictedBossOverlap(minGap=1.02)'
])if(!html.includes(fragment))throw new Error(`V10.20 client feature missing: ${fragment}`);

for(const fragment of [
  'p.comboUntil=comboNow+880',
  'p.atkCd=[.27,.30,.40][combo]',
  'const reach=[2.70,2.78,3.02][combo]',
  'const damageScale=[1.06,1.18,1.48][combo]',
  "kind:'starWave',style:'STELLAR_CRESCENT',count:3",
  "kind:'roseWave',style:'ROSE_FAN',count:5",
  'finisher:pr.finisher===true',
  'const PLAYER_BOSS_MIN_GAP = 1.02'
])if(!serverSource.includes(fragment))throw new Error(`V10.20 server feature missing: ${fragment}`);

const attackBranch=serverSource.slice(serverSource.indexOf('if(!skill){'),serverSource.indexOf('if(p.skillCd>0)',serverSource.indexOf('if(!skill){')));
if(/s\.projectiles\.push|vx:|vz:/.test(attackBranch))throw new Error('Basic sword attack creates a projectile');

const port=32200;
const child=spawn(process.execPath,['server.js'],{
  cwd:root,
  env:{...process.env,PORT:String(port),REDIS_URL:'',BOSS_TEST_FAST:'0',BOSS_TEST_SKILL:'',BOSS_TEST_DODGE:''},
  stdio:['ignore','pipe','pipe']
});

let done=false,started=false,timeout=null;
const stop=code=>{
  if(done)return;done=true;clearTimeout(timeout);child.kill('SIGTERM');setTimeout(()=>process.exit(code),80);
};
const fail=error=>{console.error(error?.stack||error);stop(1)};
timeout=setTimeout(()=>fail(new Error('V10.20 combat-feel test timed out')),28000);

function run(){
  const hero=new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const princess=new WebSocket(`ws://127.0.0.1:${port}/ws`);
  let room='',startRequested=false,introScheduled=false,seq=0,latest=null,approachTimer=null,comboScheduled=false;
  const slashByAid=new Map(),hitByAid=new Map(),ackByAid=new Map();
  let heroSkillAck=null,princessSkillAck=null,heroSkillStyle=false,princessSkillStyle=false,minGap=Infinity;

  const finish=()=>{
    if(done)return;
    const attacks=['v1020-slash-0','v1020-slash-1','v1020-slash-2'];
    if(!attacks.every(a=>slashByAid.has(a)&&ackByAid.has(a)))return;
    if(!heroSkillAck||!princessSkillAck||!heroSkillStyle||!princessSkillStyle)return;
    const slashes=attacks.map(a=>slashByAid.get(a));
    if(slashes.map(s=>s.combo).join(',')!=='0,1,2')throw new Error(`Unexpected combo order: ${JSON.stringify(slashes)}`);
    if(slashes[0].finisher||slashes[1].finisher||!slashes[2].finisher)throw new Error(`Finisher flags are wrong: ${JSON.stringify(slashes)}`);
    if(!slashes.every(s=>s.target==='boss'&&s.hit))throw new Error(`Sword lock/range failed: ${JSON.stringify(slashes)}`);
    if(!attacks.every(a=>ackByAid.get(a).melee&&ackByAid.get(a).projectiles.length===0))throw new Error('Melee ack created projectiles');
    const finisherHit=hitByAid.get('v1020-slash-2');
    if(!finisherHit?.finisher||finisherHit.combo!==2||finisherHit.kind!=='sword')throw new Error(`Finisher hit metadata missing: ${JSON.stringify(finisherHit)}`);
    if(heroSkillAck.style!=='STELLAR_CRESCENT'||heroSkillAck.projectiles.length!==3||!heroSkillAck.projectiles.every(p=>p.kind==='starWave'))throw new Error(`Hero skill profile mismatch: ${JSON.stringify(heroSkillAck)}`);
    if(princessSkillAck.style!=='ROSE_FAN'||princessSkillAck.projectiles.length!==5||!princessSkillAck.projectiles.every(p=>p.kind==='roseWave'))throw new Error(`Princess skill profile mismatch: ${JSON.stringify(princessSkillAck)}`);
    if(minGap<.985)throw new Error(`V10.19.4 boss separation regressed: ${minGap}`);
    clearInterval(approachTimer);hero.close();princess.close();
    console.log(`V10.20 COMBAT FEEL PASS · soft lock HUD · combo 0→1→2 finisher · Hero 3 focused waves · Princess 5 rose waves · boss gap ${minGap.toFixed(2)}m`);
    stop(0);
  };

  const scheduleCombo=()=>{
    if(comboScheduled)return;comboScheduled=true;clearInterval(approachTimer);
    hero.send(JSON.stringify({type:'input',x:0,y:0,seq:++seq}));
    const fire=(delay,aid)=>setTimeout(()=>hero.send(JSON.stringify({type:'action',a:'attack',aid,st:Date.now()})),delay);
    fire(0,'v1020-slash-0');fire(330,'v1020-slash-1');fire(690,'v1020-slash-2');
    setTimeout(()=>hero.send(JSON.stringify({type:'action',a:'skill',aid:'v1020-hero-skill',st:Date.now()})),1250);
  };

  const startCombat=()=>{
    princess.send(JSON.stringify({type:'action',a:'skill',aid:'v1020-princess-skill',st:Date.now()}));
    approachTimer=setInterval(()=>{
      if(!latest)return;
      const p=latest.players.hero,b=latest.boss,dx=b.x-p.x,dz=b.z-p.z,d=Math.hypot(dx,dz)||1;
      if(d<=2.42){scheduleCombo();return}
      hero.send(JSON.stringify({type:'input',x:dx/d,y:dz/d,seq:++seq}));
    },34);
  };

  const inspect=message=>{
    if(message.type==='state'){
      latest=message.state;
      const p=latest.players?.hero,b=latest.boss;if(p&&b)minGap=Math.min(minGap,Math.hypot(p.x-b.x,p.z-b.z));
    }
    if(message.type==='actionAck'){
      ackByAid.set(message.aid,message);
      if(message.aid==='v1020-hero-skill')heroSkillAck=message;
      if(message.aid==='v1020-princess-skill')princessSkillAck=message;
    }
    if(message.type==='event'&&message.e==='swordSlash')slashByAid.set(message.p?.aid,message.p);
    if(message.type==='event'&&message.e==='combatHit')hitByAid.set(message.p?.aid,message.p);
    if(message.type==='event'&&message.e==='actionAnim'&&message.p?.aid==='v1020-hero-skill'&&message.p.style==='STELLAR_CRESCENT')heroSkillStyle=true;
    if(message.type==='event'&&message.e==='actionAnim'&&message.p?.aid==='v1020-princess-skill'&&message.p.style==='ROSE_FAN')princessSkillStyle=true;
    finish();
  };

  hero.on('error',fail);princess.on('error',fail);
  hero.on('open',()=>hero.send(JSON.stringify({type:'create'})));
  princess.on('open',()=>{if(room)princess.send(JSON.stringify({type:'join',code:room}))});
  hero.on('message',raw=>{
    const message=JSON.parse(raw);inspect(message);
    if(message.type==='created'){
      room=message.code;hero.send(JSON.stringify({type:'bossAssetReady',ready:true}));
      if(princess.readyState===WebSocket.OPEN)princess.send(JSON.stringify({type:'join',code:room}));
    }
    if(message.type==='bossAssetReady'&&message.ready?.hero&&message.ready?.princess&&!startRequested){startRequested=true;hero.send(JSON.stringify({type:'start'}))}
    if(message.type==='start'&&!introScheduled){introScheduled=true;latest=message.state;setTimeout(startCombat,Math.max(0,message.state.introUntil-Date.now()+90))}
  });
  princess.on('message',raw=>{
    const message=JSON.parse(raw);inspect(message);
    if(message.type==='joined')princess.send(JSON.stringify({type:'bossAssetReady',ready:true}));
  });
}

let output='';
child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.includes('server on')&&!started&&!done){started=true;run()}});
child.stderr.on('data',chunk=>process.stderr.write(chunk));
child.on('exit',code=>{if(!done&&code)fail(new Error(`Server exited with ${code}`))});
