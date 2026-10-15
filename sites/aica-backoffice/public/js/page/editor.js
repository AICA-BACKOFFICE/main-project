'use strict';
// 인사교 백오피스 화면: 편집 캔버스(iframe)를 띄우고, 실행 취소 기록·임시저장·사이트 반영·편집 도구 막대를 관리합니다.

// 서버가 넣어 주는 설정: 보안 토큰(또는 관리자 화면의 CSRF), API 주소, 프론트오피스 주소, 사이트 이름, 편집할 페이지 목록, 글꼴·색 목록
// 혼자 도는 백오피스(Node)와 관리자 페이지(Spring) 안에 붙인 백오피스가 같은 파일을 씁니다.
const BO = JSON.parse(document.getElementById('bo-config').textContent);
let token = BO.token;
const API_BASE = BO.apiBase || '/__bo/api/';
// front.mode: 'server' = 따로 도는 프론트오피스(상태 확인·자동 새로고침), 'static' = 반영된 페이지 주소만 엶,
// 'shell' = Claude 배포 링크의 ‘사이트 보기’ 탭에서 엶
const FRONT_MODE = BO.frontMode || 'server';
const PAGES = BO.pages;
const pageById = id => PAGES.find(page => page.id === id) || PAGES[0];
const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const pad = value => String(value).padStart(2, '0');
const clock = date => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const fullTime = date => `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${clock(date)}:${pad(date.getSeconds())}`;
const sizeText = bytes => (bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`);

const ICON = {
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  box: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 10h16"/>',
  graphic: '<path d="m12 3 2.6 5.6L20 9.4l-4 4 1 5.6-5-2.8L7 19l1-5.6-4-4 5.4-.8z"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/>',
  parent: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5A5.5 5.5 0 0 1 20 14.5 5.5 5.5 0 0 1 14.5 20H11"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  eye: '<path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"/><circle cx="12" cy="12" r="3"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.5M12 17h.01"/>',
  move: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
  attach: '<path d="m20 11-8.2 8.2a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.2 8.2a2 2 0 0 1-2.8-2.8L14.5 7"/>',
  video: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  warning: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>',
  pointer: '<path d="m5 4 6.5 16 2.3-6.7L20.5 11z"/>',
  eraser: '<path d="m7 20-4-4L14 5l7 7-8 8z"/><path d="M7 20h13M9 10l7 7"/>',
  'align-left': '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
  'align-center': '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  'align-right': '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;

// 처음 열 페이지: 서버가 정해 준 페이지(관리자 페이지의 메뉴 주소) → 주소의 #page=… → 지난번에 보던 페이지 → 첫 페이지
const initialPage = (() => {
  if (BO.initialPage && PAGES.some(page => page.id === BO.initialPage)) return BO.initialPage;
  const fromHash = new URLSearchParams(location.hash.slice(1)).get('page');
  let remembered = null;
  try { remembered = localStorage.getItem('bo-page'); } catch {}
  return [fromHash, remembered].find(id => id && PAGES.some(page => page.id === id)) || PAGES[0].id;
})();

const state = {
  pageId: initialPage,
  histories: {},
  mode: 'edit',
  device: 'pc',
  frame: null,
  canvas: null,
  pending: null,
  history: [],
  index: -1,
  queuedPage: null,
  info: null,
  panelKey: '',
  panelTarget: null,
  openPop: null,
  server: null,
  queued: null,
  saving: false,
  saveError: null,
  saveTimer: 0,
  saveChain: Promise.resolve(),
  navigating: false,
  switchingPage: false,
  coalesceKey: null,
  pickResolve: null,
  alignChoice: null, // { id, x, y }: 맞춤 기준으로 고른 이웃(같은 요소를 선택하고 있는 동안 기억)
  assets: null,
  // 페이지마다 편집을 시작한 사이트 파일의 지문: 그사이 FAQ 관리 등 다른 곳에서 바뀐 걸 반영 때 알아채려고
  bases: {}
};

const OFFLINE_MESSAGE = BO.messages?.offline || '백오피스 서버에 연결할 수 없어요. ‘백오피스.cmd’ 창이 켜져 있는지 확인해 주세요. 편집 내용은 이 화면에 보관 중이며, 서버가 다시 켜지면 자동으로 저장돼요.';
const LOGIN_MESSAGE = BO.messages?.login || '로그인이 끝났어요. 새 탭에서 관리자 페이지에 다시 로그인하면 이 화면의 편집 내용이 자동으로 저장돼요.';

// Claude 배포 링크(사이트 시안)에서는 서버 대신 바깥 틀(사이트 보기 · 편집하기 화면)이 저장·반영을 맡아요(apiMode·frontMode 'shell').
const shellOf = () => {
  for (let w = window.parent; ; w = w.parent) {
    try { if (w.AICA_SHELL) return w.AICA_SHELL; } catch {}
    if (w === w.parent) return null;
  }
};
const apiFetch = (url, init) => {
  if (BO.apiMode !== 'shell') return fetch(url, init);
  const shell = shellOf();
  return shell ? shell.fetch(url, init) : Promise.reject(new Error('shell'));
};

// 서버를 다시 켜면 보안 토큰이 바뀌므로, 열려 있던 화면이 새 토큰을 받아 이어서 저장하게 합니다.
async function refreshToken() {
  const html = await (await fetch('/admin', { cache: 'no-store' })).text();
  const match = html.match(/<script id="bo-config" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('보안 토큰을 받지 못했어요.');
  token = JSON.parse(match[1]).token;
}

// 페이지마다 따로 저장되는 요청에는 어느 페이지인지(page=…)를 붙입니다.
const PAGE_ROUTES = /^(state|draft|publish|backups|published|assets|upload|media-import)\b/;
async function api(path, options = {}, retried = false) {
  const { page, ...fetchOptions } = options;
  let url = `${API_BASE}${path}`;
  if (PAGE_ROUTES.test(path)) url += `${url.includes('?') ? '&' : '?'}page=${encodeURIComponent(page || state.pageId)}`;
  const headers = { ...(fetchOptions.headers || {}) };
  if (token) headers['X-BO-Token'] = token;
  if (BO.csrf?.token) headers[BO.csrf.header || 'X-CSRF-TOKEN'] = BO.csrf.token;
  let response;
  try {
    response = await apiFetch(url, { ...fetchOptions, headers, credentials: 'same-origin' });
  } catch {
    throw Object.assign(new Error(OFFLINE_MESSAGE), { offline: true });
  }
  // 관리자 페이지에 붙인 경우: 로그인이 끝났으면 다시 로그인하도록 알립니다(편집 내용은 이 브라우저에 보관돼 있다가 다시 저장돼요).
  if (response.status === 401 || (response.redirected && /\/login(\?|$)/.test(response.url))) {
    throw Object.assign(new Error(LOGIN_MESSAGE), { offline: true, login: true });
  }
  const type = response.headers.get('content-type') || '';
  const body = type.includes('json') ? await response.json() : await response.text();
  if (response.status === 403 && body?.code === 'token' && !retried) {
    try { await refreshToken(); } catch { throw Object.assign(new Error(OFFLINE_MESSAGE), { offline: true }); }
    return api(path, options, true);
  }
  if (response.status === 403 && BO.csrf && !body?.error) {
    throw Object.assign(new Error('보안 확인이 만료됐어요. 화면을 새로고침해 주세요(편집 내용은 이 브라우저에 보관돼요).'), { offline: true, login: true });
  }
  if (!response.ok) throw Object.assign(new Error((body && body.error) || `요청이 실패했어요 (${response.status})`), { status: response.status, code: body?.code });
  return body;
}

// 서버에 저장되기 전의 편집 내용을 브라우저에도 남겨, 연결이 끊긴 채 창을 닫아도 다시 열 때 복구할 수 있게 합니다.
// 예전 한 페이지 버전(index)은 이전 이름을 그대로 씁니다.
const unsavedKey = (page = state.pageId) => (page === 'index' ? 'bo-unsaved-edit' : `bo-unsaved-edit:${page}`);
function rememberUnsaved(html, label) {
  try { localStorage.setItem(unsavedKey(), JSON.stringify({ html, label, at: Date.now() })); } catch {}
}
function readUnsaved(page) {
  try { return JSON.parse(localStorage.getItem(unsavedKey(page)) || 'null'); } catch { return null; }
}
function clearUnsaved(html, page = state.pageId) {
  try {
    if (html === undefined || readUnsaved(page)?.html === html) localStorage.removeItem(unsavedKey(page));
  } catch {}
}

// ── 알림 ──
function toast(message, type = '', action) {
  const region = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.append(message);
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    button.addEventListener('click', () => { action.run(); el.remove(); });
    el.append(button);
  }
  region.append(el);
  while (region.children.length > 3) region.firstElementChild.remove();
  setTimeout(() => el.remove(), type === 'error' ? 6500 : action ? 5000 : 3200);
}

// ── 저장 상태 ──
function renderStatus() {
  const el = $('#status');
  let mode = 'clean';
  let text = '사이트와 같아요';
  if (state.saveError) { mode = 'error'; text = state.saveError.login ? '다시 로그인 필요' : state.saveError.offline ? '서버 연결 끊김' : '저장 실패 · 재시도 중'; }
  else if (state.saving || state.queued !== null) { mode = 'saving'; text = '저장 중…'; }
  else if (state.server?.hasDraft) { mode = 'dirty'; text = '반영 전 변경 있음'; }
  el.dataset.state = mode;
  el.querySelector('span').textContent = text;
  if (state.saveError) {
    el.title = state.saveError.message;
    return;
  }
  el.title = state.server?.draftSavedAt ? `편집 내용은 자동으로 임시저장돼요. 마지막 저장: ${fullTime(new Date(state.server.draftSavedAt))}
‘사이트에 반영’을 눌러야 실제 페이지가 바뀌어요.` : '편집 내용은 자동으로 임시저장돼요.';
}

// 저장할 내용과 함께 어느 페이지의 내용인지 기억해, 저장이 늦어져도 다른 페이지에 잘못 쓰지 않게 합니다.
function queueSave(html) {
  state.queued = html;
  state.queuedPage = state.pageId;
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(flushSave, 600);
  renderStatus();
}

function flushSave() {
  clearTimeout(state.saveTimer);
  if (state.queued === null) return state.saveChain;
  const html = state.queued;
  const page = state.queuedPage || state.pageId;
  state.queued = null;
  state.saving = true;
  renderStatus();
  state.saveChain = state.saveChain.then(async () => {
    try {
      const base = state.bases[page];
      const result = await api(`draft${base ? `?base=${encodeURIComponent(base)}` : ''}`, { method: 'PUT', body: html, page, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      if (page === state.pageId) state.server = result;
      if (state.saveError) toast('서버에 다시 연결되어 임시저장했어요.', 'success');
      state.saveError = null;
      clearUnsaved(html, page);
      refreshPageList();
    } catch (error) {
      // 같은 실패를 4초마다 반복해서 알리지 않도록, 원인이 바뀔 때만 알립니다.
      if (state.saveError?.message !== error.message) toast(`임시저장하지 못했어요: ${error.message}`, 'error');
      state.saveError = error;
      if (state.queued === null) {
        state.queued = html;
        state.queuedPage = page;
        state.saveTimer = setTimeout(flushSave, 4000);
      }
    } finally {
      state.saving = false;
      renderStatus();
    }
  });
  return state.saveChain;
}

async function saveNow(html) {
  state.queued = html;
  state.queuedPage = state.pageId;
  await flushSave();
  return !state.saveError;
}

// ── 실행 취소 기록 ──
function renderHistoryButtons() {
  $('#undo').disabled = state.index <= 0;
  $('#redo').disabled = state.index >= state.history.length - 1;
  const undoLabel = state.history[state.index]?.label;
  const redoLabel = state.history[state.index + 1]?.label;
  $('#undo').title = state.index > 0 ? `실행 취소: ${undoLabel} (Ctrl+Z)` : '실행 취소 (Ctrl+Z)';
  $('#redo').title = redoLabel ? `다시 실행: ${redoLabel} (Ctrl+Shift+Z)` : '다시 실행 (Ctrl+Shift+Z)';
}

async function commit({ html, label, reload, selectPath, coalesce }) {
  const last = state.history[state.index];
  const key = coalesce || state.coalesceKey;
  state.coalesceKey = null;
  if (last && last.html === html && !reload) return;
  if (key && last && last.key === key && Date.now() - last.at < 4000) {
    last.html = html;
    last.at = Date.now();
    state.history.length = state.index + 1;
  } else {
    state.history.length = state.index + 1;
    state.history.push({ html, label, key, at: Date.now() });
    if (state.history.length > 120) state.history.shift();
    state.index = state.history.length - 1;
  }
  renderHistoryButtons();
  rememberUnsaved(html, label);
  if (/ 삭제$/.test(label)) toast(`‘${label.replace(/ 삭제$/, '')}’ 항목을 삭제했어요.`, '', { label: '실행 취소', run: undo });
  if (reload) {
    if (await saveNow(html)) await loadCanvas({ selectPath });
  } else {
    queueSave(html);
  }
}

async function goTo(index, message) {
  if (index < 0 || index >= state.history.length || state.navigating) return;
  state.canvas?.flush();
  flushFields();
  state.navigating = true;
  state.index = index;
  renderHistoryButtons();
  try {
    if (await saveNow(state.history[index].html)) {
      await loadCanvas();
      if (message) toast(message);
    }
  } finally {
    state.navigating = false;
  }
}
const undo = () => {
  const label = state.history[state.index]?.label;
  if (state.index > 0) goTo(state.index - 1, `되돌렸어요: ${label}`);
};
const redo = () => {
  const label = state.history[state.index + 1]?.label;
  if (state.index < state.history.length - 1) goTo(state.index + 1, `다시 실행했어요: ${label}`);
};

// ── 편집 캔버스 ──
function currentScroll() {
  try { return state.frame?.contentWindow?.scrollY || 0; } catch { return 0; }
}

function loadCanvas({ selectPath = null, fresh = false } = {}) {
  const wrap = $('#frame-wrap');
  const scrollY = fresh ? 0 : currentScroll();
  state.pending?.frame.remove();
  const frame = document.createElement('iframe');
  frame.className = 'is-loading';
  frame.title = state.mode === 'edit' ? '페이지 편집 화면' : '페이지 미리보기';
  frame.src = `${pageById(state.pageId).url}?__bo=${state.mode}&v=${Date.now()}`;
  // Claude 배포 링크에서는 페이지 쪽 스크립트가 주소 대신 이 표시로 편집·미리보기를 알아봐요.
  frame.dataset.boMode = state.mode;
  // 탭 화면(선배들의 이야기 등)은 보던 탭(#위치)도 다시 열어 줍니다.
  let hash = '';
  if (!fresh) {
    try { hash = state.frame?.contentWindow?.location.hash || ''; } catch {}
  }
  const pending = { frame, scrollY, selectPath, hash, page: state.pageId };
  state.pending = pending;
  const ready = new Promise(resolve => { pending.resolve = resolve; });
  if (state.mode === 'preview') {
    frame.addEventListener('load', () => {
      try { frame.contentWindow.scrollTo({ top: scrollY, behavior: 'instant' }); } catch {}
      activate(pending, null);
    }, { once: true });
  }
  // 페이지가 오래 걸려도 화면이 비지 않도록 일정 시간 뒤에는 보여 줍니다.
  setTimeout(() => { if (state.pending === pending && state.mode === 'preview') activate(pending, null); }, 10000);
  wrap.append(frame);
  return ready;
}

function onCanvasReady(win) {
  const pending = state.pending;
  if (!pending || pending.frame.contentWindow !== win || pending.page !== state.pageId) return;
  const canvas = win.BO_CANVAS;
  if (!state.history.length) {
    state.history = [{ html: canvas.serialize(), label: '처음 불러온 상태', at: Date.now() }];
    state.index = 0;
    renderHistoryButtons();
  }
  canvas.restore({ scrollY: pending.scrollY, selectPath: pending.selectPath, hash: pending.hash });
  // 한두 프레임 그린 뒤 바꿔 끼워 깜박임을 없앱니다. 창이 가려져 프레임이 멈춘 경우를 위해 타이머도 둡니다.
  const show = () => activate(pending, canvas);
  requestAnimationFrame(() => requestAnimationFrame(show));
  setTimeout(show, 150);
}

function activate(pending, canvas) {
  if (state.pending !== pending) return;
  state.pending = null;
  const old = state.frame;
  state.frame = pending.frame;
  state.canvas = canvas;
  pending.frame.classList.remove('is-loading');
  old?.remove();
  $('#frame-loading').hidden = true;
  state.panelKey = '';
  renderPanel();
  pending.resolve?.();
}

window.BOShell = {
  // 캔버스마다 연결 손잡이를 따로 주어, 교체된 옛 화면의 신호는 무시합니다.
  // 페이지를 바꾸는 중에 옛 페이지 화면에서 생긴 변경이 새 페이지에 저장되지 않도록 어느 페이지 화면인지도 확인합니다.
  connect(win) {
    const page = state.pageId;
    const current = () => page === state.pageId && (state.frame?.contentWindow === win || state.pending?.frame.contentWindow === win);
    return {
      onCanvasReady: () => onCanvasReady(win),
      onSelect: info => { if (current()) { state.info = info; renderPanel(); } },
      commit: payload => { if (current()) commit(payload); },
      pickImage: title => pickImage(title),
      uploadFile: file => uploadFile(file),
      toast: (message, type) => toast(message, type),
      shortcut: name => { if (current()) shortcut(name); },
      openPage: href => { if (current()) openPageByUrl(href); }
    };
  }
};

// 편집 화면 안의 다른 페이지 링크: 그 주소가 편집하는 페이지 중 하나면 그 페이지 편집으로 넘어가요(아니면 그대로 — 편집 화면은 다른 곳으로 가지 않음)
function openPageByUrl(href) {
  let target;
  try { target = new URL(href, location.href); } catch { return; }
  const page = PAGES.find(p => {
    try { return new URL(p.url, location.href).pathname === target.pathname; } catch { return false; }
  });
  if (page && page.id !== state.pageId) switchPage(page.id);
}

function shortcut(name) {
  if (name === 'undo') undo();
  else if (name === 'redo') redo();
  else if (name === 'save') openPublish();
}

// ── 편집 도구 막대 (상단 바 아래) ──
// 고른 것에 맞는 도구를 한 줄로 보여 주고(넘치면 다음 줄), 색 · 위치 · 설명처럼 긴 것은 눌러서 펼치는 칸에 넣습니다.
// 펼친 칸은 같은 요소를 다시 그려도 열린 채로 두고(위치 버튼을 여러 번 누를 때 등), 다른 것을 고르면 닫습니다.
// 페이지 안의 그림 주소(assets/…)는 편집 중인 페이지 폴더 기준이므로 그 페이지 주소를 기준으로 풉니다.
const assetUrl = src => (/^(https?:|data:|\/)/.test(src) ? src : new URL(src, new URL(pageById(state.pageId).url, location.href)).href);
const isSvg = src => /\.svg(?:[?#]|$)/i.test(String(src || '')) || /^data:image\/svg/i.test(String(src || ''));
const fileName = src => decodeURIComponent(String(src).split(/[?#]/)[0].split('/').pop() || '');

const SEP = '<span class="tb-sep" aria-hidden="true"></span>';
const PHOTO_EDIT_TIP = '<h4>사진 편집</h4><p class="hint">‘사진 편집’에서 사진이 들어간 자리 비율에 맞춰 보일 부분을 자르고, 돌리거나 밝기 · 색을 바꿀 수 있어요. 편집한 사진은 새 파일로 저장되고 원래 사진은 그대로 남아요.</p>';
const CHEVRON = '<svg class="tb-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
// 눌러서 펼치는 칸: 단추를 누르면 아래에 열리고, 바깥 · 페이지를 누르거나 Esc를 누르면 닫혀요.
function pop(name, label, content, { title = '', panel = '', button = '', arrow = true } = {}) {
  return `<div class="tb-pop" data-pop="${name}">`
    + `<button type="button" class="tb-btn ${button}" data-pop-toggle aria-haspopup="dialog" aria-expanded="false"${title ? ` title="${esc(title)}"` : ''}>${label}${arrow ? CHEVRON : ''}</button>`
    + `<div class="tb-pop-panel ${panel}" role="dialog" aria-label="${esc(title || name)}" hidden>${content}</div></div>`;
}
// 설명은 막대 오른쪽 끝의 도움말 칸에 모아 둡니다.
const helpPop = (content, label = '도움말') => `<div class="tb-right">${pop('help', `${icon('help')}<span class="tb-hide">${label}</span>`, content, { title: label, panel: 'w-360' })}</div>`;
const SHORTCUTS = `
  <h4>단축키</h4>
  <ul class="tips">
    <li>실행 취소 <span><kbd>Ctrl</kbd> + <kbd>Z</kbd></span></li>
    <li>다시 실행 <span><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd></span></li>
    <li>선택 항목 복제 <span><kbd>Ctrl</kbd> + <kbd>D</kbd></span></li>
    <li>선택 항목 삭제 <kbd>Delete</kbd></li>
    <li>선택 해제 <kbd>Esc</kbd></li>
    <li>사이트에 반영 <span><kbd>Ctrl</kbd> + <kbd>S</kbd></span></li>
  </ul>`;

function renderPanel() {
  const body = $('#panel-body');
  const info = state.mode === 'preview' ? null : state.info;
  const key = state.mode === 'preview' ? 'preview' : info ? info.key : `page:${state.canvas ? 1 : 0}`;
  const active = document.activeElement;
  if (key === state.panelKey && body.contains(active) && active.matches('input, textarea, select')) return;
  flushFields();
  if (key !== state.panelKey) state.openPop = null;
  state.panelKey = key;
  state.panelTarget = info ? { id: info.id, kind: info.kind, explicit: info.explicit } : null;
  body.innerHTML = state.mode === 'preview' ? previewBar() : info ? selectionBar(info) : pageBar();
  if (state.openPop) openPop(state.openPop);
}

function openPop(name) {
  state.openPop = null;
  $('#panel-body').querySelectorAll('.tb-pop').forEach(box => {
    const open = box.dataset.pop === name;
    box.querySelector(':scope > [data-pop-toggle]').setAttribute('aria-expanded', String(open));
    box.querySelector(':scope > .tb-pop-panel').hidden = !open;
    if (open) state.openPop = name;
  });
  if (!state.openPop) return;
  placePop();
}
const closePops = () => openPop(null);
// 칸은 화면 기준으로 단추 바로 아래에 띄우고, 화면 밖으로 나가지 않게 맞춥니다.
function placePop() {
  const box = $(`#panel-body .tb-pop[data-pop="${state.openPop}"]`);
  if (!box) return;
  const button = box.querySelector(':scope > [data-pop-toggle]').getBoundingClientRect();
  const panel = box.querySelector(':scope > .tb-pop-panel');
  panel.style.left = `${Math.max(8, Math.min(button.left, innerWidth - panel.offsetWidth - 8))}px`;
  panel.style.top = `${button.bottom + 6}px`;
  panel.style.maxHeight = `${Math.max(160, innerHeight - button.bottom - 18)}px`;
}

