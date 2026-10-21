/* =========================================================
   방문 통계 기록 — 모든 페이지에 붙음(site.js 바로 다음 줄)
   · 페이지가 열리면 방문 한 번을, 선배들의 이야기 글(주소 끝 #r-p12 · #iv-p3 · #pj-p5)을 열면 그 글의 조회 한 번을
     백오피스(/api/public/track/…)에 남겨요. 관리자 홈 · 방문 통계 화면이 이 기록을 날짜별로 세요.
   · 방문자 번호는 이 브라우저에서 만든 임의 값(localStorage)이에요. 이름 · IP 같은 개인정보는 보내지 않아요.
   · 관리자 화면의 미리보기(/admin/…)와 파일로 연 페이지는 세지 않아요. 백오피스가 꺼져 있으면 조용히 넘어가요.
   ========================================================= */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script || !/^https?:$/.test(location.protocol) || location.pathname.indexOf('/admin/') === 0) return;
  if (!window.fetch || !window.URL) return;

  var api = new URL('../../api/public/track/', script.src).href;   // common/js/ 에서 두 칸 위 = 사이트 맨 위
  var STORE = 'aica-visitor';

  function visitorKey() {
    var key = null;
    try { key = localStorage.getItem(STORE); } catch (e) { /* 저장 못 하는 브라우저: 이번 페이지만 쓰는 번호 */ }
    if (!key || !/^[A-Za-z0-9_-]{8,64}$/.test(key)) {
      key = window.crypto && crypto.randomUUID ? crypto.randomUUID()
        : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
      try { localStorage.setItem(STORE, key); } catch (e) { /* 위와 같음 */ }
    }
    return key;
  }

  var visitor = visitorKey();

  function send(path, body) {
    body.visitorKey = visitor;
    try {
      fetch(api + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        keepalive: true, credentials: 'omit', cache: 'no-store'
      }).catch(function () {});
    } catch (e) { /* 기록 실패는 화면에 영향 없음 */ }
  }

  send('visit', {
    path: location.pathname,
    device: /Mobi|Android|iPhone|iPod/i.test(navigator.userAgent) ? 'MOBILE' : 'PC'
  });

  // 글 주소 이름(백오피스 StoryKind): r-p = 후기, iv-p = 인터뷰, pj-p = 프로젝트. 한 페이지에서 같은 글은 한 번만 셈
  var KIND = { r: 'review', iv: 'interview', pj: 'project' }, counted = {};
  function postView() {
    var m = /^#(r|iv|pj)-p(\d{1,18})$/.exec(location.hash);
    if (!m || counted[m[0]] || (document.body && document.body.dataset.previewAnchor)) return;
    counted[m[0]] = true;
    send('posts/' + KIND[m[1]] + '/' + m[2] + '/view', {});
  }
  postView();
  addEventListener('hashchange', postView);
})();
