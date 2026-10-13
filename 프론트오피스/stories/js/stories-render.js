/* =========================================================
   선배들의 이야기 — 글 그리기
   관리자 페이지 '게시물 관리'에서 쓴 후기 · 인터뷰 · 프로젝트 · 기수 기록(js/stories-data.js)을
   디자이너 시안과 같은 마크업으로 그립니다. 거르기 · 페이지 넘김 · 탭은 지금처럼 CSS와 stories.js가 맡아요.
   stories-sections.js · stories.js보다 먼저 불러옵니다(defer 순서).
   - 목록은 최신 글이 먼저, 맨 위 대표 이야기는 종류마다 가장 최근 글이에요.
   - 후기가 7쪽을 넘거나 프로젝트가 6개를 넘으면 그만큼의 넘김 규칙(CSS)을 함께 만들어요.
   ========================================================= */
(function () {
  'use strict';
  var D = window.STORIES_DATA, page = document.querySelector('.stories-page');
  if (!D || !page) return;
  var REV = D.reviews || [], IV = D.interviews || [], PJ = D.projects || [], CO = D.cohorts || [];
  var PER = 8;            // 후기 한 쪽에 8개
  var CSS_PAGES = 7;      // stories.css에 넘김 규칙이 있는 쪽 수
  var CSS_PROJECTS = 6;   // stories.css에 넘김 규칙이 있는 프로젝트 수
  var TAGS = ['#비전공자', '#타지출신', '#직장인출신', '#졸업생', '#적응', '#팀활동', '#취업연계'];
  var CAT = {
    life: { name: '생활', c: '#22D3EE', bg: '#DFF8FC', dk: '#0B5563', tick: '#0E9DB3' },
    class: { name: '수업', c: '#FFE600', bg: '#FFF8C2', dk: '#5A4F00', tick: '#C9A800' },
    proj: { name: '프로젝트', c: '#8CFF3F', bg: '#ECFFD9', dk: '#2F5A12', tick: '#4FA51A' },
    career: { name: '취업·진로', c: '#1F4ED8', bg: '#DCE5F7', dk: '#15368F', tick: '#1F4ED8' }
  };
  var COH_COLOR = { 7: '#10203D', 6: '#1F4ED8', 5: '#2F6BFF', 4: '#6E97F2', 3: '#8FA8D8' };
  var REVIEW_COVER = { src: 'assets/cover-living-costs.jpg', alt: '', w: 1536, h: 1024 };
  var PROJECT_SECTIONS = [
    ['문제 정의', '어떤 문제를, 누구를 위해 풀었는지 들어갈 자리예요.'],
    ['접근 방법', '데이터 · 모델 · 서비스 구조를 어떻게 잡았는지 들어갈 자리예요.'],
    ['결과와 다음 단계', '실증 · 검증 결과와 수료 뒤 이어진 이야기가 들어갈 자리예요.']
  ];
  var ARROW_L = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ARROW_R = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
  function $(s, r) { return (r || page).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || page).querySelectorAll(s)); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function coh(n) { return esc(n) + '<i>기</i>'; }
  function cat(r) { return CAT[r.cat] || CAT.life; }
  function firstTag(r) { return r.tags && r.tags.length ? TAGS[r.tags[0]] : ''; }
  function tagClasses(list, prefix) { return (list || []).map(function (t) { return ' ' + prefix + t; }).join(''); }
  function firstSentence(t) { var m = String(t || '').match(/^.*?[.!?。](\s|$)/); return (m ? m[0] : String(t || '')).trim(); }
  // 사진(img) 또는 그림(svg, 관리자가 가져온 시안 그림)
  function imgTag(m, cls, lazy) {
    if (!m || !m.src) return '';
    return '<img class="' + cls + '" src="' + esc(m.src) + '" alt="' + esc(m.alt || '') + '"' + (lazy ? ' loading="lazy" decoding="async"' : '')
      + (m.w ? ' width="' + m.w + '"' : '') + (m.h ? ' height="' + m.h + '"' : '') + '>';
  }
  function visual(item, opts) {
    opts = opts || {};
    var m = opts.large && item.imgLarge ? item.imgLarge : item.img;
    if (m && m.src) return imgTag(opts.alt === false ? { src: m.src, alt: '', w: m.w, h: m.h } : m, 'illu', true);
    if (item.art) return opts.hidden ? item.art.replace(/^<svg\b/, '<svg aria-hidden="true"') : item.art;
    return '<svg class="illu" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"' + (opts.hidden ? ' aria-hidden="true"' : '') + '><rect width="100%" height="100%" fill="#E4E9F7"/></svg>';
  }
  function insertAfter(ref, markup) { if (ref) ref.insertAdjacentHTML('afterend', markup); }
  function anchorNo(anchor, fallback) { var m = /-(\d+)$/.exec(anchor || ''); return m ? m[1] : fallback; }

  /* ── 후기 ── */
  var rev = $('#p-rev');
  if (rev) {
    var pages = Math.max(1, Math.ceil(REV.length / PER));
    // 쪽 번호 라디오(보기 방식 라디오 바로 뒤)와 아래 쪽 번호
    $$('input[name="pgn"]', rev).forEach(function (r) { r.remove(); });
    var radios = '';
    for (var p = 1; p <= pages; p++) radios += '<input class="tr" autocomplete="off" type="radio" name="pgn" id="pgn' + p + '"' + (p === 1 ? ' checked' : '') + '>';
    insertAfter($('#vm-list', rev), radios);
    var pager = $('.pager', rev);
    if (pager) {
      var labels = '';
      for (p = 1; p <= pages; p++) labels += '<label for="pgn' + p + '">' + p + '</label>';
      pager.innerHTML = labels;
      pager.hidden = pages < 2;
    }
    var cards = '', rows = '', ticks = '';
    REV.forEach(function (r, i) {
      var c = cat(r), pg = Math.floor(i / PER) + 1, cls = 'cat-' + esc(r.cat) + ' coh' + esc(r.cohort) + tagClasses(r.tags, 'tg');
      var tag = firstTag(r);
      cards += '<a class="idc ' + cls + ' pg' + pg + '" href="#' + esc(r.anchor) + '" style="--c:' + c.c + ';--bg:' + c.bg + ';--dk:' + c.dk + '">'
        + '<div class="cbar"><b data-field="category">' + c.name + '</b><span data-field="cohort">' + coh(r.cohort) + '</span></div>'
        + '<div class="in"><h3 data-field="title">' + esc(r.title) + '</h3><p data-field="summary">' + esc(r.summary) + '</p>'
        + '<div class="who"><b data-field="author">' + esc(r.author) + '</b><em data-field="track">' + esc(r.track) + '</em>'
        + (tag ? '<span class="tg" data-field="tag">' + esc(tag) + '</span>' : '') + '</div></div></a>';
      rows += '<a class="rvr ' + cls + ' pg' + pg + '" href="#' + esc(r.anchor) + '">'
        + '<span class="cg" style="background:' + c.c + '" data-field="category">' + c.name + '</span>'
        + '<span class="tt" data-field="title">' + esc(r.title) + '</span>'
        + (tag ? '<span class="tg" style="background:' + c.bg + ';color:' + c.dk + '" data-field="tag">' + esc(tag) + '</span>' : '')
        + '<span class="mt">' + esc(r.cohort) + '기 · ' + esc(r.track) + '</span></a>';
    });
    // 흐르는 한 줄 띠: 최신 후기 20개를 두 번 이어 붙여 끊김 없이 돌아요(두 번째 줄은 화면 낭독기·탭에서 숨김)
    var tickList = REV.slice(0, 20).map(function (r) {
      return '<a class="lq-c" href="#' + esc(r.anchor) + '" style="--c:' + cat(r).tick + '"%HIDE%><span class="t">' + esc(r.ticker || firstSentence(r.summary))
        + '</span><span class="a">' + esc(r.author) + ' · ' + esc(r.cohort) + '기</span></a>';
    }).join('');
    ticks = tickList.replace(/%HIDE%/g, '') + tickList.replace(/%HIDE%/g, ' aria-hidden="true" tabindex="-1"');
    var grid = $('.idgrid', rev), list = $('.rvlist', rev), lq = $('.lq-t', rev);
    if (grid) grid.innerHTML = cards;
    if (list) list.innerHTML = rows;
    if (lq) lq.innerHTML = ticks;
    // 후기 글 창(.ov)은 .st-main 바로 뒤에
    $$('.ov').forEach(function (o) { o.remove(); });
    var ovs = REV.map(function (r) {
      var c = cat(r), id = esc(r.anchor);
      var tags = (r.tags || []).map(function (t) { return '<a class="t" href="#tg-' + t + '" data-field="tag">' + esc(TAGS[t]) + '</a>'; }).join('');
      return '<div class="ov cat-' + esc(r.cat) + ' coh' + esc(r.cohort) + tagClasses(r.tags, 'tg') + '" id="' + id + '" style="--c:' + c.c + ';--bg:' + c.bg + ';--dk:' + c.dk + '" role="dialog" aria-modal="true" aria-labelledby="' + id + '-t">'
        + '<a class="back" href="#p-rev" aria-label="닫기"></a><div class="sheet"><a class="x" href="#p-rev" aria-label="닫기">&times;</a><div class="mscroll">'
        + '<div class="mtop"><div class="mcat" data-field="category">' + c.name + '</div><h3 id="' + id + '-t" data-field="title">' + esc(r.title) + '</h3>'
        + '<div class="mby"><span class="mav" data-field="cohort">' + coh(r.cohort) + '</span><div><b data-field="author">' + esc(r.author) + '</b><em data-field="track">' + esc(r.track) + '</em></div></div></div>'
        + '<div class="mbody"><p class="lead" data-field="summary">' + esc(r.summary) + '</p>'
        + (r.body || []).map(function (b) { return '<p data-field="body">' + esc(b) + '</p>'; }).join('')
        + (tags ? '<div class="mtags">' + tags + '<span class="hint">태그를 누르면 창이 닫히고 그 태그의 후기만 모여요</span></div>' : '')
        + '</div></div></div></div>';
    }).join('');
    insertAfter($('.st-main'), ovs);
  }

  /* ── 인터뷰 ── */
  var ivPane = $('#p-iv');
  if (ivPane) {
    var grid2 = $('.ivgrid', ivPane), dots = $('.ivdots', ivPane);
    if (grid2) grid2.innerHTML = IV.map(function (v) {
      var vid = v.video && v.video.yt;
      return '<a class="iv" href="#' + esc(v.anchor) + '"' + (vid ? ' data-yt="' + esc(v.video.yt) + '"' : '') + '>'
        + '<div class="ph">' + visual(v, { alt: false }) + (vid ? '<span class="play"><i></i></span><span class="dur" data-field="duration">' + esc(v.video.dur || '') + '</span>' : '') + '</div>'
        + '<div class="tb"><h3 data-field="title">' + esc(v.title) + '</h3>'
        + (v.quote ? '<blockquote class="ivq">' + esc(v.quote) + '</blockquote>' : '')
        + '<p data-field="summary">' + esc(v.summary) + '</p>'
        + '<div class="by"><span class="av" data-field="cohort">' + coh(v.cohort) + '</span><b data-field="author">' + esc(v.author) + '</b><em data-field="track">' + esc(v.track) + '</em></div></div></a>';
    }).join('');
    if (dots) dots.innerHTML = IV.map(function (v, i) { return '<button type="button" aria-label="' + (i + 1) + '번째 인터뷰"></button>'; }).join('');
    $$('.ivd', ivPane).forEach(function (d) { d.remove(); });
    var details = IV.map(function (v) {
      var id = esc(v.anchor), no = anchorNo(v.anchor, id), vid = v.video && v.video.yt;
      var tag = '<span class="ivtag">' + esc(v.cohort) + '기 · ' + esc(v.track) + '</span>';
      var hero = vid
        ? '<div class="ivhero ivvid" data-yt="' + esc(v.video.yt) + '">' + tag + visual(v, { large: true, alt: false, hidden: true })
          + '<button class="ivplay" type="button" aria-label="인터뷰 영상 재생"><i></i></button><span class="dur">' + esc(v.video.dur || '') + '</span></div>'
        : '<div class="ivhero">' + tag + visual(v, { large: true, alt: false }) + '</div>';
      var qa = (v.qa || []).map(function (q, k) {
        return '<div id="q-' + no + '-' + (k + 1) + '"><div class="q"><i>' + (k + 1) + '</i><span data-field="question">' + esc(q.q) + '</span></div><p class="a" data-field="answer">' + esc(q.a) + '</p></div>';
      }).join('');
      var main = hero + '<h2 data-field="title">' + esc(v.title) + '</h2><p class="lead" data-field="summary">' + esc(v.summary) + '</p>'
        + '<div class="who2"><span class="av" data-field="cohort">' + coh(v.cohort) + '</span><div><b data-field="author">' + esc(v.author) + '</b><em data-field="track">' + esc(v.track) + '</em></div></div>'
        + (qa ? '<div class="qa">' + qa + '</div>' : '')
        + (vid && !qa ? '<p class="ivnote">영상 인터뷰예요. 위 화면에서 바로 재생됩니다. 영상 내용을 글로 옮긴 요약이 준비되면 이 아래에 함께 실어요.</p>' : '');
      var side;
      if (vid) {
        var mm = /^(\d+):(\d{1,2})$/.exec(v.video.dur || ''), len = mm ? (+mm[1] ? +mm[1] + '분 ' : '') + (+mm[2]) + '초' : (v.video.dur || '');
        side = '<h3>이 영상</h3><dl class="ivmeta">' + (len ? '<div><dt>길이</dt><dd>' + esc(len) + '</dd></div>' : '') + '<div><dt>기수</dt><dd>' + esc(v.cohort) + '기</dd></div><div><dt>직군</dt><dd>' + esc(v.track) + '</dd></div></dl>'
          + '<a class="ivyt" href="https://www.youtube.com/watch?v=' + esc(v.video.yt) + '" target="_blank" rel="noopener">유튜브에서 보기 ↗</a>';
      } else {
        side = '<h3>이 인터뷰에서 묻는 것</h3><ol>' + (v.qa || []).map(function (q, k) { return '<li><a href="#q-' + no + '-' + (k + 1) + '">' + esc(q.toc || q.q) + '</a></li>'; }).join('') + '</ol>';
      }
      return '<div class="ivd' + (vid ? ' ivd-v' : '') + '" id="' + id + '"><a class="ivback" href="#p-iv">← 인터뷰 목록</a><div class="ivwrap"><div>' + main + '</div><aside class="sidebox">' + side + '</aside></div></div>';
    }).join('');
    insertAfter($('.ivlist', ivPane), details);
  }

  /* ── 프로젝트 ── */
  var prPane = $('#p-pr');
  if (prPane) {
    var n = PJ.length, pr = $('.pr', prPane);
    $$('input[name="pr"]', prPane).forEach(function (r) { r.remove(); });
    var prRadios = PJ.map(function (x, i) { return '<input class="tr" autocomplete="off" type="radio" name="pr" id="pr' + i + '"' + (i === 0 ? ' checked' : '') + '>'; }).join('');
    if (pr) pr.insertAdjacentHTML('beforebegin', prRadios);
    var stage = $('.pr .stage', prPane), strip = $('.pr .strip', prPane);
    if (stage) stage.innerHTML = PJ.map(function (x, i) {
      var id = esc(x.anchor);
      return '<div class="pp pp' + i + '"><div class="ph">' + visual(x) + '<a class="pjph" href="#' + id + '" aria-label="' + esc(x.title) + ' 자세히 보기" tabindex="-1"></a></div><div><div class="no">' + pad2(i + 1) + '</div>'
        + '<h3 data-field="title"><a class="pjt" href="#' + id + '">' + esc(x.title) + '</a></h3>'
        + '<div class="tags">' + (x.tags || []).map(function (t) { return '<span data-field="tag">' + esc(t) + '</span>'; }).join('') + '</div>'
        + '<p class="sum" data-field="summary">' + esc(x.summary) + '</p>'
        + '<dl class="info"><div><dt>TEAM</dt><dd data-field="team">' + esc(x.team) + '</dd></div><div><dt>TYPE</dt><dd data-field="type">' + esc(x.type) + '</dd></div><div><dt>TERM</dt><dd data-field="term">' + esc(x.term) + '</dd></div></dl>'
        + '<a class="pjgo" href="#' + id + '">프로젝트 자세히 보기 <span aria-hidden="true">→</span></a></div>'
        + '<label class="arw l" for="pr' + ((i - 1 + n) % n) + '" aria-label="이전 프로젝트">' + ARROW_L + '</label>'
        + '<label class="arw r" for="pr' + ((i + 1) % n) + '" aria-label="다음 프로젝트">' + ARROW_R + '</label></div>';
    }).join('');
    if (strip) strip.innerHTML = PJ.map(function (x, i) { return '<label for="pr' + i + '">' + visual(x) + '<b>' + pad2(i + 1) + '</b></label>'; }).join('');
    $$('.pjd', prPane).forEach(function (d) { d.remove(); });
    var pjd = PJ.map(function (x, i) {
      var id = esc(x.anchor), prev = PJ[(i - 1 + n) % n], next = PJ[(i + 1) % n];
      var given = x.sections || [], filled = given.some(function (s) { return s.p; });
      var secs = PROJECT_SECTIONS.map(function (s, k) {
        var g = given[k] || {};
        return '<section><h3>' + esc(g.h || s[0]) + '</h3>' + (g.p ? '<p>' + esc(g.p) + '</p>' : '<p class="pjph-t">' + s[1] + '</p>') + '</section>';
      }).join('');
      var links = (x.links || []).filter(function (l) { return l && l.url; }).map(function (l) { return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label || '자료 보기') + ' ↗</a>'; }).join('');
      return '<div class="pjd" id="' + id + '"><a class="ivback" href="#p-pr">← 프로젝트 목록</a><div class="ivwrap"><div>'
        + '<div class="ivhero pjhero"><span class="ivtag">' + esc(x.type) + '</span>' + visual(x, { hidden: true }) + '</div>'
        + '<span class="pjno">' + pad2(i + 1) + '</span><h2>' + esc(x.title) + '</h2><p class="lead">' + esc(x.summary) + '</p>'
        + '<div class="pjtags">' + (x.tags || []).map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>'
        + '<div class="pjsec">' + secs + '</div>'
        + (links ? '<div class="pjlinks">' + links + '</div>' : '')
        + (filled ? '' : '<p class="ivnote">시안이라 본문은 자리만 잡아 두었어요. 관리자가 프로젝트를 올리면 이 자리에 내용과 시연 영상 · 발표 자료 링크가 들어갑니다.</p>')
        + '</div><aside class="sidebox pjside"><h3>프로젝트 정보</h3><dl class="ivmeta"><div><dt>팀</dt><dd>' + esc(x.team) + '</dd></div><div><dt>유형</dt><dd>' + esc(x.type) + '</dd></div><div><dt>기간</dt><dd>' + esc(x.term) + '</dd></div></dl>'
        + (n > 1 ? '<div class="pjnav"><a href="#' + esc(prev.anchor) + '"><small>이전 프로젝트</small>' + esc(prev.title) + '</a><a href="#' + esc(next.anchor) + '"><small>다음 프로젝트</small>' + esc(next.title) + '</a></div>' : '')
        + '</aside></div></div>';
    }).join('');
    insertAfter($('.pjlist', prPane), pjd);
  }

  /* ── 기수 기록 ── */
  var g2 = $('#p-coh .g2');
  if (g2) {
    $$('a.st', g2).forEach(function (a) { a.remove(); });
    g2.insertAdjacentHTML('beforeend', CO.map(function (c) {
      var vid = c.video && c.video.url;
      return '<a class="st c' + esc(c.cohort) + tagClasses(c.tags, 'g') + '" href="#"' + (vid ? ' data-yt="' + esc(c.video.url) + '"' : '') + (c.id ? ' data-st="' + esc(c.id) + '"' : '')
        + ' style="--c:' + (COH_COLOR[c.cohort] || '#2B2D31') + '"><div class="ph">' + visual(c) + (vid ? '<span class="play"><i></i></span>' + (c.video.dur ? '<span class="dur">' + esc(c.video.dur) + '</span>' : '') : '') + '</div>'
        + '<h3 data-field="title">' + esc(c.title) + '</h3><p data-field="summary">' + esc(c.summary) + '</p>'
        + '<div class="mt"><span class="cg" data-field="cohort">' + esc(c.cohort) + '기</span><span class="dt" data-field="date">' + esc(c.date || '') + '</span></div>'
        + (c.body ? '<template class="st-body">' + (Array.isArray(c.body) ? c.body : [c.body]).map(function (b) { return '<p>' + esc(b) + '</p>'; }).join('') + '</template>' : '')
        + '</a>';
    }).join(''));
  }

  /* ── 맨 위 대표 이야기: 종류마다 가장 최근 글 ── */
  var row = $('#hx .hx-row'), segs = $('#hx .hx-segs');
  if (row) {
    var panels = [];
    function by(av, b, rest, go, goLabel) {
      return '<div class="hx-by"><span class="hx-av">' + esc(av) + '</span><span><b>' + esc(b) + '</b>' + esc(rest) + '</span><a class="hx-go" href="' + go + '">' + goLabel + ' <span aria-hidden="true">→</span></a></div>';
    }
    function heroImg(m, first) { return imgTag(m, 'hx-img', !first); }
    function heroArt(svg, label) {
      return String(svg).replace(/^<svg\b([^>]*)>/, function (all, attrs) {
        var own = /\saria-label="([^"]*)"/.exec(attrs); // 그림에 이미 붙은 설명이 있으면 그대로
        attrs = attrs.replace(/\s(class|role|aria-label|aria-hidden)="[^"]*"/g, '');
        return '<svg' + attrs + ' role="img" class="hx-img" aria-label="' + (own ? own[1] : esc(label)) + '">';
      });
    }
    var r0 = REV[0], v0 = IV[0], p0 = PJ[0], c0 = CO[0];
    if (r0) panels.push({ kind: '후기', go: '#reviews', open: '후기', img: r0.heroImg || REVIEW_COVER,
      tx: '<div class="hx-k">대표 후기 · ' + cat(r0).name + '</div><h2>' + esc(r0.title) + '</h2><p>' + esc(r0.summary) + '</p>' + by(String(r0.author).charAt(0), r0.author, r0.cohort + '기 · ' + r0.track, '#reviews', '후기 읽기') });
    if (v0) panels.push({ kind: '인터뷰', go: '#interviews', open: '인터뷰', img: v0.imgLarge || v0.img, art: v0.art, alt: v0.cohort + '기 ' + v0.author + ' 인터뷰 사진',
      tx: '<div class="hx-k">대표 인터뷰 · ' + (v0.qa && v0.qa.length ? 'Q&amp;A ' + v0.qa.length : '영상') + '</div><h2>' + esc(v0.title) + '</h2><p>' + esc(v0.summary) + '</p>' + by(String(v0.author).charAt(0), v0.author, v0.cohort + '기 · ' + v0.track, '#interviews', '인터뷰 읽기') });
    if (p0) {
      var team = String(p0.team || '').split(' · ');
      var rest = [team.slice(1).join(' · ')].concat((p0.tags || []).slice(0, 2).map(function (t) { return String(t).replace(/^#/, ''); })).filter(Boolean).join(' · ');
      panels.push({ kind: '프로젝트', go: '#projects', open: '프로젝트', img: p0.img, art: p0.heroArt || p0.art, alt: p0.title,
        tx: '<div class="hx-k">대표 프로젝트 · ' + esc(p0.type) + (/\S+$/.test(p0.term || '') ? ' · ' + esc(/\S+$/.exec(p0.term)[0]) : '') + '</div><h2>' + esc(p0.title) + '</h2><p>' + esc(p0.summary) + '</p>' + by(String(p0.title).charAt(0), team[0] || '', rest, '#projects', '프로젝트 보기') });
    }
    if (c0) panels.push({ kind: '기수', go: '#cohorts', open: '기수', img: c0.img, art: c0.art, alt: c0.title,
      tx: '<div class="hx-k">' + esc(c0.cohort) + '기 대표 ' + (c0.video && c0.video.url ? '영상' : c0.img && c0.img.src ? '사진' : '기록') + ' · 기수별 모아보기</div><h2>' + esc(c0.title) + '</h2><p>' + esc(c0.summary) + '</p>' + by(String(c0.cohort), c0.cohort + '기 기록', c0.date || '', '#cohorts', '기수별 모아보기') });
    if (panels.length) {
      row.innerHTML = panels.map(function (p, i) {
        var media = p.img && p.img.src ? heroImg(p.img.alt || !p.alt ? p.img : { src: p.img.src, alt: p.alt, w: p.img.w, h: p.img.h }, i === 0) : heroArt(p.art || '<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice"><rect width="100%" height="100%" fill="#E4E9F7"/></svg>', p.alt || p.kind);
        var letters = p.open.split('').map(function (ch) { return '<span>' + ch + '</span>'; }).join('');
        return '<article class="hx-pn' + (i === 0 ? ' on' : '') + '" data-i="' + i + '" aria-roledescription="slide" aria-label="' + (i + 1) + ' / ' + panels.length + ' ' + p.kind + '">'
          + media + '<button class="hx-open" type="button" aria-label="' + p.kind + ' 이야기 펼치기"><span class="hx-lab" aria-hidden="true"><em>' + pad2(i + 1) + '</em><i class="hx-ln"></i><span class="hx-v">' + letters + '</span></span></button>'
          + '<div class="hx-tx">' + p.tx + '</div></article>';
      }).join('');
      if (segs) segs.innerHTML = panels.map(function (p, i) { return '<button type="button" aria-label="' + (i + 1) + '번째 이야기: ' + p.kind + '"><i></i></button>'; }).join('');
    }
  }

  /* ── CSS 넘김 규칙이 모자라면 더 만들어요(후기 8쪽부터 · 프로젝트 7번째부터) ── */
  var css = '';
  var revPages = Math.ceil(REV.length / PER);
  for (var k = CSS_PAGES + 1; k <= revPages; k++) {
    var on = '.stories-page .rev:has(#rc_all:checked):has(#fco_all:checked):not(:has(.tgt:target)):has(#pgn' + k + ':checked)';
    css += on + ' .idc:not(.pg' + k + '),' + on + ' .rvr:not(.pg' + k + '){display:none}'
      + '.stories-page .rev:has(#pgn' + k + ':checked) .pager label[for=pgn' + k + ']{background:var(--l-blue);color:#fff}';
  }
  for (k = CSS_PROJECTS; k < PJ.length; k++) {
    css += '.stories-page #pr' + k + ':checked~.pr .pp' + k + '{display:grid;visibility:visible;opacity:1;transition:opacity .35s}'
      + '.stories-page #pr' + k + ':checked~.pr .strip label[for=pr' + k + ']{opacity:1;outline-color:var(--pri)}';
  }
  // 후기 기수 거르기: 시안에 있는 7기~3기 말고 새 기수 후기가 오면 버튼과 규칙을 더해요
  var KNOWN = [7, 6, 5, 4, 3], fcoBox = $('.dw-fco .dwin', rev || page), fcoLast = $('#fco_' + (KNOWN.length - 1));
  REV.map(function (r) { return +r.cohort; }).filter(function (c, i, a) { return c && KNOWN.indexOf(c) < 0 && a.indexOf(c) === i; })
    .sort(function (a, b) { return b - a; }).forEach(function (c) {
      var id = 'fco_c' + c, on = '.stories-page .rev:has(#' + id + ':checked)';
      if (fcoLast) fcoLast.insertAdjacentHTML('afterend', '<input class="tr" autocomplete="off" type="radio" name="fco" id="' + id + '">');
      if (fcoBox) {
        var labs = fcoBox.querySelectorAll('label'), before = [].filter.call(labs, function (l) { var m = /^(\d+)기$/.exec(l.textContent.trim()); return m && +m[1] < c; })[0];
        var lab = '<label for="' + id + '">' + c + '기</label>';
        if (before) before.insertAdjacentHTML('beforebegin', lab); else fcoBox.insertAdjacentHTML('beforeend', lab);
      }
      css += on + ' .dw-fco summary b{display:none}' + on + ' .dw-fco summary u::after{content:"' + c + '기"}'
        + on + ' .idc:not(.coh' + c + '),' + on + ' .rvr:not(.coh' + c + '){display:none}'
        + on + ' .dw-fco summary{background:var(--g900);color:#fff}' + on + ' .dw-fco label[for=' + id + ']{color:var(--g900);font-weight:600}';
    });
  if (css) { var st = document.createElement('style'); st.setAttribute('data-stories', 'generated'); st.textContent = css; document.head.appendChild(st); }

  /* ── 주소(#…)가 방금 그린 글을 가리키면 다시 짚어 창이 열리게 해요(공유 링크 · 미리보기) ── */
  var hash = location.hash;
  if (hash && hash.length > 1) {
    var target = null;
    try { target = document.getElementById(decodeURIComponent(hash.slice(1))); } catch (e) {}
    if (target && (target.classList.contains('ov') || target.classList.contains('ivd') || target.classList.contains('pjd'))) {
      history.replaceState(null, '', location.pathname + location.search);
      location.replace(hash); // 방문 기록은 늘리지 않고 다시 짚기
    }
    // 기수 기록은 창이 따로 없어 #st-글번호로 오면 기수별 모아보기 탭을 열고 그 카드를 눌러 줘요
    var st2 = /^#st-(.+)$/.exec(hash);
    if (st2) {
      history.replaceState(null, '', location.pathname + location.search + '#cohorts');
      addEventListener('load', function () {
        var card = page.querySelector('#p-coh a.st[data-st="' + st2[1].replace(/"/g, '') + '"]');
        if (card) card.click();
      });
    }
  }
})();
