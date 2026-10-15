/* =========================================================
   인사교 라이프 — 시설 둘러보기 · 생활 꿀팁 · 오시는 길
   박지원 시안8(2026-10-07 전달) script.js에서 이 세 화면이 쓰는 동작만 옮김. [nn]은 시안 블록 번호
   본문은 모두 index.html에 있고, 이 파일은 움직임만
   2026-10-07 정리: 실제로 안 돌던 시안 블록은 뺌 — [10] 지도 핀 터치 대체 · [09] 핀 고정(.pick)(둘 다 [15]가 핀 클릭을 먼저 받아 닿지 않음)
   2026-10-12: 예전 엘리베이터(층별 · 공간별 안내 [18]~[27]) 삭제 — 시설 둘러보기는 아래 '건물 단면 + 사진'(.bx9)
   2026-10-14 코드 정리: 안 돌던 블록 삭제 — 옛 히어로 패널 · 꿀팁 바로가기 막대 표시 · 문화·여가 지도 · 크게 보기 창 · 근처 식당 목록 스크롤
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
var NAME = { home:'인사교 LIFE', facility:'시설 둘러보기', tips:'생활 꿀팁', way:'오시는 길' };
var SUB = { home:'overview', facility:'facilities', tips:'tips', way:'directions' };   // home: 하위 메뉴 바에 표시 없음   // menu.js 하위 메뉴 id
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
      // 글꼴 · 높이가 화면을 연 뒤 자리 잡으므로 그다음 한 번 더 맞춤
      (document.fonts ? document.fonts.ready : Promise.resolve()).then(function(){ setTimeout(go, 160); });
    }
  }
  else window.scrollTo({ top: 0, behavior: 'instant' });   // 다른 화면으로 바뀌므로 부드러운 스크롤(공통 base.css) 없이 맨 위로
}
addEventListener('hashchange', route);

/* ---------- 생활 꿀팁: 주제별 화면(10-13, 1안) ----------
   #tips = 세 주제 카드(허브)만(10-14 생활 적응 삭제) · #tp-house · #tp-food · #tp-fun(또는 그 안의 위치) = 그 주제만.
   위 route()가 화면을 연 다음 실행되도록 그 뒤에 등록. 왼쪽 메뉴(site.js가 만듦)의 '생활 꿀팁' 아래에 네 주제를 붙임 */