function previewBar() {
  return `
    <span class="tb-note">${icon('eye')}<b>미리보기 중이에요</b><span class="tb-hide">반영 전 편집본을 실제 사이트처럼 움직여 봐요</span></span>
    ${SEP}
    <button type="button" class="tb-btn primary" data-act="to-edit">${icon('pencil')}편집으로 돌아가기</button>
    <button type="button" class="tb-btn" data-act="open-front">${icon('external')}프론트오피스 열기</button>
    ${helpPop(`
      <h4>미리보기</h4>
      <p class="hint">아직 반영하지 않은 편집본을 실제 사이트처럼 움직여 보는 화면이에요. 애니메이션, 메뉴, 갤러리를 확인한 뒤 ‘편집’으로 돌아가 수정하세요.</p>
      <h4>프론트오피스(실제 사이트)</h4>
      <p class="hint">실제 사이트는 ‘사이트에 반영’을 눌러야 바뀌어요. 반영하면 열어 둔 프론트오피스 화면이 자동으로 새로고침돼요.</p>`)}`;
}

function selectionBar(info) {
  const groups = [];
  const tips = [];
  const tools = [];

  if (info.kind === 'text') {
    tools.push(info.editing
      ? `<span class="tb-note live" title="다 고친 뒤 Esc를 누르거나 다른 곳을 클릭하면 저장돼요">${icon('pencil')}입력 중</span>`
      : `<button type="button" class="tb-btn" data-act="edit">${icon('pencil')}글자 편집</button>`);
    tips.push(info.plain ? `
      <h4>글자 고치기</h4>
      <p class="hint">글자만 쓰는 칸이에요. 페이지가 이 글자를 그대로 가져다 쓰기 때문에(검색·날짜 등) 일부 글자 서식과 줄바꿈은 넣을 수 없어요.</p>
      <ul class="tips"><li>편집 마치기 <span><kbd>Enter</kbd> 또는 <kbd>Esc</kbd></span></li></ul>` : `
      <h4>글자 고치기</h4>
      <p class="hint">페이지의 글자를 클릭하면 그 자리에서 바로 고칠 수 있어요. 다 고친 뒤 Esc를 누르거나 다른 곳을 클릭하면 저장돼요.</p>
      <ul class="tips">
        <li>줄바꿈 <kbd>Enter</kbd></li>
        <li>굵게 <span><kbd>Ctrl</kbd> + <kbd>B</kbd></span></li>
        <li>강조 <span><kbd>Ctrl</kbd> + <kbd>I</kbd></span></li>
        <li>편집 마치기 <kbd>Esc</kbd></li>
      </ul>
      <h4>글자 서식</h4>
      <p class="hint">이 막대의 글자 서식은 요소 전체에 적용돼요. 일부 글자만 바꾸려면 페이지에서 글자를 드래그한 뒤, 위에 뜨는 편집 도구를 쓰세요. 글자 크기는 PC·모바일마다 원래 크기에 비례해서 커지고 작아져요.</p>`);
  }

  if (info.image) {
    const image = info.image;
    tools.push(
      pop('image', `<span class="tb-thumb"><img src="${esc(assetUrl(image.src))}" alt=""></span><span class="tb-hide">이미지 정보</span>`, `
        <div class="image-preview"><img src="${esc(assetUrl(image.src))}" alt=""></div>
        <div class="image-meta"><span title="${esc(image.src)}">${esc(fileName(image.src))}</span><span>${image.width && image.height ? `${esc(image.width)} × ${esc(image.height)}` : ''}</span></div>
        <label class="field"><span>대체 텍스트 (alt)</span>
          <textarea class="textarea" data-field="alt" rows="2">${esc(image.alt)}</textarea>
          <small>화면을 볼 수 없는 분께 읽어 주는 설명이에요. 꾸밈용 그림이면 비워 두세요.</small>
        </label>`, { title: '이미지 정보 · 대체 텍스트', panel: 'w-320' }),
      `<button type="button" class="tb-btn primary" data-act="pick-image">${icon('upload')}이미지 바꾸기</button>`,
      isSvg(image.src) ? '' : `<button type="button" class="tb-btn" data-act="edit-photo" title="이 자리 비율로 자르기 · 돌리기 · 밝기와 색 바꾸기">${icon('crop')}사진 편집</button>`,
      `<button type="button" class="tb-btn" data-act="pick-icon">${icon('graphic')}아이콘으로</button>`,
      sizeSelect(info, '그림 크기'));
    tips.push('<h4>사진 바꾸기</h4><p class="hint">‘이미지 바꾸기’를 누르거나, 페이지의 사진 위로 파일을 끌어다 놓아도 바뀌어요.</p>');
    if (!isSvg(image.src)) tips.push(PHOTO_EDIT_TIP);
  }

  if (info.bg) {
    const bg = info.bg;
    const iconBg = bg.iconSized;
    const preview = bg.src ? `<img src="${esc(bg.src)}" alt="">` : '';
    tools.push(
      pop('bg', `<span class="tb-thumb">${preview}</span><span class="tb-hide">${iconBg ? '아이콘 정보' : '배경 이미지'}</span>`, `
        <div class="image-preview${iconBg ? ' small' : ''}">${preview}</div>
        <div class="image-meta"><span>${esc(fileName(bg.src))}</span><span>${bg.overridden ? '변경됨' : '기본 디자인'}</span></div>
        <p class="hint small">${iconBg ? '큰 그림의 한 칸을 잘라 쓰는 아이콘이에요. 바꾸면 고른 그림이 칸에 꼭 맞게 들어가요.' : '바꾼 배경은 PC·모바일 모든 화면 크기에 같은 이미지로 쓰여요.'}</p>`, { title: iconBg ? '아이콘 정보' : '배경 이미지 정보', panel: 'w-320' }),
      `<button type="button" class="tb-btn primary" data-act="${iconBg ? 'pick-icon' : 'pick-image'}">${icon(iconBg ? 'graphic' : 'upload')}${iconBg ? '아이콘 바꾸기' : '이미지 바꾸기'}</button>`,
      !iconBg && bg.src && !isSvg(bg.src) ? `<button type="button" class="tb-btn" data-act="edit-photo" title="이 자리 비율로 자르기 · 돌리기 · 밝기와 색 바꾸기">${icon('crop')}사진 편집</button>` : '',
      bg.overridden ? `<button type="button" class="tb-btn" data-act="reset-bg">${icon('reset')}원래대로</button>` : '',
      iconBg ? sizeSelect(info, '아이콘 크기') : '');
    if (!iconBg && bg.src && !isSvg(bg.src)) tips.push(PHOTO_EDIT_TIP);
  }

  if (info.icon) {
    const colors = info.icon.colors;
    tools.push(
      `<button type="button" class="tb-btn primary" data-act="pick-icon">${icon('graphic')}아이콘 바꾸기</button>`,
      `<button type="button" class="tb-btn" data-act="pick-image">${icon('upload')}그림 파일로</button>`,
      colors.length ? pop('icon-color', `<span class="tb-dots">${colors.slice(0, 3).map(value => `<i style="background:${esc(value)}"></i>`).join('')}</span>아이콘 색`, `
        <div class="pop-title">색을 눌러 바꾸기 · 그 색으로 칠한 부분만 바뀌어요</div>
        <div class="icon-color-list">${colors.map(value => `
          <label class="icon-color-chip"><span style="background:${esc(value)}"></span><code>${esc(value)}</code><input type="color" data-icon-from="${esc(value)}" value="${esc(value)}"></label>`).join('')}
        </div>
        <div class="pop-title">모두 한 색으로 칠하기</div>
        ${palette('icon', '')}`, { title: '아이콘 색', panel: 'w-palette' }) : '',
      sizeSelect(info, '아이콘 크기'));
  }

  if (info.slide) {
    tools.push(pop('slide', `${icon('image')}사진 정보`, `
      <label class="field"><span>제목</span><input class="input" data-field="slide-title" value="${esc(info.slide.title)}"></label>
      <label class="field"><span>설명</span><textarea class="textarea" data-field="slide-description" rows="2">${esc(info.slide.description)}</textarea></label>
      <label class="field"><span>분류</span>
        <select class="select" data-field="slide-category">${info.slide.categories.map(item => `<option value="${esc(item.value)}" ${item.value === info.slide.category ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}</select>
        <small>갤러리 위쪽 분류 탭 중 어디에 보일지 정해요.</small>
      </label>`, { title: '갤러리 사진 정보', panel: 'w-320' }));
  }

  if (info.video) {
    tools.push(pop('video', `${icon('video')}영상 주소`, `
      <label class="field"><span>유튜브 영상 주소</span>
        <input class="input" data-field="video" value="${esc(info.video.url)}" placeholder="https://www.youtube.com/watch?v=…">
        <small>유튜브 주소를 붙여 넣으면 영상과 ‘이전 기수 프로젝트 보기’ 링크가 함께 바뀌어요.</small>
      </label>`, { title: '유튜브 영상', panel: 'w-360' }));
  }

  if (info.category) {
    tools.push(`<label class="tb-field" title="질문 분류"><span>분류</span>
      <select class="tb-select" data-field="category">${info.category.options.map(item => `<option value="${esc(item.value)}" ${item.value === info.category.value ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}</select></label>`);
    tips.push('<h4>질문 분류</h4><p class="hint">자주 묻는 질문 위쪽 분류 버튼 중 어디에 보일지 정해요. 분류별 질문 수는 자동으로 맞춰져요.</p>');
  }

  if (info.link?.siteLink) {
    tools.push(pop('link', `${icon('link')}링크`, `
      <p class="hint">공통 연결처 <code>${esc(info.link.siteLink)}</code>로 연결되는 링크예요. 실제 주소는 모든 페이지가 함께 쓰는 <code>common/js/menu.js</code>의 <code>SITE_LINKS</code>에서 정해져서 여기서는 바꿀 수 없어요.</p>`, { title: '링크', panel: 'w-320' }));
  } else if (info.link) {
    tools.push(pop('link', `${icon('link')}링크`, `
      <label class="field"><span>연결 주소</span>
        <input class="input" data-field="href" value="${esc(info.link.href)}" placeholder="https://… 또는 ${esc(info.link.anchors?.[0] || '#위치')}">
        <small>${info.link.anchors?.length ? `같은 페이지의 섹션은 ${esc(info.link.anchors.join(', '))} 처럼 적어요.` : '같은 페이지의 위치는 #아이디 처럼 적어요.'}</small>
      </label>
      <label class="check"><input type="checkbox" data-field="newtab" ${info.link.newTab ? 'checked' : ''}> 새 탭에서 열기</label>`, { title: '링크', panel: 'w-360' }));
  }

  if (info.attachable) {
    tools.push(pop('attach', `${icon('attach')}글자 옆에 붙이기`, `
      <p class="hint">버튼을 누른 다음 페이지에서 붙일 글자를 클릭하세요. 글자의 오른쪽 절반을 누르면 뒤에, 왼쪽 절반을 누르면 앞에 붙고, 글자와 같은 줄에 맞춰져요.</p>
      <div class="button-row">
        <button type="button" class="primary-button" data-act="attach-copy">${icon('copy')}복제해서 붙이기</button>
        <button type="button" class="ghost-button" data-act="attach-move">옮겨 붙이기</button>
      </div>`, { title: '글자 옆에 붙이기', panel: 'w-320' }));
  }
  groups.push(tools.filter(Boolean).join(''));

  if (info.kind === 'text') groups.push(formatTools(info));

  // 위치 · 맞춤(열 · 행) · 겹칠 때 순서는 한 칸에
  const { x = 0, y = 0 } = info.position || {};
  groups.push(pop('position', `${icon('move')}${info.align ? '위치·맞춤' : '위치'}`, positionContent(info)
    + (info.align ? `<div class="pop-title">맞춤 (열 · 행)</div>${alignField(info, 'x')}${alignField(info, 'y')}` : ''),
  { title: info.align ? '위치 미세 조정 · 맞춤 · 겹칠 때 순서' : '위치 미세 조정 · 겹칠 때 순서', panel: 'w-340', button: x || y || info.layer === 'front' ? 'is-set' : '' }));
  tips.push(`
    <h4>옮기기</h4>
    <p class="hint"><b>마우스:</b> ${info.compact ? '작은 아이콘·그림은 <b>그대로 끌어서</b> 옮기세요(손잡이가 아이콘을 가리지 않게 숨겼어요).' : '선택 상자 오른쪽 위의 <b>파란 ✥ 손잡이</b>를 끌어 원하는 곳에 놓으세요. 사진·카드는 그대로 끌어도 돼요.'} Shift를 누르고 끌면 한 방향으로만 움직이고, ‘위치’의 가운데(↺)를 누르면 원래 자리로 돌아가요.</p>
    <p class="hint"><b>키보드:</b> 방향키(글자 입력 중에는 Alt+방향키), Shift를 함께 누르면 10px씩. 옮겨도 다른 요소의 자리는 그대로예요.</p>`);
  if (info.align) tips.push('<h4>맞춤</h4><p class="hint">버튼에 마우스를 올리면 맞출 기준이 분홍색으로 보여요. 끌어서 옮길 때도 주변과 줄이 맞으면 분홍 선이 생기며 딱 붙어요(Alt를 누르고 끌면 붙지 않아요).</p>');

  // 추가 · 순서 · 삭제
  const unit = info.item;
  const horizontal = unit.axis === 'x';
  groups.push(`
    ${unit.repeatable
      ? `<button type="button" class="tb-btn" data-act="duplicateBefore" title="앞에 하나 더 추가">${icon('plus')}앞에<span class="tb-hide"> 추가</span></button>
         <button type="button" class="tb-btn" data-act="duplicate" title="뒤에 하나 더 추가 (Ctrl+D)">${icon('plus')}뒤에<span class="tb-hide"> 추가</span></button>`
      : `<button type="button" class="tb-btn" data-act="duplicate" title="복제해서 추가 (Ctrl+D)">${icon('copy')}복제</button>`}
    <button type="button" class="tb-btn icon-only" data-act="moveUp" title="앞으로" ${unit.canUp ? '' : 'disabled'}>${icon(horizontal ? 'left' : 'up')}</button>
    <button type="button" class="tb-btn icon-only" data-act="moveDown" title="뒤로" ${unit.canDown ? '' : 'disabled'}>${icon(horizontal ? 'right' : 'down')}</button>
    <button type="button" class="tb-btn icon-only" data-act="parent" title="상위 요소 선택">${icon('parent')}</button>
    <button type="button" class="tb-btn icon-only danger" data-act="remove" title="삭제 (Delete)">${icon('trash')}</button>`);
  tips.push(`<h4>추가 · 순서 · 삭제</h4><p class="hint">페이지에 주황색 점선으로 표시된 범위(카드 · 항목 등)가 통째로 복제 · 이동 · 삭제돼요.${unit.repeatable ? ' 페이지에서 편집 도구의 <b>⠿</b>를 끌면 원하는 자리로 옮길 수 있고, 가장자리의 주황색 <b>＋</b>로 바로 추가할 수 있어요.' : ''}</p>`);


  return groups.filter(group => group.trim()).join(SEP) + helpPop(tips.join('') + SHORTCUTS);
}

// ── 글자 서식 · 위치 (요소 전체) ──
// 색·글꼴 목록은 사이트마다 site.config.json의 palette·fonts로 바꿀 수 있어요.
const PALETTE = BO.palette?.length ? BO.palette : [
  ['#162021', '검정'], ['#3b4250', '진회색'], ['#677074', '회색'], ['#a3abbb', '연회색'], ['#ffffff', '흰색'],
  ['#1249ee', '대표 파랑'], ['#244cd2', '진파랑'], ['#193d87', '남색'], ['#5b8cff', '하늘색'], ['#7c5cff', '보라'],
  ['#e5483a', '빨강'], ['#ed961a', '주황'], ['#f2c230', '노랑'], ['#12a35e', '초록'], ['#d6409f', '분홍']
];
// 색 고르기 칸의 기본 · 더 많은 색(사이트 색은 위 PALETTE)
const BASIC_COLORS = ['#000000', '#333333', '#666666', '#999999', '#cccccc', '#ffffff'];
const MORE_COLORS = [
  '#e5483a', '#f08c1a', '#f2c230', '#12a35e', '#0fa3a3', '#1f6fe0', '#7c5cff', '#8291a8',
  '#fbd0cc', '#fde1c2', '#fdf0c2', '#c7ecd8', '#c4ecec', '#cddff9', '#ded6ff', '#dde3ec',
  '#f08a80', '#f6b36b', '#f7d870', '#6cc99b', '#63c7c7', '#79a6ee', '#a994ff', '#aab5c6',
  '#9b2a20', '#a85a0b', '#a7830f', '#0b6b3e', '#0a6b6b', '#143f86', '#4a33a8', '#475569'
];
const FONTS = [['', '기본 글꼴'], ...(BO.fonts?.length ? BO.fonts : [
  ["'School Pretendard', Pretendard, sans-serif", '프리텐다드'],
  ["'School Paperlogy', 'School Pretendard', sans-serif", '페이퍼로지 (제목용)'],
  ["'School Giants', 'School Pretendard', sans-serif", '자이언츠 (굵은 제목)'],
  ["'Noto Serif KR', 'Nanum Myeongjo', Batang, serif", '명조체']
])];
const ZOOMS = ['0.6', '0.7', '0.8', '0.9', '', '1.15', '1.3', '1.5', '1.75', '2', '2.5', '3'];
const LINE_HEIGHTS = ['', '1.1', '1.2', '1.4', '1.6', '1.8', '2', '2.4'];
const TEXT_ALIGNS = [['left', '왼쪽 정렬', 'align-left'], ['center', '가운데 정렬', 'align-center'], ['right', '오른쪽 정렬', 'align-right']];

const segment = (prop, current, options) => `
  <div class="seg" role="group">${options.map(([value, label]) => `<button type="button" data-format-prop="${prop}" data-format-value="${esc(value)}" aria-pressed="${String(current === value)}">${label}</button>`).join('')}</div>`;

// 색 고르기 칸: 기본 · 사이트 색 · 더 많은 색을 누르거나, 색 코드를 넣어요. kind: 'format' 글자 색 · 'icon' 아이콘 전체 색
function palette(kind, current) {
  const attr = kind === 'format' ? 'data-format-color' : 'data-icon-all';
  const swatch = (value, name = value) => `<button type="button" class="pal-sw" ${attr}="${esc(value)}" title="${esc(name)}" aria-pressed="${String(current === value)}" style="--sw:${esc(value)}"></button>`;
  const hex = /^#[0-9a-f]{6}$/.test(current) ? current : '';
  return `
    <div class="palette">${kind === 'format' ? `<button type="button" class="pal-sw pal-none" data-format-color="" title="기본색으로" aria-pressed="${String(!current)}"></button>` : ''}${BASIC_COLORS.map(value => swatch(value)).join('')}</div>
    <div class="pop-title">사이트 색</div>
    <div class="palette">${PALETTE.map(([value, name]) => swatch(String(value).toLowerCase(), name)).join('')}</div>
    <div class="pop-title">더 많은 색</div>
    <div class="palette">${MORE_COLORS.map(value => swatch(value)).join('')}</div>
    <div class="pal-foot">
      <label class="pal-current" title="직접 고르기" style="--sw:${hex || '#ffffff'}"><input type="color" data-pal-pick="${kind}" value="${hex || '#1249ee'}" aria-label="직접 고르기"></label>
      <input class="input pal-hex" data-pal-hex="${kind}" value="${hex}" placeholder="#333333" maxlength="7" spellcheck="false" aria-label="색 코드">
      <button type="button" class="ghost-button" data-pal-apply="${kind}">입력</button>
    </div>`;
}

function formatTools(info) {
  const style = info.style || {};
  const color = (style.color || '').toLowerCase();
  const align = style['text-align'] || '';
  const zoom = style.zoom || '';
  const shaped = style['font-weight'] || style['font-style'] || style['text-decoration-line'] || style['line-height'];
  return [
    pop('color', `<span class="tb-color-a" style="--tb-color:${esc(color || '#15171c')}">가</span>`, palette('format', color), { title: '글자 색', panel: 'w-palette' }),
    `<select class="tb-select tb-font" data-field="format-font" title="글꼴" aria-label="글꼴">${FONTS.map(([value, name]) => `<option value="${esc(value)}" ${value === (style['font-family'] || '') ? 'selected' : ''}>${name}</option>`).join('')}</select>`,
    `<select class="tb-select" data-field="format-zoom" title="글자 크기" aria-label="글자 크기">${ZOOMS.map(value => `<option value="${value}" ${value === zoom ? 'selected' : ''}>${value ? `${Math.round(Number(value) * 100)}%` : '크기 100%'}</option>`).join('')}</select>`,
    pop('text-align', icon((TEXT_ALIGNS.find(([value]) => value === align) || TEXT_ALIGNS[0])[2]), `
      <div class="pop-title">정렬</div>${segment('text-align', align, [['', '기본'], ...TEXT_ALIGNS.map(([value, label]) => [value, label.replace(' 정렬', '')])])}`, { title: '정렬', panel: 'w-300', button: align ? 'is-set' : '' }),
    pop('style', '<span class="tb-biu" aria-hidden="true"><b>B</b><i>I</i><u>U</u></span><span class="tb-hide">글자 모양</span>', `
      <div class="field"><span>굵기</span>${segment('font-weight', style['font-weight'] || '', [['', '기본'], ['400', '보통'], ['700', '굵게'], ['900', '아주 굵게']])}</div>
      <div class="field"><span>모양</span>${segment('font-style', style['font-style'] || '', [['', '기본'], ['italic', '기울임'], ['normal', '반듯하게']])}</div>
      <div class="field"><span>밑줄</span>${segment('text-decoration-line', style['text-decoration-line'] || '', [['', '기본'], ['underline', '밑줄'], ['none', '없음']])}</div>
      <label class="field"><span>줄 간격</span>
        <select class="select" data-field="format-line-height">${LINE_HEIGHTS.map(value => `<option value="${value}" ${value === (style['line-height'] || '') ? 'selected' : ''}>${value ? `${value}배` : '기본'}</option>`).join('')}</select>
      </label>`, { title: '굵기 · 모양 · 밑줄 · 줄 간격', panel: 'w-300', button: shaped ? 'is-set' : '' }),
    `<button type="button" class="tb-btn icon-only" data-act="clear-format" title="서식 모두 지우기">${icon('eraser')}</button>`
  ].join('');
}

// 맞춤: 열 맞춤(세로줄)은 위·아래 이웃, 행 맞춤(가로줄)은 왼쪽·오른쪽 이웃을 기준으로 고릅니다.
const ALIGN_EDGES = { x: [['start', '왼쪽'], ['center', '가운데'], ['end', '오른쪽']], y: [['start', '위'], ['center', '가운데'], ['end', '아래']] };
const ALIGN_ICONS = {
  'x:start': '<path d="M4 3v18"/><rect x="7" y="6" width="13" height="4" rx="1"/><rect x="7" y="14" width="8" height="4" rx="1"/>',
  'x:center': '<path d="M12 3v18"/><rect x="5" y="6" width="14" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/>',
  'x:end': '<path d="M20 3v18"/><rect x="4" y="6" width="13" height="4" rx="1"/><rect x="9" y="14" width="8" height="4" rx="1"/>',
  'y:start': '<path d="M3 4h18"/><rect x="6" y="7" width="4" height="13" rx="1"/><rect x="14" y="7" width="4" height="8" rx="1"/>',
  'y:center': '<path d="M3 12h18"/><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/>',
  'y:end': '<path d="M3 20h18"/><rect x="6" y="4" width="4" height="13" rx="1"/><rect x="14" y="9" width="4" height="8" rx="1"/>'
};
function alignField(info, axis) {
  const refs = info.align?.[axis] || [];
  const title = axis === 'x' ? '열 맞춤 · 세로줄' : '행 맞춤 · 가로줄';
  if (!refs.length) return `<div class="field"><span>${title}</span><small>맞출 만한 이웃이 없어요.</small></div>`;
  const remembered = state.alignChoice?.id === info.id ? state.alignChoice[axis] : null;
  const chosen = refs.some(ref => ref.id === remembered) ? remembered : refs[0].id;
  return `
    <div class="field align-field"><span>${title}</span>
      <select class="select" data-align-ref="${axis}" aria-label="${title} 기준">${refs.map(ref => `<option value="${esc(ref.id)}" ${ref.id === chosen ? 'selected' : ''}>기준: ${esc(ref.label)}</option>`).join('')}</select>
      <div class="align-buttons" role="group" aria-label="${title}">${ALIGN_EDGES[axis].map(([edge, label]) => `
        <button type="button" data-align="${axis}:${edge}" title="${title} · ${label} 맞춤"><svg viewBox="0 0 24 24" aria-hidden="true">${ALIGN_ICONS[`${axis}:${edge}`]}</svg>${label}</button>`).join('')}
      </div>
    </div>`;
}

function positionContent(info) {
  const { x = 0, y = 0 } = info.position || {};
  return `
    <div class="nudge">
      <div class="nudge-pad">
        <button type="button" class="icon-button" data-nudge="0,-5" title="위로 5px">${icon('up')}</button>
        <button type="button" class="icon-button" data-nudge="-5,0" title="왼쪽으로 5px">${icon('left')}</button>
        <button type="button" class="icon-button nudge-reset" data-act="reset-position" title="원래 위치로" ${x || y ? '' : 'disabled'}>${icon('reset')}</button>
        <button type="button" class="icon-button" data-nudge="5,0" title="오른쪽으로 5px">${icon('right')}</button>
        <button type="button" class="icon-button" data-nudge="0,5" title="아래로 5px">${icon('down')}</button>
      </div>
      <div class="nudge-values">
        <label>가로 <input class="input" type="number" step="1" data-field="pos-x" value="${x}"> px</label>
        <label>세로 <input class="input" type="number" step="1" data-field="pos-y" value="${y}"> px</label>
      </div>
    </div>
    <div class="field"><span>겹칠 때 순서</span>
      <div class="seg" role="group">
        <button type="button" data-act="layer-front" aria-pressed="${String(info.layer === 'front')}">맨 앞으로</button>
        <button type="button" data-act="layer-reset" aria-pressed="${String(info.layer !== 'front')}">원래대로</button>
      </div>
      <small>다른 칸이나 그림 밑에 깔려 안 보이면 ‘맨 앞으로’를 누르세요. 끌어서 놓았을 때 가려지면 자동으로 앞으로 가져와요.</small>
    </div>`;
}

// 그림·아이콘 크기: 화면 크기별 원래 크기에 비례해서 커지고 작아집니다.
function sizeSelect(info, label) {
  const zoom = info.style?.zoom || '';
  return `<label class="tb-field" title="${label}"><span>크기</span>
    <select class="tb-select" data-field="format-zoom" aria-label="${label}">${ZOOMS.map(value => `<option value="${value}" ${value === zoom ? 'selected' : ''}>${value ? `${Math.round(Number(value) * 100)}%` : '100%'}</option>`).join('')}</select></label>`;
}

function applyFormat(props, label, target = state.panelTarget) {
  if (!state.canvas || !target) return;
  state.coalesceKey = `format:${Object.keys(props).join(',')}:${target.id}`;
  state.canvas.action('format', { props, label }, target);
  state.coalesceKey = null;
}

function pageBar() {
  const meta = state.canvas?.pageMeta() || { title: '', description: '', shifted: [] };
  const shifted = meta.shifted || [];
  return `
    <span class="tb-note">${icon('pointer')}페이지에서 고칠 곳을 클릭하세요</span>
    ${shifted.length ? SEP + pop('shift', `${icon('warning')}페이지 전체가 옮겨져 있어요`, `
      <p class="hint">${shifted.map(item => `${esc(item.name)}: ${esc(item.translate)}`).join(', ')} 만큼 옮겨져 있어요. 빈 곳을 선택한 채 위치를 조정해서 생긴 것 같아요.</p>
      <div class="button-row"><button type="button" class="primary-button" data-act="reset-page-shift">${icon('reset')}원래 위치로 되돌리기</button></div>`, { title: '페이지 전체가 옮겨져 있어요', panel: 'w-320', button: 'warn' }) : ''}
    ${SEP}
    ${pop('meta', `${icon('file')}페이지 정보`, `
      <label class="field"><span>페이지 제목 (브라우저 탭)</span><input class="input" data-field="meta-title" value="${esc(meta.title)}"></label>
      <label class="field"><span>페이지 설명 (검색 결과·공유)</span><textarea class="textarea" data-field="meta-description" rows="3">${esc(meta.description)}</textarea></label>
      ${typeof meta.note === 'string' ? `
      <label class="field"><span>바닥글 메모 (사진 출처 등)</span>
        <input class="input" data-field="meta-note" value="${esc(meta.note)}" placeholder="예: 표지: 콘셉트 이미지 / 본문: 학교 기록 사진">
        <small>모든 페이지가 함께 쓰는 바닥글 맨 아래에, 이 페이지에서만 보이는 한 줄이에요. 비우면 나오지 않아요.</small>
      </label>` : ''}`, { title: '페이지 정보', panel: 'w-360' })}
    ${helpPop(`
      <h4>사용 방법</h4>
      <p class="hint">PPT처럼 글자와 사진을 그 자리에서 고치고, 카드나 목록은 복제해서 추가할 수 있어요.</p>
      <ul class="how">
        <li><span>${icon('text')}</span><div><b>글자 고치기</b>글자를 클릭하고 바로 입력하세요. Enter는 줄바꿈, Esc는 완료예요.</div></li>
        <li><span>${icon('image')}</span><div><b>사진 바꾸기</b>사진을 클릭해 ‘이미지 바꾸기’를 누르거나, 사진 위로 파일을 끌어다 놓으세요.</div></li>
        <li><span>${icon('copy')}</span><div><b>추가 · 순서 · 삭제</b>무언가를 선택하면 주황색 점선 단위(카드·항목)로 복제, 이동, 삭제할 수 있어요.</div></li>
        <li><span>${icon('upload')}</span><div><b>사이트에 반영</b>편집 내용은 자동으로 임시저장돼요. 오른쪽 위 ‘사이트에 반영’을 누르면 프론트오피스(실제 사이트)에 바로 적용되고, 열어 둔 프론트오피스 화면이 자동으로 새로고침돼요.</div></li>
      </ul>${SHORTCUTS}`, '사용 방법')}`;
}

// 입력칸은 타이핑을 잠시 멈추면 바로 페이지에 적용하고, 연속 입력은 실행 취소 한 번으로 묶습니다.
const fieldTimers = new Map();
function readField(el) {
  return el.type === 'checkbox' ? el.checked : el.value;
}
function scheduleField(el, delay) {
  const field = el.dataset.field;
  const target = state.panelTarget;
  const value = readField(el);
  const extra = field === 'href' || field === 'newtab'
    ? { href: $('#panel-body [data-field="href"]')?.value ?? '', newTab: Boolean($('#panel-body [data-field="newtab"]')?.checked) }
    : field === 'pos-x' || field === 'pos-y'
      ? { x: $('#panel-body [data-field="pos-x"]')?.value ?? 0, y: $('#panel-body [data-field="pos-y"]')?.value ?? 0 }
      : null;
  clearTimeout(fieldTimers.get(field)?.timer);
  const run = () => {
    fieldTimers.delete(field);
    applyField(field, value, target, extra);
  };
  if (!delay) return run();
  fieldTimers.set(field, { timer: setTimeout(run, delay), run });
}
function flushFields() {
  for (const { timer, run } of [...fieldTimers.values()]) {
    clearTimeout(timer);
    run();
  }
}
function applyField(field, value, target, extra) {
  const canvas = state.canvas;
  if (!canvas) return;
  state.coalesceKey = `${field}:${target?.id || 'page'}`;
  if (field === 'alt') canvas.action('setAlt', value, target);
  else if (field === 'href' || field === 'newtab') canvas.action('setLink', extra, target);
  else if (field === 'video') canvas.action('setVideo', value, target);
  else if (field === 'slide-title') canvas.action('setSlide', { title: value }, target);
  else if (field === 'slide-description') canvas.action('setSlide', { description: value }, target);
  else if (field === 'slide-category') canvas.action('setSlide', { category: value }, target);
  else if (field === 'meta-title') canvas.action('setMeta', { title: value });
  else if (field === 'meta-description') canvas.action('setMeta', { description: value });
  else if (field === 'meta-note') canvas.action('setMeta', { note: value });
  else if (field === 'category') canvas.action('setCategory', value, target);
  else if (field === 'pos-x' || field === 'pos-y') {
    state.coalesceKey = `nudge:${target?.id}`;
    canvas.action('setPosition', extra, target);
  }
  else if (field === 'format-color') return applyFormat({ color: value }, '글자 색', target);
  else if (field === 'format-font') return applyFormat({ 'font-family': value || null }, '글꼴', target);
  else if (field === 'format-zoom') return applyFormat({ zoom: value || null }, '글자 크기', target);
  else if (field === 'format-line-height') return applyFormat({ 'line-height': value || null }, '줄 간격', target);
  state.coalesceKey = null;
}

async function panelAction(act, button) {
  const canvas = state.canvas;
  if (act === 'to-edit') return setMode('edit');
  if (act === 'open-front') return openFront();
  if (!canvas) return;
  if (act === 'reset-page-shift') {
    canvas.action('resetPageShift');
    state.panelKey = '';
    return renderPanel();
  }
  const target = state.panelTarget;
  if (act === 'deselect') canvas.deselect();
  else if (act === 'pick-image' || act === 'pick-icon') {
    const kind = state.info?.kind;
    const wantsIcon = act === 'pick-icon';
    const title = wantsIcon ? '아이콘 바꾸기' : kind === 'bg' ? '배경 이미지 바꾸기' : '이미지 바꾸기';
    const picked = await pickImage(title, { kind, tab: wantsIcon ? 'icons' : 'images', color: state.info?.icon?.colors?.[0] });
    if (picked) state.canvas?.action('replaceImage', picked, target);
  } else if (act === 'edit-photo') editPhoto(target);
  else if (act === 'reset-bg') canvas.action('resetBackground', null, target);
  else if (act === 'clear-format') canvas.action('clearFormat', null, target);
  else if (act === 'reset-position') canvas.action('setPosition', { x: 0, y: 0 }, target);
  else if (act === 'layer-front' || act === 'layer-reset') canvas.action('layer', { to: act === 'layer-front' ? 'front' : null }, target);
  else if (act === 'attach-copy' || act === 'attach-move') canvas.action('attach', { mode: act === 'attach-move' ? 'move' : 'copy' }, target);
  else if (['duplicate', 'duplicateBefore', 'remove', 'moveUp', 'moveDown', 'parent', 'edit'].includes(act)) {
    canvas.action(act, null, target);
  }
  button?.blur();
}

function bindPanel() {
  const body = $('#panel-body');
  body.addEventListener('click', event => {
    const toggle = event.target.closest('[data-pop-toggle]');
    if (toggle) {
      const name = toggle.closest('.tb-pop').dataset.pop;
      return openPop(state.openPop === name ? null : name);
    }
    const swatch = event.target.closest('[data-format-color]');
    if (swatch && !swatch.disabled) {
      closePops();
      return applyFormat({ color: swatch.dataset.formatColor || null }, '글자 색');
    }
    const paintAll = event.target.closest('[data-icon-all]');
    if (paintAll) {
      closePops();
      return applyColor('icon', paintAll.dataset.iconAll);
    }
    const hexButton = event.target.closest('[data-pal-apply]');
    if (hexButton) return applyHex(hexButton.dataset.palApply);
    const choice = event.target.closest('[data-format-prop]');
    if (choice) {
      if (choice.dataset.formatProp === 'text-align') closePops();
      return applyFormat({ [choice.dataset.formatProp]: choice.dataset.formatValue || null }, '글자 서식');
    }
    const nudgeButton = event.target.closest('[data-nudge]');
    if (nudgeButton) {
      const [dx, dy] = nudgeButton.dataset.nudge.split(',').map(Number);
      state.coalesceKey = `nudge:${state.panelTarget?.id}`;
      state.canvas?.action('nudge', { dx, dy }, state.panelTarget);
      state.coalesceKey = null;
      return;
    }
    const alignButton = event.target.closest('[data-align]');
    if (alignButton) {
      const [axis, edge] = alignButton.dataset.align.split(':');
      const ref = $(`#panel-body [data-align-ref="${axis}"]`)?.value;
      if (!ref || !state.canvas) return;
      rememberAlign(axis, ref);
      state.canvas.action('align', { axis, edge, ref }, state.panelTarget);
      return;
    }
    const button = event.target.closest('[data-act]');
    if (button && !button.disabled) {
      // 위치 칸 안의 버튼은 여러 번 누를 수 있게 칸을 열어 두고, 나머지는 닫고 실행해요.
      if (!['reset-position', 'layer-front', 'layer-reset'].includes(button.dataset.act)) closePops();
      panelAction(button.dataset.act, button);
    }
  });
  // 색 고르기 칸: 고른 색을 글자 색 또는 아이콘 전체 색으로 칠해요. 색 코드는 #333 · 333333처럼 적어도 돼요.
  const applyColor = (kind, value) => (kind === 'format'
    ? applyFormat({ color: value }, '글자 색')
    : state.canvas?.action('recolorIcon', { to: value, all: true }, state.panelTarget));
  const applyHex = kind => {
    const input = $(`#panel-body [data-pal-hex="${kind}"]`);
    let value = (input?.value || '').trim().toLowerCase();
    if (value && !value.startsWith('#')) value = `#${value}`;
    if (/^#[0-9a-f]{3}$/.test(value)) value = `#${[...value.slice(1)].map(ch => ch + ch).join('')}`;
    if (!/^#[0-9a-f]{6}$/.test(value)) {
      toast('색 코드는 #333333처럼 적어 주세요.', 'error');
      input?.focus();
      return;
    }
    input.blur();
    closePops();
    applyColor(kind, value);
  };
  // 맞춤: 고른 기준을 기억하고, 버튼·기준에 마우스를 올리면 페이지에 기준과 맞춰질 줄을 미리 보여 줍니다.
  const rememberAlign = (axis, ref) => {
    const id = state.panelTarget?.id;
    if (state.alignChoice?.id !== id) state.alignChoice = { id, x: null, y: null };
    state.alignChoice[axis] = ref;
  };
  body.addEventListener('pointerover', event => {
    const alignButton = event.target.closest('[data-align]');
    const refSelect = event.target.closest('[data-align-ref]');
    if (!alignButton && !refSelect) return;
    const axis = alignButton ? alignButton.dataset.align.split(':')[0] : refSelect.dataset.alignRef;
    const edge = alignButton ? alignButton.dataset.align.split(':')[1] : null;
    const ref = $(`#panel-body [data-align-ref="${axis}"]`)?.value;
    state.canvas?.previewAlign?.({ ref, axis, edge });
  });
  body.addEventListener('pointerout', event => {
    if (event.target.closest('.align-field') && !event.relatedTarget?.closest?.('.align-field')) state.canvas?.previewAlign?.(null);
  });
  // 아이콘 색: 고르는 동안 바로 반영하고, 바뀐 색을 다음 기준 색으로 기억합니다.
  let iconColorTimer = 0;
  const recolorFrom = input => {
    clearTimeout(iconColorTimer);
    const from = input.dataset.iconFrom;
    const to = input.value.toLowerCase();
    if (!state.canvas || from === to) return;
    state.canvas.action('recolorIcon', { from, to }, state.panelTarget);
    input.dataset.iconFrom = to;
    const chip = input.closest('.icon-color-chip');
    if (chip) {
      chip.querySelector('span').style.background = to;
      chip.querySelector('code').textContent = to;
    }
  };
  body.addEventListener('input', event => {
    const colorInput = event.target.closest('[data-icon-from]');
    if (colorInput) {
      clearTimeout(iconColorTimer);
      iconColorTimer = setTimeout(() => recolorFrom(colorInput), 250);
      return;
    }
    const el = event.target.closest('[data-field]');
    if (el && el.type !== 'checkbox' && el.tagName !== 'SELECT') scheduleField(el, 500);
  });
  body.addEventListener('change', event => {
    const colorInput = event.target.closest('[data-icon-from]');
    if (colorInput) return recolorFrom(colorInput);
    const picker = event.target.closest('[data-pal-pick]');
    if (picker) {
      picker.blur();
      closePops();
      return applyColor(picker.dataset.palPick, picker.value.toLowerCase());
    }
    const refSelect = event.target.closest('[data-align-ref]');
    if (refSelect) {
      rememberAlign(refSelect.dataset.alignRef, refSelect.value);
      state.canvas?.previewAlign?.({ ref: refSelect.value, axis: refSelect.dataset.alignRef });
      return;
    }
    const el = event.target.closest('[data-field]');
    if (el) scheduleField(el, 0);
  });
  body.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.matches('[data-pal-hex]')) {
      event.preventDefault();
      return applyHex(event.target.dataset.palHex);
    }
    if (event.key === 'Enter' && event.target.matches('input.input')) {
      event.preventDefault();
      event.target.blur();
    }
  });
  // 펼친 칸은 바깥을 누르거나, Esc를 누르거나, 페이지(편집 화면)를 누르면 닫혀요.
  document.addEventListener('pointerdown', event => {
    if (state.openPop && !event.target.closest?.('.tb-pop')) closePops();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !state.openPop || document.querySelector('.pe-ov')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closePops();
  }, true);
  window.addEventListener('blur', () => setTimeout(() => {
    if (state.openPop && state.frame && document.activeElement === state.frame) closePops();
  }));
  window.addEventListener('resize', () => { if (state.openPop) placePop(); });
  body.addEventListener('scroll', () => { if (state.openPop) placePop(); });
  body.addEventListener('wheel', event => {
    if (!event.deltaY || body.scrollWidth <= body.clientWidth || event.target.closest('.tb-pop-panel')) return;
    body.scrollLeft += event.deltaY;
    event.preventDefault();
  }, { passive: false });
}

// ── 이미지 고르기 · 올리기 ──
function measure(path) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : {});
    img.onerror = () => resolve({});
    img.src = assetUrl(path);
  });
}

