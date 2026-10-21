/* Spring-rendered reviews: intersection filters and paging over the published snapshot only. */
(function () {
  'use strict';
  if (document.documentElement.dataset.reviewSource !== 'spring') return;
  const section = document.getElementById('p-rev');
  const cards = Array.from(section.querySelectorAll('.idc'));
  const rows = Array.from(section.querySelectorAll('.rvr'));
  const pager = section.querySelector('[data-review-pager]');
  const cohorts = section.querySelector('[data-review-cohorts]');
  let page = 1, cohort = '', tag = '';
  const pageSize = 12;
  const cohortOf = card => Array.from(card.classList).find(c => /^coh\d+$/.test(c))?.slice(3) || '';
  const empty = document.createElement('div');
  empty.className = 'story-state--desktop';
  empty.setAttribute('data-review-filter-empty','');
  empty.textContent = '선택한 조건에 맞는 후기가 없습니다.';
  empty.setAttribute('role', 'status'); empty.hidden = true;
  pager.before(empty);
  function cohortButton(value) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = value ? value + '기' : '전체';
    button.setAttribute('aria-pressed', String(value === cohort));
    button.addEventListener('click', () => {
      cohort = value; page = 1;
      cohorts.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      const summary = section.querySelector('.dw-fco summary b'); summary.textContent = value ? value + '기' : '기수';
      section.querySelector('.dw-fco').open = false; refresh();
    });
    return button;
  }
  cohorts.append(cohortButton(''));
  Array.from(new Set(cards.map(cohortOf))).filter(Boolean).sort((a,b) => Number(b)-Number(a)).forEach(c => cohorts.append(cohortButton(c)));
  function pageButton(label, value, disabled) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.disabled = disabled;
    if (String(value) === label && value === page) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => { page = value; refresh(); section.querySelector('.filters').scrollIntoView({block:'start',behavior:'smooth'}); });
    return button;
  }
  function refresh() {
    const selected = section.querySelector('input[name="rc"]:checked')?.id.slice(3) || 'all';
    const hash = /^#tg-([0-6])$/.exec(location.hash);
    // Keep the tag while reading a modal; closing to #p-rev resets it.
    if (hash) tag = hash[1]; else if (!/^#r-/.test(location.hash)) tag = '';
    const matching = cards.map((card,index) => ({card,index})).filter(({card}) =>
      (selected === 'all' || card.classList.contains('cat-' + selected)) &&
      (!cohort || cohortOf(card) === cohort) && (!tag || card.classList.contains('tg' + tag)));
    const total = Math.max(1, Math.ceil(matching.length / pageSize)); page = Math.min(page,total);
    const visible = new Set(matching.slice((page-1)*pageSize,page*pageSize).map(item => item.index));
    cards.forEach((card,index) => { card.hidden = !visible.has(index); if (rows[index]) rows[index].hidden = card.hidden; });
    if(cards.length&&!matching.length&&typeof StoryState!=='undefined')StoryState.render(empty,'filter',{subject:'후기',onReset:()=>{
      StoryState.resetReviews(section);section.querySelector('.dw-fco summary').focus({preventScroll:true});
    }});
    empty.hidden = !cards.length || matching.length > 0;
    pager.replaceChildren(); pager.hidden = matching.length <= pageSize;
    if (!pager.hidden) {
      pager.append(pageButton('‹', page - 1, page === 1));
      // Bound the number of controls even when the DB grows beyond the old five pages.
      const start = Math.max(1, Math.min(page - 2, total - 4));
      for (let n=start; n<=Math.min(total,start+4); n++) pager.append(pageButton(String(n), n, false));
      pager.append(pageButton('›', page + 1, page === total));
    }
  }
  section.addEventListener('reviews:reset',()=>{
    cohort='';tag='';page=1;
    cohorts.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.textContent==='전체')));
    section.querySelector('.dw-fco summary b').textContent='기수';refresh();
  });
  section.addEventListener('change', event => { if (event.target.name === 'rc') { page=1; refresh(); } });
  window.addEventListener('hashchange', () => { if (/^#tg-/.test(location.hash) || location.hash === '#p-rev') page=1; refresh(); });
  if (document.body.dataset.previewAnchor) location.hash = document.body.dataset.previewAnchor;
  refresh();
})();
