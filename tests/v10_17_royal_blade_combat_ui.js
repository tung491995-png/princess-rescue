const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const WebSocket = require('ws');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

for (const [index, match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()) {
  if (match[1].trim()) new vm.Script(match[1], { filename: `inline-${index}.js` });
}

for (const fragment of [
  '<title>Princess Rescue V10.17.1 — Intro Stability Hotfix</title>',
  'function makeRoyalBlade(holder,role)',
  "root.name=hero?'HeroRoyalBlade':'PrincessRoyalBlade'",
  "new THREE.OctahedronGeometry(.18,0)",
  'function setPlayerBoltInst(',
  "kind:'royalBolt'",
  "triggerCombatAnim(role,'attack'",
  "if(e==='swordSlash')",
  'predictedSwordAids',
  'id="battleChat"',
  'class="bladeIcon"',
  'ARC SHOT',
  '3-hit sword combo'
]) if (!html.includes(fragment)) throw new Error(`V10.17 client feature missing: ${fragment}`);

for (const fragment of [
  'atkCd:0,skillCd:0,combo:0,comboUntil:0',
  '// V10.17: the basic action is a true server-authoritative sword strike.',
  "kind:'sword'",
  "kind:'royalBolt'",
  "e:'swordSlash'",
  'p.atkCd=.32',
  'const damageScale=[1.08,1.16,1.32][combo]',
  'const combo=p.combo,reach=combo===2?2.85:2.62',
  'melee:!!result.melee'
]) if (!serverSource.includes(fragment)) throw new Error(`V10.17 server feature missing: ${fragment}`);

const attackBranch = serverSource.slice(serverSource.indexOf('if(!skill){'), serverSource.indexOf('if(p.skillCd>0)', serverSource.indexOf('if(!skill){')));
if (/s\.projectiles\.push|vx:|vz:/.test(attackBranch)) throw new Error('Basic sword attack still creates a ranged projectile');

const port = 3217;
const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), REDIS_URL: '', BOSS_TEST_FAST: '0', BOSS_TEST_SKILL: '', BOSS_TEST_DODGE: '' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let done = false, started = false;
const stop = code => {
  if (done) return;
  done = true;
  child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 80);
};
const fail = error => { console.error(error?.stack || error); stop(1); };
const timeout = setTimeout(() => fail(new Error('V10.17 Royal Blade test timed out')), 35000);

function run() {
  const hero = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const princess = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  let room = '', startRequested = false, movementStarted = false, moving = false, attackSent = false, inputSeq = 0;
  let slash = null, ack = null, hit = null, hpAfter = 2200, sawPlayerProjectile = false;

  const finish = () => {
    if (done) return;
    if (!slash || !ack || !hit || hpAfter >= 2200) return;
    if (!slash.hit || slash.target !== 'boss' || slash.combo !== 0) throw new Error(`Unexpected sword slash: ${JSON.stringify(slash)}`);
    if (!ack.accepted || !ack.melee || ack.projectiles.length !== 0 || !ack.hit) throw new Error(`Unexpected attack ack: ${JSON.stringify(ack)}`);
    if (hit.kind !== 'sword' || hit.owner !== 'hero' || hit.dmg < 14) throw new Error(`Unexpected combat hit: ${JSON.stringify(hit)}`);
    if (sawPlayerProjectile) throw new Error('Basic attack spawned a player projectile');
    clearTimeout(timeout);
    hero.close(); princess.close();
    console.log(`V10.17 ROYAL BLADE PASS · Hero/Princess swords · 3-hit authoritative melee · no basic projectile · royalBolt skill retained · concept HUD/chat/buttons · boss ${Math.round(hpAfter)}/2200`);
    stop(0);
  };

  const inspectState = state => {
    hpAfter = Math.min(hpAfter, state?.boss?.hp ?? 2200);
    if ((state?.projectiles || []).some(projectile => projectile.o === 'hero')) sawPlayerProjectile = true;
    if (moving && !attackSent && state?.players?.hero && state?.boss) {
      const heroState = state.players.hero, bossState = state.boss;
      const dx = bossState.x - heroState.x, dz = bossState.z - heroState.z, distance = Math.hypot(dx, dz) || 1;
      if (distance <= 2.45) {
        moving = false; attackSent = true;
        hero.send(JSON.stringify({ type:'input', x:0, y:0, seq:++inputSeq }));
        hero.send(JSON.stringify({ type:'action', a:'attack', aid:'v1017-sword-1', st:Date.now() }));
      } else {
        hero.send(JSON.stringify({ type:'input', x:dx / distance, y:dz / distance, seq:++inputSeq }));
      }
    }
    finish();
  };

  hero.on('error', fail); princess.on('error', fail);
  hero.on('open', () => hero.send(JSON.stringify({ type:'create' })));
  princess.on('open', () => { if (room) princess.send(JSON.stringify({ type:'join', code:room })); });

  hero.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.type === 'created') {
      room = message.code;
      hero.send(JSON.stringify({ type:'bossAssetReady', ready:true }));
      if (princess.readyState === WebSocket.OPEN) princess.send(JSON.stringify({ type:'join', code:room }));
    }
    if (message.type === 'bossAssetReady' && message.ready?.hero && message.ready?.princess && !startRequested) {
      startRequested = true; hero.send(JSON.stringify({ type:'start' }));
    }
    if (message.type === 'start' && !movementStarted) {
      movementStarted = true;
      const wait = Math.max(0, message.state.introUntil - Date.now() + 70);
      setTimeout(() => { moving = true; }, wait);
    }
    if (message.type === 'actionAck' && message.aid === 'v1017-sword-1') { ack = message; finish(); }
    if (message.type === 'event' && message.e === 'swordSlash' && message.p?.aid === 'v1017-sword-1') { slash = message.p; finish(); }
    if (message.type === 'event' && message.e === 'combatHit' && message.p?.aid === 'v1017-sword-1') { hit = message.p; finish(); }
    if (message.type === 'state') inspectState(message.state);
  });

  princess.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.type === 'joined') princess.send(JSON.stringify({ type:'bossAssetReady', ready:true }));
  });
}

let output = '';
child.stdout.on('data', chunk => {
  output += chunk.toString();
  if (output.includes('server on') && !started && !done) { started = true; run(); }
});
child.stderr.on('data', chunk => process.stderr.write(chunk));
child.on('exit', code => { if (!done && code) fail(new Error(`Server exited with ${code}`)); });
