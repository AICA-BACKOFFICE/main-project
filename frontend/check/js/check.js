/* 지원 전 체크: existing content/IDs are shared by both layouts.
   Desktop: floating chapters, animated process, eight FAQs per page.
   Mobile <=600px: chapter dock, all process stages, search/five FAQ items,
   single-answer expansion, and the approved checklist progress states. */
(() => {
  const main = document.querySelector('.check-page');
  if (!main) return;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const mobile = matchMedia('(max-width:600px)');
  let revealFAQ = () => {};
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
      const section = el.matches('.v3-sec');
      const chapter = section && mobile.matches ? $('.cm-chapter', el) : null;
      const pick = chapter || (section ? ($('.k-head, .s-head', el) || el) : el);
      const faqItem = el.closest('.faq-item');
      const tools = faqItem && mobile.matches ? $('.faq-tools', main).offsetHeight : 0;
      const gap = chapter ? 0 : (mobile.matches ? 16 : 64);
      y = layoutTop(pick) - ((header ? header.offsetHeight : 0) + tools + gap);
    }
    scrollToY(Math.max(0, Math.round(y)), instant);
    // 접근성: 이동한 섹션 제목으로 초점
    const h = el.querySelector('h1, h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
  const targetOf = hash => {
    const id = hash && hash.length > 1 ? Site.decodeHash(hash.slice(1)) : '';
    revealFAQ(id);
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

  /* ---------- FAQ: original records, mobile search and 5-item pages ---------- */
  const fl = $('#faqList', main);
  if (fl) {
    const items = $$('.faq-item', fl), tabs = $$('.faq-tab', main), cnt = $('#faqCount', main);
    const pager = $('#faqPager', main), pagesEl = $('#faqPages', main), prev = $('#faqPrev', main), next = $('#faqNext', main);
    const search = $('#faqSearch', main), clear = $('#faqClear', main), empty = $('#cmFaqEmpty', main), position = $('#cmFaqPosition', main);
    const normalize = value => value.toLocaleLowerCase('ko').replace(/\s+/g, ' ').trim();
    const index = new Map(items.map(item => [item, normalize(item.textContent)]));
    const perPage = () => mobile.matches ? 5 : 8;
    let cat = 'all', page = 0, query = '', results = items;
    const setOpen = (item, open) => {
      item.classList.toggle('is-open', open);
      $('.faq-q', item).setAttribute('aria-expanded', String(open));
      $('.faq-a', item).inert = !open;
    };
    const closeAll = () => items.forEach(item => setOpen(item, false));
    const apply = () => {
      const words = mobile.matches ? normalize(query).split(' ').filter(Boolean) : [];
      results = items.filter(item => (cat === 'all' || item.dataset.cat === cat) && words.every(word => index.get(item).includes(word)));
      const per = perPage(), pages = Math.max(1, Math.ceil(results.length / per));
      page = Math.min(page, pages - 1);
      const start = page * per;
      items.forEach(item => { const k = results.indexOf(item); item.hidden = k < start || k >= start + per; });
      pager.classList.toggle('is-off', pages <= 1); pager.setAttribute('aria-hidden', String(pages <= 1));
      pagesEl.innerHTML = Array.from({length:pages}, (_, k) => `<button type="button" class="faq-pn" data-p="${k}"${k === page ? ' aria-current="page"' : ''} aria-label="${k + 1}페이지">${k + 1}</button>`).join('');
      prev.disabled = page === 0; next.disabled = page === pages - 1;
      const label = cat === 'all' ? '전체' : cat;
      cnt.textContent = mobile.matches ? `${label} ${normalize(query) ? '검색 결과 ' : ''}${results.length}개${pages > 1 ? ` · ${start + 1}–${Math.min(start + per, results.length)}번째` : ''}` : cat !== 'all' ? results.length + '개의 질문' : '';
      position.textContent = `${page + 1} / ${pages}`;
      position.setAttribute('aria-label', `전체 ${pages}페이지 중 ${page + 1}페이지`);
      clear.hidden = !query;
      empty.hidden = !mobile.matches || results.length > 0;
    };
    const alignResults = () => {
      const gap = (header?.offsetHeight || 0) + $('.faq-tools', main).offsetHeight + 12;
      scrollToY(Math.max(0, layoutTop(cnt) - gap), true);
    };
    const goPage = (k, event) => {
      if (k < 0 || k >= Math.ceil(results.length / perPage())) return;
      page = k; closeAll(); apply();
      if (mobile.matches) {
        alignResults();
        if (event?.detail === 0) $('.faq-q', results[page * perPage()])?.focus({preventScroll:true});
      } else {
        const top = $('.faq-tools', main).getBoundingClientRect().top;
        if (top < (header?.offsetHeight || 0) || top > innerHeight * .5) jumpTo($('#faq', main));
      }
    };
    pagesEl.addEventListener('click', event => { const b = event.target.closest('.faq-pn'); if (b) goPage(+b.dataset.p, event); });
    prev.addEventListener('click', event => goPage(page - 1, event));
    next.addEventListener('click', event => goPage(page + 1, event));
    const selectCategory = value => { cat = value; tabs.forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.cat === cat))); };
    tabs.forEach(tab => tab.addEventListener('click', () => { selectCategory(tab.dataset.cat); page = 0; closeAll(); apply(); }));
    const searchChanged = () => { query = search.value; page = 0; closeAll(); apply(); };
    search.addEventListener('input', event => { if (!event.isComposing) searchChanged(); });
    search.addEventListener('compositionend', searchChanged);
    clear.addEventListener('click', () => { search.value = ''; searchChanged(); search.focus({preventScroll:true}); });
    $('#cmFaqReset', main).addEventListener('click', () => { selectCategory('all'); search.value = ''; searchChanged(); search.focus({preventScroll:true}); });
    $$('.faq-q', fl).forEach(button => button.addEventListener('click', () => {
      const item = button.closest('.faq-item'), open = !item.classList.contains('is-open');
      const top = button.getBoundingClientRect().top;
      closeAll(); setOpen(item, open);
      if (mobile.matches) {
        const shift = button.getBoundingClientRect().top - top;
        if (shift) scrollToY(scrollY + shift, true);
        const gap = (header?.offsetHeight || 0) + $('.faq-tools', main).offsetHeight + 12;
        if (button.getBoundingClientRect().top < gap) scrollToY(layoutTop(button) - gap, true);
      }
    }));
    const sizeList = () => {
      if (mobile.matches) fl.style.minHeight = '';
      else {
        items.forEach(item => item.hidden = false);
        const height = Math.max(...items.map(item => $('h3', item).offsetHeight)) + 1;
        fl.style.minHeight = (height * perPage() + 2) + 'px';
      }
      apply();
    };
    revealFAQ = id => {
      const item = items.find(item => item.id === id || $('.faq-q', item).id === id || $('.faq-a', item).id === id);
      if (!item) return;
      query = ''; search.value = ''; selectCategory('all');
      page = Math.floor(items.indexOf(item) / perPage());
      closeAll(); apply(); setOpen(item, true);
    };
    closeAll(); sizeList();
    document.fonts?.ready.then(sizeList);
    let resize; addEventListener('resize', () => { clearTimeout(resize); resize = setTimeout(sizeList, 150); });
    mobile.addEventListener('change', () => { page = 0; closeAll(); sizeList(); });
    if (location.hash) { const target = targetOf(location.hash); if (target) jumpTo(target, true); }
  }

  /* ---------- 모집 프로세스: 단계 차례로 켜기 ---------- */
  const pf = $('#procFlow', main);
  if (pf) {
    const cols = $$('.pf-col', pf); let cur = 0, auto = 0, timer = null, inView = false, hold = false;
    const set = k => { cur = k; cols.forEach((c, i) => c.classList.toggle('is-on', i === k)); };
    const stop = () => { clearInterval(timer); timer = null; };
    const start = () => { stop(); if (!mobile.matches && !reduce && inView && !hold) timer = setInterval(() => set((cur + 1) % cols.length), 3200); };
    cols.forEach((c, i) => {
      const pick = () => { if (mobile.matches) return; if (!hold) auto = cur; set(i); hold = true; stop(); };
      c.addEventListener('mouseenter', pick); c.addEventListener('click', pick);
      const card = $('.pf-card', c); if (card) card.addEventListener('focus', pick);
    });
    // 커서가 벗어나면 호버로 켠 단계를 바로 끄고, 자동 순환하던 단계로 되돌림
    const release = () => { if (!hold) return; hold = false; set(auto); start(); };
    pf.addEventListener('mouseleave', () => { if (pf.contains(document.activeElement)) document.activeElement.blur(); release(); });
    pf.addEventListener('focusout', e => { if (!pf.contains(e.relatedTarget)) release(); });
    new IntersectionObserver(es => es.forEach(e => { inView = e.isIntersecting; start(); }), { threshold: .3 }).observe(pf);
    mobile.addEventListener('change', start);
    set(0);
  }

  /* ---------- 스스로 체크 ---------- */
  const boxes = $$('.chk-box', main), now = $('#chkNow', main), bar = $('#chkBar', main), go = $('#chkGo', main);
  if (boxes.length) {
    const upd = () => {
      const n = boxes.filter(b => b.checked).length;
      now.textContent = n; bar.style.width = (n / boxes.length * 100) + '%';
      $('#cmCheckNow', main).textContent = n; $('#cmCheckProgress', main).value = n;
      $('.chk-self', main).classList.toggle('is-complete', n === boxes.length);
      $('#chkGoLabel', main).textContent = mobile.matches ? (n === boxes.length ? '체크 완료 · 선발 과정 확인하기' : '선발 과정 확인하기') : '모집 프로세스 보러 가기';
      go.hidden = !mobile.matches && n < 1;
    };
    boxes.forEach(b => b.addEventListener('change', upd)); mobile.addEventListener('change', upd); upd();
  }
})();
