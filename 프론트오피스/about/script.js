/* 인사교 알아보기 본문 동작(HTML_CSS_JS_분리버전 script.js를 공유용 사이트에 맞춤).
   헤더 · 하위 메뉴 바 · 모바일 메뉴 · 푸터는 공통 틀(../common/js/site.js)이 맡으므로, 전달본의 navigation.js(자체 헤더 메뉴)는 뺐습니다. */

// about.js
'use strict';

const chapterLinks = [...document.querySelectorAll('.chapter-links a, .section-navigation a[data-section]')];
const chapters = [...new Set(chapterLinks.map(link => document.querySelector(link.hash)))].filter(Boolean);
// Sections may move while menu labels retain their agreed order.
const orderedChapters = [...chapters].sort((a, b) =>
  a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
);
const sectionNavigation = document.querySelector('.section-navigation');
const aboutPaper = document.querySelector('.about-paper');

// 목차 둘레(보이지 않는 마우스 영역)에 있을 때는 같은 높이의 사선을 찾아요.
const railLinkAt = y => [...(sectionNavigation?.querySelectorAll('a[data-section]') || [])].find(link => {
  const box = link.getBoundingClientRect();
  return y >= box.top && y < box.bottom;
}) || null;

// 오른쪽 목차: 누르면 그 섹션으로 이동하고 키보드 초점도 그 섹션으로 옮깁니다. 사선 옆 빈 곳을 눌러도 같은 높이의 사선이 눌려요.
sectionNavigation?.addEventListener('click', event => {
  const link = event.target.closest('a[data-section]');
  if (!link) {
    railLinkAt(event.clientY)?.click();
    return;
  }
  const target = document.querySelector(link.hash);
  if (!target) return;
  target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
});

// 사선에 마우스를 올리면 그 사선 아래로 섹션 이름(세로 글씨)과 긴 선이 부드럽게 자라나요(.is-open, 모션은 style.css).
// 사선 사이 빈틈이나 둘레(보이지 않는 마우스 영역)에 있을 때는 마지막에 올린 사선을 펼친 채로 두고,
// 마우스가 잠깐 목차 밖으로 흔들려도 바로 접히지 않게 조금 기다렸다 접어요(다시 들어오면 취소).
const railLinks = [...(sectionNavigation?.querySelectorAll('a[data-section]') || [])];
let railCloseTimer = 0;
const openRail = link => {
  clearTimeout(railCloseTimer);
  for (const item of railLinks) item.classList.toggle('is-open', item === link);
};
const closeRail = delay => {
  clearTimeout(railCloseTimer);
  railCloseTimer = setTimeout(() => openRail(null), delay);
};
sectionNavigation?.addEventListener('pointermove', event => {
  const link = event.target.closest('a[data-section]') || railLinkAt(event.clientY);
  if (link && !link.classList.contains('is-open')) openRail(link);
  else clearTimeout(railCloseTimer);
});
sectionNavigation?.addEventListener('pointerleave', () => closeRail(100));
// 이름마다 펼칠 높이를 재 둬요(펼침·접힘이 같은 속도로 부드럽게). 글꼴이 다 불러와지거나 창 크기가 바뀌면 다시 재요.
const measureRail = () => {
  for (const label of sectionNavigation?.querySelectorAll('.section-rail-label') || []) {
    if (label.scrollHeight) label.style.setProperty('--label-h', `${label.scrollHeight}px`);
  }
};
measureRail();
document.fonts?.ready.then(measureRail);
window.addEventListener('resize', measureRail);
// 키보드(Tab)로 사선에 오면 그 사선을 펼치고, 목차 밖으로 나가면 접어요.
sectionNavigation?.addEventListener('focusin', event => {
  if (event.target.matches('a[data-section]:focus-visible')) openRail(event.target);
});
sectionNavigation?.addEventListener('focusout', event => {
  if (!sectionNavigation.contains(event.relatedTarget)) closeRail(0);
});

