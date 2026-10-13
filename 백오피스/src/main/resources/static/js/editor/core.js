/*
 * AICA 블록 에디터 — core: 상수 · DOM 유틸 · CSRF/토스트 · 선택 영역 · 인라인 HTML 정화 · 이미지 축소/업로드 · URL 검증
 *
 * 로드 순서: core → blocks → render → input → dialogs → toolbar → image-editor → index (editor.html 의 <script> 순서와 같아야 한다)
 * 블록 JSON 형식은 서버 editor/BlockContent.java · 프론트 front/blocks.html 과 같다:
 *   heading{level,html} paragraph{align,html} image{url,alt,caption,width,align,link} quote{html}
 *   list{style,items[]} divider{} table{rows[][]} code{lang,code}
 */
(function (BE, global) {
  'use strict';
  

  var FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];
  var COLORS = ['#111827', '#6b7280', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777'];
  var BG_COLORS = ['transparent', '#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#e9d5ff', '#fed7aa', '#e5e7eb'];
  var TEXT_TYPES = { paragraph: 1, heading: 1, quote: 1, list: 1, table: 1 };
  /** 선택 가능한 글꼴 — 서버 BlockContent.FONT_FAMILIES · 프론트/편집기 <head> 의 Google Fonts 링크와 같은 목록 */
  var FONTS = [
    ['', '기본서체'],
    ['Nanum Gothic', '나눔고딕'],
    ['Nanum Myeongjo', '나눔명조'],
    ['Gowun Dodum', '고운돋움'],
    ['Gowun Batang', '고운바탕'],
    ['Do Hyeon', '도현'],
    ['Nanum Pen Script', '나눔손글씨 펜']
  ];
  var FONT_OK = {}; FONTS.forEach(function (f) { if (f[0]) FONT_OK[f[0]] = f[1]; });
  function fontName(v) { return (v || '').split(',')[0].trim().replace(/^["']|["']$/g, '').trim(); }

  /* ---------- 유틸 ---------- */
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'on') Object.keys(attrs.on).forEach(function (ev) { e.addEventListener(ev, attrs.on[ev]); });
      else if (k === 'style') e.style.cssText = attrs[k];
      else if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function csrf() { return (typeof global.csrfHeaders === 'function') ? global.csrfHeaders() : {}; }
  function toast(msg, err) { if (typeof global.notify === 'function') global.notify(msg, err); else console.log(msg); }
  function saveRange() { var s = window.getSelection(); return s && s.rangeCount ? s.getRangeAt(0).cloneRange() : null; }
  function restoreRange(r) { if (!r) return; var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }

  var MAX_UPLOAD = 10 * 1024 * 1024;      // 서버 제한과 동일
  var RESIZE_OVER = 1.5 * 1024 * 1024;    // 이보다 크면 업로드 전에 줄인다
  var MAX_EDGE = 2000;                    // 긴 변 최대 픽셀

  /** 큰 사진은 브라우저에서 먼저 줄인다 (긴 변 2000px, JPEG 품질 0.86). 실패하면 원본 그대로. */
  function prepareImage(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return Promise.resolve(file);
    if (file.size <= 300 * 1024) return Promise.resolve(file);
    return new Promise(function (resolve) {
      var img = new Image();
      var objUrl = URL.createObjectURL(file);
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
          if (scale === 1 && file.size <= RESIZE_OVER) { URL.revokeObjectURL(objUrl); resolve(file); return; }
          var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch;
          var ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, cw, ch);
          var keepPng = file.type === 'image/png' && file.size <= 4 * 1024 * 1024;   // 작은 PNG 는 투명도 유지
          var outType = keepPng ? 'image/png' : 'image/jpeg';
          canvas.toBlob(function (blob) {
            URL.revokeObjectURL(objUrl);
            if (!blob || blob.size >= file.size) { resolve(file); return; }
            var name = file.name.replace(/\.[^.]+$/, '') + (outType === 'image/png' ? '.png' : '.jpg');
            resolve(new File([blob], name, { type: outType, lastModified: Date.now() }));
          }, outType, 0.86);
        } catch (e) { URL.revokeObjectURL(objUrl); resolve(file); }
      };
      img.onerror = function () { URL.revokeObjectURL(objUrl); resolve(file); };
      img.src = objUrl;
    });
  }

  function upload(file, url) {
    return prepareImage(file).then(function (f) {
      // 이미지는 10MB, 그 밖(동영상·문서)은 자산 관리 한도(200MB)까지 — 최종 판정은 서버(ImageStorageService)
      var isImg = /^image\//.test(f.type) || !/\.(mp4|m4v|mov|webm|pdf)$/i.test(f.name || '');
      var limit = isImg ? MAX_UPLOAD : 200 * 1024 * 1024;
      if (f.size > limit) throw new Error((isImg ? '이미지는 10MB' : '파일은 200MB') + ' 이하만 올릴 수 있습니다 (현재 ' + (f.size / 1024 / 1024).toFixed(1) + 'MB).');
      var fd = new FormData();
      fd.append('file', f, f.name);
      return fetch(url, { method: 'POST', body: fd, headers: csrf(), credentials: 'same-origin' })
        .catch(function () { throw new Error('서버에 연결하지 못했습니다. 서버가 실행 중인지, 파일이 너무 크지 않은지 확인하세요.'); })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (body) {
            if (r.status === 401 || r.status === 403) throw new Error('로그인이 만료됐습니다. 새로고침 후 다시 로그인하세요.');
            if (!r.ok) throw new Error(body.message || ('업로드 실패 (' + r.status + ')'));
            return body;
          });
        });
    });
  }

  /* ---------- 인라인 HTML 정리 ---------- */
  var INLINE_OK = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, BR: 1, SPAN: 1, A: 1, SUB: 1, SUP: 1, MARK: 1 };
  var STYLE_OK = { 'color': 1, 'background-color': 1, 'font-size': 1, 'font-family': 1, 'font-weight': 1, 'font-style': 1, 'text-decoration': 1, 'text-decoration-line': 1 };
  var REL_SIZE = { 'x-small': '12px', 'small': '14px', 'medium': '16px', 'large': '18px', 'x-large': '24px', 'xx-large': '32px', 'xxx-large': '48px', '-webkit-xxx-large': '48px' };
  function normalizeSize(v) { v = (v || '').trim(); if (/^\d+(\.\d+)?(px|rem|em)$/.test(v)) return v; return REL_SIZE[v] || ''; }
  function cleanInline(root) {
    var out = document.createElement('div');
    function unwrapInto(target, node) { Array.prototype.slice.call(node.childNodes).forEach(function (c) { walk(c, target); }); }
    function walk(n, target) {
      if (n.nodeType === 3) { target.appendChild(document.createTextNode(n.nodeValue)); return; }
      if (n.nodeType !== 1) return;
      var tag = n.tagName;
      if (tag === 'DIV' || tag === 'P' || tag === 'LI') {
        if (target.childNodes.length) target.appendChild(document.createElement('br'));
        unwrapInto(target, n); return;
      }
      if (tag === 'FONT') {
        var sp = document.createElement('span');
        if (n.getAttribute('color')) sp.style.color = n.getAttribute('color');
        if (n.getAttribute('face') && FONT_OK[fontName(n.getAttribute('face'))]) sp.style.fontFamily = "'" + fontName(n.getAttribute('face')) + "'";
        if (n.style && n.style.fontSize) sp.style.fontSize = n.style.fontSize;
        if (n.style && n.style.backgroundColor) sp.style.backgroundColor = n.style.backgroundColor;
        unwrapInto(sp, n);
        if (sp.style.cssText) target.appendChild(sp); else unwrapInto(target, sp);
        return;
      }
      if (!INLINE_OK[tag]) { unwrapInto(target, n); return; }
      var c = document.createElement(tag === 'STRONG' ? 'b' : tag === 'EM' ? 'i' : tag === 'STRIKE' ? 's' : tag.toLowerCase());
      if (tag === 'A') { c.setAttribute('href', n.getAttribute('href') || '#'); c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener noreferrer'); }
      if (tag === 'SPAN' || tag === 'A') {
        var kept = [];
        for (var i = 0; i < n.style.length; i++) {
          var prop = n.style[i];
          if (STYLE_OK[prop]) {
            var v = n.style.getPropertyValue(prop);
            if (prop === 'font-size') v = normalizeSize(v);
            if (prop === 'font-family') v = FONT_OK[fontName(v)] ? "'" + fontName(v) + "'" : '';
            if (prop === 'background-color' && (v === 'transparent' || v === 'rgba(0, 0, 0, 0)')) v = '';
            if (v) kept.push(prop + ': ' + v);
          }
        }
        if (kept.length) c.setAttribute('style', kept.join('; ') + ';');
        else if (tag === 'SPAN') { unwrapInto(target, n); return; }
      }
      unwrapInto(c, n);
      target.appendChild(c);
    }
    Array.prototype.slice.call(root.childNodes).forEach(function (c) { walk(c, out); });
    while (out.lastChild && out.lastChild.nodeType === 1 && out.lastChild.tagName === 'BR') out.removeChild(out.lastChild);
    return out.innerHTML.replace(/&nbsp;/g, ' ').trim();
  }

  function hasFiles(dt) { return dt && dt.types && Array.prototype.indexOf.call(dt.types, 'Files') >= 0; }
  function imageFiles(dt) {
    var out = [];
    if (!dt) return out;
    var files = dt.files && dt.files.length ? dt.files : null;
    if (!files && dt.items) {
      files = [];
      for (var i = 0; i < dt.items.length; i++) { var f = dt.items[i].kind === 'file' ? dt.items[i].getAsFile() : null; if (f) files.push(f); }
    }
    if (!files) return out;
    for (var j = 0; j < files.length; j++) { if (files[j] && /^image\//.test(files[j].type)) out.push(files[j]); }
    return out;
  }

  /** 캐럿이 편집 영역의 맨 앞/맨 뒤에 있는지 */
  function caretAt(text, where) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
    var r = sel.getRangeAt(0);
    if (!text.contains(r.startContainer)) return false;
    var probe = document.createRange();
    probe.selectNodeContents(text);
    if (where === 'start') { probe.setEnd(r.startContainer, r.startOffset); return probe.toString().length === 0; }
    probe.setStart(r.endContainer, r.endOffset);
    return probe.toString().replace(/\n$/, '').length === 0;
  }

  function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* ----- 링크 대화상자 ----- */
  function validUrl(v) {
    try {
      var u = new URL(v);
      if (u.username || u.password) return false;
      return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:';
    } catch (e) { return false; }
  }
  function anchorOfSelection(root) {
    var sel = window.getSelection(); if (!sel || !sel.rangeCount) return null;
    var n = sel.getRangeAt(0).commonAncestorContainer;
    if (n.nodeType === 3) n = n.parentNode;
    var a = n && n.closest ? n.closest('a[href]') : null;
    return a && root.contains(a) ? a : null;
  }

  /* ---------- 공개: 다른 모듈이 쓰는 공용 함수·상수 ---------- */
  BE.FONT_SIZES = FONT_SIZES; BE.COLORS = COLORS; BE.BG_COLORS = BG_COLORS; BE.TEXT_TYPES = TEXT_TYPES; BE.FONTS = FONTS; BE.FONT_OK = FONT_OK;
  BE.el = el; BE.csrf = csrf; BE.toast = toast; BE.saveRange = saveRange; BE.restoreRange = restoreRange;
  BE.escapeHtml = escapeHtml; BE.fontName = fontName; BE.normalizeSize = normalizeSize; BE.cleanInline = cleanInline;
  BE.prepareImage = prepareImage; BE.upload = upload; BE.validUrl = validUrl; BE.anchorOfSelection = anchorOfSelection;
  BE.hasFiles = hasFiles; BE.imageFiles = imageFiles; BE.caretAt = caretAt;
})(window.BlockEditor = window.BlockEditor || {}, window);
