/* =========================================================
   선배들의 이야기 — 움직임만(본문은 각 HTML에 있음)
   메뉴 주소(#reviews · #interviews · #projects · #cohorts)로 탭을 고르는 부분(탭 고르는 막대는 공통 하위 메뉴 바),
   글 창 키보드, 후기 글 창 색, 후기 숫자 페이지 앞뒤 버튼.
   탭 · 필터 · 글 창(.ov) · 인터뷰 상세(.ivd) · 프로젝트 상세(.pjd)는 시안처럼 CSS(라디오 · :target)만으로 움직임 —
   여기서는 키보드만 더함(창 Esc · 포커스 이동 · Tab 가둠, 숨은 라디오의 라벨 포커스 테두리. 2026-10-07).
   전체 인터뷰 목록 · 영상 인터뷰 재생 · 프로젝트 넘김은 js/stories-sections.js, 기수별 이모저모는 js/cohorts.js.
   쓰기 버튼 · 쓰기 창(.wov)은 관리자 전용이라 뺐고(2026-10-08 사용자 결정), 글 수 숫자도 안 씀(같은 날 사용자 결정).
   ========================================================= */
(function(){
  var page = document.querySelector('.stories-page');
  if (!page) return;
  var reduce = typeof Site !== 'undefined' ? Site.reduce : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- 탭 주소 ----------
     2뎁스는 헤더 밑 공통 하위 메뉴 바(site.js). 바 · 헤더 메뉴 · 표지 '읽기' 링크의 주소(#reviews · #interviews · #projects · #cohorts) → 탭 라디오.
     오버레이 · 상세 주소(#r-… · #iv-… · #p-rev 등)는 고른 탭을 바꾸지 않아 닫아도 그대로(고른 탭이 없을 때만 아래 paneTab).
     하위 메뉴 바의 지금 항목은 고른 탭 기준(<html data-sub>) — 오버레이 주소가 붙어도 그대로
     옛 주소: 시안의 #go-… · 없앤 쓰기 창 #write-…(2026-10-08)로 오면 그 탭으로 */
  var TAB = { reviews:'t1', interviews:'t2', projects:'t3', cohorts:'t4', 'go-iv':'t2', 'go-pr':'t3', 'go-coh':'t4',
    'write-rev':'t1', 'write-iv':'t2', 'write-pr':'t3', 'write-coh':'t4' };
  var SUB = { t1:'reviews', t2:'interviews', t3:'projects', t4:'cohorts' };
  // 10-13 사본: 탭마다 페이지가 따로(reviews · interviews · projects · cohorts.html). 이 페이지에 없는 탭 주소면 그 페이지로
  var PAGE = { t1:'reviews.html', t2:'interviews.html', t3:'projects.html', t4:'cohorts.html' }, PANE = { t1:'p-rev', t2:'p-iv', t3:'p-pr', t4:'p-coh' };
  function elsewhere(id){ if (!id || document.getElementById(PANE[id])) return false; location.replace(PAGE[id]); return true; }
  var header = document.getElementById('siteHeader');
  // 고른 탭의 섹션 머리(.sh)가 헤더 + 하위 메뉴 바 아래 32px에 오게 — 다른 카테고리 페이지의 #주소 도착 자리와 같음(2026-10-07, check.js jumpTo).
  // 머리 위치는 offsetTop 합으로 잼(탭이 바뀔 때 .pane이 translateY로 들어오는 동안에도 같은 값). 머리가 없으면 탭 내용 시작(.st-main)이 바 바로 아래
  function docTop(el){ var y = 0; for (var e = el; e; e = e.offsetParent) y += e.offsetTop; return y; }
  function toTabs(instant){
    var vis = function(el){ return el.getClientRects().length; };
    var head = [].filter.call(page.querySelectorAll('.st-main .pane .sh'), vis)[0];
    var top = head || [].filter.call(page.querySelectorAll('.st-main'), vis)[0];
    if (!top) return;
    var gap = matchMedia('(max-width:760px)').matches ? 40 : 64;   // 10-13: 하위 메뉴 바 ↔ 페이지 제목 여백, 모든 카테고리 페이지 같게(전에는 32px)
    var y = (head ? docTop(head) - gap : top.getBoundingClientRect().top + window.scrollY) - (header ? header.offsetHeight : 0);
    window.scrollTo({ top: Math.max(0, Math.round(y)), behavior: instant || reduce ? 'instant' : 'smooth' });
  }
  // 라디오를 켜고 change를 알림(아래 change 처리가 하위 메뉴 바를 맞춤)
  function pick(id){
    var r = document.getElementById(id);
    if (!r) return false;
    r.checked = true;
    r.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  page.addEventListener('change', function(e){
    var sub = SUB[e.target.id];
    if (!sub || !e.target.checked) return;
    document.documentElement.dataset.sub = sub;
    if (typeof Site !== 'undefined' && Site.syncSubnav) Site.syncSubnav();
  });
  function fromHash(instant){
    var id = TAB[decodeURIComponent(location.hash.slice(1))];
    if (elsewhere(id)) return;
    if (id && pick(id)) toTabs(instant);
    else if (!id) paneTab();
  }
  // 고른 탭이 없을 때(처음 연 뒤 탭을 안 고름) 인터뷰 · 프로젝트 · 기수 탭 안 주소(#iv-1 · #q-1-2 · #p-iv 등)로 오면 그 탭을 고름.
  // 안 고르면 하위 메뉴 바 지금 항목이 기본 '선배 후기'로 남고, 인터뷰 상세의 '← 인터뷰 목록'(#p-iv)이 후기 목록으로 감(2026-10-08)
  // 10-13: 다른 탭 안 주소(후기 탭의 '이번 주 인터뷰' → #iv-1 등)로 가면 그 탭으로 바꾸고 그 자리로 스크롤
  var PANE_TAB = { 'p-rev':'t1', 'p-iv':'t2', 'p-pr':'t3', 'p-coh':'t4' };
  function paneTab(){
    var el = document.getElementById(decodeURIComponent(location.hash.slice(1))), p = el && page.contains(el) && el.closest('.pane');
    if (!p || !PANE_TAB[p.id]) return;
    var r = document.getElementById(PANE_TAB[p.id]);
    if (r && !r.checked) {
      pick(PANE_TAB[p.id]);
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ el.scrollIntoView({ block:'start' }); }); });
    }
  }
  paneTab();
  addEventListener('hashchange', function(){ fromHash(false); });
  // 지금 주소와 같은 탭을 다시 고르면(하위 메뉴 바 · 헤더 · 모바일 메뉴 · 표지 링크) hashchange가 없으므로 직접 처리
  document.addEventListener('click', function(e){
    var a = e.target.closest('#siteHeader a[href], #drawer a[href], .stories-page a[href^="#"]');
    if (!a) return;
    var u = new URL(a.href);
    if (u.pathname === location.pathname && u.hash && u.hash === location.hash && TAB[decodeURIComponent(u.hash.slice(1))])
      setTimeout(function(){ fromHash(false); }, 0);
  }, true);
  if (elsewhere(TAB[decodeURIComponent(location.hash.slice(1))])) {
    // 다른 페이지로 가는 중
  } else if (TAB[decodeURIComponent(location.hash.slice(1))]) {
    // 처음 열 때: 탭만 먼저 켜고, 글꼴 · 레이아웃이 자리 잡은 뒤 탭 내용으로
    pick(TAB[decodeURIComponent(location.hash.slice(1))]);
    var go = function(){ fromHash(true); };
    if (document.readyState === 'complete') requestAnimationFrame(go); else addEventListener('load', go, { once: true });
  } else if ((function(p){ return p && p.classList.contains('pane') && page.contains(p) && p.getClientRects().length; })(document.getElementById(decodeURIComponent(location.hash.slice(1))))) {
    // 탭 내용 주소(#p-rev 등, 글 창을 닫은 뒤의 주소)로 새로 열 때: 브라우저는 .pane이 들어오는(translateY 18px) 중에 스크롤해
    // 제목이 바 아래 14px에 왔음 → 자리 잡은 뒤 탭 주소와 같은 32px로(2026-10-07)
    var goPane = function(){ toTabs(true); };
    if (document.readyState === 'complete') requestAnimationFrame(goPane); else addEventListener('load', goPane, { once: true });
  }

  /* ---------- 글 창(.ov): 주소(:target)로 열리는 창 ----------
     Esc로 닫기(닫기 링크와 같은 주소로), 열리면 닫기 단추로 포커스, 닫히면 연 링크로 포커스를 돌려줌.
     창이 열린 동안 Tab은 창 안에서만 돎. 처음부터 창 주소로 열 때는 포커스를 옮기지 않음 */
  (function(){
    var opener = null, link = null;
    function open(){ return page.querySelector('.ov:target'); }
    // 연 링크: 주소 이동 때 브라우저가 포커스를 비우기도 해서 누른 순간에 기억해 둠
    document.addEventListener('click', function(e){ link = e.target.closest && e.target.closest('a[href^="#"]'); }, true);
    addEventListener('hashchange', function(){
      var d = open(), a = link || document.activeElement; link = null;
      if (d) {
        if (a && a !== document.body && !d.contains(a)) opener = a;
        var x = d.querySelector('.x'); if (x) x.focus({ preventScroll: true });
      } else if (opener) {
        // 창 안 태그 링크(#tg-…)로 나가면 화면이 태그 목록 자리로 가므로 연 카드로 돌려주지 않음(다음 Tab은 브라우저가 그 자리부터)
        var to = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        if (!(to && to.classList.contains('tgt')) && document.contains(opener) && opener.getClientRects().length) opener.focus({ preventScroll: true });
        opener = null;
      }
    });
    document.addEventListener('keydown', function(e){
      var d = open();
      if (!d) return;
      if (e.key === 'Escape') { var x = d.querySelector('.x'); if (x) x.click(); return; }
      if (e.key !== 'Tab') return;
      var f = [].filter.call(d.querySelectorAll('a[href], button:not([disabled]), input:not([type=radio]), input[type=radio]:checked, textarea, select'), function(el){ return el.getClientRects().length && el.tabIndex >= 0; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1], cur = document.activeElement;
      if (!d.contains(cur)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && cur === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
    });
  })();

  /* ---------- 숨은 라디오(.tr: 칩 · 필터 · 보기 방식 · 페이지 번호 · 넘김)를 키보드로 고를 때 짝 라벨에 포커스 테두리(.kb-focus) ---------- */
  (function(){
    function mark(r, on){ if (r.id) [].forEach.call(page.querySelectorAll('label[for="' + r.id + '"]'), function(l){ l.classList.toggle('kb-focus', on); }); }
    page.addEventListener('focusin', function(e){ if (e.target.matches('input.tr') && e.target.matches(':focus-visible')) mark(e.target, true); });
    page.addEventListener('focusout', function(e){ if (e.target.matches('input.tr')) mark(e.target, false); });
  })();

})();

/* 후기 글 창(모달) 색 = 그 창을 여는 후기 카드의 포스트잇 색(10-13). 카드 색은 unify.css가 자리 순서로 정함 */
(function(){
  var cards = document.querySelectorAll('#p-rev .idgrid .idc[href^="#r-"]');
  [].forEach.call(cards, function(c){
    var ov = document.getElementById(c.getAttribute('href').slice(1)); if (!ov) return;
    var bg = getComputedStyle(c).backgroundColor;
    var sh = ov.querySelector('.sheet'); if (sh && bg) sh.style.setProperty('--pi', bg);
  });
})();

/* 후기 숫자 페이지(10-13): 기수별 이모저모 페이지 넘김과 같은 모양 — 앞뒤에 ← → 버튼을 붙이고 끝에서는 흐리게 */
(function(){
  var pager = document.querySelector('#p-rev .pager'); if (!pager) return;
  var radios = [].slice.call(document.querySelectorAll('input[name="pgn"]')); if (!radios.length) return;
  pager.classList.add('cpager');
  function cur(){ for (var i = 0; i < radios.length; i++) if (radios[i].checked) return i; return 0; }
  function go(i){ var r = radios[i]; if (!r) return; r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); sync(); }
  function mk(label, aria, d){ var b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-label', aria);
    b.onclick = function(){ go(cur() + d); }; return b; }
  var prev = mk('←', '이전 페이지', -1), next = mk('→', '다음 페이지', 1);
  pager.insertBefore(prev, pager.firstChild); pager.appendChild(next);
  function sync(){ var i = cur(); prev.disabled = i === 0; next.disabled = i === radios.length - 1; }
  radios.forEach(function(r){ r.addEventListener('change', sync); });
  sync();
})();
