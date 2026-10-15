/* =========================================================
   공통 틀: 상단 헤더(GNB · 드롭다운) · 하위 메뉴 바 · 왼쪽 메뉴 · 모바일 메뉴 · 푸터 · 플로팅 버튼 · 토스트 — 모든 페이지에 같이 붙음
   메뉴 내용 · 바깥 연결처 주소는 menu.js에서 고칩니다. 이 파일은 페이지를 추가해도 고칠 일이 없습니다.

   페이지에서 쓰는 법(check/index.html 참고):
     <html data-menu="메뉴 id">        지금 카테고리(홈은 생략). 헤더 메뉴에 현재 위치로 표시하고 그 아래 하위 메뉴 바(세부 카테고리)
                                       페이지에 자기 목차가 있어 바가 필요 없으면 data-subnav="off"
                                       바 왼쪽 카테고리 제목(menu.js title)을 빼려면 data-subnav-title="off"(라이프: 첫 화면 히어로가 제목)
                                       글 상세처럼 하위 메뉴 주소에 없는 페이지는 data-sub="하위 메뉴 id"로 밑줄 위치를 정함
                                       (탭 화면 페이지는 페이지 스크립트가 data-sub를 바꾸고 Site.syncSubnav() 호출)
                                       하위 메뉴가 페이지마다 따로인 페이지는 data-nav="side"면 위쪽 바 대신 본문 왼쪽 메뉴(common/css/lnb.css, 10-13 사본: 이야기 하위 4페이지)
     <header class="site-header" id="siteHeader"></header>
     <main id="main" tabindex="-1">…</main>
     <footer class="site-footer" id="siteFooter"></footer>   페이지 메모 data-note="…"는 10-14부터 화면에 안 보임(메모로만)
     <script src="../common/js/menu.js" defer></script>
     <script src="../common/js/site.js" defer></script>
   페이지 스크립트에서 쓸 수 있는 것: Site.href(메뉴 id, 하위 id) · Site.menu(메뉴 id) · Site.toast(글) · Site.reduce · Site.syncSubnav()
   본문에서 쓰는 속성(마크업 예는 common/css/site.css 맨 아래 절):
     <a data-site-link="apply">   바깥 연결처(menu.js SITE_LINKS 키). 주소가 있으면 href로, 없으면 누를 때 안내 토스트
     data-scroll-fade               가로로 넘치는 탭 줄. 더 있는 쪽 끝을 흐리게(.fade-l · .fade-r)
     주소 ?cat=값                    처음 열 때 본문의 분류 버튼 [data-cat="값"][aria-pressed]을 눌러 둠

   서버(Spring · Thymeleaf)가 헤더 · 모바일 메뉴 · 푸터 · 플로팅 버튼을 같은 마크업으로 미리 그려 보내면
   다시 그리지 않고 동작만 붙입니다. 그때는 menu.js가 없어도 됩니다(현재 위치는 그려진 링크로 판단).
   ========================================================= */
