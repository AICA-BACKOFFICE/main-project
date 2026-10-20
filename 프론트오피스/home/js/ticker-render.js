/* =========================================================
   첫 화면 전광판 — 선배들이 남긴 한 줄 그리기
   한 줄은 따로 적어 두지 않고 선배들의 이야기 후기 게시물(백오피스 DB)에서 가져와요.
   선배들의 이야기 › 한눈에 보기의 흐르는 한마디와 같은 글: 최근 후기 12개의 '흐르는 한마디'(비어 있으면 중제목 첫 문장).
   후기는 window.STORIES_DATA 로 받아요. 전광판은 첫 화면 맨 아래라 페이지를 다 그린 뒤에 불러와요:
     1) ../api/public/stories.js         — 백오피스 공개 API(DB의 지금 글)
     2) ../stories/js/stories-data.js    — 1)을 못 받을 때(백오피스가 꺼져 있을 때 · 서버 없이 볼 때) 쓰는 사본
   "[3기] 박*연 > 한 줄" 모양으로, 끊김 없이 흐르도록 같은 목록을 두 번 채우고(둘째는 aria-hidden),
   한 줄 수에 맞춰 흐르는 빠르기를 맞춰요(8줄 = 60초). 후기가 없으면 전광판을 숨겨요.
   ========================================================= */
(function () {
  'use strict';
  var tk = document.querySelector('.tk');
  if (!tk) return;
  var MAX = 12;
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
  // 한눈에 보기(stories/js/stories-render.js)와 같은 규칙
  function firstSentence(t) { var m = String(t || '').match(/^.*?[.!?。](\s|$)/); return (m ? m[0] : String(t || '')).trim(); }

  function render() {
    var D = window.STORIES_DATA;
    var items = (D && D.reviews ? D.reviews : []).slice(0, MAX).map(function (r) {
      return { who: (r.cohort ? '[' + r.cohort + '기] ' : '') + (r.author || '') + ' >', line: r.ticker || firstSentence(r.summary) };
    }).filter(function (it) { return it.line; });
    if (!items.length) { tk.hidden = true; return; }
    var html = items.map(function (it) {
      return '<li><span class="tk-p">' + esc(it.who) + '</span> ' + esc(it.line) + '</li>';
    }).join('');
    [].forEach.call(tk.querySelectorAll('.tk-list'), function (ul) { ul.innerHTML = html; });
    var track = tk.querySelector('.tk-track');
    if (track) track.style.animationDuration = Math.max(20, items.length * 7.5) + 's';
  }

  function load(src, onError) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = function () { if (window.STORIES_DATA) render(); else if (onError) onError(); else render(); };
    s.onerror = function () { if (onError) onError(); else render(); };
    document.head.appendChild(s);
  }
  load('../api/public/stories.js', function () { load('../stories/js/stories-data.js'); });
})();