function updateCurrentChapter() {
  if (!chapters.length) return;
  // 고정 헤더(공통, 하위 메뉴 바 포함) 아래를 기준으로 현재 섹션을 고릅니다.
  const offset = (document.querySelector('.site-header')?.getBoundingClientRect().height || 0) + 120;
  let currentChapter = orderedChapters[0];
  for (const chapter of orderedChapters) {
    if (chapter.getBoundingClientRect().top <= offset) currentChapter = chapter;
  }
  for (const link of chapterLinks) {
    if (link.hash === '#' + currentChapter.id) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
  // 첫 화면(파란 히어로)이 지나고 밝은 본문이 화면 가운데까지 올라오면 오른쪽 목차를 보여 줍니다.
  sectionNavigation?.classList.toggle('is-visible', !aboutPaper || aboutPaper.getBoundingClientRect().top < innerHeight * .5);
}

let scrollQueued = false;
window.addEventListener('scroll', () => {
  if (scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(() => {
    updateCurrentChapter();
    scrollQueued = false;
  });
}, { passive: true });
window.addEventListener('resize', updateCurrentChapter);
window.addEventListener('hashchange', updateCurrentChapter);
updateCurrentChapter();

// Run connector motion only while its diagram is on screen.
const partnerNetwork = document.querySelector('.partner-network');
if (partnerNetwork && 'IntersectionObserver' in window) {
  new IntersectionObserver(entries => {
    partnerNetwork.dataset.flowActive = String(entries[0].isIntersecting);
  }, { threshold: .1 }).observe(partnerNetwork);
}

// 다른 페이지에서 #위치로 들어오면 글꼴이 자리 잡기 전에 도착하므로, 글꼴이 다 불러와진 뒤 한 번 더 맞춥니다.
const initialTarget = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
if (initialTarget && document.fonts) {
  const root = document.documentElement;
  let userScrolled = false;
  const markScrolled = () => { userScrolled = true; };
  ['wheel', 'touchstart', 'keydown'].forEach(type => window.addEventListener(type, markScrolled, { once: true, passive: true }));
  root.style.scrollBehavior = 'auto';
  document.fonts.ready.then(() => {
    if (!userScrolled) initialTarget.scrollIntoView({ behavior: 'instant', block: 'start' });
    root.style.scrollBehavior = '';
  });
}

// Reveal the four layered news cards once; their motion is defined in CSS.
// Observe the stationary frame so the animated offset does not alter its trigger.
const introNewsStack = document.querySelector('.intro-news-stack');
const introNewsReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
if (introNewsStack && !introNewsReducedMotion.matches && 'IntersectionObserver' in window) {
  introNewsStack.dataset.newsReveal = 'waiting';
  const introNewsObserver = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    introNewsStack.dataset.newsReveal = 'visible';
    introNewsObserver.disconnect();
  }, { rootMargin: '0px 0px -120px 0px', threshold: 0 });
  introNewsObserver.observe(introNewsStack);
  introNewsReducedMotion.addEventListener('change', event => {
    if (!event.matches) return;
    introNewsStack.dataset.newsReveal = 'visible';
    introNewsObserver.disconnect();
  });
}

// Reveal each benefit card once; stacked mobile cards wait for their own entry.
const whySchoolCards = [...document.querySelectorAll('#why-school .why-school-cards > .why-school-card')];
const whySchoolReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
if (whySchoolCards.length && !whySchoolReducedMotion.matches && 'IntersectionObserver' in window) {
  const whySchoolObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.dataset.cardReveal = 'visible';
      whySchoolObserver.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -120px 0px', threshold: .08 });
  for (const card of whySchoolCards) {
    card.dataset.cardReveal = 'waiting';
    whySchoolObserver.observe(card);
  }
  whySchoolReducedMotion.addEventListener('change', event => {
    if (!event.matches) return;
    for (const card of whySchoolCards) card.dataset.cardReveal = 'visible';
    whySchoolObserver.disconnect();
  });
}

