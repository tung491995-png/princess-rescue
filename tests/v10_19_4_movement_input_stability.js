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

if(!['10.23.1','10.25.0'].includes(pkg.version))throw new Error(`Wrong package version: ${pkg.version}`);
for(const fragment of [
  '<title>Princess Rescue V10.23.1 — Runtime Reliability Hotfix</title>',
  "window.PrincessBlackBox?.init?.({version:'10.23.1'",
  "let actionId=0,predictedShots=[],predictedSwordAids=new Set(),predictedDashAid=''",
  "const aid=`${role}-dash-${++actionId}`",
  "send({type:'action',a:'dash',aid,st:Date.now()+serverOffset})",
  "if(p.aid&&p.aid===predictedDashAid)predictedDashAid=''",
  'const dashActive=pred.dashT>0||(Number(me.dash)||0)>0',
  "if(dashError>3.2){pred.x=tx;pred.z=tz;pred.dashT=0;predictedDashAid=''}",
  'function resolvePredictedBossOverlap(minGap=1.02)',
  'if(!manuallyPaused)try{simulatePrediction(dt)}',
  'if(pid!==null&&pid!==e.pointerId)return',
  "bugRecorder.check('PLAYER_BOSS_OVERLAP'",
  "bugRecorder.check('DASH_PREDICTION_DIVERGENCE'"
])if(!html.includes(fragment))throw new Error(`V10.19.4 client movement guard missing: ${fragment}`);

for(const fragment of [
  'const INPUT_STALE_MS = 500',
  'const PLAYER_BOSS_MIN_GAP = 1.02',
  'function resolvePlayerBossOverlap(player,boss,minGap=PLAYER_BOSS_MIN_GAP)',
  'if(outwardVelocity<0){player.vx-=outwardVelocity*nx;player.vz-=outwardVelocity*nz}',
  'if(p.lastInputAt&&now-p.lastInputAt>INPUT_STALE_MS)',
  'resolvePlayerBossOverlap(H,b);resolvePlayerBossOverlap(P,b)',
  "broadcast(room,{type:'event',e:'dash',p:{role,x,z,aid,startAt:actionTs}})",
  "send(ws,{type:'actionAck',a:'dash',aid,accepted:result.accepted"
])if(!serverSource.includes(fragment))throw new Error(`V10.19.4 server movement guard missing: ${fragment}`);

const frameBlock=html.slice(html.indexOf('function frame(now){'),html.indexOf('requestAnimationFrame(frame);',html.indexOf('function frame(now){')));
if(frameBlock.indexOf('simulatePrediction(dt)')>frameBlock.indexOf('if(!visualFrozen)'))throw new Error('Hit-stop still blocks locomotion prediction');

const port=32194;
const child=spawn(process.execPath,['server.js'],{
  cwd:root,
  env:{...process.env,PORT:String(port),REDIS_URL:'',BOSS_TEST_FAST:'0',BOSS_TEST_SKILL:'0',BOSS_TEST_DODGE:''},
  stdio:['ignore','pipe','pipe']
});

let done=false,started=false,hero=null,timeout=null;
const stop=code=>{
  if(done)return;done=true;
  clearTimeout(timeout);
  try{hero?.close()}catch{}
  child.kill('SIGTERM');
  setTimeout(()=>process.exit(code),80);
};
const fail=error=>{console.error(error?.stack||error);stop(1)};
timeout=setTimeout(()=>fail(new Error('V10.19.4 movement test timed out')),30000);

