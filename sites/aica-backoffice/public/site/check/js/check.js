/* =========================================================
   지원 전 체크: 움직임만(본문은 index.html)
   10-13: 사용자 제공 아티팩트 '인사교 A to Z'의 #/check 화면으로 교체. 아티팩트 script의 setupSecFloat · setupCheck를 옮김
   - 위치 이동: 섹션 제목이 헤더 + 하위 메뉴 바 아래 64px(모바일 40px)에 오게. 본문 #링크 · 처음 주소 · 하위 메뉴 바 · 오른쪽 목차(data-jump)
   - 스크롤 등장(.rv): 화면에 들어오면 .is-in. 움직임 줄이기면 바로 보임
   - 오른쪽 플로팅 목차(.sec-float): 화면 40% 지점을 지난 마지막 섹션을 표시, 누르면 그 섹션으로
   - 모집 프로세스(#procFlow): 화면에 보이는 동안 3.2초마다 다음 단계. 마우스 · 초점이 올라가면 그 단계에서 멈춤
   - 스스로 체크: 고른 개수 · 막대 · 하나라도 고르면 '모집 프로세스 보러 가기'
   - 자주 묻는 질문: 분류 탭 · 5개씩 페이지 · 하나씩 펼치기. 목록 높이를 질문 5개 높이로 고정해 분류를 바꿔도 아래가 안 움직임
   ========================================================= */
