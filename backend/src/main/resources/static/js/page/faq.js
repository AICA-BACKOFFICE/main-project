/*
 * 게시물 관리 › 지원 전 Check FAQ 관리 (templates/faq/index.html)
 *   지원 전 체크 페이지의 자주 묻는 질문을 분류별로 보고 새로 쓰기 · 고치기 · 순서 바꾸기 · 삭제를 한다. 따로 '저장' 버튼은 없고
 *   하나를 마칠 때마다 바로 저장한다(서버 CheckFaqService → DB 표 faqs). 사이트는 공개 API로 질문을 받아 목록과 분류 칩의 질문 수를 그린다.
 *   - 새 질문: '완료'를 누르면 "게시하시겠습니까?" → 예 = 게시중(사이트에 바로) · 아니오 = 임시저장(사이트에 안 보임)
 *             '임시저장'을 누르면 묻지 않고 임시저장(관리 › 임시저장 목록에도 보임)
 *   - NEW: 최근 24시간 안에 새로 쓴 질문(서버가 model.newIds 로 알려 줌)
 *   - 고치기: '완료'를 누르면 바로 저장(상태는 고치는 칸에서 게시중 · 임시저장 · 미게시 중에 고름)
 *   - 삭제: "삭제하시겠습니까?" → 예 = 휴지통으로(휴지통에서 원래 자리로 복원) · 위 · 아래: 누르면 바로 순서 저장
 *   답은 굵게 · 링크만 쓸 수 있는 간단한 입력 칸(Enter는 줄바꿈, 붙여 넣으면 글자만).
 */
