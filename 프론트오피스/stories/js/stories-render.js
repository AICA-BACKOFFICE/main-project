/* =========================================================
   선배들의 이야기 — 글 그리기 (디자이너 시안: 한눈에 보기 + 후기 · 인터뷰 · 프로젝트 · 기수별 이모저모 페이지)
   글은 페이지에 적어 두지 않고 백오피스 DB에서 받아요. 관리자 페이지 '게시물 관리'에 게시중인 후기 · 인터뷰 · 프로젝트 · 기수 기록을
   각 페이지 시안과 같은 마크업으로 그립니다. 글은 window.STORIES_DATA 로 받아요(head의 defer 순서):
     1) js/stories-data.js        — 사본(백오피스가 꺼져 있을 때 · 서버 없이 볼 때). 백오피스가 글이 바뀔 때마다 다시 써요
     2) ../api/public/stories.js  — 백오피스 공개 API(DB의 지금 글). 불러오면 1)을 덮어써요
   거르기 · 페이지 넘김 · 창 열기는 지금처럼 CSS와 디자이너 스크립트(stories.js · stories-sections.js · cohort-v3.js · hub.js)가 맡아요.
   이 파일은 그 스크립트들보다 먼저 불러옵니다(defer 순서).
   - reviews.html: 카드 · 리스트 · 쪽 번호 · 글 창(.ov), 새 기수 거르기 단추
   - interviews.html: 카드 · 넘김 점 · 상세(.ivd)
   - projects.html: 카드 격자(.pjgrid) · 상세(.pjd)
   - cohorts.html: 기수 기록 카드는 페이지 HTML의 <template id="cv3-data">에 적혀 있어요(데이터에 기수 기록이 있을 때만 다시 그림)
   - index.html(한눈에 보기): 대표 인터뷰 + 3개 · 흐르는 한마디 12개 + 포스트잇 4장 · 유형별 프로젝트 3개 · 행사 단계별 기수 사진 5장
   - 사진: 카드에는 대표 사진(img, 관리자가 맞춘 보일 위치 · 확대 fit), 글을 열면 사진 여러 장(photos)을 넘겨 봐요(.phs)
   목록은 최신 글이 먼저예요.
   ========================================================= */
