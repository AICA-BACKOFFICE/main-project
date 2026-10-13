/* =========================================================
   인사교 라이프 — 시설 둘러보기 · 생활 꿀팁 · 오시는 길
   박지원 시안8(2026-10-07 전달) script.js에서 이 세 화면이 쓰는 동작만 옮김. [nn]은 시안 블록 번호
   본문(시설 둘러보기 · 크게 보기 창 · 목록 스크롤 안내 자리 포함)은 모두 index.html에 있고, 이 파일은 움직임만
   2026-10-07 정리: 실제로 안 돌던 시안 블록은 뺌 — [10] 지도 핀 터치 대체 · [09] 핀 고정(.pick)(둘 다 [15]가 핀 클릭을 먼저 받아 닿지 않음)
   2026-10-12: 예전 엘리베이터(층별 · 공간별 안내 [18]~[27]) 삭제 — 시설 둘러보기는 아래 '건물 단면 + 사진'(.bx9)
   ========================================================= */
(function(){
'use strict';
var $ = function(s, r){ return (r || document).querySelector(s); };
var $$ = function(s, r){ return [].slice.call((r || document).querySelectorAll(s)); };
var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
var NARROW = matchMedia('(max-width: 860px)');   // 폰 · 태블릿: 목록 안 스크롤 없음 · 꿀팁 바로가기 막대 안 붙음(life.css와 같은 경계)
var MAIN = $('.life-page');
if (!MAIN) return;

/* ---------- 화면 전환 ([01] 라우터 → 메뉴 주소) ----------
   #facilities(기본) · #tips · #directions. 시안 주소 #facility · #way · #tips/house 도 받음.
   화면 안 위치(#tp-house 등)로 오면 그 화면을 연 뒤 그 위치로. 하위 메뉴 바 · 헤더 드롭다운에서 고르면 site.js가 location.hash를 바꿈 */
var PG = $$(':scope > .page', MAIN);
var SCREEN = { overview:'home', home:'home', facilities:'facility', facility:'facility', tips:'tips', directions:'way', way:'way' };   // 시안10-B v3: overview = 히어로 페이지
var CANON = { facility:'#facilities', way:'#directions' };
var NAME = { home:'인사교 Real Life', facility:'시설 둘러보기', tips:'생활 꿀팁', way:'오시는 길' };
var SUB = { home:'none', facility:'facilities', tips:'tips', way:'directions' };   // home: 하위 메뉴 바에 표시 없음   // menu.js 하위 메뉴 id
var BASE_TITLE = document.title;
function route(){
  var raw = decodeURIComponent(location.hash.slice(1)), part = raw.split('/'), id = SCREEN[part[0]], target = null;
  if (id && part[1]) {
    target = document.getElementById('tp-' + part[1]);
    history.replaceState(null, '', target ? '#tp-' + part[1] : (CANON[part[0]] || '#' + part[0]));
  } else if (CANON[part[0]]) history.replaceState(null, '', CANON[part[0]]);
  if (!id && raw) {
    var el = document.getElementById(raw), pg = el && el.closest('.page');
    if (pg && PG.indexOf(pg) > -1) { id = pg.dataset.page; target = el; }
    else return;   // 화면 밖 위치(본문으로 바로가기 #main 등)나 모르는 주소: 지금 화면 그대로
  }
  if (!id) id = 'home';   // 주소 없이 들어오면(헤더 '인사교 라이프') 히어로 페이지
  var cur = document.getElementById('pg-' + id), was = !cur.hidden;
  PG.forEach(function(p){ p.hidden = p !== cur; });
  document.title = NAME[id] + ' · ' + BASE_TITLE;
  // 공통 하위 메뉴 바의 지금 항목 = 지금 화면(주소가 #tp-house처럼 화면 안 위치여도)
  document.documentElement.dataset.sub = SUB[id];
  if (typeof Site !== 'undefined' && Site.syncSubnav) Site.syncSubnav();
  if (target) {   // 같은 화면이면 브라우저가 이미 그 위치로 감
    if (!was) {
      var go = function(){ target.scrollIntoView(); };
      setTimeout(go, 40);
      // 목록 높이(아래 [09] · [16])를 화면을 연 뒤 정하므로 그다음 한 번 더 맞춤
      (document.fonts ? document.fonts.ready : Promise.resolve()).then(function(){ setTimeout(go, 160); });
    }
  }
  else window.scrollTo({ top: 0, behavior: 'instant' });   // 다른 화면으로 바뀌므로 부드러운 스크롤(공통 base.css) 없이 맨 위로
}
addEventListener('hashchange', route);

/* 시안10-B v4: 헤더 GNB · 모바일 메뉴 · 푸터의 「인사교 라이프」(주소 없는 life/index.html)를 이 페이지 안에서 누르면 히어로 페이지로.
   공통 site.js는 같은 페이지 링크를 새로 불러오지 않고 #위치만 지워(맨 위로) 화면이 그대로였음 → 그 뒤에 화면 전환을 한 번 더 */
document.addEventListener('click', function(e){
  var a = e.target.closest && e.target.closest('#siteHeader a[href], #drawer a[href], #siteFooter a[href]');
  if (!a || a.hasAttribute('data-toast') || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  var u = new URL(a.href, location.href);
  if (u.hash || u.origin !== location.origin || u.pathname.replace(/index\.html$/, '') !== location.pathname.replace(/index\.html$/, '')) return;
  setTimeout(function(){ dispatchEvent(new HashChangeEvent('hashchange')); }, 0);   // route() → 히어로 페이지(주소 없음 = home)
});

/* 시안10-B v7: 히어로 패널 — 마우스를 올리거나 초점이 가면 그 패널을 펼침(961px 이상). 마지막에 고른 패널이 펼쳐진 채로 남음 */
(function(){
  var ps = $$('.lh-p .lhp', MAIN); if (!ps.length) return;
  function open(p){ ps.forEach(function(x){ x.classList.toggle('is-open', x === p); }); }
  ps.forEach(function(p){
    p.addEventListener('pointerenter', function(e){ if (e.pointerType === 'mouse') open(p); });
    p.addEventListener('focus', function(){ open(p); });
  });
})();
/* 시안10-B v5: 하위 메뉴 바 왼쪽 제목 「인사교 Real Life」는 뺌(히어로 페이지는 헤더 GNB 「인사교 라이프」로) */
(function(){ var t = document.querySelector('#subnav .subnav-title'); if (t) t.remove(); })();

/* ---------- 생활 꿀팁 바로가기 막대: 지금 보는 부분 표시 ([01]) ----------
   항목은 링크(<a href="#tp-…">: 주소 공유 · 새 탭 가능). 누르면 브라우저가 그 위치로(부드러운 스크롤은 base.css) · 화면 전환은 위 route()가 맡음.
   지금 보는 부분 = aria-current="location"(모양은 공통 하위 메뉴 바처럼 밑줄, life.css) */
function spy(){
  var pg = $(':scope > .page:not([hidden])', MAIN); if (!pg) return;
  var sn = $$('.lnb-s a', pg); if (!sn.length) return;
  var cur = null;   // 시안10: 바로가기에서 주거 · 근처 먹거리를 뺐으므로, 그 위를 보는 동안은 표시 없음
  sn.forEach(function(a){ var t = document.getElementById(a.hash.slice(1)); if (t && t.getBoundingClientRect().top < innerHeight * .4) cur = a; });
  sn.forEach(function(a){ if (a === cur) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
}
addEventListener('scroll', spy, { passive:true });

/* ---------- 주소 복사 ([01]) ---------- */
var cA = $('#copyAd');
if (cA) cA.addEventListener('click', function(){
  var b = this, t = '광주광역시 동구 제봉로 92';
  function done(){ b.textContent = '복사했어요'; setTimeout(function(){ b.textContent = '주소 복사'; }, 1600); }
  try { navigator.clipboard.writeText(t).then(done, done); } catch (e) { done(); }
});

/* ---------- 한 줄 메뉴: 지금 바로가기 버튼이 보이도록 가로 위치 맞추기 ([06]) ---------- */
var lw = $('#pg-tips .lnb .wrap');
addEventListener('scroll', function(){
  if (!lw || !lw.offsetParent) return;
  var on = lw.querySelector('.lnb-s [aria-current]'); if (!on) return;
  var a = on.offsetLeft, b = a + on.offsetWidth;
  if (a < lw.scrollLeft + 8 || b > lw.scrollLeft + lw.clientWidth - 8) lw.scrollLeft = a - lw.clientWidth / 2 + on.offsetWidth / 2;
}, { passive:true });

/* ---------- 문화 · 여가: 지도 핀 ↔ 목록 짝 표시 · 거르기 · 목록 높이 · 펼치기 ([09] · [17]) ----------
   거르기: 조건에 안 맞는 곳은 목록에서 숨기고(hidden — Tab에서도 빠짐) 지도 핀만 흐리게(.off). 목록 머리 'n곳'은 보이는 곳만 셈.
   861px 이상: 목록 상자 높이 = 옆 지도 칸, 목록만 안에서 스크롤 · 아래 줄 '↓ n곳 더'(보이는 곳만 셈, 넘치지 않으면 숨김).
   860px 이하: 안 스크롤 없이 처음 5곳 + '나머지 n곳 더 보기'(시안은 화면보다 긴 목록 안에 스크롤이 갇혀 페이지가 안 내려갔음, 2026-10-08) */
(function(){
  var r = $('.lmap', MAIN); if (!r) return;
  var pins = $$('.lmp', r), li = $$('.lmli', r), ol = $('.lml', r), box = $('.lmlw', r), lw2 = $('.lmw2', r), sep = $('.lmsep', r);
  var cnt = $('.lmlh em', r), empty = $('.lmempty', r), more = $('.lmmore', r), mb = more && more.querySelector('button'), m = box.querySelector('.fdmore');
  var N = 5, w = 'all', free = false, unfold = false, bw = $$('[data-lw]', MAIN), bf = $('#lmFree');
  function hl(i, on){ pins.concat(li).forEach(function(e){ if (e.dataset.i === i) e.classList.toggle('on', on); }); }
  pins.concat(li).forEach(function(e){
    e.addEventListener('mouseenter', function(){ hl(e.dataset.i, true); });
    e.addEventListener('mouseleave', function(){ hl(e.dataset.i, false); });
    e.addEventListener('focus', function(){ hl(e.dataset.i, true); });
    e.addEventListener('blur', function(){ hl(e.dataset.i, false); });
  });
  function vis(){ return li.filter(function(e){ return !e.classList.contains('off'); }); }
  function tip(){
    var v = li.filter(function(e){ return !e.hidden; }), rr = ol.getBoundingClientRect();
    var left = v.filter(function(e){ return e.getBoundingClientRect().bottom > rr.bottom + 2; }).length, end = ol.scrollTop + ol.clientHeight >= ol.scrollHeight - 4;
    m.classList.toggle('end', end);
    m.innerHTML = end ? '목록 끝 · ' + v.length + '곳' : '↓ 아래로 스크롤하면 <b>' + Math.max(left, 1) + '곳</b> 더 있어요';
  }
  function layout(){
    var v = vis(), narrow = NARROW.matches, fold = narrow && !unfold && v.length > N;
    li.forEach(function(e){ e.hidden = e.classList.contains('off') || (fold && v.indexOf(e) >= N); });
    if (sep) {   // '더 멀리 · 버스 · 지하철로' 줄: 앞뒤에 보이는 곳이 있을 때만
      var all = $$(':scope > li', ol), k = all.indexOf(sep), shown = function(x){ return x.classList.contains('lmli') && !x.hidden; };
      sep.hidden = !(all.slice(0, k).some(shown) && all.slice(k + 1).some(shown));
    }
    if (cnt) cnt.textContent = v.length + '곳';
    if (empty) empty.hidden = v.length > 0;
    if (more) {
      more.hidden = !narrow || v.length <= N;
      mb.setAttribute('aria-expanded', String(unfold));
      mb.textContent = unfold ? '접기' : '나머지 ' + (v.length - N) + '곳 더 보기';
    }
    if (narrow) { box.style.maxHeight = ''; m.hidden = true; return; }
    if (!ol.offsetParent) return;   // 다른 화면을 보는 중(크기를 잴 수 없음) — 화면이 바뀌면 다시 잼
    box.style.maxHeight = lw2 ? Math.max(320, Math.round(lw2.getBoundingClientRect().height)) + 'px' : '';
    m.hidden = !v.length; if (m.hidden) return;
    tip();
    if (ol.scrollHeight <= ol.clientHeight + 4) m.hidden = true;   // 다 보이면 아래 줄 없음
  }
  function ap(){
    pins.concat(li).forEach(function(e){ e.classList.toggle('off', !((w === 'all' || e.dataset.w === w) && (!free || e.dataset.f === 'free'))); });
    pins.forEach(function(p){ p.tabIndex = p.classList.contains('off') ? -1 : 0; });   // 흐린 핀은 Tab에서 뺌(눌러도 안 열림)
    ol.scrollTop = 0; layout();
  }
  function pressW(v){ w = v; bw.forEach(function(x){ x.setAttribute('aria-pressed', x.dataset.lw === v); }); }
  bw.forEach(function(b){ b.addEventListener('click', function(){ pressW(b.dataset.lw); ap(); }); });
  if (bf) bf.addEventListener('click', function(){ free = !free; bf.setAttribute('aria-pressed', free); ap(); });
  if (empty) empty.querySelector('[data-lmreset]').addEventListener('click', function(){ pressW('all'); free = false; if (bf) bf.setAttribute('aria-pressed', 'false'); ap(); });
  if (mb) mb.addEventListener('click', function(){
    unfold = !unfold; layout();
    if (!unfold) mb.scrollIntoView({ block:'nearest', behavior: RM ? 'auto' : 'smooth' });   // 접은 뒤 버튼이 화면 밖이면 그 자리로
  });
  ol.addEventListener('scroll', function(){ if (!NARROW.matches && !m.hidden) tip(); }, { passive:true });
  addEventListener('resize', layout);
  if (NARROW.addEventListener) NARROW.addEventListener('change', function(){ unfold = false; layout(); });
  addEventListener('hashchange', function(){ setTimeout(layout, 80); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  layout(); setTimeout(layout, 60);
})();

/* ---------- 주거(단독 시안 2026-10-12): 교육장 가운데 지도 + 오른쪽 '동별 주거 정보'(탭 1~5)
   지도의 동 원을 누르거나 탭을 누르면 그 동 정보로 바뀌고 지도 원도 강조. 탭은 ← → · Home · End ---------- */
(function(){
  var tabs = $$('.hzp-t', MAIN), panels = $$('.hzp', MAIN), dots = $$('.hzmap-d', MAIN); if (!tabs.length) return;
  function sel(i, focus){
    i = String(i);
    tabs.forEach(function(t){ var on = t.dataset.i === i; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
    panels.forEach(function(p){ p.hidden = p.dataset.i !== i; });
    dots.forEach(function(d){ d.classList.toggle('on', d.dataset.i === i); });
  }
  tabs.forEach(function(t, k){
    t.addEventListener('click', function(){ sel(t.dataset.i); });
    t.addEventListener('keydown', function(e){
      var j = { ArrowRight:k + 1, ArrowLeft:k - 1, ArrowDown:k + 1, ArrowUp:k - 1, Home:0, End:tabs.length - 1 }[e.key];
      if (j === undefined) return; e.preventDefault(); sel(tabs[(j + tabs.length) % tabs.length].dataset.i, true);
    });
  });
  dots.forEach(function(d){
    d.addEventListener('click', function(){
      sel(d.dataset.i);
      var side = $('.hzmw-side', MAIN), r = side.getBoundingClientRect();
      if (r.top > innerHeight - 120) side.scrollIntoView({ behavior:'smooth', block:'start' });   // 좁은 화면: 지도 아래 정보 칸으로
    });
    d.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); d.dispatchEvent(new MouseEvent('click')); } });
  });
  sel('0');
  // 좁은 화면: 지도가 화면보다 넓어 가로로 밀어 봄 → 처음엔 교육장(가운데)이 보이게
  var mw = $('.hzmw-map', MAIN);
  function center(){ if (mw && mw.scrollWidth > mw.clientWidth + 4 && mw.offsetParent) mw.scrollLeft = (mw.scrollWidth - mw.clientWidth) / 2; }
  center(); addEventListener('hashchange', function(){ setTimeout(center, 60); }); addEventListener('resize', center);
})();

/* ---------- 근처 먹거리(단독 시안 2026-10-12): 식당 · 카페 탭 + 거르기(전체 · 혼밥/혼자 · 여럿이 + 도보 10분 안)
   카드(사진 자리 · 이름 · 메뉴 · 선배 후기)를 그리드로. 처음 6곳 + '나머지 n곳 더 보기', 탭 · 거르기를 바꾸면 다시 6곳부터 ---------- */
(function(){
  var bs = $$('[data-fg2]', MAIN), nb = $('#fdNear'); if (!bs.length) return;
  var ks = $$('[data-fk]', MAIN), solo = $('[data-fg2="solo"]', MAIN), list = $('.fdg', MAIN);
  var cards = $$('.fdg .fdc', MAIN), empty = $('.fdempty', MAIN), rs = $('[data-fdreset]', MAIN);
  var mw = $('.fdmore2', MAIN), mb = mw && mw.querySelector('button'), N = 8;
  var MID = matchMedia('(max-width: 1100px)');
  function cnt(){ return MID.matches ? 6 : 8; }   // PC 4열 × 2줄 = 8곳, 1100px 이하(3 · 2 · 1열)는 6곳
  var k = 'food', g = 'all', near = false, all = false;
  function ap(){
    N = cnt();
    var hits = cards.filter(function(c){ return c.dataset.t === k && (g === 'all' || c.dataset.g === g) && (!near || +c.dataset.w <= 10); });
    cards.forEach(function(c){ c.hidden = true; });
    hits.forEach(function(c, i){ c.hidden = !all && i >= N; });
    if (empty) empty.hidden = hits.length > 0;
    list.hidden = !hits.length;
    if (mw) { var rest = hits.length - N; mw.hidden = all || rest <= 0; if (rest > 0) mb.textContent = '나머지 ' + rest + '곳 더 보기'; mb.setAttribute('aria-expanded', 'false'); }
  }
  function tab(b, focus){
    k = b.dataset.fk; all = false;
    ks.forEach(function(x){ var on = x === b; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; });
    if (focus) b.focus();
    list.setAttribute('aria-labelledby', b.id);
    if (solo) solo.textContent = k === 'cafe' ? '혼자' : '혼밥';
    ap();
  }
  ks.forEach(function(b, i){
    b.addEventListener('click', function(){ tab(b); });
    b.addEventListener('keydown', function(e){
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault(); tab(ks[(i + (e.key === 'ArrowRight' ? 1 : ks.length - 1)) % ks.length], true);
    });
  });
  function press(b){ bs.forEach(function(x){ x.setAttribute('aria-pressed', x === b); }); }
  bs.forEach(function(b){ b.addEventListener('click', function(){ g = b.dataset.fg2; all = false; press(b); ap(); }); });
  if (nb) nb.addEventListener('click', function(){ near = !near; all = false; nb.setAttribute('aria-pressed', near); ap(); });
  if (mb) mb.addEventListener('click', function(){ all = true; ap(); mb.setAttribute('aria-expanded', 'true'); });
  if (rs) rs.addEventListener('click', function(){ g = 'all'; near = false; all = false; press(bs[0]); if (nb) nb.setAttribute('aria-pressed', false); ap(); });
  if (MID.addEventListener) MID.addEventListener('change', function(){ if (!all) ap(); });
  ap();
})();

/* ---------- 문화 · 여가(단독 시안 2026-10-12): 세 갈래(근처 산책길 · 가까운 시설 · 멀지만 가볼 만한 곳) — 사진이 겹친 묶음을 누르면 가로로 펼침
   펼치기 · 접기는 FLIP: 바뀌기 전 자리를 재고 → 클래스를 바꾼 뒤 새 자리를 재고 → 옛 자리에서 새 자리로 transform만 움직임(사진은 4:3 그대로라 늘어나 보이지 않음).
   묶음 높이 · 제목 줄 · 버튼도 같은 시간 · 같은 곡선으로. 움직임 줄이기 설정이면 바로 바뀜 ---------- */
(function(){
  var RMQ = matchMedia('(prefers-reduced-motion: reduce)'), EASE = 'cubic-bezier(.22,.8,.24,1)', DUR = 560;
  $$('.fs .fsg', MAIN).forEach(function(g){
    var b = g.querySelector('.fs-tg'), d = g.querySelector('.fsd'), cards = [].slice.call(g.querySelectorAll('.fsc'));
    var heads = [g.querySelector('.fsn'), g.querySelector('.fsh > div'), b], busy = false;
    function ph(c){ return c.querySelector('.fsc-ph'); }
    function snap(){
      return {
        h: g.getBoundingClientRect().height,
        heads: heads.map(function(e){ var r = e.getBoundingClientRect(); return { x:r.left, y:r.top }; }),
        cards: cards.map(function(c){ var p = ph(c), r = p.getBoundingClientRect(); return { cx:r.left + r.width / 2, cy:r.top + r.height / 2, w:p.offsetWidth }; })
      };
    }
    function rot(c, open){ return open ? 0 : (parseFloat(getComputedStyle(c).getPropertyValue('--rt')) || 0); }
    function origin(c){ var p = ph(c); c.style.transformOrigin = (p.offsetLeft + p.offsetWidth / 2) + 'px ' + (p.offsetTop + p.offsetHeight / 2) + 'px'; }
    cards.forEach(origin);
    function set(open){
      if (busy || open === g.classList.contains('is-open')) return;
      if (RMQ.matches || !g.animate) { g.classList.toggle('is-open', open); b.setAttribute('aria-expanded', open); cards.forEach(origin); return; }
      busy = true;
      var A = snap();
      g.classList.add('fs-flip');
      g.classList.toggle('is-open', open); b.setAttribute('aria-expanded', open);
      cards.forEach(origin);
      var B = snap(), an = [];
      an.push(g.animate([{ height:A.h + 'px' }, { height:B.h + 'px' }], { duration:DUR, easing:EASE }));
      heads.forEach(function(e, i){
        var dx = A.heads[i].x - B.heads[i].x, dy = A.heads[i].y - B.heads[i].y;
        if (Math.abs(dx) + Math.abs(dy) > 1) an.push(e.animate([{ transform:'translate(' + dx + 'px,' + dy + 'px)' }, { transform:'none' }], { duration:DUR, easing:EASE }));
      });
      cards.forEach(function(c, i){
        var a = A.cards[i], z = B.cards[i], s = a.w / z.w, r0 = rot(c, !open), r1 = rot(c, open);
        an.push(c.animate([
          { transform:'translate(' + (a.cx - z.cx) + 'px,' + (a.cy - z.cy) + 'px) rotate(' + r0 + 'deg) scale(' + s + ')' },
          { transform:'rotate(' + r1 + 'deg)' }
        ], { duration:DUR, easing:EASE, delay:(open ? i : cards.length - 1 - i) * 40, fill:'backwards' }));
      });
      function done(){ g.classList.remove('fs-flip'); busy = false; }
      Promise.all(an.map(function(x){ return x.finished; })).then(done, done);
    }
    b.addEventListener('click', function(){ set(!g.classList.contains('is-open')); });
    d.addEventListener('click', function(){ if (!g.classList.contains('is-open')) set(true); });
    addEventListener('resize', function(){ cards.forEach(origin); });
  });
})();

/* ---------- 문화 · 여가: 누르면 크게 보기 ([15], 창 dialog.lbx는 index.html에) ---------- */
(function(){
  var map = $('.lmm.one', MAIN), d = $('dialog.lbx', MAIN);
  if (!map || !d || !d.showModal) return;   // <dialog> 없는 옛 브라우저(Safari 15.4 미만)는 크게 보기 없이 목록만
  // 이전 · 다음은 거른 뒤 남은 곳만 돎(860px 이하에서 '더 보기'로 접혀 있는 곳은 포함)
  var lis = $$('.lmap .lmli', MAIN), list = [], cur = 0, byPtr = false;
  var q = function(s){ return d.querySelector(s); };
  function show(k){
    cur = (k + list.length) % list.length;
    var li = list[cur], i = li.dataset.i, pin = map.querySelector('.lmp[data-i="' + i + '"]');
    var im = pin.querySelector('.lmi'), cls = [].slice.call(im.classList).filter(function(c){ return c.indexOf('im-') === 0; }), fig = q('.lbxi');
    fig.className = 'lbxi ' + cls.join(' '); fig.setAttribute('aria-label', li.querySelector('b').textContent);
    var n = q('.lbxn'); n.textContent = li.querySelector('.lmn').textContent; n.classList.toggle('wkd', li.dataset.w === 'wkd');
    q('h3').textContent = li.querySelector('b').textContent; q('.lbxt').innerHTML = li.querySelector('.lmt').innerHTML;
    var ds = li.querySelector('.lmdist'); q('.lbxd').textContent = ds ? ds.textContent : ''; q('.lbxx').textContent = li.querySelector('p').textContent;
    q('.lbxc').textContent = (cur + 1) + ' / ' + list.length;
  }
  function open(i){
    list = lis.filter(function(li){ return !li.classList.contains('off'); });
    var k = -1; list.forEach(function(li, j){ if (li.dataset.i === i) k = j; }); if (k < 0) return;
    $$('[data-go]', d).forEach(function(b){ b.hidden = list.length < 2; });
    show(k); if (!d.open) d.showModal(); q('.lbxx2').focus();
  }
  map.addEventListener('click', function(e){ var p = e.target.closest('.lmp'); if (!p) return; e.preventDefault(); e.stopImmediatePropagation(); if (p.classList.contains('off')) return; byPtr = e.detail > 0; open(p.dataset.i); }, true);
  lis.forEach(function(li){
    li.addEventListener('click', function(e){ byPtr = e.detail > 0; open(li.dataset.i); });
    li.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); byPtr = false; open(li.dataset.i); } });
  });
  q('.lbxx2').addEventListener('click', function(){ d.close(); });
  $$('[data-go]', d).forEach(function(b){ b.addEventListener('click', function(){ show(cur + +b.dataset.go); }); });
  d.addEventListener('click', function(e){ if (e.target === d) d.close(); });
  d.addEventListener('close', function(){
    $$('.lmap .lmp.on,.lmap .lmli.on', MAIN).forEach(function(x){ x.classList.remove('on'); });
    if (byPtr) setTimeout(function(){ var a = document.activeElement; if (a && a.closest && a.closest('.lmp,.lmli')) a.blur(); }, 0);
  });
  d.addEventListener('keydown', function(e){ if (list.length < 2) return; if (e.key === 'ArrowRight') show(cur + 1); if (e.key === 'ArrowLeft') show(cur - 1); });
})();

/* ---------- 근처 식당: 5곳이 넘으면 목록 안에서 스크롤 ([16], 안내 줄 p.fdmore는 index.html에) ----------
   861px 이상만. 860px 이하는 모두 펼침(폰에서 목록 안에 스크롤이 갇히던 것 — 숨기는 곳도 1 ~ 2곳뿐, 2026-10-08) */
(function(){
  var N = 5, cs = $$('.fd2c', MAIN); if (!cs.length) return;
  cs.forEach(function(c){
    var ul = c.querySelector('ul'), m = c.querySelector('.fdmore');
    function vis(){ return [].slice.call(ul.children).filter(function(li){ return !li.hidden; }); }
    function upd(){
      var v = vis();
      if (v.length <= N || c.hidden || NARROW.matches) { ul.classList.remove('fdsc'); ul.style.maxHeight = ''; m.hidden = true; return; }
      if (!c.offsetParent) return;   // 다른 화면을 보는 중(크기를 잴 수 없음) — 화면이 바뀌면 다시 잼
      ul.classList.add('fdsc'); var h = 0;
      for (var i = 0; i < N; i++) h += v[i].getBoundingClientRect().height;
      h += Math.round(v[N].getBoundingClientRect().height * .45); ul.style.maxHeight = h + 'px'; m.hidden = false; tip();
    }
    function tip(){
      var v = vis(), left = 0, r = ul.getBoundingClientRect();
      v.forEach(function(li){ if (li.getBoundingClientRect().bottom > r.bottom + 2) left++; });
      var end = ul.scrollTop + ul.clientHeight >= ul.scrollHeight - 4;
      m.classList.toggle('end', end);
      m.innerHTML = end ? '목록 끝 · ' + v.length + '곳' : '↓ 아래로 스크롤하면 <b>' + Math.max(left, 1) + '곳</b> 더 있어요';
    }
    ul.addEventListener('scroll', tip, { passive:true }); c._fdupd = upd;
  });
  function all(){ cs.forEach(function(c){ if (c._fdupd) c._fdupd(); }); }
  $$('[data-fg2],[data-fdreset],#fdNear', MAIN).forEach(function(b){ b.addEventListener('click', function(){ setTimeout(all, 0); }); });
  addEventListener('resize', all); addEventListener('hashchange', function(){ setTimeout(all, 80); });
  if (NARROW.addEventListener) NARROW.addEventListener('change', all);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(all);
  setTimeout(all, 50);
})();

/* ---------- 시설 둘러보기: 건물 단면 + 사진 ----------
   왼쪽 건물 단면의 층(.bx9-f) → 오른쪽 그 층 묶음(.bx9-g) · 공간 탭(.bx9-t) → 공간(.bx9-s) · 사진 넘김(.bx9-ph) · 작은 사진(.bx9-tb)
   다른 곳에서 data-fac="층-공간"(예: 1-0) 링크를 누르면 그 공간을 열어 둠 */
var BX = $('#pg-facility .bx9');
if (BX) (function(){
  var fbs = $$('.bx9-f[data-g]', BX), gs = $$('.bx9-g', BX), tw = $('.bx9-tw', BX);
  var mk = document.createElement('span'); mk.className = 'bx9-cur'; mk.setAttribute('aria-hidden', 'true'); tw.appendChild(mk);
  function place(){
    var b = fbs.filter(function(x){ return x.getAttribute('aria-pressed') === 'true'; })[0]; if (!b || !b.offsetParent) return;
    var r = b.getBoundingClientRect(), t = tw.getBoundingClientRect();
    mk.style.transform = 'translate(' + (r.left - t.left) + 'px,' + (r.top - t.top) + 'px)';
    mk.style.width = r.width + 'px'; mk.style.height = r.height + 'px';
  }
  function floor(g){
    BX.dataset.g = g;
    fbs.forEach(function(b){ b.setAttribute('aria-pressed', String(b.dataset.g === g)); });
    gs.forEach(function(x){ var on = x.dataset.g === g; if (on && x.hidden) { x.hidden = false; x.classList.remove('bx9-in'); void x.offsetWidth; x.classList.add('bx9-in'); } else x.hidden = !on; });
    place();
  }
  fbs.forEach(function(b){ b.addEventListener('click', function(){ floor(b.dataset.g); }); });
  // 공간 탭
  function tab(t, focus){
    var g = t.closest('.bx9-g'), ts = $$('.bx9-t', g);
    ts.forEach(function(x){ var on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; var pn = document.getElementById(x.getAttribute('aria-controls')); if (pn) { if (on && pn.hidden) { pn.hidden = false; pn.classList.remove('bx9-in'); void pn.offsetWidth; pn.classList.add('bx9-in'); } else pn.hidden = !on; } });
    if (focus) t.focus();
  }
  $$('.bx9-t', BX).forEach(function(t){
    t.addEventListener('click', function(){ tab(t); });
    t.addEventListener('keydown', function(e){
      var ts = $$('.bx9-t', t.closest('.bx9-g')), i = ts.indexOf(t), n = ts.length, j = -1;
      if (e.key === 'ArrowRight') j = (i + 1) % n; else if (e.key === 'ArrowLeft') j = (i - 1 + n) % n; else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = n - 1;
      if (j > -1) { e.preventDefault(); tab(ts[j], true); }
    });
  });
  // 사진 넘김
  $$('.bx9-s', BX).forEach(function(sp){
    var ph = $('.bx9-ph', sp), tr = $('.bx9-tr', ph), sl = $$('.bx9-sl', ph), tb = $$('.bx9-tb', sp), cap = $('.bx9-cap span', ph), num = $('.bx9-n b', ph), k = 0, n = sl.length;
    function go(i){
      k = (i + n) % n; tr.style.transform = 'translateX(' + (-100 * k) + '%)';
      cap.textContent = sl[k].getAttribute('aria-label'); num.textContent = k + 1;
      tb.forEach(function(b, j){ if (j === k) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    }
    $('.bx9-a.prev', ph).addEventListener('click', function(){ go(k - 1); });
    $('.bx9-a.next', ph).addEventListener('click', function(){ go(k + 1); });
    tb.forEach(function(b, j){ b.addEventListener('click', function(){ go(j); }); });
    ph.addEventListener('keydown', function(e){ if (e.key === 'ArrowRight') { e.preventDefault(); go(k + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(k - 1); } });
    var x0 = null;
    ph.addEventListener('pointerdown', function(e){ if (e.target.closest('.bx9-a')) return; x0 = e.clientX; });
    ph.addEventListener('pointerup', function(e){ if (x0 === null) return; var dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 40) go(k + (dx < 0 ? 1 : -1)); });
    if (n < 2) $$('.bx9-a', ph).forEach(function(a){ a.hidden = true; });
  });
  // 다른 곳에서 특정 공간으로
  document.addEventListener('click', function(e){
    var a = e.target.closest('[data-fac]'); if (!a) return;
    var q = a.dataset.fac.split('-'); floor(q[0]);
    var t = document.getElementById('bx9t-' + q[0] + '-' + (q[1] || 0)); if (t) tab(t);
  });
  addEventListener('resize', place); addEventListener('hashchange', function(){ setTimeout(place, 60); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
  new MutationObserver(place).observe($('#pg-facility'), { attributes:true, attributeFilter:['hidden'] });
  setTimeout(place, 50);
})();

route(); spy();
})();
