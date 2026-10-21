/* Check mobile layout uses the same content and document scroll as desktop.
   Only the chapter dock and process focus semantics need mobile-only setup. */
(() => {
  const mq = matchMedia('(max-width:600px)');
  const main = document.querySelector('.check-page');
  if (!main) return;
  const tabs = main.querySelector('.cm-tabs');
  const dock = main.querySelector('.cm-dock');
  const links = [...main.querySelectorAll('.cm-tabs a,.cm-dock a')];
  const sections = [...tabs.querySelectorAll('a')].map(a => document.getElementById(a.hash.slice(1)));
  const header = document.getElementById('siteHeader');
  let raf;
  function sync() {
    const mobile = mq.matches;
    const line = (header?.offsetHeight || 60) + 60;
    let current = 0;
    sections.forEach((section, index) => {
      if (section.getBoundingClientRect().top <= line) current = index;
    });
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) current = sections.length - 1;
    links.forEach(link => {
      if (link.hash === '#' + sections[current].id) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
    const visible = mobile && tabs.getBoundingClientRect().bottom <= line;
    dock.hidden = !visible; dock.classList.toggle('is-visible', visible);
  }
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(sync); };
  addEventListener('scroll', schedule, {passive:true});
  addEventListener('resize', schedule);
  const flow = main.querySelector('#procFlow');
  const cards = [...flow.querySelectorAll('.pf-card')];
  function syncFocus() {
    cards.forEach(card => { if (mq.matches) card.removeAttribute('tabindex'); else card.tabIndex = 0; });
  }
  mq.addEventListener('change', () => { syncFocus(); sync(); });
  syncFocus(); sync();
})();
