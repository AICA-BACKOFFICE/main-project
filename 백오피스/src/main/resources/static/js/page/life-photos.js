/*
 * 게시물 관리 › 인사교 라이프 게시물 관리 (templates/page/life-photos.html)
 *   세 탭: 시설 사진(층 › 공간 사진 넘김) · 오늘 점심, 여기 어때요?(식당 · 카페 카드) · 수업 끝나고, 바람 쐬러 가요(문화 · 여가 카드)
 *   새로 올리기 · 고치기 · 순서 · 지우기를 하고 '저장'을 누르면 바꾼 것만 보내고, 서버(LifePhotoService · LifeTipService)가
 *   사이트 파일(life/index.html)의 그 목록만 고쳐 반영한다. 사진은 브라우저에서 긴 변 1920px · WEBP로 줄여 올린다.
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
  var model = null, floor = null, foodKind = 'food', busy = false;
  var section = /^(fac|food|fun)$/.test(root.dataset.section || '') ? root.dataset.section : 'fac';
  var dirty = { spaces: {}, food: false, fun: {} };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function toast(msg, err) { if (window.notify) window.notify(msg, err); else alert(msg); }
  function spaces() { var out = []; model.floors.forEach(function (f) { f.spaces.forEach(function (s) { out.push(s); }); }); return out; }
  function spaceById(id) { return spaces().filter(function (s) { return s.id === id; })[0]; }
  function funGroup(k) { return model.fun.filter(function (g) { return g.k === k; })[0]; }
  function isDirty() { return Object.keys(dirty.spaces).length > 0 || dirty.food || Object.keys(dirty.fun).length > 0; }
  function sectionDirty(k) { return k === 'fac' ? Object.keys(dirty.spaces).length > 0 : k === 'food' ? dirty.food : Object.keys(dirty.fun).length > 0; }
  function mark(on) { return on ? ' <i class="lp-mark" title="저장 안 한 변경">●</i>' : ''; }

  // 보안 토큰은 보낼 때마다 새로 읽어요(다시 로그인하면 admin.js 의 로그인 확인이 새 토큰을 넣어 줌).
  // 로그인이 풀렸으면(관리자 서버를 다시 켠 뒤 등) 화면 위에 안내를 띄우고, 그사이 다시 로그인돼 있으면 한 번 더 보내요.
  function request(url, opts, retried) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    opts.credentials = 'same-origin';
    if (opts.method && opts.method !== 'GET') opts.headers[meta('_csrf_header') || 'X-CSRF-TOKEN'] = meta('_csrf');
    return fetch(url, opts).catch(function () {
      if (window.BOSession) window.BOSession.check();
      throw new Error('관리자 서버에 연결하지 못했어요. 서버(백오피스.cmd 창)가 켜져 있는지 확인해 주세요.');
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

  function load() {
    request(API).then(function (m) { model = m; floor = floor || m.defaultFloor || (m.floors[0] && m.floors[0].g); dirty = { spaces: {}, food: false, fun: {} }; render(); })
      .catch(function (e) { root.innerHTML = '<div class="alert error">' + esc(e.message) + '</div>'; });
  }

  // ── 그리기 ──
  function render() {
    var h = '';
    if (model.hasDraft) h += window.draftNoteHtml(model.draft, '인사교 라이프', EDITOR);
    h += '<div class="lp-sections" role="tablist" aria-label="고칠 곳">' + SECTIONS.map(function (s) {
      return '<button type="button" role="tab" class="lp-section" data-section="' + s[0] + '" aria-selected="' + (section === s[0]) + '">' + esc(s[1]) + mark(sectionDirty(s[0])) + '</button>';
    }).join('') + '</div>';
    var link = FRONT + SECTIONS.filter(function (s) { return s[0] === section; })[0][2];
    h += '<div class="lp-bar"><div class="lp-floors" role="tablist">' + leftTabs() + '</div>'
      + '<div class="lp-top-r"><span class="lp-state" id="lpState"></span><a class="btn ghost sm" href="' + esc(link) + '" target="_blank" rel="noopener">사이트에서 보기 ↗</a>'
      + '<button class="btn primary" type="button" id="lpSave">저장</button></div></div>';
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
        var n = f.spaces.some(function (s) { return dirty.spaces[s.id]; });
        return '<button type="button" role="tab" class="lp-floor" data-floor="' + esc(f.g) + '" aria-selected="' + (f.g === floor) + '"><b>' + esc(f.floor) + '</b> ' + esc(f.name) + mark(n) + '</button>';
      }).join('');
    }
    if (section === 'food') {
      return [['food', '식당'], ['cafe', '카페']].map(function (k) {
        var n = model.food.filter(function (f) { return f.t === k[0]; }).length;
        return '<button type="button" role="tab" class="lp-floor" data-kind="' + k[0] + '" aria-selected="' + (foodKind === k[0]) + '"><b>' + k[1] + '</b> ' + n + '곳</button>';
      }).join('');
    }
    return '';
  }

  // 시설 사진
  function spaceHtml(s) {
    var max = model.maxPhotos || 12;
    return '<section class="card lp-space" data-space="' + esc(s.id) + '">'
      + '<div class="lp-space-h"><h3>' + esc(s.name) + ' <span class="muted">사진 ' + s.photos.length + '장</span>' + mark(dirty.spaces[s.id]) + '</h3></div>'
      + '<div class="lp-grid">' + s.photos.map(function (p, i) { return photoHtml(s, p, i); }).join('')
      + (s.photos.length < max ? '<label class="lp-add" title="여러 장을 한 번에 고를 수 있어요"><span>＋ 새 사진 올리기</span><small>여러 장 한 번에 · 가로 사진 권장</small>'
        + '<input type="file" accept="image/*" multiple data-act="add" hidden></label>' : '<div class="lp-add is-full"><span>사진은 ' + max + '장까지예요</span></div>')
      + '</div></section>';
  }
  function photoHtml(s, p, i) {
    var size = SIZES.some(function (z) { return z[0] === (p.bs || ''); }) ? SIZES : SIZES.concat([[p.bs, p.bs + ' 확대']]);
    var m = /^(\d{1,3})% (\d{1,3})%$/.exec(p.bp || '');
    var dot = m ? '<i class="lp-dot" style="left:' + m[1] + '%;top:' + m[2] + '%"></i>' : '';
    return '<div class="lp-photo" data-i="' + i + '">'
      + '<div class="lp-img" data-act="focus" title="사진에서 가운데에 보일 곳을 눌러요" style="background-image:url(&quot;' + esc(p.url) + '&quot;);background-size:' + esc(p.bs || 'cover') + ';background-position:' + esc(p.bp || 'center') + '">'
      + '<span class="lp-no">' + (i + 1) + (i === 0 ? ' · 대표' : '') + '</span>' + (p.src ? '<span class="lp-new">올린 사진</span>' : '') + dot + '</div>'
      + '<input class="input lp-cap" data-act="caption" maxlength="60" placeholder="사진 설명 (예: 강의실 전경)" value="' + esc(p.caption) + '">'
      + '<div class="lp-tools">'
      + '<button type="button" class="btn ghost xs" data-act="left" title="앞으로"' + (i === 0 ? ' disabled' : '') + '>◀</button>'
      + '<button type="button" class="btn ghost xs" data-act="right" title="뒤로"' + (i === s.photos.length - 1 ? ' disabled' : '') + '>▶</button>'
      + '<select class="select lp-size" data-act="size" title="확대">' + size.map(function (z) { return '<option value="' + esc(z[0]) + '"' + ((p.bs || '') === z[0] ? ' selected' : '') + '>' + esc(z[1]) + '</option>'; }).join('') + '</select>'
      + '<label class="btn ghost xs" title="이 사진을 다른 사진으로">바꾸기<input type="file" accept="image/*" data-act="replace" hidden></label>'
      + '<button type="button" class="btn danger xs" data-act="del"' + (s.photos.length < 2 ? ' disabled title="공간마다 사진이 한 장은 있어야 해요"' : '') + '>삭제</button>'
      + '</div></div>';
  }

  // 오늘 점심, 여기 어때요?
  function field(label, control, wide) { return '<label class="lp-field' + (wide ? ' wide' : '') + '"><span>' + label + '</span>' + control + '</label>'; }
  function foodHtml() {
    var cards = [];
    model.food.forEach(function (f, i) { if (f.t === foodKind) cards.push(i); });
    var label = foodKind === 'cafe' ? '카페' : '식당';
    return '<section class="card lp-space"><div class="lp-space-h"><h3>' + label + ' <span class="muted">' + cards.length + '곳 · 사이트에 이 순서대로 보여요</span>' + mark(dirty.food) + '</h3>'
      + '<button type="button" class="btn ghost sm" data-act="food-add">＋ 새 ' + label + ' 추가</button></div>'
      + '<div class="lp-grid lp-grid-wide">' + cards.map(function (i, pos) { return foodCard(model.food[i], i, pos, cards.length); }).join('') + '</div></section>';
  }
  function foodCard(f, i, pos, total) {
    var photo = f.src
      ? '<div class="lp-img lp-img-food" style="background-image:url(&quot;' + esc(f.url) + '&quot;)"><span class="lp-new">올린 사진</span></div>'
      : '<div class="lp-img lp-img-food lp-noimg"><span>사진 준비 중</span></div>';
    var solo = f.t === 'cafe' ? '혼자 가기 편해요' : '혼밥하기 편해요';
    return '<div class="lp-photo lp-card" data-food="' + i + '">' + photo
      + '<div class="lp-tools"><label class="btn ghost xs">' + (f.src ? '사진 바꾸기' : '사진 올리기') + '<input type="file" accept="image/*" data-act="food-photo" hidden></label>'
      + (f.src ? '<button type="button" class="btn ghost xs" data-act="food-nophoto">사진 빼기</button>' : '') + '</div>'
      + field('이름', '<input class="input" data-f="name" maxlength="40" placeholder="가게 이름" value="' + esc(f.name) + '">', true)
      + field('분류', '<input class="input" data-f="category" maxlength="12" placeholder="예: 한식" value="' + esc(f.category) + '">')
      + field('걸어서', '<span class="lp-unit"><input class="input" type="number" min="1" max="120" data-f="w" value="' + esc(f.w == null ? '' : f.w) + '">분</span>')
      + field('메뉴 · 위치', '<input class="input" data-f="menu" maxlength="80" placeholder="예: 국밥 · 동명동" value="' + esc(f.menu) + '">', true)
      + field('누구랑', '<select class="select" data-f="g"><option value="solo"' + (f.g === 'solo' ? ' selected' : '') + '>' + solo + '</option><option value="group"' + (f.g === 'group' ? ' selected' : '') + '>여럿이 가기 좋아요</option></select>', true)
      + field('선배 후기 <em>(선택)</em>', '<textarea class="input lp-ta" data-f="review" rows="2" maxlength="200" placeholder="한두 문장">' + esc(f.review) + '</textarea>'
        + (f.example ? '<small class="lp-ex">지금은 ‘예시’ 후기예요. 고쳐서 저장하면 ‘예시’ 표시가 빠져요.</small>' : ''), true)
      + '<div class="lp-tools">'
      + '<button type="button" class="btn ghost xs" data-act="food-left" title="앞으로"' + (pos === 0 ? ' disabled' : '') + '>◀</button>'
      + '<button type="button" class="btn ghost xs" data-act="food-right" title="뒤로"' + (pos === total - 1 ? ' disabled' : '') + '>▶</button>'
      + '<button type="button" class="btn danger xs" data-act="food-del"' + (total < 2 ? ' disabled title="한 곳은 있어야 해요"' : '') + '>삭제</button></div></div>';
  }

  // 수업 끝나고, 바람 쐬러 가요
  function funGroupHtml(g) {
    var max = model.maxFun || 10;
    return '<section class="card lp-space" data-fun="' + esc(g.k) + '"><div class="lp-space-h"><h3>' + esc(g.title) + ' <span class="muted">' + g.cards.length + '곳 · ' + esc(g.sub) + '</span>' + mark(dirty.fun[g.k]) + '</h3>'
      + (g.cards.length < max ? '<button type="button" class="btn ghost sm" data-act="fun-add">＋ 새 장소 추가</button>' : '') + '</div>'
      + '<div class="lp-grid lp-grid-wide">' + g.cards.map(function (c, i) { return funCard(c, i, g.cards.length); }).join('') + '</div></section>';
  }
  function funCard(c, i, total) {
    var photo = c.url
      ? '<div class="lp-img lp-img-fun" style="background-image:url(&quot;' + esc(c.url) + '&quot;)">' + (c.src ? '<span class="lp-new">올린 사진</span>' : '') + '</div>'
      : '<div class="lp-img lp-img-fun lp-noimg"><span>사진을 올려 주세요</span></div>';
    return '<div class="lp-photo lp-card" data-i="' + i + '">' + photo
      + '<div class="lp-tools"><label class="btn ghost xs">' + (c.url ? '사진 바꾸기' : '사진 올리기') + '<input type="file" accept="image/*" data-act="fun-photo" hidden></label></div>'
      + field('이름', '<input class="input" data-f="name" maxlength="40" placeholder="장소 이름" value="' + esc(c.name) + '">', true)
      + field('거리', '<input class="input" data-f="distance" maxlength="40" placeholder="예: 동쪽 · 약 1km" value="' + esc(c.distance) + '">')
      + field('요금', '<input class="input" data-f="fee" maxlength="30" placeholder="예: 무료" value="' + esc(c.fee) + '">')
      + field('설명', '<textarea class="input lp-ta" data-f="summary" rows="3" maxlength="200" placeholder="한두 문장">' + esc(c.summary) + '</textarea>', true)
      + '<div class="lp-tools">'
      + '<button type="button" class="btn ghost xs" data-act="fun-left" title="앞으로"' + (i === 0 ? ' disabled' : '') + '>◀</button>'
      + '<button type="button" class="btn ghost xs" data-act="fun-right" title="뒤로"' + (i === total - 1 ? ' disabled' : '') + '>▶</button>'
      + '<button type="button" class="btn danger xs" data-act="fun-del"' + (total < 2 ? ' disabled title="한 곳은 있어야 해요"' : '') + '>삭제</button></div></div>';
  }

  function syncBar() {
    var save = document.getElementById('lpSave'), st = document.getElementById('lpState');
    if (!save) return;
    save.disabled = busy || !isDirty() || model.hasDraft;
    st.textContent = busy ? '처리 중…' : isDirty() ? '저장 안 한 변경이 있어요' : '';
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
    return promise.then(function (v) { busy = false; syncBar(); return v; }, function (e) { busy = false; syncBar(); toast(e.message, true); });
  }
  function move(list, i, j) { if (j < 0 || j >= list.length) return false; var t = list[i]; list[i] = list[j]; list[j] = t; return true; }

  // ── 조작 ──
  root.addEventListener('click', function (e) {
    var t = e.target.closest('[data-section],[data-floor],[data-kind],[data-act]');
    // 화면 전체 칸(#lifePhotos)에도 지금 탭(data-section)이 적혀 있어서, 그 칸 자체가 잡히면 탭을 누른 것으로 오해해 다시 그려요.
    // 그러면 '새 사진 올리기' · '바꾸기'처럼 누르는 순간 칸이 바뀌어 고른 사진이 들어오지 않고, 글자 칸도 눌러 쓸 수 없었어요. 화면 전체 칸은 건너뜀
    if (!t || t === root || !root.contains(t) || t.disabled || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;
    if (t.dataset.section) { section = t.dataset.section; render(); return; }
    if (t.dataset.floor) { floor = t.dataset.floor; render(); return; }
    if (t.dataset.kind) { foodKind = t.dataset.kind; render(); return; }
    var act = t.dataset.act;
    if (act === 'discard-draft') { discardDraft(); return; }
    // 먹거리
    if (/^food-/.test(act)) {
      var fc = t.closest('[data-food]'), fi = fc ? Number(fc.dataset.food) : -1;
      if (act === 'food-add') {
        model.food.push({ t: foodKind, g: 'solo', w: 5, category: '', name: '', menu: '', review: '', example: false, src: '', url: '' });
        dirty.food = true; render();
        var names = root.querySelectorAll('[data-food] [data-f="name"]'); if (names.length) names[names.length - 1].focus();
      } else if (act === 'food-left' || act === 'food-right') {
        var same = []; model.food.forEach(function (f, k) { if (f.t === foodKind) same.push(k); });
        var p = same.indexOf(fi), q = act === 'food-left' ? p - 1 : p + 1;
        if (q < 0 || q >= same.length) return;
        var tmp = model.food[same[p]]; model.food[same[p]] = model.food[same[q]]; model.food[same[q]] = tmp;
        dirty.food = true; render();
      } else if (act === 'food-del') {
        if (!confirm('‘' + (model.food[fi].name || '이름 없는 곳') + '’을(를) 목록에서 지울까요? (저장해야 사이트에 반영돼요)')) return;
        model.food.splice(fi, 1); dirty.food = true; render();
      } else if (act === 'food-nophoto') {
        model.food[fi].src = ''; model.food[fi].url = ''; dirty.food = true; render();
      }
      return;
    }
    // 문화 · 여가
    if (/^fun-/.test(act)) {
      var g = funGroup(t.closest('[data-fun]').dataset.fun), card = t.closest('[data-i]'), ci = card ? Number(card.dataset.i) : -1;
      if (act === 'fun-add') {
        g.cards.push({ name: '', distance: '', fee: '', summary: '', cls: '', src: '', url: '' });
        dirty.fun[g.k] = true; render();
        var ns = root.querySelectorAll('[data-fun="' + g.k + '"] [data-f="name"]'); if (ns.length) ns[ns.length - 1].focus();
      } else if (act === 'fun-left' || act === 'fun-right') {
        if (move(g.cards, ci, act === 'fun-left' ? ci - 1 : ci + 1)) { dirty.fun[g.k] = true; render(); }
      } else if (act === 'fun-del') {
        if (!confirm('‘' + (g.cards[ci].name || '이름 없는 곳') + '’을(를) 목록에서 지울까요? (저장해야 사이트에 반영돼요)')) return;
        g.cards.splice(ci, 1); dirty.fun[g.k] = true; render();
      }
      return;
    }
    // 시설 사진
    var sec = t.closest('[data-space]'); if (!sec) return;
    var s = spaceById(sec.dataset.space), photo = t.closest('[data-i]'), i = photo ? Number(photo.dataset.i) : -1;
    if (act === 'left' || act === 'right') {
      if (move(s.photos, i, act === 'left' ? i - 1 : i + 1)) { dirty.spaces[s.id] = true; render(); }
    } else if (act === 'del') {
      if (s.photos.length < 2) return;
      if (!confirm('이 사진을 이 공간에서 뺄까요? (저장해야 사이트에 반영돼요)')) return;
      s.photos.splice(i, 1); dirty.spaces[s.id] = true; render();
    } else if (act === 'focus') {
      var r = t.getBoundingClientRect();
      var x = Math.round(Math.min(100, Math.max(0, (e.clientX - r.left) / r.width * 100)));
      var y = Math.round(Math.min(100, Math.max(0, (e.clientY - r.top) / r.height * 100)));
      s.photos[i].bp = x + '% ' + y + '%'; dirty.spaces[s.id] = true; render();
    }
  });

  // 글자 칸: 다시 그리지 않고 값만(입력 중 커서 유지)
  root.addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset.act === 'caption') {
      var s = spaceById(t.closest('[data-space]').dataset.space);
      s.photos[Number(t.closest('[data-i]').dataset.i)].caption = t.value;
      t.classList.toggle('invalid', !t.value.trim());
      dirty.spaces[s.id] = true; syncBar(); return;
    }
    var f = t.dataset.f; if (!f || f === 'g') return;
    var fc = t.closest('[data-food]');
    if (fc) { model.food[Number(fc.dataset.food)][f] = f === 'w' ? (t.value === '' ? null : Number(t.value)) : t.value; dirty.food = true; syncBar(); return; }
    var fg = t.closest('[data-fun]');
    if (fg) { funGroup(fg.dataset.fun).cards[Number(t.closest('[data-i]').dataset.i)][f] = t.value; dirty.fun[fg.dataset.fun] = true; syncBar(); }
  });

  root.addEventListener('change', function (e) {
    var t = e.target, act = t.dataset.act;
    if (t.dataset.f === 'g') { model.food[Number(t.closest('[data-food]').dataset.food)].g = t.value; dirty.food = true; syncBar(); return; }
    if (act === 'size') {
      var sz = spaceById(t.closest('[data-space]').dataset.space);
      sz.photos[Number(t.closest('[data-i]').dataset.i)].bs = t.value; dirty.spaces[sz.id] = true; render(); return;
    }
    if (act !== 'add' && act !== 'replace' && act !== 'food-photo' && act !== 'fun-photo') return;
    var files = Array.prototype.slice.call(t.files || []); t.value = '';
    if (!files.length) return;
    if (act === 'food-photo') {
      var fi = Number(t.closest('[data-food]').dataset.food);
      withBusy(upload(files[0], 'food').then(function (p) { model.food[fi].src = p.src; model.food[fi].url = p.url; dirty.food = true; render(); }));
      return;
    }
    if (act === 'fun-photo') {
      var g = funGroup(t.closest('[data-fun]').dataset.fun), ci = Number(t.closest('[data-i]').dataset.i);
      withBusy(upload(files[0], 'fun-' + g.k).then(function (p) { var c = g.cards[ci]; c.src = p.src; c.url = p.url; c.cls = ''; dirty.fun[g.k] = true; render(); }));
      return;
    }
    var s = spaceById(t.closest('[data-space]').dataset.space);
    if (act === 'add') {
      var room = (model.maxPhotos || 12) - s.photos.length;
      if (files.length > room) { toast('이 공간에는 ' + room + '장만 더 올릴 수 있어서 앞의 ' + room + '장만 올려요.', true); files = files.slice(0, room); }
      withBusy(files.reduce(function (p, f) {
        return p.then(function () { return upload(f, 'facility-' + s.id).then(function (ph) { s.photos.push({ cls: '', src: ph.src, bs: '', bp: '', caption: s.name + ' 사진', url: ph.url }); dirty.spaces[s.id] = true; render(); }); });
      }, Promise.resolve()).then(function () { toast('사진을 올렸어요. 설명을 고친 뒤 ‘저장’을 누르면 사이트에 반영돼요.'); }));
    } else {
      var i = Number(t.closest('[data-i]').dataset.i), old = s.photos[i];
      withBusy(upload(files[0], 'facility-' + s.id).then(function (ph) { s.photos[i] = { cls: '', src: ph.src, bs: '', bp: '', caption: old.caption, url: ph.url }; dirty.spaces[s.id] = true; render(); }));
    }
  });

  // 임시저장 버리기: 페이지 편집기에서 반영하지 않은 편집을 지우면 여기서 다시 저장할 수 있어요(여기서 고치던 것은 그대로)
  function discardDraft() {
    var n = (model.draft && model.draft.changes ? model.draft.changes.length : 0) + (model.draft && model.draft.more || 0);
    if (!confirm('인사교 라이프 페이지 편집기의 임시저장(' + (n ? n + '곳 바뀜' : '반영하지 않은 편집') + ')을 버릴까요?\n버리면 그 편집 내용은 되돌릴 수 없어요. 사이트에 이미 반영된 내용은 그대로예요.')) return;
    withBusy(request(DRAFT_API, { method: 'DELETE' }).then(function () {
      model.hasDraft = false; model.draft = null; render();
      toast('임시저장을 버렸어요. 이제 저장할 수 있어요.');
    }));
  }

  // ── 저장: 바꾼 것만 ──
  function check() {
    var need = [];
    Object.keys(dirty.spaces).forEach(function (id) { var s = spaceById(id); if (s.photos.some(function (p) { return !String(p.caption || '').trim(); })) need.push(s.name + ' 사진 설명'); });
    if (dirty.food) model.food.forEach(function (f) {
      var who = f.name || ((f.t === 'cafe' ? '카페' : '식당') + ' 새 카드');
      if (!String(f.name || '').trim()) need.push(who + ' 이름');
      if (!String(f.category || '').trim()) need.push(who + ' 분류');
      if (!String(f.menu || '').trim()) need.push(who + ' 메뉴 · 위치');
      if (!(f.w >= 1 && f.w <= 120)) need.push(who + ' 걸어서 몇 분');
    });
    Object.keys(dirty.fun).forEach(function (k) {
      funGroup(k).cards.forEach(function (c) {
        var who = c.name || '새 장소';
        ['name', 'distance', 'fee', 'summary'].forEach(function (f) { if (!String(c[f] || '').trim()) need.push(who + ' ' + { name: '이름', distance: '거리', fee: '요금', summary: '설명' }[f]); });
        if (!c.url) need.push(who + ' 사진');
      });
    });
    return need;
  }
  root.addEventListener('click', function (e) {
    if (!e.target.closest('#lpSave')) return;
    var need = check();
    if (need.length) { toast('빈칸을 채워 주세요: ' + need.slice(0, 4).join(', ') + (need.length > 4 ? ' 외 ' + (need.length - 4) + '곳' : ''), true); return; }
    var body = { baseHash: model.hash, spaces: Object.keys(dirty.spaces).map(function (id) {
      var s = spaceById(id);
      return { id: s.id, badge: s.badge || '', photos: s.photos.map(function (p) { return { cls: p.cls || '', src: p.src || '', bs: p.bs || '', bp: p.bp || '', caption: p.caption }; }) };
    }) };
    if (dirty.food) body.food = model.food.map(function (f) { return { t: f.t, g: f.g, w: f.w, category: f.category, name: f.name, menu: f.menu, review: f.review, example: !!f.example, src: f.src || '' }; });
    if (Object.keys(dirty.fun).length) body.fun = Object.keys(dirty.fun).map(function (k) {
      return { k: k, cards: funGroup(k).cards.map(function (c) { return { name: c.name, distance: c.distance, fee: c.fee, summary: c.summary, cls: c.cls || '', src: c.src || '' }; }) };
    });
    withBusy(request(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (m) {
      model = m; dirty = { spaces: {}, food: false, fun: {} }; render();
      toast(m.saved ? '저장했어요. 사이트의 인사교 라이프에 반영됐어요.' : '바뀐 내용이 없어요.');
    }));
  });

  // 왼쪽 메뉴의 세부 카테고리를 누르면 페이지를 다시 열지 않고 탭만 바꾼다(저장 안 한 변경 유지)
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-life-section]');
    if (!a || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    section = a.dataset.lifeSection;
    if (model) render(); else syncNav();
  });

  window.addEventListener('beforeunload', function (e) { if (model && isDirty()) { e.preventDefault(); e.returnValue = ''; } });
  load();
})();
