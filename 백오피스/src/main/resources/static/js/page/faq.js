/*
 * 게시물 관리 › 지원 전 Check FAQ 관리 (templates/faq/index.html)
 *   지원 전 체크 페이지의 자주 묻는 질문을 분류별로 보고, 새로 쓰기 · 고치기 · 순서 바꾸기 · 지우기를 한 뒤 '저장'을 누르면
 *   서버(CheckFaqService)가 DB에 저장하고, 사이트는 공개 API로 질문을 받아 목록과 분류 칩의 질문 수를 그린다.
 *   답은 굵게 · 링크만 쓸 수 있는 간단한 입력 칸(Enter는 줄바꿈, 붙여 넣으면 글자만).
 */
(function () {
  'use strict';
  var root = document.getElementById('faqAdmin');
  if (!root) return;
  var API = root.dataset.api, FRONT = root.dataset.front, EDITOR = root.dataset.editor, DRAFT_API = root.dataset.draftApi;
  var PER = 12;   // 한 화면에 질문 12개, 넘으면 1 · 2 … 페이지
  var meta = function (n) { var m = document.querySelector('meta[name="' + n + '"]'); return m ? m.getAttribute('content') : ''; };
  var model = null, items = [], original = '', filter = 'all', editing = -1, backup = null, busy = false, page = 0;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function toast(msg, err) { if (window.notify) window.notify(msg, err); else alert(msg); }
  function textOf(html) { var d = document.createElement('div'); d.innerHTML = String(html || '').replace(/<br\s*\/?>/gi, ' '); return d.textContent.replace(/\s+/g, ' ').trim(); }
  function snapshot() { return JSON.stringify(items.map(function (i) { return [i.cat, i.question, i.answer]; })); }
  function isDirty() { return Boolean(model) && snapshot() !== original; }
  function catLabel(key) { var c = model.categories.filter(function (x) { return x.key === key; })[0]; return c ? c.label : key; }
  function shown(i) { return filter === 'all' || items[i].cat === filter; }

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

  function take(m) {
    model = m;
    items = m.items.map(function (i) { return { id: i.id, cat: i.cat, question: i.question, answer: i.answer }; });
    original = snapshot();
    editing = -1;
    backup = null;
    render();
  }
  function load() {
    request(API).then(take).catch(function (e) { root.innerHTML = '<div class="alert error">' + esc(e.message) + '</div>'; });
  }

  // ── 그리기 ──
  function render() {
    var h = '';
    if (model.hasDraft) h += window.draftNoteHtml(model.draft, '지원 전 체크', EDITOR);
    var counts = {};
    items.forEach(function (i) { counts[i.cat] = (counts[i.cat] || 0) + 1; });
    var chips = [{ key: 'all', label: '전체', n: items.length }].concat(model.categories.map(function (c) { return { key: c.key, label: c.label, n: counts[c.key] || 0 }; }));
    h += '<div class="fq-bar"><div class="fq-cats" role="tablist" aria-label="질문 분류">' + chips.map(function (c) {
      return '<button type="button" role="tab" class="fq-cat" data-filter="' + esc(c.key) + '" aria-selected="' + (filter === c.key) + '">' + esc(c.label) + '<em>' + c.n + '</em></button>';
    }).join('') + '</div>'
      + '<div class="fq-top-r"><span class="fq-state" id="fqState"></span>'
      + '<a class="btn ghost sm" href="' + esc(FRONT) + '" target="_blank" rel="noopener">사이트에서 보기 ↗</a>'
      + '<button class="btn ghost" type="button" data-act="add">+ 새 질문</button>'
      + '<button class="btn primary" type="button" id="fqSave">저장</button></div></div>';
    var visible = [];
    items.forEach(function (item, i) { if (shown(i)) visible.push(i); });
    var pages = Math.max(1, Math.ceil(visible.length / PER));
    // 고치는 중인 질문이 있으면 그 질문이 있는 페이지를 보여 줘요
    if (editing >= 0 && visible.indexOf(editing) >= 0) page = Math.floor(visible.indexOf(editing) / PER);
    page = Math.min(Math.max(0, page), pages - 1);
    var rows = visible.slice(page * PER, (page + 1) * PER).map(function (i) { return i === editing ? formHtml(items[i], i) : rowHtml(items[i], i); });
    h += '<div class="card fq-list">' + (rows.length ? rows.join('') : '<p class="fq-empty">이 분류에는 아직 질문이 없어요. ‘+ 새 질문’으로 추가해 보세요.</p>') + '</div>';
    if (pages > 1) {
      h += '<nav class="fq-pager" aria-label="질문 페이지">'
        + '<button type="button" class="btn xs" data-page="' + (page - 1) + '"' + (page === 0 ? ' disabled' : '') + ' aria-label="앞 페이지">‹</button>'
        + Array.from({ length: pages }, function (_, k) {
          return '<button type="button" class="btn xs fq-pn' + (k === page ? ' on' : '') + '" data-page="' + k + '"' + (k === page ? ' aria-current="page"' : '') + '>' + (k + 1) + '</button>';
        }).join('')
        + '<button type="button" class="btn xs" data-page="' + (page + 1) + '"' + (page === pages - 1 ? ' disabled' : '') + ' aria-label="다음 페이지">›</button>'
        + '<span class="fq-pinfo">' + visible.length + '개 중 ' + (page * PER + 1) + '–' + Math.min(visible.length, (page + 1) * PER) + '번째</span></nav>';
    }
    h += '<p class="fq-help">저장하면 사이트의 <b>지원 전 체크 › 자주 묻는 질문</b>에 바로 반영돼요. 반영 전 페이지는 카테고리 페이지 관리 › 지원 전 체크의 ‘버전 기록’에 백업돼요.</p>';
    root.innerHTML = h;
    syncBar();
    var focus = root.querySelector('.fq-row.is-editing [data-f="question"]');
    if (focus && !focus.value) focus.focus();
  }

  function rowHtml(item, i) {
    return '<div class="fq-row" data-i="' + i + '">'
      + '<span class="fq-no">' + (i + 1) + '</span>'
      + '<div class="fq-body"><div class="fq-q"><span class="badge fq-badge">' + esc(catLabel(item.cat)) + '</span><b>Q</b> ' + esc(item.question) + '</div>'
      + '<div class="fq-a"><b>A</b> ' + esc(textOf(item.answer)) + '</div></div>'
      + '<div class="fq-tools">'
      + '<button class="btn xs" type="button" data-act="edit">수정</button>'
      + '<button class="btn xs" type="button" data-act="up" title="위로">↑</button>'
      + '<button class="btn xs" type="button" data-act="down" title="아래로">↓</button>'
      + '<button class="btn xs danger" type="button" data-act="del">삭제</button>'
      + '</div></div>';
  }

  function formHtml(item, i) {
    return '<div class="fq-row is-editing' + (item.isNew ? ' is-new' : '') + '" data-i="' + i + '">'
      + '<span class="fq-no">' + (item.isNew ? '새' : (i + 1)) + '</span>'
      + '<div class="fq-form">'
      + '<div class="fq-line"><label class="fq-field fq-field-cat"><span>분류</span><select class="select" data-f="cat">'
      + model.categories.map(function (c) { return '<option value="' + esc(c.key) + '"' + (c.key === item.cat ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('')
      + '</select></label>'
      + '<label class="fq-field fq-field-q"><span>질문</span><input class="input" data-f="question" maxlength="' + model.limits.question + '" value="' + esc(item.question) + '" placeholder="예: 비전공자도 지원할 수 있나요?"></label></div>'
      + '<div class="fq-field"><span>답 <em>Enter는 줄바꿈 · 글자를 고른 뒤 굵게 · 링크를 누르면 그 부분만 바뀌어요</em></span>'
      + '<div class="fq-rte-tools"><button type="button" class="btn xs" data-rte="bold"><b>B</b> 굵게</button>'
      + '<button type="button" class="btn xs" data-rte="link">링크 넣기</button>'
      + '<button type="button" class="btn xs" data-rte="unlink">링크 빼기</button></div>'
      + '<div class="fq-rte" contenteditable="true" data-f="answer" role="textbox" aria-multiline="true" aria-label="답">' + item.answer + '</div></div>'
      + '<div class="fq-form-tools"><button class="btn primary sm" type="button" data-act="done">완료</button>'
      + '<button class="btn sm" type="button" data-act="cancel">' + (item.isNew ? '쓰지 않기' : '고치기 전으로') + '</button></div>'
      + '</div></div>';
  }

  function syncBar() {
    var dirty = isDirty();
    var state = document.getElementById('fqState');
    if (state) state.textContent = busy ? '저장하는 중…' : dirty ? '저장 안 한 변경이 있어요' : '';
    var save = document.getElementById('fqSave');
    if (save) save.disabled = busy || !dirty || model.hasDraft;
  }

  // ── 고치기 ──
  // 고치던 질문 마치기: 질문 · 답이 비어 있으면 알려 주고 그대로 둡니다. 분류를 바꿨으면 그 분류 질문들의 맨 뒤로 옮깁니다.
  function finishEdit() {
    if (editing < 0) return true;
    var item = items[editing];
    item.question = item.question.replace(/\s+/g, ' ').trim();
    if (!item.question) { toast('질문을 써 주세요.', true); return false; }
    if (!textOf(item.answer)) { toast('답을 써 주세요.', true); return false; }
    var from = editing;
    editing = -1;
    var wasNew = Boolean(item.isNew);
    // 새 질문(목록 맨 위에서 씀)이나 분류를 바꾼 질문은 그 분류 질문들의 맨 뒤로
    if (wasNew || (backup && backup.cat !== item.cat)) {
      items.splice(from, 1);
      items.splice(items.some(function (x) { return x.cat === item.cat; }) ? lastOf(item.cat) + 1 : items.length, 0, item);
    }
    delete item.isNew;
    backup = null;
    if (wasNew) {
      var at = items.indexOf(item);
      var vis = []; items.forEach(function (x, k) { if (shown(k)) vis.push(k); });
      if (vis.indexOf(at) >= 0) page = Math.floor(vis.indexOf(at) / PER);
      toast('새 질문을 ‘' + catLabel(item.cat) + '’ 맨 뒤(' + (at + 1) + '번)에 넣었어요. ‘저장’을 눌러야 사이트에 반영돼요.');
    }
    return true;
  }
  function lastOf(cat) {
    for (var i = items.length - 1; i >= 0; i--) if (items[i].cat === cat) return i;
    return items.length - 1;
  }
  function startEdit(i) {
    if (editing === i) return;
    // 고치던 질문의 분류가 바뀌면 finishEdit 이 자리를 옮기므로, 누른 질문은 번호가 아니라 그 질문 자체로 다시 찾아요
    var target = items[i];
    if (!finishEdit()) return;
    i = items.indexOf(target);
    if (i < 0) return render();
    editing = i;
    backup = { cat: items[i].cat, question: items[i].question, answer: items[i].answer };
    render();
  }
  function cancelEdit() {
    if (editing < 0) return;
    if (items[editing].isNew) items.splice(editing, 1);
    else if (backup) { items[editing].cat = backup.cat; items[editing].question = backup.question; items[editing].answer = backup.answer; }
    editing = -1;
    backup = null;
    render();
  }
  function add() {
    if (!finishEdit()) return;
    if (items.length >= model.limits.items) return toast('질문은 ' + model.limits.items + '개까지 둘 수 있어요.', true);
    var cat = filter !== 'all' ? filter : model.categories[0].key;
    // 새 질문은 목록 맨 위(첫 페이지)에서 써요. ‘완료’를 누르면 고른 분류의 맨 뒤로 들어가요
    items.unshift({ cat: cat, question: '', answer: '', isNew: true });
    editing = 0;
    page = 0;
    backup = { cat: cat, question: '', answer: '' };
    render();
    var row = root.querySelector('.fq-row.is-editing');
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  // 위 · 아래: 지금 보고 있는 분류 안에서 바로 앞 · 뒤 질문과 자리를 바꿉니다.
  function move(i, step) {
    var target = items[i];
    if (!finishEdit()) return;
    i = items.indexOf(target);
    if (i < 0) return render();
    for (var j = i + step; j >= 0 && j < items.length; j += step) {
      if (shown(j)) {
        var t = items[i]; items[i] = items[j]; items[j] = t;
        break;
      }
    }
    var vis = []; items.forEach(function (x, k) { if (shown(k)) vis.push(k); });
    var now = vis.indexOf(items.indexOf(target));
    if (now >= 0) page = Math.floor(now / PER);
    render();
  }
  function remove(i) {
    var q = items[i].question || '새 질문';
    if (!confirm('‘' + q + '’ 질문을 지울까요? 저장을 눌러야 사이트에서 빠져요.')) return;
    if (editing === i) { editing = -1; backup = null; }
    else if (editing > i) editing--;
    items.splice(i, 1);
    render();
  }

  // 임시저장 버리기: 페이지 편집기에서 반영하지 않은 편집을 지우면 여기서 다시 저장할 수 있어요
  function discardDraft() {
    if (editing >= 0 && !finishEdit()) cancelEdit();   // 쓰다 만 새 질문은 접고
    var n = (model.draft && model.draft.changes ? model.draft.changes.length : 0) + (model.draft && model.draft.more || 0);
    if (!confirm('지원 전 체크 페이지 편집기의 임시저장(' + (n ? n + '곳 바뀜' : '반영하지 않은 편집') + ')을 버릴까요?\n버리면 그 편집 내용은 되돌릴 수 없어요. 사이트에 이미 반영된 내용은 그대로예요.')) return;
    busy = true; syncBar();
    request(DRAFT_API, { method: 'DELETE' }).then(function () { return request(API); }).then(function (m) {
      busy = false;
      var keep = items, keepOriginal = original;
      take(m);
      // 고치던 질문 목록은 그대로 두고 저장할 수 있게(사이트 파일은 그대로이므로 기준만 새로)
      if (keepOriginal === snapshot()) { items = keep; render(); }
      toast('임시저장을 버렸어요. 이제 저장할 수 있어요.');
    }).catch(function (e) { busy = false; syncBar(); toast(e.message, true); });
  }

  function save() {
    if (!finishEdit()) return;
    busy = true;
    render();
    request(API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // 질문 번호(id)도 보내요: DB에서 같은 질문은 고치고, 새 질문은 더하고, 빠진 질문은 지워요
      body: JSON.stringify({ baseHash: model.hash, items: items.map(function (i) { return { id: i.id || null, cat: i.cat, question: i.question, answer: i.answer }; }) })
    }).then(function (m) {
      busy = false;
      take(m);
      toast(m.saved ? '저장했어요. 사이트의 지원 전 체크 › 자주 묻는 질문에 반영됐어요.' : '바뀐 내용이 없어요.');
    }).catch(function (e) {
      busy = false;
      render();
      toast(e.message, true);
    });
  }

  // ── 조작 ──
  root.addEventListener('click', function (e) {
    var chip = e.target.closest('[data-filter]');
    if (chip) {
      if (!finishEdit()) return;
      filter = chip.dataset.filter;
      page = 0;
      return render();
    }
    var pg = e.target.closest('[data-page]');
    if (pg && !pg.disabled) {
      if (!finishEdit()) return;
      page = Number(pg.dataset.page);
      render();
      var list = root.querySelector('.fq-list'); if (list) list.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    if (e.target.closest('[data-act="discard-draft"]')) return discardDraft();
    if (e.target.closest('#fqSave')) return save();
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var row = b.closest('[data-i]');
    var i = row ? Number(row.dataset.i) : -1;
    var act = b.dataset.act;
    if (act === 'add') add();
    else if (act === 'edit') startEdit(i);
    else if (act === 'done') { if (finishEdit()) render(); }
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
    syncBar();
  });
  root.addEventListener('change', function (e) {
    var f = e.target.closest('[data-f="cat"]');
    if (!f || editing < 0) return;
    items[editing].cat = f.value;
    syncBar();
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
    syncBar();
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

  window.addEventListener('beforeunload', function (e) { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
  load();
})();
