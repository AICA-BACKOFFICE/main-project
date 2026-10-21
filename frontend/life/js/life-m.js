/* Mobile LIFE controller. Keep routes, state and event handling here;
   source content and generated markup belong to life-m-view.js. */
(() => {
  'use strict';
  const host = document.querySelector('#main');
  const source = host.cloneNode(true);
  const state = {
    page: 'overview',
    chosenFloor: '23',
    chosenSpace: { '1': '0', '23': '0', '8': '0' },
    budget: 35,
    housingIndex: 0,
    foodType: 'food',
    foodGroup: 'all',
    foodNear: false,
    foodPage: 1,
    culture: 'walk',
    departure: 0,
  };
  const view = LifeMobileView.create(source, state);
  const life = view.data;
  const main = document.createElement('div');
  main.className = 'lm-content';
  host.append(main);
  const $ = (selector, parent = main) => parent.querySelector(selector);
  const $$ = (selector, parent = main) => [...parent.querySelectorAll(selector)];
  const reduce = matchMedia('(prefers-reduced-motion:reduce)');
  const railObservers = [];
  const aliases = { home: 'overview', facility: 'facilities', way: 'directions' };
  const paneRoutes = { home: 'overview', facility: 'facilities', tips: 'tips', way: 'directions' };

  function render() {
    railObservers.forEach(observer => observer.disconnect());
    railObservers.length = 0;
    const raw = Site.decodeHash(location.hash.slice(1));
    const target = source.querySelector('[id="' + CSS.escape(raw) + '"]');
    const topic = target?.closest('.tp-sec')?.id;
    const pane = target?.closest('.page')?.dataset.page;
    const next = topic || aliases[raw] || (view.screens[raw] ? raw : paneRoutes[pane]);
    // Contact, privacy and skip-link anchors preserve the current LIFE screen.
    if (!next && raw && main.childElementCount) return;
    state.page = next || paneRoutes[host.querySelector(':scope>.page:not([hidden])')?.dataset.page] || 'overview';
    const facility = target?.closest('.bx9-s');
    if (facility) {
      state.chosenFloor = facility.closest('.bx9-g').dataset.g;
      state.chosenSpace[state.chosenFloor] = facility.id.split('-').pop();
    }
    const area = target?.closest('.hzp');
    if (area) state.housingIndex = +area.dataset.i;

    main.innerHTML = (state.page.startsWith('tp-') ? view.topicNav(state.page) : '') + view.screens[state.page]();
    main.dataset.screen = state.page;
    wireRails();
    wireFacilities();
    if (state.page === 'tp-house') wireHousing();
    if (state.page === 'tp-food') renderFood();
    syncNav();
    // The original body remains available until rendering and binding succeed.
    host.classList.add('lm-ready');
  }

  function wireRails() {
    $$('.rail-wrap').forEach(wrapper => {
      const track = $('.rail', wrapper);
      const previous = $('.previous', wrapper);
      const next = $('.next', wrapper);
      const sync = () => {
        previous.hidden = track.scrollLeft < 4;
        next.hidden = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
      };
      const move = direction => track.scrollBy({ left: direction * track.clientWidth * .86, behavior: reduce.matches ? 'auto' : 'smooth' });
      previous.onclick = () => move(-1);
      next.onclick = () => move(1);
      track.addEventListener('scroll', sync, { passive: true });
      const observer = new ResizeObserver(sync);
      observer.observe(track);
      railObservers.push(observer);
      sync();
    });
  }

  function wireFacilities() {
    $$('.floor-card').forEach(card => card.addEventListener('toggle', () => {
      if (!card.open) return;
      state.chosenFloor = card.dataset.floor;
      $$('.floor-card').forEach(other => { if (other !== card) other.open = false; });
    }));
    $$('.photo-gallery').forEach(gallery => {
      const track = $('.photo-track', gallery);
      const move = direction => track.scrollBy({ left: direction * track.clientWidth, behavior: reduce.matches ? 'auto' : 'smooth' });
      $('.photo-prev', gallery).onclick = () => move(-1);
      $('.photo-next', gallery).onclick = () => move(1);
      const sync = () => {
        const index = Math.round(track.scrollLeft / track.clientWidth) || 0;
        $('.photo-caption', gallery).firstChild.textContent = track.children[index].getAttribute('aria-label') + ' ';
        $('.photo-caption b', gallery).textContent = (index + 1) + ' / ' + track.children.length;
        $('.photo-prev', gallery).disabled = index === 0;
        $('.photo-next', gallery).disabled = index === track.children.length - 1;
      };
      track.addEventListener('scroll', sync, { passive: true });
      sync();
    });
  }

  function wireHousing() {
    const track = $('.housing-rail .rail');
    track.scrollLeft = state.housingIndex * (track.clientWidth - 10);
    const sync = index => {
      state.housingIndex = index;
      $$('[data-area]').forEach(button => button.setAttribute('aria-pressed', String(+button.dataset.area === index)));
      $$('.hzmap-d').forEach(pin => {
        pin.classList.toggle('on', +pin.dataset.i === index);
        pin.setAttribute('aria-pressed', String(+pin.dataset.i === index));
      });
    };
    const select = index => {
      track.scrollTo({ left: $$('.housing-card')[index].offsetLeft - 20, behavior: reduce.matches ? 'auto' : 'smooth' });
      sync(index);
    };
    $$('[data-area]').forEach(button => { button.onclick = () => select(+button.dataset.area); });
    $$('.hzmap-d').forEach(pin => {
      pin.onclick = () => select(+pin.dataset.i);
      pin.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select(+pin.dataset.i);
        }
      };
    });
    track.addEventListener('scroll', () => {
      const midpoint = track.getBoundingClientRect().left + track.clientWidth / 2;
      let best = 0, distance = Infinity;
      $$('.housing-card').forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const difference = Math.abs(rect.left + rect.width / 2 - midpoint);
        if (difference < distance) { distance = difference; best = index; }
      });
      sync(best);
    }, { passive: true });
    sync(state.housingIndex);
    updateBudget();
  }

  function updateBudget() {
    const total = life.housing.filter(housing => {
      const rent = new DOMParser().parseFromString(housing.rentHtml, 'text/html').body.textContent;
      return +(/\d+/.exec(rent)?.[0] || Infinity) <= state.budget;
    }).length;
    $('#budget-value').textContent = state.budget + '만 원';
    $('#budget-result').textContent = '표시된 월세의 하한 기준 ' + total + '곳 · 집마다 차이가 있어요';
    $$('[data-budget]').forEach(button => button.setAttribute('aria-pressed', String(+button.dataset.budget === state.budget)));
  }

  function renderFood() {
    const matches = life.food.filter(food => food.type === state.foodType &&
      (state.foodGroup === 'all' || food.group === state.foodGroup) && (!state.foodNear || food.walkMinutes <= 10));
    const pages = Math.max(1, Math.ceil(matches.length / 8));
    state.foodPage = Math.min(state.foodPage, pages);
    $('#food-count').textContent = matches.length + '곳';
    $('#food-results').innerHTML = view.foodResults(matches);
    $('.pagination').innerHTML = view.foodPagination(pages);
    $$('[data-kind]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.kind === state.foodType)));
    $$('[data-food-group]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.foodGroup === state.foodGroup));
      if (button.dataset.foodGroup === 'solo') button.textContent = state.foodType === 'cafe' ? '혼자' : '혼밥';
    });
    $('#near').setAttribute('aria-pressed', String(state.foodNear));
  }

  function handleClick(event) {
    const button = event.target.closest('button');
    const facility = event.target.closest('[data-fac]');
    if (facility) {
      const [floor, space] = facility.dataset.fac.split('-');
      state.chosenFloor = floor;
      state.chosenSpace[floor] = space;
      if (state.page === 'facilities') render();
    }
    if (!button) return;
    if (button.dataset.spaceSelect) {
      const card = button.closest('.floor-card');
      state.chosenSpace[card.dataset.floor] = button.dataset.spaceSelect;
      $$('[data-space-select]', card).forEach(other => other.setAttribute('aria-pressed', String(other === button)));
      $$('.space-view', card).forEach(space => { space.hidden = space.dataset.space !== button.dataset.spaceSelect; });
    }
    if (button.dataset.budget) { state.budget = +button.dataset.budget; updateBudget(); }
    if (button.dataset.kind) { state.foodType = button.dataset.kind; state.foodPage = 1; renderFood(); }
    if (button.dataset.foodGroup) { state.foodGroup = button.dataset.foodGroup; state.foodPage = 1; renderFood(); }
    if (button.id === 'near') { state.foodNear = !state.foodNear; state.foodPage = 1; renderFood(); }
    if (button.dataset.foodPage) {
      state.foodPage = +button.dataset.foodPage;
      renderFood();
      $('#food-count').tabIndex = -1;
      $('#food-count').focus({ preventScroll: true });
      $('.food-kind').scrollIntoView({ block: 'start', behavior: reduce.matches ? 'auto' : 'smooth' });
    }
    if (button.hasAttribute('data-reset-food')) { state.foodGroup = 'all'; state.foodNear = false; state.foodPage = 1; renderFood(); }
    if (button.dataset.culture) {
      state.culture = button.dataset.culture;
      $$('[data-culture]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
      $$('[data-culture-group]').forEach(group => { group.hidden = group.dataset.cultureGroup !== state.culture; });
    }
    if (button.dataset.departure) {
      state.departure = +button.dataset.departure;
      $$('[data-departure]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
      $('#route-content').innerHTML = view.routeCard();
    }
    if (button.classList.contains('copy-address')) copyAddress();
  }

  async function copyAddress() {
    const address = view.text('.ad>div>b');
    try { await navigator.clipboard.writeText(address); Site.toast('주소를 복사했어요'); }
    catch { Site.toast(address); }
  }
  main.addEventListener('click', handleClick);

  const nav = document.querySelector('#siteLnb');
  if (nav) nav.querySelectorAll('.lnb-list>li>a').forEach(link => {
    const full = document.createElement('span');
    full.className = 'lm-nav-full'; full.textContent = link.textContent;
    const short = document.createElement('span');
    short.className = 'lm-nav-short';
    short.textContent = ({ overview: '전체', facilities: '시설', tips: '생활 꿀팁', directions: '오시는 길' })[link.dataset.sub] || link.textContent;
    link.replaceChildren(full, short);
  });
  const dock = document.createElement('nav');
  dock.className = 'lm-dock';
  dock.setAttribute('aria-label', '인사교 라이프 빠른 이동');
  if (nav) { dock.append(nav.querySelector('.lnb-list').cloneNode(true)); document.body.append(dock); }

  function syncNav() {
    const group = state.page.startsWith('tp-') ? 'tips' : state.page;
    [nav, dock].filter(Boolean).forEach(menu => menu.querySelectorAll('.lnb-list>li>a').forEach(link => {
      const id = link.hash.slice(1);
      const selected = (id === 'overview' && group === 'overview') || id === group;
      if (selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }));
  }
  if (nav) {
    const observer = new IntersectionObserver(entries => {
      document.body.classList.toggle('lm-docked', !entries[0].isIntersecting && nav.getBoundingClientRect().top < 0);
    }, { rootMargin: '-60px 0px 0px 0px' });
    observer.observe(nav);
  }
  addEventListener('hashchange', render);
  render();
})();
