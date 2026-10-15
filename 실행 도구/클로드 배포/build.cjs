'use strict';
// 인사교 사이트 시안(Claude 배포 링크) 빌드: 사이트(프론트오피스)와 편집 화면(백오피스)을 한 폴더로 모읍니다.
// 실행: node "실행 도구/클로드 배포/build.cjs" <출력 폴더> [사이트 폴더]   (백오피스 프로젝트 폴더에서. 사이트 폴더를 비우면 프론트오피스)
//   - 사이트 폴더(백오피스 프로젝트/프론트오피스)의 페이지를 복사하고, 각 페이지 <head> 바로 뒤에 common/js/aica-artifact.js를 넣어요.
//   - 편집 화면(이 폴더의 편집기/ — 백오피스의 static/js/page · css/page와 같은 편집기)을 admin/에 넣고, 저장·반영은 배포 링크의 틀(entry.html)이 맡도록 설정해요.
//   - entry.html(틀)에 편집할 페이지 · 편집기 옵션 · 그림 목록을 채워 넣어요.
//   - 올릴 파일 목록을 크기에 맞춰 나눈 <출력 폴더>.batches.json도 만들어요(한 번에 올릴 수 있는 크기가 정해져 있어요).
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('출력 폴더를 알려 주세요: node "실행 도구/클로드 배포/build.cjs" <출력 폴더>');
const SITE = path.resolve(process.argv[3] || path.resolve(__dirname, '..', '..', '프론트오피스'));
const SITE_CONFIG = path.join(__dirname, 'site.config.json');
const BO_PUBLIC = path.join(__dirname, '편집기');
const SITE_DIRS = ['about', 'check', 'common', 'home', 'life', 'stories'];
const LOADER_TAG = '<script src="../common/js/aica-artifact.js"></script>';
const IMAGE = /\.(png|jpe?g|webp|gif|avif|svg)$/i;
const BATCH_BYTES = 60 * 1000 * 1000;
const BATCH_FILES = 240;

const config = JSON.parse(fs.readFileSync(SITE_CONFIG, 'utf8'));
const scriptJson = value => JSON.stringify(value).replace(/</g, '\\u003c');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});
const rel = file => path.relative(OUT, file).split(path.sep).join('/');

// 1. 깨끗한 출력 폴더에 사이트를 복사
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const dir of SITE_DIRS) fs.cpSync(path.join(SITE, dir), path.join(OUT, dir), { recursive: true });

// 2. 페이지 스크립트를 넣고, 각 페이지 <head> 바로 뒤에 붙여요(원본 줄바꿈·글자는 그대로).
fs.copyFileSync(path.join(__dirname, 'aica-artifact.js'), path.join(OUT, 'common', 'js', 'aica-artifact.js'));
const htmlFiles = SITE_DIRS.flatMap(dir => walk(path.join(OUT, dir))).filter(file => /\.html$/i.test(file));
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const match = html.match(/<head(\s[^>]*)?>/i);
  if (!match) throw new Error(`<head>가 없어요: ${rel(file)}`);
  if (html.includes(LOADER_TAG)) throw new Error(`이미 스크립트가 들어 있어요: ${rel(file)}`);
  const at = match.index + match[0].length;
  fs.writeFileSync(file, html.slice(0, at) + LOADER_TAG + html.slice(at));
}

// 3. 편집 화면(백오피스)
const admin = path.join(OUT, 'admin');
fs.mkdirSync(admin, { recursive: true });
for (const name of ['admin.js', 'icons.js', 'photo-editor.js', 'canvas.js', 'canvas.css']) fs.copyFileSync(path.join(BO_PUBLIC, name), path.join(admin, name));
// 관리 화면 글꼴은 사이트에 들어 있는 프리텐다드를 써요(배포 링크 안의 상대 주소로).
const adminCss = fs.readFileSync(path.join(BO_PUBLIC, 'admin.css'), 'utf8')
  .replace(/url\('\/assets\/fonts\/([^']+)'\) format\('woff2'\), url\('\/common\/assets\/fonts\/[^']+'\) format\('woff2'\)/g, "url('../common/assets/fonts/$1') format('woff2')");
