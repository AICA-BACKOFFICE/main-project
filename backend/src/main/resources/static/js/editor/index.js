/*
 * AICA 블록 에디터 — index: 공개 API 조립
 *   var ed = BlockEditor.mount(container, { input, toolbar, toolbar2(추가 서식 줄), tools(삽입 도구 줄), uploadUrl, recentUrl, onChange });
 *   ed.sync(); ed.getBlocks(); ed.setBlocks(arr); ed.appendBlocks(arr); ed.isEmpty(); ed.stats();
 *   BlockEditor.upload(file, url) -> Promise<{url,name}>  ·  BlockEditor.cleanInline(el)  ·  BlockEditor.htmlToBlocks(html)
 */
(function (BE) {
  'use strict';
  var need = ['Editor', 'cleanInline', 'upload', 'htmlToBlocks'];
  need.forEach(function (k) { if (!BE[k]) console.error('[BlockEditor] 모듈이 빠졌습니다: ' + k + ' — editor/*.js 로드 순서를 확인하세요 (core → blocks → render → input → dialogs → toolbar → image-editor → index)'); });
  var p = BE.Editor && BE.Editor.prototype;
  ['renderBlock', 'bindText', 'buildToolbar', 'openLinkDialog'].forEach(function (m) { if (!p || !p[m]) console.error('[BlockEditor] Editor.prototype.' + m + ' 이 없습니다 — editor/*.js 로드 순서를 확인하세요'); });
  BE.mount = function (container, opts) { return new BE.Editor(container, opts); };
})(window.BlockEditor = window.BlockEditor || {});