// Keep the source code and its colors intact; animate each line's visible width.
const whySchoolCodeEditor = document.querySelector('#why-school .why-school-code-editor');
if (whySchoolCodeEditor && !whySchoolReducedMotion.matches && 'IntersectionObserver' in window) {
  const codeLines = [...whySchoolCodeEditor.querySelectorAll('.why-school-code-lines code')]
    .filter(line => line.textContent.trim().length);
  let typingDelay = .35;
  for (const line of codeLines) {
    const characters = line.textContent.length;
    const duration = Math.max(.65, characters * .055);
    line.classList.add('why-school-typing-line');
    line.style.setProperty('--typing-characters', String(characters));
    line.style.setProperty('--typing-width', `calc(${characters}ch + 2px)`);
    line.style.setProperty('--typing-duration', `${duration}s`);
    line.style.setProperty('--typing-delay', `${typingDelay}s`);
    typingDelay += duration + .22;
  }
  if (codeLines.length) {
    whySchoolCodeEditor.dataset.codeTyping = 'waiting';
    const projectCard = whySchoolCodeEditor.closest('.why-school-card');
    let codeVisible = false;
    let codeCardReady = projectCard?.dataset.cardReveal !== 'waiting';
    let codeRestartTimer;
    let codeStartFrame;
    const clearCodeSchedule = () => {
      clearTimeout(codeRestartTimer);
      cancelAnimationFrame(codeStartFrame);
    };
    const canTypeCode = () => codeVisible && codeCardReady && !whySchoolReducedMotion.matches && !document.hidden;
    const startTyping = () => {
      clearCodeSchedule();
      if (!canTypeCode()) return;
      whySchoolCodeEditor.dataset.codeTyping = 'waiting';
      codeStartFrame = requestAnimationFrame(() => {
        if (canTypeCode()) whySchoolCodeEditor.dataset.codeTyping = 'typing';
      });
    };
    const stopTyping = () => {
      clearCodeSchedule();
      whySchoolCodeEditor.dataset.codeTyping = codeCardReady ? 'complete' : 'waiting';
    };
    const codeObserver = new IntersectionObserver(entries => {
      codeVisible = entries[0].isIntersecting && entries[0].intersectionRatio >= .35;
      if (codeVisible) startTyping();
      else stopTyping();
    }, { threshold: .35 });
    codeObserver.observe(whySchoolCodeEditor);
    const observeCodeAfterCard = event => {
      if (event.target !== projectCard || event.animationName !== 'why-school-card-reveal') return;
      projectCard.removeEventListener('animationend', observeCodeAfterCard);
      codeCardReady = true;
      startTyping();
    };
    if (!codeCardReady) projectCard.addEventListener('animationend', observeCodeAfterCard);
    const finishTyping = () => {
      clearCodeSchedule();
      whySchoolCodeEditor.dataset.codeTyping = 'complete';
      if (canTypeCode()) codeRestartTimer = setTimeout(startTyping, 2000);
    };
    whySchoolCodeEditor.addEventListener('animationend', event => {
      if (whySchoolCodeEditor.dataset.codeTyping === 'typing' && event.target === codeLines[codeLines.length - 1] && event.animationName === 'why-school-code-type') finishTyping();
    });
    whySchoolReducedMotion.addEventListener('change', event => {
      if (event.matches) {
        codeCardReady = true;
        projectCard?.removeEventListener('animationend', observeCodeAfterCard);
        stopTyping();
      } else {
        startTyping();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopTyping();
      else startTyping();
    });
  }
}

// Repeat the three learning steps only while their illustration is visible.
const whySchoolLearning = document.querySelector('#why-school .why-school-visual--learning');
if (whySchoolLearning && 'IntersectionObserver' in window) {
  const learningCard = whySchoolLearning.closest('.why-school-card');
  let learningVisible = false;
  let learningCardReady = learningCard?.dataset.cardReveal !== 'waiting';
  const learningProgress = whySchoolLearning.querySelector('.why-school-learning-progress');
  let learningTimer;
  let pendingLearningStep = 0;
  const stopLearning = () => {
    clearTimeout(learningTimer);
    pendingLearningStep = 0;
    whySchoolLearning.dataset.learningActive = 'false';
  };
  const beginLearningCycle = () => {
    whySchoolLearning.dataset.learningStep = '1';
    pendingLearningStep = 2;
    whySchoolLearning.dataset.learningRouteStep = '2';
  };
  const startLearning = () => {
    stopLearning();
    if (!learningVisible || !learningCardReady || whySchoolReducedMotion.matches || document.hidden) return;
    whySchoolLearning.dataset.learningStep = '0';
    whySchoolLearning.dataset.learningRouteStep = '0';
    whySchoolLearning.dataset.learningActive = 'true';
    learningTimer = setTimeout(beginLearningCycle, 350);
  };
  // A destination node lights only after the route's actual CSS transition ends.
  learningProgress.addEventListener('transitionend', event => {
    if (event.target !== learningProgress || event.propertyName !== 'stroke-dashoffset' ||
        whySchoolLearning.dataset.learningActive !== 'true' || !pendingLearningStep) return;
    const arrivedStep = pendingLearningStep;
    pendingLearningStep = 0;
    whySchoolLearning.dataset.learningStep = String(arrivedStep);
    if (arrivedStep === 2) {
      learningTimer = setTimeout(() => {
        pendingLearningStep = 3;
        whySchoolLearning.dataset.learningRouteStep = '3';
      }, 200);
    } else {
      learningTimer = setTimeout(() => {
        whySchoolLearning.dataset.learningStep = '0';
        whySchoolLearning.dataset.learningRouteStep = '0';
        learningTimer = setTimeout(beginLearningCycle, 450);
      }, 2000);
    }
  });
  if (!whySchoolReducedMotion.matches) {
    whySchoolLearning.dataset.learningStep = '0';
    whySchoolLearning.dataset.learningRouteStep = '0';
  }
  new IntersectionObserver(entries => {
    learningVisible = entries[0].isIntersecting && entries[0].intersectionRatio >= .25;
    if (learningVisible) startLearning();
    else stopLearning();
  }, { threshold: .25 }).observe(whySchoolLearning);
  const learningCardFinished = event => {
    if (event.target !== learningCard || event.animationName !== 'why-school-card-reveal') return;
    learningCardReady = true;
    learningCard.removeEventListener('animationend', learningCardFinished);
    startLearning();
  };
  if (!learningCardReady) learningCard.addEventListener('animationend', learningCardFinished);
  whySchoolReducedMotion.addEventListener('change', event => {
    if (event.matches) {
      stopLearning();
      learningCardReady = true;
      learningCard?.removeEventListener('animationend', learningCardFinished);
      whySchoolLearning.dataset.learningStep = '3';
      whySchoolLearning.dataset.learningRouteStep = '3';
    } else {
      startLearning();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLearning();
    else startLearning();
  });
}

// Uncover each curriculum card left to right while keeping its grid slot intact.
const commonCourseCards = [...document.querySelectorAll('#learning .common-courses-grid > .common-course-card')];
const commonCourseReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
if (commonCourseCards.length && !commonCourseReducedMotion.matches && 'IntersectionObserver' in window) {
  const commonCourseObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting || entry.intersectionRatio < .12) continue;
      entry.target.dataset.courseReveal = 'visible';
      commonCourseObserver.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -56px 0px', threshold: .12 });
  for (const card of commonCourseCards) {
    card.dataset.courseReveal = 'waiting';
    commonCourseObserver.observe(card);
    card.addEventListener('animationend', event => {
      if (event.target === card && event.animationName === 'common-course-wipe') card.dataset.courseReveal = 'complete';
    });
  }
  commonCourseReducedMotion.addEventListener('change', event => {
    if (!event.matches) return;
    for (const card of commonCourseCards) card.dataset.courseReveal = 'complete';
    commonCourseObserver.disconnect();
  });
}

// Count education hours once when each summary/card enters the viewport.
const educationHourNumbers = [...document.querySelectorAll('#education-hours .education-hours-number[data-count-to]')];
const educationHoursReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
if (educationHourNumbers.length && !educationHoursReducedMotion.matches && 'IntersectionObserver' in window) {
  const educationHoursFormatter = new Intl.NumberFormat('ko-KR');
  const educationHoursCounters = educationHourNumbers.map(number => ({
    number,
    target: Number(number.dataset.countTo),
    frame: 0,
    state: 'waiting',
    container: number.closest('.education-hours-summary, .education-time-stages > li')
  }));
  const finishEducationCounter = counter => {
    cancelAnimationFrame(counter.frame);
    counter.number.textContent = educationHoursFormatter.format(counter.target);
    counter.number.dataset.countState = 'complete';
    counter.state = 'complete';
    educationHoursObserver.unobserve(counter.container);
  };
  const startEducationCounter = counter => {
    counter.state = 'counting';
    counter.number.dataset.countState = 'counting';
    let startedAt;
    const tick = now => {
      if (startedAt === undefined) startedAt = now;
      const progress = Math.min((now - startedAt) / 2200, 1);
      const eased = progress < .5 ? 4 * progress ** 3 : 1 - ((-2 * progress + 2) ** 3) / 2;
      counter.number.textContent = educationHoursFormatter.format(Math.round(counter.target * eased));
      if (progress < 1) counter.frame = requestAnimationFrame(tick);
      else finishEducationCounter(counter);
    };
    counter.frame = requestAnimationFrame(tick);
  };
  const educationHoursObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const counter = educationHoursCounters.find(item => item.container === entry.target);
      if (!counter || counter.state === 'complete') continue;
      if (entry.isIntersecting && entry.intersectionRatio >= .25) {
        if (counter.state === 'waiting') {
          if (document.hidden) finishEducationCounter(counter);
          else startEducationCounter(counter);
        }
      } else if (counter.state === 'counting') {
        finishEducationCounter(counter);
      }
    }
  }, { rootMargin: '0px 0px -80px 0px', threshold: .25 });
  for (const counter of educationHoursCounters) {
    counter.number.textContent = '0';
    counter.number.dataset.countState = 'waiting';
    educationHoursObserver.observe(counter.container);
  }
  educationHoursReducedMotion.addEventListener('change', event => {
    if (!event.matches) return;
    for (const counter of educationHoursCounters) finishEducationCounter(counter);
    educationHoursObserver.disconnect();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    for (const counter of educationHoursCounters) {
      if (counter.state === 'counting') finishEducationCounter(counter);
    }
  });
}

