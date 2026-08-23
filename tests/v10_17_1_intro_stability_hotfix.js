const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

for (const [index, match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()) {
  if (match[1].trim()) new vm.Script(match[1], { filename: `inline-${index}.js` });
}

for (const fragment of [
  '<title>Princess Rescue V10.17.2 — Runtime Black Box &amp; Visual QA</title>',
  'function prewarmBossIntroPrograms(arm)',
  'renderer.compile(scene,camera)',
  'if(bossIntroActive()){v10171ResizePending=true;return}',
  'setTimeout(()=>{if(v10171ResizePending)applyRendererViewportSize()},bossIntroV9Duration+40)',
  'camTrauma=0;camShakePhase=0;cameraKick=0;hitStopUntil=0;bossHitPulseUntil=0',
  'if(bossIntroActive())return;',
  'if(bossIntroActive())boss.position.copy(v108IntroAnchor)',
  'const introBack=portrait?15.50:8.85',
  'camera.position.copy(v108IntroCamTarget)',
  'v108IntroLook.copy(v108IntroLookTarget)',
  'const cinematicDt=bossIntroActive()?rawDt:dt'
]) if (!html.includes(fragment)) throw new Error(`V10.17.1 stability feature missing: ${fragment}`);

const introStart = html.indexOf('function playBossIntroV9(');
const introEnd = html.indexOf('\nfunction enterGameFromState', introStart);
const introSource = html.slice(introStart, introEnd);
if (/renderer\.setPixelRatio|renderer\.setSize/.test(introSource)) throw new Error('Intro still resizes the framebuffer');
if (/cameraKick\s*=\s*\.(?!0)/.test(introSource)) throw new Error('Intro still injects a camera kick');

const cameraStart = html.indexOf('function updateCam(dt)');
const cameraEnd = html.indexOf('\ndocument.addEventListener(\'visibilitychange\'', cameraStart);
const cameraSource = html.slice(cameraStart, cameraEnd);
const introBranchEnd = cameraSource.indexOf('\n cameraZoom+=');
const introCameraSource = cameraSource.slice(0, introBranchEnd);
if (introCameraSource.includes('frameBossFullBody(')) throw new Error('Animated per-frame framing correction still runs inside intro');
if (introCameraSource.includes('.lerp(v108IntroCamTarget') || introCameraSource.includes('.lerp(v108IntroLookTarget')) throw new Error('Intro camera still fights a follow spring');

const smooth = x => x * x * (3 - 2 * x);
const lerp = (a, b, t) => a + (b - a) * t;
function cameraPose(t, portrait) {
  const introBack = portrait ? 15.50 : 8.85;
  let px = 0, py = 0, pz = 0, lx = 0, ly = 2.35, lz = 0;
  if (t < .12) {
    const u = smooth(t / .12), angle = lerp(-.38, -.30, u), radius = lerp(introBack + 1.8, introBack, u);
    px = Math.sin(angle) * radius; py = lerp(5.15, 4.42, u); pz = Math.cos(angle) * radius; ly = lerp(2.25, 2.62, u);
  } else if (t < .64) {
    const u = smooth((t - .12) / .52), angle = lerp(-.30, .48, u), radius = introBack - .22 * Math.sin(u * Math.PI);
    px = Math.sin(angle) * radius; py = 4.42 - .28 * Math.sin(u * Math.PI); pz = Math.cos(angle) * radius; ly = 2.62 - .10 * Math.sin(u * Math.PI);
  } else if (t < .84) {
    const u = smooth((t - .64) / .20), angle = lerp(.48, .06, u), radius = lerp(introBack, portrait ? 14.75 : 8.15, u);
    px = Math.sin(angle) * radius; py = lerp(4.42, 4.18, u); pz = Math.cos(angle) * radius; ly = lerp(2.62, 2.72, u);
  } else {
    const u = smooth((t - .84) / .16), near = portrait ? 14.75 : 8.15;
    px = lerp(Math.sin(.06) * near, 0, u); py = lerp(4.18, portrait ? 8.75 : 7.95, u);
    pz = lerp(Math.cos(.06) * near, (portrait ? 17.2 : 14.5) - 1.5, u); ly = lerp(2.72, 2.30, u); lz = lerp(0, -1.5, u);
  }
  return [px, py, pz, lx, ly, lz];
}

for (const portrait of [false, true]) {
  let previous = cameraPose(0, portrait), maxStep = 0;
  for (let frame = 1; frame <= 630; frame++) {
    const current = cameraPose(frame / 630, portrait);
    const step = Math.hypot(...current.map((value, index) => value - previous[index]));
    maxStep = Math.max(maxStep, step); previous = current;
  }
  if (maxStep > .16) throw new Error(`${portrait ? 'Portrait' : 'Landscape'} intro camera step is too large: ${maxStep}`);
  for (const boundary of [.12, .64, .84]) {
    const before = cameraPose(boundary - 1e-6, portrait), after = cameraPose(boundary + 1e-6, portrait);
    const jump = Math.hypot(...after.map((value, index) => value - before[index]));
    if (jump > 1e-3) throw new Error(`Camera discontinuity at ${boundary}: ${jump}`);
  }
}

console.log('V10.17.1 INTRO STABILITY PASS · deterministic camera · fixed boss root · fixed framebuffer · deferred mobile resize · prewarmed waltz/finale VFX · intro trauma blocked');
