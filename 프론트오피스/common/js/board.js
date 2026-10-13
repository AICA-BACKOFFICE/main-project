/* =========================================================
   목록 · 상세 공통 동작(board.css 짝). site.js 다음에 불러옵니다.
   - 고르기 목록(<details class="dropdown">): 바깥을 누르거나 Esc면 닫음
   - 링크 복사(data-copy-link): 지금 주소를 복사하고 안내
   - 정적 시안 전용 목록 흉내(data-board-demo="한 쪽 개수"): 서버 대신 주소 조건으로
     HTML에 있는 카드를 거르고 · 정렬하고 · 쪽을 나눔. 조건 이름은 서버와 같게
     ?category=카테고리 · cohort=기수 · tag=태그 · sort=(비면 최신순 | old) · page=쪽
     Spring에서는 서버가 거른 목록 · 개수 · 페이지 번호 · 빈 상태를 그려 보내므로 data-board-demo를 빼면 이 부분은 꺼짐
   ========================================================= */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* 고르기 목록: 바깥을 누르거나 Esc면 닫음 */
  const drops = $$('details.dropdown');
  document.addEventListener('click', e => drops.forEach(d => { if (d.open && !d.contains(e.target)) d.open = false; }));
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    drops.forEach(d => { if (d.open) { d.open = false; $('summary', d).focus(); } });
  });

  /* 링크 복사 */
  $$('[data-copy-link]').forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); Site.toast('링크를 복사했어요'); }
    catch { Site.toast('복사하지 못했어요. 주소창의 주소를 복사해 주세요'); }
  }));

  /* ---------- 정적 시안 전용: 목록 흉내 ---------- */
  const list = $('[data-board-demo]');
  if (list) demo(list);

  /* 칩이 한 줄로 밀리는 좁은 화면: 지금 고른 칩이 보이게 */
  const chip = $('.chips [aria-current]');
  if (chip && chip.parentElement.scrollWidth > chip.parentElement.clientWidth) {
    chip.parentElement.scrollLeft = chip.offsetLeft - chip.parentElement.offsetLeft - 20;
  }

  function demo(list){
    const board = list.closest('.board') || document;
    const now = new URLSearchParams(location.search);
    const val = k => now.get(k) || '';
    const per = Number(list.dataset.boardDemo) || 6;

    const cards = $$(':scope > li', list);
    const hits = cards.filter(li => (!val('category') || li.dataset.category === val('category'))
      && (!val('cohort') || li.dataset.cohort === val('cohort'))
      && (!val('tag') || (li.dataset.tags || '').split(' ').includes(val('tag'))));
    hits.sort((a, b) => val('sort') === 'old' ? a.dataset.date.localeCompare(b.dataset.date) : b.dataset.date.localeCompare(a.dataset.date));
    const pages = Math.max(1, Math.ceil(hits.length / per));
    const page = Math.min(Math.max(1, parseInt(val('page'), 10) || 1), pages);
    cards.forEach(li => { li.hidden = true; });
    hits.slice((page - 1) * per, page * per).forEach(li => { li.hidden = false; list.append(li); });

    // 개수 · 걸린 조건 · 빈 상태
    const total = $('[data-field="total"]', board);
    if (total) total.textContent = hits.length;
    const tagPill = $('[data-demo-pill="tag"]', board);
    if (tagPill && val('tag')) {
      $('span', tagPill).textContent = '#' + val('tag');
      tagPill.setAttribute('aria-label', `#${val('tag')} 조건 빼기`);
      tagPill.hidden = false;
    }
    const reset = $('.board-reset', board);
    if (reset) reset.hidden = !['category', 'cohort', 'tag', 'sort'].some(val);
    list.hidden = !hits.length;
    const empty = $('#boardEmpty');
    if (empty) empty.hidden = !!hits.length;

    // 조건 링크(?키=값): 지금 조건에 합쳐 쓰고(값이 비면 그 조건을 뺌, 조건을 바꾸면 1쪽부터), 지금 조건이면 표시
    const merge = set => {
      const next = new URLSearchParams(location.search);
      if (!set.has('page')) next.delete('page');
      set.forEach((v, k) => { if (v) next.set(k, v); else next.delete(k); });
      const q = next.toString();
      return q ? '?' + q : location.pathname.split('/').pop() || './';
    };
    $$('a[href^="?"]', board).forEach(a => {
      const set = new URLSearchParams(a.getAttribute('href').slice(1));
      a.setAttribute('href', merge(set));
      if (set.has('page') || !a.closest('.chips, .dropdown-menu, .sort')) return;
      const on = [...set].every(([k, v]) => val(k) === v);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
    $$('.dropdown', board).forEach(d => {
      const cur = $('.dropdown-menu a[aria-current]', d);
      if (cur) $('summary b', d).textContent = cur.textContent;
    });

    // 페이지 번호: 있는 쪽만 보이고, 지금 쪽 표시, 처음 · 끝에서는 화살표를 끔
    const pager = $('.pager', board);
    if (!pager) return;
    pager.hidden = pages < 2;
    $$('a[data-page]', pager).forEach(a => {
      const n = Number(a.dataset.page);
      a.hidden = n > pages;
      if (n === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $$('.pager-step', pager).forEach(s => {
      const to = page + Number(s.dataset.step);
      const ok = to >= 1 && to <= pages;
      const el = document.createElement(ok ? 'a' : 'span');
      el.className = s.className;
      el.dataset.step = s.dataset.step;
      el.innerHTML = s.innerHTML;
      if (ok) { el.href = merge(new URLSearchParams({ page: to })); el.setAttribute('aria-label', s.dataset.label); }
      else el.setAttribute('aria-hidden', 'true');
      el.dataset.label = s.dataset.label;
      s.replaceWith(el);
    });
  }
})();
