const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

const root = path.resolve(__dirname, '..');
const port = 3212;
const server = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), REDIS_URL: '', BOSS_TEST_FAST: '0', BOSS_TEST_SKILL: '3', BOSS_TEST_DODGE: '3' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let finished = false;
let started = false;
const stop = code => {
  if (finished) return;
  finished = true;
  server.kill('SIGTERM');
  setTimeout(() => process.exit(code), 80);
};
const fail = error => {
  console.error(error?.stack || error);
  stop(1);
};
const timeout = setTimeout(() => fail(new Error('V10.15 Orb Halo Foundation test timed out')), 34000);

function inspectGlb(buffer) {
  if (buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2 || buffer.readUInt32LE(8) !== buffer.length) {
    throw new Error('Invalid GLB header');
  }
  let offset = 12;
  let document = null;
  let binaryOffset = -1;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (type === 0x4e4f534a) document = JSON.parse(buffer.subarray(offset, offset + length).toString('utf8').trim());
    if (type === 0x004e4942) binaryOffset = offset;
    offset += length;
  }
  if (!document || binaryOffset < 0) throw new Error('Missing GLB JSON/BIN chunk');
  const hipIndex = document.nodes.findIndex(node => node.name === 'Hip');
  if (hipIndex < 0) throw new Error('Exact Hip node is missing');
  const readVec3Accessor = index => {
    const accessor = document.accessors[index];
    const view = document.bufferViews[accessor.bufferView];
    if (accessor.componentType !== 5126 || accessor.type !== 'VEC3') throw new Error('Unexpected root translation accessor');
    const stride = view.byteStride || 12;
    const start = binaryOffset + (view.byteOffset || 0) + (accessor.byteOffset || 0);
    return Array.from({ length: accessor.count }, (_, row) => [0, 1, 2].map(column => buffer.readFloatLE(start + row * stride + column * 4)));
  };
  let hipTranslationChannels = 0;
  let maxHipHorizontalLocalSpan = 0;
  for (const animation of document.animations || []) {
    for (const channel of animation.channels || []) {
      if (channel.target?.node !== hipIndex || channel.target?.path !== 'translation') continue;
      hipTranslationChannels++;
      const sampler = animation.samplers[channel.sampler];
      const rows = readVec3Accessor(sampler.output);
      const values = sampler.interpolation === 'CUBICSPLINE' ? rows.filter((_, index) => index % 3 === 1) : rows;
      for (const axis of [0, 1]) {
        const components = values.map(value => value[axis]);
        maxHipHorizontalLocalSpan = Math.max(maxHipHorizontalLocalSpan, Math.max(...components) - Math.min(...components));
      }
    }
  }
  return {
    animations: document.animations?.length || 0,
    nodes: document.nodes?.length || 0,
    meshes: document.meshes?.length || 0,
    skins: document.skins?.length || 0,
    joints: document.skins?.[0]?.joints?.length || 0,
    imageType: document.images?.[0]?.mimeType || '',
    hipTranslationChannels,
    maxHipHorizontalLocalSpan
  };
}

