/*
 * 미리보기 창 — 사이트(프론트오피스)에서 어떻게 보이는지 새 탭 대신 관리자 화면 위 창에서 보여 준다 (2026-10-14 사용자 요청)
 *   <a href="미리보기 주소" data-preview data-title="제목" data-edit="수정 주소">  → 누르면 창으로(Ctrl · 가운데 단추로 누르면 원래대로 새 탭)
 *   <button type="submit" formaction="…" formtarget="_blank" data-preview-submit>  → 폼 내용을 창 안으로 보내 미리보기(글쓰기 화면)
 *   PC · 모바일 폭을 바꿔 볼 수 있고, Esc · 바깥 · 닫기로 닫는다.
 */
(function (global) {
  'use strict';
  var FRAME = 'pv-frame';
  var box = null, frame, titleEl, editLink, tabLink, wrap, lastFocus = null;

  function build() {
    box = document.createElement('div');
    box.className = 'pv';
    box.hidden = true;
    box.innerHTML =
      '<div class="pv-bg" data-pv-close></div>'
      + '<div class="pv-sheet" role="dialog" aria-modal="true" aria-labelledby="pv-title">'
      + '<div class="pv-head">'
      + '<b id="pv-title" class="pv-title">미리보기</b>'
      + '<div class="pv-seg" role="group" aria-label="화면 폭">'
      + '<button type="button" data-pv-size="pc" aria-pressed="true">PC</button>'
      + '<button type="button" data-pv-size="mobile" aria-pressed="false">모바일</button></div>'
      + '<span class="pv-gap"></span>'
      + '<a class="btn ghost xs pv-edit" href="#">수정하기</a>'
      + '<a class="btn ghost xs pv-tab" href="#" target="_blank" rel="noopener">새 탭에서 열기 ↗</a>'
      + '<button type="button" class="pv-x" data-pv-close aria-label="미리보기 닫기">×</button>'
      + '</div>'
      + '<div class="pv-body"><div class="pv-wrap"><iframe name="' + FRAME + '" title="사이트 미리보기"></iframe></div></div>'
      + '</div>';
    document.body.appendChild(box);
    frame = box.querySelector('iframe');
    // 창 안(사이트 화면)을 누른 뒤에도 Esc로 닫히게. 사이트의 기수 기록 창이 열려 있으면 그 창이 먼저 닫혀요
    frame.addEventListener('load', function () {
      try {
        frame.contentWindow.addEventListener('keydown', function (e) {
          if (e.key === 'Escape' && !frame.contentDocument.querySelector('.cmodal.on')) close();
        });
      } catch (err) { /* 다른 주소면 무시 */ }
    });
    titleEl = box.querySelector('.pv-title');
    editLink = box.querySelector('.pv-edit');
    tabLink = box.querySelector('.pv-tab');
    wrap = box.querySelector('.pv-wrap');
    box.addEventListener('click', function (e) {
      if (e.target.closest('[data-pv-close]')) { close(); return; }
      var size = e.target.closest('[data-pv-size]');
      if (size) {
        var mobile = size.getAttribute('data-pv-size') === 'mobile';
        wrap.classList.toggle('is-mobile', mobile);
        box.querySelectorAll('[data-pv-size]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === size)); });
      }
    });
  }

  function open(opts) {
    if (!box) build();
    lastFocus = document.activeElement;
    titleEl.textContent = '미리보기' + (opts.title ? ' · ' + opts.title : '');
    editLink.hidden = !opts.edit;
    if (opts.edit) editLink.href = opts.edit;
    tabLink.hidden = !opts.url;
    if (opts.url) tabLink.href = opts.url;
    frame.src = opts.url || 'about:blank';
    box.hidden = false;
    document.documentElement.classList.add('pv-lock');
    box.querySelector('.pv-x').focus();
  }

  function close() {
    if (!box || box.hidden) return;
    box.hidden = true;
    frame.src = 'about:blank';
    document.documentElement.classList.remove('pv-lock');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && box && !box.hidden) close(); });
  // 창이 열려 있는 동안 Tab으로 뒤의 화면에 초점이 가지 않게
  document.addEventListener('focusin', function (e) {
    if (box && !box.hidden && !box.contains(e.target)) box.querySelector('.pv-x').focus();
  });

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    // 목록 · 대시보드의 미리보기 링크
    var a = e.target.closest('a[data-preview]');
    if (a) {
      e.preventDefault();
      open({ url: a.href, title: a.getAttribute('data-title') || '', edit: a.getAttribute('data-edit') || '' });
      return;
    }
    // 글쓰기 화면의 미리보기 단추: 쓰고 있는 내용을 창 안으로 보냄
    var b = e.target.closest('button[data-preview-submit]');
    if (b && b.form) {
      e.preventDefault();
      var title = b.form.querySelector('[name="title"]');
      open({ title: title ? title.value.trim() : '' });
      b.formTarget = FRAME;
      try { b.form.requestSubmit(b); } finally { b.formTarget = '_blank'; }
    }
  });

  global.PreviewModal = { open: open, close: close };
})(window);
