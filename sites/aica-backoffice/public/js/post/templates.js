/*
 * 글쓰기 화면 — 템플릿 패널 (우측, 불러오기 전용): 목록 카드 · 불러오기(본문+레이아웃 적용) / 뒤에 추가(본문만)
 * 생성·수정·삭제는 템플릿 관리 화면(/admin/templates). 서버: template/PostTemplateController (/admin/templates/api JSON)
 */
(function (global) {
  'use strict';
  var P = global.PostEditorPage = global.PostEditorPage || {};
  P.modules = P.modules || [];
  P.modules.push(function (ctx, cfg) {
    var form = ctx.form, titleEl = ctx.titleEl, editor = ctx.editor, markDirty = ctx.markDirty, esc = ctx.esc;
    var templatesUrl = cfg.templatesUrl;
    var PRESETS = { basic: '기본 1단', wide: '넓게 1단', hero: '히어로', magazine: '매거진', 'side-left': '좌 사이드바', 'side-right': '우 사이드바' };
    var tplPanel = document.getElementById('templatePanel');
    var tplList = document.getElementById('templateList');
    var tplCount = document.getElementById('templateCount');
    function tplHeaders() { var h = csrfHeaders(); h['Content-Type'] = 'application/json'; return h; }
    function tplFetch(url, opts) {
      return fetch(url, Object.assign({ credentials: 'same-origin' }, opts || {})).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          if (!r.ok) throw new Error(body.message || ('요청 실패 (' + r.status + ')'));
          return body;
        });
      });
    }
    function openTemplates() { tplPanel.hidden = false; document.body.classList.add('ed-side-open'); loadTemplates(); }
    function closeTemplates() { tplPanel.hidden = true; document.body.classList.remove('ed-side-open'); }
    document.getElementById('btnTemplate').addEventListener('click', function () { if (tplPanel.hidden) openTemplates(); else closeTemplates(); });
    document.getElementById('templateClose').addEventListener('click', closeTemplates);
    function loadTemplates() {
      tplList.innerHTML = '<div class="ed-side-empty">불러오는 중…</div>';
      tplFetch(templatesUrl).then(function (list) {
        tplCount.textContent = '총 ' + list.length + '개';
        tplList.innerHTML = '';
        if (!list.length) { tplList.innerHTML = '<div class="ed-side-empty">저장된 템플릿이 없습니다.<br>템플릿 관리에서 레이아웃과 본문 뼈대를 만들어 두세요.</div>'; return; }
        list.forEach(function (t) {
          var card = document.createElement('div'); card.className = 'tpl-card';
          card.innerHTML =
            (t.thumbnailUrl ? '<img class="tpl-thumb" src="' + esc(t.thumbnailUrl) + '" alt="">' : '<div class="tpl-thumb tpl-thumb-empty">' + esc((t.name || '?').charAt(0)) + '</div>') +
            '<div class="tpl-body">' +
            '  <div class="tpl-cat">' + esc(PRESETS[t.layoutPreset] || '기본 1단') + (t.categoryName ? ' · ' + esc(t.categoryName) : '') + '</div>' +
            '  <div class="tpl-name">' + esc(t.name) + '</div>' +
            '  <div class="tpl-prev">' + esc(t.preview || (t.titleHint || '')) + '</div>' +
            '  <div class="tpl-meta">블록 ' + t.blockCount + ' · ' + esc(t.updatedAt || '') + (t.creatorName ? ' · ' + esc(t.creatorName) : '') + '</div>' +
            '  <div class="tpl-actions">' +
            '    <button type="button" class="be-btn pri" data-act="use">불러오기</button>' +
            '    <button type="button" class="be-btn" data-act="append">뒤에 추가</button>' +
            '  </div>' +
            '</div>';
          card.addEventListener('click', function (e) {
            var act = e.target.getAttribute && e.target.getAttribute('data-act'); if (!act) return;
            if (act === 'use') applyTemplate(t, false);
            else if (act === 'append') applyTemplate(t, true);
          });
          tplList.appendChild(card);
        });
      }).catch(function (e) { tplList.innerHTML = '<div class="ed-side-empty">' + esc(e.message) + '</div>'; });
    }
    function applyTemplate(t, append) {
      tplFetch(templatesUrl + '/' + t.id).then(function (full) {
        var hasContent = titleEl.value.trim() || !editor.isEmpty();
        if (!append && hasContent && !window.confirm('현재 작성 중인 제목·본문을 "' + full.name + '" 템플릿 내용으로 바꿀까요?\n레이아웃(화면 구성)도 템플릿대로 바뀝니다.\n(뒤에 이어 붙이려면 취소 후 "뒤에 추가"를 누르세요)')) return;
        if (append) {
          editor.appendBlocks(full.blocks || []);
        } else {
          editor.setBlocks(full.blocks || []);
          if (full.titleHint && !titleEl.value.trim()) titleEl.value = full.titleHint;
          if (full.categoryId) { if (ctx.setCategory) ctx.setCategory(full.categoryId, ''); else form.querySelector('[name="categoryId"]').value = full.categoryId; }
          // 템플릿의 레이아웃을 이 글에 적용 (기본 레이아웃이면 비움)
          var layoutEl = ctx.layoutEl || document.getElementById('layoutJson');
          if (layoutEl) { layoutEl.value = full.layoutJson || ''; layoutEl.dispatchEvent(new Event('layout:external')); }
        }
        markDirty();
        notify('템플릿 "' + full.name + '"' + (append ? '을(를) 뒤에 추가했습니다.' : '을(를) 불러왔습니다.'));
        closeTemplates();
      }).catch(function (e) { notify(e.message, true); });
    }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !tplPanel.hidden) closeTemplates(); });

  });
})(window);
