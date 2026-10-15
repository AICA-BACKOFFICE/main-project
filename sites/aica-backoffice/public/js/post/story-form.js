/*
 * 글쓰기 화면 — 선배들의 이야기 고정 양식 (editor.html)
 *   카테고리가 후기 · 인터뷰 · 프로젝트 · 기수별 모아보기면 블록 편집기 대신 사이트 글 모양 그대로의 칸을 보여 준다.
 *   칸 값은 hidden input #storyJson 에 JSON 으로 담겨 저장되고(StoryContent 가 정리), 발행하면 사이트(stories-data.js)에 바로 올라간다.
 *   사이트에서 가져온 글이 들고 있는 값(anchor · heroImg · imgLarge · art · heroArt)은 화면에 없어도 그대로 지킨다.
 *   사진은 네 종류 모두 여러 장(photos)을 올리고 그중 하나를 대표(cover → img, 카드 썸네일)로 정한다.
 *   사진마다 '사진 편집'(자르기 · 회전 · 보정, 새 파일로 저장), 대표 사진은 '썸네일 맞추기'(카드에 보일 부분 · 확대 → fit)를 할 수 있다(page/photo-editor.js).
 */
(function (global) {
  'use strict';
  var P = global.PostEditorPage = global.PostEditorPage || {};
  P.modules = P.modules || [];

  var KINDS = { review: '후기', interview: '인터뷰', project: '프로젝트', cohort: '기수 기록' };
  // 2026-10-14 사이트 새 시안: 취업·진로 → 취업 성공 · 진로 고민(예전 글의 career 는 사이트에서 취업 성공으로 보임)
  var REVIEW_CATS = [['life', '생활'], ['class', '수업'], ['proj', '프로젝트'], ['job', '취업 성공'], ['path', '진로 고민']];
  var REVIEW_TAGS = ['#비전공자', '#타지출신', '#직장인출신', '#졸업생', '#적응', '#팀활동', '#취업연계'];
  var COHORT_TAGS = ['입교식', 'OT', '특강', '기업탐방', '중간발표회', '해커톤', '프로젝트', '취업박람회', '수료식', '동문회'];
  var SECTIONS = ['문제 정의', '접근 방법', '결과와 다음 단계'];
  // 대표 사진이 썸네일로 보이는 자리와 그 틀 비율(사이트 CSS와 같게). 후기는 카드에 사진이 없어 글 창에서만 보여요(null)
  var CARD = {
    review: null, interview: [16 / 10, '인터뷰 카드 · 한눈에 보기'],
    project: [16 / 10, '프로젝트 카드 · 한눈에 보기'], cohort: [1, '기수별 이모저모 격자(정사각형) · 한눈에 보기']
  };
  var MAX_PHOTOS = 12;
  var TITLE_HINT = {
    review: '후기 제목 (예: 생활지원금으로 한 달을 꾸려본 기록)', interview: '인터뷰 제목 (예: 비전공자에서 AI 모델러가 되기까지)',
    project: '프로젝트 이름 (예: 손끝 — 시각장애인 보행 보조 앱)', cohort: '기록 제목 (예: 7기 입교식 하이라이트)'
  };
  var INTRO = {
    review: '사이트의 후기 창과 같은 순서예요. 분야 · 기수 · 이름 → 굵은 첫 문단 → 본문 → 사진 → 태그.',
    interview: '인터뷰 카드와 상세 화면에 들어갈 내용이에요. 질문과 답을 넣거나 유튜브 영상 주소를 넣어 주세요.',
    project: '프로젝트 카드 격자와 상세 화면에 들어갈 내용이에요.',
    cohort: '기수별 이모저모(인스타형 격자)와 눌렀을 때 열리는 창에 들어갈 내용이에요.'
  };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function parse(v) { try { var o = JSON.parse(v || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } }
  function trim(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function paras(v) { return String(v || '').split(/\n\s*\n/).map(trim).filter(Boolean); }
  function ytId(v) {
    v = trim(v); if (!v) return '';
    if (/^[\w-]{6,20}$/.test(v)) return v;
    var m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,20})/.exec(v);
    return m ? m[1] : null;
  }

  P.register(function (ctx, cfg) {
    var form = ctx.form, storyEl = document.getElementById('storyJson'), box = document.getElementById('storyForm');
    var catSel = form.querySelector('[name="categoryId"]');
    if (!storyEl || !box || !catSel) return;
    var base = (form.getAttribute('action') || '').split('/admin/posts')[0];
    var data = parse(storyEl.value), kind = null, cache = {}, sel = 0;
    var origImg = (data.img && data.img.src) || '';   // 사이트에서 가져온 큰 사진(imgLarge)은 대표 사진이 그대로일 때만 지킨다

    function kindOf() {
      var o = catSel.options[catSel.selectedIndex], s = o && o.getAttribute('data-slug');
      return KINDS[s] ? s : null;
    }
    function imgUrl(src) { return /^\/uploads\//.test(src) ? base + src : base + '/admin/pages/site/stories/' + src; }

    // ── 화면 그리기 ──
    function field(label, inner, hint, cls) {
      return '<div class="sf-field' + (cls ? ' ' + cls : '') + '"><label class="sf-label">' + label + (hint ? ' <span class="ed-help">' + hint + '</span>' : '') + '</label>' + inner + '</div>';
    }
    function input(key, value, attrs) { return '<input class="sf-input" data-k="' + key + '" value="' + esc(value) + '" autocomplete="off"' + (attrs || '') + '>'; }
    function area(key, value, rows, attrs) { return '<textarea class="ed-ta" data-k="' + key + '" rows="' + rows + '"' + (attrs || '') + '>' + esc(value) + '</textarea>'; }
    function chips(key, list, picked) {
      return '<div class="ed-check-row">' + list.map(function (t, i) {
        return '<label><input type="checkbox" data-k="' + key + '" value="' + i + '"' + (picked.indexOf(i) > -1 ? ' checked' : '') + '> ' + esc(t) + '</label>';
      }).join('') + '</div>';
    }
    function who() {
      return '<div class="sf-row">'
        + field('기수', input('cohort', data.cohort || '', ' type="number" min="1" max="99" placeholder="7"'), '', 'sf-narrow')
        + field('이름', input('author', data.author || '', ' maxlength="30" placeholder="김민서"'))
        + field('직군(트랙)', input('track', data.track || '', ' maxlength="40" placeholder="데이터 분석"')) + '</div>';
    }
    // ── 사진 여러 장 ──
    function initPhotos(d) {
      if (!Array.isArray(d.photos)) d.photos = d.img && d.img.src ? [JSON.parse(JSON.stringify(d.img))] : [];
      if (!(d.cover >= 0 && d.cover < d.photos.length)) {
        var at = d.img && d.img.src ? d.photos.map(function (p) { return p.src; }).indexOf(d.img.src) : -1;
        d.cover = at > 0 ? at : 0;
      }
      return d;
    }
    function fitCss(p) { return p && p.fit && global.PhotoEditor ? PhotoEditor.fitStyle(p.fit) : ''; }
    function gallery() {
      var list = data.photos, card = CARD[kind], thumb = !!card, cover = thumb ? data.cover : -1;
      card = card || [16 / 9, ''];
      if (sel >= list.length) sel = Math.max(0, list.length - 1);
      var tiles = list.map(function (p, i) {
        return '<button type="button" class="sf-tile' + (i === sel ? ' on' : '') + '" data-pick="' + i + '" aria-pressed="' + (i === sel) + '" title="' + (i + 1) + '번째 사진' + (i === cover ? ' · 대표' : '') + '">'
          + '<img src="' + esc(imgUrl(p.src)) + '" alt="">' + (i === cover ? '<span class="sf-badge">대표</span>' : '') + '<span class="sf-no">' + (i + 1) + '</span></button>';
      }).join('');
      var add = list.length < MAX_PHOTOS ? '<label class="sf-tile sf-add"><input type="file" accept="image/*" multiple data-upload="photos" hidden><b>+</b><span>' + (list.length ? '사진 추가' : '사진 올리기') + '</span></label>' : '';
      var note = !list.length && data.art ? '<p class="ed-help">지금은 시안 그림(일러스트)이 쓰여요. 사진을 올리면 사진으로 바뀌어요.</p>' : '';
      var p = list[sel], panel = '';
      if (p) {
        var isCover = sel === cover;
        panel = '<div class="sf-pp">'
          + '<div class="sf-card" style="aspect-ratio:' + card[0] + ';width:' + Math.round(Math.min(280, 300 * card[0])) + 'px"><img src="' + esc(imgUrl(p.src)) + '" alt="" style="' + (isCover ? fitCss(p) : '') + '"></div>'
          + '<div class="sf-pp-side"><div class="sf-pp-title"><b>' + (sel + 1) + '번째 사진</b>' + (isCover ? '<span class="sf-badge">대표 · 썸네일</span>' : '') + '</div>'
          + '<div class="sf-pp-row">' + (!thumb ? '' : isCover
            ? '<button type="button" class="ed-btn sm primary" data-ph="frame">썸네일 맞추기</button>'
            : '<button type="button" class="ed-btn sm primary" data-ph="cover">★ 대표 사진으로</button>')
          + '<button type="button" class="ed-btn sm" data-ph="edit">사진 편집</button>'
          + '<label class="ed-btn sm" style="cursor:pointer">사진 바꾸기 <input type="file" accept="image/*" data-upload="replace" hidden></label></div>'
          + '<div class="sf-pp-row"><button type="button" class="ed-btn sm" data-ph="left"' + (sel === 0 ? ' disabled' : '') + '>← 앞으로</button>'
          + '<button type="button" class="ed-btn sm" data-ph="right"' + (sel >= list.length - 1 ? ' disabled' : '') + '>뒤로 →</button>'
          + '<button type="button" class="ed-btn sm sf-danger" data-ph="remove">삭제</button></div>'
          + '<input class="sf-input" data-k="photos.' + sel + '.alt" value="' + esc(p.alt || '') + '" maxlength="200" placeholder="사진 설명(화면 낭독기용, 선택)">'
          + '<p class="ed-help">' + (!thumb ? '후기 글 창에서 첫 문단 아래에 이 순서대로 보여요(후기 카드에는 사진이 없어요).'
            : isCover ? '왼쪽은 ' + card[1] + '에 보일 모습이에요. 썸네일 맞추기로 보일 부분과 확대를 정할 수 있어요.' : '대표 사진으로 정하면 ' + card[1] + ' 썸네일로 쓰여요.') + '</p>'
          + '</div></div>';
      }
      return field('사진', '<div class="sf-gallery">' + tiles + add + '</div>' + note + panel,
        '여러 장 올릴 수 있어요(최대 ' + MAX_PHOTOS + '장) · ' + (thumb ? '대표 사진이 썸네일이 되고, ' : '') + '글을 열면 모든 사진을 넘겨 볼 수 있어요');
    }
    function measure(url) {
      return new Promise(function (resolve) {
        var im = new Image();
        im.onload = function () { resolve({ w: im.naturalWidth || undefined, h: im.naturalHeight || undefined }); };
        im.onerror = function () { resolve({}); };
        im.src = base + url;
      });
    }
    function commit() { storyEl.value = JSON.stringify(clean(data)); ctx.markDirty(); }
    function photoAction(act) {
      var list = data.photos, p = list[sel], card = CARD[kind];
      if (!p) return false;
      if (act === 'cover') { data.cover = sel; return true; }
      if (act === 'remove') {
        if (!confirm((sel + 1) + '번째 사진을 이 글에서 뺄까요? (미디어 관리의 파일은 그대로 남아요)')) return false;
        list.splice(sel, 1);
        if (sel < data.cover) data.cover--; else if (sel === data.cover) data.cover = 0;
        if (sel >= list.length) sel = Math.max(0, list.length - 1);
        return true;
      }
      if (act === 'left' || act === 'right') {
        var j = sel + (act === 'left' ? -1 : 1);
        if (j < 0 || j >= list.length) return false;
        var t = list[sel]; list[sel] = list[j]; list[j] = t;
        if (data.cover === sel) data.cover = j; else if (data.cover === j) data.cover = sel;
        sel = j;
        return true;
      }
      if (!global.PhotoEditor) { notify('사진 편집 도구를 불러오지 못했어요. 새로고침해 주세요.', true); return false; }
      if (act === 'frame') {
        PhotoEditor.frame({
          src: imgUrl(p.src), ratio: card[0], fit: p.fit, title: '썸네일 맞추기',
          note: card[1] + '에 보일 부분을 끌어서 정하고, 필요하면 확대해요. 사진 파일은 바뀌지 않고, 글을 열었을 때는 사진 전체가 보여요.',
          onDone: function (fit) { if (fit) p.fit = fit; else delete p.fit; render(); commit(); }
        });
      } else if (act === 'edit') {
        PhotoEditor.edit({
          src: imgUrl(p.src), name: p.src,
          ratios: card ? [{ key: 'card', label: '썸네일 비율', value: card[0] }] : [],
          upload: function (file) { return BlockEditor.upload(file, cfg.uploadUrl).then(function (res) { return { url: res.url }; }); },
          onDone: function (res) {
            p.src = res.url; p.w = res.width; p.h = res.height; delete p.fit;
            render(); commit();
            notify('편집한 사진으로 바꿨어요. 원래 사진은 미디어 관리에 그대로 있어요.');
          }
        });
      }
      return false;
    }

    function video(key, urlKey) {
      var v = data.video || {};
      var url = urlKey === 'url' ? (v.url || '') : (v.yt ? 'https://www.youtube.com/watch?v=' + v.yt : '');
      return '<div class="sf-row">' + field('유튜브 영상 <span class="ed-help">(선택)</span>', input('video.' + urlKey, url, ' placeholder="https://www.youtube.com/watch?v=…"'))
        + field('길이', input('video.dur', v.dur || '', ' maxlength="6" placeholder="8:05"'), '', 'sf-narrow') + '</div>';
    }

    function render() {
      var k = kind, h = '<div class="sf-head"><b>' + KINDS[k] + ' 양식</b><span>' + INTRO[k] + '</span></div>';
      if (k === 'review') {
        h += field('분야', '<div class="ed-check-row">' + REVIEW_CATS.map(function (c) {
          return '<label><input type="radio" name="sf-cat" data-k="cat" value="' + c[0] + '"' + (data.cat === c[0] ? ' checked' : '') + '> ' + c[1] + '</label>';
        }).join('') + '</div>');
        h += who();
        h += field('굵은 첫 문단(요약)', area('summary', data.summary || '', 3, ' maxlength="1000" placeholder="후기 창 맨 위에 굵게 보이는 문단이에요. 카드에도 이 문장이 보여요."'));
        h += field('본문', area('body', (data.body || []).join('\n\n'), 10, ' placeholder="문단은 빈 줄(엔터 두 번)로 나눠요."'), '문단은 빈 줄로 나눠요');
        h += gallery();
        h += field('태그', chips('tags', REVIEW_TAGS, data.tags || []), '카드와 리스트에는 첫 태그가 보여요');
        h += field('흐르는 한마디', input('ticker', data.ticker || '', ' maxlength="80" placeholder="비우면 첫 문단의 첫 문장"'), '(선택) 한눈에 보기에서 흐르는 한 줄(최근 후기 12개)');
        h += field('한눈에 보기', '<div class="ed-check-row"><label><input type="checkbox" data-b="hub"' + (data.hub ? ' checked' : '') + '> 포스트잇으로 보이기</label></div>',
          '선배들의 이야기 첫 화면에 포스트잇 4장으로 보여요. 고른 글이 4개보다 많으면 후기 목록에서 앞에 있는 4개만, 적으면 나머지는 자동으로 채워요');
      } else if (k === 'interview') {
        h += who();
        h += field('요약', area('summary', data.summary || '', 3, ' maxlength="1000" placeholder="카드와 상세 화면 첫 문단"'));
        h += field('한 줄 인용', input('quote', data.quote || '', ' maxlength="300" placeholder="카드에 크게 들어가는 인용 문장"'), '(선택)');
        h += field('한눈에 보기 꼬리표', input('kicker', data.kicker || '', ' maxlength="30" placeholder="비전공자라면"'), '(선택) 첫 화면 맨 위 큰 인터뷰에 작게 붙는 말');
        h += gallery();
        h += video('video', 'yt');
        h += '<div class="sf-field"><label class="sf-label">질문과 답 <span class="ed-help">질문 번호와 오른쪽 목차는 자동으로 붙어요</span></label><div class="sf-list" data-list="qa">'
          + (data.qa || []).map(function (q, i) {
            return '<div class="sf-item" data-i="' + i + '"><div class="sf-item-head"><b>Q' + (i + 1) + '</b>'
              + '<span class="sf-item-tools"><button type="button" class="ed-btn sm" data-move="-1" title="위로">↑</button><button type="button" class="ed-btn sm" data-move="1" title="아래로">↓</button><button type="button" class="ed-btn sm" data-remove>삭제</button></span></div>'
              + input('qa.' + i + '.q', q.q || '', ' maxlength="300" placeholder="질문"')
              + area('qa.' + i + '.a', q.a || '', 4, ' maxlength="6000" placeholder="답"')
              + input('qa.' + i + '.toc', q.toc || '', ' maxlength="80" placeholder="오른쪽 목차에 보일 짧은 문구(선택, 비우면 질문 그대로)"') + '</div>';
          }).join('') + '</div><button type="button" class="ed-btn sm" data-add="qa">+ 질문 추가</button></div>';
      } else if (k === 'project') {
        h += field('요약', area('summary', data.summary || '', 3, ' maxlength="1000" placeholder="상세 화면 첫 문단"'));
        h += field('카드 한 줄 제목', input('headline', data.headline || '', ' maxlength="120" placeholder="휴대폰 카메라가 신호등과 점자블록을 읽고, 소리로 길을 알려줘요"'),
          '(선택) 프로젝트 카드 · 한눈에 보기에 크게 보이는 한 줄. 비우면 프로젝트 이름');
        h += field('카드 짧은 요약', input('cardSummary', data.cardSummary || '', ' maxlength="200" placeholder="광주 동구 일대에서 2주 동안 실제로 써 봤어요."'),
          '(선택) 카드 아래 한 줄. 비우면 요약의 첫 문장');
        h += field('태그', input('tags', (data.tags || []).join(' '), ' placeholder="#컴퓨터비전 #접근성 #온디바이스"'), '빈칸으로 나눠요(최대 8개)');
        h += '<div class="sf-row">' + field('팀', input('team', data.team || '', ' maxlength="60" placeholder="AI 모델링 2반 · 5명"'))
          + field('유형', input('type', data.type || '', ' maxlength="30" placeholder="실증"'), '', 'sf-narrow')
          + field('기간', input('term', data.term || '', ' maxlength="40" placeholder="도약과정 720H"')) + '</div>';
        h += gallery();
        var secs = data.sections || [];
        h += SECTIONS.map(function (name, i) {
          var s = secs[i] || {};
          return field(esc(s.h || name), area('sections.' + i, s.p || '', 4, ' maxlength="6000" placeholder="비우면 사이트에 \'들어갈 자리\' 안내가 보여요"'));
        }).join('');
        h += '<div class="sf-field"><label class="sf-label">자료 링크 <span class="ed-help">(선택) 시연 영상 · 발표 자료 등, 최대 6개</span></label><div class="sf-list" data-list="links">'
          + (data.links || []).map(function (l, i) {
            return '<div class="sf-item sf-link" data-i="' + i + '">' + input('links.' + i + '.label', l.label || '', ' maxlength="40" placeholder="이름 (예: 발표 자료)"')
              + input('links.' + i + '.url', l.url || '', ' placeholder="https://…"') + '<button type="button" class="ed-btn sm" data-remove>삭제</button></div>';
          }).join('') + '</div><button type="button" class="ed-btn sm" data-add="links">+ 링크 추가</button></div>';
      } else if (k === 'cohort') {
        h += '<div class="sf-row">' + field('기수', input('cohort', data.cohort || '', ' type="number" min="1" max="99" placeholder="7"'), '', 'sf-narrow')
          + field('날짜', input('date', data.date || '', ' maxlength="20" placeholder="2026. 08. 20"'), '최근 날짜가 앞에 와요') + '</div>';
        h += field('요약', area('summary', data.summary || '', 3, ' maxlength="1000" placeholder="카드와 창 첫 문단"'));
        h += field('태그', chips('tags', COHORT_TAGS, data.tags || []));
        h += gallery();
        h += video('video', 'url');
        h += field('본문', area('body', (data.body || []).join('\n\n'), 6, ' placeholder="창에서 요약 아래에 보일 글(선택). 문단은 빈 줄로 나눠요."'), '(선택)');
      }
      box.innerHTML = h;
    }

    // ── 칸 → 값 ──
    function read() {
      var d = data;
      box.querySelectorAll('[data-k]').forEach(function (el) {
        var k = el.getAttribute('data-k'), v = el.value;
        if (el.type === 'radio') { if (el.checked) d[k] = v; return; }
        if (el.type === 'checkbox') return;
        if (k === 'cohort') { d.cohort = v ? Number(v) : undefined; return; }
        if (k === 'body') { d.body = paras(v); return; }
        if (k === 'tags') { d.tags = v.split(/[\s,]+/).filter(Boolean).map(function (t) { return t.charAt(0) === '#' ? t : '#' + t; }); return; }
        var m;
        if ((m = /^qa\.(\d+)\.(q|a|toc)$/.exec(k))) { d.qa[+m[1]][m[2]] = m[2] === 'a' ? String(v).trim() : trim(v); return; }
        if ((m = /^links\.(\d+)\.(label|url)$/.exec(k))) { d.links[+m[1]][m[2]] = trim(v); return; }
        if ((m = /^sections\.(\d)$/.exec(k))) { d.sections = d.sections || []; d.sections[+m[1]] = { h: (d.sections[+m[1]] || {}).h || SECTIONS[+m[1]], p: String(v).trim() }; return; }
        if ((m = /^photos\.(\d+)\.alt$/.exec(k))) { if (d.photos && d.photos[+m[1]]) d.photos[+m[1]].alt = trim(v); return; }
        if ((m = /^(img|heroImg)\.alt$/.exec(k))) { if (d[m[1]]) d[m[1]].alt = trim(v); return; }
        if (k === 'video.yt' || k === 'video.url') { var id = ytId(v); d.video = d.video || {}; d.video._raw = trim(v); if (id) { if (k === 'video.yt') d.video.yt = id; else d.video.url = 'https://www.youtube.com/watch?v=' + id; } else { delete d.video.yt; delete d.video.url; } return; }
        if (k === 'video.dur') { d.video = d.video || {}; d.video.dur = trim(v); return; }
        d[k] = trim(v);
      });
      var picked = {};
      box.querySelectorAll('input[type=checkbox][data-k]').forEach(function (el) {
        var k = el.getAttribute('data-k'); picked[k] = picked[k] || [];
        if (el.checked) picked[k].push(Number(el.value));
      });
      Object.keys(picked).forEach(function (k) { d[k] = picked[k]; });
      // 켜고 끄는 칸(한눈에 보기 포스트잇 등)
      box.querySelectorAll('input[type=checkbox][data-b]').forEach(function (el) {
        var k = el.getAttribute('data-b');
        if (el.checked) d[k] = true; else delete d[k];
      });
    }
    function clean(d) {
      var out = JSON.parse(JSON.stringify(d));
      if (out.video) { delete out.video._raw; if (!out.video.yt && !out.video.url) delete out.video; }
      if (out.sections && out.sections.every(function (s) { return !s || !s.p; })) delete out.sections;
      if (out.sections) out.sections = SECTIONS.map(function (n, i) { var s = out.sections[i] || {}; return { h: s.h || n, p: s.p || '' }; });
      if (Array.isArray(out.photos)) {
        if (out.photos.length) { out.cover = Math.min(Math.max(0, out.cover | 0), out.photos.length - 1); out.img = JSON.parse(JSON.stringify(out.photos[out.cover])); }
        else { delete out.photos; delete out.cover; delete out.img; }
      }
      if (out.imgLarge && ((out.img && out.img.src) || '') !== origImg) delete out.imgLarge;
      return out;
    }
    function sync() { read(); storyEl.value = JSON.stringify(clean(data)); ctx.markDirty(); }

    // ── 칸 조작 ──
    box.addEventListener('input', sync);
    box.addEventListener('change', sync);
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || !box.contains(b)) return;
      read();
      var item = b.closest('.sf-item'), list = b.closest('.sf-field') && b.closest('.sf-field').querySelector('[data-list]');
      var name = b.getAttribute('data-add') || (list && list.getAttribute('data-list'));
      if (b.hasAttribute('data-add')) {
        data[name] = data[name] || [];
        if (name === 'links' && data.links.length >= 6) { notify('자료 링크는 6개까지예요.', true); return; }
        data[name].push(name === 'qa' ? { q: '', a: '' } : { label: '', url: '' });
      } else if (b.hasAttribute('data-remove') && item) {
        data[name].splice(+item.getAttribute('data-i'), 1);
      } else if (b.hasAttribute('data-move') && item) {
        var i = +item.getAttribute('data-i'), j = i + Number(b.getAttribute('data-move')), arr = data[name];
        if (j < 0 || j >= arr.length) return;
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      } else if (b.hasAttribute('data-pick')) {
        sel = +b.getAttribute('data-pick'); render();
        var on = box.querySelector('.sf-tile.on'); if (on) on.focus();
        return;
      } else if (b.hasAttribute('data-ph')) {
        if (!photoAction(b.getAttribute('data-ph'))) return;
      } else return;
      render(); storyEl.value = JSON.stringify(clean(data)); ctx.markDirty();
      if (b.hasAttribute('data-add')) { var last = box.querySelector('[data-list="' + name + '"] .sf-item:last-child input'); if (last) last.focus(); }
    });
    box.addEventListener('change', function (e) {
      var f = e.target; if (!f.matches('input[type=file][data-upload]') || !f.files[0]) return;
      // 사진 추가(여러 장) · 고른 사진 바꾸기
      var replace = f.getAttribute('data-upload') === 'replace', files = [].slice.call(f.files), target = data;
      f.value = '';
      // 바꿀 사진은 번호가 아니라 그 사진 자체로 기억(올리는 동안 순서를 바꾸거나 지워도 엉뚱한 사진이 바뀌지 않게)
      var room = replace ? 1 : MAX_PHOTOS - target.photos.length, old = replace ? target.photos[sel] : null;
      if (files.length > room) notify('사진은 ' + MAX_PHOTOS + '장까지예요. 앞의 ' + room + '장만 올릴게요.', true);
      files = files.slice(0, room);
      if (!files.length) return;
      notify(files.length > 1 ? '사진 ' + files.length + '장을 올리는 중…' : '사진을 올리는 중…');
      // 고른 순서대로 하나씩 올려요
      files.reduce(function (chain, file) {
        return chain.then(function () {
          return BlockEditor.upload(file, cfg.uploadUrl).then(function (res) {
            return measure(res.url).then(function (size) {
              if (target !== data) return;   // 그사이 카테고리(양식)를 바꿨으면 넣지 않아요
              read();
              var photo = { src: res.url, alt: '', w: size.w, h: size.h };
              if (replace) {
                var at = data.photos.indexOf(old);
                if (at < 0) return;   // 그사이 그 사진을 지웠으면 그대로
                photo.alt = old.alt || ''; data.photos[at] = photo; sel = at;
              } else {
                // 여러 번 나눠 올려도 12장을 넘지 않게 매번 확인
                if (data.photos.length >= MAX_PHOTOS) { notify('사진은 ' + MAX_PHOTOS + '장까지예요.', true); return; }
                data.photos.push(photo); sel = data.photos.length - 1;
              }
              render(); commit();
            });
          });
        });
      }, Promise.resolve()).catch(function (err) { notify(err.message || '사진을 올리지 못했습니다.', true); });
    });

    // ── 모드 전환: 카테고리를 바꾸면 양식도 바뀜(바꾸기 전 칸 값은 기억해 두었다가 돌아오면 다시) ──
    var savedKind = kindOf(), savedData = data;
    function setMode() {
      var next = kindOf();
      if (next === kind) return;
      if (kind) { read(); cache[kind] = data; }
      kind = next;
      document.body.classList.toggle('is-story', !!kind);
      box.hidden = !kind;
      P.storyMode = !!kind;
      if (!kind) { storyEl.value = ''; box.innerHTML = ''; return; }
      data = initPhotos(cache[kind] || (kind === savedKind ? savedData : {}));
      sel = Math.min(sel, Math.max(0, data.photos.length - 1));
      ctx.titleEl.placeholder = TITLE_HINT[kind];
      render();
      storyEl.value = JSON.stringify(clean(data));
    }
    setMode();
    catSel.addEventListener('change', function () { setMode(); ctx.markDirty(); });
    // 브라우저 백업 불러오기 뒤: 그 값으로 다시
    storyEl.addEventListener('story:external', function () {
      savedKind = kindOf(); savedData = parse(storyEl.value); cache = {}; kind = null; sel = 0;
      origImg = (savedData.img && savedData.img.src) || '';   // 불러온 값의 큰 사진(imgLarge)은 그 값의 대표 사진 짝
      setMode();
    });

    // 발행 전 확인(서버도 같은 칸을 다시 확인)
    P.validateStory = function (status) {
      if (!kind || status !== 'PUBLISHED') return '';
      read();
      var d = clean(data), need = [];
      function req(ok, msg) { if (!ok) need.push(msg); }
      if (kind === 'review') { req(d.cat, '분야'); req(d.cohort, '기수'); req(d.author, '이름'); req(d.track, '직군'); req(d.summary, '굵은 첫 문단'); req(d.body && d.body.length, '본문'); }
      if (kind === 'interview') {
        req(d.cohort, '기수'); req(d.author, '이름'); req(d.track, '직군'); req(d.summary, '요약');
        req((d.qa || []).some(function (q) { return q.q || q.a; }) || (d.video && d.video.yt), '질문과 답 또는 유튜브 영상');
      }
      if (kind === 'project') { req(d.summary, '요약'); req(d.team, '팀'); req(d.type, '유형'); req(d.term, '기간'); }
      if (kind === 'cohort') { req(d.cohort, '기수'); req(d.date, '날짜'); req(d.summary, '요약'); }
      var raw = data.video && data.video._raw;
      if (raw && !ytId(raw)) return '유튜브 주소를 알아보지 못했어요. 영상 페이지 주소(https://www.youtube.com/watch?v=…)를 넣어 주세요.';
      return need.length ? '발행하려면 ' + need.join(' · ') + ' 칸을 채워 주세요.' : '';
    };
  });
})(window);