if (!adminCss.includes("url('../common/assets/fonts/")) throw new Error('관리 화면 글꼴 주소를 바꾸지 못했어요.');
fs.writeFileSync(path.join(admin, 'admin.css'), adminCss);
// 편집할 페이지: 관리자 페이지(카테고리 페이지 관리)와 같은 목록(site.config.json — 2026-10-14부터 이야기 하위 페이지 4개 포함)
const pages = config.pages.map(({ id, title, file, parent }) => (parent ? { id, title, file, parent } : { id, title, file }));
const pageOptions = {
  locked: config.locked || [], inert: config.inert || [], inertNotice: config.inertNotice || null, inertNotices: config.inertNotices || [],
  pageLevel: config.pageLevel || [], controlText: config.controlText || [],
  fonts: config.fonts || null, palette: config.palette || null
};
const adminConfig = {
  name: '인사교 사이트 편집',
  apiMode: 'shell', apiBase: '/__bo/api/', frontMode: 'shell', frontUrl: '../',
  pages: pages.map(page => ({ ...page, url: `../${page.file}`, path: page.file })),
  fonts: pageOptions.fonts, palette: pageOptions.palette,
  deployNote: '여기서 반영한 내용은 이 배포 링크의 ‘사이트 보기’에만 적용돼요. 컴퓨터의 사이트 폴더(프론트오피스)와 GitHub 공개 사이트는 바뀌지 않아요.',
  messages: { offline: '저장소에 연결하지 못했어요. 편집 내용은 이 브라우저에 보관 중이며, 연결되면 자동으로 저장돼요.' }
};
const adminHtml = fs.readFileSync(path.join(BO_PUBLIC, 'admin.html'), 'utf8')
  .replace(/(href|src)="\/__bo\//g, '$1="./')
  .replace('__BO_CONFIG__', () => scriptJson(adminConfig))
  .replace('__BO_TOKEN__', '')
  .replace('__BO_TITLE__', () => adminConfig.name);
if (/(href|src)="\/__bo\//.test(adminHtml) || /__BO_(CONFIG|TOKEN|TITLE)__/.test(adminHtml)) throw new Error('편집 화면 주소를 다 바꾸지 못했어요.');
fs.writeFileSync(path.join(admin, 'index.html'), adminHtml);

// 4. 틀(entry.html): 편집할 페이지 · 편집기 옵션 · 그림 목록 · 페이지 목록
const siteFiles = SITE_DIRS.flatMap(dir => walk(path.join(OUT, dir)));
const shellConfig = {
  pages, pageOptions, home: 'home/index.html', loaderTag: LOADER_TAG, builtAt: new Date().toISOString(),
  files: htmlFiles.map(rel).sort(),
  images: siteFiles.filter(file => IMAGE.test(file) && !/[\\/]fonts[\\/]/.test(file)).map(file => ({ file: rel(file), size: fs.statSync(file).size })).sort((a, b) => a.file.localeCompare(b.file))
};
const shell = fs.readFileSync(path.join(__dirname, 'shell.html'), 'utf8');
if (!shell.includes('/*BUILD:CONFIG*/null')) throw new Error('틀(shell.html)에 설정 자리가 없어요.');
fs.writeFileSync(path.join(OUT, 'entry.html'), shell.replace('/*BUILD:CONFIG*/null', () => scriptJson(shellConfig)));

// 5. 올릴 파일 목록(틀 entry.html은 페이지 자체로 따로 올려요)
const uploads = walk(OUT).filter(file => path.basename(file) !== 'entry.html').map(file => ({ path: rel(file), size: fs.statSync(file).size }))
  .sort((a, b) => b.size - a.size);
const batches = [];
for (const file of uploads) {
  let batch = batches.find(item => item.bytes + file.size <= BATCH_BYTES && item.files.length < BATCH_FILES);
  if (!batch) batches.push(batch = { bytes: 0, files: [] });
  batch.bytes += file.size;
  batch.files.push({ path: file.path });
}
fs.writeFileSync(`${OUT}.batches.json`, JSON.stringify(batches.map(batch => batch.files)));
console.log(`built ${OUT}`);
console.log(`pages with script: ${htmlFiles.length}, images: ${shellConfig.images.length}, files: ${uploads.length}`);
console.log(`batches: ${batches.map(batch => `${batch.files.length} files / ${(batch.bytes / 1e6).toFixed(1)}MB`).join(' · ')}`);
