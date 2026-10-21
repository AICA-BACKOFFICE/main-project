/* 인사교 알아보기 모바일(10-15, 캔버스 '알아보기 수정본' 시안 반영)
   마크업(.am-*)은 src/pages/about/index.html, 보이는 규칙은 css/about-m.css(600px 이하)에 있음.
   여기서는 동작만: 바로가기 탭(아래 고정 · 지금 장 표시) · 6기/7기 · 후속 프로그램 전환 · 교과목 더 보기 ·
   '왜 인사교' 아코디언 · 옆으로 넘기는 줄(뉴스 · 프로젝트 · 활동 사진)의 화살표. 웹(601px 이상)은 그대로. */
(function(){
  var mq = matchMedia('(max-width: 600px)');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var $ = function(s, c){ return (c || document).querySelector(s); };
  var $$ = function(s, c){ return [].slice.call((c || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var ARROW = { prev: 'm14 5-7 7 7 7', next: 'm10 5 7 7-7 7' };

  /* 1) 바로가기 탭: 처음엔 히어로 아래, 지나가면 아래 고정(같은 탭을 복제) */
  var tabs = $('.am-tabs');
  var marks = $$('.am-ch');
  if (tabs && marks.length){
    var dock = tabs.cloneNode(true);
    dock.className = 'am-dock'; dock.setAttribute('aria-label', '인사교 알아보기 바로가기(아래 고정)');
    document.body.appendChild(dock);
    var btns = $$('.am-seg--tabs button');
    var cur = 0;
    var setCur = function(k){
      if (k === cur) return; cur = k;
      btns.forEach(function(b){ b.setAttribute('aria-current', String(+b.dataset.jump === k)); });
    };
    var hdr = function(){ var h = $('#siteHeader'); return h ? h.getBoundingClientRect().bottom : 60; };
    btns.forEach(function(b){ b.addEventListener('click', function(){
      var m = document.getElementById('am-ch' + b.dataset.jump); if (!m) return;
      setCur(+b.dataset.jump);
      scrollTo({ top: Math.max(0, m.getBoundingClientRect().top + scrollY - hdr()), behavior: reduce.matches ? 'auto' : 'smooth' });
    }); });
    var raf;
    var onScroll = function(){
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function(){
        if (!mq.matches){ root.classList.remove('am-docked'); return; }
        var top = hdr();
        root.classList.toggle('am-docked', tabs.getBoundingClientRect().bottom <= top);
        var k = 1;
        marks.forEach(function(m, i){ if (m.getBoundingClientRect().top <= top + 24) k = i + 1; });
        if (innerHeight + scrollY >= root.scrollHeight - 4) k = marks.length;
        setCur(k);
      });
    };
    cur = -1; setCur(1);
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    if (mq.addEventListener) mq.addEventListener('change', onScroll);
    onScroll();
  }

  /* 2) 세그먼트 전환(6기/7기 · 후속 프로그램): 고른 것만 보임 */
  function segment(seg, target, first){
    if (!seg || !target) return;
    var bs = $$('button', seg);
    var pick = function(k){
      target.dataset.k = k;
      bs.forEach(function(b){ b.setAttribute('aria-pressed', String(b.dataset.k === k)); });
    };
    bs.forEach(function(b){ b.addEventListener('click', function(){ pick(b.dataset.k); }); });
    target.classList.add('am-on'); pick(first);
  }
  segment($('.am-seg--cohort'), $('.cohort-comparison'), '7');
  segment($('.am-seg--program'), $('.career-program-grid'), '0');

  /* 3) 공통 교과목: 6개 먼저, 나머지는 더 보기 */
  var grid = $('#am-courses'), more = $('.am-more');
  if (grid && more){
    var rest = Math.max(0, grid.children.length - 6);
    var setMore = function(on){
      grid.classList.toggle('is-more', on); more.setAttribute('aria-expanded', String(on));
      more.textContent = on ? '접기 ↑' : '교과목 ' + rest + '개 더 보기 ↓';
    };
    grid.classList.add('am-on'); setMore(false);
    more.addEventListener('click', function(){ setMore(!grid.classList.contains('is-more')); });
  }

  /* 4) 왜 인사교: 아코디언(첫 번째 펼침). 머리 버튼은 카드의 소제목 · 제목을 그대로 씀 */
  var why = $$('#why-school .why-school-cards > .why-school-card');
  if (why.length){
    $('#why-school .why-school-cards').classList.add('am-on');
    var setOpen = function(n){
      why.forEach(function(c, j){ c.classList.toggle('is-open', j === n); $('.am-acc-btn', c).setAttribute('aria-expanded', String(j === n)); });
    };
    why.forEach(function(card, i){
      var k = $('.why-school-card-kicker', card), t = $('h4', card);
      var h = document.createElement('h4'); h.className = 'am-acc-h';
      h.innerHTML = '<button type="button" class="am-acc-btn"><span class="am-acc-no"></span><span class="am-acc-tx"><span class="am-acc-k"></span><span class="am-acc-t"></span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>';
      $('.am-acc-no', h).textContent = '0' + (i + 1);
      $('.am-acc-k', h).textContent = k ? k.textContent : '';
      $('.am-acc-t', h).textContent = t ? t.textContent : '';
      card.id = card.id || 'am-why-' + (i + 1);
      $('button', h).setAttribute('aria-controls', card.id);
      card.insertBefore(h, card.firstChild);
      card.classList.add('am-acc');
      $('button', h).addEventListener('click', function(){ setOpen(card.classList.contains('is-open') ? -1 : i); });
    });
    setOpen(0);
  }

  /* 5) 옆으로 넘기는 줄: 오른쪽에 더 있으면 다음 화살표, 넘기면 이전 화살표(웹 활동 갤러리 화살표 모양) */
  function rail(scroller, label){
    if (!scroller) return;
    var box = scroller.parentNode;
    box.classList.add('am-rail-box');
    scroller.classList.add('am-rail');
    var mk = function(dir){
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'am-arrow am-arrow--' + dir;
      b.setAttribute('aria-label', (dir === 'prev' ? '이전 ' : '다음 ') + label);
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ARROW[dir] + '"/></svg>';
      b.addEventListener('click', function(){
        scroller.scrollBy({ left: (dir === 'prev' ? -1 : 1) * scroller.clientWidth * 0.8, behavior: reduce.matches ? 'auto' : 'smooth' });
      });
      box.appendChild(b); return b;
    };
    var p = mk('prev'), n = mk('next');
    var media = $('.activity-project-player, .activity-gallery-photo', scroller);
    var upd = function(){
      // 사진·영상의 가운데를 기준으로 두 화살표를 맞춘다.
      if (media && mq.matches){
        var frame = media.getBoundingClientRect(), bounds = box.getBoundingClientRect();
        box.style.setProperty('--am-arrow-y', (frame.top - bounds.top + frame.height / 2) + 'px');
      } else box.style.removeProperty('--am-arrow-y');
      p.hidden = scroller.scrollLeft <= 4;
      n.hidden = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 4;
    };
    scroller.addEventListener('scroll', upd, { passive: true });
    addEventListener('resize', upd);
    if (media && typeof ResizeObserver !== 'undefined'){
      var observer = new ResizeObserver(upd); observer.observe(box); observer.observe(media);
    }
    upd();
    setTimeout(upd, 600);
  }
  /* 활동 사진: 모바일에선 한 장씩 넘기던 갤러리 대신 모든 사진을 한 줄로 보여 줌.
     웹 갤러리의 밀기(스와이프) 넘김은 끄고, 숨겨 두던 사진을 화면 읽기 프로그램에도 보이게 함 */
  var gal = $('.activity-gallery-viewport');
  if (gal){
    gal.addEventListener('pointerdown', function(e){ if (mq.matches) e.stopPropagation(); }, true);
    var openSlides = function(){
      $$('.activity-gallery-slide').forEach(function(s){
        if (mq.matches){ s.removeAttribute('aria-hidden'); s.inert = false; }
        else {
          var inactive = s.dataset.galleryPosition !== 'current';
          s.setAttribute('aria-hidden', String(inactive));
          s.inert = inactive;
        }
      });
    };
    openSlides();
    if (mq.addEventListener) mq.addEventListener('change', openSlides);
  }

  rail($('.intro-news-papers'), '기사');
  rail($('.activity-project-grid'), '프로젝트');
  rail($('.activity-gallery-stage'), '활동 사진');
})();
