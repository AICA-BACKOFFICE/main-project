// 프론트오피스 로컬 서버 전용: 사이트 파일이 바뀌면(백오피스에서 반영 등) 이 화면을 자동으로 새로고침합니다.
// 로컬 서버가 화면을 보낼 때만 붙고, 배포되는 dist 파일에는 들어 있지 않습니다.
(() => {
  'use strict';
  if (window.__insagyoFrontLive) return;
  window.__insagyoFrontLive = true;

  const version = document.currentScript?.dataset.version || '';
  const storeKey = `insagyo-front-live:${location.pathname}`;

  let reloaded = null;
  try {
    reloaded = JSON.parse(sessionStorage.getItem(storeKey) || 'null');
    sessionStorage.removeItem(storeKey);
  } catch {}

  // 자동 새로고침 직후에는 보던 위치로 돌아가고, 최신 내용이라는 안내를 잠깐 띄웁니다.
  if (reloaded && Date.now() - reloaded.at < 20000) {
    const restore = () => window.scrollTo({ top: reloaded.y, left: 0, behavior: 'instant' });
    restore();
    window.addEventListener('load', () => {
      restore();
      showNotice();
    }, { once: true });
    if (document.readyState === 'complete') showNotice();
  }

  function showNotice() {
    if (document.querySelector('[data-insagyo-front-notice]')) return;
    const host = document.createElement('div');
    host.setAttribute('data-insagyo-front-notice', '');
    host.style.cssText = 'all: initial; position: fixed; left: 50%; bottom: 24px; z-index: 2147483647; transform: translateX(-50%); pointer-events: none;';
    const root = host.attachShadow({ mode: 'open' });
    const at = new Date();
    const clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    root.innerHTML = `
      <style>
        div { display: flex; align-items: center; gap: 9px; padding: 11px 16px; border-radius: 999px; background: rgba(21, 23, 28, .92); color: #fff;
          font: 600 13px/1.2 'School Pretendard', Pretendard, 'Malgun Gothic', sans-serif; letter-spacing: -.01em; white-space: nowrap;
          box-shadow: 0 10px 30px rgba(10, 16, 32, .25); animation: in .25s ease, out .4s ease 2.8s forwards; }
        i { width: 8px; height: 8px; border-radius: 50%; background: #3ddc84; }
        span { color: #aab3c5; font-weight: 500; }
        @keyframes in { from { opacity: 0; transform: translateY(8px); } }
        @keyframes out { to { opacity: 0; transform: translateY(8px); } }
      </style>
      <div><i></i>백오피스에서 반영한 최신 내용이에요<span>${clock}</span></div>`;
    document.documentElement.appendChild(host);
    setTimeout(() => host.remove(), 3400);
  }

  function reload() {
    try { sessionStorage.setItem(storeKey, JSON.stringify({ y: window.scrollY, at: Date.now() })); } catch {}
    location.reload();
  }

  // 여러 페이지가 있는 사이트에서는 이 페이지 파일이나 함께 쓰는 파일(CSS·JS·그림 등)이 바뀔 때만 새로고침합니다.
  const pageFile = (() => {
    let name = decodeURIComponent(location.pathname).replace(/^\/+/, '');
    if (!name || name.endsWith('/')) name += 'index.html';
    return name;
  })();
  const affectsThisPage = files => !Array.isArray(files) || !files.length ||
    files.some(file => file === pageFile || file === 'dist' || !/\.html?$/i.test(file));

  if (!('EventSource' in window)) return;
  const events = new EventSource('/__front/events');
  // 서버가 다시 켜지거나 연결이 끊긴 사이 내용이 바뀌었으면 다시 연결될 때 새로고침합니다.
  events.addEventListener('hello', event => {
    try {
      if (JSON.parse(event.data).version !== version) reload();
    } catch {}
  });
  events.addEventListener('change', event => {
    let files = null;
    try { files = JSON.parse(event.data).files; } catch {}
    if (affectsThisPage(files)) reload();
  });
})();
