/*
 * 게시물 관리 › 인사교 라이프 게시물 관리 (templates/page/life-photos.html)
 *   세 탭: 시설 사진(층 › 공간 사진 넘김) · 오늘 점심, 여기 어때요?(식당 · 카페 카드) · 수업 끝나고, 바람 쐬러 가요(문화 · 여가 카드)
 *   2026-10-20부터 카드(사진) 하나씩 저장해요(DB 표 V29 — LifeBoardService · LifePhotoController):
 *     - 목록 맨 끝 '＋ 추가'를 누르면 빈 카드(템플릿)가 생기고, 사진 · 이름 등을 넣은 뒤 아래 완료 · 임시저장 · 취소
 *     - 카드의 '수정'도 같은 모양으로 열려요. 완료 = 게시(사이트에 바로 반영) · 임시저장 = 사이트에는 안 보임 · 취소 = 저장 안 함
 *     - 완료 · 임시저장 · 취소 · 삭제는 확인창(예 · 아니오)을 띄워요. 삭제하면 휴지통으로(휴지통에서 복원)
 *     - 순서(◀ ▶)는 누르면 바로 저장돼요. 위쪽 '저장' 단추는 없어요
 *   사진은 브라우저에서 긴 변 1920px · WEBP로 줄여 올린다(카테고리 페이지 관리의 그림 올리기 API).
 *   임시저장 목록의 '인사교 라이프에서 수정'은 ?section=…&edit=번호 로 열어 그 카드를 수정 상태로 보여 줘요.
 */