;

// activity-gallery.js
"use strict";

const activityGallery = document.querySelector('#activities .activity-gallery');
if (activityGallery) {
  const slides = [...activityGallery.querySelectorAll('.activity-gallery-slide')];
  const filters = [...activityGallery.querySelectorAll('[data-gallery-category]')];
  const stage = activityGallery.querySelector('.activity-gallery-stage');
  const dots = activityGallery.querySelector('.activity-gallery-dots');
  const caption = activityGallery.querySelector('.activity-gallery-caption');
  const description = activityGallery.querySelector('.activity-gallery-description');
  const categoryLabel = activityGallery.querySelector('.activity-gallery-category');
  const names = { orientation: '오리엔테이션', lecture: '특강', field: '현장학습', jobfair: '취업박람회', graduation: '수료식' };
  const positions = Object.fromEntries(filters.map(filter => [filter.dataset.galleryCategory, 0]));
  let category = 'orientation';
  let currentSlides = [];
  let dotButtons = [];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let visibleSlide;
  let renderSequence = 0;
  let preparingSequence = 0;
  let transitionLayer;
  let transitionAnimations = [];
  const clearTransition = () => {
    for (const animation of transitionAnimations) animation.cancel();
    transitionAnimations = [];
    transitionLayer?.remove();
    transitionLayer = undefined;
    delete activityGallery.dataset.galleryAnimating;
  };
  const renderGallery = async (direction = 0) => {
    const sequence = ++renderSequence;
    const index = positions[category];
    const current = currentSlides[index];
    const previous = currentSlides[(index - 1 + currentSlides.length) % currentSlides.length];
    const next = currentSlides[(index + 1) % currentSlides.length];
    // Decode before replacing the central image; stale requests never commit.
    for (const slide of [current, previous, next]) slide.querySelector('img').loading = 'eager';
    if (visibleSlide && visibleSlide !== current) {
      preparingSequence = sequence;
      await current.querySelector('img').decode().catch(() => {});
      if (sequence !== renderSequence) return;
    }
    preparingSequence = 0;
    const outgoing = visibleSlide;
    clearTransition();
    let layer;
    let movingFrames;
    if (outgoing && outgoing !== current && outgoing.dataset.category === current.dataset.category) {
      const from = currentSlides.indexOf(outgoing);
      const forward = (index - from + currentSlides.length) % currentSlides.length;
      direction ||= forward <= currentSlides.length / 2 ? 1 : -1;
    } else direction = 0;
    if (outgoing && outgoing !== current && !reducedMotion.matches && typeof current.animate === 'function') {
      // Separate slots keep wrap-around previews outside the central path.
      const makePhoto = slide => {
        const photo = slide.querySelector('.activity-gallery-photo').cloneNode(true);
        photo.querySelector('img').alt = '';
        photo.querySelector('img').loading = 'eager';
        return photo;
      };
      layer = document.createElement('div');
      layer.className = 'activity-gallery-transition-layer';
      layer.setAttribute('aria-hidden', 'true');
      layer.inert = true;
      if (direction) {
        layer.classList.add('activity-gallery-transition-track');
        const from = currentSlides.indexOf(outgoing);
        const neighbor = activityGallery.querySelector('[data-gallery-position="next"]');
        const distance = new DOMMatrixReadOnly(getComputedStyle(neighbor).transform).m41;
        const pose = slot => ({
          transform: `translateX(${slot * distance}px) scale(${slot === 0 ? 1 : .92})`,
          opacity: slot === 0 ? 1 : .52,
          filter: slot === 0 ? 'blur(0px)' : 'blur(4px)'
        });
        movingFrames = [];
        for (let slot = -2; slot <= 2; slot++) {
          const slide = currentSlides[(from + slot + currentSlides.length * 2) % currentSlides.length];
          const frame = document.createElement('div');
          frame.className = 'activity-gallery-transition-frame';
          frame.style.cssText = slide.style.cssText;
          frame.classList.add(...[...slide.classList].filter(name => name.startsWith('export-style-')));
          const initial = pose(slot);
          frame.style.transform = initial.transform;
          frame.style.zIndex = slot === direction ? '3' : slot === 0 ? '2' : '1';
          const photo = makePhoto(slide);
          photo.style.opacity = initial.opacity;
          photo.style.filter = initial.filter;
          frame.append(photo);
          layer.append(frame);
          movingFrames.push({ frame, photo, from: initial, to: pose(slot - direction) });
        }
        activityGallery.dataset.galleryAnimating = 'true';
      } else {
        layer.style.cssText = outgoing.style.cssText;
        layer.classList.add(...[...outgoing.classList].filter(name => name.startsWith('export-style-')));
        layer.append(makePhoto(outgoing));
      }
      stage.append(layer);
      transitionLayer = layer;
    }
    for (const slide of slides) {
      const active = slide === current;
      slide.dataset.galleryPosition = active ? 'current' : slide === previous ? 'previous' : slide === next ? 'next' : 'hidden';
      slide.setAttribute('aria-hidden', String(!active));
      slide.inert = !active;
    }
    current.querySelector('img').loading = 'eager';
    caption.textContent = current.dataset.title;
    description.textContent = current.dataset.description;
    categoryLabel.textContent = names[category];
    current.setAttribute('aria-label', `${names[category]} ${index + 1}번째 사진: ${current.dataset.title}`);
    for (let i = 0; i < dotButtons.length; i++) dotButtons[i].setAttribute('aria-current', String(i === index));
    visibleSlide = current;
    if (layer) {
      const options = { duration: 480, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' };
      transitionAnimations = movingFrames ? movingFrames.flatMap(({ frame, photo, from, to }) => [
        frame.animate([{ transform: from.transform }, { transform: to.transform }], options),
        photo.animate([{ opacity: from.opacity, filter: from.filter }, { opacity: to.opacity, filter: to.filter }], options)
      ]) : [
        layer.animate([{ opacity: 1 }, { opacity: 0 }], options),
        current.animate([{ opacity: 0 }, { opacity: 1 }], options)
      ];
      Promise.allSettled(transitionAnimations.map(animation => animation.finished)).then(() => {
        if (transitionLayer === layer) {
          clearTransition();
        } else layer.remove();
      });
    }
  };
  const selectCategory = value => {
    category = value;
    currentSlides = slides.filter(slide => slide.dataset.category === category);
    for (const filter of filters) filter.setAttribute('aria-pressed', String(filter.dataset.galleryCategory === category));
    dots.replaceChildren();
    dotButtons = currentSlides.map((slide, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'activity-gallery-dot';
      button.setAttribute('aria-label', `${slide.dataset.title} 사진 보기`);
      const mark = document.createElement('span');
      mark.setAttribute('aria-hidden', 'true');
      button.append(mark);
      button.addEventListener('click', () => { positions[category] = index; renderGallery(); });
      dots.append(button);
      return button;
    });
    renderGallery();
  };
  const moveGallery = direction => {
    // Ignore extra input during decoding or motion; never replay clicks later.
    if (preparingSequence || transitionLayer) return;
    positions[category] = (positions[category] + direction + currentSlides.length) % currentSlides.length;
    renderGallery(direction);
  };
  if (slides.length && stage && dots && caption && description && categoryLabel) {
    activityGallery.dataset.galleryReady = 'true';
    for (const element of activityGallery.querySelectorAll('.activity-gallery-filters, .activity-gallery-arrows, .activity-gallery-info, .activity-gallery-pagination')) element.hidden = false;
    for (const filter of filters) filter.addEventListener('click', () => selectCategory(filter.dataset.galleryCategory));
    for (const arrow of activityGallery.querySelectorAll('[data-gallery-direction]')) arrow.addEventListener('click', () => moveGallery(Number(arrow.dataset.galleryDirection)));
    activityGallery.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        moveGallery(event.key === 'ArrowLeft' ? -1 : 1);
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        positions[category] = event.key === 'Home' ? 0 : currentSlides.length - 1;
        renderGallery();
      }
    });
    let gesture;
    stage.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.target.closest('button') || (event.pointerType === 'mouse' && event.button !== 0)) return;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    stage.addEventListener('pointerup', event => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      gesture = undefined;
      if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.3) moveGallery(dx < 0 ? 1 : -1);
    });
    stage.addEventListener('pointercancel', () => { gesture = undefined; });
    stage.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') gesture = undefined; });
    reducedMotion.addEventListener('change', () => { clearTransition(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTransition(); } });
    selectCategory(category);
  }
}

