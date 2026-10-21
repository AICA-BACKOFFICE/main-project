// 인사교 백오피스 프로젝트 실행 — 루트에서:
//   npm start            관리자 페이지(백오피스 http://127.0.0.1:8080/)와 사이트(프론트오피스 http://127.0.0.1:4181/)를 같이 켜요
//   npm run backoffice   관리자 페이지만
//   npm run front        사이트만
// 이 창을 닫거나 Ctrl+C 를 누르면 같이 꺼져요. 예전 백오피스.cmd · 프론트오피스.cmd(.command)가 하던 일을 그대로 해요.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backend = join(root, 'backend');
const frontend = join(root, 'frontend');
const win = process.platform === 'win32';
const which = process.argv[2] || 'all';
const children = [];

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** JAVA_HOME이 맞으면 그것, Windows에서 없으면 Android Studio에 들어 있는 Java, 그것도 없으면 PATH의 java */
function javaHome() {
  const exe = home => join(home, 'bin', win ? 'java.exe' : 'java');
  if (process.env.JAVA_HOME && existsSync(exe(process.env.JAVA_HOME))) return process.env.JAVA_HOME;
  const studio = 'C:\\Program Files\\Android\\Android Studio\\jbr';
  if (win && existsSync(exe(studio))) return studio;
  return undefined;
}

function javaMajor(home) {
  const java = home ? join(home, 'bin', win ? 'java.exe' : 'java') : 'java';
  const result = spawnSync(java, ['-version'], { encoding: 'utf8' });
  if (result.error) return 0;
  const m = /version "(\d+)(?:\.(\d+))?/.exec((result.stderr || '') + (result.stdout || ''));
  if (!m) return 0;
  return m[1] === '1' ? Number(m[2]) : Number(m[1]);
}

function run(name, command, args, options) {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  child.on('error', error => console.error(`${name}: ${error.message}`));
  child.on('exit', code => {
    if (code) console.error(`${name}이(가) 꺼졌어요(코드 ${code}).`);
  });
  children.push(child);
  return child;
}

/** 서버가 준비되면 관리자 페이지를 브라우저로 열어요. 그사이 이미 열어 둔 창에서 관리자 화면을 열었으면 새 창은 열지 않아요 */
function openWhenReady(port) {
  const url = `http://127.0.0.1:${port}/`;
  const started = Date.now();
  const timer = setInterval(async () => {
    if (Date.now() - started > 20 * 60 * 1000) { clearInterval(timer); return; }
    let seen;
    try {
      seen = await (await fetch(url + 'launcher/browser-seen')).text();
    } catch {
      return;   // 아직 켜지는 중
    }
    clearInterval(timer);
    if (seen.includes('true')) return;
    const opener = win ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    spawn(opener[0], opener[1], { stdio: 'ignore', detached: true }).unref();
  }, 500);
}

function startBackoffice() {
  const home = javaHome();
  const major = javaMajor(home);
  if (!major) fail('Java를 찾지 못했어요. https://adoptium.net 에서 Temurin 17 또는 21을 설치한 뒤 다시 실행해 주세요.');
  if (major < 17) fail(`Java ${major}이(가) 깔려 있어요. 백오피스는 Java 17 이상이 필요해요. https://adoptium.net`);
  const port = process.env.BACKOFFICE_PORT || '8080';
  const env = {
    ...process.env,
    ...(home ? { JAVA_HOME: home } : {}),
    BACKOFFICE_PORT: port,
    BACKOFFICE_SITE_ROOT: process.env.BACKOFFICE_SITE_ROOT || frontend,
    BACKOFFICE_FRONT_URL: process.env.BACKOFFICE_FRONT_URL || 'http://127.0.0.1:4181/'
  };
  // 지운 파일(없앤 화면 · DB 연결 파일 등)이 예전 빌드 결과물(target/classes)에 남아 있으면 백오피스가 켜지지 않아요. 켤 때마다 비우고 새로 만들어요.
  rmSync(join(backend, 'target', 'classes'), { recursive: true, force: true });
  if (!win) spawnSync('chmod', ['+x', join(backend, 'mvnw')]);
  console.log(`백오피스(관리자 페이지): http://127.0.0.1:${port}/  — 처음 켤 때는 Maven과 부품을 받느라 몇 분 걸려요`);
  console.log(`고치는 사이트 폴더: ${env.BACKOFFICE_SITE_ROOT}`);
  // Windows는 '.\' 를 붙여야 이 폴더의 mvnw.cmd 를 찾아요(현재 폴더 실행을 막아 둔 PC도 있음)
  if (win) run('백오피스', '.\\mvnw.cmd -B -ntp -Pdev compile exec:java', [], { cwd: backend, env, shell: true });
  else run('백오피스', './mvnw', ['-B', '-ntp', '-Pdev', 'compile', 'exec:java'], { cwd: backend, env });
  if (process.env.BACKOFFICE_NO_BROWSER !== '1') openWhenReady(port);
}

function startFront() {
  const port = process.env.FRONT_PORT || '4181';
  console.log(`프론트오피스(사이트): http://127.0.0.1:${port}/`);
  const args = [join(root, 'scripts', 'front-server', 'server.cjs'), '--port', port, '--dist', frontend];
  if (process.env.BACKOFFICE_NO_BROWSER !== '1') args.push('--open');
  run('사이트 서버', process.execPath, args, { cwd: root });
}

if (!['all', 'backoffice', 'front'].includes(which)) fail('사용법: npm start · npm run backoffice · npm run front');
if (which !== 'front') startBackoffice();
if (which !== 'backoffice') startFront();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const child of children) if (!child.killed) child.kill(signal);
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
