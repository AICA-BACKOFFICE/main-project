/* =========================================================
   선배들의 이야기 — 움직임만(본문은 index.html에 있음)
   시안 script.js의 네 부분(표지 슬라이더 · 인터뷰 캐러셀 · 기수 아카이브 페이지 넘김 · 기수 기록 창)을 그대로 옮기고
   메뉴 주소(#reviews · #interviews · #projects · #cohorts)로 탭을 고르는 부분을 더함(탭 고르는 막대는 공통 하위 메뉴 바).
   탭 · 필터 · 글 창(.ov) · 인터뷰 상세(.ivd) · 프로젝트 상세(.pjd)는 시안처럼 CSS(라디오 · :target)만으로 움직임 —
   여기서는 키보드만 더함(창 Esc · 포커스 이동 · Tab 가둠, 숨은 라디오의 라벨 포커스 테두리. 2026-10-07).
   히어로 캐러셀 · 전체 인터뷰 목록 · 영상 인터뷰 재생 · 프로젝트 넘김은 js/stories-sections.js.
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
  // 라디오를 켜고 change를 알림(인터뷰 캐러셀이 보이게 된 뒤 크기를 다시 잼)
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

  /* ---------- 표지 슬라이더 ---------- */
  (function(){
    var root = document.getElementById('cover'); if (!root) return;
    var sl = [].slice.call(root.querySelectorAll('.sl')), seg = [].slice.call(root.querySelectorAll('.seg'));
    var curEl = document.getElementById('cur'), ply = document.getElementById('ply'), cur = 0, t = null, DUR = 3000, hold = false;
    var paused = reduce;
    var P = '<svg viewBox="0 0 10 10" aria-hidden="true"><rect x="1" y="0" width="3" height="10"/><rect x="6" y="0" width="3" height="10"/></svg>';
    var R = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 0l8 5-8 5z"/></svg>';
    function go(i){
      cur = (i + sl.length) % sl.length;
      sl.forEach(function(s, k){ s.classList.toggle('on', k === cur); s.setAttribute('aria-hidden', k === cur ? 'false' : 'true'); s.inert = k !== cur; });
      seg.forEach(function(b, k){
        b.setAttribute('aria-current', k === cur ? 'true' : 'false'); b.classList.toggle('done', k < cur);
        var bar = b.querySelector('i'); bar.style.display = 'none'; void bar.offsetWidth; bar.style.display = '';   // 진행 막대 애니메이션 다시 시작
      });
      curEl.textContent = '0' + (cur + 1); run();
    }
    function run(){ clearTimeout(t); var on = !paused && !hold; root.classList.toggle('playing', on); if (on) t = setTimeout(function(){ go(cur + 1); }, DUR); }
    function setP(p){ paused = p; ply.innerHTML = p ? R : P; ply.setAttribute('aria-label', p ? '자동 넘김 시작' : '자동 넘김 멈추기'); go(cur); }
    seg.forEach(function(b){ b.addEventListener('click', function(){ go(+b.dataset.i); }); });
    document.getElementById('prev').onclick = function(){ go(cur - 1); };
    document.getElementById('next').onclick = function(){ go(cur + 1); };
    ply.onclick = function(){ setP(!paused); };
    root.addEventListener('mouseenter', function(){ hold = true; run(); });
    root.addEventListener('mouseleave', function(){ hold = false; run(); });
    root.addEventListener('focusin', function(){ hold = true; run(); });
    root.addEventListener('focusout', function(){ hold = false; run(); });
    root.addEventListener('keydown', function(e){ if (e.key === 'ArrowRight') go(cur + 1); if (e.key === 'ArrowLeft') go(cur - 1); });
    var x0 = null;
    root.addEventListener('touchstart', function(e){ x0 = e.touches[0].clientX; }, { passive: true });
    root.addEventListener('touchend', function(e){ if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(cur + (dx < 0 ? 1 : -1)); x0 = null; });
    setP(paused);
  })();

  /* ---------- 인터뷰 캐러셀(넘김 점은 HTML .ivdots) ---------- */
  (function(){
    var band = page.querySelector('.ivband'); if (!band) return;
    // 콜라주 미리보기(10-13): 넘김 없이 고정 배치. '전체 보기'는 아래 전체 인터뷰로 부드럽게 내려감
    if (band.classList.contains('ivcol')) {
      var all = page.querySelector('.ivall'), tgt = page.querySelector('#iv-all');
      if (all && tgt) all.addEventListener('click', function(e){ e.preventDefault(); tgt.scrollIntoView({behavior:'smooth', block:'start'}); });
      return;
    }
    var g = band.querySelector('.ivgrid'), cards = [].slice.call(g.querySelectorAll('.iv')), n = cards.length, cur = 0;
    var L = band.querySelector('.ivnav.l'), R = band.querySelector('.ivnav.r');
    var dots = [].slice.call(band.querySelectorAll('.ivdots button'));
    dots.forEach(function(d, i){ d.onclick = function(){ go(i); }; });
    var POS = [{x:0,s:1.06,o:1},{x:.72,s:.84,o:1},{x:1.3,s:.7,o:.9},{x:1.7,s:.6,o:0}];
    function size(){
      cards.forEach(function(c){ c.style.height = ''; });
      var h = 0; cards.forEach(function(c){ h = Math.max(h, c.offsetHeight); });
      cards.forEach(function(c){ c.style.height = h + 'px'; c.style.top = Math.round(h * .03 + 12) + 'px'; });
      g.style.height = Math.round(h * 1.06 + 24) + 'px';
    }
    function go(i){
      cur = (i % n + n) % n; var w = cards[0].offsetWidth;
      cards.forEach(function(c, k){
        var off = ((k - cur) % n + n) % n; if (off > n / 2) off -= n;
        var a = Math.min(Math.abs(off), 3), p = POS[a], sg = off < 0 ? -1 : 1;
        var t = 'translateX(' + Math.round(sg * p.x * w) + 'px) scale(' + p.s + ')';
        c.style.setProperty('--t', t); c.style.transform = t; c.style.opacity = p.o; c.style.zIndex = 10 - a; c.style.pointerEvents = a > 2 ? 'none' : '';
        c.classList.toggle('on', off === 0); c.tabIndex = off === 0 ? 0 : -1; c.setAttribute('aria-hidden', a > 2 ? 'true' : 'false');
      });
      dots.forEach(function(d, k){ d.setAttribute('aria-current', k === cur ? 'true' : 'false'); });
    }
    cards.forEach(function(c, k){ c.addEventListener('click', function(e){ if (!c.classList.contains('on')) { e.preventDefault(); go(k); } }); });
    L.onclick = function(){ go(cur - 1); }; R.onclick = function(){ go(cur + 1); };
    band.addEventListener('keydown', function(e){ if (e.key === 'ArrowLeft') go(cur - 1); else if (e.key === 'ArrowRight') go(cur + 1); });
    var sx = null;
    g.addEventListener('pointerdown', function(e){ sx = e.clientX; });
    g.addEventListener('pointerup', function(e){ if (sx === null) return; var dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 40) go(cur + (dx < 0 ? 1 : -1)); });
    function all(){ size(); go(cur); }
    addEventListener('resize', all);
    document.addEventListener('change', function(){ setTimeout(all, 60); });   // 탭이 바뀌어 보이게 되면 다시 잼
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(all);
    all();
  })();

  /* ---------- 기수별 교육과정(트랙 이름). 3–5기는 자료가 없어 카드를 안 보임. 새 기수는 여기에 한 줄 추가 ---------- */
  window.STORIES_CURRICULUM = window.STORIES_CURRICULUM || {
    '7': ['AI 금융', 'AI 피지컬', 'AI 보안', 'AI 헬스케어', 'AI 융합'],
    '6': ['데이터 기술', 'AI 모델링', 'AI 기반 서비스', 'AI 플랫폼&인프라', 'AI 비즈니스']
  };

  /* ---------- 기수 아카이브: 기수 필터 + 8개씩 페이지 넘김(번호 버튼은 걸린 글 수에 따라 만듦) ---------- */
  (function(){
    var arch = page.querySelector('#p-coh .arch'); if (!arch) return;
    var cards = [].slice.call(arch.querySelectorAll('.g2 > a.st')), nav = arch.querySelector('.cpager'), PER = 8, pg = 1;
    var TAGS = ['입교식','OT','특강','기업탐방','중간발표회','해커톤','프로젝트','취업박람회','수료식','동문회'];
    var COHS = ['7','6','3-5'], coh = 'all', tag = null, rail = page.querySelector('#p-coh .crail');
    function cOf(c){ var m = c.className.match(/\bc(\d)\b/); return m ? m[1] : ''; }
    function tOf(c){ return (c.className.match(/\bg(\d)\b/g) || []).map(function(x){ return TAGS[+x.slice(1)]; }); }
    function inC(c, k){ var v = cOf(c); return k === '3-5' ? (v === '3' || v === '4' || v === '5') : v === k; }
    function match(c){ return (coh === 'all' || inC(c, coh)) && (!tag || tOf(c).indexOf(tag) > -1); }
    // 거르기 버튼: 이름만(글 수 숫자는 안 씀, 2026-10-08 사용자 결정). 걸리는 글이 없는 태그만 누를 수 없게
    function li(label, on, dis, fn, live){
      var l = document.createElement('li'), b = document.createElement('button'); b.type = 'button';
      b.textContent = label; if (live) { var d = document.createElement('span'); d.className = 'live'; d.textContent = '·'; b.appendChild(d); }
      b.setAttribute('aria-pressed', on ? 'true' : 'false'); if (dis) b.disabled = true; b.onclick = fn; l.appendChild(b); return l;
    }
    function drawRail(){
      if (!rail) return;
      var cu = rail.querySelector('[data-group=coh]'), tu = rail.querySelector('[data-group=tag]');
      cu.innerHTML = ''; if (tu) tu.innerHTML = '';
      cu.appendChild(li('전체', coh === 'all', false, function(){ coh = 'all'; tag = null; update(); }));
      COHS.forEach(function(k, i){ cu.appendChild(li(k.replace('-', '–') + '기', coh === k, false, function(){ coh = k; tag = null; update(); }, i === 0)); });
      if (tu) TAGS.forEach(function(t){
        var any = cards.some(function(c){ return (coh === 'all' || inC(c, coh)) && tOf(c).indexOf(t) > -1; });
        tu.appendChild(li(t, tag === t, !any, function(){ tag = tag === t ? null : t; update(); }));
      });
      var rs = rail.querySelector('.creset'); if (rs) rs.hidden = !tag;
      arch.dataset.coh = coh; if (tag) arch.dataset.tag = tag; else delete arch.dataset.tag;
    }
    function update(){ pg = 1; drawRail(); render(false); }
    function btn(label, to, opt){
      var b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      if (opt && opt.cur) b.setAttribute('aria-current', 'page');
      if (opt && opt.dis) b.disabled = true;
      if (opt && opt.aria) b.setAttribute('aria-label', opt.aria);
      b.onclick = function(){ pg = to; render(true); };
      return b;
    }
    // 교육과정 고정 카드: 고른 기수의 교육과정 요약을 그리드 첫 칸에(1쪽에만, 그만큼 1쪽 기록은 하나 적게)
    var pin = document.createElement('div'); pin.className = 'cpin';
    var g2 = arch.querySelector('.g2'); g2.insertBefore(pin, g2.firstChild);
    pin.addEventListener('click', function(e){ var b = e.target.closest('button[data-coh]'); if (!b) return; coh = b.dataset.coh; tag = null; update(); });
    function drawPin(){
      var C = window.STORIES_CURRICULUM || {}, h = '', ks = Object.keys(C).sort(function(x, y){ return y - x; });
      var url = (typeof SITE_LINKS !== 'undefined' && SITE_LINKS.official && SITE_LINKS.official.url) || 'https://support.gj-aischool.or.kr/fo/main';
      var esc = function(t){ return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
      pin.dataset.coh = coh;
      var chips = function(list){ return '<div class="cchips">' + list.map(function(t){ return '<span>' + esc(t) + '</span>'; }).join('') + '</div>'; };
      if (coh === 'all' && ks.length) {
        // 전체: 가장 최근 기수 트랙을 크게, 지난 기수는 아래 작은 단추(누르면 그 기수로 거름) — 기수가 늘어도 카드 높이 그대로
        h = '<span class="k">CURRICULUM</span><b>' + ks[0] + '기<br>교육과정</b><span class="nw">2026</span>' + chips(C[ks[0]]);
        if (ks.length > 1) h += '<div class="past"><span>지난 기수</span><div>' + ks.slice(1).map(function(k){ return '<button type="button" data-coh="' + k + '">' + k + '기</button>'; }).join('') + '</div></div>';
      } else if (C[coh]) {
        h = '<span class="k">CURRICULUM</span><b>' + coh + '기<br>교육과정</b>' + chips(C[coh]);
      }
      if (h) h += '<div class="cpin-ft"><p>자세한 내용은 공식 홈페이지에서 확인하세요.</p><a href="' + url + '" target="_blank" rel="noopener">공식 홈페이지 <span aria-hidden="true">↗</span></a></div>';
      pin.innerHTML = h; pin.setAttribute('role', 'group'); pin.setAttribute('aria-label', (coh === 'all' ? '기수별' : coh + '기') + ' 교육과정');
      return !!h;
    }
    function render(scroll){
      var hasPin = drawPin();
      var list = cards.filter(match), first = hasPin ? PER - 1 : PER, pages = Math.max(1, 1 + Math.ceil(Math.max(0, list.length - first) / PER));
      if (pg > pages) pg = pages;
      cards.forEach(function(c){ c.classList.add('pg-off'); });
      pin.hidden = !hasPin || pg !== 1;
      (pg === 1 ? list.slice(0, first) : list.slice(first + (pg - 2) * PER, first + (pg - 1) * PER)).forEach(function(c){ c.classList.remove('pg-off'); });
      nav.innerHTML = ''; nav.hidden = pages < 2; if (pages < 2) return;
      nav.appendChild(btn('←', pg - 1, { dis: pg === 1, aria: '이전 페이지' }));
      for (var i = 1; i <= pages; i++) nav.appendChild(btn(String(i), i, { cur: i === pg, aria: i + '페이지' }));
      nav.appendChild(btn('→', pg + 1, { dis: pg === pages, aria: '다음 페이지' }));
      if (scroll) {
        var g = arch.querySelector('.g2'), y = g.getBoundingClientRect().top + window.scrollY - 160;
        if (y < window.scrollY) window.scrollTo({ top: y, behavior: reduce ? 'instant' : 'smooth' });
      }
    }
    if (rail && rail.querySelector('.creset')) rail.querySelector('.creset').onclick = function(){ tag = null; update(); };
    drawRail(); render(false);
  })();

  /* ---------- 글 창(.ov): 주소(:target)로 열리는 창 ----------
     Esc로 닫기(닫기 링크와 같은 주소로), 열리면 닫기 단추로 포커스, 닫히면 연 링크로 포커스를 돌려줌.
     창이 열린 동안 Tab은 창 안에서만 돎(기수 기록 창도 같이). 처음부터 창 주소로 열 때는 포커스를 옮기지 않음 */
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
      var d = open() || page.querySelector('.cmodal.on');
      if (!d) return;
      if (e.key === 'Escape' && !d.classList.contains('cmodal')) { var x = d.querySelector('.x'); if (x) x.click(); return; }
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

  /* ---------- 기수 기록 창(.cmodal, 틀은 HTML): 누른 카드의 사진 · 기수 · 날짜 · 제목 · 요약을 옮겨 보여 줌 ---------- */
  (function(){
    var arch = page.querySelector('#p-coh .arch'), m = page.querySelector('.cmodal');
    if (!arch || !m) return;
    var last = null;
    function close(){ var f = m.querySelector('.media iframe'); if (f) m.querySelector('.media').innerHTML = ''; m.classList.remove('on'); document.body.classList.remove('cm-lock'); if (last) last.focus(); }
    m.querySelector('.bg').onclick = close; m.querySelector('.x').onclick = close;
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && m.classList.contains('on')) close(); });
    arch.addEventListener('click', function(e){
      var c = e.target.closest('a.st'); if (!c || !arch.contains(c)) return;
      e.preventDefault(); last = c; m.classList.remove('is-cur');
      var ph = c.querySelector('.ph'), media = m.querySelector('.media'); media.innerHTML = '';
      var vis = ph && ph.querySelector('img,svg'); if (vis) media.appendChild(vis.cloneNode(true));
      var dur = ph && ph.querySelector('.dur');
      if (dur) { var d = document.createElement('span'); d.className = 'dur'; d.textContent = dur.textContent; media.appendChild(d); }
      var yt = c.getAttribute('data-yt') || '', isVid = !!yt;
      var cg = c.querySelector('.cg'), dt = c.querySelector('.dt'), meta = m.querySelector('.meta');
      m.querySelector('.sheet').style.setProperty('--c', getComputedStyle(c).getPropertyValue('--c') || '#2B2D31');
      meta.innerHTML = '';
      if (cg) { var a = document.createElement('span'); a.className = 'cg'; a.textContent = cg.textContent; meta.appendChild(a); }
      var k = document.createElement('span'); k.className = 'kind'; k.textContent = isVid ? '영상' : '기록'; meta.appendChild(k);
      if (dt) { var t = document.createElement('span'); t.textContent = dt.textContent; meta.appendChild(t); }
      var h = c.querySelector('h3'); m.querySelector('h3').textContent = h ? h.textContent : '';
      var p = c.querySelector('p'); m.querySelector('.lead').textContent = p ? p.textContent : '';
      var ex = m.querySelector('.extra'); ex.innerHTML = '';
      if (!isVid) { var note = document.createElement('p'); note.className = 'note'; note.textContent = '기수 기록 본문이 들어갈 자리예요. 시안이라 지금은 요약만 담겨 있어요.'; ex.appendChild(note); }
      var acts = m.querySelector('.acts'); acts.innerHTML = '';
      // 목록으로는 늘 왼쪽, 영상이면 유튜브 버튼을 오른쪽 끝에(2026-10-08)
      var b = document.createElement('button'); b.type = 'button'; b.className = 'ghost'; b.textContent = '목록으로'; b.onclick = close; acts.appendChild(b);
      if (isVid) {
        var go = document.createElement('a'); go.className = 'yt'; go.href = yt; go.target = '_blank'; go.rel = 'noopener'; go.textContent = '유튜브에서 보기 ↗'; acts.appendChild(go);
        // 창 안에서 재생: 처음엔 사진 + 재생 단추, 누르면 그 자리가 유튜브 플레이어로 바뀜(2026-10-08)
        var id = (yt.match(/[?&]v=([\w-]{6,})/) || yt.match(/youtu\.be\/([\w-]{6,})/) || [])[1];
        if (id) {
          var pb = document.createElement('button'); pb.type = 'button'; pb.className = 'cplay'; pb.setAttribute('aria-label', '여기서 영상 재생'); pb.innerHTML = '<i></i>';
          pb.onclick = function(){
            var f = document.createElement('iframe');
            f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1';
            f.title = (h ? h.textContent : '영상'); f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true;
            media.innerHTML = ''; media.appendChild(f); f.focus();
          };
          media.appendChild(pb);
        }
      }
      m.classList.add('on'); document.body.classList.add('cm-lock'); m.scrollTop = 0; m.querySelector('.x').focus();
    });
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
  /* ---------- 글 안 사진 넘김(.phs, 그리는 건 stories-render.js): 화살표 · 손가락으로 밀기 · 키보드 ←→ (백오피스) ---------- */
  (function(){
    function step(track, dir){ track.scrollBy({ left: dir * track.clientWidth, behavior: 'smooth' }); }
    function sync(track){
      var box = track.closest('.phs'), n = track.children.length;
      var i = Math.max(0, Math.min(n - 1, Math.round(track.scrollLeft / Math.max(1, track.clientWidth))));
      var no = box.querySelector('.phs-count b'), prev = box.querySelector('.phs-btn.prev'), next = box.querySelector('.phs-btn.next');
      if (no) no.textContent = i + 1;
      if (prev) prev.disabled = i <= 0;
      if (next) next.disabled = i >= n - 1;
    }
    document.addEventListener('click', function(e){
      var b = e.target.closest && e.target.closest('.phs-btn'); if (!b) return;
      e.preventDefault();
      var track = b.closest('.phs').querySelector('.phs-track');
      if (track) step(track, b.classList.contains('next') ? 1 : -1);
    });
    // 스크롤은 거품이 안 올라와서 잡는 단계(capture)에서 받아요
    document.addEventListener('scroll', function(e){
      var t = e.target;
      if (!t || !t.classList || !t.classList.contains('phs-track')) return;
      clearTimeout(t.phsTimer); t.phsTimer = setTimeout(function(){ sync(t); }, 50);
    }, true);
    document.addEventListener('keydown', function(e){
      var t = e.target;
      if (!t.classList || !t.classList.contains('phs-track') || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault(); e.stopPropagation();
      step(t, e.key === 'ArrowRight' ? 1 : -1);
    }, true);
  })();
})();