(function () {
  'use strict';
  var root = document.getElementById('lifePhotos');
  if (!root) return;
  var DRAFT_API = root.dataset.draftApi;
  var API = root.dataset.api, UPLOAD = root.dataset.upload, SITE = root.dataset.siteBase, FRONT = (root.dataset.front || '').split('#')[0], EDITOR = root.dataset.editor;
  var meta = function (n) { var m = document.querySelector('meta[name="' + n + '"]'); return m ? m.getAttribute('content') : ''; };
  var SIZES = [['', '꽉 차게(기본)'], ['150%', '1.5배 확대'], ['200%', '2배 확대'], ['250%', '2.5배 확대'], ['300%', '3배 확대']];
  var SECTIONS = [['fac', '시설 사진', '#facilities'], ['food', '오늘 점심, 여기 어때요?', '#tp-food'], ['fun', '수업 끝나고, 바람 쐬러 가요', '#tp-fun']];
  var STATUS = { DRAFT: '임시저장', HIDDEN: '미게시' };
  var model = null, floor = null, foodKind = 'food', busy = false;
  var section = /^(fac|food|fun)$/.test(root.dataset.section || '') ? root.dataset.section : 'fac';
  // 작성 중인 카드(한 번에 하나): { section, scope(공간 번호 · food/cafe · 묶음), id(새 카드면 null), data, dirty }
  var edit = null;
  var openId = (function () { try { return new URLSearchParams(location.search).get('edit'); } catch (e) { return null; } })();

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function toast(msg, err) { if (window.notify) window.notify(msg, err); else alert(msg); }
  function ask(msg, opts) { return window.askYesNo ? window.askYesNo(msg, opts) : Promise.resolve(confirm(msg)); }
  function spaces() { var out = []; model.floors.forEach(function (f) { f.spaces.forEach(function (s) { out.push(s); }); }); return out; }
  function spaceById(id) { return spaces().filter(function (s) { return s.id === id; })[0]; }
  function funGroup(k) { return model.fun.filter(function (g) { return g.k === k; })[0]; }
  function published(x) { return x.status === 'PUBLISHED'; }
  function badge(x) { return STATUS[x.status] ? '<span class="lp-st">' + STATUS[x.status] + '</span>' : ''; }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }

  // 보안 토큰은 보낼 때마다 새로 읽어요(다시 로그인하면 admin.js 의 로그인 확인이 새 토큰을 넣어 줌).
  // 로그인이 풀렸으면(관리자 서버를 다시 켠 뒤 등) 화면 위에 안내를 띄우고, 그사이 다시 로그인돼 있으면 한 번 더 보내요.
  function request(url, opts, retried) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    opts.credentials = 'same-origin';
    if (opts.method && opts.method !== 'GET') opts.headers[meta('_csrf_header') || 'X-CSRF-TOKEN'] = meta('_csrf');
    return fetch(url, opts).catch(function () {
      if (window.BOSession) window.BOSession.check();
      throw new Error('관리자 서버에 연결하지 못했어요. 서버(npm start 터미널)가 켜져 있는지 확인해 주세요.');
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          if (r.status === 401 || r.status === 403) {
            if (!retried && window.BOSession) {
              return window.BOSession.check().then(function (ok) {
                if (ok) return request(url, opts, true);
                throw new Error('로그인이 풀려서 하지 못했어요. 화면 위 안내대로 다시 로그인한 뒤 한 번 더 해 주세요.');
              });
            }
            throw new Error(r.status === 401 ? '로그인이 풀려서 하지 못했어요. 다시 로그인한 뒤 한 번 더 해 주세요.' : '이 작업을 할 권한이 없어요. 관리자 계정으로 로그인했는지 확인해 주세요.');
          }
          if (!r.ok) throw new Error(body.message || ('요청을 처리하지 못했어요 (' + r.status + ')'));
          return body;
        });
      });
  }
  function post(url, body) {
    return request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  }

  function load() {
    request(API).then(function (m) {
      model = m;
      floor = floor || m.defaultFloor || (m.floors[0] && m.floors[0].g);
      render();
      if (openId) { openFromList(openId); openId = null; }
    }).catch(function (e) { root.innerHTML = '<div class="alert error">' + esc(e.message) + '</div>'; });
  }

  // 임시저장 목록에서 '인사교 라이프에서 수정'으로 왔으면 그 카드를 찾아 수정 상태로
  function openFromList(id) {
    id = Number(id);
    if (section === 'fac') {
      model.floors.forEach(function (f) { f.spaces.forEach(function (s) { s.photos.forEach(function (p) { if (p.id === id) { floor = f.g; startEdit('fac', s.id, p); } }); }); });
    } else if (section === 'food') {
      model.food.forEach(function (f) { if (f.id === id) { foodKind = f.t; startEdit('food', f.t, f); } });
    } else {
      model.fun.forEach(function (g) { g.cards.forEach(function (c) { if (c.id === id) startEdit('fun', g.k, c); }); });
    }
    var el = root.querySelector('[data-edit]');
    if (el) el.scrollIntoView({ block: 'center' });
  }

  // ── 그리기 ──
  function render() {
    var h = '';
    if (model.hasDraft) h += window.draftNoteHtml(model.draft, '인사교 라이프', EDITOR);
    h += '<div class="lp-sections" role="tablist" aria-label="고칠 곳">' + SECTIONS.map(function (s) {
      return '<button type="button" role="tab" class="lp-section" data-section="' + s[0] + '" aria-selected="' + (section === s[0]) + '">' + esc(s[1])
        + (edit && edit.section === s[0] ? ' <i class="lp-mark" title="작성 중인 카드">●</i>' : '') + '</button>';
    }).join('') + '</div>';
    var link = FRONT + SECTIONS.filter(function (s) { return s[0] === section; })[0][2];
    h += '<div class="lp-bar"><div class="lp-floors" role="tablist">' + leftTabs() + '</div>'
      + '<div class="lp-top-r"><span class="lp-state" id="lpState"></span><a class="btn ghost sm" href="' + esc(link) + '" target="_blank" rel="noopener">사이트에서 보기 ↗</a></div></div>';
    h += '<p class="lp-help">카드의 <b>수정</b>이나 맨 끝 <b>＋ 추가</b>를 누른 뒤 아래 <b>완료</b>(사이트에 게시) · <b>임시저장</b>(사이트에는 안 보임) · <b>취소</b>를 눌러요. '
      + '순서(◀ ▶)는 누르면 바로 반영되고, 삭제한 카드는 휴지통에서 복원할 수 있어요.</p>';
    if (section === 'fac') {
      var current = model.floors.filter(function (f) { return f.g === floor; })[0] || model.floors[0];
      h += current.spaces.map(spaceHtml).join('');
    } else if (section === 'food') {
      h += foodHtml();
    } else {
      h += model.fun.map(funGroupHtml).join('');
    }
    root.innerHTML = h;
    syncBar();
    syncNav();
  }

  // 왼쪽 메뉴의 세부 카테고리 표시와 주소(?section=)를 지금 탭에 맞춘다
  function syncNav() {
    document.querySelectorAll('a[data-life-section]').forEach(function (a) { a.classList.toggle('on', a.dataset.lifeSection === section); });
    try { history.replaceState(null, '', location.pathname + '?section=' + section); } catch (e) { /* 무시 */ }
  }

  function leftTabs() {
    if (section === 'fac') {
      return model.floors.map(function (f) {
        var n = edit && edit.section === 'fac' && f.spaces.some(function (s) { return s.id === edit.scope; });
        return '<button type="button" role="tab" class="lp-floor" data-floor="' + esc(f.g) + '" aria-selected="' + (f.g === floor) + '"><b>' + esc(f.floor) + '</b> ' + esc(f.name)
          + (n ? ' <i class="lp-mark" title="작성 중인 카드">●</i>' : '') + '</button>';
      }).join('');
    }
    if (section === 'food') {
      return [['food', '식당'], ['cafe', '카페']].map(function (k) {
        var n = model.food.filter(function (f) { return f.t === k[0] && published(f); }).length;
        return '<button type="button" role="tab" class="lp-floor" data-kind="' + k[0] + '" aria-selected="' + (foodKind === k[0]) + '"><b>' + k[1] + '</b> ' + n + '곳</button>';
      }).join('');
    }
    return '';
  }

  function field(label, control, wide) { return '<label class="lp-field' + (wide ? ' wide' : '') + '"><span>' + label + '</span>' + control + '</label>'; }
  function input(key, value, attrs) { return '<input class="input" data-e="' + key + '" value="' + esc(value == null ? '' : value) + '"' + (attrs || '') + '>'; }
  function counts(list) {
    var pub = list.filter(published).length, other = list.length - pub;
    return '게시 ' + pub + (other ? ' · 임시저장 ' + other : '');
  }
  function editing(sec, scope, id) { return edit && edit.section === sec && edit.scope === scope && edit.id === id; }
  function addTile(sec, scope, full, hint) {
    if (editing(sec, scope, null)) return '';
    if (full) return '<div class="lp-add is-full"><span>' + esc(full) + '</span></div>';
    return '<button type="button" class="lp-add" data-act="add" data-scope="' + esc(scope) + '"><span>＋ 추가</span><small>' + esc(hint) + '</small></button>';
  }
  function cardTools(i, total) {
    return '<div class="lp-tools">'
      + '<button type="button" class="btn ghost xs" data-act="left" title="앞으로"' + (i === 0 ? ' disabled' : '') + '>◀</button>'
      + '<button type="button" class="btn ghost xs" data-act="right" title="뒤로"' + (i === total - 1 ? ' disabled' : '') + '>▶</button>'
      + '<button type="button" class="btn xs" data-act="edit">수정</button>'
      + '<button type="button" class="btn danger xs" data-act="del">삭제</button></div>';
  }
  function editActions() {
    return '<div class="lp-edit-acts">'
      + '<button type="button" class="btn primary sm" data-act="done" title="사이트의 인사교 라이프에 바로 게시돼요">완료</button>'
      + '<button type="button" class="btn sm" data-act="draft" title="사이트에는 보이지 않아요">임시저장</button>'
      + '<button type="button" class="btn ghost sm" data-act="cancel">취소</button></div>';
  }
  function photoBox(url, bs, bp, cls, extra, focus) {
    var m = /^(\d{1,3})% (\d{1,3})%$/.exec(bp || '');
    var dot = focus && m ? '<i class="lp-dot" style="left:' + m[1] + '%;top:' + m[2] + '%"></i>' : '';
    return '<div class="lp-img ' + (cls || '') + '"' + (focus ? ' data-act="focus" title="사진에서 가운데에 보일 곳을 눌러요"' : '')
      + ' style="background-image:url(&quot;' + esc(url) + '&quot;);background-size:' + esc(bs || 'cover') + ';background-position:' + esc(bp || 'center') + '">' + (extra || '') + dot + '</div>';
  }

  // 시설 사진
  function spaceHtml(s) {
    var max = model.maxPhotos || 12, total = s.photos.length;
    var cards = s.photos.map(function (p, i) { return editing('fac', s.id, p.id) ? photoEditor() : photoCard(p, i, total); }).join('');
    if (editing('fac', s.id, null)) cards += photoEditor();
    var full = s.photos.filter(published).length >= max ? '게시중인 사진은 ' + max + '장까지예요' : '';
    return '<section class="card lp-space" data-space="' + esc(s.id) + '">'
      + '<div class="lp-space-h"><h3>' + esc(s.name) + ' <span class="muted">' + counts(s.photos) + '</span></h3></div>'
      + '<div class="lp-grid">' + cards + addTile('fac', s.id, full, '사진 · 사진 이름을 넣어요') + '</div></section>';
  }
  function photoCard(p, i, total) {
    var no = '<span class="lp-no">' + (i + 1) + '</span>' + badge(p);
    return '<div class="lp-photo' + (published(p) ? '' : ' lp-is-draft') + '" data-id="' + p.id + '" data-i="' + i + '">'
      + (p.url ? photoBox(p.url, p.bs, p.bp, '', no, false) : '<div class="lp-img lp-noimg">' + no + '<span>사진 없음</span></div>')
      + '<p class="lp-name">' + esc(p.caption || '(이름 없음)') + '</p>' + cardTools(i, total) + '</div>';
  }
  function photoEditor() {
    var d = edit.data;
    var size = SIZES.some(function (z) { return z[0] === (d.bs || ''); }) ? SIZES : SIZES.concat([[d.bs, d.bs + ' 확대']]);
    return '<div class="lp-photo lp-edit" data-edit>'
      + '<div class="lp-edit-h">' + (edit.id ? '사진 수정' : '새 사진') + '</div>'
      + (d.url ? photoBox(d.url, d.bs, d.bp, '', '', true) : '<div class="lp-img lp-noimg"><span>사진을 올려 주세요</span></div>')
      + '<div class="lp-tools"><label class="btn ghost xs">' + (d.url ? '사진 바꾸기' : '사진 올리기') + '<input type="file" accept="image/*" data-act="edit-photo" hidden></label>'
      + (d.url ? '<select class="select lp-size" data-e="bs" title="확대">' + size.map(function (z) { return '<option value="' + esc(z[0]) + '"' + ((d.bs || '') === z[0] ? ' selected' : '') + '>' + esc(z[1]) + '</option>'; }).join('') + '</select>' : '')
      + '</div>'
      + field('사진 이름', input('caption', d.caption, ' maxlength="60" placeholder="예: 강의실 전경 (사진 아래 · 화면 낭독기에 쓰여요)"'), true)
      + editActions() + '</div>';
  }

  // 오늘 점심, 여기 어때요?
  function foodHtml() {
    var list = model.food.filter(function (f) { return f.t === foodKind; });
    var label = foodKind === 'cafe' ? '카페' : '식당', max = model.maxFood || 40;
    var cards = list.map(function (f, i) { return editing('food', foodKind, f.id) ? foodEditor() : foodCard(f, i, list.length); }).join('');
    if (editing('food', foodKind, null)) cards += foodEditor();
    var full = list.filter(published).length >= max ? label + '은(는) ' + max + '곳까지예요' : '';
    return '<section class="card lp-space"><div class="lp-space-h"><h3>' + label + ' <span class="muted">' + counts(list) + ' · 사이트에 이 순서대로 보여요</span></h3></div>'
      + '<div class="lp-grid lp-grid-wide">' + cards + addTile('food', foodKind, full, '사진 · 이름 · 메뉴 등을 넣어요') + '</div></section>';
  }
  function partyLabel(f) { return f.g === 'group' ? '여럿이 가기 좋아요' : f.t === 'cafe' ? '혼자 가기 편해요' : '혼밥하기 편해요'; }
  function foodCard(f, i, total) {
    var photo = f.url ? photoBox(f.url, '', '', 'lp-img-food', badge(f), false) : '<div class="lp-img lp-img-food lp-noimg">' + badge(f) + '<span>사진 준비 중</span></div>';
    return '<div class="lp-photo lp-view' + (published(f) ? '' : ' lp-is-draft') + '" data-id="' + f.id + '" data-i="' + i + '">' + photo
      + '<p class="lp-name">' + esc(f.name || '(이름 없음)') + '</p>'
      + '<p class="lp-meta">' + esc([f.category, f.w ? '도보 약 ' + f.w + '분' : '', partyLabel(f)].filter(Boolean).join(' · ')) + '</p>'
      + (f.menu ? '<p class="lp-meta">' + esc(f.menu) + '</p>' : '')
      + (f.review ? '<p class="lp-quote">“' + esc(f.review) + '”' + (f.example ? ' <span class="lp-ex">예시</span>' : '') + '</p>' : '')
      + cardTools(i, total) + '</div>';
  }
  function foodEditor() {
    var d = edit.data, solo = edit.scope === 'cafe' ? '혼자 가기 편해요' : '혼밥하기 편해요';
    var photo = d.url ? photoBox(d.url, '', '', 'lp-img-food', '', false) : '<div class="lp-img lp-img-food lp-noimg"><span>사진 준비 중</span></div>';
    return '<div class="lp-photo lp-card lp-edit" data-edit>'
      + '<div class="lp-edit-h">' + (edit.id ? (edit.scope === 'cafe' ? '카페' : '식당') + ' 수정' : '새 ' + (edit.scope === 'cafe' ? '카페' : '식당')) + '</div>' + photo
      + '<div class="lp-tools"><label class="btn ghost xs">' + (d.url ? '사진 바꾸기' : '사진 올리기') + '<input type="file" accept="image/*" data-act="edit-photo" hidden></label>'
      + (d.url ? '<button type="button" class="btn ghost xs" data-act="edit-nophoto">사진 빼기</button>' : '') + '</div>'
      + field('이름', input('name', d.name, ' maxlength="40" placeholder="가게 이름"'), true)
      + field('분류', input('category', d.category, ' maxlength="12" placeholder="예: 한식"'))
      + field('걸어서', '<span class="lp-unit">' + input('w', d.w, ' type="number" min="1" max="120"') + '분</span>')
      + field('메뉴 · 위치', input('menu', d.menu, ' maxlength="80" placeholder="예: 국밥 · 동명동"'), true)
      + field('누구랑', '<select class="select" data-e="g"><option value="solo"' + (d.g !== 'group' ? ' selected' : '') + '>' + solo + '</option><option value="group"' + (d.g === 'group' ? ' selected' : '') + '>여럿이 가기 좋아요</option></select>', true)
      + field('선배 후기 <em>(선택)</em>', '<textarea class="input lp-ta" data-e="review" rows="2" maxlength="200" placeholder="한두 문장">' + esc(d.review) + '</textarea>'
        + (d.example ? '<small class="lp-ex">지금은 ‘예시’ 후기예요. 후기를 고쳐서 저장하면 ‘예시’ 표시가 빠져요.</small>' : ''), true)
      + editActions() + '</div>';
  }

  // 수업 끝나고, 바람 쐬러 가요
  function funGroupHtml(g) {
    var max = model.maxFun || 10;
    var cards = g.cards.map(function (c, i) { return editing('fun', g.k, c.id) ? funEditor() : funCard(c, i, g.cards.length); }).join('');
    if (editing('fun', g.k, null)) cards += funEditor();
    var full = g.cards.filter(published).length >= max ? '게시중인 곳은 ' + max + '곳까지예요' : '';
    return '<section class="card lp-space" data-fun="' + esc(g.k) + '"><div class="lp-space-h"><h3>' + esc(g.title) + ' <span class="muted">' + counts(g.cards) + ' · ' + esc(g.sub) + '</span></h3></div>'
      + '<div class="lp-grid lp-grid-wide">' + cards + addTile('fun', g.k, full, '사진 · 이름 · 거리 등을 넣어요') + '</div></section>';
  }
  function funCard(c, i, total) {
    var photo = c.url ? photoBox(c.url, '', '', 'lp-img-fun', badge(c), false) : '<div class="lp-img lp-img-fun lp-noimg">' + badge(c) + '<span>사진 없음</span></div>';
    return '<div class="lp-photo lp-view' + (published(c) ? '' : ' lp-is-draft') + '" data-id="' + c.id + '" data-i="' + i + '">' + photo
      + '<p class="lp-name">' + esc(c.name || '(이름 없음)') + '</p>'
      + '<p class="lp-meta">' + esc([c.distance, c.fee].filter(Boolean).join(' · ')) + '</p>'
      + (c.summary ? '<p class="lp-quote">' + esc(c.summary) + '</p>' : '')
      + cardTools(i, total) + '</div>';
  }
  function funEditor() {
    var d = edit.data;
    var photo = d.url ? photoBox(d.url, '', '', 'lp-img-fun', '', false) : '<div class="lp-img lp-img-fun lp-noimg"><span>사진을 올려 주세요</span></div>';
    return '<div class="lp-photo lp-card lp-edit" data-edit>'
      + '<div class="lp-edit-h">' + (edit.id ? '장소 수정' : '새 장소') + '</div>' + photo
      + '<div class="lp-tools"><label class="btn ghost xs">' + (d.url ? '사진 바꾸기' : '사진 올리기') + '<input type="file" accept="image/*" data-act="edit-photo" hidden></label></div>'
      + field('이름', input('name', d.name, ' maxlength="40" placeholder="장소 이름"'), true)
      + field('거리', input('distance', d.distance, ' maxlength="40" placeholder="예: 동쪽 · 약 1km"'))
      + field('요금', input('fee', d.fee, ' maxlength="30" placeholder="예: 무료"'))
      + field('설명', '<textarea class="input lp-ta" data-e="summary" rows="3" maxlength="200" placeholder="한두 문장">' + esc(d.summary) + '</textarea>', true)
      + editActions() + '</div>';
  }

  function syncBar() {
    var st = document.getElementById('lpState');
    if (!st) return;
    st.textContent = busy ? '처리 중…' : edit && edit.dirty ? '작성 중인 카드가 있어요' : '';
    root.querySelectorAll('[data-act="done"],[data-act="draft"]').forEach(function (b) { b.disabled = busy; });
  }

  // ── 사진 올리기: 긴 변 1920px · WEBP(안 되면 JPG) ──
  function prepare(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) { reject(new Error('그림 파일만 올릴 수 있어요: ' + file.name)); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) {
          if (b && b.type === 'image/webp') { resolve({ blob: b, ext: 'webp' }); return; }
          c.toBlob(function (j) { if (j) resolve({ blob: j, ext: 'jpg' }); else reject(new Error('사진을 줄이지 못했어요: ' + file.name)); }, 'image/jpeg', 0.86);
        }, 'image/webp', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('사진을 읽지 못했어요: ' + file.name)); };
      img.src = url;
    });
  }
  function upload(file, label) {
    return prepare(file).then(function (r) {
      return request(UPLOAD + '&name=' + encodeURIComponent(label + '.' + r.ext), {
        method: 'POST', body: r.blob, headers: { 'Content-Type': 'application/octet-stream' }
      });
    }).then(function (res) { return { src: res.path, url: SITE + res.path }; });
  }
  function withBusy(promise) {
    busy = true; syncBar();
    return promise.then(function (v) { busy = false; syncBar(); return v; }, function (e) { busy = false; syncBar(); toast(e.message, true); throw e; });
  }

  // ── 작성(추가 · 수정) ──
  function itemOf(sec, scope, id) {
    if (sec === 'fac') return (spaceById(scope) || { photos: [] }).photos.filter(function (p) { return p.id === id; })[0];
    if (sec === 'food') return model.food.filter(function (f) { return f.id === id; })[0];
    return (funGroup(scope) || { cards: [] }).cards.filter(function (c) { return c.id === id; })[0];
  }
  function blank(sec, scope) {
    if (sec === 'fac') return { cls: '', src: '', url: '', bs: '', bp: '', caption: '' };
    if (sec === 'food') return { t: scope, g: 'solo', w: 5, category: '', name: '', menu: '', review: '', example: false, src: '', url: '' };
    return { name: '', distance: '', fee: '', summary: '', cls: '', src: '', url: '' };
  }
  function busyEditing() {
    if (edit && edit.dirty) {
      toast('작성 중인 카드가 있어요. 먼저 완료 · 임시저장 · 취소 중 하나를 눌러 주세요.', true);
      var el = root.querySelector('[data-edit]'); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return true;
    }
    return false;
  }
  function startEdit(sec, scope, item) {
    edit = { section: sec, scope: scope, id: item ? item.id : null, data: item ? copy(item) : blank(sec, scope), dirty: false, was: item ? item.status : null };
    render();
    var first = root.querySelector('[data-edit] [data-e]');
    if (first && !item) first.focus();
  }
  function closeEdit() { edit = null; render(); }

  // 게시하기 전에 빈칸 확인(서버도 같은 칸을 다시 확인)
  function missing() {
    var d = edit.data, need = [];
    if (edit.section === 'fac') { if (!d.url) need.push('사진'); if (!String(d.caption || '').trim()) need.push('사진 이름'); }
    else if (edit.section === 'food') {
      if (!String(d.name || '').trim()) need.push('이름'); if (!String(d.category || '').trim()) need.push('분류');
      if (!(d.w >= 1 && d.w <= 120)) need.push('걸어서 몇 분(1~120)'); if (!String(d.menu || '').trim()) need.push('메뉴 · 위치');
    } else {
      if (!d.url) need.push('사진');
      [['name', '이름'], ['distance', '거리'], ['fee', '요금'], ['summary', '설명']].forEach(function (f) { if (!String(d[f[0]] || '').trim()) need.push(f[1]); });
    }
    return need;
  }
  function body(status) {
    var d = edit.data, b = { status: status };
    if (edit.section === 'fac') { b.space = edit.scope; b.cls = d.cls || ''; b.src = d.src || ''; b.bs = d.bs || ''; b.bp = d.bp || ''; b.caption = d.caption || ''; }
    else if (edit.section === 'food') {
      b.t = edit.scope; b.g = d.g || 'solo'; b.w = d.w === '' || d.w == null ? null : Number(d.w);
      b.category = d.category || ''; b.name = d.name || ''; b.menu = d.menu || ''; b.review = d.review || ''; b.src = d.src || '';
    } else { b.k = edit.scope; b.name = d.name || ''; b.distance = d.distance || ''; b.fee = d.fee || ''; b.summary = d.summary || ''; b.cls = d.cls || ''; b.src = d.src || ''; }
    return b;
  }
  function submit(status) {
    var url = API + '/' + edit.section + (edit.id ? '/' + edit.id : '');
    return withBusy(post(url, body(status))).then(function (m) {
      model = m; edit = null; render();
      toast(m.message || '저장했어요.');
    }, function () { /* 안내는 withBusy 가 */ });
  }
  function title(sec, item) { var t = sec === 'fac' ? item.caption : item.name; return t && String(t).trim() ? t : '이름 없는 카드'; }

  // ── 조작 ──
  root.addEventListener('click', function (e) {
    var t = e.target.closest('[data-section],[data-floor],[data-kind],[data-act]');
    // 화면 전체 칸(#lifePhotos)에도 지금 탭(data-section)이 적혀 있어서, 그 칸 자체가 잡히면 탭을 누른 것으로 오해해 다시 그려요. 화면 전체 칸은 건너뜀
    if (!t || t === root || !root.contains(t) || t.disabled || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;
    if (t.dataset.section) { section = t.dataset.section; render(); return; }
    if (t.dataset.floor) { floor = t.dataset.floor; render(); return; }
    if (t.dataset.kind) { foodKind = t.dataset.kind; render(); return; }
    var act = t.dataset.act;
    if (act === 'discard-draft') { discardDraft(); return; }
    var sp = t.closest('[data-space]'), fg = t.closest('[data-fun]');
    var sec = section, scope = sec === 'fac' ? (sp && sp.dataset.space) : sec === 'food' ? foodKind : (fg && fg.dataset.fun);
    if (!scope || !t.closest('.lp-space')) return;

    if (act === 'add') { if (!busyEditing()) startEdit(sec, scope, null); return; }

    // 작성 중인 카드의 단추
    if (act === 'done') {
      var need = missing();
      if (need.length) { toast('게시하려면 ' + need.join(' · ') + ' 칸을 채워 주세요. 다 못 채웠으면 임시저장해 두세요.', true); return; }
      ask('게시하시겠습니까?\n완료하면 사이트의 인사교 라이프에 바로 반영돼요.').then(function (yes) { if (yes) submit('PUBLISHED'); });
      return;
    }
    if (act === 'draft') {
      ask('임시저장하시겠습니까?\n임시저장한 카드는 사이트에 보이지 않아요.' + (edit.was === 'PUBLISHED' ? '\n지금 게시중인 카드라 사이트에서는 내려가요.' : ''))
        .then(function (yes) { if (yes) submit('DRAFT'); });
      return;
    }
    if (act === 'cancel') {
      ask(edit.id ? '수정을 취소하시겠습니까?\n고친 내용은 저장되지 않아요.' : '작성을 취소하시겠습니까?\n입력한 내용은 저장되지 않아요.').then(function (yes) { if (yes) closeEdit(); });
      return;
    }
    if (act === 'edit-nophoto') { edit.data.src = ''; edit.data.url = ''; edit.dirty = true; render(); return; }
    if (act === 'focus') {
      var r = t.getBoundingClientRect();
      var x = Math.round(Math.min(100, Math.max(0, (e.clientX - r.left) / r.width * 100)));
      var y = Math.round(Math.min(100, Math.max(0, (e.clientY - r.top) / r.height * 100)));
      edit.data.bp = x + '% ' + y + '%'; edit.dirty = true; render(); return;
    }

    // 목록 카드의 단추
    var card = t.closest('[data-id]'); if (!card) return;
    var id = Number(card.dataset.id), item = itemOf(sec, scope, id); if (!item) return;
    if (act === 'edit') { if (!busyEditing()) startEdit(sec, scope, item); return; }
    if (act === 'left' || act === 'right') {
      withBusy(post(API + '/' + sec + '/' + id + '/move?dir=' + (act === 'left' ? -1 : 1))).then(function (m) { model = m; render(); }, function () {});
      return;
    }
    if (act === 'del') {
      ask('‘' + title(sec, item) + '’을(를) 삭제하시겠습니까?\n휴지통으로 이동하고, 휴지통에서 복원할 수 있어요.' + (published(item) ? '\n사이트에서도 바로 내려가요.' : ''), { danger: true })
        .then(function (yes) {
          if (!yes) return;
          withBusy(post(API + '/' + sec + '/' + id + '/delete')).then(function (m) {
            model = m;
            if (edit && edit.section === sec && edit.id === id) edit = null;
            render(); toast(m.message || '휴지통으로 옮겼어요.');
          }, function () {});
        });
    }
  });

  // 작성 중인 카드의 글자 칸: 다시 그리지 않고 값만(입력 중 커서 유지)
  root.addEventListener('input', function (e) {
    var k = e.target.dataset.e; if (!k || !edit) return;
    edit.data[k] = k === 'w' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value;
    edit.dirty = true; syncBar();
  });

  root.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.e === 'g' && edit) { edit.data.g = t.value; edit.dirty = true; syncBar(); return; }
    if (t.dataset.e === 'bs' && edit) { edit.data.bs = t.value; edit.dirty = true; render(); return; }
    if (t.dataset.act !== 'edit-photo' || !edit) return;
    var files = Array.prototype.slice.call(t.files || []); t.value = '';
    if (!files.length) return;
    var target = edit, label = edit.section === 'fac' ? 'facility-' + edit.scope : edit.section === 'food' ? 'food' : 'fun-' + edit.scope;
    withBusy(upload(files[0], label)).then(function (p) {
      if (edit !== target) return;   // 그사이 취소했으면 넣지 않아요
      edit.data.src = p.src; edit.data.url = p.url; edit.data.cls = ''; edit.data.bs = ''; edit.data.bp = '';
      edit.dirty = true; render();
    }, function () {});
  });

  // 페이지 편집기 임시저장 버리기: 카테고리 페이지 관리에서 반영하지 않은 편집을 지우면 여기서 다시 게시할 수 있어요
  function discardDraft() {
    var n = (model.draft && model.draft.changes ? model.draft.changes.length : 0) + (model.draft && model.draft.more || 0);
    ask('인사교 라이프 페이지 편집기의 임시저장(' + (n ? n + '곳 바뀜' : '반영하지 않은 편집') + ')을 버릴까요?\n버리면 그 편집 내용은 되돌릴 수 없어요. 사이트에 이미 반영된 내용은 그대로예요.', { danger: true })
      .then(function (yes) {
        if (!yes) return;
        withBusy(request(DRAFT_API, { method: 'DELETE' })).then(function () {
          model.hasDraft = false; model.draft = null; render();
          toast('임시저장을 버렸어요. 이제 게시할 수 있어요.');
        }, function () {});
      });
  }

  // 왼쪽 메뉴의 세부 카테고리를 누르면 페이지를 다시 열지 않고 탭만 바꾼다(작성 중인 카드 유지)
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-life-section]');
    if (!a || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    section = a.dataset.lifeSection;
    if (model) render(); else syncNav();
  });

  window.addEventListener('beforeunload', function (e) { if (edit && edit.dirty) { e.preventDefault(); e.returnValue = ''; } });
  load();
})();
