const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');

const root = path.resolve(__dirname, '..');
const port = 3212;
const server = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), REDIS_URL: '' },
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
const timeout = setTimeout(() => fail(new Error('V10.12 smoke test timed out')), 10000);

async function run() {
  const diag = await fetch(`http://127.0.0.1:${port}/diag`).then(response => response.json());
  if (diag.websocketPath !== '/ws') throw new Error('WebSocket diagnostic mismatch');
  const asset = await fetch(`http://127.0.0.1:${port}/assets/characters/ma_vuong_mat_ngu.glb`);
  if (!asset.ok) throw new Error('Boss GLB was not served');
  const bytes = Number(asset.headers.get('content-length'));
  if (bytes < 8_000_000) throw new Error(`Unexpected boss GLB size: ${bytes}`);

  const hero = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const princess = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  let room = '';
  let heroStart = null;
  let princessStart = null;
  const close = () => { try { hero.close(); princess.close(); } catch {} };
  const check = () => {
    if (!heroStart || !princessStart) return;
    const state = heroStart;
    const remaining = state.introUntil - Date.now();
    if (remaining < 4500 || remaining > 5100) throw new Error(`Intro lock mismatch: ${remaining}ms`);
    if (state.boss?.hp !== 2200 || state.boss?.max !== 2200) throw new Error('Boss HP mismatch');
    console.log(`V10.12 SMOKE PASS · room ${room} · intro ${remaining}ms · boss 2200/2200 · GLB ${bytes} bytes`);
    clearTimeout(timeout); close(); stop(0);
  };
  hero.on('error', fail); princess.on('error', fail);
  hero.on('open', () => hero.send(JSON.stringify({ type: 'create' })));
  hero.on('message', buffer => {
    const message = JSON.parse(buffer);
    if (message.type === 'created') { room = message.code; if (princess.readyState === WebSocket.OPEN) princess.send(JSON.stringify({ type: 'join', code: room })); }
    if (message.type === 'start') { heroStart = message.state; check(); }
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
