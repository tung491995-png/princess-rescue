const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

function parseGlb(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2 || buffer.readUInt32LE(8) !== buffer.length) {
    throw new Error(`Invalid GLB: ${file}`);
  }
  let offset = 12, document, binaryOffset = -1;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset), type = buffer.readUInt32LE(offset + 4); offset += 8;
    if (type === 0x4e4f534a) document = JSON.parse(buffer.subarray(offset, offset + length).toString('utf8').trim());
    if (type === 0x004e4942) binaryOffset = offset;
    offset += length;
  }
  if (!document || binaryOffset < 0) throw new Error(`Missing GLB chunks: ${file}`);
  let vertices = 0, triangles = 0;
  for (const mesh of document.meshes || []) for (const primitive of mesh.primitives || []) {
    const position = document.accessors[primitive.attributes.POSITION];
    const indices = document.accessors[primitive.indices];
    vertices += position.count; triangles += indices.count / 3;
  }
  const jpegSize = image => {
    const view = document.bufferViews[image.bufferView];
    const start = binaryOffset + (view.byteOffset || 0), end = start + view.byteLength;
    let cursor = start + 2;
    while (cursor + 9 < end) {
      if (buffer[cursor] !== 0xff) { cursor++; continue; }
      const marker = buffer[cursor + 1];
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        return [buffer.readUInt16BE(cursor + 7), buffer.readUInt16BE(cursor + 5)];
      }
      if (marker === 0xd8 || marker === 0xd9) { cursor += 2; continue; }
      const length = buffer.readUInt16BE(cursor + 2); if (length < 2) break; cursor += 2 + length;
    }
    return [0, 0];
  };
  return {
    bytes: buffer.length,
    vertices,
    triangles,
    images: (document.images || []).map(image => ({ mimeType: image.mimeType, size: jpegSize(image) })),
    animations: document.animations?.length || 0,
    skins: document.skins?.length || 0,
    nodes: document.nodes?.map(node => node.name || '') || []
  };
}

function auditLeftHandAcrossClips(file) {
  const THREE = require(path.join(root, 'public', 'vendor', 'three-r128', 'three.min.js'));
  const buffer = fs.readFileSync(file); let offset = 12, document, binaryOffset = -1;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset), type = buffer.readUInt32LE(offset + 4); offset += 8;
    if (type === 0x4e4f534a) document = JSON.parse(buffer.subarray(offset, offset + length).toString('utf8').trim());
    if (type === 0x004e4942) binaryOffset = offset;
    offset += length;
  }
  const columns = { SCALAR: 1, VEC3: 3, VEC4: 4 };
  const component = { 5126: { bytes: 4, read: (at) => buffer.readFloatLE(at) } };
  const accessor = index => {
    const a = document.accessors[index], view = document.bufferViews[a.bufferView], kind = component[a.componentType];
    if (!kind) throw new Error(`Unsupported animation component type ${a.componentType}`);
    const width = columns[a.type], stride = view.byteStride || width * kind.bytes;
    const start = binaryOffset + (view.byteOffset || 0) + (a.byteOffset || 0);
    return Array.from({ length: a.count }, (_, row) => Array.from({ length: width }, (_, col) => kind.read(start + row * stride + col * kind.bytes)));
  };
  const handIndex = document.nodes.findIndex(node => node.name === 'L_Hand');
  if (handIndex < 0) throw new Error('L_Hand not found');
  const parents = Array(document.nodes.length).fill(-1);
  document.nodes.forEach((node, parent) => (node.children || []).forEach(child => { parents[child] = parent; }));
  const bind = document.nodes.map(node => ({
    p: new THREE.Vector3(...(node.translation || [0, 0, 0])),
    q: new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1])),
    s: new THREE.Vector3(...(node.scale || [1, 1, 1]))
  }));
  const meshPosition = document.accessors[document.meshes[0].primitives[0].attributes.POSITION];
  const meshHeight = meshPosition.max[1] - meshPosition.min[1];
  const modelScale = 4.45 / (meshHeight * 1.12);
  let samples = 0, maxHandDistance = 0;
  for (const animation of document.animations) {
    const sampledSamplers = animation.samplers.map(sampler => ({
      input: accessor(sampler.input).map(row => row[0]), output: accessor(sampler.output), interpolation: sampler.interpolation || 'LINEAR'
    }));
    const duration = Math.max(...sampledSamplers.flatMap(sampler => sampler.input));
    for (const fraction of [0, .2, .5, .8, .98]) {
      const time = duration * fraction;
      const local = bind.map(item => ({ p: item.p.clone(), q: item.q.clone(), s: item.s.clone() }));
      for (const channel of animation.channels) {
        if (!['translation', 'rotation', 'scale'].includes(channel.target.path)) continue;
        const sampler = sampledSamplers[channel.sampler], times = sampler.input;
        let upper = times.findIndex(value => value >= time); if (upper < 0) upper = times.length - 1;
        const lower = Math.max(0, upper - 1), span = Math.max(1e-8, times[upper] - times[lower]);
        const alpha = sampler.interpolation === 'STEP' ? 0 : Math.max(0, Math.min(1, (time - times[lower]) / span));
        const from = sampler.output[lower], to = sampler.output[upper], target = local[channel.target.node];
        if (channel.target.path === 'rotation') {
          target.q.fromArray(from).slerp(new THREE.Quaternion().fromArray(to), alpha).normalize();
        } else {
          const out = channel.target.path === 'translation' ? target.p : target.s;
          out.set(from[0] + (to[0] - from[0]) * alpha, from[1] + (to[1] - from[1]) * alpha, from[2] + (to[2] - from[2]) * alpha);
        }
      }
      const cache = new Map();
      const world = index => {
        if (cache.has(index)) return cache.get(index);
        const matrix = new THREE.Matrix4().compose(local[index].p, local[index].q, local[index].s);
        if (parents[index] >= 0) matrix.premultiply(world(parents[index]));
        cache.set(index, matrix); return matrix;
      };
      const hand = new THREE.Vector3().setFromMatrixPosition(world(handIndex)).multiplyScalar(modelScale);
      if (![hand.x, hand.y, hand.z].every(Number.isFinite) || Math.max(Math.abs(hand.x), Math.abs(hand.y), Math.abs(hand.z)) > 9) {
        throw new Error(`Unsafe L_Hand transform in ${animation.name}@${fraction}: ${hand.toArray()}`);
      }
      const orb = hand.clone(); orb.y += .14; orb.x -= .035;
      const torsoY = orb.y, planar = Math.hypot(orb.x, orb.z), torsoRadius = torsoY > 1.45 && torsoY < 3.75 ? .66 : .42;
      if (planar < torsoRadius) {
        const outX = planar > .001 ? orb.x / planar : -1, outZ = planar > .001 ? orb.z / planar : 0;
        orb.x += outX * (torsoRadius - planar); orb.z += outZ * (torsoRadius - planar);
      }
      const handDistance = orb.distanceTo(hand); maxHandDistance = Math.max(maxHandDistance, handDistance);
      if (!Number.isFinite(handDistance) || handDistance > 1.1) throw new Error(`Orb left-hand guard failed: ${animation.name}@${fraction} ${handDistance}`);
      samples++;
    }
  }
  return { samples, maxHandDistance };
}

