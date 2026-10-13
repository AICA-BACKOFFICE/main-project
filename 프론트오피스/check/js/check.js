/* =========================================================
   지원 전 체크: 움직임만(본문은 index.html)
   aica-prototype-v3(2026-10-08) script.js의 jumpTo · setupReveal · setupCheck를 옮김(시안의 본문 위 목차 .pg-nav 동작은 공통 하위 메뉴 바로 대신)
   - 스크롤 등장(.rv): 움직임 줄이기면 바로 보임. 숨김은 이 스크립트가 main에 .rv-ready를 붙일 때만
   - 위치 이동: 콘텐츠 시작(섹션 머리)이 헤더 + 공통 하위 메뉴 바 아래 32px에 오게
     본문 #링크 · 처음 주소의 #위치 · 하위 메뉴 바 · 헤더 메뉴에서 고른 같은 페이지 #위치(hashchange)
     (하위 메뉴 바의 지금 위치 표시는 공통 site.js)
     브라우저가 #위치로 직접 스크롤하는 경우(처음 열 때 · 헤더 메뉴)도 같은 자리가 되게 check.css의 scroll-margin과 맞춤
   - 모집 프로세스 단계(#procFlow): 화면에 30% 이상 보이는 동안 3.2초마다 다음 단계를 켬(.is-on). 단계에 마우스를 올리거나 누르거나
     카드에 초점이 가면 그 단계에서 멈추고, 마우스 · 초점이 단계 밖으로 나가면 다시 돎. 움직임 줄이기면 자동으로 넘기지 않음
   - 자주 묻는 질문: 분류 · 검색(질문 · 답 글자 하이라이트, 질문은 .faq-qt의 data-text) · 하나씩 펼치기(aria-expanded).
     검색어를 고쳐도 고른 분류는 그대로 — 그 분류에 없고 다른 분류에 있으면 '전체 분류에서 n개' 안내 + 전체에서 보기
   - 스스로 체크: 진행 막대(aria-valuenow) · 하나라도 고르면 '모집 프로세스 보러 가기'
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
      const pick = el.matches('.sec') ? ($('.s-head', el) || el) : el;   // 섹션은 머리(.s-head) 기준
      y = layoutTop(pick) - ((header ? header.offsetHeight : 0) + 32);   // 헤더 높이에 하위 메뉴 바 포함
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

  /* ---------- 모집 프로세스: 단계 차례로 켜기 ---------- */
  const pf = $('#procFlow', main);
  if (pf) {
    const cols = $$('.pf-col', pf);
    let cur = 0, timer = null, inView = false, hold = false;
    const set = k => { cur = k; cols.forEach((c, i) => c.classList.toggle('is-on', i === k)); };
    const stop = () => { clearInterval(timer); timer = null; };
    const start = () => { stop(); if (!reduce && inView && !hold) timer = setInterval(() => set((cur + 1) % cols.length), 3200); };
    cols.forEach((c, i) => {
      const pick = () => { set(i); hold = true; stop(); };
      c.addEventListener('mouseenter', pick);
      c.addEventListener('click', pick);
      const card = $('.pf-card', c);
      if (card) card.addEventListener('focus', pick);
    });
    pf.addEventListener('mouseleave', () => { hold = false; start(); });
    pf.addEventListener('focusout', e => { if (!pf.contains(e.relatedTarget)) { hold = false; start(); } });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => es.forEach(e => { inView = e.isIntersecting; start(); }), { threshold: .3 }).observe(pf);
    }
    set(0);
  }

  /* ---------- 자주 묻는 질문: 분류 · 검색 · 펼치기 ---------- */
  // 검색: 질문 · 답 글 모두에서 찾고 둘 다 하이라이트(<mark>, 답은 글자 마디만 감싸 링크는 그대로). 결과가 1~2개면 첫 결과를 펼침.
  // 분류는 사용자가 고른 대로 둠(전에는 글자를 칠 때마다 '전체'로 돌아감). 고른 분류에 없고 다른 분류에 있으면 '없어요' 대신
  // '전체 분류에서는 n개' + 전체에서 보기 버튼(문구는 index.html #faqEmpty, 여기서는 분류 이름 · 숫자만 채움)
  const fl = $('#faqList', main);
  if (fl) {
    const items = $$('.faq-item', fl), tabs = $$('.faq-tab', main), q = $('#faqQ', main), clr = $('#faqClear', main),
      cnt = $('#faqCount', main), empty = $('#faqEmpty', main), eq = $('#faqEmptyQ', main),
      eIn = $('#faqEmptyIn', main), eCat = $('#faqEmptyCat', main), eAsk = $('#faqEmptyAsk', main),
      eAll = $('#faqEmptyAll', main), eAllN = $('#faqAllN', main), allBtn = $('#faqAllBtn', main);
    let cat = 'all';
    const answers = new Map(items.map(li => { const at = $('.faq-at', li); return [li, { at, html: at.innerHTML }]; }));
    const esc = t => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const markText = (txt, kw) => {
      const i = txt.toLowerCase().indexOf(kw);
      return i < 0 ? esc(txt) : esc(txt.slice(0, i)) + '<mark>' + esc(txt.slice(i, i + kw.length)) + '</mark>' + esc(txt.slice(i + kw.length));
    };
    const markAnswer = (at, kw) => {
      const w = document.createTreeWalker(at, NodeFilter.SHOW_TEXT), nodes = [];
      while (w.nextNode()) if (w.currentNode.nodeValue.toLowerCase().includes(kw)) nodes.push(w.currentNode);
      nodes.forEach(n => { const s = document.createElement('span'); s.innerHTML = markText(n.nodeValue, kw); n.replaceWith(...s.childNodes); });
    };
    const setOpen = (li, open) => { li.classList.toggle('is-open', open); $('.faq-q', li).setAttribute('aria-expanded', String(open)); };
    const setCat = c => { cat = c; tabs.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === c))); };
    const catName = c => {   // 칩 글자에서 질문 수(.faq-cnt)는 빼고 이름만
      const b = tabs.find(t => t.dataset.cat === c);
      return b ? [...b.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join('').trim() : c;
    };
    const apply = () => {
      const kw = q.value.trim().toLowerCase();
      const shown = [];
      let hits = 0;   // 분류와 상관없이 검색어에 맞는 질문 수
      items.forEach(li => {
        const qt = $('.faq-qt', li), txt = qt.dataset.text, a = answers.get(li);
        a.at.innerHTML = a.html;
        const hit = !kw || (txt + ' ' + a.at.textContent).toLowerCase().includes(kw);
        if (hit) hits++;
        const ok = (cat === 'all' || li.dataset.cat === cat) && hit;
        li.hidden = !ok;
        if (ok) shown.push(li);
        if (kw && ok) { qt.innerHTML = markText(txt, kw); markAnswer(a.at, kw); } else qt.textContent = txt;
      });
      const n = shown.length;
      if (kw && n && n <= 2 && !shown.some(li => li.classList.contains('is-open'))) {
        items.forEach(li => setOpen(li, false));
        setOpen(shown[0], true);
      }
      const other = !n && kw && cat !== 'all' ? hits : 0;   // 고른 분류에는 없고 다른 분류에 있는 수
      clr.hidden = !q.value;
      cnt.textContent = (kw || cat !== 'all') ? n + '개의 질문' + (other ? ' · 전체 분류에서 ' + other + '개' : '') : '';
      empty.hidden = n > 0;
      eq.textContent = kw ? '“' + q.value.trim() + '”' : '이 분류';
      eCat.textContent = catName(cat);
      eIn.hidden = !other;
      eAsk.hidden = !!other;
      eAll.hidden = allBtn.hidden = !other;
      eAllN.textContent = other;
    };
    tabs.forEach(t => t.addEventListener('click', () => { setCat(t.dataset.cat); apply(); }));
    q.addEventListener('input', apply);
    // 전체에서 보기: 분류만 '전체'로(검색어 그대로), 초점은 첫 결과 질문으로(누른 버튼이 사라지므로)
    allBtn.addEventListener('click', () => {
      setCat('all'); apply();
      const first = items.find(li => !li.hidden);
      if (first) $('.faq-q', first).focus();
    });
    clr.addEventListener('click', () => { q.value = ''; apply(); q.focus(); });
    $$('.faq-q', fl).forEach(b => b.addEventListener('click', () => {
      const li = b.closest('.faq-item'), open = !li.classList.contains('is-open');
      if (open) items.forEach(o => setOpen(o, false));
      setOpen(li, open);
    }));
    apply();
  }

  /* ---------- 스스로 체크 ---------- */
  // 진행 막대(.chk-bar, role=progressbar)의 aria-valuenow도 같이 바꿈
  const boxes = $$('.chk-box', main), now = $('#chkNow', main), bar = $('#chkBar', main), go = $('#chkGo', main);
  if (boxes.length && now && bar && go) {
    const meter = bar.parentElement;
    meter.setAttribute('aria-valuemax', boxes.length);
    const upd = () => {
      const n = boxes.filter(b => b.checked).length;
      now.textContent = n;
      bar.style.width = (n / boxes.length * 100) + '%';
      meter.setAttribute('aria-valuenow', n);
      go.hidden = n < 1;
    };
    boxes.forEach(b => b.addEventListener('change', upd));
    upd();
  }
})();
