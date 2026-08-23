const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');

const root = path.resolve(__dirname, '..');
const port = 3213;
const server = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), REDIS_URL: '', BOSS_TEST_FAST: '0', BOSS_TEST_SKILL: '0', BOSS_TEST_DODGE: '12' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let finished = false;
const stop = code => {
  if (finished) return;
  finished = true;server.kill('SIGTERM');setTimeout(() => process.exit(code), 60);
};
const fail = error => { if(finished)return;console.error(error?.stack || error);stop(1); };
const timeout = setTimeout(() => fail(new Error('Teleport dodge authority test timed out')), 10000);

function run(){
  const hero=new WebSocket(`ws://127.0.0.1:${port}/ws`),princess=new WebSocket(`ws://127.0.0.1:${port}/ws`);
  let room='',startState=null,evade=null,snapshotMatched=false;
  const finish=()=>{
    if(finished||!evade||!snapshotMatched)return;
    finished=true;
    clearTimeout(timeout);hero.close();princess.close();
    console.log('V10.14 TELEPORT DODGE PASS · clip 12 · authoritative 3.15m relocation · snapshot/hitbox synchronized');
    server.kill('SIGTERM');setTimeout(()=>process.exit(0),60);
  };
  hero.on('error',fail);princess.on('error',fail);
  hero.on('open',()=>hero.send(JSON.stringify({type:'create'})));
  princess.on('open',()=>{if(room)princess.send(JSON.stringify({type:'join',code:room}))});
  hero.on('message',buffer=>{
    const m=JSON.parse(buffer);
    if(m.type==='created'){room=m.code;if(princess.readyState===WebSocket.OPEN)princess.send(JSON.stringify({type:'join',code:room}))}
    if(m.type==='start'){
      startState=m.state;
      const wait=Math.max(0,startState.introUntil-Date.now()+80);
      setTimeout(()=>hero.send(JSON.stringify({type:'action',a:'attack',st:Date.now(),aid:'teleport-dodge-test'})),wait);
    }
    if(m.type==='event'&&m.e==='bossEvade'){
      const p=m.p,distance=Math.hypot(p.toX-p.fromX,p.toZ-p.fromZ);
      if(p.kind!=='teleport'||p.clip!==12||distance<2.8||distance>3.3||!(p.startAt<p.endAt))return fail(new Error(`Invalid teleport dodge: ${JSON.stringify(p)}`));
      evade=p;
    }
    if(m.type==='state'&&evade){
      const b=m.state?.boss;
      if(Math.hypot(b.x-evade.toX,b.z-evade.toZ)<.05&&b.evade?.clip===12&&b.hp===2200){snapshotMatched=true;finish()}
    }
  });
  princess.on('message',buffer=>{
    const m=JSON.parse(buffer);
    if(m.type==='joined')hero.send(JSON.stringify({type:'start'}));
  });
}
let output='';
server.stdout.on('data',chunk=>{output+=chunk.toString();if(output.includes('server on')&&!finished)run()});
server.stderr.on('data',chunk=>process.stderr.write(chunk));
server.on('exit',code=>{if(!finished&&code)fail(new Error(`Server exited with ${code}`))});
