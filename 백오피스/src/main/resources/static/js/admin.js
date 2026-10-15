/* 공통 스크립트: 삭제 확인, 토스트, 검색 단축키 */
(function () {
  // form[data-confirm] 제출 전 확인
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (form && form.dataset && form.dataset.confirm) {
      if (!window.confirm(form.dataset.confirm)) {
        e.preventDefault();
      }
    }
  }, true);

  // 토스트
  window.notify = function (message, isError) {
    var el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, isError ? 7200 : 4200);   // 안 된 이유는 읽을 시간이 더 있게
  };

  // ⌘/Ctrl + K → 검색창 포커스
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      var input = document.getElementById('globalSearch');
      if (input) {
        e.preventDefault();
        input.focus();
        input.select();
      }
    }
  });

  // 왼쪽 메뉴 세부 카테고리 펼치기 · 접기(화살표). 지금 보고 있는 메뉴는 서버가 펼쳐 두고, 나머지는 마지막으로 펼친 상태를 기억
  document.querySelectorAll('.lnb-tree').forEach(function (tree) {
    var btn = tree.querySelector('.lnb-toggle');
    if (!btn) return;
    var key = 'lnb-open-' + tree.dataset.tree;
    var set = function (open) { tree.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); };
    if (!tree.classList.contains('open')) {
      try { if (localStorage.getItem(key) === '1') set(true); } catch (e) { /* 저장소를 못 쓰면 접힌 채로 */ }
    }
    btn.addEventListener('click', function () {
      var open = !tree.classList.contains('open');
      set(open);
      try { localStorage.setItem(key, open ? '1' : '0'); } catch (e) { /* 무시 */ }
    });
  });

  // CSRF 헬퍼 (fetch 용)
  window.csrfHeaders = function () {
    var token = document.querySelector('meta[name="_csrf"]');
    var header = document.querySelector('meta[name="_csrf_header"]');
    var h = {};
    if (token && header && token.content) {
      h[header.content] = token.content;
    }
    return h;
  };

  // ── 로그인 확인(BOSession) ──
  // 관리자 서버를 다시 켜면 로그인이 풀려요(열어 둔 화면은 그대로). 그 상태로 사진을 올리거나 저장하면 조용히 실패하던 것을,
  // 화면 위에 크게 알리고, 새 창에서 다시 로그인하면 이 화면의 보안 토큰을 새로 받아 하던 작업을 그대로 이어서 할 수 있게 해요.
  var script = document.currentScript;
  var BASE = script && script.src ? script.src.replace(/\/js\/admin\.js(?:\?.*)?$/, '') : '';
  var lostBar = null, checking = null, lastCheck = Date.now();
  function applyToken(t) {
    if (!t || !t.token) return;
    var m = document.querySelector('meta[name="_csrf"]'); if (m) m.setAttribute('content', t.token);
    var h = document.querySelector('meta[name="_csrf_header"]'); if (h && t.header) h.setAttribute('content', t.header);
    document.querySelectorAll('input[type="hidden"][name="' + (t.parameter || '_csrf') + '"]').forEach(function (i) { i.value = t.token; });
  }
  function showLost(offline) {
    if (!lostBar) {
      lostBar = document.createElement('div');
      lostBar.className = 'session-lost';
      lostBar.setAttribute('role', 'alertdialog');
      lostBar.addEventListener('click', function (e) { if (e.target.closest('[data-session="retry"]')) check(); });
      document.body.appendChild(lostBar);
    }
    lostBar.innerHTML = offline
      ? '<b>관리자 서버에 연결하지 못했어요</b><p>백오피스 창(서버)이 켜져 있는지 확인해 주세요. 쓰던 내용은 이 화면에 그대로 있어요.</p>'
        + '<div><button type="button" class="btn primary" data-session="retry">다시 확인</button></div>'
      : '<b>로그인이 풀렸어요</b><p>관리자 서버를 다시 켜면 로그인이 풀려요. 쓰던 내용은 이 화면에 그대로 있어요.<br>새 창에서 다시 로그인한 뒤 이 화면으로 돌아와 ‘이어서 하기’를 눌러 주세요.</p>'
        + '<div><a class="btn primary" href="' + BASE + '/login" target="_blank">새 창에서 로그인</a><button type="button" class="btn" data-session="retry">이어서 하기</button></div>';
  }
  function hideLost() {
    if (!lostBar) return;
    lostBar.remove(); lostBar = null;
    window.notify('다시 연결됐어요. 하던 작업을 이어서 하면 돼요.');
  }
  // 살아 있으면 true(새 보안 토큰을 이 화면에 넣음), 풀렸거나 서버가 꺼져 있으면 안내를 띄우고 false
  function check() {
    if (checking) return checking;
    lastCheck = Date.now();
    checking = fetch(BASE + '/admin/session', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 401 || r.status === 403 || (r.redirected && /\/login(\?|$)/.test(r.url))) { showLost(false); return false; }
        if (!r.ok) return true;   // 서버 오류는 로그인 문제가 아니니 그대로 진행(그 요청이 알려 줌)
        return r.json().then(function (t) { applyToken(t); hideLost(); return true; }, function () { return true; });
      }, function () { showLost(true); return false; })
      .then(function (ok) { checking = null; return ok; });
    return checking;
  }
  window.BOSession = { check: check };

  // ── 아직 반영하지 않은 페이지 편집(임시저장) 안내 ──
  // FAQ 관리 · 인사교 라이프 게시물 관리는 그 페이지에 임시저장이 있으면 저장을 막아요(편집기에서 고친 것과 엇갈리지 않게).
  // 그때 무엇이 바뀌어 있는지(서버가 정리한 draft.changes) · 언제 임시저장했는지 보여 주고, 편집기로 가거나 버릴 수 있게 해요.
  window.draftNoteHtml = function (draft, pageLabel, editorUrl) {
    var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    var when = '';
    if (draft && draft.savedAt) {
      var d = new Date(draft.savedAt);
      if (!isNaN(d)) when = d.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    var list = (draft && draft.changes) || [];
    var items = list.map(function (c) {
      var change = c.before && c.after ? '<del>' + esc(c.before) + '</del><span class="arrow">→</span><ins>' + esc(c.after) + '</ins>'
        : c.after ? '<ins>' + esc(c.after) + '</ins>' : '<del>' + esc(c.before) + '</del><span class="arrow">→</span><i>비움</i>';
      return '<li>' + (c.where ? '<span class="dn-where">' + esc(c.where) + '</span>' : '') + '<b>' + esc(c.what) + '</b> ' + change + '</li>';
    }).join('');
    if (draft && draft.more) items += '<li class="dn-more">그 밖에 ' + draft.more + '곳이 더 바뀌어 있어요.</li>';
    return '<div class="draft-note" role="alert">'
      + '<b class="dn-title">' + esc(pageLabel) + ' 페이지에 아직 사이트에 반영하지 않은 임시저장이 있어 지금은 저장할 수 없어요</b>'
      + '<p>임시저장은 <b>카테고리 페이지 관리(페이지 편집기)</b>에서 고친 뒤 ‘사이트에 반영’을 누르지 않아 남아 있는 편집 내용이에요'
      + (when ? ' (마지막 임시저장: ' + esc(when) + ')' : '') + '. 여기서 저장하면 그 편집과 엇갈리기 때문에 막아 두었어요.</p>'
      + (items ? '<p class="dn-sub">임시저장에서 바뀐 곳</p><ul class="dn-list">' + items + '</ul>' : '')
      + '<p class="dn-sub">이렇게 하면 다시 저장할 수 있어요</p>'
      + '<div class="dn-acts"><a class="btn primary sm" href="' + esc(editorUrl) + '">편집기에서 보고 반영하기</a>'
      + '<button type="button" class="btn sm danger" data-act="discard-draft">임시저장 버리기</button></div>'
      + '</div>';
  };
  // 다른 창(새 창 로그인 등)에서 돌아오면 확인: 안내가 떠 있으면 바로, 아니면 1분에 한 번까지만
  if (/\/admin(\/|$)/.test(location.pathname) && document.querySelector('meta[name="_csrf"]')) {
    var onBack = function () {
      if (document.visibilityState === 'hidden') return;
      if (lostBar || Date.now() - lastCheck > 60000) check();
    };
    window.addEventListener('focus', onBack);
    document.addEventListener('visibilitychange', onBack);
  }
})();
