'use strict';
// 인사교 프론트오피스(실제 사이트) 로컬 서버.
// 사이트 폴더(기본 dist)를 배포될 모습 그대로 보여 주고, 파일이 바뀌면(백오피스에서 반영 등) 열린 화면을 자동으로 새로고침합니다.
// 실행: node frontoffice/server.cjs [--port 4181] [--dist 사이트폴더] [--page about/] [--open]
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { exec } = require('node:child_process');
const { pipeline } = require('node:stream');

const APP_ID = 'insagyo-frontoffice';
const LIVE_SCRIPT = path.join(__dirname, 'live.js');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.webm': 'video/webm'
};
const time = (date = new Date()) => [date.getHours(), date.getMinutes(), date.getSeconds()].map(value => String(value).padStart(2, '0')).join(':');

function openInBrowser(url) {
  const command = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(command);
}

// 이 주소에서 이미 프론트오피스가 돌고 있는지 확인합니다(백오피스도 이 함수로 연결 상태를 봅니다).
async function checkFrontOffice(port, timeout = 1200) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/__front/health`, { signal: AbortSignal.timeout(timeout) });
    const body = await response.json();
    return body.app === APP_ID ? body : null;
  } catch {
    return null;
  }
}

function start({ port = 4181, distRoot = path.resolve(__dirname, '..', 'dist'), log = message => console.log(message) } = {}) {
  distRoot = path.resolve(distRoot);
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const url = `http://127.0.0.1:${port}/`;
  const clients = new Set();
  const bootId = Date.now().toString(36);
  let revision = 0;
  let version = `${bootId}-0`;
  let pendingFiles = new Set();
  let notifyTimer = 0;

  // 짧은 시간에 여러 파일이 바뀌어도(임시 파일 → 이름 바꾸기 등) 한 번만 새로고침하도록 묶습니다.
  function notify(file = 'index.html') {
    pendingFiles.add(file);
    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => {
      revision += 1;
      version = `${bootId}-${revision}`;
      const files = [...pendingFiles];
      pendingFiles = new Set();
      const payload = `event: change\ndata: ${JSON.stringify({ version, files })}\n\n`;
      for (const res of clients) res.write(payload);
      log(`[${time()}] 프론트오피스: ${files.slice(0, 3).join(', ')}${files.length > 3 ? ` 외 ${files.length - 3}개` : ''} 변경 → 열린 화면 ${clients.size}개 새로고침`);
    }, 250);
  }

  // 윈도우는 파일을 읽기만 해도(접근 시각 기록) 변경 신호를 보내므로,
  // 수정 시각·크기·생성 시각이 실제로 달라진 파일만 바뀐 것으로 봅니다.
  const signatures = new Map();
  const signatureOf = stat => `${stat.mtimeMs}:${stat.size}:${stat.birthtimeMs}`;
  async function scan(dir) {
    let entries = [];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && (entry.name.startsWith('.') || entry.name === 'node_modules')) continue;
      if (entry.isDirectory()) await scan(full);
      else if (entry.isFile()) {
        try { signatures.set(full, signatureOf(await fsp.stat(full))); } catch {}
      }
    }
  }
  const scanned = scan(distRoot);

  async function handleWatch(name) {
    await scanned;
    const full = path.join(distRoot, name);
    let stat = null;
    try { stat = await fsp.stat(full); } catch {}
    if (stat && !stat.isFile()) return;
    const next = stat ? signatureOf(stat) : null;
    if (next === (signatures.get(full) ?? null)) return;
    if (next) signatures.set(full, next);
    else signatures.delete(full);
    notify(name);
  }

  let watcher = null;
  try {
    watcher = fs.watch(distRoot, { recursive: true }, (event, filename) => {
      if (!filename) return notify('dist');
      const name = String(filename).split(path.sep).join('/');
      // 임시 파일, 폴더 자체의 변경, 아직 페이지에 쓰이지 않은 새 업로드 이미지(페이지 폴더마다 assets/uploads),
      // .git 같은 숨김 폴더(커밋할 때 바뀜)는 새로고침 대상이 아닙니다.
      if (!path.extname(name) || name.endsWith('.tmp') || /(^|\/)assets\/uploads\//.test(name) || /(^|\/)(\.|node_modules\/)/.test(name)) return;
      handleWatch(name).catch(() => {});
    });
    watcher.on('error', () => {});
  } catch {
    log('프론트오피스: 파일 변경 감시를 켜지 못했어요. 바뀐 내용은 새로고침하면 보여요.');
  }

  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
  }, 20000);
  heartbeat.unref();

  async function serveStatic(req, res, pathname) {
    let target = path.resolve(distRoot, '.' + pathname);
    if ((target !== distRoot && !target.startsWith(distRoot + path.sep)) || /(^|\/)\./.test(pathname)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    let stat;
    try { stat = await fsp.stat(target); } catch { stat = null; }
    // 폴더 주소(/about/)는 그 폴더의 index.html을 보여 줍니다(배포된 사이트와 같게). 끝에 /가 없으면 붙여서 다시 엽니다.
    if (stat?.isDirectory()) {
      if (!pathname.endsWith('/')) {
        res.writeHead(301, { Location: encodeURI(`${pathname}/`) });
        return res.end();
      }
      target = path.join(target, 'index.html');
      try { stat = await fsp.stat(target); } catch { stat = null; }
    }
    if (!stat || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    const ext = path.extname(target).toLowerCase();
    if (ext === '.html') {
      // 로컬에서 볼 때만 자동 새로고침 스크립트를 붙입니다. dist 파일 자체는 바꾸지 않습니다.
      const html = await fsp.readFile(target, 'utf8');
      const tag = `<script src="/__front/live.js" data-version="${version}" defer></script>`;
      const end = html.toLowerCase().lastIndexOf('</body>');
      const body = end >= 0 ? html.slice(0, end) + tag + html.slice(end) : html + tag;
      res.writeHead(200, { 'Content-Type': types['.html'], 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const headers = { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: etag };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    if (req.method === 'HEAD') return res.end();
    // 받는 쪽이 중간에 끊겨도 파일을 꼭 닫아요(안 닫으면 윈도우에서 백오피스가 이 파일을 다시 쓰지 못해요)
    pipeline(fs.createReadStream(target), res, () => {});
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (!allowedHosts.has(req.headers.host)) {
        res.writeHead(403);
        return res.end('Forbidden host');
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405);
        return res.end('Method not allowed');
      }
      let pathname;
      try { pathname = decodeURIComponent(new URL(req.url, url).pathname); } catch {
        res.writeHead(400);
        return res.end('Bad request');
      }

      if (pathname === '/__front/health') {
        res.writeHead(200, { 'Content-Type': types['.json'], 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({ ok: true, app: APP_ID, url, version, clients: clients.size }));
      }
      if (pathname === '/__front/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write(`retry: 1500\nevent: hello\ndata: ${JSON.stringify({ version })}\n\n`);
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }
      if (pathname === '/__front/live.js') {
        res.writeHead(200, { 'Content-Type': types['.js'], 'Cache-Control': 'no-cache' });
        return res.end(await fsp.readFile(LIVE_SCRIPT));
      }
      return await serveStatic(req, res, pathname);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('서버 오류가 발생했어요.');
      } else {
        res.destroy();
      }
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', error => {
      watcher?.close();
      clearInterval(heartbeat);
      reject(error);
    });
    server.listen(port, '127.0.0.1', () => {
      resolve({
        url,
        notify,
        clientCount: () => clients.size,
        close() {
          watcher?.close();
          clearInterval(heartbeat);
          for (const res of clients) res.end();
          server.close();
        }
      });
    });
  });
}

