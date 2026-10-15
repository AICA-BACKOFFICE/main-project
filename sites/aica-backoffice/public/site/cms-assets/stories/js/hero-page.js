/* =========================================================
   선배들의 이야기 — 히어로 단독 화면(디자인통일v1, 10-12. 인사교 라이프 js/life.js route()와 같은 방식)
   주소 없이 들어오면(헤더 '선배들의 이야기') 히어로만 보이고, 카드 · 하위 메뉴(#reviews 등)나 글 주소로 가면 히어로를 숨기고 그 화면으로.
   탭 고르기 · 스크롤은 그대로 js/stories.js가 맡음
   ========================================================= */
(function(){
  var page = document.querySelector('.stories-page'); if (!page) return;
  var cards = [].slice.call(page.querySelectorAll('.hx-p .hxp'));
  function route(){
    var raw = decodeURIComponent(location.hash.slice(1));
    if (raw === 'main') return;   // 본문으로 바로가기: 지금 화면 그대로
    var home = !raw;
    page.classList.toggle('is-home', home);
    if (home) {
      document.documentElement.dataset.sub = 'none';   // 하위 메뉴 바에 지금 항목 없음(라이프 히어로와 같게)
      if (typeof Site !== 'undefined' && Site.syncSubnav) Site.syncSubnav();
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else if (document.documentElement.dataset.sub === 'none') {
      // 탭 주소가 아닌 글 주소로 바로 온 경우: 선배 후기를 기본으로
      var r = page.querySelector('input.tb:checked');
      document.documentElement.dataset.sub = r ? ({ t1:'reviews', t2:'reviews', t3:'projects', t4:'cohorts' })[r.id] : 'reviews';
      if (typeof Site !== 'undefined' && Site.syncSubnav) Site.syncSubnav();
    }
  }
  addEventListener('hashchange', route);
  route();
  /* 카드: 마우스를 올리거나 초점이 가면 그 카드를 펼침(961px 이상). 마지막에 고른 카드가 펼쳐진 채로 남음 */
  function open(p){ cards.forEach(function(x){ x.classList.toggle('is-open', x === p); }); }
  cards.forEach(function(p){
    p.addEventListener('pointerenter', function(e){ if (e.pointerType === 'mouse') open(p); });
    p.addEventListener('focus', function(){ open(p); });
  });
})();

