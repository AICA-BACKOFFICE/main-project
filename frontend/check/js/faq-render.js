/* =========================================================
   지원 전 체크 — 자주 묻는 질문 그리기(2026-10-20)
   질문은 백오피스 DB(표 faqs, 관리자 페이지 '지원 전 Check FAQ 관리')에서 받아요.
   window.FAQ_DATA 로 받아요(head의 defer 순서):
     1) js/faq-data.js         — 사본(백오피스가 꺼져 있을 때 · 서버 없이 볼 때). 백오피스가 저장할 때마다 다시 써요
     2) ../api/public/faq.js   — 백오피스 공개 API(DB의 지금 질문). 불러오면 1)을 덮어써요
   질문 목록(#faqList)과 분류 버튼의 질문 수(.faq-cnt)를 그려요. 분류 · 검색 · 페이지 · 펼치기는 지금처럼 js/check.js가 맡아요.
   그래서 이 파일은 check.js보다 먼저 불러와요. 답은 백오피스가 정리한 HTML(링크 · 굵게 · 강조 · 줄바꿈 · '확인 필요' 표시)이에요.
   데이터가 없으면 페이지에 적힌 질문을 그대로 둬요.
   ========================================================= */
(function () {
  'use strict';
  var D = window.FAQ_DATA, list = document.getElementById('faqList');
  if (!D || !D.items || !D.items.length || !list) return;
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
  var ARROW = '<span class="faq-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"></path></svg></span>';
  list.innerHTML = D.items.map(function (it, i) {
    return '<li id="faq-' + (i + 1) + '" class="faq-item" data-cat="' + esc(it.cat) + '">'
      + '<h3><button type="button" class="faq-q" id="fq-' + i + '" aria-expanded="false" aria-controls="fa-' + i + '">'
      + '<span class="faq-qa">Q</span><span class="faq-qt" data-text="' + esc(it.question) + '">' + esc(it.question) + '</span>' + ARROW + '</button></h3>'
      + '<div class="faq-a" id="fa-' + i + '" role="region" aria-labelledby="fq-' + i + '"><div><span class="faq-qa">A</span>'
      + '<div class="faq-at">' + it.answer + '</div></div></div></li>';
  }).join('');
  [].forEach.call(document.querySelectorAll('.faq-tabs .faq-tab[data-cat]'), function (tab) {
    var cat = tab.getAttribute('data-cat'), cnt = tab.querySelector('.faq-cnt');
    if (cnt) cnt.textContent = cat === 'all' ? D.items.length : D.items.filter(function (it) { return it.cat === cat; }).length;
  });
})();
