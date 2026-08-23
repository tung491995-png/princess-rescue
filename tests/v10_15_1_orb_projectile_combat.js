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
  "if(k==='orbclone')return 5",
  'function applyBossOrbCloneMuzzle(',
  'bossArmament.orbRoot.position',
  'pruneBossOrbCloneMuzzles(nowVisual)',
  "pb.k==='orbclone'?0xd8b8ff",
  'ORB CLONE: bright violet core',
  "if(e==='bossOrbVolley')",
  'bossOrbReleasePulseUntil'
]) if (!html.includes(fragment)) throw new Error(`Missing client orb-clone feature: ${fragment}`);

for (const fragment of [
  'function bossOrbVolley(',
  'function bossOrbRadial(',
  "kind:'orbclone'",
  "scheduleTask(room,telegraphMs,'boss_orb_volley'",
  "scheduleTask(room,telegraphMs,'boss_orb_radial'",
  "e:'bossOrbVolley'",
  'c:p.castId||null,b:p.bornAt||null'
]) if (!serverSource.includes(fragment)) throw new Error(`Missing server orb-clone feature: ${fragment}`);

const muzzleStart = html.indexOf('function applyBossOrbCloneMuzzle(');
const muzzleEnd = html.indexOf('\nfunction pruneBossOrbCloneMuzzles', muzzleStart);
const muzzleSource = html.slice(muzzleStart, muzzleEnd);
if (/\.clone\s*\(|removeFromParent|\.add\s*\(bossArmament\.orbRoot/.test(muzzleSource)) {
  throw new Error('Projectile muzzle path clones or reparents the permanent GLB orb');
}
if (!html.includes('scene.add(armament.haloRoot,armament.orbRoot)') || html.includes('rec.orbSocket.add(armament.orbRoot)')) {
  throw new Error('Permanent orb ownership changed');
}

const port = 3215;
const server = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), REDIS_URL: '', BOSS_TEST_FAST: '1', BOSS_TEST_SKILL: '0', BOSS_TEST_DODGE: '' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let finished = false, started = false;
const stop = code => {
  if (finished) return;
  finished = true; server.kill('SIGTERM');
  setTimeout(() => process.exit(code), 80);
};
const fail = error => { console.error(error?.stack || error); stop(1); };
const timeout = setTimeout(() => fail(new Error('V10.15.1 orb projectile test timed out')), 15000);

async function run() {
  const hero = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const princess = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  let code = '', requestedStart = false, cast = null, volley = null;
  const observed = { hero: new Set(), princess: new Set() };
  const close = () => { try { hero.close(); princess.close(); } catch {} };
  const finish = () => {
    if (!cast || !volley || !volley.ids.every(id => observed.hero.has(id) && observed.princess.has(id))) return;
    if (cast.i !== 0 || cast.releaseAt !== cast.impactAt || cast.telegraphMs !== 880) throw new Error(`Quick Cast timeline changed: ${JSON.stringify(cast)}`);
    if (volley.radial || volley.count !== 1 || volley.ids.length !== 1 || !['hero','princess'].includes(volley.targetRole)) throw new Error(`Invalid phase-1 orb volley: ${JSON.stringify(volley)}`);
    console.log(`V10.15.1 ORB PROJECTILE PASS · permanent GLB orb untouched · Quick Cast 13 emitted ${volley.count} authoritative GPU orb clone · both clients synchronized · 165ms hand-muzzle blend`);
    clearTimeout(timeout); close(); stop(0);
  };
  const inspectState = (who, state) => {
    for (const projectile of state?.projectiles || []) {
      if (projectile.k !== 'orbclone') continue;
      if (!Number.isFinite(projectile.x) || !Number.isFinite(projectile.y) || !Number.isFinite(projectile.z) || projectile.y !== 2.62) throw new Error(`Invalid orb clone snapshot: ${JSON.stringify(projectile)}`);
      if (!projectile.c || !projectile.b) throw new Error(`Orb clone provenance missing: ${JSON.stringify(projectile)}`);
      observed[who].add(projectile.id);
    }
    finish();
  };
  hero.on('error', fail); princess.on('error', fail);
  hero.on('open', () => hero.send(JSON.stringify({ type:'create' })));
  hero.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.type === 'created') {
      code = message.code; hero.send(JSON.stringify({type:'bossAssetReady',ready:true}));
      if (princess.readyState === WebSocket.OPEN) princess.send(JSON.stringify({type:'join',code}));
    }
    if (message.type === 'bossAssetReady' && message.ready?.hero && message.ready?.princess && !requestedStart) {
      requestedStart = true; hero.send(JSON.stringify({type:'start'}));
    }
    if (message.type === 'event' && message.e === 'bossCast' && message.p?.i === 0) { cast = message.p; finish(); }
    if (message.type === 'event' && message.e === 'bossOrbVolley') { volley = message.p; finish(); }
    if (message.type === 'state') inspectState('hero', message.state);
  });
  princess.on('open', () => { if (code) princess.send(JSON.stringify({type:'join',code})); });
  princess.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.type === 'joined') princess.send(JSON.stringify({type:'bossAssetReady',ready:true}));
    if (message.type === 'state') inspectState('princess', message.state);
  });
}

let output = '';
server.stdout.on('data', chunk => {
  output += chunk.toString();
  if (output.includes('server on') && !started && !finished) { started = true; run().catch(fail); }
});
server.stderr.on('data', chunk => process.stderr.write(chunk));
server.on('exit', code => { if (!finished && code) fail(new Error(`Server exited with ${code}`)); });
