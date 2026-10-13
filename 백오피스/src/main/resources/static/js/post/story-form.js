/*
 * 글쓰기 화면 — 선배들의 이야기 고정 양식 (editor.html)
 *   카테고리가 후기 · 인터뷰 · 프로젝트 · 기수별 모아보기면 블록 편집기 대신 사이트 글 모양 그대로의 칸을 보여 준다.
 *   칸 값은 hidden input #storyJson 에 JSON 으로 담겨 저장되고(StoryContent 가 정리), 발행하면 사이트(stories-data.js)에 바로 올라간다.
 *   사이트에서 가져온 글이 들고 있는 값(anchor · heroImg · imgLarge · art · heroArt)은 화면에 없어도 그대로 지킨다.
 */
(function (global) {
  'use strict';
  var P = global.PostEditorPage = global.PostEditorPage || {};
  P.modules = P.modules || [];

  var KINDS = { review: '후기', interview: '인터뷰', project: '프로젝트', cohort: '기수 기록' };
  var REVIEW_CATS = [['life', '생활'], ['class', '수업'], ['proj', '프로젝트'], ['career', '취업·진로']];
  var REVIEW_TAGS = ['#비전공자', '#타지출신', '#직장인출신', '#졸업생', '#적응', '#팀활동', '#취업연계'];
  var COHORT_TAGS = ['입교식', 'OT', '특강', '기업탐방', '중간발표회', '해커톤', '프로젝트', '취업박람회', '수료식', '동문회'];
  var SECTIONS = ['문제 정의', '접근 방법', '결과와 다음 단계'];
  var TITLE_HINT = {
    review: '후기 제목 (예: 생활지원금으로 한 달을 꾸려본 기록)', interview: '인터뷰 제목 (예: 비전공자에서 AI 모델러가 되기까지)',
    project: '프로젝트 이름 (예: 손끝 — 시각장애인 보행 보조 앱)', cohort: '기록 제목 (예: 7기 입교식 하이라이트)'
  };
  var INTRO = {
    review: '사이트의 후기 창과 같은 순서예요. 분야 · 기수 · 이름 → 굵은 첫 문단 → 본문 → 태그.',
    interview: '인터뷰 카드와 상세 화면에 들어갈 내용이에요. 질문과 답을 넣거나 유튜브 영상 주소를 넣어 주세요.',
    project: '우수 프로젝트 넘김 화면과 상세 화면에 들어갈 내용이에요.',
    cohort: '기수별 모아보기 카드와 눌렀을 때 열리는 창에 들어갈 내용이에요.'
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
    var data = parse(storyEl.value), kind = null, cache = {};

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
    function photo(key, label) {
      var img = data[key], has = img && img.src;
      var note = !has && data.art ? '<p class="ed-help">지금은 시안 그림(일러스트)이 쓰여요. 사진을 올리면 사진으로 바뀌어요.</p>' : '';
      return field(label, '<div class="ed-thumb sf-photo" data-photo="' + key + '">'
        + (has ? '<img src="' + esc(imgUrl(img.src)) + '" alt="">' : '') + note
        + '<div class="row"><label class="ed-btn sm" style="cursor:pointer">' + (has ? '사진 바꾸기' : '사진 올리기') + ' <input type="file" accept="image/*" data-upload="' + key + '" hidden></label>'
        + (has ? '<button class="ed-btn sm" type="button" data-clear="' + key + '">지우기</button>' : '')
        + '<span class="ed-help">가로 사진 권장(16:10)</span></div>'
        + (has ? '<input class="sf-input sf-alt" data-k="' + key + '.alt" value="' + esc(img.alt || '') + '" maxlength="200" placeholder="사진 설명(화면 낭독기용, 선택)">' : '') + '</div>');
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
        h += field('태그', chips('tags', REVIEW_TAGS, data.tags || []), '카드와 리스트에는 첫 태그가 보여요');
        h += field('흐르는 띠 문구', input('ticker', data.ticker || '', ' maxlength="80" placeholder="비우면 첫 문단의 첫 문장"'), '(선택) 맨 위 흐르는 한 줄');
      } else if (k === 'interview') {
        h += who();
        h += field('요약', area('summary', data.summary || '', 3, ' maxlength="1000" placeholder="카드와 상세 화면 첫 문단"'));
        h += field('한 줄 인용', input('quote', data.quote || '', ' maxlength="300" placeholder="카드에 크게 들어가는 인용 문장"'), '(선택)');
        h += photo('img', '사진');
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
        h += field('요약', area('summary', data.summary || '', 3, ' maxlength="1000" placeholder="넘김 화면과 상세 화면 첫 문단"'));
        h += field('태그', input('tags', (data.tags || []).join(' '), ' placeholder="#컴퓨터비전 #접근성 #온디바이스"'), '빈칸으로 나눠요(최대 8개)');
        h += '<div class="sf-row">' + field('팀', input('team', data.team || '', ' maxlength="60" placeholder="AI 모델링 2반 · 5명"'))
          + field('유형', input('type', data.type || '', ' maxlength="30" placeholder="실증"'), '', 'sf-narrow')
          + field('기간', input('term', data.term || '', ' maxlength="40" placeholder="도약과정 720H"')) + '</div>';
        h += photo('img', '사진');
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
        h += photo('img', '사진');
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
    }
    function clean(d) {
      var out = JSON.parse(JSON.stringify(d));
      if (out.video) { delete out.video._raw; if (!out.video.yt && !out.video.url) delete out.video; }
      if (out.sections && out.sections.every(function (s) { return !s || !s.p; })) delete out.sections;
      if (out.sections) out.sections = SECTIONS.map(function (n, i) { var s = out.sections[i] || {}; return { h: s.h || n, p: s.p || '' }; });
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
      } else if (b.hasAttribute('data-clear')) {
        var key = b.getAttribute('data-clear'); delete data[key]; if (key === 'img') delete data.imgLarge;
      } else return;
      render(); storyEl.value = JSON.stringify(clean(data)); ctx.markDirty();
      if (b.hasAttribute('data-add')) { var last = box.querySelector('[data-list="' + name + '"] .sf-item:last-child input'); if (last) last.focus(); }
    });
    box.addEventListener('change', function (e) {
      var f = e.target; if (!f.matches('input[type=file][data-upload]') || !f.files[0]) return;
      var key = f.getAttribute('data-upload'), file = f.files[0];
      f.value = '';
      BlockEditor.upload(file, cfg.uploadUrl).then(function (res) {
        var im = new Image();
        im.onload = im.onerror = function () {
          read();
          data[key] = { src: res.url, alt: (data[key] && data[key].alt) || '', w: im.naturalWidth || undefined, h: im.naturalHeight || undefined };
          if (key === 'img') delete data.imgLarge;   // 큰 사진은 새 사진으로
          render(); storyEl.value = JSON.stringify(clean(data)); ctx.markDirty();
        };
        im.src = base + res.url;
      }).catch(function (err) { notify(err.message || '사진을 올리지 못했습니다.', true); });
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
      data = cache[kind] || (kind === savedKind ? savedData : {});
      ctx.titleEl.placeholder = TITLE_HINT[kind];
      render();
      storyEl.value = JSON.stringify(clean(data));
    }
    setMode();
    catSel.addEventListener('change', function () { setMode(); ctx.markDirty(); });
    // 브라우저 백업 불러오기 뒤: 그 값으로 다시
    storyEl.addEventListener('story:external', function () { savedKind = kindOf(); savedData = parse(storyEl.value); cache = {}; kind = null; setMode(); });

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
