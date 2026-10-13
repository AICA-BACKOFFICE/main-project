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
