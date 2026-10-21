// 인사교 백오피스 편집 캔버스.
// 실제 페이지 안에서 실행되어 텍스트·이미지를 그 자리에서 고치고, 원본 HTML(모델)에 같은 변경을 기록합니다.
// 페이지 스크립트(defer)보다 먼저 실행되므로, 스크립트가 바꾸기 전의 깨끗한 DOM을 모델로 복사해 둡니다.
(() => {
  'use strict';

  const shell = (() => {
    try { return window.parent !== window ? window.parent.BOShell?.connect(window) || null : null; } catch { return null; }
  })();

  // ── 1. 편집 중에는 '동작 줄이기' 상태로 실행해 모든 내용이 최종 위치에 고정되게 합니다. ──
  const nativeMatchMedia = window.matchMedia.bind(window);
  const fixedQuery = (media, matches) => ({
    media, matches, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    dispatchEvent() { return false; }
  });
  window.matchMedia = query => {
    if (/prefers-reduced-motion\s*:\s*reduce/i.test(query)) return fixedQuery(query, true);
    if (/prefers-reduced-motion\s*:\s*no-preference/i.test(query)) return fixedQuery(query, false);
    return nativeMatchMedia(query);
  };

  // 사이트별 설정(site.config.json): 잠글 곳(locked), 누를 수 없게 할 곳(inert), 글꼴·색 목록, 편집을 시작한 원본 글(source)
  const PAGE = window.__BO_PAGE__ || {};

  // ── 2. 모든 요소에 번호를 붙이고, 같은 번호를 가진 원본 모델을 만듭니다. ──
  // 모델은 서버가 준 원본 글(PAGE.source)을 읽어 만들고, 화면 요소와 원본 요소를 차례대로 짝지어 같은 번호를 붙입니다.
  // 브라우저 확장 프로그램이 페이지를 읽는 도중 끼워 넣은 요소는 원본에 짝이 없어 번호가 없고(편집 대상 아님),
  // 확장 프로그램이 붙인 속성도 모델에는 없으니 저장되는 글에 섞이지 않습니다.
  const EXTENSION_URL = /^\s*(?:chrome|moz|safari-web|safari|ms-browser|edge)-extension:/i;
  const fromExtension = el => ['src', 'href'].some(name => EXTENSION_URL.test(el.getAttribute(name) || ''));
  // 예전에 확장 프로그램 태그가 섞여 저장된 글이면 그 태그를 걷어 낸 글을 원본으로 씁니다(다음 저장 때 깨끗해집니다).
  const EXTENSION_TAG = /<([a-z][\w-]*)\b[^>]*?\s(?:src|href)\s*=\s*["']?\s*(?:chrome|moz|safari-web|safari|ms-browser|edge)-extension:[^>]*>(?:<\/\1\s*>)?/gi;
  const SOURCE = typeof PAGE.source === 'string' ? PAGE.source.replace(EXTENSION_TAG, '') : null;
  let nextId = 1;
  const model = document.implementation.createHTMLDocument('');
  const original = parseSource(SOURCE);
  if (original) {
    pairUp(document.documentElement, original.documentElement);
    model.replaceChild(model.importNode(original.documentElement, true), model.documentElement);
  } else {
    // 원본 글을 받지 못하면(예전 서버) 화면을 그대로 복사하되, 끼워 넣은 것이 분명한 요소는 뺍니다.
    // <html> 바로 아래에는 <head>와 <body>만 생기므로 그 밖의 요소는 페이지를 읽은 뒤 끼워 넣은 것입니다.
    const foreign = el => el.hasAttribute('data-bo-internal') || fromExtension(el)
      || (el.parentElement === document.documentElement && el !== document.head && el !== document.body);
    for (const el of document.getElementsByTagName('*')) {
      const parent = el.parentElement;
      if (foreign(el) || (parent && !parent.hasAttribute('data-bo-id'))) continue;
      el.setAttribute('data-bo-id', String(nextId++));
    }
    model.replaceChild(model.importNode(document.documentElement, true), model.documentElement);
    for (const node of model.querySelectorAll('*:not([data-bo-id])')) node.remove();
  }

  function parseSource(text) {
    if (typeof text !== 'string' || !text) return null;
    try {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      for (const el of [...doc.querySelectorAll('[src], [href]')]) if (fromExtension(el)) el.remove();
      return doc;
    } catch {
      return null;
    }
  }

  // 같은 태그여야 짝이 되고, id·class·주소까지 같을수록 더 잘 맞는 짝입니다.
  function likeness(a, b) {
    if (a.localName !== b.localName || a.namespaceURI !== b.namespaceURI) return 0;
    let score = 1;
    if (a.id === b.id) score += 4;
    if (a.getAttribute('class') === b.getAttribute('class')) score += 2;
    if (a.getAttribute('src') === b.getAttribute('src') && a.getAttribute('href') === b.getAttribute('href')) score += 2;
    return score;
  }

  // 화면 요소와 원본 요소에 같은 번호를 붙이고, 자식들은 가장 잘 맞는 차례(가중 LCS)로 짝지어 내려갑니다.
  function pairUp(liveEl, sourceEl) {
    const id = String(nextId++);
    liveEl.setAttribute('data-bo-id', id);
    sourceEl.setAttribute('data-bo-id', id);
    const a = [...liveEl.children].filter(el => !el.hasAttribute('data-bo-internal') && !fromExtension(el));
    const b = [...sourceEl.children];
    // 보통은 화면과 원본이 똑같으므로 그대로 짝짓습니다.
    if (a.length === b.length && a.every((el, i) => el.localName === b[i].localName && el.id === b[i].id)) {
      a.forEach((el, i) => pairUp(el, b[i]));
      return;
    }
    const n = a.length;
    const m = b.length;
    const best = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        const score = likeness(a[i], b[j]);
        best[i][j] = Math.max(best[i + 1][j], best[i][j + 1], score ? best[i + 1][j + 1] + score : 0);
      }
    }
    for (let i = 0, j = 0; i < n && j < m;) {
      const score = likeness(a[i], b[j]);
      if (score && best[i][j] === best[i + 1][j + 1] + score) pairUp(a[i++], b[j++]);
      else if (best[i + 1][j] >= best[i][j + 1]) i++;
      else j++;
    }
  }

  const idOf = el => (el && el.nodeType === 1 && el.getAttribute('data-bo-id')) || null;
  const byId = (doc, id) => (id ? doc.querySelector(`[data-bo-id="${id}"]`) : null);
  const live = id => byId(document, id);
  const mod = id => byId(model, id);
  const isInternal = node => Boolean(node && node.nodeType === 1 && node.closest('[data-bo-internal]'));
  const short = (text, max = 16) => {
    const value = (text || '').replace(/\s+/g, ' ').trim();
    return value.length > max ? `${value.slice(0, max)}…` : value;
  };
  const toast = (message, type) => shell?.toast(message, type);
  const escapeHTML = text => String(text ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

  const listOf = value => (Array.isArray(value) ? value.filter(Boolean) : []);
  const withExtra = (base, extra) => [base, ...listOf(extra)].filter(Boolean).join(', ');

  // ── 3. 이 페이지에 맞춘 요소 이름 ──
  const NAMES = [
    ['.chk-crit > div', '기본 대상 칸'],
    ['.chk-list > li', '체크 항목'],
    ['.chk-text', '체크 항목 글자'],
    ['.pf-col', '단계'],
    ['.pf-card', '단계 카드'],
    ['.ben-card', '혜택 카드'],
    ['.ben-ico', '혜택 아이콘'],
    ['.faq-item', '질문'],
    ['.faq-qt', '질문 글자'],
    ['.faq-at', '답변'],
    ['.faq-cta', '문의 안내'],
    ['.chk-notice', '안내 상자'],
    ['.next-band a', '다음으로 링크'],
    ['.platform-icon', '아이콘 그림'],
    ['.common-course-icon', '교과목 아이콘'],
    ['.cohort-topic-art img', '분야 아이콘'],
    ['.partner-logo img', '기관 로고'],
    ['.activity-gallery-slide', '갤러리 사진'],
    ['.activity-gallery-info', '갤러리 설명'],
    ['.common-course-card', '교과목 카드'],
    ['.activity-project-card', '프로젝트 카드'],
    ['.activity-project-player', '프로젝트 영상'],
    ['.activity-project-tags > li', '기술 태그'],
    ['.cohort-card', '기수 비교 카드'],
    ['.cohort-topics > li', '교육 분야'],
    ['.cohort-fact', '비교 항목'],
    ['.career-stage-card', '취업 지원 카드'],
    ['.why-school-card', '강점 카드'],
    ['.why-school-highlights > li', '강점 요약'],
    ['.why-school-career-tile', '지원 타일'],
    ['.partner-node', '기관'],
    ['.eligibility-condition', '지원 대상'],
    ['.intro-news-card', '기사 카드'],
    ['.intro-platform-features > article', '교육 특징'],
    ['.education-time-stages > li', '교육 단계'],
    ['.daily-routine-agenda > li', '하루 일과'],
    ['.daily-routine-weekdays > li', '요일'],
    ['.gnb-submenu > a', '메뉴'],
    ['.chapter-links > a', '목차'],
    ['.section-navigation li', '목차'],
    ['.site-header', '상단 메뉴'],
    ['.about-footer', '하단 정보'],
    ['.immersive-hero', '표지'],
    ['.scene-background', '표지 배경'],
    ['.hero-masthead', '표지 제목'],
    ['.scene-copy', '표지 문구']
  ];
  const TAG_NAMES = {
    h1: '큰 제목', h2: '제목', h3: '제목', h4: '소제목', h5: '소제목', h6: '소제목', p: '문단', li: '목록 항목',
    ul: '목록', ol: '목록', article: '카드', figure: '그림', figcaption: '사진 설명', img: '이미지', a: '링크',
    span: '텍스트', strong: '굵은 텍스트', em: '강조 텍스트', small: '작은 텍스트', b: '텍스트', dt: '항목 이름',
    dd: '항목 값', dl: '항목 목록', header: '머리글', footer: '바닥글', nav: '메뉴', time: '날짜', svg: '아이콘',
    code: '코드', button: '버튼', div: '영역', main: '본문', i: '장식', iframe: '영상', blockquote: '인용'
  };
  function describe(el) {
    if (!el) return '';
    for (const [selector, name] of NAMES) if (el.matches(selector)) return name;
    const tag = el.tagName.toLowerCase();
    // 글자 없이 아이콘만 감싼 작은 틀
    if ((tag === 'span' || tag === 'i') && !el.textContent.trim() && el.querySelector('svg, img')) return '아이콘 틀';
    if (tag === 'section') {
      const heading = el.querySelector('h1, h2, h3');
      return heading ? `섹션 · ${short(heading.textContent, 14)}` : '섹션';
    }
    return TAG_NAMES[tag] || tag;
  }

  const labelFor = (el, kind) => {
    if (kind === 'bg' && !NAMES.some(([selector]) => el.matches(selector))) {
      const rect = el.getBoundingClientRect();
      return rect.width && rect.width <= 240 && rect.height <= 240 ? '아이콘' : '배경 이미지';
    }
    if (kind === 'graphic') return '아이콘';
    return describe(el);
  };

  // ── 4. 클릭한 위치가 무엇인지 판별 ──
  const PASS = 'button, input, select, textarea, label, summary';
  const LOCKED = withExtra('.activity-gallery-category, .activity-gallery-dots, .activity-gallery-filters, .activity-gallery-arrows, .skip', PAGE.locked);
  // 페이지 기능이 내용을 자동으로 채우는 곳(분류 버튼·검색 등): 편집 화면에서는 누르지도 고르지도 못하게 합니다.
  // inertNotices: 곳마다 따로 보여 줄 안내([선택자, 안내] — 예: 선배들의 이야기 글 목록은 '게시물 관리'에서 고친다는 안내)
  const INERT_NOTICES = (Array.isArray(PAGE.inertNotices) ? PAGE.inertNotices : []).filter(n => Array.isArray(n) && n.length === 2 && n[0]);
  const INERT = listOf(PAGE.inert).concat(INERT_NOTICES.map(n => n[0])).join(', ');
  const inertNoticeFor = el => {
    for (const [selector, notice] of INERT_NOTICES) {
      try { if (el?.closest?.(selector)) return notice; } catch { /* 잘못된 선택자는 건너뜀 */ }
    }
    return PAGE.inertNotice || '이 부분은 페이지 내용에 맞춰 자동으로 채워지는 곳이라 편집 화면에서는 누를 수 없어요. 동작은 ‘미리보기’에서 확인해 주세요.';
  };
  const inertOf = el => (INERT && el?.closest ? el.closest(INERT) : null);
  // 버튼·체크 항목(label) 안에 있어도 그 자리에서 고칠 수 있는 글자 칸
  const CONTROL_TEXT = withExtra('[data-field]:not([data-field="count"])', PAGE.controlText);
  // 글자만 쓰는 칸: 페이지 스크립트가 글자만 다시 그리는 곳(data-text 사본이 있는 질문 등)은 서식·줄바꿈을 넣지 않습니다.
  const PLAIN = '.activity-gallery-caption, .activity-gallery-description, time, [data-text]';
  const NON_TEXT = 'svg, img, iframe, video, script, style, template, button, input, select, textarea';
  const isInline = el => {
    const display = getComputedStyle(el).display;
    return display === 'inline' || display === 'contents';
  };
  const hasBackgroundImage = el => /url\(/.test(getComputedStyle(el).backgroundImage);

  function hasOwnText(block) {
    for (const node of block.childNodes) {
      if (node.nodeType === 3 && node.data.trim()) return true;
      if (node.nodeType === 1 && !node.matches(NON_TEXT) && isInline(node) && hasOwnText(node)) return true;
    }
    return false;
  }

  const EMPTY_TEXT_TAGS = 'p, h1, h2, h3, h4, h5, h6, li, dt, dd, figcaption, blockquote';
  // 페이지 전체를 감싸는 틀: 선택·이동 대상이 아닙니다.
  const PAGE_LEVEL = withExtra('html, body, main, .about-paper, .scene-runway', PAGE.pageLevel);
  // inControl: 버튼·label 안의 글자 칸. 바깥 버튼까지 넓히지 않고 그 칸만 편집합니다.
  function textBlockOf(el, { inControl = false } = {}) {
    let node = el;
    if (!inControl) while (node.parentElement && node.parentElement !== document.body && isInline(node)) node = node.parentElement;
    if (!idOf(node) || node === document.body || node.closest(LOCKED) || inertOf(node) || node.closest(inControl ? 'svg' : 'button, svg')) return null;
    // 글자를 모두 지운 문단·제목도 다시 입력할 수 있게 글자 요소로 봅니다.
    const emptyText = node.matches(EMPTY_TEXT_TAGS) && !node.matches('[aria-live]') && !node.textContent.trim() && ![...node.children].some(child => !child.matches('br'));
    if (!hasOwnText(node) && !emptyText) return null;
    // 페이지 스크립트가 실행 중에 만든 요소가 섞여 있으면 원본과 맞지 않으므로 편집하지 않습니다.
    for (const child of node.getElementsByTagName('*')) if (!idOf(child)) return null;
    return node;
  }

  // 버튼·체크 항목(label) 안의 글자 칸(질문 글자, 체크 항목 글자 등)이면 그 칸을 돌려줍니다.
  function controlTextOf(el) {
    const field = el.closest?.(CONTROL_TEXT);
    if (!field || !field.parentElement?.closest(PASS)) return null;
    return textBlockOf(field, { inControl: true });
  }

  function boxOf(el) {
    let node = el.closest('svg')?.parentElement || el;
    while (node && node !== document.body && (!idOf(node) || isInline(node))) node = node.parentElement;
    return node && node !== document.body && node !== document.documentElement ? node : null;
  }

  function resolveAt(x, y) {
    const stack = document.elementsFromPoint(x, y)
      .filter(el => !isInternal(el) && el !== document.documentElement && el !== document.body);
    const top = stack[0];
    if (!top) return null;
    const inert = inertOf(top);
    if (inert) return { kind: 'inert', el: inert };
    if (top.closest(LOCKED)) return { kind: 'pass', el: top };
    if (top.closest(PASS)) {
      const field = controlTextOf(top);
      return field ? { kind: 'text', el: field } : { kind: 'pass', el: top };
    }
    const svg = top.closest('svg');
    if (!svg) {
      const block = textBlockOf(top);
      if (block) return { kind: 'text', el: block };
    }
    if (top.tagName === 'IMG' && idOf(top)) return { kind: 'image', el: top };
    if (svg && idOf(svg)) return { kind: 'graphic', el: svg };
    for (const el of stack) {
      if (el.tagName === 'IMG' && idOf(el)) return { kind: 'image', el };
      if (idOf(el) && hasBackgroundImage(el)) return { kind: 'bg', el };
      if (el.matches('section, main, header, footer')) break;
    }
    const box = boxOf(top);
    // 페이지 전체를 감싼 큰 틀은 선택하지 않고, 빈 곳을 누른 것으로 봅니다(PPT에서 빈 곳을 누르면 선택이 풀리는 것처럼).
    if (!box || box.matches(PAGE_LEVEL)) return { kind: 'empty', el: null };
    return { kind: 'box', el: box };
  }

  function kindFor(el) {
    if (el.tagName === 'IMG') return 'image';
    if (el.tagName.toLowerCase() === 'svg') return 'graphic';
    if (textBlockOf(el) === el || controlTextOf(el) === el) return 'text';
    if (hasBackgroundImage(el)) return 'bg';
    return 'box';
  }

  // 복제·삭제·이동의 단위: 비슷한 형제가 있는 가장 가까운 요소(카드, 목록 항목, 문단 등)
  const TAG_ONLY = new Set(['LI', 'P', 'DT', 'DD']);
  const signature = el => (TAG_ONLY.has(el.tagName) ? el.tagName : `${el.tagName}.${el.classList[0] || ''}`);
  function isRepeatable(el) {
    const parent = el.parentElement;
    if (!parent || isInline(el)) return false;
    const sig = signature(el);
    return [...parent.children].some(sibling => sibling !== el && idOf(sibling) && signature(sibling) === sig);
  }
  const currentSlide = () => document.querySelector('.activity-gallery-slide[data-gallery-position="current"]');
  function itemFor(el) {
    if (el.closest('.activity-gallery-info')) return currentSlide() || el;
    for (let node = el; node && node !== document.body && !node.matches(PAGE_LEVEL); node = node.parentElement) {
      if (idOf(node) && isRepeatable(node)) return node;
      if (node.matches('section')) break;
    }
    return el;
  }
  const slideFor = el => el.closest('.activity-gallery-slide') || (el.closest('.activity-gallery-info') ? currentSlide() : null);

  // 움직이는 띠처럼 같은 내용을 여러 번 반복한 묶음은 함께 고칩니다.
  const MIRROR_GROUPS = ['.why-school-stack-track > .why-school-stack-group'];
  const childIndex = el => [...el.parentElement.children].indexOf(el);
  const pathOf = el => {
    const path = [];
    for (let node = el; node && node.parentElement; node = node.parentElement) path.unshift(childIndex(node));
    return path;
  };
  const atPath = (doc, path) => path.reduce((node, index) => node?.children[index] || null, doc.documentElement);
  function mirrorsOf(m) {
    for (const selector of MIRROR_GROUPS) {
      const group = m.closest(selector);
      if (!group || group === m) continue;
      const relative = [];
      for (let node = m; node !== group; node = node.parentElement) relative.unshift(childIndex(node));
      return [...group.parentElement.children]
        .filter(other => other !== group && other.matches(selector))
        .map(other => relative.reduce((node, index) => node?.children[index] || null, other))
        .filter(Boolean);
    }
    return [];
  }

  // ── 5. 모델 저장 ──
  function applySaveRules() {
    // 갤러리 분류의 사진 수와 첫 화면 설명을 실제 사진 목록에 맞춥니다.
    const gallery = model.querySelector('.activity-gallery');
    if (!gallery) return;
    const slides = [...gallery.querySelectorAll('.activity-gallery-slide')];
    for (const filter of gallery.querySelectorAll('[data-gallery-category]')) {
      const count = slides.filter(slide => slide.getAttribute('data-category') === filter.getAttribute('data-gallery-category')).length;
      const badge = filter.querySelector('span');
      if (badge) badge.textContent = String(count);
      filter.toggleAttribute('hidden', count === 0);
    }
    // 처음 보이는 분류: 원본에서 눌려 있는 분류 버튼(aria-pressed="true"). 없으면 오리엔테이션 → 첫 사진
    const pressed = gallery.querySelector('[data-gallery-category][aria-pressed="true"]')?.getAttribute('data-gallery-category') || 'orientation';
    const first = slides.find(slide => slide.getAttribute('data-category') === pressed) || slides[0];
    const caption = gallery.querySelector('.activity-gallery-caption');
    const description = gallery.querySelector('.activity-gallery-description');
    if (first && caption) caption.textContent = first.getAttribute('data-title') || '';
    if (first && description) description.textContent = first.getAttribute('data-description') || '';
  }

  // 관련 기관 카드 수가 바뀌면 칸 수와 연결선을 카드 수에 맞게 다시 그립니다(4개일 때는 원본 그대로).
  function applyPartnerRules() {
    const network = model.querySelector('.partner-network');
    const list = network?.querySelector('.partner-network-children');
    if (!list) return;
    const count = [...list.children].filter(child => child.matches('li')).length;
    if (!count) return;
    setStyleProp(list, '--partner-columns', count === 4 ? null : String(count));
    const round = value => String(Math.round(value * 100) / 100);
    const desktop = network.querySelector('.partner-wires-desktop');
    if (desktop && desktop.querySelectorAll('path').length !== count) {
      desktop.innerHTML = Array.from({ length: count }, (_, index) => {
        const x = round((index + 0.5) * 1000 / count);
        return `<path d="M500 0 C500 55 ${x} 40 ${x} 100"></path>`;
      }).join('');
    }
    const mobile = network.querySelector('.partner-wires-mobile');
    if (mobile && mobile.querySelectorAll('path').length !== count) {
      // 모바일은 2칸 배치: 카드 높이 184px, 간격 24px, 위 여백 60px(사이트 CSS 값)
      const rows = Math.ceil(count / 2);
      const height = 60 + rows * 184 + (rows - 1) * 24;
      mobile.setAttribute('viewBox', `0 0 1000 ${height}`);
      setStyleProp(mobile, 'height', height === 452 ? null : `${height}px`);
      mobile.innerHTML = Array.from({ length: count }, (_, index) => {
        const y = 60 + Math.floor(index / 2) * 208 + 92;
        return `<path d="M500 0 V${y} H${index % 2 ? 750 : 250}"></path>`;
      }).join('');
    }
  }

  // 'STEP 01'·'BENEFIT 08'처럼 끝에 붙은 번호를 순서에 맞게 고칩니다(자릿수는 원래 모양대로).
  const textOf = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  function renumber(el, number) {
    if (!el || el.children.length) return;
    const text = el.textContent;
    const next = text.replace(/(\d+)(\s*)$/, (whole, digits, space) => String(number).padStart(digits.length, '0') + space);
    if (next !== text) el.textContent = next;
  }
  const setIfChanged = (el, name, value) => { if (el && el.getAttribute(name) !== value) el.setAttribute(name, value); };

  // 지원 전 체크 페이지처럼 항목 수·순서가 화면 숫자로 드러나는 곳은 저장할 때마다 실제 항목에 맞춥니다.
  function applyListRules() {
    // 자주 묻는 질문: 분류 버튼의 질문 수, 처음 펼쳐 둘 질문(하나만), 검색에 쓰는 질문 글자 사본(data-text)
    const faqList = model.querySelector('#faqList');
    if (faqList) {
      const items = [...faqList.querySelectorAll('.faq-item')];
      for (const tab of model.querySelectorAll('.faq-tab[data-cat]')) {
        const cat = tab.getAttribute('data-cat');
        const count = cat === 'all' ? items.length : items.filter(item => item.getAttribute('data-cat') === cat).length;
        const badge = tab.querySelector('.faq-cnt');
        if (badge && badge.textContent !== String(count)) badge.textContent = String(count);
        if (cat !== 'all') tab.toggleAttribute('hidden', count === 0);
      }
      let opened = false;
      for (const item of items) {
        if (!item.classList.contains('is-open')) continue;
        if (opened) {
          item.classList.remove('is-open');
          setIfChanged(item.querySelector('.faq-q'), 'aria-expanded', 'false');
        }
        opened = true;
      }
      for (const copy of faqList.querySelectorAll('[data-text]')) setIfChanged(copy, 'data-text', textOf(copy));
    }
    // 모집 프로세스: 단계 번호(data-step · STEP 01), 카드의 접근성 이름, 처음 켜 둘 단계(첫 단계)
    const flow = model.querySelector('#procFlow');
    if (flow) {
      const cols = [...flow.querySelectorAll('.pf-col')];
      cols.forEach((col, index) => {
        if (col.hasAttribute('data-step')) setIfChanged(col, 'data-step', String(index));
        if (col.classList.contains('is-on') !== (index === 0)) col.classList.toggle('is-on', index === 0);
        const step = col.querySelector('.pf-step');
        renumber(step, index + 1);
        const card = col.querySelector('.pf-card');
        // 카드 제목: 예전 시안은 data-field="title", 1014 시안부터는 카드 안 h3(없으면 접근성 이름을 그대로 둠 — 'STEP 01'만 남지 않게)
        const title = col.querySelector('[data-field="title"]') || card?.querySelector('h3, h4');
        const label = title ? [textOf(step), textOf(title)].filter(Boolean).join(' ') : '';
        if (card?.hasAttribute('aria-label') && label) setIfChanged(card, 'aria-label', label);
      });
      const label = flow.getAttribute('aria-label');
      if (label && /\d+\s*단계/.test(label)) setIfChanged(flow, 'aria-label', label.replace(/\d+(\s*단계)/, `${cols.length}$1`));
    }
    // 지원 혜택: BENEFIT 01, 02 …
    for (const grid of model.querySelectorAll('.ben-grid')) {
      [...grid.querySelectorAll('.ben-card')].forEach((card, index) => renumber(card.querySelector('.ben-no'), index + 1));
    }
    // 스스로 체크: '0 / 5 확인했어요'의 전체 수와 진행 막대의 최댓값
    const now = model.querySelector('#chkNow');
    const total = model.querySelectorAll('.chk-box').length;
    if (now && total) {
      const after = now.nextSibling;
      if (after?.nodeType === 3) {
        const next = after.data.replace(/^(\s*\/\s*)\d+/, `$1${total}`);
        if (next !== after.data) after.data = next;
      }
      for (const meter of model.querySelectorAll('.chk-bar[aria-valuemax]')) setIfChanged(meter, 'aria-valuemax', String(total));
    }
  }

  // 원본 파일의 표기(빈 속성은 이름만, SVG 빈 요소는 <path/>)를 그대로 따라 써서, 바뀐 부분만 차이가 나게 합니다.
  const HTML_NS = 'http://www.w3.org/1999/xhtml';
  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
  const RAW_TEXT = new Set(['script', 'style', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext']);
  const BARE = new Set(['defer', 'async', 'hidden', 'inert', 'crossorigin', 'allowfullscreen', 'disabled', 'checked', 'selected',
    'required', 'readonly', 'multiple', 'autofocus', 'novalidate', 'open', 'playsinline', 'muted', 'autoplay', 'loop', 'controls',
    'nomodule', 'itemscope', 'download', 'reversed', 'default']);
  const escapeText = text => text.replace(/&/g, '&amp;').replace(/\u00a0/g, '&nbsp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapeAttr = text => text.replace(/&/g, '&amp;').replace(/\u00a0/g, '&nbsp;').replace(/"/g, '&quot;');
  function serializeNode(node) {
    if (node.nodeType === 3) {
      const parent = node.parentNode;
      return parent?.namespaceURI === HTML_NS && RAW_TEXT.has(parent.localName) ? node.data : escapeText(node.data);
    }
    if (node.nodeType === 8) return `<!--${node.data}-->`;
    if (node.nodeType !== 1) return '';
    const name = node.localName;
    let out = `<${name}`;
    for (const attr of node.attributes) {
      if (attr.name === 'data-bo-id') continue;
      out += attr.value === '' && (BARE.has(attr.name) || attr.name.startsWith('data-')) ? ` ${attr.name}` : ` ${attr.name}="${escapeAttr(attr.value)}"`;
    }
    if (node.namespaceURI !== HTML_NS && !node.childNodes.length) return `${out}/>`;
    out += '>';
    if (node.namespaceURI === HTML_NS && VOID.has(name)) return out;
    const content = name === 'template' ? node.content : node;
    for (const child of content.childNodes) out += serializeNode(child);
    return `${out}</${name}>`;
  }

  function documentHTML(doc) {
    const body = doc.body;
    while (body.lastChild && body.lastChild.nodeType === 3 && !body.lastChild.data.trim()) body.lastChild.remove();
    body.append('\n');
    // <html>과 <head> 사이, </body>와 </html> 사이의 줄바꿈은 HTML 해석 과정에서 사라지므로 원본처럼 되살립니다.
    const html = serializeNode(doc.documentElement)
      .replace(/^(<html[^>]*>)<head>/, '$1\n<head>')
      .replace(/<\/body><\/html>$/, '</body>\n</html>');
    const out = `${PAGE.doctype || '<!doctype html>'}\n${html}\n`;
    // 원본 파일이 윈도우 줄바꿈(CRLF)이면 저장할 때도 CRLF로 씁니다(브라우저는 읽을 때 모두 LF로 바꿔요).
    return PAGE.eol === '\r\n' ? out.replace(/\n/g, '\r\n') : out;
  }

  function serialize() {
    applySaveRules();
    applyPartnerRules();
    applyListRules();
    return restoreSpelling(documentHTML(model));
  }

  // ── 원본 표기 살리기 ──
  // 브라우저가 읽은 문서를 다시 글로 쓰면 뜻은 같아도 표기가 달라지는 곳이 있습니다
  // (&middot; → ·, 주소 속 & → &amp;, 표에 저절로 생기는 <tbody>, <path></path> → <path/>, <br/> → <br> 등).
  // 저장할 때 원본(편집을 시작한 파일)과 맞대어 뜻이 같은 부분은 원본 표기를 그대로 쓰고,
  // 그렇게 만든 글을 다시 읽어 뜻이 똑같은지 확인한 뒤에만 씁니다. 그래서 고친 곳만 파일에서 바뀝니다.
  const tokenize = text => text.match(/<!--[\s\S]*?-->|<[^>]*>|[^<]+|</g) || [];
  const decodeBox = document.createElement('textarea');
  const tagBox = document.createElement('template');
  const canonCache = new Map();
  // 뜻만 남긴 표기: 글은 문자 참조를 풀고, 태그는 이름과 속성 값만(따옴표·순서 그대로, 끝의 / 무시)
  function canonical(token) {
    let value = canonCache.get(token);
    if (value !== undefined) return value;
    if (token[0] !== '<' || token === '<') {
      decodeBox.innerHTML = token;
      value = `T${decodeBox.value}`;
    } else if (token.startsWith('</')) {
      value = `E${token.slice(2, -1).trim().toLowerCase()}`;
    } else if (/^<[a-zA-Z]/.test(token)) {
      const name = token.match(/^<([a-zA-Z][^\s/>]*)/)[1].toLowerCase();
      tagBox.innerHTML = token.replace(/\s*\/>$/, '>');
      const el = tagBox.content.firstElementChild;
      value = el && el.localName.toLowerCase() === name
        ? `S${name}${[...el.attributes].map(attr => ` ${attr.name}=${JSON.stringify(attr.value)}`).join('')}`
        : `X${token}`;
      tagBox.innerHTML = '';
    } else {
      value = `X${token}`;
    }
    if (canonCache.size > 20000) canonCache.clear();
    canonCache.set(token, value);
    return value;
  }

  // 두 목록의 차이(Myers 방식). 결과는 문서 순서대로 ['=', a, b] · ['+', a](새 글에만) · ['-', b](원본에만).
  function editScript(n, m, equal, maxD) {
    const limit = Math.min(n + m, maxD);
    const offset = limit + 1;
    const v = new Int32Array(2 * limit + 3);
    const trace = [];
    let done = -1;
    for (let d = 0; d <= limit && done < 0; d++) {
      trace.push(v.slice(offset - d - 1, offset + d + 2));
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
        let y = x - k;
        while (x < n && y < m && equal(x, y)) { x++; y++; }
        v[offset + k] = x;
        if (x >= n && y >= m) { done = d; break; }
      }
    }
    if (done < 0) return null;
    const ops = [];
    let x = n;
    let y = m;
    for (let d = done; d > 0; d--) {
      const row = trace[d];
      const at = k => row[k + d + 1];
      const k = x - y;
      const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
      const prevX = at(prevK);
      const prevY = prevX - prevK;
      while (x > prevX && y > prevY) { x--; y--; ops.push(['=', x, y]); }
      if (x === prevX) { y--; ops.push(['-', y]); } else { x--; ops.push(['+', x]); }
    }
    while (x > 0 && y > 0) { x--; y--; ops.push(['=', x, y]); }
    return ops.reverse();
  }

  // 원본에서 생략돼 있던 끝 태그·<tbody>처럼 브라우저가 스스로 채우는 표기
  const IMPLIED_END = /^<\/(p|li|dt|dd|option|optgroup|tbody|thead|tfoot|tr|td|th|colgroup|caption|rt|rp)\s*>$/i;
  function mergeTokens(aText, bText, aggressive) {
    const A = tokenize(aText);
    const B = tokenize(bText);
    const ops = editScript(A.length, B.length, (i, j) => A[i] === B[j] || canonical(A[i]) === canonical(B[j]), 3000);
    if (!ops) return null;
    let out = '';
    for (const op of ops) {
      if (op[0] === '=') out += B[op[2]];
      else if (op[0] === '+') {
        const token = A[op[1]];
        if (aggressive && (IMPLIED_END.test(token) || /^<tbody\s*>$/i.test(token))) continue;
        out += token;
      } else if (aggressive && B[op[1]].startsWith('</')) {
        out += B[op[1]];
      }
    }
    return out;
  }
  function mergeSpelling(a, b, aggressive) {
    const la = a.split('\n');
    const lb = b.split('\n');
    const ops = editScript(la.length, lb.length, (i, j) => la[i] === lb[j], 3000);
    if (!ops) return null;
    const out = [];
    let hunkA = [];
    let hunkB = [];
    const flush = () => {
      if (!hunkA.length && !hunkB.length) return true;
      const merged = hunkA.length && hunkB.length ? mergeTokens(hunkA.join('\n'), hunkB.join('\n'), aggressive) : hunkA.join('\n');
      if (merged === null) return false;
      if (hunkA.length) out.push(merged);
      hunkA = [];
      hunkB = [];
      return true;
    };
    for (const op of ops) {
      if (op[0] === '=') {
        if (!flush()) return null;
        out.push(lb[op[2]]);
      } else if (op[0] === '+') hunkA.push(la[op[1]]);
      else hunkB.push(lb[op[1]]);
    }
    if (!flush()) return null;
    return out.join('\n');
  }
  // 짝 없는 끝 태그(여는 태그 없이 남은 </span> 등)의 수. 브라우저는 이런 태그를 조용히 무시해서 뜻 비교로는 못 잡으므로 따로 셉니다.
  // (스크립트·스타일처럼 안쪽 글자를 태그로 읽지 않는 요소의 안쪽은 건너뜁니다.)
  const OPAQUE = new Set([...RAW_TEXT, 'textarea', 'title']);
  function strayEndTags(text) {
    const open = [];
    let strays = 0;
    let rawUntil = null;
    for (const token of tokenize(text)) {
      if (token[0] !== '<' || token === '<' || token.startsWith('<!')) continue;
      if (rawUntil) {
        if (token.slice(2).replace(/[\s>].*$/s, '').toLowerCase() === rawUntil && token.startsWith('</')) rawUntil = null;
        continue;
      }
      const end = token.match(/^<\/([a-zA-Z][^\s>/]*)/);
      if (end) {
        const at = open.lastIndexOf(end[1].toLowerCase());
        if (at < 0) strays++;
        else open.length = at;
        continue;
      }
      const start = token.match(/^<([a-zA-Z][^\s>/]*)/);
      if (!start) continue;
      const name = start[1].toLowerCase();
      if (OPAQUE.has(name)) rawUntil = name;
      else if (!VOID.has(name) && !/\/\s*>$/.test(token)) open.push(name);
    }
    return strays;
  }
  let sourceStrays = null;

  // 고친 글을 다시 읽어 저장할 글과 뜻이 똑같은지 확인합니다.
  function sameDocument(candidate, expected) {
    const doc = new DOMParser().parseFromString(candidate, 'text/html');
    return documentHTML(doc) === expected;
  }
  let spelling = { raw: null, out: null };
  function restoreSpelling(raw) {
    if (!SOURCE || raw === SOURCE) return raw;
    if (spelling.raw === raw) return spelling.out;
    let out = raw;
    try {
      for (const aggressive of [true, false]) {
        const candidate = mergeSpelling(raw, SOURCE, aggressive);
        if (candidate === null || candidate === raw) continue;
        // 옮기거나 지운 요소의 끝 태그만 원래 자리에 남는 표기는 쓰지 않습니다(원본에 원래 있던 만큼은 그대로 둠).
        if (sourceStrays === null) sourceStrays = strayEndTags(SOURCE);
        if (strayEndTags(candidate) > sourceStrays) continue;
        if (sameDocument(candidate, raw)) {
          out = candidate;
          break;
        }
      }
    } catch (error) {
      console.warn('원본 표기를 살리지 못해 브라우저 표기로 저장해요.', error);
    }
    spelling = { raw, out };
    return out;
  }

  const cleanOuterHTML = serializeNode;

  // coalesce: 같은 값으로 이어지는 연속 변경(위치 미세 이동 등)은 실행 취소 한 번으로 묶습니다.
  function commit(label, options = {}) {
    shell?.commit({ html: serialize(), label, reload: Boolean(options.reload), selectPath: options.selectPath || null, coalesce: options.coalesce || null });
    if (!options.reload) notifySelection();
  }

  // ── 6. 선택 상태 ──
  let selection = null; // { kind, el, explicit }
  let hoverEl = null;
  let hoverKind = '';
  let dropTarget = null;
  let editing = null;
  let editStartHTML = '';
  let lockedChildren = [];
  let lastDown = null;
  let pendingCaret = null;

  function select(kind, el, { explicit = false, silent = false } = {}) {
    if (attach && el !== attach.selected) cancelAttach();
    if (editing && editing !== el) stopEditing(true);
    selection = el ? { kind, el, explicit } : null;
    ui.render();
    if (!silent) notifySelection();
  }

  // 복제·삭제·이동 단위는 갤러리처럼 화면이 바뀔 수 있어 매번 다시 계산합니다.
  const unitOf = current => (current.explicit || current.kind !== 'text' && current.kind !== 'image' ? current.el : itemFor(current.el));

  function selectById(id, options = {}) {
    const el = live(id);
    if (!el) return;
    select(kindFor(el), el, { explicit: true, ...options });
    revealElement(el);
  }

  function revealElement(el) {
    const rect = el.getBoundingClientRect();
    // scrollIntoView는 바깥 백오피스 화면까지 움직이므로 이 창만 스크롤합니다.
    if (rect.bottom < 60 || rect.top > innerHeight - 60) {
      window.scrollTo({ top: scrollY + rect.top - Math.max(80, (innerHeight - rect.height) / 2), behavior: 'instant' });
    }
  }

  function notifySelection() {
    shell?.onSelect(selectionInfo());
  }

  // ── 7. 텍스트 편집 ──
  function startEditing(el, { caretAtEnd = false } = {}) {
    if (editing === el) return;
    stopEditing(true);
    editing = el;
    editStartHTML = el.innerHTML;
    for (const child of el.querySelectorAll('svg, img, iframe, video, [aria-hidden="true"]')) {
      if (!child.matches('svg, img, iframe, video') && child.textContent.trim()) continue;
      child.setAttribute('contenteditable', 'false');
      lockedChildren.push(child);
    }
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'false');
    el.setAttribute('data-bo-editing', '');
    if (caretAtEnd) {
      el.focus({ preventScroll: true });
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    ui.render();
  }

  function stopEditing(save = true) {
    const el = editing;
    if (!el) return;
    editing = null;
    el.removeAttribute('contenteditable');
    el.removeAttribute('spellcheck');
    el.removeAttribute('data-bo-editing');
    for (const child of lockedChildren) child.removeAttribute('contenteditable');
    lockedChildren = [];
    const sel = getSelection();
    if (sel.rangeCount && el.contains(sel.anchorNode)) sel.removeAllRanges();
    if (document.activeElement === el) el.blur();
    if (save && el.innerHTML !== editStartHTML) commitText(el);
    ui.render();
  }

  function placeCaret(x, y) {
    if (!editing) return;
    const sel = getSelection();
    if (sel.rangeCount && editing.contains(sel.anchorNode)) return;
    let range = document.caretRangeFromPoint?.(x, y);
    if (!range || !editing.contains(range.startContainer)) {
      range = document.createRange();
      range.selectNodeContents(editing);
      range.collapse(false);
    }
    editing.focus({ preventScroll: true });
    sel.removeAllRanges();
    sel.addRange(range);
  }

  const renameElement = (el, tag) => {
    const next = el.ownerDocument.createElement(tag);
    next.append(...el.childNodes);
    el.replaceWith(next);
    return next;
  };
  const unwrap = el => el.replaceWith(...el.childNodes);
  const htmlToText = html => {
    const box = model.createElement('div');
    box.innerHTML = html.replace(/<br\b[^>]*>/gi, ' ');
    return box.textContent.replace(/\s+/g, ' ').trim();
  };

  // 편집기가 만든 흔적과 실행 중에 바뀐 속성을 지우고, 원본의 속성으로 되돌린 HTML을 만듭니다.
  function cleanEditedHTML(el, m) {
    const clone = el.cloneNode(true);
    for (const node of [clone, ...clone.querySelectorAll('*')]) {
      node.removeAttribute('contenteditable');
      node.removeAttribute('spellcheck');
      node.removeAttribute('data-bo-editing');
    }
    for (const node of clone.querySelectorAll('[data-bo-id]')) {
      const source = mod(node.getAttribute('data-bo-id'));
      if (!source || !m.contains(source) || source === m) {
        node.removeAttribute('data-bo-id');
        continue;
      }
      for (const attr of [...node.attributes]) node.removeAttribute(attr.name);
      for (const attr of source.attributes) node.setAttribute(attr.name, attr.value);
    }
    for (const node of [...clone.querySelectorAll('*')].reverse()) {
      if (node.hasAttribute('data-bo-id')) continue;
      let tag = node.tagName.toLowerCase();
      let target = node;
      if (tag === 'i') { target = renameElement(node, 'em'); tag = 'em'; }
      // 강조는 사이트가 쓰는 태그(<strong>, <b>, <mark>) 그대로 둡니다.
      if (['br', 'strong', 'b', 'mark', 'em', 'sup', 'sub'].includes(tag)) {
        for (const attr of [...target.attributes]) target.removeAttribute(attr.name);
      } else if (tag === 'span' && target.hasAttribute('data-bo-format')) {
        // 편집 도구로 입힌 서식만 남깁니다. 브라우저가 스스로 끼워 넣는 스타일 덩어리는 아래에서 풀어 버립니다.
        const styles = styleMap(target);
        const kept = FORMAT_PROPS.filter(prop => styles[prop]).map(prop => `${prop}: ${styles[prop]}`);
        for (const attr of [...target.attributes]) target.removeAttribute(attr.name);
        if (kept.length) target.setAttribute('style', `${kept.join('; ')};`);
        else unwrap(target);
      } else if (tag === 'div' || tag === 'p') {
        target.before(el.ownerDocument.createElement('br'));
        unwrap(target);
      } else {
        unwrap(target);
      }
    }
    let html = clone.innerHTML;
    if (!/&nbsp;|\u00a0/.test(editStartHTML)) html = html.replace(/&nbsp;|\u00a0/g, ' ');
    // 편집 중에 끝에 생긴 줄바꿈(브라우저가 붙이는 빈 줄)만 지웁니다.
    if (!/<br\b[^>]*>\s*$/.test(editStartHTML)) html = html.replace(/(\s*<br>)+\s*$/, '');
    return html;
  }

  // 모델과 화면의 같은 자리에 새 번호를 함께 붙입니다.
  function retagPair(a, b) {
    const left = a.getElementsByTagName('*');
    const right = b.getElementsByTagName('*');
    const count = Math.min(left.length, right.length);
    for (let i = 0; i < count; i++) {
      const id = String(nextId++);
      left[i].setAttribute('data-bo-id', id);
      right[i].setAttribute('data-bo-id', id);
    }
  }

  function setInnerPair(liveEl, modelEl, html) {
    modelEl.innerHTML = html;
    if (liveEl) {
      liveEl.innerHTML = html;
      retagPair(liveEl, modelEl);
    } else {
      for (const node of modelEl.getElementsByTagName('*')) node.setAttribute('data-bo-id', String(nextId++));
    }
  }

  function setAttrPair(id, name, value) {
    for (const el of [live(id), mod(id)]) {
      if (!el) continue;
      if (value === null || value === undefined) el.removeAttribute(name);
      else el.setAttribute(name, value);
    }
  }

  function commitText(el) {
    if (el.matches('.activity-gallery-caption, .activity-gallery-description')) return commitGalleryText(el);
    const id = idOf(el);
    const m = mod(id);
    if (!m) return;
    const oldText = htmlToText(m.innerHTML);
    let html = cleanEditedHTML(el, m);
    // 글자만 쓰는 칸은 서식 없이 글자만 남깁니다(페이지 스크립트가 글자만 다시 그리므로 화면과 같게).
    if (el.matches(PLAIN)) html = escapeText(htmlToText(html));
    const mirrors = mirrorsOf(m).map(other => [live(idOf(other)), other]);
    setInnerPair(el, m, html);
    for (const [liveMirror, modelMirror] of mirrors) setInnerPair(liveMirror, modelMirror, html);
    for (const [liveEl, modelEl] of [[el, m], ...mirrors]) afterTextChange(liveEl, modelEl, oldText);
    commit('텍스트 수정');
  }

  function afterTextChange(liveEl, m, oldText) {
    const newText = htmlToText(m.innerHTML);
    // 숫자 카운트 애니메이션의 목표값을 화면 숫자와 맞춥니다.
    const counters = [...(m.matches('[data-count-to]') ? [m] : []), ...m.querySelectorAll('[data-count-to]')];
    for (const counter of counters) {
      const digits = counter.textContent.replace(/[^\d]/g, '');
      if (digits) setAttrPair(idOf(counter), 'data-count-to', digits);
      const label = counter.parentElement?.querySelector('.education-hours-number-label');
      if (label && label !== counter) {
        label.textContent = counter.textContent;
        const liveLabel = live(idOf(label));
        if (liveLabel) liveLabel.textContent = counter.textContent;
      }
    }
    // 날짜·시각 글자를 고치면 기계가 읽는 datetime 값도 맞춥니다.
    for (const time of [...(m.matches('time') ? [m] : []), ...m.querySelectorAll('time')]) {
      const text = time.textContent.trim();
      let date = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
      if (date) setAttrPair(idOf(time), 'datetime', `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}`);
      date = text.match(/^(\d{1,2}):(\d{2})$/);
      if (date) setAttrPair(idOf(time), 'datetime', `${date[1].padStart(2, '0')}:${date[2]}`);
    }
    // 화면 글자와 같던(또는 화면 글자가 들어 있던) 접근성 이름(aria-label)도 함께 바꿉니다.
    for (let node = m, depth = 0; node && depth < 4; node = node.parentElement, depth++) {
      const label = node.getAttribute('aria-label');
      if (!label || !oldText || oldText === newText) continue;
      const normalized = label.replace(/\s+/g, ' ').trim();
      if (normalized === oldText) setAttrPair(idOf(node), 'aria-label', newText);
      else if (oldText.length >= 4 && normalized.includes(oldText)) setAttrPair(idOf(node), 'aria-label', normalized.replace(oldText, newText));
    }
    // 페이지 스크립트가 검색·다시 그리기에 쓰는 글자 사본(data-text)도 맞춥니다.
    if (m.hasAttribute('data-text')) setAttrPair(idOf(m), 'data-text', newText);
    // 갤러리 사진 설명을 직접 고친 경우 제목 데이터도 맞춥니다.
    if (m.matches('.activity-gallery-slide figcaption')) setAttrPair(idOf(m.parentElement), 'data-title', newText);
  }

  function commitGalleryText(el) {
    const slide = currentSlide();
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    el.textContent = text;
    if (!slide) return;
    const isTitle = el.matches('.activity-gallery-caption');
    setAttrPair(idOf(slide), isTitle ? 'data-title' : 'data-description', text);
    if (isTitle) {
      for (const figure of [slide, mod(idOf(slide))]) {
        const caption = figure?.querySelector('figcaption');
        if (caption) caption.textContent = text;
      }
    }
    commit(isTitle ? '갤러리 제목 수정' : '갤러리 설명 수정');
  }

  // ── 7-1. 글자 서식 ──
  // style 속성을 글자 그대로 다뤄 원본의 따옴표·순서를 유지합니다.
  function styleMap(el) {
    const map = {};
    for (const part of (el.getAttribute('style') || '').split(';')) {
      const index = part.indexOf(':');
      if (index > 0) map[part.slice(0, index).trim().toLowerCase()] = part.slice(index + 1).trim();
    }
    return map;
  }
  const hasStyleProp = (el, prop) => Boolean(styleMap(el)[prop]);
  function setStyleProp(el, prop, value) {
    const rest = (el.getAttribute('style') || '').split(';').map(part => part.trim())
      .filter(part => part && part.slice(0, part.indexOf(':')).trim().toLowerCase() !== prop);
    if (value) rest.push(`${prop}: ${value}`);
    if (rest.length) el.setAttribute('style', `${rest.join('; ')};`);
    else el.removeAttribute('style');
  }

  // 글자 일부에 입히는 서식(글자 색·글꼴·크기·굵기·기울임·밑줄)
  const FORMAT_PROPS = ['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration-line'];
  const FORMAT_SPAN = 'span[data-bo-format], span[style]:not([class])';
  // 요소 전체에 입히는 서식: 글자 크기는 화면 크기별 원래 크기에 비례하도록 zoom으로 키웁니다.
  const BLOCK_PROPS = ['color', 'font-family', 'font-weight', 'font-style', 'text-decoration-line', 'zoom', 'line-height', 'text-align', 'translate', 'z-index', 'position'];
  const SIZE_STEPS = [0.6, 0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2, 2.5, 3];
  const nextStep = (current, direction) => {
    const index = SIZE_STEPS.findIndex(step => step >= current - 0.001);
    const base = index < 0 ? SIZE_STEPS.length - 1 : index;
    const exact = Math.abs(SIZE_STEPS[base] - current) < 0.001;
    const target = direction > 0 ? (exact ? base + 1 : base) : base - 1;
    return SIZE_STEPS[Math.max(0, Math.min(SIZE_STEPS.length - 1, target))];
  };

  // 편집 중인 글자에서 마지막으로 선택했던 범위를 기억해, 도구 상자를 누르는 동안 선택이 풀려도 되살립니다.
  let savedRange = null;
  document.addEventListener('selectionchange', () => {
    if (!editing) return;
    const sel = getSelection();
    if (sel.rangeCount && editing.contains(sel.getRangeAt(0).commonAncestorContainer)) savedRange = sel.getRangeAt(0).cloneRange();
  });
  function editingRange() {
    if (!editing) return null;
    const sel = getSelection();
    if (sel.rangeCount && editing.contains(sel.getRangeAt(0).commonAncestorContainer)) return sel.getRangeAt(0);
    if (savedRange && editing.contains(savedRange.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(savedRange);
      return savedRange;
    }
    return null;
  }
  function selectContents(node) {
    const sel = getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    sel.removeAllRanges();
    sel.addRange(range);
    savedRange = range.cloneRange();
  }
  function exactFormatSpan(range) {
    const node = range.commonAncestorContainer;
    const span = (node.nodeType === 1 ? node : node.parentElement)?.closest(FORMAT_SPAN);
    if (span && span !== editing && editing.contains(span) && range.toString() === span.textContent) return span;
    return null;
  }
  // 이미 원본에 있던 서식 덩어리의 스타일을 바꾸면 원본 모델에도 바로 적어 둡니다.
  function syncStyle(node) {
    const id = idOf(node);
    const m = id && mod(id);
    if (!m) return;
    if (node.getAttribute('style')) m.setAttribute('style', node.getAttribute('style'));
    else m.removeAttribute('style');
  }
  const selectedText = () => {
    const range = editingRange();
    return range && !range.collapsed ? range : null;
  };

  // 선택한 글자에 서식을 입힙니다. 고른 글자가 없으면 요소 전체에 적용합니다.
  function formatText(props, label = '글자 서식') {
    const range = selectedText();
    if (!range) return formatBlock(props, label);
    let span = exactFormatSpan(range);
    if (!span) {
      span = document.createElement('span');
      span.setAttribute('data-bo-format', '');
      span.append(range.extractContents());
      range.insertNode(span);
    }
    for (const [prop, value] of Object.entries(props)) {
      setStyleProp(span, prop, value);
      // 안쪽에 같은 서식이 따로 있으면 지워 새 값이 보이게 합니다.
      for (const inner of span.querySelectorAll(FORMAT_SPAN)) {
        setStyleProp(inner, prop, null);
        syncStyle(inner);
      }
    }
    syncStyle(span);
    if (!span.getAttribute('style') && !idOf(span)) {
      const first = span.firstChild;
      const last = span.lastChild;
      unwrap(span);
      if (first && last) {
        const restored = document.createRange();
        restored.setStartBefore(first);
        restored.setEndAfter(last);
        getSelection().removeAllRanges();
        getSelection().addRange(restored);
      }
    } else {
      selectContents(span);
    }
    ui.refreshToolbar();
  }

  // 지금 선택(또는 요소 전체)의 화면상 값을 보고 켜고 끕니다.
  function computedAtSelection() {
    const range = selectedText();
    const node = range ? range.startContainer : selection?.el;
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    return el ? getComputedStyle(el) : null;
  }
  function toggleBold() {
    const computed = computedAtSelection();
    const bold = computed && (parseInt(computed.fontWeight, 10) || 400) >= 600;
    formatText({ 'font-weight': bold ? '400' : '700' }, bold ? '굵게 해제' : '굵게');
  }
  function toggleItalic() {
    const computed = computedAtSelection();
    const italic = computed?.fontStyle === 'italic';
    formatText({ 'font-style': italic ? 'normal' : 'italic' }, '기울임');
  }
  function toggleUnderline() {
    const computed = computedAtSelection();
    const underline = /underline/.test(computed?.textDecorationLine || '');
    formatText({ 'text-decoration-line': underline ? 'none' : 'underline' }, '밑줄');
  }
  function stepSize(direction) {
    const range = selectedText();
    if (!range) {
      const current = parseFloat(styleMap(selectedModel()).zoom) || 1;
      const next = nextStep(current, direction);
      return formatBlock({ zoom: next === 1 ? null : String(next) }, '글자 크기');
    }
    const span = exactFormatSpan(range);
    const current = span ? parseFloat(styleMap(span)['font-size']) || 1 : 1;
    const next = nextStep(current, direction);
    formatText({ 'font-size': next === 1 ? null : `${next}em` }, '글자 크기');
  }

  // 강조 태그는 그 글(또는 같은 종류의 다른 글)에서 이미 쓰는 것을 따릅니다. 예: 혜택 설명은 <b>, 대상 칸은 <mark>
  const EMPHASIS_TAGS = ['mark', 'b', 'strong'];
  function emphasisTag(el) {
    const m = mod(idOf(el));
    const kind = el.classList[0];
    const others = kind ? [...model.getElementsByClassName(kind)] : [];
    return EMPHASIS_TAGS.find(tag => m?.querySelector(tag)) || EMPHASIS_TAGS.find(tag => others.some(other => other.querySelector(tag))) || 'strong';
  }

  // 사이트의 강조 표시를 켜고 끕니다. 페이지 곳곳의 강조 글자와 같은 모양이 돼요.
  function toggleInline(tag) {
    if (!editing) return;
    tag = tag || emphasisTag(editing);
    const range = editingRange();
    if (!range) return;
    const start = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    const existing = start.closest(tag);
    if (existing && existing !== editing && editing.contains(existing)) {
      unwrap(existing);
      return;
    }
    if (range.collapsed) {
      toast('먼저 바꿀 글자를 드래그해서 선택해 주세요.');
      return;
    }
    const wrapper = document.createElement(tag);
    wrapper.append(range.extractContents());
    range.insertNode(wrapper);
    selectContents(wrapper);
  }

  // 서식 지우기: 고른 글자가 있으면 그 부분의 서식 덩어리를, 없으면 요소 전체에 입힌 서식을 지웁니다.
  function clearFormat() {
    const range = selectedText();
    if (!range) {
      const props = Object.fromEntries(['color', 'font-family', 'font-weight', 'font-style', 'text-decoration-line', 'zoom', 'line-height'].map(prop => [prop, null]));
      if (editing) {
        for (const span of [...editing.querySelectorAll(FORMAT_SPAN)]) unwrap(span);
      } else if (selection) {
        // 편집 중이 아니면 화면과 모델에서 같은 서식 덩어리를 함께 풉니다.
        for (const span of [...selectedModel().querySelectorAll(FORMAT_SPAN)]) {
          const liveSpan = live(idOf(span));
          if (liveSpan) unwrap(liveSpan);
          unwrap(span);
        }
      }
      return formatBlock(props, '서식 지우기');
    }
    const targets = [...editing.querySelectorAll(`${FORMAT_SPAN}, strong, b, em, i, u`)].filter(node => range.intersectsNode(node));
    for (const node of targets) unwrap(node);
    ui.render();
  }

  function insertLineBreak() {
    if (!editing || editing.matches(PLAIN)) return;
    if (!editingRange()) placeCaretAtEnd();
    document.execCommand('insertLineBreak');
  }
  function placeCaretAtEnd() {
    const range = document.createRange();
    range.selectNodeContents(editing);
    range.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }

  // 요소 전체 서식·정렬·위치는 요소 자체의 style에 적습니다(모델과 화면에 함께).
  function formatBlock(props, label = '글자 서식', options = {}) {
    if (!selection) return;
    const id = idOf(selection.el);
    const m = mod(id);
    if (!m) return;
    const targets = [[selection.el, m], ...mirrorsOf(m).map(other => [live(idOf(other)), other])];
    for (const [prop, value] of Object.entries(props)) {
      if (!BLOCK_PROPS.includes(prop)) continue;
      for (const [liveEl, modelEl] of targets) {
        if (liveEl) setStyleProp(liveEl, prop, value);
        setStyleProp(modelEl, prop, value);
      }
    }
    commit(label, options);
    ui.refreshToolbar();
  }

  function currentTranslate(m) {
    const parts = String(styleMap(m).translate || '').split(/\s+/).map(value => parseFloat(value) || 0);
    return { x: parts[0] || 0, y: parts[1] || 0 };
  }
  const canMove = el => Boolean(el && !el.matches(PAGE_LEVEL));
  function nudge(dx, dy) {
    if (!selection) return;
    if (!canMove(selection.el)) return toast('페이지 전체 틀은 옮길 수 없어요. 옮길 글자나 사진, 카드를 먼저 선택해 주세요.');
    const m = selectedModel();
    const { x, y } = currentTranslate(m);
    const nx = Math.round(x + dx);
    const ny = Math.round(y + dy);
    formatBlock({ translate: nx || ny ? `${nx}px ${ny}px` : null }, '위치 이동', { coalesce: `nudge:${idOf(selection.el)}` });
  }
  function setPosition({ x = 0, y = 0 } = {}) {
    if (!selection || !canMove(selection.el)) return;
    const nx = Math.round(Number(x) || 0);
    const ny = Math.round(Number(y) || 0);
    formatBlock({ translate: nx || ny ? `${nx}px ${ny}px` : null }, '위치 이동', { coalesce: `nudge:${idOf(selection.el)}` });
  }

  // ── 맞춤(열·행)의 기준이 될 주변 요소 ──
  const visible = el => Boolean(el && el.isConnected && (!el.checkVisibility || el.checkVisibility({ visibilityProperty: true })));
  const docRect = r => ({ left: r.left + scrollX, top: r.top + scrollY, right: r.right + scrollX, bottom: r.bottom + scrollY, width: r.width, height: r.height });
  const shiftRect = (r, dx, dy) => ({ left: r.left + dx, top: r.top + dy, right: r.right + dx, bottom: r.bottom + dy, width: r.width, height: r.height });
  const EDGES = ['start', 'center', 'end'];
  const linesOf = (r, axis) => (axis === 'x' ? [r.left, (r.left + r.right) / 2, r.right] : [r.top, (r.top + r.bottom) / 2, r.bottom]);
  const EDGE_NAMES = { x: { start: '왼쪽', center: '가운데', end: '오른쪽' }, y: { start: '위', center: '가운데', end: '아래' } };
  // 맞춤 기준으로 보여 줄 이름: 요소 이름 + 글자가 있으면 앞부분
  const refName = el => {
    const text = el.tagName.toLowerCase() === 'svg' ? '' : short(el.textContent, 10);
    return text ? `${describe(el)} ‘${text}’` : describe(el);
  };

  // 같은 섹션 안에서 맞춤 기준이 될 만한 글자·그림·아이콘(과 선택한 것과 같은 종류)을 가까운 것부터 모읍니다.
  function alignTargets(el, limit = 180) {
    const scope = el.closest('section') || document.querySelector('main') || document.body;
    const own = el.getBoundingClientRect();
    const sig = signature(el);
    const list = [];
    for (const c of scope.querySelectorAll('[data-bo-id]')) {
      if (c === el || c.contains(el) || el.contains(c) || c.matches(PAGE_LEVEL) || isInternal(c)) continue;
      const tag = c.tagName.toLowerCase();
      if (tag !== 'svg' && c.closest('svg')) continue;
      if (c.closest(LOCKED) || inertOf(c)) continue;
      const r = c.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const near = Math.max(0, r.left - own.right, own.left - r.right) + Math.max(0, r.top - own.bottom, own.top - r.bottom);
      if (near > 900) continue;
      const same = signature(c) === sig;
      if (!(same || tag === 'img' || tag === 'svg' || textBlockOf(c) === c || controlTextOf(c) === c || (hasBackgroundImage(c) && isIconSized(c)))) continue;
      if (!visible(c)) continue;
      list.push({ el: c, rect: r, near, same });
    }
    return list.sort((a, b) => a.near - b.near).slice(0, limit);
  }

  // 열 맞춤(세로줄) 기준은 위·아래 이웃, 행 맞춤(가로줄) 기준은 왼쪽·오른쪽 이웃. 가까운 순서이고 부모 틀은 맨 뒤에 둡니다.
  function alignRefs(el) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const targets = alignTargets(el);
    const tcx = t => t.rect.left + t.rect.width / 2;
    const tcy = t => t.rect.top + t.rect.height / 2;
    const rowBand = t => Math.abs(tcy(t) - cy) <= Math.max(r.height, t.rect.height) * 0.75;
    const colBand = t => Math.abs(tcx(t) - cx) <= Math.max(360, r.width * 2);
    const best = score => targets.map(t => ({ t, s: score(t) })).filter(item => item.s !== null).sort((a, b) => a.s - b.s)[0] || null;
    const left = best(t => (tcx(t) < cx && rowBand(t) ? Math.max(0, r.left - t.rect.right) + Math.abs(tcy(t) - cy) * 0.5 : null));
    const right = best(t => (tcx(t) > cx && rowBand(t) ? Math.max(0, t.rect.left - r.right) + Math.abs(tcy(t) - cy) * 0.5 : null));
    const up = best(t => (tcy(t) < r.top && colBand(t) ? (Math.max(0, r.top - t.rect.bottom) + Math.abs(tcx(t) - cx) * 0.7) * (t.same ? 0.4 : 1) : null));
    const down = best(t => (tcy(t) > r.bottom && colBand(t) ? (Math.max(0, t.rect.top - r.bottom) + Math.abs(tcx(t) - cx) * 0.7) * (t.same ? 0.4 : 1) : null));
    // 부모 틀: 요소를 딱 감싸기만 한 틀(아이콘 틀 등)은 건너뛰고, 실제로 더 넓은 틀을 고릅니다.
    let parent = el.parentElement;
    while (parent && parent !== document.body && !parent.matches(PAGE_LEVEL)) {
      const p = parent.getBoundingClientRect();
      if (idOf(parent) && (p.width - r.width > 4 || p.height - r.height > 4)) break;
      parent = parent.parentElement;
    }
    if (!parent || parent === document.body || parent.matches(PAGE_LEVEL)) parent = null;
    // 글 안에 들어 있는 아이콘이면 그 글(한두 줄짜리)과 같은 줄에 맞출 수 있게 합니다.
    let line = null;
    for (let node = el.parentElement, depth = 0; node && depth < 4 && node !== document.body && !node.matches(PAGE_LEVEL); node = node.parentElement, depth++) {
      if (!idOf(node) || !hasOwnText(node)) continue;
      if (node.getBoundingClientRect().height <= Math.max(80, r.height * 3)) line = node;
      break;
    }
    const entry = (item, dir) => ({ id: idOf(item.t.el), label: `${dir} · ${refName(item.t.el)}`, s: item.s });
    const ordered = pairs => pairs.filter(([item]) => item).map(([item, dir]) => entry(item, dir)).sort((a, b) => a.s - b.s).map(({ id, label }) => ({ id, label }));
    const parentEntry = parent && parent !== line ? [{ id: idOf(parent), label: `안쪽 · ${refName(parent)} (부모 틀)` }] : [];
    const lineEntry = line ? [{ id: idOf(line), label: `같은 줄 · ${refName(line)}` }] : [];
    return {
      x: [...ordered([[up, '위'], [down, '아래']]), ...parentEntry],
      y: [...lineEntry, ...ordered([[left, '왼쪽'], [right, '오른쪽']]), ...parentEntry]
    };
  }

  // 확대(zoom)된 요소는 위치 값 1px이 화면에서 더 크게 움직이므로, 화면 1px에 해당하는 값을 재어 둡니다.
  function translateScale(el, baseX, baseY) {
    const before = el.getBoundingClientRect().left;
    const previous = el.style.translate;
    el.style.translate = `${baseX + 100}px ${baseY}px`;
    const after = el.getBoundingClientRect().left;
    el.style.translate = previous;
    const k = (after - before) / 100;
    return k > 0.05 && k < 20 ? k : 1;
  }

  // 열 맞춤(왼쪽·가운데·오른쪽) 또는 행 맞춤(위·가운데·아래): 선택한 요소의 그 줄을 기준 요소의 같은 줄에 맞춥니다.
  // 부모 틀이 기준이면 틀 안쪽의 왼쪽·가운데·오른쪽(위·가운데·아래)에 맞춥니다.
  function alignTo({ axis = 'x', edge = 'center', ref } = {}) {
    if (!selection) return;
    const el = selection.el;
    if (!canMove(el)) return toast('페이지 전체 틀은 옮길 수 없어요.');
    const target = ref ? live(ref) : null;
    if (!target || !visible(target)) return toast('맞출 기준을 찾지 못했어요. 기준을 다시 골라 주세요.');
    const index = Math.max(0, EDGES.indexOf(edge));
    const diff = linesOf(target.getBoundingClientRect(), axis)[index] - linesOf(el.getBoundingClientRect(), axis)[index];
    if (Math.abs(diff) < 0.5) {
      toast('이미 맞춰져 있어요.');
      return;
    }
    const { x, y } = currentTranslate(selectedModel());
    const k = translateScale(el, x, y);
    const nx = axis === 'x' ? Math.round(x + diff / k) : x;
    const ny = axis === 'y' ? Math.round(y + diff / k) : y;
    formatBlock({ translate: nx || ny ? `${nx}px ${ny}px` : null }, axis === 'x' ? `열 맞춤 (${EDGE_NAMES.x[edge]})` : `행 맞춤 (${EDGE_NAMES.y[edge]})`);
  }

  // 맞춤 버튼에 마우스를 올리면 기준 요소와 맞춰질 줄을 미리 보여 줍니다.
  let alignPreview = null; // { ref, axis, edge }
  function previewAlign(preview) {
    const ref = preview?.ref ? live(preview.ref) : null;
    alignPreview = ref && selection ? { ref, axis: preview.axis || null, edge: preview.edge || null } : null;
  }

  // ── 마우스로 끌어서 위치 옮기기 ──
  // 끄는 동안에는 화면만 움직이고, 손을 떼면 원본에 한 번 기록합니다(실행 취소 한 번).
  // 주변 글자·그림·아이콘과 줄(왼쪽·가운데·오른쪽, 위·가운데·아래)이 맞으면 분홍 안내선이 보이며 딱 붙습니다(Alt를 누르고 끌면 끔).
  const SNAP = 6;
  let move = null;
  function beginMove(el, clientX, clientY, { immediate = false } = {}) {
    if (!canMove(el)) {
      toast('페이지 전체 틀은 옮길 수 없어요. 옮길 글자나 사진, 카드를 먼저 선택해 주세요.');
      return false;
    }
    if (immediate && editing) stopEditing(true);
    const base = currentTranslate(mod(idOf(el)));
    move = { el, startX: clientX, startY: clientY, baseX: base.x, baseY: base.y, x: base.x, y: base.y, active: false, snapX: false, snapY: false, guide: null };
    if (immediate) activateMove();
    return true;
  }
  // 끌기를 시작할 때 한 번: 화면 1px에 해당하는 위치 값, 처음 자리, 맞춤 후보를 재어 둡니다.
  function activateMove() {
    move.active = true;
    if (editing) stopEditing(true);
    move.scale = translateScale(move.el, move.baseX, move.baseY);
    move.rect0 = docRect(move.el.getBoundingClientRect());
    move.targets = alignTargets(move.el).map(t => ({ ...t, doc: docRect(t.rect) }));
    move.unit = attachUnitOf(move.el, kindFor(move.el));
    // 끄는 동안에는 다른 요소 위로 올려 보여 줍니다(PPT처럼). 화면에만 잠깐 적용하고 놓을 때 되돌립니다.
    move.temp = { zIndex: move.el.style.zIndex, position: move.el.style.position };
    if (getComputedStyle(move.el).position === 'static') move.el.style.position = 'relative';
    move.el.style.zIndex = '2147483000';
    // 작은 아이콘·그림은 칸 밖으로 끌면 그 칸에 잘리거나 다른 칸에 가려져 사라지므로, 끄는 동안에는 본뜬 모습을 맨 위에 보여 줍니다.
    if (move.unit || isCompact(move.el)) {
      ui.preview(move.el);
      move.temp.opacity = move.el.style.opacity;
      move.el.style.opacity = '0';
    }
  }
  function restoreTemp(state) {
    if (!state.temp) return;
    if ('opacity' in state.temp) {
      state.el.style.opacity = state.temp.opacity;
      ui.preview(null);
    }
    state.el.style.zIndex = state.temp.zIndex;
    state.el.style.position = state.temp.position;
    if (!state.el.getAttribute('style')) state.el.removeAttribute('style');
    state.temp = null;
  }

  // 요소가 대부분 가려져 보이지 않는지: 다른 칸에 덮이거나, 칸 밖으로 나가 잘린(overflow: hidden) 경우
  function obscured(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const previous = el.style.pointerEvents;
    el.style.pointerEvents = 'auto';
    let inside = 0;
    let seen = 0;
    for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) {
      const x = r.left + r.width * fx;
      const y = r.top + r.height * fy;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      inside++;
      const top = document.elementsFromPoint(x, y).find(node => !isInternal(node));
      if (top && (top === el || el.contains(top))) seen++;
    }
    el.style.pointerEvents = previous;
    if (!el.getAttribute('style')) el.removeAttribute('style');
    return inside > 0 && seen / inside < 0.5;
  }
  // 겹칠 때 맨 앞에 보이게 하는 서식(정해진 위치가 없으면 relative를 함께 줍니다)
  const frontProps = el => ({ 'z-index': '10', ...(getComputedStyle(el).position === 'static' ? { position: 'relative' } : {}) });
  // 놓은 자리 아래에 있는 다른 칸에서, 놓은 곳과 가장 가까운 글자·그림 옆을 찾습니다(아이콘을 그 칸 안으로 옮겨 넣을 자리).
  function rehomeHit(el, unit) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return null;
    const under = document.elementsFromPoint(x, y).find(node => !isInternal(node) && !unit.contains(node) && node !== document.documentElement && node !== document.body);
    if (!under || under.closest(LOCKED) || inertOf(under)) return null;
    const box = boxOf(under);
    if (!box || box.matches(PAGE_LEVEL) || box.contains(unit)) return null;
    let best = null;
    for (const c of [box, ...box.querySelectorAll('[data-bo-id]')]) {
      if (unit.contains(c) || c.contains(unit)) continue;
      const tag = c.tagName.toLowerCase();
      if (tag !== 'svg' && c.closest('svg')) continue;
      const kind = tag === 'img' ? 'image' : tag === 'svg' ? 'graphic' : textBlockOf(c) === c ? 'text' : null;
      if (!kind || !visible(c)) continue;
      const cr = c.getBoundingClientRect();
      if (!cr.width || !cr.height) continue;
      const d = Math.max(0, cr.left - x, x - cr.right) + Math.max(0, cr.top - y, y - cr.bottom) * 2;
      if (!best || d < best.d) best = { c, kind, d };
    }
    return best ? hitFor(best.c, best.kind, x, unit) : null;
  }
  // 움직이는 상자의 세 줄(시작·가운데·끝)과 주변 요소의 세 줄 중 가장 가까운 짝을 찾습니다. 같은 줄끼리, 가까운 요소를 먼저 고릅니다.
  function snapLine(rect, targets, axis) {
    const own = linesOf(rect, axis);
    let best = null;
    for (const t of targets) {
      const other = linesOf(t.doc, axis);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const diff = other[j] - own[i];
          if (Math.abs(diff) > SNAP) continue;
          // 아이콘은 아이콘끼리처럼 같은 종류에 먼저 맞춥니다.
          const score = Math.abs(diff) + (i === j ? 0 : 1.5) + t.near / 400 - (t.same ? 3 : 0);
          if (!best || score < best.score) best = { score, diff, at: other[j], edge: EDGES[j], own: EDGES[i], target: t };
        }
      }
    }
    return best;
  }
  function updateMove(clientX, clientY, lockAxis, free = false) {
    let dx = clientX - move.startX;
    let dy = clientY - move.startY;
    if (!move.active) {
      if (Math.hypot(dx, dy) < 4) return;
      activateMove();
    }
    if (lockAxis) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    const k = move.scale || 1;
    let x = move.baseX + dx / k;
    let y = move.baseY + dy / k;
    move.snapX = false;
    move.snapY = false;
    move.guide = null;
    if (!free) {
      // 원래 자리 근처에서는 딱 붙어 쉽게 되돌릴 수 있습니다.
      if (Math.abs(x * k) <= SNAP) { x = 0; move.snapX = true; }
      if (Math.abs(y * k) <= SNAP) { y = 0; move.snapY = true; }
      // 주변 요소와 줄이 맞으면 붙습니다(Shift로 한 방향만 옮길 때는 그 방향만).
      const rect = shiftRect(move.rect0, (x - move.baseX) * k, (y - move.baseY) * k);
      const guide = { x: null, y: null };
      if (!move.snapX && !(lockAxis && dx === 0)) {
        guide.x = snapLine(rect, move.targets, 'x');
        if (guide.x) x += guide.x.diff / k;
      }
      if (!move.snapY && !(lockAxis && dy === 0)) {
        guide.y = snapLine(rect, move.targets, 'y');
        if (guide.y) y += guide.y.diff / k;
      }
      if (guide.x || guide.y) move.guide = guide;
    }
    x = Math.round(x);
    y = Math.round(y);
    move.x = x;
    move.y = y;
    move.el.style.translate = x || y ? `${x}px ${y}px` : 'none';
    // 다른 칸 밖으로 나가 잘리는 자리인지(맨 앞으로 올려도 안 보이는지) 가끔씩 확인해 안내합니다.
    const now = performance.now();
    if (now - (move.checkedAt || 0) > 70) {
      move.checkedAt = now;
      move.hidden = obscured(move.el);
      move.rehome = move.hidden && move.unit ? rehomeHit(move.el, move.unit) : null;
    }
  }
  function endMove(cancel = false) {
    const done = move;
    move = null;
    if (!done) return false;
    if (!done.active) return false;
    restoreTemp(done);
    if (cancel) {
      done.el.style.translate = done.baseX || done.baseY ? `${done.baseX}px ${done.baseY}px` : '';
      return true;
    }
    if (!selection || selection.el !== done.el) select(kindFor(done.el), done.el, { explicit: true, silent: true });
    const translate = done.x || done.y ? `${done.x}px ${done.y}px` : null;
    if (obscured(done.el)) {
      // 1) 같은 칸 안에서 다른 요소 밑에 깔린 경우: 맨 앞으로 가져오면 보입니다.
      const front = frontProps(done.el);
      const temp = { el: done.el, temp: { zIndex: done.el.style.zIndex, position: done.el.style.position } };
      done.el.style.zIndex = front['z-index'];
      if (front.position) done.el.style.position = front.position;
      const stillHidden = obscured(done.el);
      restoreTemp(temp);
      if (!stillHidden) {
        formatBlock({ translate, ...front }, '위치 이동 · 맨 앞으로');
        toast('다른 요소에 가려지지 않게 맨 앞으로 가져왔어요.');
        return true;
      }
      // 2) 다른 칸으로 옮겨 잘린 경우(칸 밖은 잘려 보이지 않음): 아이콘이면 놓은 칸 안으로 실제로 옮겨 넣습니다.
      const hit = done.unit ? rehomeHit(done.el, done.unit) : null;
      if (hit) {
        performAttach(hit, { mode: 'move', unit: done.unit, selected: done.el, hit }, `${describe(done.unit)} 다른 칸으로 옮기기`);
        toast(`다른 칸 밖으로는 잘려 보이지 않아서, 놓은 칸의 ‘${short(hit.el.textContent, 12) || hit.name}’ ${hit.after ? '뒤' : '앞'}에 옮겨 넣었어요. 되돌리려면 Ctrl+Z.`);
        return true;
      }
      formatBlock({ translate }, '위치 이동');
      toast('이 자리에서는 다른 칸에 가려져 보이지 않아요. 아이콘이라면 다른 칸의 글자 위에 놓거나 ‘글자 옆에 붙이기’를 써 주세요.', 'error');
      return true;
    }
    formatBlock({ translate }, '위치 이동');
    return true;
  }

  // 겹칠 때 순서: 맨 앞으로 가져오기(front) 또는 원래대로(null)
  function setLayer(to) {
    if (!selection || !canMove(selection.el)) return;
    const m = selectedModel();
    if (to === 'front') return formatBlock(frontProps(selection.el), '맨 앞으로 가져오기');
    const reset = { 'z-index': null };
    if (styleMap(m).position === 'relative') reset.position = null;
    formatBlock(reset, '겹침 순서 원래대로');
  }

  // ── 아이콘을 글자 옆에 붙이기(복제하거나 옮겨서) ──
  // 위치 값으로 띄워 놓는 대신 실제로 글자 옆(앞·뒤)에 넣으므로, 화면 크기가 바뀌어도 글자와 같은 줄에 붙어 다닙니다.
  const COMPACT = 72;
  const isCompact = el => {
    const r = el.getBoundingClientRect();
    return r.width < COMPACT && r.height < COMPACT;
  };
  // 함께 옮길 묶음: 아이콘만 감싼 작은 틀(크기·색을 정하는 경우가 많음)까지 올라갑니다.
  function attachUnitOf(el, kind = kindFor(el)) {
    if (!el || el.matches(PAGE_LEVEL) || mirrorsOf(mod(idOf(el)) || el).length) return null;
    const iconLike = ((kind === 'graphic' || kind === 'image' || kind === 'bg') && isIconSized(el)) || (kind === 'box' && isCompact(el));
    if (!iconLike) return null;
    const base = el.getBoundingClientRect();
    let unit = el;
    for (let parent = el.parentElement; parent && idOf(parent) && parent !== document.body && !parent.matches(PAGE_LEVEL); parent = parent.parentElement) {
      if (parent.textContent.trim() || parent.children.length !== 1 || parent.closest(LOCKED)) break;
      const r = parent.getBoundingClientRect();
      if (r.width * r.height > Math.max(base.width * base.height * 4, 64 * 64)) break;
      unit = parent;
    }
    return unit;
  }

  let attach = null; // { mode: 'copy' | 'move', unit, selected, hit }
  function startAttach(mode = 'copy') {
    if (!selection) return;
    stopEditing(true);
    const unit = attachUnitOf(selection.el, selection.kind);
    if (!unit) return toast('아이콘이나 작은 그림을 먼저 선택해 주세요.');
    attach = { mode: mode === 'move' ? 'move' : 'copy', unit, selected: selection.el, hit: null };
    hoverEl = null;
    ui.render();
  }
  function cancelAttach() {
    if (!attach) return;
    attach = null;
    ui.render();
  }
  // 붙일 자리: 글자(또는 다른 그림·아이콘)의 오른쪽 절반을 가리키면 뒤에, 왼쪽 절반이면 앞에.
  // 보통 문단·제목이면 그 글 안의 맨 앞·맨 끝에, 가로로 늘어선 칸(flex)이나 줄 안 요소면 바로 옆 칸에 넣습니다.
  function attachHit(x, y) {
    const hit = resolveAt(x, y);
    if (!hit || !hit.el || !['text', 'image', 'graphic'].includes(hit.kind)) return null;
    return hitFor(hit.el, hit.kind, x, attach.unit);
  }
  function hitFor(el, kind, x, unit) {
    if (unit.contains(el) || el.contains(unit) || !el.parentElement) return null;
    const r = el.getBoundingClientRect();
    const after = x >= r.left + r.width / 2;
    const row = /flex|grid/.test(getComputedStyle(el.parentElement).display);
    const inside = kind === 'text' && !row && !isInline(el) && !el.matches(PLAIN);
    let bar = { x: after ? r.right + 3 : r.left - 3, top: r.top, height: Math.min(r.height, 48) };
    if (inside) {
      const texts = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) if (walker.currentNode.data.trim()) texts.push(walker.currentNode);
      const node = after ? texts[texts.length - 1] : texts[0];
      if (node) {
        const range = document.createRange();
        range.setStart(node, after ? node.data.replace(/\s+$/, '').length : node.data.length - node.data.replace(/^\s+/, '').length);
        range.collapse(true);
        const caret = range.getBoundingClientRect();
        if (caret.height) bar = { x: caret.left + (after ? 2 : -2), top: caret.top, height: caret.height };
      }
    }
    return { el, after, inside, bar: { x: bar.x + scrollX, top: bar.top + scrollY, height: bar.height }, name: refName(el) };
  }

  // 붙이기 전의 모습(크기·색·도형 색)을 재어 두었다가, 새 자리에서 달라지면 그대로 보이도록 고정합니다.
  function lookOf(el) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const shapes = [...el.querySelectorAll(SHAPES)].map(shape => {
      const c = getComputedStyle(shape);
      return { fill: c.fill, stroke: c.stroke, 'stroke-width': c.strokeWidth };
    });
    const boxes = [...el.querySelectorAll('svg, img')].map(node => {
      const box = node.getBoundingClientRect();
      return { width: box.width, height: box.height };
    });
    return { width: r.width, height: r.height, color: cs.color, shapes, boxes };
  }
  // 새 자리에서도 같은 크기로 보이게: 보이는 크기가 달라졌으면(새 칸의 글자 크기 배율·축소된 칸 등까지 따져) 그만큼 되돌려 맞춥니다.
  function keepSize(liveEl, before, apply) {
    for (let round = 0; round < 2; round++) {
      const r = liveEl.getBoundingClientRect();
      if (!r.width || !r.height || (Math.abs(r.width - before.width) <= 0.5 && Math.abs(r.height - before.height) <= 0.5)) return;
      const cs = getComputedStyle(liveEl);
      const w = parseFloat(cs.width);
      const h = parseFloat(cs.height);
      if (!(w > 0 && h > 0)) return;
      apply('width', `${Math.round(w * before.width / r.width * 10) / 10}px`);
      apply('height', `${Math.round(h * before.height / r.height * 10) / 10}px`);
    }
  }
  const cssColor = value => colorKey(value) || value;
  function fitLook(liveEl, modelEl, look, hit) {
    const apply = (prop, value) => {
      setStyleProp(liveEl, prop, value);
      setStyleProp(modelEl, prop, value);
    };
    // 예전에 위치 값으로 옮겨 둔 것은 새 자리에서는 필요 없으므로 지웁니다.
    if (styleMap(modelEl).translate) apply('translate', null);
    const inline = hit.inside || isInline(hit.el);
    const display = getComputedStyle(liveEl).display;
    if (inline && /^(block|flex|grid|table)$/.test(display)) apply('display', display === 'block' ? 'inline-block' : `inline-${display}`);
    keepSize(liveEl, look, apply);
    // 틀 안의 그림(svg·img)도: 원래 칸의 규칙으로 크기가 정해져 있었다면 새 칸에서 작아지거나 커질 수 있어요.
    const liveBoxes = [...liveEl.querySelectorAll('svg, img')];
    const modelBoxes = [...modelEl.querySelectorAll('svg, img')];
    look.boxes.forEach((before, index) => {
      const node = liveBoxes[index];
      const model = modelBoxes[index];
      if (node && model) keepSize(node, before, (prop, value) => { setStyleProp(node, prop, value); setStyleProp(model, prop, value); });
    });
    if (getComputedStyle(liveEl).color !== look.color) apply('color', cssColor(look.color));
    const liveShapes = [...liveEl.querySelectorAll(SHAPES)];
    const modelShapes = [...modelEl.querySelectorAll(SHAPES)];
    look.shapes.forEach((before, index) => {
      const shape = liveShapes[index];
      if (!shape || !modelShapes[index]) return;
      const now = getComputedStyle(shape);
      for (const [prop, value] of Object.entries(before)) {
        const current = prop === 'stroke-width' ? now.strokeWidth : now[prop];
        if (current === value) continue;
        const next = prop === 'stroke-width' ? value : cssColor(value);
        setStyleProp(shape, prop, next);
        setStyleProp(modelShapes[index], prop, next);
      }
    });
    if (inline) {
      // 글자와 같은 줄: 세로 가운데에 맞추고 글자와 살짝 띄웁니다.
      if (getComputedStyle(liveEl).verticalAlign === 'baseline') apply('vertical-align', 'middle');
      const side = hit.after ? 'margin-left' : 'margin-right';
      if (!parseFloat(getComputedStyle(liveEl)[hit.after ? 'marginLeft' : 'marginRight'])) apply(side, '0.3em');
    } else {
      // 가로로 늘어선 칸: 글자와 세로 가운데가 맞도록(글자 기준선에 맞춰 아래로 처지지 않게) 합니다.
      const parent = getComputedStyle(hit.el.parentElement);
      const self = getComputedStyle(liveEl).alignSelf;
      if (/flex/.test(parent.display) && !/column/.test(parent.flexDirection) && /auto|normal/.test(self) && parent.alignItems !== 'center') apply('align-self', 'center');
    }
  }
  function performAttach(hit, job = attach, label = null) {
    if (job === attach) attach = null;
    ui.render();
    const unitModel = mod(idOf(job.unit));
    const targetModel = mod(idOf(hit.el));
    if (!unitModel || !targetModel || !job.unit.isConnected || !hit.el.isConnected) return;
    const look = lookOf(job.unit);
    // 선택했던 요소(아이콘 틀 안의 svg 등)의 자리: 붙인 뒤 같은 요소를 다시 선택합니다.
    const inner = [];
    for (let node = job.selected; node && node !== job.unit; node = node.parentElement) inner.unshift(childIndex(node));
    let placedModel = unitModel;
    let placedLive = job.unit;
    if (job.mode === 'copy') {
      placedModel = unitModel.cloneNode(true);
      uniquifyIds(placedModel);
      for (const node of [placedModel, ...placedModel.getElementsByTagName('*')]) node.setAttribute('data-bo-id', String(nextId++));
      placedLive = document.importNode(placedModel, true);
    }
    const put = (node, target) => {
      if (hit.inside) {
        if (hit.after) target.append(node);
        else target.prepend(node);
      } else if (hit.after) target.after(node);
      else target.before(node);
    };
    put(placedModel, targetModel);
    put(placedLive, hit.el);
    fitLook(placedLive, placedModel, look, hit);
    const chosen = inner.reduce((node, index) => node?.children[index] || null, placedModel) || placedModel;
    if (chosen !== placedModel && styleMap(chosen).translate) {
      setStyleProp(chosen, 'translate', null);
      const liveChosen = live(idOf(chosen));
      if (liveChosen) setStyleProp(liveChosen, 'translate', null);
    }
    commit(label || (job.mode === 'copy' ? `${describe(job.unit)} 복제해서 붙이기` : `${describe(job.unit)} 옮겨 붙이기`), { reload: true, selectPath: pathOf(chosen) });
  }

  // ── 8. 이미지·속성 변경 ──
  function selectedModel() {
    return selection ? mod(idOf(selection.el)) : null;
  }

  // 화면과 모델의 같은 요소 쌍(움직이는 띠처럼 반복된 묶음이면 그 복사본들까지)
  const pairsOf = (liveEl, m) => [[liveEl, m], ...mirrorsOf(m).map(other => [live(idOf(other)), other])];
  // 아이콘 크기 정도의 작은 배경 그림(큰 그림에서 잘라 쓰는 아이콘 포함)인지 봅니다.
  const isIconSized = el => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.width <= 240 && rect.height <= 240;
  };
  const ICON_BG_PROPS = { 'background-size': 'contain', 'background-position': 'center', 'background-repeat': 'no-repeat' };

  function replaceImage(picked) {
    if (!selection) return;
    if (picked?.icon) return replaceWithIcon(picked);
    const { path, width, height } = picked || {};
    if (!path) return;
    const id = idOf(selection.el);
    const m = mod(id);
    if (!m) return;
    if (selection.kind === 'graphic') return replaceGraphicWithImage(picked);
    if (selection.kind === 'bg') {
      // 작은 아이콘 배경은 큰 그림의 한 칸만 보이도록 맞춰져 있으므로, 새 그림이 칸에 꼭 맞게 들어가도록 합니다.
      const iconSized = isIconSized(selection.el);
      for (const [liveEl, modelEl] of pairsOf(selection.el, m)) {
        for (const el of [liveEl, modelEl]) {
          if (!el) continue;
          setStyleProp(el, 'background-image', `url('${path}')`);
          if (iconSized) for (const [prop, value] of Object.entries(ICON_BG_PROPS)) setStyleProp(el, prop, value);
        }
      }
      commit(iconSized ? '아이콘 교체' : '배경 이미지 교체');
      return;
    }
    if (selection.kind !== 'image') return;
    for (const [liveEl, modelEl] of pairsOf(selection.el, m)) {
      for (const el of [liveEl, modelEl]) {
        if (!el) continue;
        el.setAttribute('src', path);
        el.removeAttribute('srcset');
        if (width && height) {
          el.setAttribute('width', String(width));
          el.setAttribute('height', String(height));
        }
      }
    }
    // 수료식 사진에는 원본 사진을 흐리게 깐 장식이 있어, 새 사진에서는 장식을 뺍니다.
    const decorated = m.closest('.activity-gallery-photo--graduation');
    if (decorated) {
      for (const el of [live(idOf(decorated)), decorated]) el?.classList.remove('activity-gallery-photo--graduation');
    }
    // 이스트소프트 로고는 그림 대신 CSS 마스크로 그려 두었으므로, 로고를 바꾸면 일반 로고 그림으로 풀어 줍니다.
    const wordmark = m.closest('.partner-est-wordmark');
    if (wordmark) {
      const liveWordmark = live(idOf(wordmark));
      if (liveWordmark) unwrap(liveWordmark);
      unwrap(wordmark);
    }
    commit('이미지 교체');
  }

  function resetBackground() {
    const m = selectedModel();
    if (!m || selection.kind !== 'bg') return;
    for (const [liveEl, modelEl] of pairsOf(selection.el, m)) {
      for (const el of [liveEl, modelEl]) {
        if (!el) continue;
        for (const prop of ['background-image', ...Object.keys(ICON_BG_PROPS)]) setStyleProp(el, prop, null);
      }
    }
    commit('배경 이미지 되돌리기');
  }

  // ── 아이콘 ──
  const SHAPES = 'path, circle, rect, ellipse, line, polyline, polygon, text';
  const ICON_STROKE = { fill: 'none', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };

  // SVG 아이콘 자리에 아이콘 모음의 아이콘을 그려 넣습니다. 크기·위치를 정하는 원래 요소(클래스 등)는 그대로 둡니다.
  function replaceWithIcon({ icon, color }) {
    if (selection?.kind !== 'graphic') return;
    const m = mod(idOf(selection.el));
    if (!m) return;
    for (const [liveSvg, modelSvg] of pairsOf(selection.el, m)) {
      for (const svg of [modelSvg, liveSvg]) {
        if (!svg) continue;
        svg.innerHTML = icon.body;
        svg.setAttribute('viewBox', '0 0 24 24');
        for (const attr of ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']) svg.removeAttribute(attr);
        for (const [prop, value] of Object.entries({ ...ICON_STROKE, stroke: color || 'currentColor' })) setStyleProp(svg, prop, value);
      }
      if (liveSvg) retagPair(liveSvg, modelSvg);
      else for (const node of modelSvg.getElementsByTagName('*')) node.setAttribute('data-bo-id', String(nextId++));
    }
    commit('아이콘 교체');
  }

  // SVG 아이콘을 올린 그림 파일로 바꿉니다. 지금 보이는 크기를 그대로 지켜 자리가 흐트러지지 않게 합니다.
  function replaceGraphicWithImage({ path, width, height }) {
    const svg = selection.el;
    const m = mod(idOf(svg));
    if (!m) return;
    const rect = svg.getBoundingClientRect();
    const display = getComputedStyle(svg).display;
    const style = `width: ${Math.round(rect.width)}px; height: ${Math.round(rect.height)}px; object-fit: contain; display: ${display === 'inline' ? 'inline-block' : display};`;
    let created = null;
    for (const [liveSvg, modelSvg] of pairsOf(svg, m)) {
      const id = String(nextId++);
      for (const [target, doc] of [[modelSvg, model], [liveSvg, document]]) {
        if (!target) continue;
        const img = doc.createElement('img');
        img.setAttribute('src', path);
        img.setAttribute('alt', '');
        if (width && height) {
          img.setAttribute('width', String(width));
          img.setAttribute('height', String(height));
        }
        if (target.getAttribute('class')) img.setAttribute('class', target.getAttribute('class'));
        img.setAttribute('style', style);
        img.setAttribute('data-bo-id', id);
        target.replaceWith(img);
        if (doc === document && target === svg) created = img;
      }
    }
    if (created) selection = { kind: 'image', el: created, explicit: true };
    commit('아이콘을 그림으로 교체');
    ui.render();
  }

  // 아이콘에 실제로 보이는 색들(선·채움·그라데이션)을 모읍니다. CSS로 칠한 색도 포함돼요.
  const colorKey = value => {
    const match = String(value).match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
    if (!match || (match[4] !== undefined && Number(match[4]) === 0)) return null;
    return `#${[match[1], match[2], match[3]].map(part => Number(part).toString(16).padStart(2, '0')).join('')}`;
  };
  function iconColors(svg) {
    const counts = new Map();
    const add = value => {
      const key = colorKey(value);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    };
    for (const shape of svg.querySelectorAll(SHAPES)) {
      const computed = getComputedStyle(shape);
      if (!/url\(/.test(computed.fill) && !isDefaultFill(shape, svg, computed)) add(computed.fill);
      if (!/url\(/.test(computed.stroke)) add(computed.stroke);
    }
    for (const stop of svg.querySelectorAll('stop')) add(getComputedStyle(stop).stopColor);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value]) => value);
  }
  // 아무도 채움색을 정하지 않아 기본 검정으로 계산된 경우(선만 있는 모양 등)는 실제로 보이지 않으므로 빼냅니다.
  function isDefaultFill(shape, svg, computed) {
    if (colorKey(computed.fill) !== '#000000') return false;
    for (let node = shape; node; node = node.parentElement) {
      if (node.hasAttribute('fill') || styleMap(node).fill) return false;
      if (node === svg) break;
    }
    return true;
  }

  // from 색으로 보이는 부분을 to 색으로 바꿉니다. all이면 보이는 모든 색을 한 색으로 칠합니다.
  function recolorIcon({ from, to, all = false } = {}) {
    const svg = selection?.el;
    if (!svg || !to) return;
    const m = mod(idOf(svg));
    if (!m) return;
    const targets = [];
    for (const shape of svg.querySelectorAll(SHAPES)) {
      const computed = getComputedStyle(shape);
      for (const prop of ['fill', 'stroke']) {
        if (/url\(/.test(computed[prop])) continue;
        if (prop === 'fill' && isDefaultFill(shape, svg, computed)) continue;
        const key = colorKey(computed[prop]);
        if (key && (all || key === from)) targets.push([shape, prop]);
      }
    }
    for (const stop of svg.querySelectorAll('stop')) {
      const key = colorKey(getComputedStyle(stop).stopColor);
      if (key && (all || key === from)) targets.push([stop, 'stop-color']);
    }
    if (!targets.length) return;
    const mirrorRoots = mirrorsOf(m);
    for (const [node, prop] of targets) {
      const modelNode = mod(idOf(node));
      setStyleProp(node, prop, to);
      if (modelNode) {
        setStyleProp(modelNode, prop, to);
        // 반복된 묶음의 같은 자리에도 똑같이 칠합니다.
        const path = [];
        for (let cursor = modelNode; cursor && cursor !== m; cursor = cursor.parentElement) path.unshift(childIndex(cursor));
        for (const root of mirrorRoots) {
          const twin = path.reduce((current, index) => current?.children[index] || null, root);
          if (!twin) continue;
          setStyleProp(twin, prop, to);
          const liveTwin = live(idOf(twin));
          if (liveTwin) setStyleProp(liveTwin, prop, to);
        }
      }
    }
    commit('아이콘 색 변경', { coalesce: `icon-color:${idOf(svg)}:${all ? 'all' : from}` });
  }

  function setAlt(value) {
    if (selection?.kind !== 'image') return;
    setAttrPair(idOf(selection.el), 'alt', value);
    commit('대체 텍스트 수정');
  }

  function setLink({ href, newTab }) {
    const anchor = selection?.el.closest('a');
    if (!anchor) return;
    const id = idOf(anchor);
    setAttrPair(id, 'href', href);
    if (newTab) {
      setAttrPair(id, 'target', '_blank');
      setAttrPair(id, 'rel', 'noopener noreferrer');
    } else {
      setAttrPair(id, 'target', null);
      if (mod(id)?.getAttribute('rel') === 'noopener noreferrer') setAttrPair(id, 'rel', null);
    }
    commit('링크 수정');
  }

  const youtubeId = url => {
    const match = String(url || '').trim().match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/) ||
      String(url || '').trim().match(/^([\w-]{11})$/);
    return match ? match[1] : null;
  };
  function videoFrameFor(el) {
    if (el.tagName === 'IFRAME') return el;
    return el.querySelector('iframe') || (el.closest('.activity-project-card')?.querySelector('iframe')) || null;
  }
  function setVideo(url) {
    const frame = selection && videoFrameFor(selection.el);
    const id = youtubeId(url);
    if (!frame) return;
    if (!id) {
      toast('유튜브 주소를 확인해 주세요.', 'error');
      return;
    }
    const frameModel = mod(idOf(frame));
    const oldSrc = frameModel.getAttribute('src') || '';
    const query = oldSrc.includes('?') ? oldSrc.slice(oldSrc.indexOf('?')) : '?rel=0&playsinline=1&hl=ko';
    setAttrPair(idOf(frame), 'src', `https://www.youtube.com/embed/${id}${query}`);
    const link = frame.closest('.activity-project-card')?.querySelector('.activity-project-link');
    if (link) setAttrPair(idOf(link), 'href', `https://www.youtube.com/watch?v=${id}`);
    commit('영상 수정');
  }

  function categoriesOf(gallery) {
    return [...gallery.querySelectorAll('[data-gallery-category]')].map(button => ({
      value: button.getAttribute('data-gallery-category'),
      label: (button.getAttribute('aria-label') || button.firstChild?.textContent || '').trim()
    }));
  }
  function setSlide({ title, description, category }) {
    const slide = selection && slideFor(selection.el);
    if (!slide) return;
    const id = idOf(slide);
    const m = mod(id);
    let reload = false;
    if (typeof title === 'string') {
      setAttrPair(id, 'data-title', title);
      for (const figure of [slide, m]) {
        const caption = figure.querySelector('figcaption');
        if (caption) caption.textContent = title;
      }
      if (slide === currentSlide()) {
        const caption = document.querySelector('.activity-gallery-caption');
        if (caption) caption.textContent = title;
      }
    }
    if (typeof description === 'string') {
      setAttrPair(id, 'data-description', description);
      if (slide === currentSlide()) {
        const text = document.querySelector('.activity-gallery-description');
        if (text) text.textContent = description;
      }
    }
    if (category && category !== m.getAttribute('data-category')) {
      const previous = m.getAttribute('data-category');
      const left = model.querySelectorAll(`.activity-gallery-slide[data-category="${previous}"]`).length;
      if (left <= 1) {
        toast('분류마다 사진이 한 장 이상 있어야 해요.', 'error');
        notifySelection();
        return;
      }
      setAttrPair(id, 'data-category', category);
      reload = true;
    }
    commit('갤러리 사진 정보 수정', reload ? { reload: true, selectPath: pathOf(m) } : {});
  }

  // 공유용 정보(og:title·og:description)가 원래 제목·설명과 같았다면 함께 바꿉니다.
  function setMeta({ title, description, note }) {
    if (typeof title === 'string') {
      const og = model.querySelector('meta[property="og:title"]');
      if (og && og.getAttribute('content') === model.title) og.setAttribute('content', title);
      model.title = title;
    }
    const meta = model.querySelector('meta[name="description"]');
    if (meta && typeof description === 'string') {
      const og = model.querySelector('meta[property="og:description"]');
      if (og && og.getAttribute('content') === meta.getAttribute('content')) og.setAttribute('content', description);
      meta.setAttribute('content', description);
    }
    if (typeof note === 'string') setFooterNote(note);
    commit('페이지 정보 수정');
  }

  // 공통 바닥글(#siteFooter)의 페이지 메모(사진 출처 등). 공통 스크립트가 data-note를 읽어 바닥글 끝에 붙입니다.
  const footerNoteHost = () => model.querySelector('#siteFooter');
  function setFooterNote(value) {
    const footer = footerNoteHost();
    if (!footer) return;
    const text = value.replace(/\s+/g, ' ').trim();
    setAttrPair(idOf(footer), 'data-note', text || null);
    const liveFooter = live(idOf(footer));
    if (!liveFooter) return;
    let note = liveFooter.querySelector('.footer-note');
    if (!text) return note?.remove();
    if (!note) {
      note = document.createElement('p');
      note.className = 'footer-note';
      const copy = liveFooter.querySelector('.footer-copy');
      if (copy) copy.after(note);
      else liveFooter.append(note);
    }
    note.textContent = text;
  }

  // 자주 묻는 질문의 분류(data-cat)를 바꿉니다. 분류별 질문 수는 저장할 때 자동으로 맞춰져요.
  function faqCategories() {
    return [...model.querySelectorAll('.faq-tab[data-cat]')]
      .filter(tab => tab.getAttribute('data-cat') !== 'all')
      .map(tab => ({
        value: tab.getAttribute('data-cat'),
        label: [...tab.childNodes].filter(node => node.nodeType === 3).map(node => node.data).join('').trim() || tab.getAttribute('data-cat')
      }));
  }
  function setCategory(value) {
    const item = selection?.el.closest('.faq-item');
    const m = item && mod(idOf(item));
    if (!m || !value || m.getAttribute('data-cat') === value) return;
    setAttrPair(idOf(item), 'data-cat', value);
    commit('질문 분류 변경', { reload: true, selectPath: pathOf(mod(idOf(selection.el)) || m) });
  }

  // ── 9. 구조 변경(복제·삭제·이동·HTML) 후에는 모델로 화면을 다시 그립니다. ──
  function itemModel() {
    const m = selection ? mod(idOf(unitOf(selection))) : null;
    if (!m || m.matches(PAGE_LEVEL) || m.closest('head')) {
      toast('이 요소는 복제·삭제·이동할 수 없어요.', 'error');
      return null;
    }
    return m;
  }

  const leadingSpace = node => {
    const previous = node.previousSibling;
    return previous && previous.nodeType === 3 && !previous.data.trim() ? previous : null;
  };

  function uniquifyIds(clone) {
    const map = new Map();
    const taken = id => model.getElementById(id) || [...map.values()].includes(id);
    for (const node of [clone, ...clone.querySelectorAll('[id]')]) {
      if (!node.id) continue;
      const base = node.id.replace(/-\d+$/, '');
      let index = 2;
      let candidate;
      do candidate = `${base}-${index++}`; while (taken(candidate));
      map.set(node.id, candidate);
      node.id = candidate;
    }
    if (!map.size) return;
    for (const node of [clone, ...clone.querySelectorAll('*')]) {
      for (const attr of [...node.attributes]) {
        let value = attr.value;
        if (/^(aria-(labelledby|describedby|controls|owns)|for)$/.test(attr.name)) {
          value = value.split(/\s+/).map(token => map.get(token) || token).join(' ');
        } else if ((attr.name === 'href' || attr.name === 'xlink:href') && value.startsWith('#') && map.has(value.slice(1))) {
          value = `#${map.get(value.slice(1))}`;
        } else if (value.includes('url(#')) {
          value = value.replace(/url\(#([^)]+)\)/g, (whole, id) => (map.has(id) ? `url(#${map.get(id)})` : whole));
        }
        if (value !== attr.value) node.setAttribute(attr.name, value);
      }
    }
  }

  function cloneAfter(m, before = false) {
    const clone = m.cloneNode(true);
    uniquifyIds(clone);
    const space = leadingSpace(m);
    if (before) {
      m.before(clone);
      if (space) m.before(model.createTextNode(space.data));
    } else {
      m.after(clone);
      if (space) m.after(model.createTextNode(space.data));
    }
    return clone;
  }

  // 요소를 다른 형제 앞이나 뒤로 옮기고, 앞쪽 줄바꿈·들여쓰기도 함께 옮겨 HTML 모양을 유지합니다.
  function placeRelative(m, target, after) {
    const space = leadingSpace(m);
    if (after) {
      target.after(m);
      if (space) m.before(space);
    } else {
      target.before(m);
      if (space) m.after(space);
    }
  }

  // 카드들이 가로로 놓였는지(←→) 세로로 놓였는지(↑↓) 봅니다.
  function axisOf(unit) {
    const sig = signature(unit);
    const other = [unit.previousElementSibling, unit.nextElementSibling].find(el => el && idOf(el) && signature(el) === sig);
    if (!other) return 'y';
    const a = unit.getBoundingClientRect();
    const b = other.getBoundingClientRect();
    return Math.abs(a.top - b.top) < Math.min(a.height, b.height) / 2 ? 'x' : 'y';
  }

  function removeWithSpace(m) {
    leadingSpace(m)?.remove();
    m.remove();
  }

  function moveUp(m) {
    const previous = m.previousElementSibling;
    if (!previous) return false;
    const space = leadingSpace(m);
    previous.before(m);
    if (space) m.after(space);
    return true;
  }

  function duplicateItem(before = false) {
    stopEditing(true);
    const m = itemModel();
    if (!m) return;
    let created = null;
    for (const target of [m, ...mirrorsOf(m)]) {
      const clone = cloneAfter(target, before);
      if (target === m) created = clone;
    }
    commit(`${describe(unitOf(selection))} ${before ? '앞에 ' : ''}추가`, { reload: true, selectPath: pathOf(created) });
  }

  // 끌어서 놓은 자리로 옮깁니다(target 앞 또는 뒤).
  function moveUnitTo(targetEl, after) {
    stopEditing(true);
    const m = itemModel();
    const t = mod(idOf(targetEl));
    if (!m || !t || m === t) return;
    const mirrorUnits = mirrorsOf(m);
    const mirrorTargets = mirrorsOf(t);
    placeRelative(m, t, after);
    mirrorUnits.forEach((unit, index) => { if (mirrorTargets[index]) placeRelative(unit, mirrorTargets[index], after); });
    commit(`${describe(unitOf(selection))} 위치 이동`, { reload: true, selectPath: pathOf(m) });
  }

  function removeItem() {
    stopEditing(true);
    const m = itemModel();
    if (!m) return;
    if (m.matches('.activity-gallery-slide')) {
      const category = m.getAttribute('data-category');
      if (model.querySelectorAll(`.activity-gallery-slide[data-category="${category}"]`).length <= 1) {
        toast('분류마다 사진이 한 장 이상 있어야 해서 삭제할 수 없어요.', 'error');
        return;
      }
    }
    const label = `${describe(unitOf(selection))} 삭제`;
    for (const target of [...mirrorsOf(m), m]) removeWithSpace(target);
    commit(label, { reload: true });
  }

  function moveItem(direction) {
    stopEditing(true);
    const m = itemModel();
    if (!m) return;
    const targets = [m, ...mirrorsOf(m)];
    let moved = false;
    for (const target of targets) {
      moved = direction < 0 ? moveUp(target) : (target.nextElementSibling ? moveUp(target.nextElementSibling) : false);
    }
    if (!moved) {
      toast(direction < 0 ? '이미 맨 앞이에요.' : '이미 맨 뒤예요.');
      return;
    }
    commit(`${describe(unitOf(selection))} 순서 이동`, { reload: true, selectPath: pathOf(m) });
  }

  function replaceHTML(html) {
    stopEditing(true);
    const m = selectedModel();
    if (!m || m.matches('html, head, body') || m.closest('head')) return;
    const template = model.createElement('template');
    template.innerHTML = String(html || '').trim();
    const nodes = [...template.content.childNodes];
    const first = nodes.find(node => node.nodeType === 1);
    if (!first) {
      toast('HTML 내용을 확인해 주세요.', 'error');
      return;
    }
    m.replaceWith(...nodes);
    commit('HTML 직접 수정', { reload: true, selectPath: pathOf(first) });
  }

  function selectParent() {
    if (!selection) return;
    stopEditing(true);
    let node = selection.el.parentElement;
    while (node && node !== document.body && !idOf(node)) node = node.parentElement;
    if (!node || node === document.body) {
      toast('더 위의 요소가 없어요.');
      return;
    }
    select(kindFor(node), node, { explicit: true });
  }

  // ── 10. 패널에 보낼 선택 정보 ──
  function crumbsOf(el) {
    const list = [];
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      if (!idOf(node)) continue;
      const meaningful = node === el || NAMES.some(([selector]) => node.matches(selector)) ||
        /^(SECTION|ARTICLE|LI|FIGURE|UL|OL|DL|NAV|HEADER|FOOTER)$/.test(node.tagName);
      if (meaningful) list.unshift({ id: idOf(node), name: describe(node) });
    }
    return list.slice(-6);
  }

  function selectionInfo() {
    if (!selection || !selection.el.isConnected) return null;
    const { kind, el } = selection;
    const item = unitOf(selection);
    const m = mod(idOf(el));
    const itemM = mod(idOf(item));
    if (!m) return null;
    const info = {
      key: `${idOf(el)}:${kind}:${selection.explicit ? 1 : 0}`,
      id: idOf(el),
      explicit: selection.explicit,
      kind,
      name: labelFor(el, kind),
      editing: editing === el,
      plain: kind === 'text' && el.matches(PLAIN),
      crumbs: crumbsOf(el),
      item: {
        name: describe(item),
        self: item === el,
        canUp: Boolean(itemM?.previousElementSibling),
        canDown: Boolean(itemM?.nextElementSibling),
        axis: axisOf(item),
        repeatable: isRepeatable(item)
      },
      // 요소 자체에 입힌 서식(없으면 사이트 기본 디자인)
      style: Object.fromEntries(BLOCK_PROPS.map(prop => [prop, styleMap(m)[prop] || ''])),
      position: currentTranslate(m),
      computedColor: getComputedStyle(el).color
    };
    if (kind === 'image') {
      info.image = { src: m.getAttribute('src') || '', alt: m.getAttribute('alt') || '', width: m.getAttribute('width'), height: m.getAttribute('height') };
    }
    // 사진이 들어간 자리의 크기: 사진 편집에서 '이 자리 비율'로 자를 때 써요.
    if (kind === 'image' || kind === 'bg') {
      const rect = el.getBoundingClientRect();
      info.frame = { w: Math.round(rect.width), h: Math.round(rect.height) };
    }
    if (kind === 'bg') {
      const url = getComputedStyle(el).backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
      info.bg = { src: url ? url[1] : '', overridden: hasStyleProp(m, 'background-image'), iconSized: isIconSized(el) };
    }
    if (kind === 'graphic') info.icon = { colors: iconColors(el) };
    const anchor = m.closest('a');
    // data-site-link 링크는 공통 설정(menu.js SITE_LINKS)이 실제 주소를 넣어 주므로 주소 대신 연결 이름을 알려 줍니다.
    if (anchor) {
      info.link = {
        href: anchor.getAttribute('href') || '',
        newTab: anchor.getAttribute('target') === '_blank',
        siteLink: anchor.getAttribute('data-site-link') || '',
        anchors: [...model.querySelectorAll('main section[id]')].slice(0, 4).map(section => `#${section.id}`)
      };
    }
    const faq = m.closest('.faq-item');
    if (faq) info.category = { value: faq.getAttribute('data-cat') || '', options: faqCategories() };
    const frame = videoFrameFor(el);
    if (frame) {
      const id = youtubeId(mod(idOf(frame))?.getAttribute('src'));
      info.video = { url: id ? `https://www.youtube.com/watch?v=${id}` : '' };
    }
    const slide = slideFor(el);
    if (slide) {
      const s = mod(idOf(slide));
      const gallery = model.querySelector('.activity-gallery');
      info.slide = {
        title: s.getAttribute('data-title') || '',
        description: s.getAttribute('data-description') || '',
        category: s.getAttribute('data-category') || '',
        categories: gallery ? categoriesOf(gallery) : []
      };
    }
    // 맞춤(열·행) 기준 후보와, 글자 옆에 붙일 수 있는 작은 그림·아이콘인지
    if (canMove(el)) info.align = alignRefs(el);
    info.layer = styleMap(m)['z-index'] ? 'front' : '';
    info.attachable = Boolean(attachUnitOf(el, kind));
    info.compact = isCompact(el);
    return info;
  }

  // 페이지 전체 틀이 옮겨져 있으면(예전 버전에서 실수로 옮긴 경우) 알려 줍니다.
  const shiftedFrames = () => [...model.querySelectorAll(PAGE_LEVEL)].filter(el => styleMap(el).translate);
  function pageMeta() {
    const footer = footerNoteHost();
    return {
      title: model.title,
      description: model.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      note: footer ? footer.getAttribute('data-note') || '' : null,
      shifted: shiftedFrames().map(el => ({ name: el.matches('.about-paper') ? '본문 전체' : describe(el), translate: styleMap(el).translate }))
    };
  }
  function resetPageShift() {
    const frames = shiftedFrames();
    if (!frames.length) return;
    for (const m of frames) {
      const liveEl = live(idOf(m));
      if (liveEl) setStyleProp(liveEl, 'translate', null);
      setStyleProp(m, 'translate', null);
    }
    commit('페이지 전체 위치 되돌리기');
  }

  // ── 11. 화면 위 편집 도구(그림자 DOM으로 페이지 스타일과 분리) ──
  const ICONS = {
    bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
    italic: '<path d="M10 5h8M6 19h8M14 5l-4 14"/>',
    underline: '<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/>',
    strong: '<path d="m12 3 2.6 5.6L20 9.4l-4 4 1 5.6-5-2.8L7 19l1-5.6-4-4 5.4-.8z"/>',
    linebreak: '<path d="M19 5v7a3 3 0 0 1-3 3H6"/><path d="m10 11-4 4 4 4"/>',
    eraser: '<path d="m7 21 13.3-13.3a2 2 0 0 0 0-2.8l-2.2-2.2a2 2 0 0 0-2.8 0L3.7 14.3a2 2 0 0 0 0 2.8L7.6 21H21"/><path d="m9 11 6 6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    parent: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5A5.5 5.5 0 0 1 20 14.5 5.5 5.5 0 0 1 14.5 20H11"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    grip: '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    align: '<path d="M4 3v18"/><rect x="8" y="6" width="12" height="4" rx="1"/><rect x="8" y="14" width="7" height="4" rx="1"/>',
    attach: '<path d="m20 11-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 16.7a1.7 1.7 0 0 1-2.4-2.4L15 6.6"/>',
    'x-start': '<path d="M4 3v18"/><rect x="7" y="6" width="13" height="4" rx="1"/><rect x="7" y="14" width="8" height="4" rx="1"/>',
    'x-center': '<path d="M12 3v18"/><rect x="5" y="6" width="14" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/>',
    'x-end': '<path d="M20 3v18"/><rect x="4" y="6" width="13" height="4" rx="1"/><rect x="9" y="14" width="8" height="4" rx="1"/>',
    'y-start': '<path d="M3 4h18"/><rect x="6" y="7" width="4" height="13" rx="1"/><rect x="14" y="7" width="4" height="8" rx="1"/>',
    'y-center': '<path d="M3 12h18"/><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/>',
    'y-end': '<path d="M3 20h18"/><rect x="6" y="4" width="4" height="13" rx="1"/><rect x="14" y="9" width="4" height="8" rx="1"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

  // 사이트에서 쓰는 색을 중심으로 고른 글자 색(site.config.json의 palette로 바꿀 수 있어요)
  const PALETTE = Array.isArray(PAGE.palette) && PAGE.palette.length ? PAGE.palette : [
    ['#162021', '검정'], ['#3b4250', '진회색'], ['#677074', '회색'], ['#a3abbb', '연회색'], ['#ffffff', '흰색'],
    ['#1249ee', '대표 파랑'], ['#244cd2', '진파랑'], ['#193d87', '남색'], ['#5b8cff', '하늘색'], ['#7c5cff', '보라'],
    ['#e5483a', '빨강'], ['#ed961a', '주황'], ['#f2c230', '노랑'], ['#12a35e', '초록'], ['#d6409f', '분홍']
  ];
  // 사이트에 들어 있는 글꼴(배포해도 그대로 보임)과 기본 명조체(site.config.json의 fonts로 바꿀 수 있어요)
  const FONTS = [['', '기본 글꼴'], ...(Array.isArray(PAGE.fonts) && PAGE.fonts.length ? PAGE.fonts : [
    ["'School Pretendard', Pretendard, sans-serif", '프리텐다드'],
    ["'School Paperlogy', 'School Pretendard', sans-serif", '페이퍼로지 (제목용)'],
    ["'School Giants', 'School Pretendard', sans-serif", '자이언츠 (굵은 제목)'],
    ["'Noto Serif KR', 'Nanum Myeongjo', Batang, serif", '명조체']
  ])];

  let pickerOpen = false; // 색 고르기 창이 열려 있는 동안에는 창 전환으로 편집이 끝나지 않게 합니다.
  let drag = null;

  const ui = (() => {
    const host = document.createElement('div');
    host.setAttribute('data-bo-internal', '');
    // 문서 맨 위 왼쪽에 붙인 층: 페이지에 붙은 표시(선택 상자 등)는 문서 기준 좌표로 두어 스크롤할 때 페이지와 함께 움직여요(화면 기준이면 한 박자 늦게 따라와 들썩여요).
    // 옆으로는 화면 너비에서 잘라, 표시가 페이지 오른쪽 밖으로 나가도 가로 스크롤이 생기지 않게 합니다.
    host.style.cssText = 'all: initial !important; position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 0 !important; overflow-x: clip !important; overflow-y: visible !important; pointer-events: none !important; z-index: 2147483647 !important; display: block !important;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        .box { position: absolute; display: none; pointer-events: none; border-radius: 4px; }
        .box.on { display: block; }
        .hover { outline: 1.5px dashed #5b7cff; outline-offset: 2px; background: rgba(91, 124, 255, .04); }
        .hover.drop { outline: 3px solid #12b76a; background: rgba(18, 183, 106, .12); }
        .item { outline: 1.5px dashed rgba(255, 138, 0, .7); outline-offset: 5px; }
        .item.strong { outline: 2px solid #ff8a00; background: rgba(255, 138, 0, .07); }
        .sel { outline: 2px solid #2f5bff; outline-offset: 2px; }
        .sel.editing { outline-color: #2f5bff; box-shadow: 0 0 0 6px rgba(47, 91, 255, .14); }
        .tag { position: absolute; left: -3px; bottom: calc(100% + 6px); max-width: 320px; overflow: hidden; text-overflow: ellipsis;
          font: 600 11px/1 'School Pretendard', Pretendard, 'Malgun Gothic', sans-serif; letter-spacing: -.01em; padding: 5px 7px; border-radius: 5px;
          background: #2f5bff; color: #fff; white-space: nowrap; }
        .hover .tag { background: #5b7cff; }
        .hover.drop .tag { background: #12b76a; }
        .item .tag { background: #ff8a00; bottom: auto; top: calc(100% + 8px); }
        .tag:empty { display: none; }
        .toolbar { position: absolute; display: none; flex-wrap: wrap; align-items: center; gap: 2px; max-width: calc(100vw - 16px); padding: 4px; border-radius: 10px;
          background: #15171c; color: #fff; box-shadow: 0 10px 30px rgba(10, 16, 32, .28), 0 0 0 1px rgba(255, 255, 255, .06) inset; pointer-events: auto;
          font: 500 12px/1 'School Pretendard', Pretendard, 'Malgun Gothic', sans-serif; letter-spacing: -.01em; user-select: none; }
        .toolbar.on { display: flex; }
        .toolbar .label { padding: 0 8px 0 6px; color: #aab3c5; white-space: nowrap; max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
        button { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 5px; height: 30px; min-width: 30px; padding: 0 7px; justify-content: center;
          border-radius: 7px; color: #f3f5f9; cursor: pointer; white-space: nowrap; font: inherit; }
        .toolbar button:hover, .pop button:hover { background: rgba(255, 255, 255, .12); }
        .toolbar button.primary { background: #2f5bff; padding: 0 10px; }
        .toolbar button.primary:hover { background: #4a70ff; }
        .toolbar button.danger:hover { background: rgba(240, 68, 56, .9); }
        .toolbar button[data-act="drag"] { cursor: grab; }
        .toolbar button.text { font-weight: 700; font-size: 13px; padding: 0 6px; }
        .toolbar button.text small { font-size: 9px; color: #aab3c5; margin-left: -2px; }
        svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
        button[data-act="drag"] svg { fill: currentColor; stroke: none; }
        .toolbar .sep { width: 1px; height: 18px; background: rgba(255, 255, 255, .14); margin: 0 3px; }
        .toolbar .unit { color: #ffb366; padding: 0 4px 0 2px; white-space: nowrap; }
        .color-mark { display: grid; justify-items: center; gap: 1px; color: #fff; font-weight: 800; font-size: 13px; line-height: 1; }
        .color-mark i { display: block; width: 16px; height: 4px; border-radius: 2px; background: var(--text-color); box-shadow: 0 0 0 1px rgba(255, 255, 255, .65); }
        .pop { position: absolute; display: none; width: 236px; padding: 10px; border-radius: 12px; background: #15171c; color: #fff; pointer-events: auto;
          box-shadow: 0 14px 40px rgba(10, 16, 32, .32), 0 0 0 1px rgba(255, 255, 255, .06) inset;
          font: 500 12px/1.3 'School Pretendard', Pretendard, 'Malgun Gothic', sans-serif; user-select: none; }
        .pop.on { display: block; }
        .pop h5 { margin: 0 0 8px; font-size: 11px; font-weight: 600; color: #aab3c5; }
        .swatches { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
        .swatches button { height: 30px; min-width: 0; padding: 0; border-radius: 8px; box-shadow: 0 0 0 1px rgba(255, 255, 255, .18) inset; }
        .swatches button:hover { outline: 2px solid #fff; outline-offset: 1px; background: inherit; }
        .pop-row { display: flex; gap: 6px; margin-top: 10px; }
        .pop-row button, .pop-row label { flex: 1; height: 30px; border-radius: 8px; background: rgba(255, 255, 255, .08); justify-content: center; }
        .pop-row label { display: inline-flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; position: relative; overflow: hidden; }
        .pop-row input[type="color"] { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; border: 0; padding: 0; }
        .fonts { display: grid; gap: 2px; }
        .fonts button { justify-content: flex-start; height: 36px; padding: 0 10px; font-size: 15px; }
        .fonts button[aria-pressed="true"] { background: rgba(91, 124, 255, .3); }
        .add { position: absolute; display: none; width: 26px; height: 26px; min-width: 0; padding: 0; border-radius: 50%; background: #ff8a00; color: #fff;
          box-shadow: 0 4px 12px rgba(255, 138, 0, .45), 0 0 0 3px #fff; pointer-events: auto; transform: translate(-50%, -50%); }
        .add.on { display: inline-flex; }
        .add:hover { background: #ff7000; transform: translate(-50%, -50%) scale(1.12); }
        .add svg { width: 15px; height: 15px; stroke-width: 2.6; }
        .dropline { position: absolute; display: none; border-radius: 3px; background: #ff8a00; box-shadow: 0 0 0 3px rgba(255, 138, 0, .25); pointer-events: none; }
        .dropline.on { display: block; }
        .drag-tip { position: fixed; display: none; padding: 6px 9px; border-radius: 7px; background: #ff8a00; color: #fff; pointer-events: none;
          font: 700 12px/1 'School Pretendard', Pretendard, 'Malgun Gothic', sans-serif; white-space: nowrap; transform: translate(14px, 14px); }
        .drag-tip.on { display: block; }
        .move-handle { position: absolute; display: none; width: 30px; height: 30px; min-width: 0; padding: 0; border-radius: 50%; background: #2f5bff; color: #fff;
          box-shadow: 0 4px 14px rgba(47, 91, 255, .45), 0 0 0 3px #fff; pointer-events: auto; transform: translate(-50%, -50%); cursor: move; touch-action: none; }
        .move-handle.on { display: inline-flex; }
        .move-handle:hover { background: #1f46e0; transform: translate(-50%, -50%) scale(1.1); }
        .move-handle svg { width: 17px; height: 17px; stroke-width: 2.2; }
        .move-handle.moving { cursor: grabbing; }
        .drag-preview { position: fixed; display: none; pointer-events: none; }
        .drag-preview.on { display: block; }
        .drag-preview > * { position: absolute !important; left: 0 !important; top: 0 !important; }
        .ghost { position: absolute; display: none; border: 1.5px dashed #8a94a8; border-radius: 4px; background: rgba(138, 148, 168, .08); pointer-events: none; }
        .ghost.on { display: block; }
        .ghost .tag { background: #8a94a8; }
        .toolbar button[data-act="move"] { cursor: move; }
        /* 맞춤: 분홍 안내선과 기준 요소 */
        .guide { position: absolute; display: none; pointer-events: none; background: #ff2d75; box-shadow: 0 0 0 .5px rgba(255, 255, 255, .7); }
        .guide.on { display: block; }
        .guide.gx { width: 1.5px; margin-left: -.75px; }
        .guide.gy { height: 1.5px; margin-top: -.75px; }
        .hover.attach { outline: 2px solid #ff8a00; background: rgba(255, 138, 0, .08); }
        .hover.attach .tag { background: #ff8a00; }
        .box.ref { outline: 1.5px dashed #ff2d75; outline-offset: 2px; background: rgba(255, 45, 117, .07); }
        .box.ref .tag { background: #ff2d75; }
        .pop[data-pop="align"] { width: 264px; }
        .align-group + .align-group { margin-top: 12px; }
        .align-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
        .align-head b { font-size: 12px; font-weight: 700; white-space: nowrap; }
        .align-head select { all: unset; box-sizing: border-box; min-width: 0; max-width: 170px; height: 26px; padding: 0 22px 0 8px; border-radius: 7px; background: rgba(255, 255, 255, .1); color: #fff;
          font: 500 11px/26px 'School Pretendard', Pretendard, 'Malgun Gothic', sans-serif; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23aab3c5' stroke-width='2.4' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 6px center; background-size: 12px; }
        .align-head select option { color: #15171c; }
        .align-buttons { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
        .align-buttons button { flex-direction: column; height: 46px; gap: 3px; border-radius: 8px; background: rgba(255, 255, 255, .06); font-size: 11px; }
        .align-buttons button svg { width: 18px; height: 18px; }
        .pop .pop-note { margin: 10px 0 0; color: #aab3c5; font-size: 11px; line-height: 1.45; }
        /* 글자 옆에 붙이기 */
        .attach-bar { position: absolute; display: none; width: 3px; margin-left: -1.5px; border-radius: 2px; background: #ff8a00; box-shadow: 0 0 0 3px rgba(255, 138, 0, .28); pointer-events: none; }
        .attach-bar.on { display: block; }
        .banner { position: fixed; left: 50%; top: 14px; display: none; align-items: center; gap: 10px; max-width: calc(100vw - 24px); padding: 8px 8px 8px 14px; border-radius: 12px;
          transform: translateX(-50%); background: #15171c; color: #fff; pointer-events: auto; box-shadow: 0 12px 34px rgba(10, 16, 32, .32);
          font: 500 12px/1.4 'School Pretendard', Pretendard, 'Malgun Gothic', sans-serif; letter-spacing: -.01em; user-select: none; }
        .banner.on { display: flex; flex-wrap: wrap; }
        .banner b { font-weight: 700; color: #ffb366; }
        .banner span { color: #aab3c5; }
        .banner .chips { display: flex; gap: 2px; padding: 2px; border-radius: 9px; background: rgba(255, 255, 255, .08); }
        .banner .chips button { height: 28px; font-size: 12px; }
        .banner .chips button[aria-pressed="true"] { background: #ff8a00; color: #fff; }
        .banner .cancel { height: 28px; background: rgba(255, 255, 255, .1); }
        .banner button:hover { background: rgba(255, 255, 255, .16); }
      </style>
      <div class="box ref"><span class="tag">맞출 기준</span></div>
      <div class="guide gx"></div>
      <div class="guide gy"></div>
      <div class="attach-bar"></div>
      <div class="banner" role="status"></div>
      <div class="box hover"><span class="tag"></span></div>
      <div class="box item"><span class="tag"></span></div>
      <div class="box sel"><span class="tag"></span></div>
      <button class="add" data-add="before" title="앞에 하나 더 추가">${icon('plus')}</button>
      <button class="add" data-add="after" title="뒤에 하나 더 추가">${icon('plus')}</button>
      <div class="dropline"></div>
      <div class="drag-tip"></div>
      <div class="ghost"><span class="tag">원래 위치</span></div>
      <div class="drag-preview"></div>
      <button class="move-handle" title="끌어서 위치 옮기기 · Shift를 누르면 한 방향으로만 · 더블클릭하면 원래 위치">${icon('move')}</button>
      <div class="toolbar" role="toolbar" aria-label="편집 도구"></div>
      <div class="pop" data-pop="color">
        <h5>글자 색 · 글자를 드래그해 고르면 그 부분만 바뀌어요</h5>
        <div class="swatches">${PALETTE.map(([value, name]) => `<button data-color="${value}" title="${name}" style="background:${value}"></button>`).join('')}</div>
        <div class="pop-row"><button data-color="">기본색으로</button><label>직접 고르기<input type="color" value="#1249ee" aria-label="색 직접 고르기"></label></div>
      </div>
      <div class="pop" data-pop="font">
        <h5>글꼴</h5>
        <div class="fonts">${FONTS.map(([value, name]) => `<button data-font="${value.replace(/"/g, '&quot;')}" style="font-family:${value.replace(/"/g, '&quot;') || 'inherit'}">${name}</button>`).join('')}</div>
      </div>
      <div class="pop" data-pop="align"></div>`;
    const hover = root.querySelector('.hover');
    const item = root.querySelector('.item');
    const sel = root.querySelector('.sel');
    const refBox = root.querySelector('.box.ref');
    const guideX = root.querySelector('.guide.gx');
    const guideY = root.querySelector('.guide.gy');
    const attachBar = root.querySelector('.attach-bar');
    const banner = root.querySelector('.banner');
    const toolbar = root.querySelector('.toolbar');
    const pops = [...root.querySelectorAll('.pop')];
    const addBefore = root.querySelector('[data-add="before"]');
    const addAfter = root.querySelector('[data-add="after"]');
    const dropline = root.querySelector('.dropline');
    const dragTip = root.querySelector('.drag-tip');
    const moveHandle = root.querySelector('.move-handle');
    const ghost = root.querySelector('.ghost');
    const dragPreview = root.querySelector('.drag-preview');
    let toolbarKey = '';
    let openPop = null;
    let toolbarFixed = false;

    const isShown = visible;

    // 표시 놓기: 화면 좌표(x, y)를 받아, 페이지와 함께 스크롤될 표시는 문서 기준(absolute)으로,
    // 화면에 붙은 요소(고정 머리말 등)의 표시나 화면 가장자리에 붙인 표시는 화면 기준(fixed)으로 둡니다.
    function put(node, x, y, fixed = false) {
      node.style.position = fixed ? 'fixed' : 'absolute';
      node.style.left = `${fixed ? x : x + scrollX}px`;
      node.style.top = `${fixed ? y : y + scrollY}px`;
    }
    // 화면에 붙어 스크롤해도 움직이지 않는 요소(position: fixed·sticky 안)인지. 한 화면(프레임)마다 새로 잽니다.
    const pinCache = new Map();
    function pinned(el) {
      if (!el) return false;
      if (pinCache.has(el)) return pinCache.get(el);
      let result = false;
      for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
        const position = getComputedStyle(node).position;
        if (position === 'fixed' || position === 'sticky') {
          result = true;
          break;
        }
      }
      pinCache.set(el, result);
      return result;
    }

    // 끄는 동안 보여 줄 모습: 페이지의 규칙이 닿지 않는 이 층에 보이는 모양(크기·색·배경·도형 색)을 그대로 옮겨 그립니다.
    const BOX_LOOK = ['display', 'align-items', 'justify-content', 'flex-direction', 'gap', 'padding', 'border', 'border-radius', 'background-color', 'background-image',
      'background-size', 'background-position', 'background-repeat', 'box-shadow', 'color', 'font', 'line-height', 'letter-spacing', 'text-align', 'white-space',
      'object-fit', 'object-position', 'opacity', 'overflow'];
    const SHAPE_LOOK = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'fill-opacity', 'stroke-opacity', 'opacity', 'transform', 'transform-origin'];
    function preview(el) {
      if (!el) {
        dragPreview.classList.remove('on');
        dragPreview.replaceChildren();
        return;
      }
      const copy = el.cloneNode(true);
      const from = [el, ...el.querySelectorAll('*')];
      const to = [copy, ...copy.querySelectorAll('*')];
      from.forEach((src, index) => {
        const dst = to[index];
        if (!dst) return;
        for (const name of ['id', 'class', 'style', 'data-bo-id', 'data-bo-grab']) dst.removeAttribute(name);
        const cs = getComputedStyle(src);
        const shape = src instanceof SVGElement && !(src instanceof SVGSVGElement);
        const decl = (shape ? SHAPE_LOOK : BOX_LOOK).map(name => `${name}:${cs.getPropertyValue(name)}`);
        if (!shape) {
          const r = src.getBoundingClientRect();
          decl.push('box-sizing:border-box', `width:${r.width}px`, `height:${r.height}px`, 'margin:0', 'flex:none', 'max-width:none', 'max-height:none');
          if (index) decl.push(`transform:${cs.transform}`);
        }
        dst.setAttribute('style', decl.join(';'));
      });
      dragPreview.replaceChildren(copy);
      dragPreview.classList.add('on');
    }

    function place(box, el) {
      if (!isShown(el)) return box.classList.remove('on');
      const rect = el.getBoundingClientRect();
      if (!rect.width && !rect.height) return box.classList.remove('on');
      put(box, rect.left, rect.top, pinned(el));
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      box.classList.add('on');
    }

    function placeToolbar() {
      if (!selection || !toolbar.classList.contains('on')) return;
      toolbar.style.visibility = isShown(selection.el) && !move?.active ? '' : 'hidden';
      const rect = selection.el.getBoundingClientRect();
      const width = toolbar.offsetWidth;
      const height = toolbar.offsetHeight;
      // 선택한 것 위(자리가 없으면 아래)에 붙여 함께 스크롤되고, 화면 아래 끝에 붙잡아 둘 때만 화면 기준으로 둡니다.
      let fixed = pinned(selection.el);
      let top = rect.top - height - 30;
      if (top < 8) {
        // 낮은 항목은 '뒤에 추가(＋)'가 상자 바로 아래에 떠 있으므로 그만큼 더 내려 가리지 않게
        top = rect.bottom + (addAfter.classList.contains('on') && rect.height < 64 ? 34 : 12);
        if (top > innerHeight - height - 8) {
          top = innerHeight - height - 8;
          fixed = true;
        }
      }
      if (rect.bottom < 0 || rect.top > innerHeight) {
        top = -999;
        fixed = true;
      }
      const left = Math.max(8, Math.min(rect.left - 3, innerWidth - width - 8));
      put(toolbar, left, top, fixed);
      toolbarFixed = fixed;
      if (openPop) placePop();
    }

    // 선택 상자 오른쪽 위의 이동 손잡이와, 끄는 동안의 '원래 위치' 표시·거리 안내
    // 작은 아이콘·그림은 손잡이·＋ 버튼이 아이콘을 가려 다루기 어려우므로, 손잡이 없이 아이콘 자체를 끌어서 옮깁니다.
    function placeMoveUI() {
      const target = move?.el || selection?.el;
      const showHandle = Boolean(target && !drag && !attach && canMove(target) && isShown(target) && !isCompact(target));
      moveHandle.classList.toggle('on', showHandle);
      moveHandle.classList.toggle('moving', Boolean(move?.active));
      if (showHandle) {
        const rect = target.getBoundingClientRect();
        // 조금 작은 요소는 손잡이가 요소를 가리지 않도록 바깥쪽으로 띄웁니다.
        const offset = rect.width < 96 || rect.height < 56 ? 20 : 0;
        const x = rect.right + offset;
        const y = rect.top - offset;
        // 화면 가장자리에 붙잡아 둘 때만 화면 기준
        const clamped = x > innerWidth - 18 || y < 18;
        put(moveHandle, Math.min(x, innerWidth - 18), Math.max(y, 18), clamped || pinned(target));
      }
      const active = Boolean(move?.active);
      const k = move?.scale || 1;
      ghost.classList.toggle('on', active && Boolean(move.x || move.y));
      if (!active) return;
      const rect = move.el.getBoundingClientRect();
      put(ghost, rect.left - move.x * k, rect.top - move.y * k, pinned(move.el));
      if (dragPreview.classList.contains('on')) {
        dragPreview.style.left = `${rect.left}px`;
        dragPreview.style.top = `${rect.top}px`;
      }
      ghost.style.width = `${rect.width}px`;
      ghost.style.height = `${rect.height}px`;
    }

    // 분홍 안내선: 끌어서 옮기는 중에 줄이 맞은 곳, 또는 맞춤 버튼에 마우스를 올렸을 때 맞춰질 줄
    function placeGuides() {
      let gx = null;
      let gy = null;
      let ref = null;
      if (move?.active && move.guide) {
        const k = move.scale || 1;
        const rect = shiftRect(move.rect0, (move.x - move.baseX) * k, (move.y - move.baseY) * k);
        const span = (target, axis) => (axis === 'x'
          ? { from: Math.min(rect.top, target.top), to: Math.max(rect.bottom, target.bottom) }
          : { from: Math.min(rect.left, target.left), to: Math.max(rect.right, target.right) });
        if (move.guide.x) gx = { at: move.guide.x.at - scrollX, ...shiftSpan(span(move.guide.x.target.doc, 'x'), -scrollY) };
        if (move.guide.y) gy = { at: move.guide.y.at - scrollY, ...shiftSpan(span(move.guide.y.target.doc, 'y'), -scrollX) };
      } else if (alignPreview && selection && alignPreview.ref.isConnected) {
        ref = alignPreview.ref;
        if (alignPreview.axis && alignPreview.edge) {
          const a = selection.el.getBoundingClientRect();
          const b = ref.getBoundingClientRect();
          const at = linesOf(b, alignPreview.axis)[Math.max(0, EDGES.indexOf(alignPreview.edge))];
          const guide = alignPreview.axis === 'x'
            ? { at, from: Math.min(a.top, b.top), to: Math.max(a.bottom, b.bottom) }
            : { at, from: Math.min(a.left, b.left), to: Math.max(a.right, b.right) };
          if (alignPreview.axis === 'x') gx = guide;
          else gy = guide;
        }
      }
      place(refBox, ref);
      const fixed = pinned(move?.el || selection?.el);
      for (const [line, guide, axis] of [[guideX, gx, 'x'], [guideY, gy, 'y']]) {
        line.classList.toggle('on', Boolean(guide));
        if (!guide) continue;
        const pad = 10;
        if (axis === 'x') {
          put(line, guide.at, guide.from - pad, fixed);
          line.style.height = `${guide.to - guide.from + pad * 2}px`;
        } else {
          put(line, guide.from - pad, guide.at, fixed);
          line.style.width = `${guide.to - guide.from + pad * 2}px`;
        }
      }
    }
    const shiftSpan = (span, delta) => ({ from: span.from + delta, to: span.to + delta });

    // 글자 옆에 붙이기: 위쪽 안내 띠, 붙일 자리 표시
    function renderBanner() {
      banner.classList.toggle('on', Boolean(attach));
      if (!attach) return;
      banner.innerHTML = `
        <b>${attach.mode === 'copy' ? '복제해서 붙이기' : '옮겨 붙이기'}</b>
        <span>붙일 글자를 클릭하세요 · 오른쪽 절반은 뒤에, 왼쪽 절반은 앞에 붙어요</span>
        <div class="chips" role="group" aria-label="붙이는 방법">
          <button data-attach-mode="copy" aria-pressed="${String(attach.mode === 'copy')}">복제</button>
          <button data-attach-mode="move" aria-pressed="${String(attach.mode === 'move')}">옮기기</button>
        </div>
        <button class="cancel" data-attach-cancel>취소 (Esc)</button>`;
    }
    banner.addEventListener('mousedown', event => event.preventDefault());
    banner.addEventListener('click', event => {
      const choice = event.target.closest('[data-attach-mode]');
      if (choice && attach) {
        attach.mode = choice.dataset.attachMode;
        renderBanner();
      } else if (event.target.closest('[data-attach-cancel]')) cancelAttach();
    });
    // 붙일 자리(글자 옆에 붙이기 중이거나, 끌어서 다른 칸에 놓으려는 중일 때)
    const pendingHit = () => attach?.hit || (move?.active && move.hidden ? move.rehome : null) || null;
    function placeAttach() {
      const hit = pendingHit();
      attachBar.classList.toggle('on', Boolean(hit));
      if (!hit) return;
      put(attachBar, hit.bar.x - scrollX, hit.bar.top - scrollY);
      attachBar.style.height = `${hit.bar.height}px`;
    }

    function startMoveDrag(event, handle) {
      if (!selection || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (!beginMove(selection.el, event.clientX, event.clientY, { immediate: true })) return;
      try { handle.setPointerCapture(event.pointerId); } catch {}
    }
    moveHandle.addEventListener('mousedown', event => event.preventDefault());
    moveHandle.addEventListener('pointerdown', event => startMoveDrag(event, moveHandle));
    moveHandle.addEventListener('dblclick', () => setPosition({ x: 0, y: 0 }));

    // 카드처럼 반복되는 항목이면 앞뒤 가장자리에 ＋ 버튼을 띄웁니다(작은 아이콘은 가리지 않도록 도구 상자의 복제 버튼을 씁니다).
    function placeAddButtons() {
      const unit = selection && !drag && !attach && !move?.active ? unitOf(selection) : null;
      const show = unit && isShown(unit) && isRepeatable(unit) && !isCompact(unit);
      addBefore.classList.toggle('on', Boolean(show));
      addAfter.classList.toggle('on', Boolean(show));
      if (!show) return;
      const rect = unit.getBoundingClientRect();
      const horizontal = axisOf(unit) === 'x';
      // 보통은 가장자리 가운데에 붙이고, 글자 한 줄처럼 낮은(좁은) 항목은 두 버튼이 글자를 가리고 서로 겹치므로 상자 바깥에 띄웁니다.
      // 위아래로 늘어선 항목은 오른쪽 끝 위 · 아래(왼쪽 위의 '입력 중' 표시를 피해서), 가로로 늘어선 칸은 왼쪽 · 오른쪽 바깥.
      const OUT = 17;
      let bx, by, ax, ay;
      if (horizontal) {
        const out = rect.width < 64 ? OUT : 0;
        [bx, by, ax, ay] = [rect.left - out, rect.top + rect.height / 2, rect.right + out, rect.top + rect.height / 2];
      } else if (rect.height < 64) {
        const x = Math.max(rect.left + rect.width / 2, rect.right - 24);
        [bx, by, ax, ay] = [x, rect.top - OUT, x, rect.bottom + OUT];
      } else {
        [bx, by, ax, ay] = [rect.left + rect.width / 2, rect.top, rect.left + rect.width / 2, rect.bottom];
      }
      const fixed = pinned(unit);
      // 페이지 맨 끝 항목이면 ＋를 문서 밖에 두지 않고 상자 안쪽 아래로(밖에 두면 페이지가 잠깐 길어졌다 줄어요)
      const pageBottom = document.body.getBoundingClientRect().bottom;
      if (!fixed && ay + 12 > pageBottom) ay = Math.min(ay, rect.bottom - 12);
      put(addBefore, bx, by, fixed);
      put(addAfter, ax, ay, fixed);
      addBefore.title = '앞에 하나 더 추가';
      addAfter.title = '뒤에 하나 더 추가';
    }

    function renderToolbar() {
      if (!selection || attach) {
        toolbar.classList.remove('on');
        toolbarKey = '';
        closePop();
        return;
      }
      const { kind, el } = selection;
      const unit = unitOf(selection);
      const axis = axisOf(unit);
      const repeatable = isRepeatable(unit);
      const key = `${idOf(el)}:${kind}:${editing === el}:${idOf(unit)}:${axis}:${repeatable}`;
      if (key === toolbarKey) return;
      toolbarKey = key;
      closePop();
      const parts = [`<span class="label">${labelFor(el, kind)}</span>`];
      if (kind === 'text' && !el.matches(PLAIN)) {
        const scope = editing === el ? '(글자를 드래그하면 그 부분만)' : '(요소 전체)';
        parts.push(`<button data-act="bold" title="굵게 ${scope} · Ctrl+B">${icon('bold')}</button>`);
        parts.push(`<button data-act="italic" title="기울임 ${scope} · Ctrl+I">${icon('italic')}</button>`);
        parts.push(`<button data-act="underline" title="밑줄 ${scope} · Ctrl+U">${icon('underline')}</button>`);
        if (editing === el) parts.push(`<button data-act="strong" title="사이트 강조 스타일(다른 강조 글자와 같은 모양)">${icon('strong')}</button>`);
        parts.push('<span class="sep"></span>');
        parts.push(`<button data-act="color" title="글자 색 ${scope}"><span class="color-mark" style="--text-color:${getComputedStyle(el).color}">가<i></i></span></button>`);
        parts.push(`<button class="text" data-act="font" title="글꼴 ${scope}">글꼴<small>▾</small></button>`);
        parts.push(`<button class="text" data-act="smaller" title="글자 작게 ${scope}">가−</button>`);
        parts.push(`<button class="text" data-act="bigger" title="글자 크게 ${scope}">가+</button>`);
        parts.push('<span class="sep"></span>');
        if (editing === el) parts.push(`<button data-act="linebreak" title="줄바꿈 넣기 (Enter)">${icon('linebreak')}</button>`);
        parts.push(`<button data-act="clear" title="서식 지우기 ${scope}">${icon('eraser')}</button>`);
        parts.push('<span class="sep"></span>');
      }
      if (kind === 'image' || kind === 'bg' || kind === 'graphic') {
        const iconLike = kind === 'graphic' || (kind === 'bg' && isIconSized(el));
        parts.push(`<button class="primary" data-act="image">${icon(iconLike ? 'star' : 'image')}${iconLike ? '아이콘 바꾸기' : '이미지 바꾸기'}</button>`);
      }
      if (attachUnitOf(el, kind)) parts.push(`<button data-act="attach" title="글자 옆에 복제해서 붙이기 · 누른 다음 붙일 글자를 클릭하세요">${icon('attach')}</button>`);
      if (kind === 'image' || kind === 'bg' || kind === 'graphic' || attachUnitOf(el, kind)) parts.push('<span class="sep"></span>');
      if (canMove(el)) {
        parts.push(`<button data-act="move" title="끌어서 위치 옮기기${isCompact(el) ? ' (작은 요소는 그대로 끌어도 돼요)' : ' (선택 상자 오른쪽 위의 파란 손잡이도 같아요)'}">${icon('move')}</button>`);
        parts.push(`<button data-act="align" title="맞춤 · 주변 글자·아이콘과 열(세로줄)·행(가로줄) 맞추기">${icon('align')}</button>`);
      }
      parts.push(`<button data-act="parent" title="상위 요소 선택">${icon('parent')}</button>`);
      parts.push('<span class="sep"></span>');
      if (repeatable) parts.push(`<button data-act="drag" data-unit title="순서 바꾸기 (끌어서 다른 칸으로)">${icon('grip')}</button>`);
      parts.push(`<button data-act="duplicate" data-unit title="뒤에 복제 (Ctrl+D)">${icon('copy')}</button>`);
      parts.push(`<button data-act="up" data-unit title="앞으로 이동">${icon(axis === 'x' ? 'left' : 'up')}</button>`);
      parts.push(`<button data-act="down" data-unit title="뒤로 이동">${icon(axis === 'x' ? 'right' : 'down')}</button>`);
      parts.push(`<button class="danger" data-act="remove" data-unit title="삭제 (Delete)">${icon('trash')}</button>`);
      if (kind === 'text' && editing === el) parts.push(`<span class="sep"></span><button data-act="done" title="편집 완료 (Esc)">${icon('check')}</button>`);
      toolbar.innerHTML = parts.join('');
      toolbar.classList.add('on');
    }

    // ── 색·글꼴 고르기 창 ──
    function placePop() {
      const anchor = toolbar.querySelector(`[data-act="${openPop.dataset.pop}"]`);
      if (!anchor) return closePop();
      const rect = anchor.getBoundingClientRect();
      const width = openPop.offsetWidth;
      const height = openPop.offsetHeight;
      let top = rect.bottom + 8;
      if (top + height > innerHeight - 8) top = Math.max(8, rect.top - height - 8);
      put(openPop, Math.max(8, Math.min(rect.left, innerWidth - width - 8)), top, toolbarFixed);
    }
    function togglePop(name) {
      const pop = pops.find(candidate => candidate.dataset.pop === name);
      if (openPop === pop) return closePop();
      closePop();
      openPop = pop;
      if (name === 'font') {
        const current = selectedText() ? '' : styleMap(selectedModel())['font-family'] || '';
        for (const button of pop.querySelectorAll('[data-font]')) button.setAttribute('aria-pressed', String(button.dataset.font === current));
      }
      if (name === 'align') renderAlignPop(pop);
      pop.classList.add('on');
      placePop();
    }
    function closePop() {
      if (openPop?.dataset.pop === 'align') alignPreview = null;
      openPop?.classList.remove('on');
      openPop = null;
    }

    // ── 맞춤 창: 열 맞춤(세로줄: 왼쪽·가운데·오른쪽)과 행 맞춤(가로줄: 위·가운데·아래) ──
    // 고른 기준은 같은 요소를 선택하고 있는 동안 기억합니다.
    let alignChoice = { id: null, x: null, y: null };
    function renderAlignPop(pop) {
      if (!selection) return;
      const id = idOf(selection.el);
      if (alignChoice.id !== id) alignChoice = { id, x: null, y: null };
      const refs = alignRefs(selection.el);
      const group = (axis, title) => {
        const list = refs[axis];
        if (!list.length) return `<div class="align-group"><div class="align-head"><b>${title}</b></div><p class="pop-note">맞출 만한 이웃이 없어요.</p></div>`;
        const chosen = list.some(ref => ref.id === alignChoice[axis]) ? alignChoice[axis] : list[0].id;
        alignChoice[axis] = chosen;
        return `
          <div class="align-group">
            <div class="align-head"><b>${title}</b>
              <select data-align-ref="${axis}" aria-label="${title} 기준">${list.map(ref => `<option value="${escapeHTML(ref.id)}" ${ref.id === chosen ? 'selected' : ''}>${escapeHTML(ref.label)}</option>`).join('')}</select>
            </div>
            <div class="align-buttons">${EDGES.map(edge => `<button data-align="${axis}:${edge}" title="${title} · ${EDGE_NAMES[axis][edge]}">${icon(`${axis}-${edge}`)}${EDGE_NAMES[axis][edge]}</button>`).join('')}</div>
          </div>`;
      };
      pop.innerHTML = `
        <h5>맞춤 · 기준을 고른 뒤 버튼을 누르세요</h5>
        ${group('x', '열 맞춤 (세로줄)')}
        ${group('y', '행 맞춤 (가로줄)')}
        <p class="pop-note">끌어서 옮길 때도 주변과 줄이 맞으면 분홍 선이 보이며 딱 붙어요. Alt를 누르고 끌면 붙지 않아요.</p>`;
    }
    const alignPop = pops.find(pop => pop.dataset.pop === 'align');
    const alignRefOf = axis => alignPop.querySelector(`[data-align-ref="${axis}"]`)?.value || null;
    alignPop.addEventListener('change', event => {
      const select = event.target.closest('[data-align-ref]');
      if (!select) return;
      alignChoice[select.dataset.alignRef] = select.value;
      previewAlign({ ref: select.value, axis: select.dataset.alignRef });
    });
    alignPop.addEventListener('pointerover', event => {
      const button = event.target.closest('[data-align]');
      const select = event.target.closest('[data-align-ref]');
      if (button) {
        const [axis, edge] = button.dataset.align.split(':');
        previewAlign({ ref: alignRefOf(axis), axis, edge });
      } else if (select) previewAlign({ ref: select.value, axis: select.dataset.alignRef });
    });
    alignPop.addEventListener('pointerleave', () => { alignPreview = null; });
    alignPop.addEventListener('click', event => {
      const button = event.target.closest('[data-align]');
      if (!button) return;
      const [axis, edge] = button.dataset.align.split(':');
      alignTo({ axis, edge, ref: alignRefOf(axis) });
      // 다른 줄도 이어서 맞출 수 있게 창을 다시 엽니다.
      if (openPop !== alignPop) togglePop('align');
      else renderAlignPop(alignPop);
      previewAlign({ ref: alignRefOf(axis), axis, edge });
    });

    for (const pop of pops) {
      pop.addEventListener('mousedown', event => {
        if (!event.target.closest('input, select')) event.preventDefault();
      });
      pop.addEventListener('click', event => {
        const color = event.target.closest('[data-color]');
        const font = event.target.closest('[data-font]');
        if (color) {
          formatText({ color: color.dataset.color || null }, '글자 색');
          closePop();
        } else if (font) {
          formatText({ 'font-family': font.dataset.font || null }, '글꼴');
          closePop();
        }
      });
    }
    const colorInput = root.querySelector('input[type="color"]');
    colorInput.addEventListener('pointerdown', () => { pickerOpen = true; });
    colorInput.addEventListener('change', () => {
      pickerOpen = false;
      formatText({ color: colorInput.value }, '글자 색');
      closePop();
    });
    window.addEventListener('focus', () => { pickerOpen = false; });

    // ── ＋ 버튼 ──
    for (const button of [addBefore, addAfter]) {
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => duplicateItem(button === addBefore));
      button.addEventListener('pointerenter', () => item.classList.add('strong'));
      button.addEventListener('pointerleave', () => item.classList.remove('strong'));
    }

    // ── 끌어서 옮기기 ──
    function dropSlot(unit, x, y) {
      const sig = signature(unit);
      const siblings = [...unit.parentElement.children].filter(el => el !== unit && idOf(el) && signature(el) === sig && isShown(el));
      if (!siblings.length) return null;
      let best = null;
      for (const sibling of siblings) {
        const rect = sibling.getBoundingClientRect();
        const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
        const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
        const distance = dx * dx + dy * dy * 4;
        if (!best || distance < best.distance) best = { sibling, rect, distance };
      }
      const horizontal = axisOf(unit) === 'x' || axisOf(best.sibling) === 'x';
      const after = horizontal ? x > best.rect.left + best.rect.width / 2 : y > best.rect.top + best.rect.height / 2;
      // 놓아도 자리가 그대로인 경우는 표시하지 않습니다.
      const neighbors = [...unit.parentElement.children].filter(el => idOf(el) && signature(el) === sig);
      const from = neighbors.indexOf(unit);
      const to = neighbors.indexOf(best.sibling);
      if ((after && to === from - 1) || (!after && to === from + 1)) return { same: true };
      return { target: best.sibling, after, rect: best.rect, horizontal };
    }
    function showDropline(slot) {
      if (!slot || slot.same) return dropline.classList.remove('on');
      const { rect, after, horizontal } = slot;
      const gap = 6;
      const fixed = pinned(slot.target);
      if (horizontal) {
        put(dropline, (after ? rect.right : rect.left) - 2 + (after ? gap : -gap), rect.top, fixed);
        dropline.style.width = '4px';
        dropline.style.height = `${rect.height}px`;
      } else {
        put(dropline, rect.left, (after ? rect.bottom : rect.top) - 2 + (after ? gap : -gap), fixed);
        dropline.style.width = `${rect.width}px`;
        dropline.style.height = '4px';
      }
      dropline.classList.add('on');
    }
    function startDrag(event, button) {
      const unit = selection && unitOf(selection);
      if (!unit || !isRepeatable(unit)) return;
      event.preventDefault();
      stopEditing(true);
      drag = { unit, slot: null, pointerId: event.pointerId };
      try { button.setPointerCapture(event.pointerId); } catch {}
      item.classList.add('strong');
      dragTip.textContent = '놓을 자리로 끌어 주세요';
      dragTip.classList.add('on');
      const move = moveEvent => {
        const x = moveEvent.clientX;
        const y = moveEvent.clientY;
        dragTip.style.left = `${x}px`;
        dragTip.style.top = `${y}px`;
        drag.slot = dropSlot(unit, x, y);
        showDropline(drag.slot);
        // 화면 끝에 가까우면 천천히 스크롤합니다.
        if (y < 60) window.scrollBy(0, -12);
        else if (y > innerHeight - 60) window.scrollBy(0, 12);
      };
      const end = () => {
        button.removeEventListener('pointermove', move);
        button.removeEventListener('pointerup', end);
        button.removeEventListener('pointercancel', end);
        const slot = drag?.slot;
        drag = null;
        dropline.classList.remove('on');
        dragTip.classList.remove('on');
        item.classList.remove('strong');
        if (slot && !slot.same && slot.target) moveUnitTo(slot.target, slot.after);
      };
      button.addEventListener('pointermove', move);
      button.addEventListener('pointerup', end);
      button.addEventListener('pointercancel', end);
    }

    toolbar.addEventListener('mousedown', event => event.preventDefault());
    toolbar.addEventListener('pointerdown', event => {
      const button = event.target.closest('button[data-act="drag"]');
      if (button && event.button === 0) startDrag(event, button);
      const mover = event.target.closest('button[data-act="move"]');
      if (mover) startMoveDrag(event, mover);
    });
    toolbar.addEventListener('pointerover', event => {
      item.classList.toggle('strong', Boolean(event.target.closest('[data-unit]')));
    });
    toolbar.addEventListener('pointerleave', () => { if (!drag) item.classList.remove('strong'); });
    toolbar.addEventListener('click', event => {
      const button = event.target.closest('button[data-act]');
      if (!button) return;
      const act = button.dataset.act;
      if (act === 'color' || act === 'font' || act === 'align') return togglePop(act);
      closePop();
      if (act === 'attach') return startAttach('copy');
      if (act === 'bold') toggleBold();
      else if (act === 'italic') toggleItalic();
      else if (act === 'underline') toggleUnderline();
      else if (act === 'strong') toggleInline();
      else if (act === 'smaller') stepSize(-1);
      else if (act === 'bigger') stepSize(1);
      else if (act === 'linebreak') insertLineBreak();
      else if (act === 'clear') clearFormat();
      else if (act === 'done') { stopEditing(true); notifySelection(); }
      else if (act === 'parent') selectParent();
      else if (act === 'duplicate') duplicateItem();
      else if (act === 'up') moveItem(-1);
      else if (act === 'down') moveItem(1);
      else if (act === 'remove') removeItem();
      else if (act === 'image') pickImage();
    });

    // 작은 아이콘·그림을 선택하면 마우스 모양이 이동(✥)으로 바뀌어, 그대로 끌어서 옮길 수 있음을 알려 줍니다(화면에만 표시).
    let grabEl = null;
    function syncGrab() {
      const target = selection && !editing && !attach && canMove(selection.el) && isCompact(selection.el) ? selection.el : null;
      if (grabEl === target) return;
      grabEl?.removeAttribute('data-bo-grab');
      target?.setAttribute('data-bo-grab', '');
      grabEl = target;
    }

    function frame() {
      pinCache.clear();
      if (selection && !selection.el.isConnected) {
        selection = null;
        renderToolbar();
        notifySelection();
      }
      const dropping = Boolean(dropTarget);
      const pick = pendingHit();
      const picking = Boolean(attach || pick);
      place(hover, dropping ? dropTarget.el : picking ? pick?.el || null : (hoverEl && hoverEl !== selection?.el && !drag && !move?.active ? hoverEl : null));
      hover.classList.toggle('drop', dropping);
      hover.classList.toggle('attach', picking);
      if (pick && !attach) hover.querySelector('.tag').textContent = `${pick.name} ${pick.after ? '뒤' : '앞'}에 넣기`;
      place(sel, selection?.el);
      sel.classList.toggle('editing', Boolean(editing));
      const unit = selection && unitOf(selection);
      place(item, !attach && !move?.active && unit && unit !== selection.el ? unit : (drag ? drag.unit : null));
      placeToolbar();
      placeAddButtons();
      placeMoveUI();
      placeGuides();
      placeAttach();
      syncGrab();
      requestAnimationFrame(frame);
    }

    return {
      mount() {
        document.documentElement.appendChild(host);
        requestAnimationFrame(frame);
      },
      render() {
        const attachTag = attach?.hit ? `${attach.hit.name} ${attach.hit.after ? '뒤' : '앞'}에 붙이기` : '';
        hover.querySelector('.tag').textContent = dropTarget ? '여기에 놓으면 이미지가 바뀌어요' : attach ? attachTag : hoverKind;
        const dragHint = selection && !editing && canMove(selection.el) && isCompact(selection.el) ? ' · 끌어서 이동' : '';
        sel.querySelector('.tag').textContent = selection ? (editing === selection.el ? '입력 중 · Esc로 완료' : `${labelFor(selection.el, selection.kind)}${dragHint}`) : '';
        item.querySelector('.tag').textContent = '';
        renderToolbar();
        renderBanner();
      },
      refreshToolbar() {
        toolbarKey = '';
        renderToolbar();
      },
      preview,
      closePop
    };
  })();

  async function pickImage() {
    if (!selection || !shell) return;
    stopEditing(true);
    const target = selection;
    const iconLike = target.kind === 'graphic' || (target.kind === 'bg' && isIconSized(target.el));
    const title = iconLike ? '아이콘 바꾸기' : target.kind === 'bg' ? '배경 이미지 바꾸기' : '이미지 바꾸기';
    const color = target.kind === 'graphic' ? iconColors(target.el)[0] : undefined;
    const picked = await shell.pickImage(title, { kind: target.kind, color, tab: iconLike ? 'icons' : 'images' });
    if (!picked) return;
    if (selection !== target) select(target.kind, target.el);
    replaceImage(picked);
  }

  const hoverLabel = hit => {
    const name = labelFor(hit.el, hit.kind);
    if (hit.kind === 'text') return `${name} · 클릭해서 수정`;
    if (hit.kind === 'image' || hit.kind === 'bg') return `${name} · 클릭해서 바꾸기`;
    return `${name} · 클릭해서 선택`;
  };

  // ── 12. 이벤트: 편집 모드에서는 링크 이동과 페이지 기능을 막고, 버튼은 그대로 동작하게 둡니다. ──
  let hoverQueued = false;
  let lastPointer = null;
  let inertNoticeAt = 0;
  // 누를 수 없게 한 곳의 버튼·입력 칸은 키보드(Tab)로도 들어가지 않게 합니다(화면에만 적용, 저장되는 원본은 그대로).
  if (INERT) {
    for (const area of document.querySelectorAll(INERT)) {
      for (const control of area.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')) control.setAttribute('tabindex', '-1');
    }
  }
  window.addEventListener('pointermove', event => {
    if (move) {
      updateMove(event.clientX, event.clientY, event.shiftKey, event.altKey);
      return;
    }
    lastPointer = event;
    if (hoverQueued) return;
    hoverQueued = true;
    requestAnimationFrame(() => {
      hoverQueued = false;
      const pointer = lastPointer;
      // 글자 옆에 붙이는 중에는 붙일 자리만 보여 줍니다.
      if (attach) {
        attach.hit = pointer && !isInternal(pointer.target) ? attachHit(pointer.clientX, pointer.clientY) : null;
        hoverEl = null;
        ui.render();
        return;
      }
      if (!pointer || isInternal(pointer.target)) {
        hoverEl = null;
      } else {
        const hit = resolveAt(pointer.clientX, pointer.clientY);
        hoverEl = hit && hit.kind !== 'pass' && hit.kind !== 'inert' && !(editing && editing.contains(hit.el)) ? hit.el : null;
        hoverKind = hoverEl ? hoverLabel(hit) : '';
      }
      ui.render();
    });
  }, { capture: true, passive: true });
  document.documentElement.addEventListener('pointerleave', () => { hoverEl = null; ui.render(); });

  window.addEventListener('pointerdown', event => {
    if (isInternal(event.target)) return;
    lastDown = null;
    if (attach) {
      // 붙일 자리를 고르는 중: 페이지 기능(버튼·링크)은 움직이지 않고, 누른 곳에 붙입니다.
      event.preventDefault();
      event.stopPropagation();
      lastDown = { kind: 'attach' };
      if (event.button !== 0) return;
      const hit = attachHit(event.clientX, event.clientY);
      if (hit) performAttach(hit);
      else toast('붙일 글자나 그림·아이콘 위를 눌러 주세요. 그만두려면 Esc를 누르세요.');
      return;
    }
    if (editing && editing.contains(event.target)) {
      event.stopPropagation();
      lastDown = { kind: 'editing' };
      return;
    }
    if (event.button !== 0) return;
    const hit = resolveAt(event.clientX, event.clientY);
    lastDown = hit || { kind: 'none' };
    if (!hit || hit.kind === 'pass') {
      if (editing) stopEditing(true);
      // 갤러리 화살표처럼 화면을 바꾸는 버튼을 누른 뒤에는 선택 정보를 새로 보냅니다.
      if (selection) setTimeout(() => { ui.render(); notifySelection(); }, 400);
      return;
    }
    event.stopPropagation();
    if (hit.kind === 'inert') {
      event.preventDefault();
      if (editing) stopEditing(true);
      if (Date.now() - inertNoticeAt > 4000) {
        inertNoticeAt = Date.now();
        toast(inertNoticeFor(hit.el));
      }
      return;
    }
    if (hit.kind === 'text') {
      select('text', hit.el, { silent: true });
      startEditing(hit.el);
      notifySelection();
      pendingCaret = { x: event.clientX, y: event.clientY };
      return;
    }
    event.preventDefault();
    select(hit.kind, hit.el);
    // 사진·아이콘·카드와 작은 요소는 누른 채로 끌면 바로 위치가 옮겨집니다(살짝 끌어야 시작돼서 클릭은 그대로 선택).
    const draggable = hit.kind === 'image' || hit.kind === 'graphic' || (hit.kind === 'box' && isRepeatable(hit.el)) || ((hit.kind === 'bg' || hit.kind === 'box') && isCompact(hit.el));
    if (hit.el && draggable && canMove(hit.el)) beginMove(hit.el, event.clientX, event.clientY);
  }, true);

  window.addEventListener('pointerup', () => { if (move) endMove(); }, true);
  window.addEventListener('pointercancel', () => { if (move) endMove(true); }, true);

  for (const type of ['mousedown', 'mouseup', 'pointerup']) {
    window.addEventListener(type, event => {
      if (isInternal(event.target) || !lastDown || lastDown.kind === 'pass') return;
      event.stopPropagation();
      if (type === 'mousedown' && lastDown.kind !== 'text' && lastDown.kind !== 'editing') event.preventDefault();
    }, true);
  }

  // 클릭 허용 여부는 클릭 대상 자체로 정합니다(키보드로 누른 버튼처럼 포인터 없이 생기는 클릭도 있음).
  const passes = target => Boolean(target.closest?.(PASS)) && !inertOf(target) && !(editing && editing.contains(target));
  window.addEventListener('click', event => {
    // 붙이기로 누른 자리가 버튼·체크 항목이어도 그 기능이 실행되지 않게 합니다.
    if (lastDown?.kind === 'attach' && !isInternal(event.target)) {
      event.preventDefault();
      event.stopPropagation();
      lastDown = null;
      return;
    }
    if (isInternal(event.target) || passes(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    if (pendingCaret) {
      placeCaret(pendingCaret.x, pendingCaret.y);
      pendingCaret = null;
    }
    // 공통 머리말(하위 메뉴 바 등)의 같은 페이지 #위치 링크는 편집 화면에서도 그 위치·탭으로 옮겨 줍니다(다른 페이지로는 가지 않음).
    const hash = samePageHash(event.target);
    if (hash) goToHash(hash);
    // 다른 페이지 링크(선배들의 이야기 옆 메뉴의 후기 · 인터뷰 등)는 편집기에 알려, 그 페이지도 편집하는 페이지면 그 페이지 편집으로 넘어가요
    else {
      const other = otherPageLink(event.target);
      if (other) shell?.openPage?.(other);
    }
  }, true);

  function otherPageLink(target) {
    const link = target.closest?.('a[href]');
    if (!link || !link.closest(LOCKED)) return null;
    let url;
    try { url = new URL(link.href, location.href); } catch { return null; }
    return url.origin === location.origin && url.pathname !== location.pathname ? url.href : null;
  }

  function samePageHash(target) {
    const link = target.closest?.('a[href]');
    if (!link || !link.closest(LOCKED)) return null;
    let url;
    try { url = new URL(link.href, location.href); } catch { return null; }
    return url.origin === location.origin && url.pathname === location.pathname && url.hash.length > 1 ? url.hash : null;
  }
  // 주소의 #위치만 바꿔 페이지 스크립트(탭 바꾸기 등)가 알아듣게 합니다. 같은 위치를 다시 고르면 알림을 한 번 더 보냅니다.
  function goToHash(hash) {
    if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: location.href, newURL: location.href }));
    else location.hash = hash;
    if (selection) setTimeout(() => { ui.render(); notifySelection(); }, 400);
  }

  for (const type of ['dblclick', 'auxclick', 'submit']) {
    window.addEventListener(type, event => {
      if (isInternal(event.target) || passes(event.target)) return;
      if (type !== 'dblclick') event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  window.addEventListener('dragstart', event => {
    if (!isInternal(event.target) && !(editing && editing.contains(event.target))) event.preventDefault();
  }, true);

  window.addEventListener('dragover', event => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    const hit = resolveAt(event.clientX, event.clientY);
    dropTarget = hit && (hit.kind === 'image' || hit.kind === 'bg') ? hit : null;
    event.dataTransfer.dropEffect = dropTarget ? 'copy' : 'none';
    ui.render();
  }, true);
  window.addEventListener('dragleave', event => {
    if (!event.relatedTarget) {
      dropTarget = null;
      ui.render();
    }
  }, true);
  window.addEventListener('drop', async event => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    const target = dropTarget;
    dropTarget = null;
    ui.render();
    const file = [...event.dataTransfer.files].find(item => item.type.startsWith('image/'));
    if (!target || !file) {
      toast('이미지 위에 이미지 파일을 놓아 주세요.');
      return;
    }
    select(target.kind, target.el);
    const picked = await shell?.uploadFile(file);
    if (picked) {
      select(target.kind, target.el);
      replaceImage(picked);
    }
  }, true);

  document.addEventListener('beforeinput', event => {
    if (!editing || !editing.contains(event.target)) return;
    if (event.inputType === 'insertParagraph') {
      event.preventDefault();
      if (editing.matches(PLAIN)) {
        setTimeout(() => { stopEditing(true); notifySelection(); });
      } else {
        document.execCommand('insertLineBreak');
      }
    } else if (event.inputType === 'insertLineBreak' && editing.matches(PLAIN)) {
      event.preventDefault();
    } else if (event.inputType === 'insertFromDrop' || /^format/.test(event.inputType)) {
      event.preventDefault();
    }
  }, true);

  window.addEventListener('paste', event => {
    if (!editing || !editing.contains(event.target)) return;
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') || '';
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    if (editing.matches(PLAIN)) {
      document.execCommand('insertText', false, lines.join(' '));
      return;
    }
    lines.forEach((line, index) => {
      if (index) document.execCommand('insertLineBreak');
      if (line) document.execCommand('insertText', false, line);
    });
  }, true);

  window.addEventListener('keydown', event => {
    const withMod = event.ctrlKey || event.metaKey;
    const code = event.code;
    if (attach && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelAttach();
      return;
    }
    // 붙일 자리를 고르는 동안에는 삭제·이동 같은 단축키가 선택한 요소에 적용되지 않게 합니다.
    if (attach && !withMod) return;
    if (editing) {
      event.stopPropagation();
      if (event.isComposing || event.keyCode === 229) return; // 한글 조합 중에는 입력기에 맡깁니다.
      // 버튼 안 글자(질문 등)를 고칠 때는 Enter·스페이스가 버튼을 누르지 않게 직접 입력합니다.
      const inControl = Boolean(editing.parentElement?.closest(PASS));
      if (inControl && event.key === 'Enter' && !withMod && !event.altKey) {
        event.preventDefault();
        if (editing.matches(PLAIN)) { stopEditing(true); notifySelection(); }
        else document.execCommand('insertLineBreak');
        return;
      }
      if (inControl && event.key === ' ' && !withMod && !event.altKey) {
        event.preventDefault();
        document.execCommand('insertText', false, ' ');
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        stopEditing(true);
        notifySelection();
      } else if (withMod && code === 'KeyB') {
        event.preventDefault();
        if (!editing.matches(PLAIN)) toggleBold();
      } else if (withMod && code === 'KeyI') {
        event.preventDefault();
        if (!editing.matches(PLAIN)) toggleItalic();
      } else if (withMod && code === 'KeyU') {
        event.preventDefault();
        if (!editing.matches(PLAIN)) toggleUnderline();
      } else if (withMod && code === 'KeyS') {
        event.preventDefault();
        stopEditing(true);
        shell?.shortcut('save');
      } else if (event.key === 'Tab') {
        event.preventDefault();
      } else if (event.altKey && /^Arrow(Left|Right|Up|Down)$/.test(event.key)) {
        // 글자 입력 중에는 방향키가 커서를 움직이므로, Alt+방향키로 위치를 옮깁니다.
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        nudge(event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0);
      }
      return;
    }
    if (isInternal(event.target)) return;
    let handled = true;
    if (withMod && code === 'KeyZ') shell?.shortcut(event.shiftKey ? 'redo' : 'undo');
    else if (withMod && code === 'KeyY') shell?.shortcut('redo');
    else if (withMod && code === 'KeyS') shell?.shortcut('save');
    else if (withMod && code === 'KeyD' && selection) duplicateItem();
    else if (event.key === 'Delete' && selection) removeItem();
    else if (event.key === 'Escape' && selection) { ui.closePop(); select(null, null); }
    else if (event.key === 'Enter' && selection?.kind === 'text') { startEditing(selection.el, { caretAtEnd: true }); notifySelection(); }
    // 선택한 요소를 방향키로 조금씩 옮깁니다(Shift를 누르면 10px씩). PPT처럼 동작해요.
    else if (selection && !withMod && /^Arrow(Left|Right|Up|Down)$/.test(event.key)) {
      const step = event.shiftKey ? 10 : 1;
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      nudge(dx, dy);
    }
    else handled = false;
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  // 글자를 고치는 동안 키를 떼는 순간에도 페이지 기능(버튼 누름 등)이 움직이지 않게 합니다.
  window.addEventListener('keyup', event => {
    if (!editing) return;
    event.stopPropagation();
    if ((event.key === ' ' || event.key === 'Enter') && editing.parentElement?.closest(PASS)) event.preventDefault();
  }, true);

  window.addEventListener('blur', () => {
    if (editing && !pickerOpen) {
      ui.closePop();
      stopEditing(true);
      notifySelection();
    }
  });

  // ── 13. 백오피스 화면(부모 창)과 주고받는 기능 ──
  const STRUCTURAL = new Set(['duplicate', 'duplicateBefore', 'remove', 'moveUp', 'moveDown', 'replaceHTML', 'parent']);
  const actions = {
    replaceImage, resetBackground, setAlt, setLink, setVideo, setSlide, setMeta, setCategory, replaceHTML,
    duplicate: () => duplicateItem(false), duplicateBefore: () => duplicateItem(true),
    remove: removeItem, moveUp: () => moveItem(-1), moveDown: () => moveItem(1),
    parent: selectParent, pickImage,
    // 편집 도구 막대의 서식은 요소 전체에 적용합니다.
    format: ({ props, label } = {}) => formatBlock(props || {}, label || '글자 서식'),
    clearFormat: () => clearFormat(),
    nudge: ({ dx = 0, dy = 0 } = {}) => nudge(dx, dy),
    setPosition,
    resetPageShift,
    recolorIcon,
    // 맞춤(열·행)과 글자 옆에 붙이기
    align: alignTo,
    layer: ({ to = null } = {}) => setLayer(to),
    attach: ({ mode = 'copy' } = {}) => startAttach(mode),
    edit: () => { if (selection?.kind === 'text') { startEditing(selection.el, { caretAtEnd: true }); notifySelection(); } }
  };

  window.BO_CANVAS = {
    serialize,
    pageMeta,
    info: selectionInfo,
    html: () => {
      const m = selectedModel();
      return m ? cleanOuterHTML(m) : '';
    },
    flush: () => stopEditing(true),
    deselect: () => { cancelAttach(); stopEditing(true); select(null, null); },
    selectById,
    // 패널의 맞춤 버튼에 마우스를 올렸을 때 기준 요소와 맞춰질 줄을 미리 보여 줍니다(null이면 숨김).
    previewAlign: preview => previewAlign(preview),
    cancelAttach: () => cancelAttach(),
    // target: 패널을 그릴 때의 선택 대상. 그사이 선택이 바뀌었어도 원래 대상에 적용합니다.
    action(name, payload, target) {
      if (name !== 'edit') stopEditing(true);
      const saved = selection;
      if (target) {
        const el = live(target.id);
        if (!el) return;
        if (!selection || selection.el !== el || selection.kind !== target.kind) selection = { kind: target.kind, el, explicit: Boolean(target.explicit) };
      }
      if (name !== 'setMeta' && name !== 'resetPageShift' && !selection) return;
      actions[name]?.(payload);
      if (saved && selection !== saved && saved.el.isConnected && !STRUCTURAL.has(name)) {
        selection = saved;
        ui.render();
        notifySelection();
      }
    },
    restore({ scrollY = 0, selectPath = null, hash = '' } = {}) {
      // 다시 그리기 전에 보던 탭(#위치)을 되살린 뒤 보던 자리로 돌아갑니다.
      if (hash && hash.length > 1 && hash !== location.hash) {
        location.hash = hash;
        if (scrollY) setTimeout(() => window.scrollTo({ top: scrollY, behavior: 'instant' }), 60);
      }
      if (scrollY) window.scrollTo({ top: scrollY, behavior: 'instant' });
      if (selectPath) {
        const target = atPath(model, selectPath);
        if (target) selectById(idOf(target));
      } else {
        notifySelection();
      }
    }
  };

  ui.mount();
  document.addEventListener('DOMContentLoaded', () => shell?.onCanvasReady());
})();