for (const [index, match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()) {
  if (match[1].trim()) new vm.Script(match[1], { filename: `inline-${index}.js` });
}

const props = path.join(root, 'public', 'assets', 'props');
const orb = parseGlb(path.join(props, 'ma_vuong_orb_mobile.glb'));
const halo = parseGlb(path.join(props, 'ma_vuong_halo_mobile.glb'));
if (orb.bytes > 2_000_000 || orb.vertices < 12_000 || orb.vertices > 25_000 || orb.triangles < 25_000 || orb.triangles > 40_000) {
  throw new Error(`Orb mobile budget failed: ${JSON.stringify(orb)}`);
}
if (halo.bytes > 2_000_000 || halo.vertices !== 10122 || halo.triangles !== 14160) {
  throw new Error(`Halo mobile budget failed: ${JSON.stringify(halo)}`);
}
for (const [name, prop] of [['orb', orb], ['halo', halo]]) {
  if (prop.animations || prop.skins) throw new Error(`${name} must remain a static, hitbox-independent prop`);
  if (prop.images.length !== 3 || prop.images.some(image => image.mimeType !== 'image/jpeg' || image.size[0] > 1024 || image.size[1] > 1024)) {
    throw new Error(`${name} texture budget failed: ${JSON.stringify(prop.images)}`);
  }
}

const boss = parseGlb(path.join(root, 'public', 'assets', 'characters', 'ma_vuong_mat_ngu_root_locked.glb'));
if (!boss.nodes.includes('L_Hand')) throw new Error('Boss L_Hand socket bone is missing');
const handAudit = auditLeftHandAcrossClips(path.join(root, 'public', 'assets', 'characters', 'ma_vuong_mat_ngu_root_locked.glb'));
if (handAudit.samples !== 95) throw new Error(`Expected 95 left-hand animation samples, got ${handAudit.samples}`);
for (const fragment of [
  "rec.orbSocket.name='LeftHandOrbSocket'",
  "findRigNode(rec.model,['LeftHand'",
  "scene.add(armament.haloRoot,armament.orbRoot)",
  'await loadBossArmament(rec)',
  'updateBossArmament(dt,performance.now())',
  "runVisualPass('boss-armament'",
  "runVisualPass('death-armament'",
  'ORB_SOCKET_DRIFT',
  'ORB_TOO_FAR_FROM_HAND',
  'HALO_FOLLOW_DRIFT',
  'by+5.18'
]) {
  if (!html.includes(fragment)) throw new Error(`V10.15 source feature missing: ${fragment}`);
}
const loadStart = html.indexOf('async function loadRigAsset(roleName)');
const loadEnd = html.indexOf('\nfunction loadAllRiggedCharacters', loadStart);
const loadSource = html.slice(loadStart, loadEnd);
if (!(loadSource.indexOf('await loadBossArmament(rec)') < loadSource.indexOf('notifyBossAssetReady()'))) {
  throw new Error('Client reports ready before orb/halo finish loading');
}
if (html.includes('rec.orbSocket.add(armament.orbRoot)') || html.includes('boss.add(armament.haloRoot)')) {
  throw new Error('Orb/halo were joined to the skinned boss or hitbox root');
}

console.log(`V10.15 ORB HALO PASS · orb ${orb.triangles} tris/${orb.bytes} B · halo ${halo.triangles} tris/${halo.bytes} B · ${handAudit.samples} L_Hand samples (max ${handAudit.maxHandDistance.toFixed(3)}m) · hitbox independent`);
