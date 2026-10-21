/* 공통 화면 구조: 헤더 · 모바일 메뉴 · 푸터 · LNB · 플로팅 버튼.
   내용은 content/site.json, 이벤트와 상태는 site.js에서 관리합니다. */
const SiteLayout = ({ $, ROOT, href, current, subnavOn, sideNav, html }) => {
  const text = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const ICON = {
    chev:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'
  };
  /* 모바일 메뉴에서 하위 목록을 접고 펼치는 메뉴(10-15): 네 메뉴 모두. 여기서 뺀 메뉴는 누르면 그 페이지로 바로 가는 링크가 됨 */
  const DRAWER_ACC = ['about', 'stories', 'life', 'check'];
  const num = i => String(i + 1).padStart(2, '0');
  /* 바깥 연결처(menu.js SITE_LINKS) 링크 속성. 주소가 아직 없으면 누를 때 안내만 */
  function ext(key){
    const l = SITE_LINKS[key];
    return l.url ? `href="${text(l.url)}"` : `href="#${key}" data-toast="${text(l.note)}"`;
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
        <a class="logo" href="${text(ROOT + SITE_HOME)}" aria-label="인공지능사관학교 홈">${logo()}</a>
        <nav class="hdr-nav" aria-label="주 메뉴">
          <ul class="gnb">${SITE_MENU.map(m => `
            <li><a class="gnb-link" href="${text(href(m))}" data-top="${text(m.id)}"${m === current ? ' aria-current="page"' : ''}>${text(m.label)}</a>
              <ul class="drop">${m.children.filter(c => c.id !== 'overview').map(c => `<li><a href="${text(href(m, c))}">${text(c.label)}</a></li>`).join('')}</ul></li>`).join('')}
          </ul>
        </nav>
        <div class="hdr-util">
          <a class="official-link" ${ext('official')}>공식 홈페이지</a>
          <a class="btn-apply btn-ask" ${ext('kakao')}><svg class="ic-kakao" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.5 3 2 6.4 2 10.7c0 2.7 1.8 5.1 4.5 6.5L5.5 21l4.3-2.4c.7.1 1.5.2 2.2.2 5.5 0 10-3.4 10-7.7S17.5 3 12 3z"/></svg>문의하기</a>
          <button class="icon-btn menu-toggle" id="menuBtn" aria-label="전체 메뉴 열기" aria-expanded="false" aria-controls="drawer">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16M4 12h16M4 17.5h16"/></svg>
          </button>
        </div>
      </div>
    </div>${subnavOn ? `
    <nav class="subnav" id="subnav" data-type="${text(current.type)}" aria-label="${text(current.label)} 세부 메뉴">
      <div class="wrap subnav-inner">
        ${!current.title || html.dataset.subnavTitle === 'off' || current.children.some(c => c.label === current.title) ? '' : `<span class="subnav-title">${text(current.title)}</span>`}
        <ul class="subnav-list" role="list">
          ${current.children.map(c => `<li><a href="${text(href(current, c))}" data-sub="${text(c.id)}">${text(c.label)}</a></li>`).join('')}
          <li class="subnav-indicator" aria-hidden="true"></li>
        </ul>
      </div>
    </nav>` : ''}
    <div class="drop-bg" id="dropBg" aria-hidden="true"></div>`;

    /* 모바일 메뉴(10-15 B4 아코디언형): 오른쪽 80% 드로어 + 뒤 딤. 01~04 번호, DRAWER_ACC 메뉴는 하위를 접고 펼침(지금 메뉴는 site.js가 펼친 채로 엶) */
    if (!$('#drawer')) el.insertAdjacentHTML('afterend', `
    <div class="drawer-dim" id="drawerDim" aria-hidden="true"></div>
    <aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="전체 메뉴">
      <div class="drawer-top">
        <a class="logo" href="${text(ROOT + SITE_HOME)}">${logo()}</a>
        <button class="drawer-close" id="drawerClose" aria-label="전체 메뉴 닫기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg><span aria-hidden="true">닫기</span></button>
      </div>
      <nav class="drawer-nav" aria-label="주 메뉴">${SITE_MENU.map((m, i) => DRAWER_ACC.includes(m.id) ? `
        <div class="drawer-acc">
          <div class="acc-head"><a class="acc-btn${m === current ? ' is-current' : ''}" href="${text(href(m))}" id="accl-${text(m.id)}"${m === current ? ' aria-current="page"' : ''}><span class="acc-no">${num(i)}</span><span class="acc-tx">${text(m.label)}</span></a><button type="button" class="acc-tog${m === current ? ' is-current' : ''}" aria-expanded="false" aria-controls="acc-${text(m.id)}" id="accb-${text(m.id)}" aria-label="${text(m.label)} 하위 메뉴">${ICON.chev}</button></div>
          <div class="acc-panel" id="acc-${text(m.id)}" role="region" aria-labelledby="accl-${text(m.id)}"><div>
            ${m.children.map(c => `<a href="${text(href(m, c))}"${m === current ? ` data-sub="${text(c.id)}"` : ''}>${text(c.label)}</a>`).join('')}
          </div></div>
        </div>` : `
        <div class="drawer-acc">
          <a class="acc-btn${m === current ? ' is-current' : ''}" href="${text(href(m))}"${m === current ? ' aria-current="page"' : ''}><span class="acc-no">${num(i)}</span><span class="acc-tx">${text(m.label)}</span></a>
        </div>`).join('')}
      </nav>
      <div class="drawer-foot">
        <a class="drawer-cta" ${ext('kakao')}><svg class="ic-kakao" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.5 3 2 6.4 2 10.7c0 2.7 1.8 5.1 4.5 6.5L5.5 21l4.3-2.4c.7.1 1.5.2 2.2.2 5.5 0 10-3.4 10-7.7S17.5 3 12 3z"/></svg>문의하기</a>
      </div>
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
        <a class="logo" href="${text(ROOT + SITE_HOME)}">${logo()}</a>
        <ul class="footer-links">
          <li><a href="#privacy" data-toast="${text(SITE_INFO.privacyNote)}"><strong>개인정보처리방침</strong></a></li>
          <li>유관 사이트 <a href="${text(SITE_INFO.relatedSiteUrl)}" target="_blank" rel="noopener">${text(SITE_INFO.relatedSiteLabel)}</a></li>
        </ul>
      </div>
      <address>
        <ul><li>${text(SITE_INFO.name)}</li><li>주소 : ${text(SITE_INFO.address)}</li><li>전화문의 : ${text(SITE_INFO.phone)}</li><li>E-Mail : ${text(SITE_INFO.email)}</li></ul>
        <ul><li>카카오톡 채널 : ${text(SITE_INFO.kakaoChannel)}</li><li><a ${ext('official')}>공식 홈페이지</a></li><li>상담시간 : ${text(SITE_INFO.hours)}</li></ul>
      </address>
      <p class="footer-copy">${text(SITE_INFO.copyright)}</p>
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
    <nav class="lnb" id="siteLnb" aria-label="${text(current.label)} 메뉴">
      <div class="lnb-in">
        <p class="lnb-head"><strong class="lnb-title">${text(current.label)}</strong></p>
        <ul class="lnb-list" role="list" data-scroll-fade>
          ${current.children.map(c => `<li><a href="${text(href(current, c))}" data-sub="${text(c.id)}">${text(c.label)}</a></li>`).join('')}
        </ul>
      </div>
    </nav>`);
  }
  return { renderHeader, renderLnb, renderFooter, renderFloating };
};