(function () {
  'use strict';
  var root = document.getElementById('faqAdmin');
  if (!root) return;
  var API = root.dataset.api, FRONT = root.dataset.front;
  var PER = 12;   // 한 화면에 질문 12개, 넘으면 1 · 2 … 페이지
  var meta = function (n) { var m = document.querySelector('meta[name="' + n + '"]'); return m ? m.getAttribute('content') : ''; };
  var model = null, items = [], filter = 'all', editing = -1, backup = null, busy = false, page = 0;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function toast(msg, err) { if (window.notify) window.notify(msg, err); else alert(msg); }
  function ask(message, opts) { return window.askYesNo ? window.askYesNo(message, opts) : Promise.resolve(window.confirm(message)); }
  function textOf(html) { var d = document.createElement('div'); d.innerHTML = String(html || '').replace(/<br\s*\/?>/gi, ' '); return d.textContent.replace(/\s+/g, ' ').trim(); }
  function statusOf(key) { return (model.statuses || []).filter(function (s) { return s.key === key; })[0] || { key: key, label: key, css: '' }; }
  function catLabel(key) { var c = model.categories.filter(function (x) { return x.key === key; })[0]; return c ? c.label : key; }
  function shown(i) { return filter === 'all' || items[i].cat === filter; }
  /** 고치는 칸에 아직 저장 안 한 글이 있는지(창을 닫을 때 묻기) */
  function editingChanged() {
    if (editing < 0) return false;
    var item = items[editing];
    return item.isNew ? Boolean(item.question || textOf(item.answer))
      : Boolean(backup) && (backup.cat !== item.cat || backup.question !== item.question || backup.answer !== item.answer || backup.status !== item.status);
  }

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

  function take(m) {
    model = m;
    items = m.items.map(function (i) { return { id: i.id, cat: i.cat, question: i.question, answer: i.answer, status: i.status || 'PUBLISHED' }; });
    editing = -1;
    backup = null;
    render();
  }
  function load() {
    return request(API).then(take).catch(function (e) { root.innerHTML = '<div class="alert error">' + esc(e.message) + '</div>'; });
  }

  // ── 그리기 ──
  function render() {
    var h = '';
    var counts = {};
    items.forEach(function (i) { if (!i.isNew) counts[i.cat] = (counts[i.cat] || 0) + 1; });
    var total = items.filter(function (i) { return !i.isNew; }).length;
    var chips = [{ key: 'all', label: '전체', n: total }].concat(model.categories.map(function (c) { return { key: c.key, label: c.label, n: counts[c.key] || 0 }; }));
    h += '<div class="fq-bar"><div class="fq-cats" role="tablist" aria-label="질문 분류">' + chips.map(function (c) {
      return '<button type="button" role="tab" class="fq-cat" data-filter="' + esc(c.key) + '" aria-selected="' + (filter === c.key) + '">' + esc(c.label) + '<em>' + c.n + '</em></button>';
    }).join('') + '</div>'
      + '<div class="fq-top-r"><span class="fq-state" id="fqState">' + (busy ? '저장하는 중…' : '') + '</span>'
      + '<a class="btn ghost sm" href="' + esc(FRONT) + '" target="_blank" rel="noopener">사이트에서 보기 ↗</a>'
      + '<button class="btn primary" type="button" data-act="add"' + (busy ? ' disabled' : '') + '>+ 새 질문</button></div></div>';
    var visible = [];
    items.forEach(function (item, i) { if (shown(i)) visible.push(i); });
    var pages = Math.max(1, Math.ceil(visible.length / PER));
    // 고치는 중인 질문이 있으면 그 질문이 있는 페이지를 보여 줘요
    if (editing >= 0 && visible.indexOf(editing) >= 0) page = Math.floor(visible.indexOf(editing) / PER);
    page = Math.min(Math.max(0, page), pages - 1);
    var rows = visible.slice(page * PER, (page + 1) * PER).map(function (i) { return i === editing ? formHtml(items[i], i) : rowHtml(items[i], i); });
    h += '<div class="card fq-list' + (busy ? ' is-busy' : '') + '">' + (rows.length ? rows.join('') : '<p class="fq-empty">이 분류에는 아직 질문이 없어요. ‘+ 새 질문’으로 추가해 보세요.</p>') + '</div>';
    if (pages > 1) {
      h += '<nav class="fq-pager" aria-label="질문 페이지">'
        + '<button type="button" class="btn xs" data-page="' + (page - 1) + '"' + (page === 0 ? ' disabled' : '') + ' aria-label="앞 페이지">‹</button>'
        + Array.from({ length: pages }, function (_, k) {
          return '<button type="button" class="btn xs fq-pn' + (k === page ? ' on' : '') + '" data-page="' + k + '"' + (k === page ? ' aria-current="page"' : '') + '>' + (k + 1) + '</button>';
        }).join('')
        + '<button type="button" class="btn xs" data-page="' + (page + 1) + '"' + (page === pages - 1 ? ' disabled' : '') + ' aria-label="다음 페이지">›</button>'
        + '<span class="fq-pinfo">' + visible.length + '개 중 ' + (page * PER + 1) + '–' + Math.min(visible.length, (page + 1) * PER) + '번째</span></nav>';
    }
    h += '<p class="fq-help">‘완료’ · ‘삭제’ · 위 · 아래를 누르면 바로 저장돼요. 사이트의 <b>지원 전 체크 › 자주 묻는 질문</b>에는 <b>게시중</b>인 질문만 보여요(임시저장 · 미게시는 여기에만). '
      + '삭제한 질문은 <b>휴지통</b>으로 가고, 휴지통에서 복원하면 원래 자리로 돌아와요.</p>';
    root.innerHTML = h;
    var focus = root.querySelector('.fq-row.is-editing [data-f="question"]');
    if (focus && !focus.value) focus.focus();
  }

  function rowHtml(item, i) {
    var st = statusOf(item.status), off = item.status !== 'PUBLISHED';
    return '<div class="fq-row' + (off ? ' is-off' : '') + '" data-i="' + i + '">'
      + '<span class="fq-no">' + (i + 1) + '</span>'
      + '<div class="fq-body"><div class="fq-q"><span class="badge fq-badge">' + esc(catLabel(item.cat)) + '</span>'
      + (off ? '<span class="badge ' + esc(st.css) + '" title="사이트에는 보이지 않아요">' + esc(st.label) + '</span>' : '')
      + '<b>Q</b> ' + esc(item.question)
      + ((model.newIds || []).indexOf(item.id) > -1 ? '<span class="new-mark" title="최근 24시간 안에 새로 쓴 질문">NEW</span>' : '') + '</div>'
      + '<div class="fq-a"><b>A</b> ' + esc(textOf(item.answer)) + '</div></div>'
      + '<div class="fq-tools">'
      + '<button class="btn xs" type="button" data-act="edit"' + (busy ? ' disabled' : '') + '>수정</button>'
      + '<button class="btn xs" type="button" data-act="up" title="위로"' + (busy ? ' disabled' : '') + '>↑</button>'
      + '<button class="btn xs" type="button" data-act="down" title="아래로"' + (busy ? ' disabled' : '') + '>↓</button>'
      + '<button class="btn xs danger" type="button" data-act="del"' + (busy ? ' disabled' : '') + '>삭제</button>'
      + '</div></div>';
  }

  function formHtml(item, i) {
    return '<div class="fq-row is-editing' + (item.isNew ? ' is-new' : '') + '" data-i="' + i + '">'
      + '<span class="fq-no">' + (item.isNew ? '새' : (i + 1)) + '</span>'
      + '<div class="fq-form">'
      + '<div class="fq-line"><label class="fq-field fq-field-cat"><span>분류</span><select class="select" data-f="cat">'
      + model.categories.map(function (c) { return '<option value="' + esc(c.key) + '"' + (c.key === item.cat ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('')
      + '</select></label>'
      // 새 질문은 '완료'를 누를 때 게시할지 물어요. 이미 있는 질문은 여기서 상태를 바꿔요
      + (item.isNew ? '' : '<label class="fq-field fq-field-status"><span>상태</span><select class="select" data-f="status">'
        + (model.statuses || []).map(function (s) { return '<option value="' + esc(s.key) + '"' + (s.key === item.status ? ' selected' : '') + '>' + esc(s.label) + '</option>'; }).join('')
        + '</select></label>')
      + '<label class="fq-field fq-field-q"><span>질문</span><input class="input" data-f="question" maxlength="' + model.limits.question + '" value="' + esc(item.question) + '" placeholder="예: 비전공자도 지원할 수 있나요?"></label></div>'
      + '<div class="fq-field"><span>답 <em>Enter는 줄바꿈 · 글자를 고른 뒤 굵게 · 링크를 누르면 그 부분만 바뀌어요</em></span>'
      + '<div class="fq-rte-tools"><button type="button" class="btn xs" data-rte="bold"><b>B</b> 굵게</button>'
      + '<button type="button" class="btn xs" data-rte="link">링크 넣기</button>'
      + '<button type="button" class="btn xs" data-rte="unlink">링크 빼기</button></div>'
      + '<div class="fq-rte" contenteditable="true" data-f="answer" role="textbox" aria-multiline="true" aria-label="답">' + item.answer + '</div></div>'
      + '<div class="fq-form-tools"><button class="btn primary sm" type="button" data-act="done"' + (busy ? ' disabled' : '') + '>완료</button>'
      + (item.isNew ? '<button class="btn sm" type="button" data-act="draft"' + (busy ? ' disabled' : '') + ' title="사이트에 올리지 않고 임시저장(관리 › 임시저장에서도 보여요)">임시저장</button>' : '')
      + '<button class="btn sm" type="button" data-act="cancel"' + (busy ? ' disabled' : '') + '>' + (item.isNew ? '쓰지 않기' : '취소') + '</button></div>'
      + '</div></div>';
  }

  // ── 저장(지금 목록 전체를 보내면 서버가 같은 질문은 고치고 · 새 질문은 더하고 · 빠진 질문은 휴지통으로) ──
  function persist(done) {
    busy = true;
    render();
    return request(API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseHash: model.hash, items: items.filter(function (i) { return !i.isNew; }).map(function (i) {
        return { id: i.id || null, cat: i.cat, question: i.question, answer: i.answer, status: i.status };
      }) })
    }).then(function (m) {
      busy = false;
      take(m);
      if (done) toast(done);
    }).catch(function (e) {
      busy = false;
      toast(e.message + ' 화면을 저장된 내용으로 다시 불러왔어요.', true);
      return load();
    });
  }

  // ── 고치기 ──
  // 고치던 질문 마치기: 질문 · 답이 비어 있으면 알려 주고 그대로 둡니다. 새 질문은 게시할지 물은 뒤(예 · 아니오), 분류의 맨 뒤에 넣고 바로 저장해요.
  function complete() {
    if (editing < 0) return;
    var item = items[editing];
    item.question = item.question.replace(/\s+/g, ' ').trim();
    if (!item.question) return toast('질문을 써 주세요.', true);
    if (!textOf(item.answer)) return toast('답을 써 주세요.', true);
    if (!item.isNew) {
      var changed = backup && (backup.cat !== item.cat || backup.question !== item.question || backup.answer !== item.answer || backup.status !== item.status);
      if (!changed) { editing = -1; backup = null; return render(); }
      placeInCategory(item, backup && backup.cat !== item.cat);
      return persist('저장했어요.' + (item.status === 'PUBLISHED' ? ' 사이트에도 바로 반영됐어요.' : ' (' + statusOf(item.status).label + ' — 사이트에는 안 보여요)'));
    }
    ask('새 질문을 게시하시겠습니까?\n‘예’를 누르면 사이트의 자주 묻는 질문에 바로 보이고, ‘아니오’를 누르면 임시저장돼요(사이트에는 안 보여요).').then(function (yes) {
      if (yes === null) return;   // 닫으면 계속 쓰기
      item.status = yes ? 'PUBLISHED' : 'DRAFT';
      delete item.isNew;
      placeInCategory(item, true);
      persist(yes ? '새 질문을 게시했어요. 사이트에 바로 반영됐어요.' : '새 질문을 임시저장했어요. 게시하려면 ‘수정’에서 상태를 게시중으로 바꿔 주세요.');
    });
  }
  /** 새 질문 '임시저장': 게시할지 묻지 않고 임시저장으로 바로 저장(사이트에는 안 보임) */
  function saveDraft() {
    if (editing < 0 || !items[editing].isNew) return;
    var item = items[editing];
    item.question = item.question.replace(/\s+/g, ' ').trim();
    if (!item.question) return toast('질문을 써 주세요.', true);
    if (!textOf(item.answer)) return toast('답을 써 주세요.', true);
    item.status = 'DRAFT';
    delete item.isNew;
    placeInCategory(item, true);
    persist('새 질문을 임시저장했어요. 관리 › 임시저장에서도 볼 수 있고, 게시하려면 ‘수정’에서 상태를 게시중으로 바꿔 주세요.');
  }

  /** 새 질문 · 분류를 바꾼 질문은 그 분류 질문들의 맨 뒤로 */
  function placeInCategory(item, move) {
    var from = items.indexOf(item);
    editing = -1;
    backup = null;
    if (!move) return;
    items.splice(from, 1);
    var last = -1;
    items.forEach(function (x, k) { if (x.cat === item.cat) last = k; });
    items.splice(last >= 0 ? last + 1 : items.length, 0, item);
    var vis = []; items.forEach(function (x, k) { if (shown(k)) vis.push(k); });
    var at = vis.indexOf(items.indexOf(item));
    if (at >= 0) page = Math.floor(at / PER);
  }
  function startEdit(i) {
    editing = i;
    backup = { cat: items[i].cat, question: items[i].question, answer: items[i].answer, status: items[i].status };
    render();
  }
  function cancelEdit() {
    if (editing < 0) return;
    if (items[editing].isNew) items.splice(editing, 1);
    else if (backup) { items[editing].cat = backup.cat; items[editing].question = backup.question; items[editing].answer = backup.answer; items[editing].status = backup.status; }
    editing = -1;
    backup = null;
    render();
  }
  function add() {
    if (items.length >= model.limits.items) return toast('질문은 ' + model.limits.items + '개까지 둘 수 있어요.', true);
    var cat = filter !== 'all' ? filter : model.categories[0].key;
    // 새 질문은 목록 맨 위(첫 페이지)에서 써요. ‘완료’를 누르면 게시할지 묻고, 고른 분류의 맨 뒤로 들어가요
    items.unshift({ cat: cat, question: '', answer: '', status: 'DRAFT', isNew: true });
    editing = 0;
    page = 0;
    backup = { cat: cat, question: '', answer: '', status: 'DRAFT' };
    render();
    var row = root.querySelector('.fq-row.is-editing');
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  // 위 · 아래: 지금 보고 있는 분류 안에서 바로 앞 · 뒤 질문과 자리를 바꾸고 바로 저장
  function move(i, step) {
    for (var j = i + step; j >= 0 && j < items.length; j += step) {
      if (shown(j)) {
        var target = items[i];
        items[i] = items[j]; items[j] = target;
        var vis = []; items.forEach(function (x, k) { if (shown(k)) vis.push(k); });
        var now = vis.indexOf(items.indexOf(target));
        if (now >= 0) page = Math.floor(now / PER);
        return persist('순서를 바꿨어요.');
      }
    }
  }
  function remove(i) {
    var item = items[i];
    ask('‘' + item.question + '’\n이 질문을 삭제하시겠습니까?\n삭제한 질문은 휴지통으로 가고, 휴지통에서 원래 자리로 복원할 수 있어요.', { danger: true }).then(function (yes) {
      if (!yes) return;
      var at = items.indexOf(item);
      if (at < 0) return;
      items.splice(at, 1);
      persist('삭제했어요. 휴지통으로 옮겼어요.');
    });
  }

  // ── 조작 ──
  root.addEventListener('click', function (e) {
    if (e.target.closest('[data-rte]')) return;   // 답 입력 칸 도구(아래에서)
    var chip = e.target.closest('[data-filter]');
    var pg = e.target.closest('[data-page]');
    var b = e.target.closest('[data-act]');
    if (!chip && !(pg && !pg.disabled) && !b) return;
    if (busy) return;
    var act = b ? b.dataset.act : '';
    // 고치는 중에는 그 질문부터 마쳐요('완료' 또는 '취소')
    if (editing >= 0 && act !== 'done' && act !== 'cancel' && act !== 'draft') {
      var row = root.querySelector('.fq-row.is-editing');
      if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return toast('고치던 질문을 먼저 ‘완료’하거나 ‘' + (items[editing].isNew ? '쓰지 않기' : '취소') + '’를 눌러 주세요.', true);
    }
    if (chip) {
      filter = chip.dataset.filter;
      page = 0;
      return render();
    }
    if (pg) {
      page = Number(pg.dataset.page);
      render();
      var list = root.querySelector('.fq-list'); if (list) list.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    var rowEl = b.closest('[data-i]');
    var i = rowEl ? Number(rowEl.dataset.i) : -1;
    if (act === 'add') add();
    else if (act === 'edit') startEdit(i);
    else if (act === 'done') complete();
    else if (act === 'draft') saveDraft();
    else if (act === 'cancel') cancelEdit();
    else if (act === 'up') move(i, -1);
    else if (act === 'down') move(i, 1);
    else if (act === 'del') remove(i);
  });
  root.addEventListener('input', function (e) {
    var f = e.target.closest('[data-f]');
    if (!f || editing < 0) return;
    if (f.dataset.f === 'question') items[editing].question = f.value;
    else if (f.dataset.f === 'answer') items[editing].answer = f.innerHTML;
  });
  root.addEventListener('change', function (e) {
    var f = e.target.closest('[data-f="cat"], [data-f="status"]');
    if (!f || editing < 0) return;
    items[editing][f.dataset.f] = f.value;
  });
  // 답 입력 칸: 굵게 · 링크 버튼은 고른 글자를 그대로 둔 채 누르게 하고, Enter는 줄바꿈, 붙여 넣기는 글자만.
  root.addEventListener('mousedown', function (e) { if (e.target.closest('[data-rte]')) e.preventDefault(); });
  root.addEventListener('click', function (e) {
    var b = e.target.closest('[data-rte]');
    if (!b) return;
    var box = root.querySelector('.fq-rte');
    if (!box) return;
    if (!box.contains(document.getSelection().anchorNode)) box.focus();
    if (b.dataset.rte === 'bold') document.execCommand('bold');
    else if (b.dataset.rte === 'unlink') document.execCommand('unlink');
    else if (b.dataset.rte === 'link') {
      var url = prompt('연결할 주소를 넣어 주세요.\n예: https://www.aica-gj.kr  또는  #schedule(같은 페이지의 모집 프로세스)');
      if (!url || !url.trim()) return;
      url = url.trim();
      if (/^\s*(javascript|data|vbscript):/i.test(url)) return toast('이 주소는 쓸 수 없어요.', true);
      var sel = document.getSelection();
      if (sel.isCollapsed) document.execCommand('insertHTML', false, '<a href="' + esc(url) + '">' + esc(url) + '</a>');
      else document.execCommand('createLink', false, url);
    }
    items[editing].answer = box.innerHTML;
  });
  root.addEventListener('keydown', function (e) {
    if (e.target.closest('.fq-rte') && e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      document.execCommand('insertLineBreak');
    } else if (e.target.closest('[data-f="question"]') && e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      var box = root.querySelector('.fq-rte');
      if (box) box.focus();
    }
  });
  root.addEventListener('paste', function (e) {
    if (!e.target.closest('.fq-rte')) return;
    e.preventDefault();
    var text = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    text.replace(/\r\n?/g, '\n').split('\n').forEach(function (line, n) {
      if (n) document.execCommand('insertLineBreak');
      if (line) document.execCommand('insertText', false, line);
    });
  });

  window.addEventListener('beforeunload', function (e) { if (busy || editingChanged()) { e.preventDefault(); e.returnValue = ''; } });
  load();
})();