(function () {
  'use strict';
  var D = window.STORIES_DATA, page = document.querySelector('.stories-page');
  if (!D || !page) return;
  var REV = D.reviews || [], IV = D.interviews || [], PJ = D.projects || [], CO = D.cohorts || [];
  var PER = 12;           // 후기 한 쪽에 12개
  var CSS_PAGES = 7;      // stories.css에 넘김 규칙이 있는 쪽 수
  var TAGS = ['#비전공자', '#타지출신', '#직장인출신', '#졸업생', '#적응', '#팀활동', '#취업연계'];
  var LIFE = { c: '#22D3EE', bg: '#DFF8FC', dk: '#0B5563' }, CAREER = { c: '#2457F5', bg: '#DCE5F7', dk: '#15368F' };
  var CAT = {
    life: { name: '생활', cls: 'cat-life', c: LIFE.c, bg: LIFE.bg, dk: LIFE.dk },
    class: { name: '수업', cls: 'cat-class', c: '#FFE600', bg: '#FFF8C2', dk: '#5A4F00' },
    proj: { name: '프로젝트', cls: 'cat-proj', c: '#8CFF3F', bg: '#ECFFD9', dk: '#2F5A12' },
    job: { name: '취업 성공', cls: 'cat-career cat-job', c: CAREER.c, bg: CAREER.bg, dk: CAREER.dk },
    path: { name: '진로 고민', cls: 'cat-career cat-path', c: CAREER.c, bg: CAREER.bg, dk: CAREER.dk }
  };
  CAT.career = CAT.job;   // 예전 분류(취업·진로)는 취업 성공으로
  var CAT_ORDER = ['job', 'path', 'life', 'class', 'proj'];   // 한눈에 보기 포스트잇 순서(시안)
  var FIELD = { 'AI 모델개발': 0, 'AI 클라우드·인프라': 1, 'AI 서비스 기획': 2, '데이터 분석': 3 };   // 시안의 fld 표시(직군 묶음)
  var COH_COLOR = { 7: '#10203D', 6: '#2457F5', 5: '#2457F5', 4: '#6E97F2', 3: '#8FA8D8' };
  var STAGES = [0, 4, 3, 7, 8];   // 한눈에 보기 기수 사진: 입교식 → 중간발표회 → 기업탐방 → 취업박람회 → 수료식

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
  function $(s, r) { return (r || page).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || page).querySelectorAll(s)); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function coh(n) { return esc(n) + '<i>기</i>'; }
  function cat(r) { return CAT[r.cat] || CAT.life; }
  function catKey(r) { return r.cat === 'career' ? 'job' : (CAT[r.cat] ? r.cat : 'life'); }
  function fld(r) { return FIELD[r.track] == null ? '' : ' fld' + FIELD[r.track]; }
  function firstTag(r) { return r.tags && r.tags.length ? TAGS[r.tags[0]] : ''; }
  function tagClasses(list, prefix) { return (list || []).map(function (t) { return ' ' + prefix + t; }).join(''); }
  function firstSentence(t) { var m = String(t || '').match(/^.*?[.!?。](\s|$)/); return (m ? m[0] : String(t || '')).trim(); }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function hasPhoto(item) { return !!(item.img && item.img.src); }
  // 사진(img). fit: 썸네일 자리에서는 관리자가 '썸네일 맞추기'로 정한 보일 위치(--fx · --fy)와 확대(--z)를 따라요
  function imgTag(m, cls, lazy, fit, field) {
    if (!m || !m.src) return '';
    var f = fit && m.fit, style = f ? ' data-fit style="--fx:' + num(f.x, 50) + '%;--fy:' + num(f.y, 50) + '%;--z:' + num(f.z, 1) + '"' : '';
    return '<img class="' + cls + '" src="' + esc(m.src) + '" alt="' + esc(m.alt || '') + '"' + (lazy ? ' loading="lazy" decoding="async"' : '')
      + (m.w ? ' width="' + m.w + '"' : '') + (m.h ? ' height="' + m.h + '"' : '') + style + (field ? ' data-field="' + field + '"' : '') + '>';
  }
  // 사진 또는 그림(svg, 관리자가 가져온 시안 그림)
  function visual(item, opts) {
    opts = opts || {};
    var m = opts.large && item.imgLarge ? item.imgLarge : item.img;
    if (m && m.src) return imgTag(opts.alt === false ? { src: m.src, alt: '', w: m.w, h: m.h, fit: m.fit } : m, 'illu', true, opts.fit && m === item.img, opts.field);
    if (item.art) return opts.hidden && !/^<svg\b[^>]*\saria-hidden=/.test(item.art) ? item.art.replace(/^<svg\b/, '<svg aria-hidden="true"') : item.art;
    return '<svg class="illu" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"' + (opts.hidden ? ' aria-hidden="true"' : '') + '><rect width="100%" height="100%" fill="#E4E9F7"/></svg>';
  }
  // 한눈에 보기 칸의 그림: 사진이면 hb-ph, 그림이면 class 없이(시안)
  function hubVisual(item, opts) {
    opts = opts || {};
    var m = opts.large && item.imgLarge ? item.imgLarge : item.img;
    if (m && m.src) return imgTag({ src: m.src, alt: '', w: m.w, h: m.h, fit: m.fit }, 'hb-ph', true, m === item.img);
    var svg = item.art || '<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#E4E9F7"/></svg>';
    return svg.replace(/^<svg\b([^>]*)>/, function (all, attrs) { return '<svg aria-hidden="true"' + attrs.replace(/\s(class|aria-hidden)="[^"]*"/g, '') + '>'; });
  }
  // 글 안 사진 여러 장: 옆으로 넘겨 봐요(손가락으로 밀기 · 화살표 · 키보드 ←→, 움직임은 stories.js)
  function photoList(item) { return (item.photos || []).filter(function (p) { return p && p.src; }); }
  function slides(item, label) {
    var list = photoList(item);
    if (list.length < 2) return '';
    return '<div class="phs" role="group" aria-roledescription="사진 넘김" aria-label="' + esc(label) + ' 사진 ' + list.length + '장">'
      + '<div class="phs-track" tabindex="0">' + list.map(function (p, i) {
        return '<figure class="phs-slide" aria-label="' + (i + 1) + ' / ' + list.length + '">' + imgTag(p, 'phs-img', i > 0) + '</figure>';
      }).join('') + '</div>'
      + '<button type="button" class="phs-btn prev" aria-label="이전 사진" disabled>' + ARROW_L + '</button>'
      + '<button type="button" class="phs-btn next" aria-label="다음 사진">' + ARROW_R + '</button>'
      + '<span class="phs-count" aria-hidden="true"><b>1</b> / ' + list.length + '</span></div>';
  }
  // 한 장이면 그 사진만, 여러 장이면 넘김
  function photos(item, label) {
    var list = photoList(item), one = list[0] || item.img;
    if (list.length > 1) return slides(item, label);
    return one && one.src ? '<figure class="phs one">' + imgTag(one, 'phs-img', true) + '</figure>' : '';
  }
  var ARROW_L = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ARROW_R = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function insertAfter(ref, markup) { if (ref) ref.insertAdjacentHTML('afterend', markup); }
  function anchorNo(anchor, fallback) { var m = /-(\d+)$/.exec(anchor || ''); return m ? m[1] : fallback; }
  function who(r) { return [r.cohort ? r.cohort + '기' : '', r.author, r.track].filter(Boolean).join(' · '); }
  function projectName(x) { return String(x.title || '').replace(/\s+—\s+/, ' · '); }
  var css = '';

  /* ── 후기(reviews.html) ── */
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
    var cards = '', rows = '';
    REV.forEach(function (r, i) {
      var c = cat(r), pg = Math.floor(i / PER) + 1, cls = c.cls + ' coh' + esc(r.cohort) + fld(r) + tagClasses(r.tags, 'tg');
      var tag = firstTag(r);
      cards += '<a class="idc ' + cls + ' pg' + pg + '" href="#' + esc(r.anchor) + '" style="--c:' + c.c + ';--bg:' + c.bg + ';--dk:' + c.dk + '">'
        + '<div class="cbar"><b data-field="category">' + c.name + '</b><span data-field="cohort">' + coh(r.cohort) + '</span></div>'
        + '<div class="in"><h3 data-field="title">' + esc(r.title) + '</h3><p data-field="summary">' + esc(r.summary) + '</p>'
        + '<div class="who"><b data-field="author">' + esc(r.author) + '</b>' + (r.track ? '<em data-field="track">' + esc(r.track) + '</em>' : '')
        + (tag ? '<span class="tg" data-field="tag">' + esc(tag) + '</span>' : '') + '</div></div></a>';
      rows += '<a class="rvr ' + cls + ' pg' + pg + '" href="#' + esc(r.anchor) + '">'
        + '<span class="cg" style="background:' + c.c + '" data-field="category">' + c.name + '</span>'
        + '<span class="tt" data-field="title">' + esc(r.title) + '</span>'
        + (tag ? '<span class="tg" style="background:' + c.bg + ';color:' + c.dk + '" data-field="tag">' + esc(tag) + '</span>' : '')
        + '<span class="mt">' + esc([r.cohort ? r.cohort + '기' : '', r.track].filter(Boolean).join(' · ')) + '</span></a>';
    });
    var grid = $('.idgrid', rev), list = $('.rvlist', rev);
    if (grid) grid.innerHTML = cards;
    if (list) list.innerHTML = rows;
    // 후기 글 창(.ov)은 .st-main 바로 뒤에
    $$('.ov').forEach(function (o) { o.remove(); });
    var ovs = REV.map(function (r) {
      var c = cat(r), id = esc(r.anchor);
      var tags = (r.tags || []).map(function (t) { return '<a class="t" href="#tg-' + t + '" data-field="tag">' + esc(TAGS[t]) + '</a>'; }).join('');
      return '<div class="ov ' + c.cls + ' coh' + esc(r.cohort) + fld(r) + tagClasses(r.tags, 'tg') + '" id="' + id + '" style="--c:' + c.c + ';--bg:' + c.bg + ';--dk:' + c.dk + '" role="dialog" aria-modal="true" aria-labelledby="' + id + '-t">'
        + '<a class="back" href="#p-rev" aria-label="닫기"></a><div class="sheet"><a class="x" href="#p-rev" aria-label="닫기">&times;</a><div class="mscroll">'
        + '<div class="mtop"><div class="mcat" data-field="category">' + c.name + '</div><h3 id="' + id + '-t" data-field="title">' + esc(r.title) + '</h3>'
        + '<div class="mby"><span class="mav" data-field="cohort">' + coh(r.cohort) + '</span><div><b data-field="author">' + esc(r.author) + '</b>' + (r.track ? '<em data-field="track">' + esc(r.track) + '</em>' : '') + '</div></div></div>'
        + '<div class="mbody"><p class="lead" data-field="summary">' + esc(r.summary) + '</p>'
        + photos(r, r.title)
        + (r.body || []).map(function (b) { return '<p data-field="body">' + esc(b) + '</p>'; }).join('')
        + (tags ? '<div class="mtags">' + tags + '<span class="hint">태그를 누르면 창이 닫히고 그 태그의 후기만 모여요</span></div>' : '')
        + '</div></div></div></div>';
    }).join('');
    insertAfter($('.st-main'), ovs);
    // 쪽 번호 넘김 규칙이 모자라면 더 만들어요(CSS에는 7쪽까지)
    for (var k = CSS_PAGES + 1; k <= pages; k++) {
      var on = '.stories-page .rev:has(#rc_all:checked):has(#fco_all:checked):not(:has(.tgt:target)):has(#pgn' + k + ':checked)';
      css += on + ' .idc:not(.pg' + k + '),' + on + ' .rvr:not(.pg' + k + '){display:none}'
        + '.stories-page .rev:has(#pgn' + k + ':checked) .pager label[for=pgn' + k + ']{background:var(--l-blue);color:#fff}';
    }
    // 기수 거르기: 시안에 있는 7기~3기 말고 새 기수 후기가 오면 버튼과 규칙을 더해요
    var KNOWN = [7, 6, 5, 4, 3], fcoBox = $('.dw-fco .dwin', rev), fcoLast = $('#fco_' + (KNOWN.length - 1));
    REV.map(function (r) { return +r.cohort; }).filter(function (c, i, a) { return c && KNOWN.indexOf(c) < 0 && a.indexOf(c) === i; })
      .sort(function (a, b) { return b - a; }).forEach(function (c) {
        var fid = 'fco_c' + c, sel = '.stories-page .rev:has(#' + fid + ':checked)';
        if (fcoLast) fcoLast.insertAdjacentHTML('afterend', '<input class="tr" autocomplete="off" type="radio" name="fco" id="' + fid + '">');
        if (fcoBox) {
          var labs = fcoBox.querySelectorAll('label'), before = [].filter.call(labs, function (l) { var m = /^(\d+)기$/.exec(l.textContent.trim()); return m && +m[1] < c; })[0];
          var lab = '<label for="' + fid + '">' + c + '기</label>';
          if (before) before.insertAdjacentHTML('beforebegin', lab); else fcoBox.insertAdjacentHTML('beforeend', lab);
        }
        css += sel + ' .dw-fco summary b{display:none}' + sel + ' .dw-fco summary u::after{content:"' + c + '기"}'
          + sel + ' .idc:not(.coh' + c + '),' + sel + ' .rvr:not(.coh' + c + '){display:none}'
          + sel + ' .dw-fco summary{background:var(--g900);color:#fff}' + sel + ' .dw-fco label[for=' + fid + ']{color:var(--g900);font-weight:600}';
      });
  }

  /* ── 인터뷰(interviews.html) ── */
  var ivPane = $('#p-iv');
  if (ivPane) {
    var grid2 = $('.ivgrid', ivPane), dots = $('.ivdots', ivPane);
    if (grid2) grid2.innerHTML = IV.map(function (v) {
      var vid = v.video && v.video.yt;
      return '<a class="iv" href="#' + esc(v.anchor) + '"' + (vid ? ' data-yt="' + esc(v.video.yt) + '"' : '') + '>'
        + '<div class="ph">' + visual(v, { alt: false, fit: true, field: 'thumbnail' }) + (vid ? '<span class="play"><i></i></span><span class="dur" data-field="duration">' + esc(v.video.dur || '') + '</span>' : '') + '</div>'
        + '<div class="tb"><h3 data-field="title">' + esc(v.title) + '</h3>'
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
        : '<div class="ivhero">' + tag + (slides(v, v.title) || visual(v, { large: true, alt: false, field: 'thumbnail' })) + '</div>';
      var qa = (v.qa || []).map(function (q, k) {
        return '<div id="q-' + no + '-' + (k + 1) + '"><div class="q"><i>' + (k + 1) + '</i><span data-field="question">' + esc(q.q) + '</span></div><p class="a" data-field="answer">' + esc(q.a) + '</p></div>';
      }).join('');
      var mainHtml = hero + '<h2 data-field="title">' + esc(v.title) + '</h2><p class="lead" data-field="summary">' + esc(v.summary) + '</p>'
        + '<div class="who2"><span class="av" data-field="cohort">' + coh(v.cohort) + '</span><div><b data-field="author">' + esc(v.author) + '</b><em data-field="track">' + esc(v.track) + '</em></div></div>'
        + (vid ? slides(v, v.title) : '')
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
      return '<div class="ivd' + (vid ? ' ivd-v' : '') + '" id="' + id + '"><a class="ivback" href="#p-iv">← 인터뷰 목록</a><div class="ivwrap"><div>' + mainHtml + '</div><aside class="sidebox">' + side + '</aside></div></div>';
    }).join('');
    insertAfter($('.ivlist', ivPane), details);
  }

  /* ── 프로젝트(projects.html) ── */
  var prPane = $('#p-pr');
  if (prPane) {
    var n = PJ.length, pjgrid = $('.pjgrid', prPane);
    if (pjgrid) pjgrid.innerHTML = PJ.map(function (x) {
      var head = x.headline || x.title;
      return '<a class="pjc" href="#' + esc(x.anchor) + '"><div class="ph">' + visual(x, { fit: true }) + '<span class="pjc-type" data-field="type">' + esc(x.type) + '</span></div>'
        + '<div class="pjc-tx">' + (x.headline ? '<p class="pjname">' + esc(projectName(x)) + '</p>' : '')
        + '<h3 data-field="title">' + esc(head) + '</h3>'
        + '<p class="sum" data-field="summary">' + esc(x.cardSummary || firstSentence(x.summary)) + '</p>'
        + '<div class="tags">' + (x.tags || []).map(function (t) { return '<span data-field="tag">' + esc(t) + '</span>'; }).join('') + '</div>'
        + '<p class="team" data-field="team">' + esc(x.team) + '</p></div></a>';
    }).join('');
    $$('.pjd', prPane).forEach(function (d) { d.remove(); });
    var SECS = [['문제 정의', '어떤 문제를, 누구를 위해 풀었는지 들어갈 자리예요.'], ['주요 기능', '서비스가 무엇을 해 주는지 들어갈 자리예요.'], ['기술 설명', '어떤 데이터 · 모델 · 기술로 만들었는지 들어갈 자리예요.']];
    // 칸의 글: • 마다 목록 한 줄(저장할 때 줄바꿈은 띄어쓰기로 합쳐지므로 • 로 나눠요). • 앞의 글은 문단
    var secBody = function (p) {
      var parts = String(p).split('•').map(function (t) { return t.trim(); });
      var lead = parts.shift(), items = parts.filter(Boolean);
      return (lead ? '<p>' + esc(lead) + '</p>' : '')
        + (items.length ? '<ul class="pjul">' + items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '');
    };
    // 프로젝트 정보: 비어 있는 줄은 빼요
    var meta = function (rows) {
      return rows.filter(function (r) { return r[1]; }).map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('');
    };
    var pjd = PJ.map(function (x, i) {
      var id = esc(x.anchor), prev = PJ[(i - 1 + n) % n], next = PJ[(i + 1) % n];
      var given = x.sections || [], filled = given.some(function (s) { return s.p; });
      var secs = SECS.map(function (s, k) {
        var g = given[k] || {};
        return '<section><h3>' + esc(g.h || s[0]) + '</h3>' + (g.p ? secBody(g.p) : '<p class="pjph-t">' + s[1] + '</p>') + '</section>';
      }).join('');
      var links = (x.links || []).filter(function (l) { return l && l.url; }).map(function (l) { return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label || '자료 보기') + ' ↗</a>'; }).join('');
      return '<div class="pjd" id="' + id + '"><a class="ivback" href="#p-pr">← 프로젝트 목록</a><div class="ivwrap"><div>'
        + '<div class="ivhero pjhero"><span class="ivtag">' + esc(x.type) + '</span>' + (slides(x, x.title) || visual(x, { hidden: true })) + '</div>'
        + '<span class="pjno">' + pad2(i + 1) + '</span><h2>' + esc(x.title) + '</h2><p class="lead">' + esc(x.summary) + '</p>'
        + '<div class="pjtags">' + (x.tags || []).map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>'
        + '<div class="pjsec">' + secs + '</div>'
        + (links ? '<div class="pjlinks">' + links + '</div>' : '')
        + (filled ? '' : '<p class="ivnote">시안이라 본문은 자리만 잡아 두었어요. 관리자가 프로젝트를 올리면 이 자리에 내용과 시연 영상 · 발표 자료 링크가 들어갑니다.</p>')
        + '</div><aside class="sidebox pjside"><h3>프로젝트 정보</h3><dl class="ivmeta">' + meta([['팀', x.team], ['전공', x.type], ['기수 · 반', x.term]]) + '</dl>'
        + (n > 1 ? '<div class="pjnav"><a href="#' + esc(prev.anchor) + '"><small>이전 프로젝트</small>' + esc(prev.title) + '</a><a href="#' + esc(next.anchor) + '"><small>다음 프로젝트</small>' + esc(next.title) + '</a></div>' : '')
        + '</aside></div></div>';
    }).join('');
    insertAfter($('.pjlist', prPane), pjd);
  }

  /* ── 기수 기록(cohorts.html): 인스타형 화면(cohort-v3.js)이 읽는 카드 ──
     2026-10-20부터 기수 기록은 DB가 아니라 페이지 HTML에 적혀 있어요(카테고리 페이지 관리에서 고침). 데이터에 기수 기록이 있을 때만 다시 그려요 */
  var cvData = document.getElementById('cv3-data');
  if (cvData && CO.length) {
    cvData.innerHTML = CO.map(function (c) {
      var vid = c.video && c.video.url;
      return '<a class="st c' + esc(c.cohort) + tagClasses(c.tags, 'g') + '" href="#"' + (vid ? ' data-yt="' + esc(c.video.url) + '"' : '') + (c.id != null ? ' data-st="' + esc(c.id) + '"' : '')
        + ' style="--c:' + (COH_COLOR[c.cohort] || '#2B2D31') + '"><div class="ph">' + visual(c, { fit: true, field: 'thumbnail' }) + (vid ? '<span class="play"><i></i></span>' + (c.video.dur ? '<span class="dur">' + esc(c.video.dur) + '</span>' : '') : '') + '</div>'
        + '<h3 data-field="title">' + esc(c.title) + '</h3><p data-field="summary">' + esc(c.summary) + '</p>'
        + '<div class="mt"><span class="cg" data-field="cohort">' + esc(c.cohort) + '기</span><span class="dt" data-field="date">' + esc(c.date || '') + '</span></div>'
        + (c.body && c.body.length ? '<template class="st-body">' + (Array.isArray(c.body) ? c.body : [c.body]).map(function (b) { return '<p>' + esc(b) + '</p>'; }).join('') + '</template>' : '')
        + (photoList(c).length > 1 ? '<template class="st-photos">' + slides(c, c.title) + '</template>' : '')
        + '</a>';
    }).join('');
  }

  /* ── 한눈에 보기(index.html) ── */
  if (page.classList.contains('stories-hub')) {
    // 인터뷰: 사진이 있는 글 인터뷰만(그림 · 영상 카드는 전체 목록에서). 첫째는 크게(사진 위 글), 나머지 3개는 목록
    var ivs = IV.filter(function (v) { return hasPhoto(v) && !(v.video && v.video.yt); });
    // 사진이 있는 인터뷰가 하나도 없으면 사진 없는 글 인터뷰로(그림 자리에 기본 바탕)
    if (!ivs.length) ivs = IV.filter(function (v) { return !(v.video && v.video.yt); });
    var ivBox = $('.hb-ivg');
    if (ivBox) {
      var f = ivs[0];
      var list = '<ul class="hb-ivl" role="list">' + ivs.slice(1, 4).map(function (v) {
        return '<li><a href="interviews.html#' + esc(v.anchor) + '"><span class="hb-ivl-ph">' + hubVisual(v) + '</span>'
          + '<div><h3>' + esc(v.title) + '</h3><span class="hb-by">' + esc(who(v)) + '</span></div></a></li>';
      }).join('') + '</ul>';
      // 큰 카드는 페이지 HTML에 있어요(2026-10-20): 꼬리표(em) · 인용(.hb-ivf-q)은 페이지 글 그대로 두고(카테고리 페이지 관리에서 고침),
      // 사진 · 제목 · 이름 · 주소만 가장 최근 인터뷰로 채워요
      var card = $('.hb-ivf', ivBox);
      if (card && f) {
        card.setAttribute('href', 'interviews.html#' + f.anchor);
        card.insertAdjacentHTML('afterbegin', hubVisual(f, { large: true }));
        var h = $('h3', card), by = $('.hb-by', card), em = $('em', card), q = $('.hb-ivf-q', card);
        if (h) h.textContent = f.title || '';
        if (by) by.textContent = who(f);
        if (em) em.hidden = !em.textContent.trim();
        if (q) q.hidden = !q.textContent.trim();
        ivBox.insertAdjacentHTML('beforeend', list);
      } else if (card) {
        card.hidden = true;   // 보여 줄 인터뷰가 없으면 빈 카드 대신 숨김
      } else {
        // 예전 페이지(큰 카드가 HTML에 없음): 꼬리표 · 인용 없이 통째로
        ivBox.innerHTML = f ? '<a class="hb-ivf" href="interviews.html#' + esc(f.anchor) + '">' + hubVisual(f, { large: true })
          + '<div class="hb-ivf-tx"><h3>' + esc(f.title) + '</h3><span class="hb-by">' + esc(who(f)) + '</span></div></a>' + list : '';
      }
    }
    // 후기: 흐르는 한마디(최근 12개, 끊김 없이 두 번) + 포스트잇 4장(관리자가 '한눈에 보기에 보이기'로 고른 글, 모자라면 분류 · 기수가 겹치지 않게 채움)
    var tick = REV.slice(0, 12), lq = $('.hb-lq-t');
    if (lq) {
      var one = tick.map(function (r) {
        return '<a href="reviews.html#' + esc(r.anchor) + '"%HIDE%><span class="t">' + esc(r.ticker || firstSentence(r.summary)) + '</span><span class="a">' + esc(r.author) + ' · ' + esc(r.cohort) + '기</span></a>';
      }).join('');
      lq.innerHTML = one.replace(/%HIDE%/g, '') + one.replace(/%HIDE%/g, ' aria-hidden="true" tabindex="-1"');
    }
    var pis = $('.hb-pis');
    if (pis) {
      var picked = REV.filter(function (r) { return r.hub; });
      var usedCat = {}, usedCoh = {};
      picked.forEach(function (r) { usedCat[catKey(r)] = 1; usedCoh[r.cohort] = 1; });
      CAT_ORDER.forEach(function (k) {
        if (picked.length >= 4 || usedCat[k]) return;
        var r = REV.slice(12).filter(function (x) { return catKey(x) === k && !usedCoh[x.cohort] && picked.indexOf(x) < 0; })[0];
        if (r) { picked.push(r); usedCat[k] = 1; usedCoh[r.cohort] = 1; }
      });
      REV.forEach(function (r) { if (picked.length < 4 && picked.indexOf(r) < 0 && tick.indexOf(r) < 0) picked.push(r); });
      picked = picked.slice(0, 4).map(function (r, i) { return { r: r, i: i }; })
        .sort(function (a, b) { return CAT_ORDER.indexOf(catKey(a.r)) - CAT_ORDER.indexOf(catKey(b.r)) || a.i - b.i; }).map(function (x) { return x.r; });
      pis.innerHTML = picked.map(function (r) {
        return '<a class="hb-pi" href="reviews.html#' + esc(r.anchor) + '"><span class="hb-pi-c"><b>' + cat(r).name + '</b><span>' + esc(r.cohort) + '기</span></span>'
          + '<h3>' + esc(r.title) + '</h3><p>' + esc(r.summary) + '</p><span class="hb-pi-by"><b>' + esc(r.author) + '</b>' + (r.track ? '<span>' + esc(r.track) + '</span>' : '') + '</span></a>';
      }).join('');
    }
    // 프로젝트: 유형이 겹치지 않게 3개(목록 순서대로 유형마다 첫 글), 모자라면 다음 글로
    var pjBox = $('.hb-pjs');
    if (pjBox) {
      var types = {}, three = [];
      PJ.forEach(function (x) { if (three.length < 3 && !types[x.type]) { types[x.type] = 1; three.push(x); } });
      PJ.forEach(function (x) { if (three.length < 3 && three.indexOf(x) < 0) three.push(x); });
      pjBox.innerHTML = three.map(function (x) {
        return '<a class="hb-pjc" href="projects.html#' + esc(x.anchor) + '"><span class="hb-pjc-ph">' + hubVisual(x) + '<span class="hb-pjc-type">' + esc(x.type) + '</span></span>'
          + '<div class="hb-pjc-tx">' + (x.headline ? '<p class="hb-pjc-nm">' + esc(projectName(x)) + '</p>' : '') + '<h3>' + esc(x.headline || x.title) + '</h3>'
          + '<p class="hb-pjc-s">' + esc(x.cardSummary || firstSentence(x.summary)) + '</p><span class="hb-pjc-tm">' + esc(x.team) + '</span></div></a>';
      }).join('');
    }
    // 기수별 이모저모: 행사 단계마다 사진 있는 기록 하나(영상 먼저, 그다음 최근), 기수가 겹치지 않게. 영상은 유튜브로, 기록은 그 글 창으로
    var mos = $('.hb-mos');
    if (mos && CO.length) {   // 기수 기록이 HTML에 적혀 있으면(2026-10-20부터) 그대로
      var usedC = {}, five = [];
      STAGES.forEach(function (g) {
        var cand = CO.filter(function (c) { return hasPhoto(c) && (c.tags || []).indexOf(g) >= 0 && !usedC[c.cohort] && five.indexOf(c) < 0; });
        var pick = cand.filter(function (c) { return c.video && c.video.url; })[0] || cand[0];
        if (pick) { usedC[pick.cohort] = 1; five.push(pick); }
      });
      CO.forEach(function (c) { if (five.length < 5 && hasPhoto(c) && five.indexOf(c) < 0 && !usedC[c.cohort]) { usedC[c.cohort] = 1; five.push(c); } });
      mos.innerHTML = five.map(function (c, i) {
        var vid = c.video && c.video.url;
        var title = esc(c.title).replace(/ — (.+)$/, ' — <span class="hb-nw">$1</span>');
        return '<li' + (i === 0 ? ' class="is-big"' : '') + '><a href="' + (vid ? esc(c.video.url) + '" target="_blank" rel="noopener' : 'cohorts.html' + (c.id != null ? '#st-' + esc(c.id) : '')) + '">'
          + hubVisual(c)
          + '<div class="hb-mos-tx"><span class="hb-mos-m">' + esc(c.cohort) + '기<span class="hb-mos-d"> · ' + esc(c.date || '') + '</span>'
          + (vid && c.video.dur ? '<span class="hb-vd"><span class="hb-sr">유튜브 영상(새 창), 길이 </span>' + esc(c.video.dur) + '</span>' : '') + '</span>'
          + '<h3>' + title + '</h3>' + (i === 0 ? '<p>' + esc(c.summary) + '</p>' : '') + '</div></a></li>';
      }).join('');
    }
  }

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
  }
})();