function run(){
  hero=new WebSocket(`ws://127.0.0.1:${port}/ws`);
  let startRequested=false,startedState=false,seq=0,latest=null,approachTimer=null,combatTimer=null;
  let phase='lobby',dashAck=null,dashEvents=0,startPos=null,minGap=Infinity,moveDir={x:0,z:0},changedDirection=false;

  const sendInput=(x,z)=>hero.send(JSON.stringify({type:'input',x,y:z,seq:++seq}));
  const finish=()=>{
    if(phase!=='verify'||!latest||!dashAck)return;
    const p=latest.players.hero,b=latest.boss;
    minGap=Math.min(minGap,Math.hypot(p.x-b.x,p.z-b.z));
    const moved=Math.hypot(p.x-startPos.x,p.z-startPos.z);
    if(!dashAck.accepted)throw new Error(`Dash rejected: ${JSON.stringify(dashAck)}`);
    if(dashEvents!==1)throw new Error(`Predicted dash should have one authoritative echo, got ${dashEvents}`);
    if(minGap<.985)throw new Error(`Player overlapped boss: minimum gap ${minGap}`);
    if(moved<.72)throw new Error(`Player remained pinned near boss: moved only ${moved.toFixed(3)} m`);
    if(!changedDirection)throw new Error('Direction-change phase did not run');
    console.log(`V10.19.4 MOVEMENT PASS · attack + inward/tangent dash + direction change · moved ${moved.toFixed(2)}m · boss gap ${minGap.toFixed(2)}m · one dash echo`);
    stop(0);
  };

  const beginCloseCombat=()=>{
    if(phase!=='approach'||!latest)return;
    clearInterval(approachTimer);
    const p=latest.players.hero,b=latest.boss;
    startPos={x:p.x,z:p.z};
    const dx=p.x-b.x,dz=p.z-b.z,d=Math.hypot(dx,dz)||1;
    const nx=dx/d,nz=dz/d,tx=-nz,tz=nx;
    let ix=-nx+tx*.82,iz=-nz+tz*.82,l=Math.hypot(ix,iz)||1;
    moveDir={x:ix/l,z:iz/l};
    phase='combat';
    combatTimer=setInterval(()=>sendInput(moveDir.x,moveDir.z),34);
    hero.send(JSON.stringify({type:'action',a:'attack',aid:'movement-slash-1',st:Date.now()}));
    setTimeout(()=>hero.send(JSON.stringify({type:'action',a:'dash',aid:'movement-dash-1',st:Date.now()})),55);
    setTimeout(()=>{
      moveDir={x:tx,z:tz};changedDirection=true;
      hero.send(JSON.stringify({type:'action',a:'attack',aid:'movement-slash-2',st:Date.now()}));
    },330);
    setTimeout(()=>{
      clearInterval(combatTimer);sendInput(0,0);phase='verify';
      setTimeout(finish,180);
    },980);
  };

  const startApproach=()=>{
    if(phase!=='lobby')return;
    phase='approach';
    approachTimer=setInterval(()=>{
      if(!latest)return;
      const p=latest.players.hero,b=latest.boss,dx=b.x-p.x,dz=b.z-p.z,d=Math.hypot(dx,dz)||1;
      if(d<=1.08){beginCloseCombat();return}
      sendInput(dx/d,dz/d);
    },34);
  };

  hero.on('error',fail);
  hero.on('open',()=>hero.send(JSON.stringify({type:'create',testMode:'boss-only-damage'})));
  hero.on('message',raw=>{
    const message=JSON.parse(raw);
    if(message.type==='created')hero.send(JSON.stringify({type:'bossAssetReady',ready:true}));
    if(message.type==='bossAssetReady'&&message.ready?.hero&&message.ready?.princess&&!startRequested){
      startRequested=true;hero.send(JSON.stringify({type:'start'}));
    }
    if(message.type==='start'&&!startedState){
      startedState=true;latest=message.state;
      setTimeout(startApproach,Math.max(0,message.state.introUntil-Date.now()+90));
    }
    if(message.type==='state'){
      latest=message.state;
      if(phase==='combat'||phase==='verify'){
        const p=latest.players.hero,b=latest.boss;
        minGap=Math.min(minGap,Math.hypot(p.x-b.x,p.z-b.z));
      }
      finish();
    }
    if(message.type==='actionAck'&&message.aid==='movement-dash-1'){dashAck=message;finish()}
    if(message.type==='event'&&message.e==='dash'&&message.p?.aid==='movement-dash-1')dashEvents++;
  });
}

let output='';
child.stdout.on('data',chunk=>{
  output+=chunk.toString();
  if(output.includes('server on')&&!started&&!done){started=true;run()}
});
child.stderr.on('data',chunk=>process.stderr.write(chunk));
child.on('exit',code=>{if(!done&&code)fail(new Error(`Server exited with ${code}`))});