// 사진 편집(자르기 · 돌리기 · 밝기/색): 편집한 사진을 이 페이지 폴더(assets/uploads)에 새로 올리고 그 사진으로 바꿉니다.
function editPhoto(target) {
  const info = state.info;
  const src = info?.image?.src || (info?.bg && !info.bg.iconSized ? info.bg.src : '');
  if (!src) return;
  if (!window.PhotoEditor) return toast('사진 편집 도구를 불러오지 못했어요. 새로고침해 주세요.', 'error');
  const frame = info.frame;
  window.PhotoEditor.edit({
    src: assetUrl(src),
    name: fileName(src),
    ratios: frame?.w > 0 && frame?.h > 0 ? [{ key: 'frame', label: '이 자리 비율', value: frame.w / frame.h }] : [],
    ratio: 'frame',
    upload: async file => {
      const uploaded = await uploadFile(file);
      if (!uploaded) throw new Error('편집한 사진을 올리지 못했어요.');
      return uploaded;
    },
    onDone: uploaded => {
      state.canvas?.action('replaceImage', { path: uploaded.path, width: uploaded.width, height: uploaded.height }, target);
      toast('편집한 사진으로 바꿨어요. 원래 사진 파일은 그대로 남아 있어요.');
    }
  });
}

async function uploadFile(file) {
  if (!file || !/^image\//.test(file.type)) {
    toast('이미지 파일만 올릴 수 있어요.', 'error');
    return null;
  }
  if (file.size > 30 * 1024 * 1024) {
    toast('30MB보다 작은 이미지를 올려 주세요.', 'error');
    return null;
  }
  try {
    toast(`‘${file.name}’ 올리는 중…`);
    const { path } = await api(`upload?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
    state.assets = null;
    state.media = null;   // 관리자 페이지에서는 올린 그림이 미디어 관리에도 함께 남아요
    return { path, ...(await measure(path)) };
  } catch (error) {
    toast(`이미지를 올리지 못했어요: ${error.message}`, 'error');
    return null;
  }
}

// options.kind: 바꿀 대상 종류. 'graphic'(SVG 아이콘)은 아이콘을 그 자리에 그려 넣고,
// 사진·배경 자리에 아이콘을 고르면 SVG 파일로 만들어 올린 뒤 그 파일로 바꿉니다.
function pickImage(title = '이미지 바꾸기', options = {}) {
  return new Promise(resolve => {
    state.pickResolve?.(null);
    state.pickResolve = resolve;
    state.pickKind = options.kind || 'image';
    $('#library-title').textContent = title;
    $('#library-search').value = '';
    $('#icon-search').value = '';
    if (options.color && /^#[0-9a-f]{6}$/i.test(options.color)) $('#icon-color').value = options.color;
    setLibraryTab(options.tab || (state.pickKind === 'graphic' ? 'icons' : 'images'));
    $('#library-dialog').showModal();
    renderLibrary();
    renderIconGrid();
  });
}

function finishPick(result) {
  const resolve = state.pickResolve;
  state.pickResolve = null;
  if ($('#library-dialog').open) $('#library-dialog').close();
  resolve?.(result);
}

function setLibraryTab(tab) {
  for (const button of document.querySelectorAll('[data-lib-tab]')) button.setAttribute('aria-pressed', String(button.dataset.libTab === tab));
  for (const pane of document.querySelectorAll('[data-lib-pane]')) pane.hidden = pane.dataset.libPane !== tab;
}

const ICON_COLORS = ['#244cd2', '#1249ee', '#193d87', '#162021', '#677074', '#e5483a', '#ed961a', '#12a35e', '#7c5cff', '#ffffff'];
function renderIconGrid() {
  const color = $('#icon-color').value;
  const query = $('#icon-search').value.trim().toLowerCase();
  const icons = (window.BO_ICONS || []).filter(item => !query || `${item.name} ${item.keys}`.toLowerCase().includes(query));
  $('#icon-color-swatches').innerHTML = ICON_COLORS.map(value => `<button type="button" data-icon-swatch="${value}" style="background:${value}" aria-pressed="${String(value === color)}" title="${value}"></button>`).join('');
  $('#icon-grid').innerHTML = icons.length ? icons.map(item => `
    <button type="button" data-icon="${esc(item.name)}" title="${esc(item.name)}">
      <span class="icon-preview" style="color:${color};background:${color === '#ffffff' ? '#1d2433' : ''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${item.body}</svg></span>
      <span>${esc(item.name)}</span>
    </button>`).join('') : '<p class="hint">찾는 아이콘이 없어요. 다른 낱말로 찾아보세요.</p>';
}

// 사진·배경 자리에 넣을 아이콘은 SVG 파일로 만들어 사이트 폴더(assets/uploads)에 올립니다.
async function iconAsFile(icon, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon.body}</svg>`;
  const file = new File([svg], `icon-${icon.keys.split(' ').pop()}.svg`, { type: 'image/svg+xml' });
  const uploaded = await uploadFile(file);
  return uploaded ? { ...uploaded, width: 96, height: 96 } : null;
}

// 그림을 가져올 곳: 'site' 사이트에 있는 이미지 · 'media' 미디어 관리(관리자 페이지에 붙인 편집 화면에서만)
function setLibrarySource(source) {
  state.librarySource = BO.media && source === 'media' ? 'media' : 'site';
  for (const button of document.querySelectorAll('[data-lib-source]')) button.setAttribute('aria-pressed', String(button.dataset.libSource === state.librarySource));
  renderLibrary();
}

async function renderMedia(grid) {
  if (!state.media) {
    grid.innerHTML = '<p class="hint">미디어 관리의 그림을 불러오는 중…</p>';
    try { state.media = await api('media'); } catch (error) {
      if (state.librarySource === 'media') grid.innerHTML = `<p class="hint">목록을 불러오지 못했어요: ${esc(error.message)}</p>`;
      return;
    }
    if (state.librarySource !== 'media') return;   // 불러오는 동안 '사이트'로 바꿨으면 그쪽 목록을 그대로 둬요
  }
  const query = $('#library-search').value.trim().toLowerCase();
  const items = state.media.filter(item => !query || String(item.name).toLowerCase().includes(query));
  const note = `<p class="hint small library-note">고르면 이 페이지 폴더(assets/uploads)로 복사해서 써요. 미디어 관리에서 이름을 바꾸거나 지워도 페이지의 그림은 그대로예요. <a href="${esc(BO.media.url)}" target="_blank" rel="noopener">미디어 관리 열기 ↗</a></p>`;
  grid.innerHTML = note + (items.length ? items.map(item => `
    <button type="button" data-media-id="${esc(item.id)}" title="${esc(item.name)} · ${sizeText(item.size)}">
      <span class="thumb"><img src="${esc(item.url)}" alt="" loading="lazy" decoding="async"></span>
      <span>${esc(item.name)}</span>
    </button>`).join('') : `<p class="hint">${query ? '찾는 그림이 없어요.' : '미디어 관리에 올린 그림이 아직 없어요.'}</p>`);
}

async function renderLibrary() {
  const grid = $('#library-grid');
  if (state.librarySource === 'media') return renderMedia(grid);
  if (!state.assets) {
    grid.innerHTML = '<p class="hint">이미지 목록을 불러오는 중…</p>';
    try { state.assets = await api('assets'); } catch (error) {
      if (state.librarySource !== 'media') grid.innerHTML = `<p class="hint">목록을 불러오지 못했어요: ${esc(error.message)}</p>`;
      return;
    }
    if (state.librarySource === 'media') return;   // 불러오는 동안 '미디어 관리'로 바꿨으면 그쪽 목록을 그대로 둬요
  }
  const query = $('#library-search').value.trim().toLowerCase();
  const items = state.assets.filter(item => !query || item.path.toLowerCase().includes(query));
  grid.innerHTML = items.length ? items.map(item => `
    <button type="button" data-path="${esc(item.path)}" class="${item.upload || item.path.startsWith('assets/uploads/') ? 'new' : ''}" title="${esc(item.path)} · ${sizeText(item.size)}">
      <span class="thumb"><img src="${esc(assetUrl(item.path))}" alt="" loading="lazy" decoding="async"></span>
      <span>${esc(item.path.replace(/^assets\//, ''))}</span>
    </button>`).join('') : '<p class="hint">찾는 이미지가 없어요.</p>';
}

function bindLibrary() {
  const dialog = $('#library-dialog');
  const dropzone = $('#dropzone');
  const input = $('#file-input');
  dialog.addEventListener('close', () => finishPick(null));
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  $('#library-search').addEventListener('input', renderLibrary);
  if (BO.media) {
    $('#library-sources').hidden = false;
    $('#library-source-title').hidden = true;
  }
  for (const button of document.querySelectorAll('[data-lib-source]')) button.addEventListener('click', () => setLibrarySource(button.dataset.libSource));
  for (const button of document.querySelectorAll('[data-lib-tab]')) button.addEventListener('click', () => setLibraryTab(button.dataset.libTab));
  $('#icon-search').addEventListener('input', renderIconGrid);
  $('#icon-color').addEventListener('input', renderIconGrid);
  $('#icon-color-swatches').addEventListener('click', event => {
    const swatch = event.target.closest('[data-icon-swatch]');
    if (!swatch) return;
    $('#icon-color').value = swatch.dataset.iconSwatch;
    renderIconGrid();
  });
  $('#icon-grid').addEventListener('click', async event => {
    const button = event.target.closest('[data-icon]');
    if (!button) return;
    const icon = (window.BO_ICONS || []).find(item => item.name === button.dataset.icon);
    const color = $('#icon-color').value;
    if (!icon) return;
    if (state.pickKind === 'graphic') return finishPick({ icon: { name: icon.name, body: icon.body }, color });
    button.disabled = true;
    const uploaded = await iconAsFile(icon, color);
    button.disabled = false;
    if (uploaded) finishPick(uploaded);
  });
  $('#library-grid').addEventListener('click', async event => {
    const fromMedia = event.target.closest('[data-media-id]');
    if (fromMedia) {
      // 미디어 관리의 그림은 이 페이지 폴더로 가져온 뒤(같은 그림이면 있던 파일) 그 파일로 바꿔요.
      fromMedia.disabled = true;
      try {
        const { path } = await api(`media-import?id=${encodeURIComponent(fromMedia.dataset.mediaId)}`, { method: 'POST' });
        state.assets = null;
        finishPick({ path, ...(await measure(path)) });
      } catch (error) {
        toast(`그림을 가져오지 못했어요: ${error.message}`, 'error');
      } finally {
        fromMedia.disabled = false;
      }
      return;
    }
    const button = event.target.closest('[data-path]');
    if (!button) return;
    const path = button.dataset.path;
    finishPick({ path, ...(await measure(path)) });
  });
  const upload = async file => {
    dropzone.classList.add('busy');
    const result = await uploadFile(file);
    dropzone.classList.remove('busy');
    if (result) finishPick(result);
  };
  input.addEventListener('change', () => {
    if (input.files[0]) upload(input.files[0]);
    input.value = '';
  });
  dropzone.addEventListener('dragover', event => { event.preventDefault(); dropzone.classList.add('over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('over'));
  dropzone.addEventListener('drop', event => {
    event.preventDefault();
    dropzone.classList.remove('over');
    const file = [...event.dataTransfer.files].find(item => item.type.startsWith('image/'));
    if (file) upload(file);
    else toast('이미지 파일을 놓아 주세요.', 'error');
  });
}

// ── 프론트오피스(실제 사이트) 연동 ──
const front = {
  url: new URL(BO.frontUrl, location.href).href,
  status: null,
  window: null,
  windowPage: null
};
// 지금 편집 중인 페이지의 프론트오피스 주소
const frontPageUrl = () => new URL(pageById(state.pageId).file, front.url).href;

function renderFront() {
  if (FRONT_MODE === 'shell') {
    // Claude 배포 링크: 반영된 페이지는 바깥 틀의 ‘사이트 보기’ 탭에서 봐요.
    $('#front-dot').dataset.state = 'on';
    $('#open-front').title = '‘사이트 보기’ 탭에서 반영된 페이지를 열어요.';
    const label = $('#open-front .collapse');
    if (label) label.textContent = '사이트 보기';
    for (const el of document.querySelectorAll('[data-front-url]')) el.textContent = '사이트 보기 탭';
    return;
  }
  if (FRONT_MODE === 'static') {
    // 관리자 페이지에 붙인 경우: 반영된 페이지를 이 서버에서 바로 보여 줍니다.
    $('#front-dot').dataset.state = 'on';
    $('#open-front').title = `반영된 실제 페이지를 새 탭에서 열어요 · ${frontPageUrl()}
‘사이트에 반영’하면 열어 둔 탭이 자동으로 새로고침돼요.`;
    for (const el of document.querySelectorAll('[data-front-url]')) el.textContent = frontPageUrl();
    return;
  }
  const status = front.status;
  const mode = !status ? 'unknown' : status.running ? 'on' : status.problem === 'port-busy' ? 'busy' : 'off';
  $('#front-dot').dataset.state = mode;
  const address = PAGES.length > 1 ? frontPageUrl() : front.url.replace(/\/$/, '');
  $('#open-front').title = mode === 'on'
    ? `프론트오피스(실제 사이트) 열기 · ${address}
지금 열려 있는 화면 ${status.clients}개 · 반영하면 자동으로 새로고침돼요`
    : mode === 'busy'
      ? `프론트오피스를 켜지 못했어요. ${new URL(front.url).port}번 포트를 다른 프로그램(예전 미리보기 창 등)이 쓰고 있어요.`
      : `프론트오피스가 꺼져 있어요. 누르면 켜고 열어요 · ${address}`;
  for (const el of document.querySelectorAll('[data-front-url]')) el.textContent = address;
}

async function refreshFront() {
  if (FRONT_MODE !== 'server') {
    front.status = { running: true, clients: 0 };
    renderFront();
    return front.status;
  }
  try {
    front.status = await api('front');
    front.url = front.status.url || front.url;
  } catch (error) {
    front.status = { running: false, offline: Boolean(error.offline) };
  }
  renderFront();
  return front.status;
}

// 프론트오피스는 늘 같은 탭에서 열어, 반영할 때마다 그 탭이 자동으로 새로고침되게 합니다.
async function openFront() {
  if (FRONT_MODE === 'shell') {
    shellOf()?.showFront(pageById(state.pageId).file);
    return;
  }
  let status = front.status?.running ? front.status : await refreshFront();
  if (!status.running && !status.offline) {
    try {
      front.status = await api('front/start', { method: 'POST' });
    } catch (error) {
      toast(error.message, 'error');
      return;
    }
    renderFront();
    status = front.status;
  }
  if (!status.running) {
    toast(status.offline ? OFFLINE_MESSAGE : $('#open-front').title, 'error');
    return;
  }
  const target = frontPageUrl();
  if (front.window && !front.window.closed) {
    // 다른 페이지를 보고 있던 탭이면 지금 편집 중인 페이지로 옮겨 줍니다.
    if (front.windowPage !== target) front.window.location.href = target;
    front.windowPage = target;
    front.window.focus();
    return;
  }
  front.window = window.open(target, `bo-front-${new URL(front.url).port || 'site'}`);
  front.windowPage = target;
}

// ── 사이트 반영 · 버전 기록 ──
function openPublish() {
  state.canvas?.flush();
  flushFields();
  const dialog = $('#publish-dialog');
  if (!dialog.open) dialog.showModal();
}

async function publish() {
  const html = state.history[state.index]?.html;
  if (!html) return;
  const button = $('#publish');
  button.disabled = true;
  try {
    await flushSave();
    const base = state.bases[state.pageId];
    const send = force => api(`publish?${force ? 'force=true' : base ? `base=${encodeURIComponent(base)}` : ''}`, { method: 'POST', body: html, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    let result;
    try {
      result = await send(false);
    } catch (error) {
      if (error.code !== 'conflict') throw error;
      // 편집을 시작한 뒤 FAQ 관리 · 인사교 라이프 게시물 관리 등에서 사이트 파일을 바꿨어요: 덮어쓰면 그 변경이 사라져요
      if (!confirm(`${error.message}\n\n지금 반영하면 그쪽에서 바꾼 내용이 사라져요. 그래도 반영할까요?\n(취소하면 반영하지 않아요. 편집 내용은 임시저장돼 있으니, 화면을 새로고침해 바뀐 사이트에서 다시 고칠 수 있어요.)`)) {
        toast('반영하지 않았어요. 편집 내용은 임시저장돼 있어요.');
        return;
      }
      result = await send(true);
    }
    if (result?.publishedHash) state.bases[state.pageId] = result.publishedHash;
    // 반영한 내용이 최신이므로 밀려 있던 임시저장 재시도는 멈춥니다.
    clearTimeout(state.saveTimer);
    state.queued = null;
    state.saveError = null;
    state.server = result;
    clearUnsaved();
    refreshPageList();
    if (FRONT_MODE === 'shell') {
      // 열어 둔 ‘사이트 보기’ 탭이 이 페이지를 보고 있으면 바로 새로 그려요.
      shellOf()?.afterPublish(state.pageId);
      toast('사이트에 반영했어요. ‘사이트 보기’ 탭에 바로 적용됐어요.', 'success', { label: '사이트 보기', run: openFront });
      return;
    }
    if (FRONT_MODE === 'static') {
      // 열어 둔 '반영된 페이지' 탭은 바로 새로고침합니다(같은 서버의 탭이라 직접 새로고침할 수 있어요).
      let reloaded = false;
      if (front.window && !front.window.closed) {
        try { front.window.location.reload(); reloaded = true; } catch {}
      }
      toast(`사이트에 반영했어요${reloaded ? ' (열어 둔 페이지 탭도 새로고침했어요)' : ''}.`, 'success', { label: '반영된 페이지 보기', run: openFront });
      return;
    }
    if (result.front) {
      front.status = result.front;
      renderFront();
    }
    const opened = result.front?.clients || 0;
    const message = result.front?.running
      ? `사이트에 반영했어요. 프론트오피스에 바로 적용됐어요${opened ? ` (열린 화면 ${opened}개 자동 새로고침)` : ''}.`
      : '사이트에 반영했어요. 프론트오피스가 꺼져 있어 켜서 확인해 보세요.';
    toast(message, 'success', { label: '프론트오피스 보기', run: openFront });
  } catch (error) {
    toast(`반영하지 못했어요: ${error.message}`, 'error');
  } finally {
    button.disabled = false;
    renderStatus();
  }
}

async function openHistory() {
  state.canvas?.flush();
  flushFields();
  const dialog = $('#history-dialog');
  renderSteps();
  $('#backup-list').innerHTML = '<li class="empty">불러오는 중…</li>';
  dialog.showModal();
  try {
    const backups = await api('backups');
    $('#backup-list').innerHTML = backups.length ? backups.map(item => `
      <li><div><strong>${esc(fullTime(new Date(item.savedAt)))} 반영 전 상태</strong><small>${esc(item.name)} · ${sizeText(item.size)}</small></div>
      <button type="button" class="ghost-button" data-backup="${esc(item.name)}">불러오기</button></li>`).join('')
      : '<li class="empty">아직 반영 기록이 없어요. ‘사이트에 반영’을 누르면 이전 파일이 자동으로 백업돼요.</li>';
  } catch (error) {
    $('#backup-list').innerHTML = `<li class="empty">${esc(error.message)}</li>`;
  }
}

function renderSteps() {
  const steps = state.history.map((step, index) => ({ step, index })).reverse();
  $('#history-steps').innerHTML = steps.length ? steps.map(({ step, index }) => `
    <li class="${index === state.index ? 'current' : index > state.index ? 'future' : ''}">
      <span>${esc(step.label)}${index === state.index ? ' · 지금' : ''}</span><time>${clock(new Date(step.at))}</time>
    </li>`).join('') : '<li class="empty">아직 변경한 내용이 없어요.</li>';
}

async function loadExternal(html, label) {
  $('#history-dialog').close();
  await commit({ html, label, reload: true });
  toast(`${label} 완료. 확인 후 ‘사이트에 반영’을 눌러 주세요.`, 'success');
}

function bindHistory() {
  const dialog = $('#history-dialog');
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  $('#backup-list').addEventListener('click', async event => {
    const button = event.target.closest('[data-backup]');
    if (!button) return;
    try {
      const html = await api(`backups/${encodeURIComponent(button.dataset.backup)}`);
      await loadExternal(html, '백업 불러오기');
    } catch (error) {
      toast(error.message, 'error');
    }
  });
  $('#revert-published').addEventListener('click', async () => {
    try {
      const html = await api('published');
      // 지금 사이트 파일에서 다시 시작하므로 기준 지문도 지금 것으로
      const fresh = await api('state').catch(() => null);
      if (fresh?.publishedHash) state.bases[state.pageId] = fresh.publishedHash;
      await loadExternal(html, '사이트 상태로 되돌리기');
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

// ── 모드 · 화면 크기 ──
async function setMode(mode) {
  if (mode === state.mode || state.navigating) return;
  state.canvas?.flush();
  flushFields();
  state.mode = mode;
  for (const button of document.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  state.info = null;
  await flushSave();
  loadCanvas();
  renderPanel();
}

function setDevice(device) {
  state.device = device;
  $('#frame-wrap').dataset.device = device;
  for (const button of document.querySelectorAll('[data-device]')) button.setAttribute('aria-pressed', String(button.dataset.device === device));
}

function askDialog(selector, cancelValue) {
  return new Promise(resolve => {
    const dialog = $(selector);
    const finish = choice => {
      dialog.removeEventListener('click', onClick);
      dialog.removeEventListener('cancel', onCancel);
      if (dialog.open) dialog.close();
      resolve(choice);
    };
    const onClick = event => {
      const button = event.target.closest('button[value]');
      if (!button) return;
      event.preventDefault();
      finish(button.value);
    };
    const onCancel = event => {
      event.preventDefault();
      finish(cancelValue);
    };
    dialog.addEventListener('click', onClick);
    dialog.addEventListener('cancel', onCancel);
    dialog.showModal();
  });
}

// ── 여러 페이지 ──
// 지금 편집 중인 페이지를 제목줄·브라우저 탭·대화상자 문구에 보여 줍니다.
function renderTitle() {
  const page = pageById(state.pageId);
  const where = page.path || page.file;
  $('#site-name').textContent = BO.name;
  $('#page-file').textContent = where;
  $('#page-file').title = where;
  document.title = PAGES.length > 1 ? `${page.title} · ${BO.name}` : BO.name;
  for (const el of document.querySelectorAll('[data-page-path]')) el.textContent = where;
  if (BO.deployNote) for (const el of document.querySelectorAll('[data-deploy-note]')) el.textContent = BO.deployNote;
}

// 페이지 고르기: 버튼을 누르면 페이지 목록 카드가 열립니다. 반영하지 않은 편집이 남은 페이지에는 ‘반영 전’ 표시를 붙여요.
const PAGE_CHECK = '<svg class="page-option-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
// 하위 페이지(parent 가 있는 페이지 — 선배들의 이야기 › 후기 등)는 목록에 따로 두지 않고 위 페이지 하나로 묶어요(인사교 라이프처럼).
// 하위 페이지는 편집 화면 안의 옆 메뉴로 오가고, 묶인 것 중 하나라도 반영 전 편집이 있으면 위 페이지에 ‘반영 전’을 붙여요.
const topPages = () => PAGES.filter(page => !page.parent);
const groupOf = id => { const page = pageById(id); return page?.parent || id; };
const groupHasDraft = id => PAGES.some(page => (page.id === id || page.parent === id) && page.hasDraft);
function renderPagePicker() {
  const picker = $('#page-picker');
  picker.hidden = topPages().length < 2;
  if (picker.hidden) return;
  const current = pageById(state.pageId);
  const button = $('#page-button');
  $('#page-label').textContent = current.title;
  $('#page-dot').hidden = !current.hasDraft;
  button.disabled = Boolean(state.switchingPage);
  button.classList.toggle('is-busy', Boolean(state.switchingPage));
  if (button.disabled) closePageMenu();
  const menu = $('#page-menu');
  const focused = menu.contains(document.activeElement) ? document.activeElement.dataset.page : null;
  const group = groupOf(state.pageId);
  menu.innerHTML = `<div class="page-menu-head">편집할 페이지</div>${topPages().map((page, index) => {
    const selected = page.id === group;
    const kids = PAGES.filter(p => p.parent === page.id);
    const where = kids.length ? `${page.path || page.file} 외 ${kids.length}개 화면(페이지 안 옆 메뉴로 이동)` : (page.path || page.file);
    return `<button type="button" class="page-option" role="option" data-page="${esc(page.id)}" aria-selected="${selected}" tabindex="-1">
      <span class="page-option-num">${String(index + 1).padStart(2, '0')}</span>
      <span class="page-option-text"><strong>${esc(page.title)}</strong><small>${esc(where)}</small></span>
      ${groupHasDraft(page.id) ? '<span class="page-option-badge">반영 전</span>' : ''}${selected ? PAGE_CHECK : ''}
    </button>`;
  }).join('')}`;
  if (focused) menu.querySelector(`[data-page="${CSS.escape(focused)}"]`)?.focus();
}

const pageOptions = () => [...$('#page-menu').querySelectorAll('.page-option')];
function openPageMenu(focusLast = false) {
  const menu = $('#page-menu');
  const button = $('#page-button');
  if (button.disabled) return;
  menu.hidden = false;
  const rect = button.getBoundingClientRect();
  menu.style.top = `${Math.round(rect.bottom + 8)}px`;
  menu.style.maxHeight = `${Math.max(160, Math.round(innerHeight - rect.bottom - 20))}px`;
  menu.style.left = `${Math.round(Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8)))}px`;
  button.setAttribute('aria-expanded', 'true');
  const options = pageOptions();
  (focusLast ? options.at(-1) : options.find(option => option.getAttribute('aria-selected') === 'true') || options[0])?.focus();
}
function closePageMenu(returnFocus = false) {
  const menu = $('#page-menu');
  if (menu.hidden) return;
  menu.hidden = true;
  $('#page-button').setAttribute('aria-expanded', 'false');
  if (returnFocus) $('#page-button').focus();
}
function bindPagePicker() {
  const button = $('#page-button');
  const menu = $('#page-menu');
  button.addEventListener('click', () => (menu.hidden ? openPageMenu() : closePageMenu()));
  button.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openPageMenu(event.key === 'ArrowUp');
    }
  });
  menu.addEventListener('click', event => {
    const option = event.target.closest('.page-option');
    if (!option) return;
    closePageMenu(true);
    // 지금 그 묶음(선배들의 이야기의 하위 화면 등)을 고치고 있으면 그대로
    if (groupOf(state.pageId) === option.dataset.page) return renderPagePicker();
    switchPage(option.dataset.page);
  });
  menu.addEventListener('keydown', event => {
    const options = pageOptions();
    const index = options.indexOf(document.activeElement);
    const move = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (move) options[(index + move + options.length) % options.length]?.focus();
    else if (event.key === 'Home') options[0]?.focus();
    else if (event.key === 'End') options.at(-1)?.focus();
    else if (event.key === 'Escape') closePageMenu(true);
    else if (event.key === 'Tab') closePageMenu();
    else return;
    event.preventDefault();
    event.stopPropagation();
  });
  // 바깥(편집 화면 안 포함)을 누르면 닫습니다. 편집 화면(iframe)을 누르면 이 창의 포커스가 빠지므로 blur 로 알아요.
  document.addEventListener('pointerdown', event => {
    if (!$('#page-picker').contains(event.target)) closePageMenu();
  });
  window.addEventListener('blur', () => closePageMenu());
  window.addEventListener('resize', () => closePageMenu());
  $('.topbar').addEventListener('scroll', () => closePageMenu());
}

async function refreshPageList() {
  if (state.server) pageById(state.pageId).hasDraft = Boolean(state.server.hasDraft);
  if (PAGES.length > 1) {
    try {
      for (const item of await api('pages')) {
        const page = PAGES.find(entry => entry.id === item.id);
        if (page) page.hasDraft = Boolean(item.hasDraft);
      }
    } catch {}
  }
  renderPagePicker();
}

// 서버의 저장 상태를 받아 오고, 임시저장 뒤에 사이트 파일이 바뀌었으면 어느 쪽으로 편집할지 묻습니다.
async function loadPageState() {
  try {
    state.server = await api('state');
    if (state.server?.publishedHash) state.bases[state.pageId] = state.server.publishedHash;
  } catch (error) {
    state.server = null;
    toast(error.message, 'error');
  }
  renderStatus();
  if (state.server?.conflict) {
    if (await askDialog('#conflict-dialog', 'draft') === 'published') {
      try {
        state.server = await api('draft', { method: 'DELETE' });
        if (state.server?.publishedHash) state.bases[state.pageId] = state.server.publishedHash;
        // 버린 임시저장본으로 되돌아가지 않게 이 페이지의 실행 취소 기록도 새로 시작합니다.
        state.history = [];
        state.index = -1;
        renderHistoryButtons();
      } catch (error) {
        toast(error.message, 'error');
      }
    }
    renderStatus();
  } else if (state.server?.hasDraft && !state.history.length) {
    toast('이전에 임시저장한 편집 내용을 불러왔어요. 사이트에는 아직 반영되지 않았어요.');
  }
  refreshPageList();
}

// 다른 페이지로 바꿉니다. 지금 페이지의 편집은 먼저 저장하고, 페이지마다 실행 취소 기록을 따로 기억해 돌아오면 이어서 쓸 수 있어요.
async function switchPage(id) {
  if (id === state.pageId || state.navigating || !PAGES.some(page => page.id === id)) return renderPagePicker();
  state.canvas?.flush();
  flushFields();
  state.navigating = true;
  state.switchingPage = true;
  renderPagePicker();
  let switched = false;
  try {
    await flushSave();
    if (state.saveError) {
      toast('아직 저장되지 않은 편집이 있어 페이지를 바꾸지 않았어요. 서버 연결을 확인한 뒤 다시 골라 주세요.', 'error');
      return;
    }
    state.histories[state.pageId] = { history: state.history, index: state.index };
    const saved = state.histories[id];
    state.pageId = id;
    state.history = saved ? saved.history : [];
    state.index = saved ? saved.index : -1;
    state.server = null;
    state.info = null;
    state.assets = null;
    state.coalesceKey = null;
    switched = true;
    try { localStorage.setItem('bo-page', id); } catch {}
    // 관리자 페이지에 붙인 경우 주소를 그 페이지의 편집 주소(/admin/pages/{id}/edit)로 바꿔, 새로고침해도 같은 페이지가 열리게 합니다.
    const address = BO.pageUrl ? BO.pageUrl.replace('{id}', encodeURIComponent(id)) : `#page=${encodeURIComponent(id)}`;
    try { window.history.replaceState(null, '', address); } catch {}
    renderTitle();
    renderFront();
    renderHistoryButtons();
    $('#frame-loading').hidden = false;
    await loadPageState();
    renderPanel();
    await loadCanvas({ fresh: true });
  } finally {
    state.navigating = false;
    state.switchingPage = false;
    renderPagePicker();
  }
  if (switched) await offerUnsaved();
}

async function init() {
  renderTitle();
  renderPagePicker();
  try { localStorage.setItem('bo-page', state.pageId); } catch {}
  bindPagePicker();
  if (!BO.pageUrl) {
    window.addEventListener('hashchange', () => {
      const id = new URLSearchParams(location.hash.slice(1)).get('page');
      if (id && id !== state.pageId) switchPage(id);
    });
  }
  for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => setMode(button.dataset.mode));
  for (const button of document.querySelectorAll('[data-device]')) button.addEventListener('click', () => setDevice(button.dataset.device));
  $('#undo').addEventListener('click', undo);
  $('#redo').addEventListener('click', redo);
  $('#publish').addEventListener('click', openPublish);
  $('#open-front').addEventListener('click', openFront);
  renderFront();
  refreshFront();
  if (FRONT_MODE === 'server') {
    setInterval(() => { if (document.visibilityState === 'visible') refreshFront(); }, 5000);
    window.addEventListener('focus', refreshFront);
  }
  $('#publish-confirm').addEventListener('click', event => {
    event.preventDefault();
    $('#publish-dialog').close();
    publish();
  });
  $('#open-history').addEventListener('click', openHistory);
  bindPanel();
  bindLibrary();
  bindHistory();

  document.addEventListener('keydown', event => {
    // 사진 편집 창이 열려 있으면 단축키(실행 취소 · 반영 등)를 뒤의 편집기로 보내지 않아요(창을 닫은 뒤 바꿀 그림이 엉키지 않게)
    if (document.querySelector('.pe-ov')) return;
    const withMod = event.ctrlKey || event.metaKey;
    if (withMod && event.code === 'KeyS') {
      event.preventDefault();
      openPublish();
      return;
    }
    if (event.target.closest('input, textarea, select') || document.querySelector('dialog[open]')) return;
    if (withMod && event.code === 'KeyZ') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    else if (withMod && event.code === 'KeyY') { event.preventDefault(); redo(); }
    else if (event.key === 'Escape') state.canvas?.deselect();
  });
  window.addEventListener('beforeunload', event => {
    if (state.queued !== null || state.saving || state.saveError) {
      flushSave();
      event.preventDefault();
      event.returnValue = '';
    }
  });

  renderHistoryButtons();
  await loadPageState();
  renderPanel();
  await loadCanvas();
  await offerUnsaved();
}

// 서버에 저장되지 못한 편집 내용이 브라우저에 남아 있으면 복구할지 묻습니다(페이지마다 따로).
async function offerUnsaved() {
  const page = state.pageId;
  const saved = readUnsaved(page);
  if (!saved?.html) return;
  let working = '';
  try { working = await (await fetch(`${pageById(page).url}?__bo=preview&v=${Date.now()}`, { cache: 'no-store' })).text(); } catch { return; }
  if (page !== state.pageId) return;
  if (working === saved.html || state.history[state.index]?.html === saved.html) {
    clearUnsaved(undefined, page);
    return;
  }
  const where = PAGES.length > 1 ? `${pageById(page).title} · ` : '';
  $('#restore-meta').textContent = `${where}마지막 편집: ${fullTime(new Date(saved.at))}${saved.label ? ` · ${saved.label}` : ''}`;
  const choice = await askDialog('#restore-dialog', 'later');
  if (page !== state.pageId) return;
  if (choice === 'restore') {
    await commit({ html: saved.html, label: '저장되지 않은 편집 복구', reload: true });
    toast('편집 내용을 복구했어요. 확인 후 ‘사이트에 반영’을 눌러 주세요.', 'success');
  } else if (choice === 'discard') {
    clearUnsaved(undefined, page);
  }
}

init();
