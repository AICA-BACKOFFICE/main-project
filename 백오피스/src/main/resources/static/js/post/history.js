/*
 * 글쓰기 화면 — 버전 이력 다이얼로그: 목록 · 내용 보기 · 편집기에 불러오기 · 이 버전으로 복원(폼 POST)
 * 서버: post/version/PostVersionController (/admin/posts/{id}/versions)
 */
(function (global) {
  'use strict';
  var P = global.PostEditorPage = global.PostEditorPage || {};
  P.modules = P.modules || [];
  P.modules.push(function (ctx, cfg) {
    var form = ctx.form, titleEl = ctx.titleEl, summaryEl = ctx.summaryEl, editor = ctx.editor, markDirty = ctx.markDirty, esc = ctx.esc;
    var versionsUrl = cfg.versionsUrl || '';
    var histBtn = document.getElementById('btnHistory');
    if (histBtn) histBtn.addEventListener('click', openHistory);
    function renderBlocks(blocks) {
      return (blocks || []).map(function (b) {
        switch (b.type) {
          case 'heading': return '<h' + (b.level || 2) + '>' + b.html + '</h' + (b.level || 2) + '>';
          case 'paragraph': return '<p style="text-align:' + esc(b.align || 'left') + '">' + b.html + '</p>';
          case 'quote': return '<blockquote>' + b.html + '</blockquote>';
          case 'list': return '<' + (b.style === 'number' ? 'ol' : 'ul') + '>' + (b.items || []).map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</' + (b.style === 'number' ? 'ol' : 'ul') + '>';
          case 'image': return '<figure style="text-align:' + esc(b.align || 'center') + ';margin:8px 0"><img src="' + esc(b.url) + '" alt="' + esc(b.alt) + '" style="max-width:' + (b.width === 'small' ? '45%' : b.width === 'medium' ? '70%' : '100%') + '">' + (b.caption ? '<figcaption style="color:#888;font-size:12px">' + esc(b.caption) + '</figcaption>' : '') + '</figure>';
          case 'table': return '<table>' + (b.rows || []).map(function (r, ri) { return '<tr>' + r.map(function (c) { return ri === 0 ? '<th>' + c + '</th>' : '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
          case 'code': return '<pre>' + esc(b.code) + '</pre>';
          case 'divider': return '<hr>';
        }
        return '';
      }).join('');
    }
    function openHistory() {
      var overlay = document.createElement('div');
      overlay.className = 'be-picker ed-history';
      overlay.innerHTML =
        '<div class="box">' +
        '  <div class="hist-list"><div class="hist-head"><span>버전 이력</span><button type="button" class="be-btn" id="histClose">닫기</button></div><div id="histItems"><div class="hist-empty">불러오는 중…</div></div></div>' +
        '  <div class="hist-view" id="histView"><div class="hist-empty">왼쪽에서 버전을 선택하면 내용을 보여줍니다.<br><br>임시저장·완료(발행)할 때마다 이력이 남고, 발행 이력은 모두, 그 외는 최근 20개를 보관합니다.</div></div>' +
        '</div>';
      document.body.appendChild(overlay);
      function close() { overlay.remove(); document.removeEventListener('keydown', onKey); }
      function onKey(e) { if (e.key === 'Escape') close(); }
      document.addEventListener('keydown', onKey);
      overlay.querySelector('#histClose').addEventListener('click', close);
      overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
      var items = overlay.querySelector('#histItems'), view = overlay.querySelector('#histView');
      fetch(versionsUrl, { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (list) {
        items.innerHTML = '';
        if (!list.length) { items.innerHTML = '<div class="hist-empty">아직 저장된 이력이 없습니다.</div>'; return; }
        list.forEach(function (v, i) {
          var b = document.createElement('button');
          b.type = 'button'; b.className = 'hist-item';
          b.innerHTML = '<b>' + esc(v.title || '(제목 없음)') + '<span class="hist-tag ' + esc(v.reason) + '">' + esc(v.reasonLabel) + '</span></b><small>#' + v.id + ' · ' + esc(v.createdAt) + ' · ' + esc(v.creatorName || '') + ' · ' + esc(v.statusLabel) + '</small>';
          b.addEventListener('click', function () { show(v.id, b); });
          items.appendChild(b);
          if (i === 0) show(v.id, b);
        });
      }).catch(function () { items.innerHTML = '<div class="hist-empty">이력을 불러오지 못했습니다.</div>'; });
      function show(id, btn) {
        Array.prototype.forEach.call(items.querySelectorAll('.hist-item'), function (x) { x.classList.toggle('on', x === btn); });
        view.innerHTML = '<div class="hist-empty">불러오는 중…</div>';
        fetch(versionsUrl + '/' + id, { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (v) {
          view.innerHTML =
            '<div class="hist-meta">#' + v.id + ' · ' + esc(v.reasonLabel) + ' · ' + esc(v.createdAt) + ' · ' + esc(v.creatorName || '') + ' · 상태 ' + esc(v.statusLabel) + (v.categoryName ? ' · ' + esc(v.categoryName) : '') + '</div>' +
            '<h3 class="hist-title">' + esc(v.title) + '</h3>' +
            (v.summary ? '<div class="hist-meta">요약: ' + esc(v.summary) + '</div>' : '') +
            '<div class="hist-body">' + renderBlocks(v.blocks) + '</div>' +
            '<div class="hist-actions">' +
            '  <button type="button" class="be-btn" id="histLoad" title="저장하지 않고 편집기에만 불러옵니다">편집기에 불러오기</button>' +
            '  <button type="button" class="be-btn pri" id="histRestore" title="현재 내용을 백업으로 남기고 이 버전으로 되돌립니다">이 버전으로 복원</button>' +
            '</div>';
          view.querySelector('#histLoad').addEventListener('click', function () {
            titleEl.value = v.title || ''; summaryEl.value = v.summary || '';
            if (v.categoryId) form.querySelector('[name="categoryId"]').value = v.categoryId;
            editor.setBlocks(v.blocks || []); markDirty(); close();
            notify('버전 #' + v.id + ' 내용을 불러왔습니다. 임시저장 또는 완료를 눌러야 서버에 반영됩니다.');
          });
          view.querySelector('#histRestore').addEventListener('click', function () {
            if (!window.confirm('현재 내용을 "복원 전 백업"으로 남기고 버전 #' + v.id + ' (' + v.createdAt + ') 으로 되돌릴까요?\n공개 상태는 바뀌지 않습니다.')) return;
            var rf = document.getElementById('restoreForm');
            rf.action = versionsUrl + '/' + v.id + '/restore';
            var meta = document.querySelector('meta[name="_csrf"]');
            if (meta && meta.content) { var inp = document.createElement('input'); inp.type = 'hidden'; inp.name = '_csrf'; inp.value = meta.content; rf.appendChild(inp); }
            ctx.setSubmitting(true); rf.submit();
          });
        }).catch(function () { view.innerHTML = '<div class="hist-empty">버전을 불러오지 못했습니다.</div>'; });
      }
    }
  });
})(window);