// 명령줄 실행(프론트오피스.cmd, 미리보기.cmd → preview.cjs)
function runCli(args = process.argv.slice(2)) {
  const option = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const port = Number(option('--port') || args.find(arg => /^\d+$/.test(arg)) || 4181);
  const distRoot = option('--dist');
  const open = args.includes('--open');
  // --page about/ 처럼 주면 그 페이지를 엽니다(여러 페이지 사이트).
  const pagePath = String(option('--page') || '').replace(/^\/+/, '');
  const openUrl = base => new URL(pagePath, base).href;
  return start({ port, ...(distRoot ? { distRoot } : {}) }).then(front => {
    console.log(`프론트오피스(실제 사이트): ${openUrl(front.url)}`);
    console.log(`Preview: ${front.url} (Ctrl+C to stop)`);
    console.log('백오피스에서 ‘사이트에 반영’하면 열린 화면이 자동으로 새로고침돼요. 종료하려면 Ctrl+C를 누르세요.');
    if (open) openInBrowser(openUrl(front.url));
  }, async error => {
    process.exitCode = 1;
    if (error.code !== 'EADDRINUSE') return console.error(error);
    if (await checkFrontOffice(port)) {
      process.exitCode = 0;
      console.log(`프론트오피스가 이미 켜져 있어 그 화면을 열었어요: ${openUrl(`http://127.0.0.1:${port}/`)}`);
      if (open) openInBrowser(openUrl(`http://127.0.0.1:${port}/`));
    } else {
      console.error(`${port}번 포트를 다른 프로그램(예전 미리보기 서버 등)이 사용 중이에요. 그 창을 닫고 다시 실행해 주세요.`);
    }
  });
}

module.exports = { start, checkFrontOffice, runCli, time, APP_ID };

if (require.main === module) runCli();
