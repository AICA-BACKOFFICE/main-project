/*
 * 글쓰기 화면 — 페이지 로직 (editor.html)
 *   자동 백업(localStorage)·복구 바, 글자 수, 변경 감지(나가기 경고), 공개 상태 ↔ 배너/버튼, 저장 버튼, 대표 이미지 업로드
 *   선배들의 이야기 양식은 post/story-form.js 가 PostEditorPage.register 로 붙는다.
 *   설정값은 editor.html 의 <div id="editorConfig" data-*> 로 전달된다.
 */
(function (global) {
  'use strict';
  var P = global.PostEditorPage = global.PostEditorPage || {};
  P.modules = P.modules || [];
  /** 다른 모듈이 등록: P.register(function (ctx, cfg) { ... }) */
  P.register = function (fn) { P.modules.push(fn); };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  P.init = function (cfg) {
    if (!cfg.uploadUrl) console.error('[PostEditorPage] 설정 누락: uploadUrl');
    var uploadUrl = cfg.uploadUrl, recentUrl = cfg.recentUrl, categoriesUrl = cfg.categoriesUrl;
    var postId = cfg.postId ? Number(cfg.postId) : null;
    var versionsUrl = cfg.versionsUrl || '';
    // 글 번호는 표마다 1번부터라(후기 1번 · 프로젝트 1번) 브라우저 백업 이름에 글 종류도 넣는다
    var draftKey = 'aica-draft-' + (cfg.postKind ? cfg.postKind + '-' : '') + (postId || 'new');
    var form = document.getElementById('postForm');
    var titleEl = form.querySelector('[name="title"]');
    var layoutEl = document.getElementById('layoutJson');
    var storyEl = document.getElementById('storyJson');   // 선배들의 이야기 고정 양식 값(post/story-form.js)
    var ctx_catSelect = null;
    var summaryEl = form.querySelector('[name="summary"]');
    var statusEl = form.querySelector('[name="status"]');
    var msg = document.getElementById('autosaveMsg');
    var dirty = false, timer = null;

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function now() { var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }

    // ---- 자동 저장(브라우저 로컬) ----
    function autosave() {
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          at: Date.now(), title: titleEl.value, summary: summaryEl.value,
          categoryId: form.querySelector('[name="categoryId"]').value, subCategoryId: form.querySelector('[name="subCategoryId"]').value, blocks: editor.getBlocks(),
          layout: layoutEl ? layoutEl.value : '', story: storyEl ? storyEl.value : ''
        }));
        msg.textContent = '브라우저에 백업됨 ' + now() + ' · 서버 저장은 임시저장/완료';
      } catch (e) { /* 저장 공간 부족 등은 무시 */ }
      dirty = false;
    }
    var statsEl = document.getElementById('edStats');
    function fingerprint() {
      return JSON.stringify([titleEl.value, summaryEl.value, form.querySelector('[name="categoryId"]').value, form.querySelector('[name="subCategoryId"]').value, editor.getBlocks(), layoutEl ? layoutEl.value : '', storyEl ? storyEl.value : '']);
    }
    function refreshStats() {
      if (!statsEl) return;
      var st = editor.stats();
      statsEl.textContent = st.chars.toLocaleString() + '자' + (st.images ? ' · 이미지 ' + st.images : '') + ' · 블록 ' + st.blocks;
    }
    var savedPrint = null;
    function markDirty() {
      dirty = true;
      msg.textContent = '변경사항 있음 · 잠시 후 브라우저에 백업';
      clearTimeout(timer);
      timer = setTimeout(autosave, 3000);
      refreshStats();
    }

        var editor = BlockEditor.mount(document.getElementById('editor'), {
      input: form.querySelector('[name="blocksJson"]'),
      toolbar: document.getElementById('toolbar'),
      toolbar2: document.getElementById('toolbar2'),
      tools: document.getElementById('tools'),
      uploadUrl: uploadUrl, recentUrl: recentUrl, categoriesUrl: categoriesUrl,
      onChange: markDirty
    });
    titleEl.addEventListener('input', markDirty);
    summaryEl.addEventListener('input', markDirty);
    // 카테고리 → 세부 카테고리 연동 (category-select.js)
    var catSelect = window.CategorySelect ? CategorySelect.bind(form.querySelector('[name="categoryId"]'), form.querySelector('[name="subCategoryId"]'), { onChange: markDirty }) : null;
    ctx_catSelect = catSelect;
    savedPrint = fingerprint();
    refreshStats();

    // 복구 안내: 서버 내용보다 나중에 저장된 로컬 초안이 있을 때
    try {
      var saved = JSON.parse(localStorage.getItem(draftKey) || 'null');
      var serverEmpty = !titleEl.value && editor.isEmpty();
      if (saved && saved.blocks && (serverEmpty || postId) && (saved.title || saved.blocks.length)) {
        var when = new Date(saved.at);
        var bar = document.createElement('div');
        bar.className = 'ed-restore';
        bar.innerHTML = '저장하지 않은 초안이 있습니다 (' + pad(when.getMonth() + 1) + '/' + pad(when.getDate()) + ' ' + pad(when.getHours()) + ':' + pad(when.getMinutes()) + '). ' +
          '<button type="button" class="ed-btn ghost sm" id="restoreYes">불러오기</button> <button type="button" class="ed-btn ghost sm" id="restoreNo">삭제</button>';
        document.querySelector('.ed-col').prepend(bar);
        document.getElementById('restoreYes').addEventListener('click', function () {
          titleEl.value = saved.title || ''; summaryEl.value = saved.summary || '';
          if (saved.categoryId) form.querySelector('[name="categoryId"]').value = saved.categoryId;
          if (catSelect) catSelect.rebuild(saved.subCategoryId || '');
          if (layoutEl && saved.layout !== undefined) { layoutEl.value = saved.layout || ''; layoutEl.dispatchEvent(new Event('layout:external')); }
          if (storyEl && saved.story !== undefined) { storyEl.value = saved.story || ''; storyEl.dispatchEvent(new Event('story:external')); }
          editor.setBlocks(saved.blocks); bar.remove(); markDirty();
        });
        document.getElementById('restoreNo').addEventListener('click', function () { localStorage.removeItem(draftKey); bar.remove(); });
      }
    } catch (e) { /* ignore */ }

    // ---- 제출 공통 ----
    form.addEventListener('submit', function (e) {
      editor.sync(true);
      var isPreview = e.submitter && e.submitter.hasAttribute('formtarget');
      if (!isPreview) {
        if (!titleEl.value.trim()) { e.preventDefault(); titleEl.focus(); notify('제목을 입력하세요.', true); return; }
        try { localStorage.removeItem(draftKey); } catch (err) { /* ignore */ }
      }
    });

    // ---- 공개 상태 · 저장 버튼 ----
    var statusSel = document.getElementById('statusSelect');
    var canManageStatus = cfg.canManageStatus !== 'false';
    var banner = document.getElementById('statusBanner');
    var BANNER = {
      DRAFT: ['임시저장', '아직 게시되지 않은 콘텐츠입니다. 저장만으로 공개되지 않습니다.'],
      PUBLISHED: ['공개', '저장하면 프론트에 바로 게시됩니다.'],
      HIDDEN: ['미게시', '서버에 저장되지만 프론트에는 보이지 않습니다.']
    };
    function syncStatus() {
      var v = statusSel.value;
      statusEl.value = v;
      banner.setAttribute('data-status', v);
      document.getElementById('bannerLabel').textContent = BANNER[v][0];
      document.getElementById('bannerText').textContent = BANNER[v][1];
      document.getElementById('btnSave').textContent = v === 'PUBLISHED' && canManageStatus ? '발행' : '저장';
    }
    statusSel.value = statusEl.value || 'DRAFT';
    if (!statusSel.value) statusSel.value = 'DRAFT';
    syncStatus();
    if (!canManageStatus && statusSel.value !== 'DRAFT') {
      document.getElementById('btnDraft').textContent = '현재 상태로 저장';
      document.getElementById('btnDraft').title = '게시 상태를 유지하고 변경 내용을 저장합니다 (Ctrl+S)';
    }
    statusSel.addEventListener('change', function () { syncStatus(); markDirty(); });

    // 보내기 전에 로그인부터 확인해요. 관리자 서버를 다시 켜 로그인이 풀린 채 보내면 쓰던 글이 사라지니,
    // 풀렸으면 보내지 않고 화면 위에 '다시 로그인' 안내만 띄워요(다시 로그인한 뒤 저장을 한 번 더 누르면 돼요).
    function submitChecked() {
      if (!window.BOSession) { form.requestSubmit(); return; }
      window.BOSession.check().then(function (ok) {
        if (ok) form.requestSubmit();
        else notify('로그인이 풀려 아직 저장하지 않았어요. 화면 위 안내대로 다시 로그인한 뒤 한 번 더 눌러 주세요.', true);
      });
    }
    document.getElementById('btnDraft').addEventListener('click', function () {
      if (canManageStatus) statusSel.value = 'DRAFT';
      // 후기 분야 · 인터뷰 기수는 표가 꼭 받아야 하는 분류라 임시저장할 때도 확인(story-form.js)
      var storyNeed = P.storyMode && P.validateStory ? P.validateStory(statusSel.value) : '';
      if (storyNeed) { notify(storyNeed, true); return; }
      syncStatus();
      submitChecked();
    });
    document.getElementById('btnSave').addEventListener('click', function () {
      if (!titleEl.value.trim()) { titleEl.focus(); notify('제목을 입력하세요.', true); return; }
      if (P.storyMode) {
        var storyError = P.validateStory ? P.validateStory(statusSel.value) : '';
        if (storyError) { notify(storyError, true); return; }
      } else if (statusSel.value === 'PUBLISHED' && editor.isEmpty()) { notify('본문이 비어 있어 공개할 수 없습니다.', true); return; }
      syncStatus();
      submitChecked();
    });
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); document.getElementById('btnDraft').click(); }
    });

    // 대표 이미지
    function toggleThumb() {
      var m = document.querySelector('input[name="thumbnailMode"]:checked');
      document.getElementById('thumbManual').style.display = (m && m.value === 'MANUAL') ? '' : 'none';
    }
    document.querySelectorAll('input[name="thumbnailMode"]').forEach(function (r) { r.addEventListener('change', toggleThumb); });
    document.getElementById('thumbFile').addEventListener('change', function () {
      var file = this.files[0]; if (!file) return;
      BlockEditor.upload(file, uploadUrl).then(function (res) {
        form.querySelector('[name="thumbnailUrl"]').value = res.url;
        document.getElementById('thumbPreview').innerHTML = '<img src="' + res.url + '" alt="">';
      }).catch(function (e) { notify(e.message || '업로드에 실패했습니다.', true); });
      this.value = '';
    });
    document.getElementById('thumbClear').addEventListener('click', function () {
      form.querySelector('[name="thumbnailUrl"]').value = '';
      document.getElementById('thumbPreview').innerHTML = '';
    });

    // 나가기 경고
    var submitting = false;
    function setSubmitting(v) { submitting = v; }
    window.addEventListener('beforeunload', function (e) {
      if (submitting) return;
      var changed = false;
      try { changed = fingerprint() !== savedPrint; } catch (err) { changed = dirty; }
      if (changed) { e.preventDefault(); e.returnValue = ''; }
    });
    form.addEventListener('submit', function (e) { if (!(e.submitter && e.submitter.hasAttribute('formtarget'))) submitting = true; });


    var ctx = { form: form, titleEl: titleEl, summaryEl: summaryEl, statusEl: statusEl, editor: editor, storyEl: storyEl,
      markDirty: markDirty, esc: esc, setSubmitting: setSubmitting, postId: postId, layoutEl: layoutEl,
      setCategory: function (catId, subId) { form.querySelector('[name="categoryId"]').value = catId || ''; if (ctx_catSelect) ctx_catSelect.rebuild(subId || ''); } };
    P.ctx = ctx;
    P.modules.forEach(function (fn) { fn(ctx, cfg); });
    // 모듈(고정 양식 등)이 처음 값을 정리해 다시 쓰므로, 손대지 않았는데 '나가기' 경고가 뜨지 않도록 그 뒤 상태를 기준으로
    savedPrint = fingerprint();
  };
})(window);