function verifyFullBodyCameraEnvelope() {
  const THREE = require(path.join(root, 'public', 'vendor', 'three-r128', 'three.min.js'));
  const aspects = [390 / 844, 430 / 932, 768 / 1024, 844 / 390, 16 / 9];
  for (const aspect of aspects) {
    for (let bossStep = 0; bossStep < 24; bossStep++) for (let playerStep = 0; playerStep < 24; playerStep++) {
      const bossAngle = bossStep / 24 * Math.PI * 2;
      const playerAngle = playerStep / 24 * Math.PI * 2;
      const boss = { x: Math.cos(bossAngle) * 7.35, y: 0.1, z: Math.sin(bossAngle) * 7.35 };
      const player = { x: Math.cos(playerAngle) * 8.1, z: Math.sin(playerAngle) * 8.1 };
      const portrait = aspect < 0.82;
      const weight = portrait ? 0.96 : 0.88;
      const focusX = player.x + (boss.x - player.x) * weight;
      const focusZ = player.z + (boss.z - player.z) * weight;
      const zoom = portrait ? 1.015 : 1.065;
      const look = new THREE.Vector3(focusX, 2.3, focusZ);
      const camera = new THREE.PerspectiveCamera(48, aspect, 0.1, 100);
      camera.position.set(focusX, (portrait ? 8.75 : 7.95) / zoom, focusZ + (portrait ? 17.2 : 14.5) / zoom);
      camera.lookAt(look); camera.updateMatrixWorld(true);
      const measure = () => {
        let overflow = 0;
        for (const x of [-2.15, 2.15]) for (const y of [boss.y - 0.06, boss.y + 5.05]) for (const z of [-1.35, 1.35]) {
          const projected = new THREE.Vector3(boss.x + x, y, boss.z + z).project(camera);
          overflow = Math.max(overflow, Math.abs(projected.x) / 0.72, Math.abs(projected.y) / 0.82);
        }
        return overflow;
      };
      const overflow = Math.max(1, measure());
      if (overflow > 1) {
        const offset = camera.position.clone().sub(look).multiplyScalar(Math.min(1.72, Math.max(1, overflow * 1.07)));
        camera.position.copy(look).add(offset); camera.lookAt(look); camera.updateMatrixWorld(true);
      }
      const remaining = measure();
      if (remaining > 1.0001) throw new Error(`Boss camera envelope overflow: aspect ${aspect}, remaining ${remaining}`);
    }
  }
}