const Site = (() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ICON = {
    chev:'<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>'
  };
  const html = document.documentElement;

  /* 지금 페이지에서 사이트 폴더(site/)까지의 상대 경로 — 페이지가 어느 폴더 깊이에 있어도 링크가 맞게 */
  const ROOT = (() => {
    const site = new URL('../../', document.currentScript.src).pathname.split('/').filter(Boolean);
    const here = new URL('.', location.href).pathname.split('/').filter(Boolean);
    let i = 0;
    while (i < site.length && i < here.length && site[i] === here[i]) i++;
    return '../'.repeat(here.length - i) + site.slice(i).map(s => s + '/').join('');
  })();

  const hasMenu = typeof SITE_MENU !== 'undefined';   // 서버가 틀을 그린 페이지는 menu.js 없이 동작
  const menuOf = id => hasMenu ? SITE_MENU.find(m => m.id === id) : undefined;
  /* 메뉴 · 하위 메뉴 주소. href('check', 'faq') → ../check/index.html#faq, href('life') → ../life/index.html */
  function href(menu, child){
    const m = typeof menu === 'string' ? menuOf(menu) : menu;
    if (!m) return ROOT + SITE_HOME;
    const c = typeof child === 'string' ? m.children.find(x => x.id === child) : child;
    if (!c) return ROOT + m.page;
    if (c.page) return ROOT + c.page + (c.anchor || '');
    return ROOT + m.page + (c.anchor !== undefined ? c.anchor : '#' + c.id);
  }

  const current = menuOf(html.dataset.menu) || null;
  /* 왼쪽 하위 메뉴(10-13 사본, 사용자 결정: 한눈에 보기 허브는 넓게 · 하위 페이지는 왼쪽 메뉴): <html data-nav="side">인 페이지 + 하위 메뉴가 모두 페이지 링크인 메뉴만.
     위쪽 바를 끈 페이지와 같은 흐름(--sub 0 · 바 안 그림 · 헤더 높이 72)으로 돌리고 main 맨 앞에 왼쪽 메뉴(renderLnb) */
  const sideNav = !!current && html.dataset.nav === 'side' && current.children.length > 0;   // 10-13: 라이프처럼 같은 페이지 안 화면(#주소)도 왼쪽 메뉴로
  if (sideNav) html.dataset.subnav = 'off';
  const subnavOn = !!current && html.dataset.subnav !== 'off';   // 하위 메뉴 바를 그릴지(그린 뒤에는 #subnav 유무로 판단)
  /* "폴더", "폴더/", "폴더/index.html"은 같은 페이지(서버 주소는 끝 / 없이 올 수 있음) */
  const pagePath = u => u.pathname.replace(/index\.html$/, '').replace(/\/$/, '');
  const samePage = u => u.origin === location.origin && pagePath(u) === pagePath(location);

  /* 지금 주소(페이지 + #위치)에 해당하는 하위 메뉴 id — 하위 메뉴 바에 그려진 링크로 판단.
     글 상세처럼 하위 메뉴 주소와 다른 페이지는 <html data-sub="하위 메뉴 id">로 정해 줌 */
  function currentSub(){
    if (html.dataset.sub) return html.dataset.sub;
    const hash = decodeURIComponent(location.hash);
    const links = $$('#subnav a[data-sub], #siteLnb a[data-sub]').map(a => ({ id: a.dataset.sub, u: new URL(a.href) }));
    const here = links.filter(x => samePage(x.u));
    const hit = here.find(x => hash && decodeURIComponent(x.u.hash) === hash) || here.find(x => !x.u.hash) || here[0];
    return (hit || links[0])?.id;
  }

  /* 바깥 연결처(menu.js SITE_LINKS) 링크 속성. 주소가 아직 없으면 누를 때 안내만 */
  function ext(key){
    const l = SITE_LINKS[key];
    return l.url ? `href="${l.url}"` : `href="#${key}" data-toast="${l.note}"`;
  }

  /* ---------- 그리기 ---------- */
  const logo = (sub = '') => `<span class="logo-mark" aria-hidden="true"></span><span class="logo-text">인공지능사관학교</span>${sub}`;

  /* 그리기 함수는 자리가 비어 있을 때만 그림(서버가 미리 그렸으면 그대로 둠) */
  function renderHeader(){
    const el = $('#siteHeader');
    if (!el) return;
    if (!el.firstElementChild) el.innerHTML = `
    <div class="hdr-bar">
      <div class="wrap hdr-inner">
        <a class="logo" href="${ROOT + SITE_HOME}" aria-label="인공지능사관학교 홈">${logo()}</a>
        <nav class="hdr-nav" aria-label="주 메뉴">
          <ul class="gnb">${SITE_MENU.map(m => `
            <li><a class="gnb-link" href="${href(m)}" data-top="${m.id}"${m === current ? ' aria-current="page"' : ''}>${m.label}</a>
              <ul class="drop">${m.children.filter(c => c.id !== 'overview').map(c => `<li><a href="${href(m, c)}">${c.label}</a></li>`).join('')}</ul></li>`).join('')}
          </ul>
        </nav>
        <div class="hdr-util">
          <a class="official-link" ${ext('official')}>공식 홈페이지</a>
          <a class="btn-apply btn-ask" ${ext('kakao')}><svg class="ic-kakao" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.5 3 2 6.4 2 10.7c0 2.7 1.8 5.1 4.5 6.5L5.5 21l4.3-2.4c.7.1 1.5.2 2.2.2 5.5 0 10-3.4 10-7.7S17.5 3 12 3z"/></svg>문의하기</a>
          <button class="icon-btn menu-toggle" id="menuBtn" aria-label="전체 메뉴 열기" aria-expanded="false" aria-controls="drawer">
            <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg>
          </button>
        </div>
      </div>
    </div>${subnavOn ? `
    <nav class="subnav" id="subnav" data-type="${current.type}" aria-label="${current.label} 세부 메뉴">
      <div class="wrap subnav-inner">
        ${!current.title || html.dataset.subnavTitle === 'off' || current.children.some(c => c.label === current.title) ? '' : `<span class="subnav-title">${current.title}</span>`}
        <ul class="subnav-list" role="list">
          ${current.children.map(c => `<li><a href="${href(current, c)}" data-sub="${c.id}">${c.label}</a></li>`).join('')}
          <li class="subnav-indicator" aria-hidden="true"></li>
        </ul>
      </div>
    </nav>` : ''}
    <div class="drop-bg" id="dropBg" aria-hidden="true"></div>`;

    if (!$('#drawer')) el.insertAdjacentHTML('afterend', `
    <aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="전체 메뉴">
      <div class="drawer-top">
        <a class="logo" href="${ROOT + SITE_HOME}">${logo()}</a>
        <button class="icon-btn" id="drawerClose" aria-label="전체 메뉴 닫기"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
      <div>${SITE_MENU.map(m => `
        <div class="drawer-acc">
          <button class="acc-btn${m === current ? ' is-current' : ''}" aria-expanded="false" aria-controls="acc-${m.id}" id="accb-${m.id}">${m.label}${ICON.chev}</button>
          <div class="acc-panel" id="acc-${m.id}" role="region" aria-labelledby="accb-${m.id}"><div>
            ${m.children.map(c => `<a href="${href(m, c)}"${m === current ? ` data-sub="${c.id}"` : ''}>${c.label}</a>`).join('')}
          </div></div>
        </div>`).join('')}
      </div>
      <a class="drawer-cta" ${ext('kakao')}><svg class="ic-kakao" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.5 3 2 6.4 2 10.7c0 2.7 1.8 5.1 4.5 6.5L5.5 21l4.3-2.4c.7.1 1.5.2 2.2.2 5.5 0 10-3.4 10-7.7S17.5 3 12 3z"/></svg>문의하기</a>
    </aside>`);
    if (!$('.skip-link')) document.body.insertAdjacentHTML('afterbegin', '<a class="skip-link" href="#main">본문으로 바로가기</a>');
  }

  function renderFooter(){
    const el = $('#siteFooter');
    if (!el || el.firstElementChild) return;
    // 연락처 · 저작권 문구는 공식 교육플랫폼(support.gj-aischool.or.kr) 푸터와 같게(이용약관 · 이메일무단수집거부 · 기관 로고는 뺌). '홈페이지'는 공식 홈페이지 링크(좁은 화면에선 헤더에서 숨김)
    el.innerHTML = `
    <div class="wrap">
      <div class="footer-top">
        <a class="logo" href="${ROOT + SITE_HOME}">${logo()}</a>
        <ul class="footer-links">
          <li><a href="#privacy" data-toast="개인정보처리방침은 개발 단계에서 연결돼요"><strong>개인정보처리방침</strong></a></li>
          <li>유관 사이트 <a href="https://www.aica-gj.kr/main.php" target="_blank" rel="noopener">인공지능산업융합사업단</a></li>
        </ul>
      </div>
      <address>
        <ul><li>인공지능사관학교</li><li>주소 : 광주광역시 동구 제봉로 92 (대성학원 1-3층)</li><li>전화문의 : 062-716-0677</li><li>E-Mail : aica_hrd@aicluster.or.kr</li></ul>
        <ul><li>카카오톡 채널 : @인공지능사관학교</li><li><a ${ext('official')}>공식 홈페이지</a></li><li>상담시간 : 10시 ~ 17시 (월~금)</li></ul>
      </address>
      <p class="footer-copy">COPYRIGHT 2026 ⓒ 인공지능사관학교 ALL RIGHTS RESERVED.</p>
    </div>`;
    // 10-14: 푸터 맨 아래 페이지 메모(data-note)는 보이지 않게 함(그리던 코드 삭제, 속성은 메모로 남김)
  }

  /* 플로팅 버튼(FAB): 오른쪽 아래 맨 위로(스크롤하면 나타남). 헤더 · 모바일 메뉴 버튼은 10-14부터 '문의하기'(카카오톡 채널, SITE_LINKS.kakao). 안내 토스트 자리도 같이 */
  function renderFloating(){
    if (!$('#fabTop')) document.body.insertAdjacentHTML('beforeend', `
    <div class="floating">
      <button class="fab-top" id="fabTop" aria-label="맨 위로"><svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg></button>
    </div>`);
    if (!$('#toast')) document.body.insertAdjacentHTML('beforeend', `
    <div class="toast" id="toast" role="status" aria-live="polite"></div>`);
  }

  /* 왼쪽 하위 메뉴(10-13 사본). main 맨 앞에 그림(모양 · 자리는 common/css/lnb.css). 페이지 제목 줄(.st-mh, 이야기 5페이지)이 있으면 그 바로 뒤 — 좁은 화면에서 제목 → 알약 줄 순서.
     지금 항목은 하위 메뉴 바와 같은 기준(data-sub · currentSub)으로 setActiveSub가 aria-current="page" */
  // 10-13: 제목 위 작은 영문(STORIES 등) 뺌
  function renderLnb(){
    const main = $('#main');
    if (!sideNav || !main || $('#siteLnb')) return;
    const mh = main.querySelector(':scope > .st-mh');
    (mh || main).insertAdjacentHTML(mh ? 'afterend' : 'afterbegin', `
    <nav class="lnb" id="siteLnb" aria-label="${current.label} 메뉴">
      <div class="lnb-in">
        <p class="lnb-head"><strong class="lnb-title">${current.label}</strong></p>
        <ul class="lnb-list" role="list" data-scroll-fade>
          ${current.children.map(c => `<li><a href="${href(current, c)}" data-sub="${c.id}">${c.label}</a></li>`).join('')}
        </ul>
      </div>
    </nav>`);
  }
  /* ---------- 하위 메뉴 바: 현재 항목 표시 ---------- */
  function setActiveSub(id){
    // 모바일 메뉴(☰)의 지금 카테고리 세부 링크에도 같은 표시(서버가 그린 메뉴면 data-sub가 있는 링크만)
    $$('#drawer a[data-sub]').forEach(a => { if (a.dataset.sub === id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    // 10-13 사본: 왼쪽 메뉴(좁은 화면은 가로 줄 — 지금 항목이 보이게 가운데로)
    const lnb = $('#siteLnb .lnb-list');
    if (lnb) {
      let on;
      $$('a', lnb).forEach(a => { if (a.dataset.sub === id) { a.setAttribute('aria-current', 'page'); on = a; } else a.removeAttribute('aria-current'); });
      const max = lnb.scrollWidth - lnb.clientWidth;
      if (on && max > 1) {
        const x = on.offsetLeft - lnb.clientWidth / 2 + on.offsetWidth / 2;
        lnb.scrollLeft = x > max - 40 ? max : x < 40 ? 0 : x;   // 끝 40px 안이면 끝까지(흐림 띠가 지금 항목에 걸리지 않게)
      }
    }
    const list = $('#subnav .subnav-list');
    if (!list) return;
    let active;
    $$('a', list).forEach(a => {
      const on = a.dataset.sub === id;
      a.classList.toggle('is-active', on);
      if (on) { a.setAttribute('aria-current', 'true'); active = a; } else a.removeAttribute('aria-current');
    });
    const ind = $('.subnav-indicator', list);
    if (active) {
      const pad = parseFloat(getComputedStyle(active).paddingLeft);   // 밑줄은 글자 폭만큼(모바일은 좌우 여백이 좁음)
      ind.style.width = (active.offsetWidth - pad * 2) + 'px';
      ind.style.transform = `translateX(${active.offsetLeft + pad}px)`;
      ind.style.opacity = 1;
      // 모바일 가로 스크롤 목록에서 현재 항목이 보이게
      list.scrollTo({ left: active.offsetLeft - list.clientWidth / 2 + active.offsetWidth / 2, behavior: reduce ? 'auto' : 'smooth' });
    } else ind.style.opacity = 0;
  }
  /* 주소의 #위치가 바뀌면 하위 메뉴 바의 현재 항목을 맞춤 */
  function syncSubnav(){
    if ($('#subnav') || $('#siteLnb')) setActiveSub(currentSub());
  }
  /* 한 페이지 + 위치(anchor) 메뉴(#subnav data-type="anchor"): 화면에 들어온 섹션을 하위 메뉴에 표시 */
  function setupScrollSpy(){
    const nav = $('#subnav');
    if (!nav || nav.dataset.type !== 'anchor' || !('IntersectionObserver' in window)) return;
    const pairs = $$('a[data-sub]', nav).map(a => {
      const u = new URL(a.href);
      return { id: a.dataset.sub, el: samePage(u) && u.hash ? document.getElementById(decodeURIComponent(u.hash.slice(1))) : null };
    }).filter(p => p.el);
    if (!pairs.length) return;
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) setActiveSub(pairs.find(p => p.el === e.target).id);
    }), { rootMargin: '-40% 0px -55% 0px' });
    pairs.forEach(p => io.observe(p.el));
  }

  /* ---------- 가로로 넘치는 탭 줄: 더 있는 쪽 끝을 흐리게(하위 메뉴 바 + 본문 [data-scroll-fade]) ---------- */
  function setupScrollFade(){
    const els = [...$$('#subnav .subnav-list'), ...$$('[data-scroll-fade]')];
    if (!els.length) return;
    const update = el => {
      const max = el.scrollWidth - el.clientWidth;
      el.classList.toggle('fade-l', max > 1 && el.scrollLeft > 1);
      el.classList.toggle('fade-r', max > 1 && el.scrollLeft < max - 1);
    };
    const all = () => els.forEach(update);
    // 크기가 바뀔 때(창 크기 · 숨은 탭 화면이 보일 때) · 글꼴이 자리 잡은 뒤
    const ro = 'ResizeObserver' in window ? new ResizeObserver(es => es.forEach(e => update(e.target))) : null;
    els.forEach(el => { update(el); el.addEventListener('scroll', () => update(el), { passive: true }); ro?.observe(el); });
    addEventListener('resize', all);
    document.fonts?.ready.then(all);
  }

  /* ---------- 본문의 바깥 연결처 링크: <a data-site-link="apply"> → SITE_LINKS 주소, 없으면 안내 토스트(헤더 지원하기와 같음) ----------
     10-14 지금 본문에 쓰는 곳은 없음(Spring 본문 링크 계약으로 남김) */
  function linkSiteLinks(){
    if (typeof SITE_LINKS === 'undefined') return;   // 서버가 주소를 그려 보낸 페이지는 그대로
    $$('a[data-site-link]').forEach(a => {
      const l = SITE_LINKS[a.dataset.siteLink];
      if (!l) return;
      if (l.url) { a.href = l.url; a.removeAttribute('data-toast'); }
      else { a.setAttribute('href', '#' + a.dataset.siteLink); a.setAttribute('data-toast', l.note); }
    });
  }

  /* ---------- 주소 조건 ?cat=값: 본문의 분류 버튼(data-cat · aria-pressed)을 눌러 둠 ---------- */
  function applyCat(params){
    const v = params.get('cat');
    if (!v) return;
    const b = $$('main [data-cat][aria-pressed]').find(x => x.dataset.cat === v);
    if (b && b.getAttribute('aria-pressed') !== 'true') b.click();
  }

  /* ---------- 동작 ---------- */
  function openDrawer(){
    $('#drawer').classList.add('is-open');
    $('#menuBtn').setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    if (html.dataset.menu) $('#accb-' + html.dataset.menu)?.setAttribute('aria-expanded', 'true');
    setTimeout(() => $('#drawerClose').focus(), 50);
  }
  function closeDrawer(refocus){
    const d = $('#drawer');
    if (!d || !d.classList.contains('is-open')) return;
    d.classList.remove('is-open');
    $('#menuBtn').setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    if (refocus) $('#menuBtn').focus();
  }
  /* 모바일 메뉴가 열려 있는 동안 Tab · Shift+Tab은 메뉴 안에서만 돎(접힌 하위 목록 · 숨은 요소는 건너뜀) */
  function trapDrawer(e){
    const d = $('#drawer');
    if (!d || !d.classList.contains('is-open')) return;
    const f = $$('a[href], button', d).filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1], at = document.activeElement;
    if (!d.contains(at)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
  }

  /* 2depth 드롭다운(1080px 넘는 화면): 메뉴에 올리면 4개 메뉴의 하위가 한 번에 펼쳐짐. 바탕 높이는 가장 긴 하위 목록에 맞춤 */
  function setMega(on){
    const header = $('#siteHeader');
    if (on === header.classList.contains('menu-open')) return;
    if (on) header.style.setProperty('--drop-h', Math.max(...$$('.drop', header).map(d => d.offsetHeight)) + 'px');
    header.classList.toggle('menu-open', on);
  }
  /* 헤더 검색은 2026-10-13에 뺌(검색 패널 코드도 10-14 삭제) */

  let toastTimer;
  function toast(msg){
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), 2600);
  }

  /* 헤더 · 메뉴에서 고른 같은 페이지 위치로 이동.
     #위치는 브라우저 이동(location.hash)으로 바꿔 :target · scroll-margin 같은 페이지의 위치 규칙이 그대로 적용되게 함.
     부드러운 스크롤은 CSS scroll-behavior(움직임 줄이기 설정이면 끔) */
  function goTo(hash){
    const id = decodeURIComponent(hash.slice(1));
    const target = id && document.getElementById(id);
    if (!hash) {
      window.scrollTo({ top: 0 });
      // 주소에서 #위치를 지움(pushState는 hashchange가 없음) → 직접 알려 탭 화면 페이지(라이프 등)가 첫 화면으로 돌아가고 하위 메뉴 바도 다시 맞춤
      if (location.hash) { history.pushState(null, '', location.pathname + location.search); dispatchEvent(new HashChangeEvent('hashchange')); }
      else syncSubnav();
    } else if (hash !== location.hash) location.hash = hash;   // 스크롤 · hashchange(→ syncSubnav)는 브라우저가
    else target?.scrollIntoView({ block: 'start' });           // 지금 #위치를 다시 고르면 그 자리로
    const h = target && target.querySelector('h1, h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  function bind(){
    const header = $('#siteHeader'), fabTop = $('#fabTop');
    $('#menuBtn').addEventListener('click', openDrawer);
    $('#drawerClose').addEventListener('click', () => closeDrawer(true));
    $$('#drawer .acc-btn').forEach(b => b.addEventListener('click', () => {
      b.setAttribute('aria-expanded', String(b.getAttribute('aria-expanded') !== 'true'));
    }));
    // 드롭다운: 마우스가 메뉴나 펼친 영역 위에 있는 동안, 키보드 초점이 메뉴 안에 있는 동안 열림(터치는 누르면 바로 이동)
    // 드롭다운에서 같은 페이지 위치를 고른 뒤에는 마우스가 메뉴 밖으로 나갔다 올 때까지 다시 열지 않음
    const gnb = $('.gnb', header), dropBg = $('#dropBg');
    const inMega = el => !!el && (gnb.contains(el) || el === dropBg);
    let megaHold = false, focusHold = false;
    header.addEventListener('pointerover', e => { if (e.pointerType !== 'touch' && !megaHold && inMega(e.target)) setMega(true); });
    header.addEventListener('pointerout', e => { if (!inMega(e.relatedTarget)) { megaHold = false; setMega(false); } });
    gnb.addEventListener('focusin', () => { if (focusHold) focusHold = false; else setMega(true); });

    // Esc: 열린 것을 닫고 초점을 연 자리로(모바일 메뉴 → ☰, 드롭다운 하위 링크 → 그 위 메뉴)
    document.addEventListener('keydown', e => {
      if (e.key === 'Tab') return trapDrawer(e);
      if (e.key !== 'Escape') return;
      closeDrawer(true);
      if (header.classList.contains('menu-open')) {
        const top = document.activeElement.closest('.gnb > li')?.querySelector('.gnb-link');
        setMega(false);
        if (top && top !== document.activeElement) { focusHold = true; top.focus(); }
      }
    });
    gnb.addEventListener('focusout', e => { if (!gnb.contains(e.relatedTarget)) setMega(false); });

    // 연결처가 정해지지 않은 링크(data-toast)는 안내만 띄움 — 페이지 본문에 나중에 그려진 링크도 포함
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-toast]');
      if (a) { e.preventDefault(); toast(a.dataset.toast); }
    });
    // 헤더 · 모바일 메뉴 · 푸터 · 왼쪽 메뉴의 같은 페이지 링크는 새로 불러오지 않고 그 위치로 이동
    document.addEventListener('click', e => {
      const a = e.target.closest('#siteHeader a[href], #drawer a[href], #siteFooter a[href], #siteLnb a[href]');
      if (!a || a.hasAttribute('data-toast') || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const u = new URL(a.href);
      if (!samePage(u)) { closeDrawer(); return; }
      e.preventDefault();
      closeDrawer();
      if (header.classList.contains('menu-open')) { megaHold = true; setMega(false); }
      goTo(u.hash);
      applyCat(u.searchParams);   // 같은 페이지의 분류 조건(?cat=)
    });
    addEventListener('hashchange', syncSubnav);
    // 본문으로 바로가기: 주소는 그대로 두고 초점만 본문으로(탭 화면 페이지의 주소 #interviews 등이 #main으로 바뀌지 않게).
    // <main tabindex="-1">이 아닌 페이지(알아보기)는 브라우저 기본 이동
    $('.skip-link')?.addEventListener('click', e => {
      const m = $('#main');
      if (!m || !m.hasAttribute('tabindex')) return;
      e.preventDefault();
      m.focus();
    });

    // 맨 위로: 한 화면 가까이 내려가면 보임(10-14: 페이지 끝 '다음으로' 띠가 없어져 띠와 겹칠 때 감추던 코드 삭제)
    const onScroll = () => {
      header.classList.toggle('is-scrolled', scrollY > 8);
      fabTop.classList.toggle('is-visible', scrollY > innerHeight * .8);
    };
    fabTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }));
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', () => { onScroll(); if ($('#subnav')) setActiveSub($('#subnav .subnav-list a.is-active')?.dataset.sub || null); });
    addEventListener('hashchange', () => requestAnimationFrame(onScroll));   // 탭 화면 페이지: 화면이 바뀌면 스크롤 위치도 바뀜
    // 뒤로 가기로 돌아온 페이지에 열린 메뉴 · 드롭다운이 남지 않게
    addEventListener('pageshow', () => { closeDrawer(); setMega(false); });
    onScroll();
  }

  if ($('#siteHeader')) {
    renderHeader();
    renderLnb();
    renderFooter();
    renderFloating();
    bind();
    setupScrollSpy();
    setupScrollFade();
    if ($('#siteLnb')) { syncSubnav(); document.fonts?.ready.then(syncSubnav); }   // 왼쪽 메뉴는 바로(첫 화면에 지금 항목이 비어 보이지 않게). 좁은 화면 가로 줄 위치는 글꼴이 자리 잡은 뒤 다시
    if ($('#subnav')) requestAnimationFrame(syncSubnav);
  }
  linkSiteLinks();
  // 페이지 스크립트(defer, 이 파일 뒤)가 분류 버튼에 동작을 붙인 뒤에 누름
  if (location.search) {
    const go = () => applyCat(new URLSearchParams(location.search));
    if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
  }

  // syncSubnav: 탭 화면 페이지(라이프 · 선배들의 이야기)가 <html data-sub>를 바꾼 뒤 하위 메뉴 바 표시를 다시 맞출 때
  return { href, menu: menuOf, toast, reduce, syncSubnav };
})();
