/* Mobile review projection for the published static/Spring markup.
   Owns category/cohort/tag filters, ten-card pages and canonical modal links.
   Loaded before stories-m.js on new pages; the legacy entry can load it on demand. */
const StoriesMobileReviews = (() => {
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  function el(tag, cls, text){
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function cleanClone(node){
    if (!node) return null;
    var copy = node.cloneNode(true);
    copy.removeAttribute('id');
    $$('[id]', copy).forEach(function(n){ n.removeAttribute('id'); });
    return copy;
  }
  function tabButton(group, text, active, action){
    var b = el('button', '', text); b.type = 'button';
    b.setAttribute('aria-pressed', String(active));
    b.addEventListener('click', action);
    group.appendChild(b); return b;
  }
  function tabs(label){
    var group = el('div', 'sm-filter-tabs');
    group.setAttribute('role', 'group'); group.setAttribute('aria-label', label);
    return group;
  }

  function initReviews(){
    var section = $('#p-rev'), source = section && $('.idgrid', section);
    if (!source || $('.sm-reviews', section)) return;
    var cards = $$('.idc', source);
    if (!cards.length) return; // Keep the server's published-empty state.
    var box = el('section', 'sm-reviews'); box.setAttribute('aria-label', '후기 목록');
    var categories = tabs('후기 카테고리'), cohorts = tabs('후기 기수');
    cohorts.classList.add('sm-cohort-chips');
    var count = el('p', 'sm-review-count'); count.setAttribute('role', 'status');
    var board = el('div', 'sm-review-board');
    var empty = el('div', 'sm-review-empty', '선택한 조건에 맞는 후기가 없습니다.');
    var pager = el('nav', 'sm-review-pager cpager'); pager.setAttribute('aria-label', '후기 페이지');
    var category = 'all', cohort = '', page = 1, tag = '', pageSize = 10;
    var entries = cards.map(function(card){
      var note = el('a', 'sm-review-note');
      note.href = card.getAttribute('href'); note.setAttribute('aria-haspopup', 'dialog');
      var summary = el('div', 'sm-review-summary');
      var bar = cleanClone($('.cbar', card)); if (bar) summary.appendChild(bar);
      summary.appendChild(el('h3', '', ($('h3', card) || {}).textContent || ''));
      summary.appendChild(el('span', 'sm-review-preview', ($('.in > p', card) || {}).textContent || ''));
      note.appendChild(summary);
      var footer = el('div', 'sm-review-by');
      footer.appendChild(el('b', '', ($('.who b', card) || {}).textContent || ''));
      var tg = $('.who .tg', card); if (tg) footer.appendChild(el('span', 'sm-review-tag', tg.textContent));
      note.appendChild(footer);
      var cl = Array.from(card.classList);
      var co = cl.find(function(c){ return /^coh\d+$/.test(c); });
      return {node:note, cohort:co ? co.slice(3) : '', classes:cl};
    });
    var categoryNames = [['all','전체'],['life','생활'],['class','수업'],['proj','프로젝트'],['job','취업'],['path','진로']];
    categoryNames.forEach(function(c){
      tabButton(categories, c[1], c[0] === category, function(){
        category = c[0]; page = 1;
        // Keep the original radio/link contract for desktop filters and Spring.
        var radio = $('#rc_' + category, section);
        if (radio){ radio.checked = true; radio.dispatchEvent(new Event('change', {bubbles:true})); }
        refresh();
      }).dataset.value = c[0];
    });
    [''].concat(Array.from(new Set(entries.map(function(e){ return e.cohort; }))).filter(Boolean).sort(function(a,b){ return +b - +a; })).forEach(function(c){
      tabButton(cohorts, c ? c + '기' : '전체', c === cohort, function(){
        cohort = c; page = 1; refresh();
      }).dataset.value = c;
    });
    function pageButton(text, value, disabled){
      var b = el('button', '', text); b.type = 'button'; b.disabled = disabled;
      b.setAttribute('aria-label', text === '←' ? '이전 페이지' : text === '→' ? '다음 페이지' : value + '페이지');
      if (String(value) === text && page === value) b.setAttribute('aria-current', 'page');
      b.addEventListener('click', function(){
        page = value; refresh();
        var active = $('button[aria-current="page"]', pager); if (active) active.focus({preventScroll:true});
        box.scrollIntoView({block:'start',behavior:reduce.matches ? 'auto' : 'smooth'});
      }); return b;
    }
    function refresh(){
      $$('button', categories).forEach(function(b){ b.setAttribute('aria-pressed', String(b.dataset.value === category)); });
      $$('button', cohorts).forEach(function(b){ b.setAttribute('aria-pressed', String(b.dataset.value === cohort)); });
      var matching = entries.filter(function(e){
        return (category === 'all' || e.classes.indexOf('cat-' + category) >= 0) && (!cohort || e.cohort === cohort) && (!tag || e.classes.indexOf('tg' + tag) >= 0);
      });
      var total = Math.max(1, Math.ceil(matching.length / pageSize)); page = Math.min(page, total);
      count.textContent = matching.length + '개의 후기';
      board.replaceChildren();
      matching.slice((page - 1) * pageSize, page * pageSize).forEach(function(e){ board.appendChild(e.node); });
      if(!matching.length&&typeof StoryState!=='undefined')StoryState.render(empty,'filter',{subject:'후기',onReset:function(){
        StoryState.resetReviews(section);categories.querySelector('button').focus({preventScroll:true});
      }});
      empty.hidden = matching.length > 0; board.hidden = !matching.length;
      pager.replaceChildren(); pager.hidden = !matching.length;
      if (matching.length){
        pager.appendChild(pageButton('←', page - 1, page === 1));
        var start = Math.max(1, Math.min(page - 2, total - 4));
        for (var n = start; n <= Math.min(total, start + 4); n++) pager.appendChild(pageButton(String(n), n, false));
        pager.appendChild(pageButton('→', page + 1, page === total));
      }
    }
    function fromHash(){
      var hash = /^#tg-([0-6])$/.exec(location.hash);
      if (hash){ tag = hash[1]; page = 1; }
      else if (!/^#r-/.test(location.hash)) tag = '';
      refresh();
    }
    box.append(categories, cohorts, count, board, empty, pager); source.before(box);
    // Hide the legacy controls as a group on mobile, including integration-only pager styles.
    ['.filters', '.idgrid', '.rvlist', '.pager'].forEach(function(selector){
      var original = $(selector, section);
      if (!original) return;
      var wrapper = el('div', 'sm-review-source'); original.before(wrapper); wrapper.appendChild(original);
    });
    section.classList.add('sm-review-ready');
    section.addEventListener('reviews:reset',function(){category='all';cohort='';tag='';page=1;refresh();});
    section.addEventListener('change', function(e){
      if (e.target.name === 'rc'){ category = e.target.id.slice(3); page = 1; refresh(); }
    });
    addEventListener('hashchange', fromHash); fromHash();
  }

  return { init: initReviews };
})();