async function run() {
  verifyFullBodyCameraEnvelope();
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  if (!html.includes("rec.hipMotionBone=findExactRigNode(rec.model,['Hip','Hips'])")) throw new Error('Exact Hip root-lock binding is missing');
  if (!html.includes('rec.motionAnchorBindRoot') || !html.includes('rec.motionLockTarget.y=rec.motionLockCurrent.y')) throw new Error('World-space XZ compensation is missing');
  if (!html.includes('function frameBossFullBody(') || !html.includes('frameBossFullBody(v10132CameraLook')) throw new Error('Full-body camera guard is missing');
  for (const mapping of ['boss_dodge:3','boss_combat_idle:8','boss_quick_cast:13','boss_aoe:14','boss_teleport:12','boss_hit:9','boss_death:15','boss_ultimate:17']) {
    if (!html.includes(mapping)) throw new Error(`Approved animation mapping is missing: ${mapping}`);
  }
  for (const state of ['boss_intro_rise:5','boss_intro_royal:6','boss_phase_charge:11','boss_phase_eternal:16']) {
    if (!html.includes(state)) throw new Error(`Presentation clip mapping is missing: ${state}`);
  }
  if (!html.includes('V1014_PRESENTATION_SEGMENTS') || !html.includes('segmentStart:segment.start') || !html.includes('rec.activeSegment')) throw new Error('Cropped long-clip playback is missing');
  const watchdog = html.slice(html.indexOf('function ensureBossVisualSafety'), html.indexOf('function loadGlbCandidate'));
  if (watchdog.includes('new THREE.Box3().setFromObject(rec.model)')) throw new Error('Animated world-bounds model switching remains in the watchdog');
  if (!html.includes('validateBossRigStatic(rec);rec.visualAccepted=true') || !html.includes("rigRuntime.status.boss='ready-locked'")) throw new Error('One-way Tripo visual lock is missing');
  if (!html.includes("m.type==='bossAssetReady'") || !serverSource.includes("reason:'BOSS_ASSET_NOT_READY'")) throw new Error('Two-client Tripo readiness gate is missing');
  if (!html.includes("playRigAnimation('boss','boss_combat_idle'") || !html.includes("playRigAnimation('boss','boss_dodge'")) throw new Error('Combat idle/dodge runtime wiring is missing');
  if (!html.includes("if(e==='bossEvade')") || !html.includes('startBossEvadeArt(p)')) throw new Error('Boss evade client VFX event is missing');
  if (!html.includes('boss_spin_kick:7')) throw new Error('Spin Kick clip 07 mapping is missing');
  if (!html.includes('/vendor/three-r128/three.min.js') || !html.includes('/vendor/three-r128/GLTFLoader.js')) throw new Error('Self-hosted Three.js loader is missing');
  if (/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/.test(html)) throw new Error('A runtime CDN dependency remains');
  if (!html.includes('ma_vuong_mat_ngu_mobile_2k.glb') || !html.includes('ma_vuong_mat_ngu_mobile_1k.glb')) throw new Error('Mobile GLB retry tiers are missing');
  if (!html.includes("rigRuntime.status[roleName]='retrying'")) throw new Error('Retry state is missing');
  const diag = await fetch(`http://127.0.0.1:${port}/diag`).then(response => response.json());
  if (diag.websocketPath !== '/ws') throw new Error('WebSocket diagnostic mismatch');
  for (const vendorPath of ['/vendor/three-r128/three.min.js', '/vendor/three-r128/GLTFLoader.js']) {
    const response = await fetch(`http://127.0.0.1:${port}${vendorPath}`);
    if (!response.ok || Number(response.headers.get('content-length')) < 90_000) throw new Error(`Vendor asset failed: ${vendorPath}`);
  }
  const assetPaths = [
    '/assets/characters/ma_vuong_mat_ngu_root_locked.glb',
    '/assets/characters/ma_vuong_mat_ngu_mobile_2k.glb',
    '/assets/characters/ma_vuong_mat_ngu_mobile_1k.glb'
  ];
  const assetSizes = [];
  for (const assetPath of assetPaths) {
    const response = await fetch(`http://127.0.0.1:${port}${assetPath}`);
    if (!response.ok) throw new Error(`Boss GLB was not served: ${assetPath}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const summary = inspectGlb(buffer);
    if (summary.animations !== 19 || summary.nodes !== 46 || summary.meshes !== 1 || summary.skins !== 1 || summary.joints !== 44 || summary.imageType !== 'image/jpeg') {
      throw new Error(`Boss GLB structure changed: ${assetPath} ${JSON.stringify(summary)}`);
    }
    if (summary.hipTranslationChannels !== 19 || summary.maxHipHorizontalLocalSpan > 0.00001) throw new Error(`Root XZ drift remains: ${assetPath} ${JSON.stringify(summary)}`);
    assetSizes.push(buffer.length);
  }
  const [bytes, mobile2kBytes, mobile1kBytes] = assetSizes;
  if (bytes < 8_000_000 || !(mobile1kBytes < mobile2kBytes && mobile2kBytes < bytes)) throw new Error(`Unexpected GLB tier sizes: ${assetSizes.join(', ')}`);

  const hero = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const princess = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  let room = '';
  let heroStart = null;
  let princessStart = null;
  let startValidated = false;
  let sawReadyGate = false;
  let requestedStart = false;
  let sawCast = false;
  let sawTeleport = false;
  let teleportRole = '';
  let sawImpact = false;
  let sawEvade = false;
  let sawEvadeSnapshot = false;
  let attackScheduled = false;
  const close = () => { try { hero.close(); princess.close(); } catch {} };
  const finishIfReady = () => {
    if (!sawReadyGate || !startValidated || !sawEvade || !sawEvadeSnapshot || !sawCast || !sawTeleport || !sawImpact) return;
    console.log(`V10.15 SMOKE PASS · Tripo one-way model lock · orb/halo readiness gate · approved 18/08/13/14/09/15/17 map · Dodge 03 + Teleport 12 AI · cropped 05/06/11/16 · 19 clips world-XZ locked · halo-aware full-body camera · GLB 4K ${bytes} · 2K ${mobile2kBytes} · 1K ${mobile1kBytes} · boss 2200/2200`);
    clearTimeout(timeout); close(); stop(0);
  };
  const check = () => {
    if (!heroStart || !princessStart) return;
    const state = heroStart;
    const remaining = state.introUntil - Date.now();
    // V10.16/V10.19 shortened and then locked the synchronized intro at 9 s.
    if (remaining < 8600 || remaining > 9300) throw new Error(`Intro lock mismatch: ${remaining}ms`);
    if (state.boss?.hp !== 2200 || state.boss?.max !== 2200) throw new Error('Boss HP mismatch');
    if (!attackScheduled) {
      attackScheduled = true;
      setTimeout(() => hero.send(JSON.stringify({ type:'action', a:'skill', st:Date.now(), aid:'v1014-dodge-test' })), Math.max(0, remaining + 80));
    }
    startValidated = true; finishIfReady();
  };
  hero.on('error', fail); princess.on('error', fail);
  hero.on('open', () => hero.send(JSON.stringify({ type: 'create' })));
  hero.on('message', buffer => {
    const message = JSON.parse(buffer);
    if (message.type === 'created') {
      room = message.code;
      hero.send(JSON.stringify({type:'bossAssetReady',ready:true}));
      if (princess.readyState === WebSocket.OPEN) princess.send(JSON.stringify({ type: 'join', code: room }));
    }
    if(message.type==='startAck'&&!message.ok&&message.reason==='BOSS_ASSET_NOT_READY'){
      sawReadyGate=true;
      princess.send(JSON.stringify({type:'bossAssetReady',ready:true}));
    }
    if(message.type==='bossAssetReady'&&message.ready?.hero&&message.ready?.princess&&!requestedStart){
      requestedStart=true;hero.send(JSON.stringify({type:'start'}));
    }
    if (message.type === 'start') { heroStart = message.state; check(); }
    if (message.type === 'state' && message.state?.boss?.evade?.clip === 3) {
      sawEvadeSnapshot = true; finishIfReady();
    }
    if (message.type === 'event' && message.e === 'bossEvade') {
      const e = message.p;
      const distance = Math.hypot(e.toX-e.fromX,e.toZ-e.fromZ);
      if (e.kind !== 'strafe' || e.clip !== 3 || distance < 1.8 || distance > 2.4 || !(e.startAt < e.endAt)) throw new Error(`Boss strafe dodge is invalid: ${JSON.stringify(e)}`);
      sawEvade = true; finishIfReady();
    }
    if (message.type === 'event' && message.e === 'bossCast' && message.p?.i === 3) {
      const c = message.p;
      if (!(c.startAt < c.teleportAt && c.teleportAt < c.kickAt && c.kickAt < c.impactAt && c.impactAt < c.endAt)) throw new Error('Teleport Spin Kick timeline is invalid');
      // V10.23 runs forced skills through the chained combo profile (860 ms).
      if (!(c.startAt < c.warningAt && c.warningAt < c.releaseAt && c.releaseAt === c.impactAt && c.telegraphMs === 860 && c.vfx === 'teleport_kick')) throw new Error('Synchronized telegraph payload is invalid');
      sawCast = true; finishIfReady();
    }
    if (message.type === 'event' && message.e === 'bossTeleportKick') {
      if (!Number.isFinite(message.p?.x) || !Number.isFinite(message.p?.z)) throw new Error('Teleport position is invalid');
      teleportRole = message.p?.role || '';
      sawTeleport = true; finishIfReady();
    }
    if (message.type === 'event' && message.e === 'spinKickImpact') {
      if (message.p?.radius !== 2.2 || !teleportRole || !message.p?.hitRoles?.includes(teleportRole)) throw new Error('Spin Kick server hit validation failed');
      sawImpact = true; finishIfReady();
    }
  });
  princess.on('open', () => { if (room) princess.send(JSON.stringify({ type: 'join', code: room })); });
  princess.on('message', buffer => {
    const message = JSON.parse(buffer);
    if (message.type === 'joined') hero.send(JSON.stringify({ type: 'start' }));
    if (message.type === 'start') { princessStart = message.state; check(); }
  });
}

let output = '';
server.stdout.on('data', chunk => {
  output += chunk.toString();
  if (output.includes('server on') && !finished && !started) { started = true; run().catch(fail); }
});
server.stderr.on('data', chunk => process.stderr.write(chunk));
server.on('exit', code => { if (!finished && code) fail(new Error(`Server exited with ${code}`)); });