;

// activity-projects.js
// Celebrate the project section once when its heading enters the viewport.
(() => {
  const section = document.querySelector('.activity-projects');
  const heading = section?.querySelector('.activity-projects-heading');
  if (!heading || !('IntersectionObserver' in window)) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches) return;
  let headingVisible = false;
  let started = false;
  let finishedParticles = 0;
  const particleCount = section.querySelectorAll('.activity-project-particle').length;
  section.dataset.confetti = 'waiting';
  const settle = () => {
    section.dataset.confetti = 'complete';
    observer.disconnect();
    section.removeEventListener('animationend', onParticleFinished);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    reducedMotion.removeEventListener('change', onMotionPreference);
  };
  const begin = () => {
    if (started || !headingVisible || document.hidden) return;
    started = true;
    section.dataset.confetti = 'burst';
    observer.disconnect();
  };
  const onParticleFinished = event => {
    if (event.animationName !== 'activity-project-confetti-burst') return;
    if (++finishedParticles >= particleCount) settle();
  };
  const onVisibilityChange = () => {
    if (document.hidden && started) settle();
    else begin();
  };
  const onMotionPreference = event => {
    if (event.matches) settle();
  };
  const observer = new IntersectionObserver(entries => {
    headingVisible = entries[0].isIntersecting && entries[0].intersectionRatio >= .45;
    begin();
  }, { threshold: .45, rootMargin: '0px 0px -60px 0px' });
  section.addEventListener('animationend', onParticleFinished);
  document.addEventListener('visibilitychange', onVisibilityChange);
  reducedMotion.addEventListener('change', onMotionPreference);
  observer.observe(heading);
})();

;
// Local HTML files cannot provide the HTTP origin required by YouTube embeds.
// Keep HTTP previews embedded; show a working YouTube link when opened as a file.
(() => {
  if (location.protocol !== 'file:') return;
  document.querySelectorAll('.activity-project-player').forEach(container => {
    const frame = container.querySelector('iframe');
    const sourceLink = container.closest('.activity-project-card')?.querySelector('.activity-project-link');
    if (!frame || !sourceLink) return;
    const videoId = new URL(frame.src).pathname.split('/').pop();
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return;
    const link = document.createElement('a');
    link.className = 'activity-project-file-video';
    link.href = sourceLink.href;
    link.target = '_blank';
    link.rel = 'noopener';
    link.setAttribute('aria-label', frame.title + ' 유튜브에서 재생');
    const poster = document.createElement('img');
    poster.src = 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';
    poster.alt = '';
    poster.loading = 'lazy';
    poster.decoding = 'async';
    const play = document.createElement('span');
    play.className = 'activity-project-file-play';
    play.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'activity-project-file-caption';
    label.textContent = '유튜브에서 재생';
    link.append(poster, play, label);
    container.replaceChildren(link);
  });
})();