(() => {
  const main = document.querySelector('.check-page');
  if (!main) return;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  const header = $('#siteHeader');

  /* ---------- 위치 이동 ---------- */
  // instant: 처음 열 때처럼 바로(공통 base.css의 html scroll-behavior:smooth를 잠시 끔)
  function scrollToY(y, instant){
    if (instant || reduce) {
      const prev = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo(0, y);
      root.style.scrollBehavior = prev;
    } else window.scrollTo({ top: y, behavior: 'smooth' });
  }
  // 등장 전(.rv) 요소는 아래로 18px 내려가 있으므로 그만큼 빼고 잼
  function layoutTop(el){
    const t = getComputedStyle(el).transform;
    const ty = t && t !== 'none' ? new DOMMatrixReadOnly(t).m42 : 0;
    return el.getBoundingClientRect().top - ty + window.scrollY;
  }
  function jumpTo(el, instant){
    if (!el) return;
    let y = 0;
    if (el.id !== 'overview') {
      const pick = el.matches('.v3-sec') ? ($('.k-head, .s-head', el) || el) : el;   // 섹션은 머리(.k-head) 기준
      y = layoutTop(pick) - ((header ? header.offsetHeight : 0) + (matchMedia('(max-width:760px)').matches ? 40 : 64));   // 10-13: 바 ↔ 제목 여백 통일(전에는 32px)   // 헤더 높이에 하위 메뉴 바 포함
    }
    scrollToY(Math.max(0, Math.round(y)), instant);
    // 접근성: 이동한 섹션 제목으로 초점
    const h = el.querySelector('h1, h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
  const targetOf = hash => {
    const id = hash && hash.length > 1 ? decodeURIComponent(hash.slice(1)) : '';
    const el = id && document.getElementById(id);
    return el && main.contains(el) ? el : null;
  };

  // 본문 안 같은 페이지 #링크(모집 프로세스 보러 가기 · 자주 묻는 질문 답의 링크). 연결처 미정(data-toast · data-site-link)은 공통 site.js가 안내
  main.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.hasAttribute('data-toast') || e.defaultPrevented) return;
    const el = targetOf(a.getAttribute('href'));
    if (!el) return;
    e.preventDefault();
    history.replaceState(null, '', a.getAttribute('href'));
    jumpTo(el);
  });
  // 헤더 드롭다운 · 하위 메뉴 바 · 모바일 메뉴 · 푸터에서 이 페이지의 #위치를 고르면 site.js가 주소를 바꾸고(→ hashchange) 브라우저가 스크롤함.
  // 같은 위치를 다시 고를 때(주소가 그대로라 hashchange 없음)도 같은 자리로 오게 site.js 다음에 맞춤
  document.addEventListener('click', e => {
    const a = e.target.closest('#siteHeader a[href], #drawer a[href], #siteFooter a[href]');
    if (!a || !e.defaultPrevented || a.hasAttribute('data-toast')) return;   // site.js가 같은 페이지 링크만 막음
    const el = targetOf(new URL(a.href).hash);
    if (el) jumpTo(el);
  });
  addEventListener('hashchange', () => { const el = targetOf(location.hash); if (el) jumpTo(el); });

  // 처음 주소에 #위치가 있으면 그 자리로. 글꼴 · 레이아웃이 자리 잡은 뒤에도 한 번 더(그 사이 사용자가 스크롤하면 그대로 둠)
  const first = targetOf(location.hash);
  if (first) {
    let moved = false;
    const stop = () => { moved = true; };
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(t => addEventListener(t, stop, { once: true, passive: true }));
    jumpTo(first, true);
    const again = () => { if (!moved) jumpTo(first, true); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(again);
    if (document.readyState === 'complete') again(); else addEventListener('load', again, { once: true });
  }

  /* ---------- 스크롤 등장 ---------- */
  const rvs = $$('.rv', main);
  if (reduce || !('IntersectionObserver' in window)) rvs.forEach(e => e.classList.add('is-in'));
  else {
    // 숨김(opacity 0)을 전환 없이(.rv-init) 먼저 확정한 뒤 다음 프레임에 전환을 켜고 관찰.
    // 그냥 .rv-ready만 붙이면 1 → 0 전환이 시작되자마자 is-in이 되돌려 첫 화면 요소가 떠오르지 않음
    main.classList.add('rv-ready', 'rv-init');
    void main.offsetHeight;
    requestAnimationFrame(() => {
      main.classList.remove('rv-init');
      const io = new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      }), { rootMargin: '0px 0px -8% 0px', threshold: .08 });
      rvs.forEach(e => io.observe(e));
    });
  }

  /* ---------- 오른쪽 플로팅 목차 ---------- */
  const sf = $('.sec-float', main);
  if (sf) {
    const btns = $$('.sf-btn', sf), secs = btns.map(b => document.getElementById(b.dataset.jump));
    const set = id => btns.forEach(b => { const on = b.dataset.jump === id; b.classList.toggle('is-active', on); if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    let raf;
    const calc = () => {
      const line = innerHeight * .4; let id = btns[0].dataset.jump;
      secs.forEach((el, k) => { if (el && el.getBoundingClientRect().top <= line) id = btns[k].dataset.jump; });
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) id = btns[btns.length - 1].dataset.jump;
      set(id);
    };
    const onS = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(calc); };
    addEventListener('scroll', onS, { passive: true }); addEventListener('resize', onS);
    calc();
    requestAnimationFrame(() => sf.classList.add('is-in'));
  }
  $$('[data-jump]', main).forEach(b => b.addEventListener('click', () => {
    const el = document.getElementById(b.dataset.jump); if (!el) return;
    history.replaceState(null, '', '#' + b.dataset.jump);
    jumpTo(el);
  }));

  /* ---------- 자주 묻는 질문: 분류 · 페이지 · 펼치기 ---------- */
  const fl = $('#faqList', main);
  if (fl) {
    const items = $$('.faq-item', fl), tabs = $$('.faq-tab', main), cnt = $('#faqCount', main);
    const pager = $('#faqPager', main), pagesEl = $('#faqPages', main), fprev = $('#faqPrev', main), fnext = $('#faqNext', main);
    const PER = 8; let cat = 'all', fpage = 0;
    const apply = () => {
      let n = 0;
      items.forEach(li => { const ok = cat === 'all' || li.dataset.cat === cat; li._ok = ok; if (ok) n++; });
      const list = items.filter(li => li._ok), pages = Math.max(1, Math.ceil(list.length / PER));
      fpage = Math.min(fpage, pages - 1);
      items.forEach(li => { const k = list.indexOf(li); li.hidden = !(k >= fpage * PER && k < (fpage + 1) * PER); });
      pager.classList.toggle('is-off', pages <= 1); pager.setAttribute('aria-hidden', String(pages <= 1));
      pagesEl.innerHTML = Array.from({ length: pages }, (_, k) => `<button type="button" class="faq-pn" data-p="${k}"${k === fpage ? ' aria-current="page"' : ''} aria-label="${k + 1}페이지">${k + 1}</button>`).join('');
      fprev.disabled = fpage === 0; fnext.disabled = fpage === pages - 1;
      cnt.textContent = cat !== 'all' ? n + '개의 질문' : '';
    };
    const goPage = k => {
      fpage = k; apply();
      const top = $('.faq-tools', main).getBoundingClientRect().top;
      if (top < (header ? header.offsetHeight : 0) || top > innerHeight * .5) jumpTo($('#faq', main));
    };
    pagesEl.addEventListener('click', e => { const b = e.target.closest('.faq-pn'); if (b) goPage(+b.dataset.p); });
    fprev.addEventListener('click', () => { if (fpage > 0) goPage(fpage - 1); });
    fnext.addEventListener('click', () => goPage(fpage + 1));
    tabs.forEach(t => t.addEventListener('click', () => { cat = t.dataset.cat; fpage = 0; tabs.forEach(b => b.setAttribute('aria-pressed', String(b === t))); apply(); }));
    $$('.faq-q', fl).forEach(b => b.addEventListener('click', () => {
      const li = b.closest('.faq-item'), open = !li.classList.contains('is-open');
      if (open) items.forEach(o => { o.classList.remove('is-open'); $('.faq-q', o).setAttribute('aria-expanded', 'false'); });
      li.classList.toggle('is-open', open); b.setAttribute('aria-expanded', String(open));
    }));
    const sizeList = () => {
      items.forEach(li => li.hidden = false);
      const h = Math.max(...items.map(li => $('h3', li).offsetHeight)) + 1;
      fl.style.minHeight = (h * PER + 2) + 'px';
      apply();
    };
    sizeList();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeList);
    let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(sizeList, 150); });
  }

  /* ---------- 모집 프로세스: 단계 차례로 켜기 ---------- */
  const pf = $('#procFlow', main);
  if (pf) {
    const cols = $$('.pf-col', pf); let cur = 0, auto = 0, timer = null, inView = false, hold = false;
    const set = k => { cur = k; cols.forEach((c, i) => c.classList.toggle('is-on', i === k)); };
    const stop = () => { clearInterval(timer); timer = null; };
    const start = () => { stop(); if (!reduce && inView && !hold) timer = setInterval(() => set((cur + 1) % cols.length), 3200); };
    cols.forEach((c, i) => {
      const pick = () => { if (!hold) auto = cur; set(i); hold = true; stop(); };
      c.addEventListener('mouseenter', pick); c.addEventListener('click', pick);
      const card = $('.pf-card', c); if (card) card.addEventListener('focus', pick);
    });
    // 커서가 벗어나면 호버로 켠 단계를 바로 끄고, 자동 순환하던 단계로 되돌림
    const release = () => { if (!hold) return; hold = false; set(auto); start(); };
    pf.addEventListener('mouseleave', () => { if (pf.contains(document.activeElement)) document.activeElement.blur(); release(); });
    pf.addEventListener('focusout', e => { if (!pf.contains(e.relatedTarget)) release(); });
    new IntersectionObserver(es => es.forEach(e => { inView = e.isIntersecting; start(); }), { threshold: .3 }).observe(pf);
    set(0);
  }

  /* ---------- 스스로 체크 ---------- */
  const boxes = $$('.chk-box', main), now = $('#chkNow', main), bar = $('#chkBar', main), go = $('#chkGo', main);
  if (boxes.length) {
    const upd = () => { const n = boxes.filter(b => b.checked).length; now.textContent = n; bar.style.width = (n / boxes.length * 100) + '%'; go.hidden = n < 1; };
    boxes.forEach(b => b.addEventListener('change', upd)); upd();
  }
})();