var TPG = document.getElementById('pg-tips');
function topic(){
  if (!TPG) return;
  var h = decodeURIComponent(location.hash.slice(1)), el = h && document.getElementById(h);
  var sec = el && el.closest ? el.closest('.tp-sec') : null, was = TPG.dataset.topic || '';
  if (sec) TPG.dataset.topic = sec.id; else if (!TPG.hidden) delete TPG.dataset.topic;
  var now = TPG.dataset.topic || '';
  $$('.tp-bar nav a, .lnb-tp a', document).forEach(function(a){
    var on = a.getAttribute('href') === '#' + now;
    a.classList.toggle('is-on', on);   // 왼쪽 메뉴는 site.js가 aria-current를 다시 정하므로 표시는 클래스로
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (now !== was || el === sec) setTimeout(function(){ window.scrollTo({ top: 0, behavior: 'instant' }); dispatchEvent(new Event('resize')); }, 200);
}
addEventListener('hashchange', topic);
function lnbTopics(){
  $$('.lnb a, .side-nav a', document).forEach(function(a){
    if (a.textContent.trim() !== '생활 꿀팁' || (a.nextElementSibling && a.nextElementSibling.classList.contains('lnb-tp'))) return;
    var d = document.createElement('div'); d.className = 'lnb-tp';
    d.innerHTML = $$('.tp-bar nav a', TPG).map(function(x){ return '<a href="' + x.getAttribute('href') + '">' + x.textContent + '</a>'; }).join('');
    a.parentNode.insertBefore(d, a.nextSibling); topic();
  });
}
if (TPG) { setTimeout(lnbTopics, 0); addEventListener('load', lnbTopics); }

/* 시안10-B v4: 헤더 GNB · 모바일 메뉴 · 푸터의 「인사교 라이프」(주소 없는 life/index.html)를 이 페이지 안에서 누르면 히어로 페이지로.
   공통 site.js는 같은 페이지 링크를 새로 불러오지 않고 #위치만 지워(맨 위로) 화면이 그대로였음 → 그 뒤에 화면 전환을 한 번 더 */
document.addEventListener('click', function(e){
  var a = e.target.closest && e.target.closest('#siteHeader a[href], #drawer a[href], #siteFooter a[href]');
  if (!a || a.hasAttribute('data-toast') || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  var u = new URL(a.href, location.href);
  if (u.hash || u.origin !== location.origin || u.pathname.replace(/index\.html$/, '') !== location.pathname.replace(/index\.html$/, '')) return;
  setTimeout(function(){ dispatchEvent(new HashChangeEvent('hashchange')); }, 0);   // route() → 히어로 페이지(주소 없음 = home)
});

/* 시안10-B v5: 하위 메뉴 바 왼쪽 제목 「인사교 Real Life」는 뺌(히어로 페이지는 헤더 GNB 「인사교 라이프」로) */
/* 디자인통일v1: 하위 메뉴 바 왼쪽 제목 「인사교 LIFE」는 남김(10-12 사용자 요청) */

/* ---------- 주소 복사 ([01]) ---------- */
var cA = $('#copyAd');
if (cA) cA.addEventListener('click', function(){
  var b = this, t = '광주광역시 동구 제봉로 92';
  function done(){ b.textContent = '복사했어요'; setTimeout(function(){ b.textContent = '주소 복사'; }, 1600); }
  try { navigator.clipboard.writeText(t).then(done, done); } catch (e) { done(); }
});

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
  function cnt(){ return 8; }   // 10-13: 대표 8곳씩, 아래 숫자 페이지(선배들의 이야기 후기와 같은 모양)
  var k = 'food', g = 'all', near = false, all = false, pg = 1, sig = '';
  var nav = document.createElement('nav'); nav.className = 'cpager fdpager'; nav.setAttribute('aria-label', '먹거리 페이지');
  var dsc = list.nextElementSibling; list.parentNode.insertBefore(nav, dsc && dsc.classList.contains('fdisc') ? dsc.nextSibling : list.nextSibling);   // 10-14: 안내 문구는 카드 바로 아래 오른쪽
  function pbtn(t, to, o){ var b = document.createElement('button'); b.type = 'button'; b.textContent = t;
    if (o.cur) b.setAttribute('aria-current', 'page'); if (o.dis) b.disabled = true; if (o.aria) b.setAttribute('aria-label', o.aria);
    b.onclick = function(){ pg = to; ap(); var top = list.getBoundingClientRect().top + scrollY - 200; scrollTo({ top: top, behavior: RM ? 'auto' : 'smooth' }); };
    return b; }
  function ap(){
    N = cnt();
    var s2 = k + '|' + g + '|' + near; if (s2 !== sig) { sig = s2; pg = 1; }
    var hits = cards.filter(function(c){ return c.dataset.t === k && (g === 'all' || c.dataset.g === g) && (!near || +c.dataset.w <= 10); });
    var pages = Math.max(1, Math.ceil(hits.length / N)); if (pg > pages) pg = pages;
    cards.forEach(function(c){ c.hidden = true; });
    hits.forEach(function(c, i){ c.hidden = !(i >= (pg - 1) * N && i < pg * N); });
    if (empty) empty.hidden = hits.length > 0;
    list.hidden = !hits.length;
    if (mw) mw.hidden = true;
    nav.innerHTML = ''; nav.hidden = pages < 2;
    if (pages > 1) {
      nav.appendChild(pbtn('←', pg - 1, { dis: pg === 1, aria: '이전 페이지' }));
      for (var i = 1; i <= pages; i++) nav.appendChild(pbtn(String(i), i, { cur: i === pg, aria: i + '페이지' }));
      nav.appendChild(pbtn('→', pg + 1, { dis: pg === pages, aria: '다음 페이지' }));
    }
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

route();
})();

/* 라이프 인터랙션 */
(function(){
  var q=function(s){return document.querySelector(s)}, qa=function(s){return [].slice.call(document.querySelectorAll(s))};
  // 월세 예산 슬라이더
  var tabs=q('#tp-house .hzp-tabs');
  if(tabs){
    var rents=qa('#tp-house .hzp').map(function(p){var b=p.querySelector('.hzc-rent b');var m=b&&b.textContent.match(/(\d+)/);return m?+m[1]:99});
    var w=document.createElement('div');w.className='rentslide';
    w.innerHTML='<label for="rentIn">월세 예산<output id="rentOut">35만 원</output></label><input id="rentIn" type="range" min="20" max="60" step="1" value="35"><small>예산 안에 드는 동만 진하게 보여요</small>';
    tabs.parentNode.insertBefore(w,tabs);
    var inp=w.querySelector('input'),out=w.querySelector('output');
    function up(){var v=+inp.value;out.textContent=v+'만 원';qa('#tp-house .hzp-t').forEach(function(t,i){t.classList.toggle('over',rents[i]>v);t.classList.toggle('fit',rents[i]<=v)})}
    inp.addEventListener('input',up);up();
  }
})();
(function(){
  var q=function(s){return document.querySelector(s)};
  var bar=q('#tp-food .fdbar .r'); var list=q('#fdList'); if(!bar||!list) return;
  var b=document.createElement('button');b.type='button';b.className='lunch-go';
  b.innerHTML='<img class="dc" src="assets/dice.webp" alt="" width="160" height="167">'+'<span class="cue" aria-hidden="true"><em>고민된다면?</em><svg viewBox="0 0 64 60" width="64" height="60" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10C18 4 34 6 36 18c1.5 9-9 12-12 6-3-7 8-12 16-6 8 6 12 18 17 34"/><path d="M49.9 45.9L57 52l2.4-9.1"/></svg></span>';b.setAttribute('aria-label','오늘 점심 뭐 먹지? 주사위 굴려서 한 곳 골라 주기');
  bar.insertBefore(b,bar.firstChild);
  b.addEventListener('click',function(){
    var cards=[].slice.call(list.querySelectorAll('.fdc')).filter(function(c){return c.offsetParent});
    if(!cards.length) return;
    cards.forEach(function(c){c.classList.remove('pick','lit')});
    list.classList.remove('picked');list.classList.add('rolling');
    var i=Math.floor(Math.random()*cards.length),n=i+12+Math.floor(Math.random()*cards.length),prev;
    (function step(){
      if(prev) prev.classList.remove('lit');
      prev=cards[i%cards.length];prev.classList.add('lit');i++;
      if(i<n) setTimeout(step,70+(n-i<5?(5-(n-i))*60:0));
      else{prev.classList.remove('lit');prev.classList.add('pick');list.classList.remove('rolling');list.classList.add('picked');prev.scrollIntoView({behavior:'smooth',block:'center'});}
    })();
  });
  b.addEventListener('click',function(){b.classList.remove('go');void b.offsetWidth;b.classList.add('go')});
})();

/* 선배 손글씨 포스트잇 */
(function(){
  function note(el, txt, pos, after){
    if(!el) return;
    var a=document.createElement('div');a.className='snote-a';
    var n=document.createElement('div');n.className='snote';n.setAttribute('aria-hidden','true');
    n.innerHTML='<p>'+txt+'</p>';
    for(var k in pos){ if(k[0]=='-') n.style.setProperty(k,pos[k]); else n.style[k]=pos[k]; }
    a.appendChild(n); el.parentNode.insertBefore(a, after?el.nextSibling:el);
  }
  var q=function(s){return document.querySelector(s)};
  // 시설 둘러보기 사진 3곳(10-14): 사진 가운데 오른쪽(다음 화살표 자리)을 가려서, 사진 오른쪽 위 모서리에 붙임 — 사진 앞에 넣어 기준점이 사진 위 끝
  note(q('.bx9-g[data-g="23"] .bx9-ph'),'같이 고민하면<br>더 빨리 풀려요',{top:'-6px','--r':'4deg'});
  note(q('.bx9-g[data-g="8"] .bx9-ph'),'밥 먹으면서<br>동기랑 제일 친해져요',{top:'-6px','--r':'4deg'});
  note(q('.bx9-g[data-g="1"] .bx9-ph'),'머리 식힐 땐<br>1층으로 내려가 봐요',{top:'-6px','--r':'4deg'});
  note(q('#tp-house .hzmw'),'방 구할 땐<br>천천히 비교해 봐요',{left:'-34px',top:'24px','--r':'4deg'});
  note(q('#tp-fun .fsg'),'수업 끝나면<br>동네 산책 추천!',{right:'-14px',top:'-80px','--r':'0deg'});
  note(q('#pg-way .wmap'),'여기까지 오는 길,<br>첫걸음부터 응원해요',{left:'calc(66% - 16px)',top:'-136px','--r':'4deg'});   // 10-13: 조금 왼쪽 · 위로, 오른쪽으로 기울임
})();

/* 왼쪽 메뉴 첫 줄을 지금 화면의 첫 섹션 머리와 같은 높이에(10-13) */
(function(){
  var m=document.getElementById('main'); if(!m) return;
  function f(){ var r=document.getElementById('siteLnb'); if(!r||innerWidth<1200) return;
    var pg=[].filter.call(document.querySelectorAll('.life-page .page'),function(p){return !p.hidden})[0]; if(!pg) return;
    var h=[].filter.call(pg.querySelectorAll('.tp-back, .sh, h2:not(.lh-sr)'),function(e){return e.offsetParent!==null})[0]; if(!h) return;   // 10-13: 숨은 화면(생활 꿀팁 허브 · 다른 주제)의 머리는 건너뜀 if(h&&h.closest('.lo-hd')) h=h.closest('.lo-hd'); if(!h) return;
    var t=h.getBoundingClientRect().top-r.getBoundingClientRect().top-3; if(t>0) m.style.setProperty('--lnb-top',t+'px'); }
  addEventListener('load',f); addEventListener('hashchange',function(){ setTimeout(f,80); }); addEventListener('resize',f); if(document.fonts) document.fonts.ready.then(f);
})();

/* 점심 주사위 되돌리기(10-13): 고른 카드 오른쪽 위 × 버튼 · 식당/카페 · 거르기 칩을 누르면 굴리기 전으로 */
(function(){
  var list=document.getElementById('fdList'); if(!list) return;
  function reset(){ if(!list.classList.contains('picked')) return;
    list.classList.remove('picked','rolling');
    [].forEach.call(list.querySelectorAll('.fdc'),function(c){ c.classList.remove('pick','lit'); var x=c.querySelector('.fd-unpick'); if(x) x.remove(); }); }
  new MutationObserver(function(){
    var c=list.querySelector('.fdc.pick'); if(!c||c.querySelector('.fd-unpick')) return;
    var b=document.createElement('button'); b.type='button'; b.className='fd-unpick'; b.innerHTML='<span aria-hidden="true">×</span>'; b.setAttribute('aria-label','주사위 결과 지우고 전체 다시 보기');
    b.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); reset(); });
    c.appendChild(b); b.focus({preventScroll:true});
  }).observe(list,{subtree:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('click',function(e){ if(e.target.closest('#tp-food .fdk-b, #tp-food .chips button')) reset(); },true);
})();
