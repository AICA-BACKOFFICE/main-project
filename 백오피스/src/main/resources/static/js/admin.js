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
    setTimeout(function () { el.remove(); }, 4200);
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
})();
