/*
 * AICA 블록 에디터 v2 (외부 의존성 없음)
 *
 * - 상단 도구 모음 하나가 현재 선택한 블록에 적용된다 (블록별 툴바 없음).
 * - 블록 배열(JSON)을 hidden input 에 기록한다. 서버 BlockContent.java / 프론트 front/blocks.html 과 같은 형식.
 *   heading{level,html} paragraph{align,html} image{url,alt,caption,width,align,link} quote{html}
 *   list{style,items[]} divider{} table{rows[][]} code{lang,code}
 *
 * v3: 링크 대화상자(주소 검증) · 서식 유지 붙여넣기(웹/워드 → 블록 분할) · "/" 블록 메뉴 · 마크다운 단축(#, >, -, 1., ---, ```)
 *     블록 복제 · 키보드 이동(Alt+↑/↓, Ctrl+Shift+D, ↑/↓ 블록 간 이동, Ctrl+K 링크) · 이미지 정렬/링크
 *
 * 사용:
 *   var ed = BlockEditor.mount(container, { input, toolbar, toolbar2(추가 서식 줄), tools(삽입 도구 줄), uploadUrl, recentUrl, onChange });
 *   ed.sync(); ed.getBlocks(); ed.setBlocks(arr); ed.isEmpty();
 *   BlockEditor.upload(file, url) -> Promise<{url,name}>
 */
(function (global) {
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
      if (f.size > MAX_UPLOAD) throw new Error('이미지는 10MB 이하만 올릴 수 있습니다 (현재 ' + (f.size / 1024 / 1024).toFixed(1) + 'MB).');
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

  /* ---------- 에디터 ---------- */
  function Editor(container, opts) {
    var self = this;
    this.container = container;
    this.opts = opts || {};
    this.input = opts.input;
    this.list = el('div', { 'class': 'be-list' });
    container.classList.add('be');
    container.appendChild(this.list);
    container.appendChild(el('div', { 'class': 'be-add', on: { click: function () { self.addBlock('paragraph', null); } } }, [
      el('span', { text: '+ 여기를 눌러 문단 추가 · 상단 도구로 이미지·표·인용 등 삽입' })
    ]));

    var initial = [];
    try { initial = JSON.parse(this.input && this.input.value ? this.input.value : '[]'); } catch (e) { initial = []; }
    this.setBlocks(initial, true);
    if (opts.toolbar) this.buildToolbar(opts.toolbar, opts.toolbar2 || null, opts.tools || null);

    document.addEventListener('selectionchange', function () { self.updateToolbarState(); });

    // 블록 단축키: Alt+↑/↓ 이동 · Ctrl+Shift+D 복제 · Ctrl+K 링크
    container.addEventListener('keydown', function (e) {
      var f = self.focused(); if (!f) return;
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); self.move(f, e.key === 'ArrowUp' ? -1 : 1); self.focusBlock(f); return; }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); self.duplicate(f); return; }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); self.savedRange = saveRange(); self.openLinkDialog(); return; }
      if (e.key === 'Escape' && self.slashMenu) { self.closeSlash(); }
    });
    // 본문 안의 링크 클릭 → 링크 편집 대화상자
    container.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('.be-text a[href]') : null;
      if (!a) return;
      e.preventDefault();
      var r = document.createRange(); r.selectNodeContents(a);
      restoreRange(r); self.savedRange = r.cloneRange();
      self.openLinkDialog(a);
    });

    // 클립보드에 이미지가 있으면 어디서든 붙여넣기로 삽입
    container.addEventListener('paste', function (e) {
      var files = imageFiles(e.clipboardData);
      if (files.length) { e.preventDefault(); e.stopPropagation(); self.insertImages(files); }
    }, true);
    // 본문 어디에나 이미지 파일을 끌어다 놓으면 그 위치에 삽입
    container.addEventListener('dragover', function (e) {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      container.classList.add('be-dropping');
      self.dropTarget = self.blockAtY(e.clientY);
      Array.prototype.forEach.call(self.list.children, function (c) { c.classList.toggle('drop-after', c === self.dropTarget); });
    });
    container.addEventListener('dragleave', function (e) {
      if (e.target === container) { container.classList.remove('be-dropping'); }
    });
    container.addEventListener('drop', function (e) {
      container.classList.remove('be-dropping');
      Array.prototype.forEach.call(self.list.children, function (c) { c.classList.remove('drop-after'); });
      var files = imageFiles(e.dataTransfer);
      if (!files.length) return;
      e.preventDefault(); e.stopPropagation();
      self.insertImages(files, self.dropTarget || null);
    }, true);
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

  /* ----- 상태 ----- */
  Editor.prototype.setBlocks = function (blocks, silent) {
    var self = this;
    this.list.innerHTML = '';
    if (!Array.isArray(blocks) || !blocks.length) blocks = [{ type: 'paragraph', align: 'left', html: '' }];
    blocks.forEach(function (b) { self.list.appendChild(self.renderBlock(b)); });
    this.sync(silent);
  };
  /** 블록들을 맨 뒤에 이어 붙인다 (템플릿 '뒤에 추가') */
  Editor.prototype.appendBlocks = function (blocks) {
    var self = this;
    // 마지막 블록이 빈 문단이면 그 자리부터
    var last = this.list.lastElementChild;
    if (last && last._block && last._block.type === 'paragraph') { var t = last.querySelector('.be-text'); if (t && !t.textContent.trim()) last.remove(); }
    (blocks || []).forEach(function (b) { self.list.appendChild(self.renderBlock(b)); });
    if (!this.list.children.length) this.list.appendChild(this.renderBlock(this.newBlock('paragraph')));
    this.changed();
  };
  Editor.prototype.isEmpty = function () {
    return this.getBlocks().length === 0;
  };
  Editor.prototype.changed = function () {
    this.sync();
    if (typeof this.opts.onChange === 'function') this.opts.onChange();
  };
  Editor.prototype.sync = function (silent) {
    if (this.input) this.input.value = JSON.stringify(this.getBlocks());
    if (!silent && typeof this.opts.onChange === 'function') this.opts.onChange();
  };

  /* ----- 블록 조작 ----- */
  Editor.prototype.newBlock = function (type) {
    switch (type) {
      case 'heading': return { type: 'heading', level: 2, html: '' };
      case 'image': return { type: 'image', url: '', alt: '', caption: '', width: 'full', align: 'center', link: '' };
      case 'quote': return { type: 'quote', html: '' };
      case 'list': return { type: 'list', style: 'bullet', items: [''] };
      case 'divider': return { type: 'divider' };
      case 'table': return { type: 'table', rows: [['', ''], ['', '']] };
      case 'code': return { type: 'code', lang: '', code: '' };
      default: return { type: 'paragraph', align: 'left', html: '' };
    }
  };
  Editor.prototype.focused = function () { return this.list.querySelector('.be-block.focus'); };
  Editor.prototype.addBlock = function (type, afterEl) {
    if (afterEl === undefined) afterEl = this.focused();
    var node = this.renderBlock(this.newBlock(type));
    // 비어 있는 문단에서 다른 블록을 삽입하면 그 문단을 대체
    if (afterEl && afterEl._block && afterEl._block.type === 'paragraph' && type !== 'paragraph') {
      var t = afterEl.querySelector('.be-text');
      if (t && !t.textContent.trim()) { this.list.replaceChild(node, afterEl); this.focusBlock(node); this.changed(); return node; }
    }
    if (afterEl && afterEl.parentNode === this.list) this.list.insertBefore(node, afterEl.nextSibling);
    else this.list.appendChild(node);
    this.focusBlock(node);
    this.changed();
    return node;
  };
  /** 드롭 위치 계산: 마우스 Y 기준으로 바로 위에 있는 블록 (없으면 null = 맨 앞) */
  Editor.prototype.blockAtY = function (y) {
    var target = null;
    Array.prototype.forEach.call(this.list.children, function (c) {
      var r = c.getBoundingClientRect();
      if (r.top + r.height / 2 <= y) target = c;
    });
    return target;
  };

  /** 이미지 파일들을 업로드하며 순서대로 삽입한다. afterEl: 기준 블록 / undefined: 포커스 블록 뒤 / null: 맨 앞 */
  Editor.prototype.insertImages = function (files, afterEl) {
    var self = this;
    var atStart = afterEl === null;
    if (afterEl === undefined) afterEl = this.focused();
    var anchor = afterEl || null;
    Array.prototype.forEach.call(files, function (file) {
      var b = self.newBlock('image');
      b.uploading = true; b.fileName = file.name;
      var node = self.renderBlock(b);
      var anchorText = anchor && anchor._block && anchor._block.type === 'paragraph' ? anchor.querySelector('.be-text') : null;
      if (anchorText && !anchorText.textContent.trim()) {
        self.list.replaceChild(node, anchor);            // 빈 문단 자리에 넣기
      } else if (anchor && anchor.parentNode === self.list) {
        self.list.insertBefore(node, anchor.nextSibling); // 기준 블록 뒤
      } else if (atStart && self.list.firstChild) {
        self.list.insertBefore(node, self.list.firstChild); // 맨 앞
      } else {
        self.list.appendChild(node);                       // 맨 끝
      }
      anchor = node;
      upload(file, self.opts.uploadUrl).then(function (res) {
        b.url = res.url; b.uploading = false; if (!b.alt) b.alt = res.name || '';
        var fresh = self.renderBlock(b);
        if (node.parentNode) self.list.replaceChild(fresh, node);
        self.setFocus(fresh);
        self.changed();
      }).catch(function (e) {
        toast((file.name || '이미지') + ' 업로드 실패: ' + e.message, true);
        if (node.parentNode) node.remove();
        if (!self.list.children.length) self.list.appendChild(self.renderBlock(self.newBlock('paragraph')));
      });
    });
    // 이미지 뒤에 이어 쓸 문단이 없으면 하나 추가
    if (anchor && anchor.nextElementSibling === null) {
      var p = self.renderBlock(self.newBlock('paragraph'));
      self.list.appendChild(p);
    }
    this.changed();
  };

  Editor.prototype.focusBlock = function (node) {
    var t = node.querySelector('.be-text');
    if (t) {
      t.focus();
      var range = document.createRange(); range.selectNodeContents(t); range.collapse(false);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    } else {
      var i = node.querySelector('textarea,input');
      if (i) i.focus();
    }
    this.setFocus(node);
  };
  Editor.prototype.setFocus = function (node) {
    Array.prototype.forEach.call(this.list.children, function (c) { c.classList.remove('focus'); });
    if (node) node.classList.add('focus');
    this.updateToolbarState();
  };
  Editor.prototype.removeBlock = function (node) {
    var prev = node.previousElementSibling || node.nextElementSibling;
    node.remove();
    if (!this.list.children.length) this.list.appendChild(this.renderBlock(this.newBlock('paragraph')));
    this.focusBlock(prev || this.list.firstElementChild);
    this.changed();
  };
  Editor.prototype.move = function (node, dir) {
    if (dir < 0 && node.previousElementSibling) this.list.insertBefore(node, node.previousElementSibling);
    if (dir > 0 && node.nextElementSibling) this.list.insertBefore(node.nextElementSibling, node);
    this.changed();
  };
  /** 블록 복제: 바로 아래에 같은 내용의 블록을 만든다 */
  Editor.prototype.duplicate = function (node) {
    var data = this.serializeBlock(node);
    if (!data) data = this.newBlock(node._block.type);
    var copy = JSON.parse(JSON.stringify(data));
    var fresh = this.renderBlock(copy);
    this.list.insertBefore(fresh, node.nextSibling);
    this.focusBlock(fresh);
    this.changed();
    toast('블록을 복제했습니다.');
  };
  /** 이전/다음 블록으로 캐럿 이동 (↑/↓ 키) */
  Editor.prototype.focusNeighbor = function (node, dir, toEnd) {
    var target = dir < 0 ? node.previousElementSibling : node.nextElementSibling;
    if (!target) return false;
    var t = target.querySelector('.be-text, textarea, input[type="text"], td, th');
    if (!t) { this.setFocus(target); return true; }
    if (t.isContentEditable) {
      t.focus();
      var range = document.createRange(); range.selectNodeContents(t); range.collapse(!toEnd);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    } else { t.focus(); }
    this.setFocus(target);
    return true;
  };

  /** 현재 블록을 다른 텍스트 계열 타입으로 전환 (본문 ↔ 제목 ↔ 인용) */
  Editor.prototype.convert = function (type, level) {
    var node = this.focused();
    if (!node) return;
    var b = node._block;
    if (!(b.type in TEXT_TYPES) || b.type === 'list' || b.type === 'table') return;
    var html = cleanInline(node.querySelector('.be-text'));
    var nb = this.newBlock(type);
    nb.html = html;
    if (type === 'heading') nb.level = level || 2;
    if (type === 'paragraph') nb.align = b.align || 'left';
    var fresh = this.renderBlock(nb);
    this.list.replaceChild(fresh, node);
    this.focusBlock(fresh);
    this.changed();
  };

  /* ----- 블록 렌더 ----- */
  Editor.prototype.renderBlock = function (b) {
    var self = this;
    var node = el('div', { 'class': 'be-block be-' + b.type, 'data-type': b.type });
    node._block = b;
    var handle = el('div', { 'class': 'be-handle' }, [
      el('span', { 'class': 'be-grip', title: '드래그하여 순서 변경', draggable: 'true', html: '⋮⋮' }),
      el('button', { type: 'button', text: '↑', title: '위로 (Alt+↑)', on: { click: function () { self.move(node, -1); } } }),
      el('button', { type: 'button', text: '↓', title: '아래로 (Alt+↓)', on: { click: function () { self.move(node, 1); } } }),
      el('button', { type: 'button', text: '⧉', title: '복제 (Ctrl+Shift+D)', on: { click: function () { self.duplicate(node); } } }),
      el('button', { type: 'button', 'class': 'del', text: '✕', title: '블록 삭제', on: { click: function () { self.removeBlock(node); } } })
    ]);
    node.appendChild(handle);
    this.enableDrag(node, handle.firstChild);
    node.addEventListener('mousedown', function () { self.setFocus(node); });
    node.addEventListener('focusin', function () { self.setFocus(node); });

    switch (b.type) {
      case 'paragraph': case 'heading': case 'quote': this.renderText(node, b); break;
      case 'list': this.renderList(node, b); break;
      case 'image': this.renderImage(node, b); break;
      case 'table': this.renderTable(node, b); break;
      case 'code': this.renderCode(node, b); break;
      default: node.appendChild(el('hr'));
    }
    return node;
  };

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

  var MD_SHORTCUTS = [
    [/^#$/, function (ed) { ed.convert('heading', 1); }],
    [/^##$/, function (ed) { ed.convert('heading', 2); }],
    [/^###$/, function (ed) { ed.convert('heading', 3); }],
    [/^>$/, function (ed) { ed.convert('quote'); }],
    [/^[-*]$/, function (ed) { ed.setListStyle('bullet'); }],
    [/^1[.)]$/, function (ed) { ed.setListStyle('number'); }]
  ];

  Editor.prototype.bindText = function (node, text, opts) {
    var self = this;
    text.addEventListener('keydown', function (e) {
      if (self.slashMenu && self.slashMenu._node === node) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); self.slashMove(e.key === 'ArrowDown' ? 1 : -1); return; }
        if (e.key === 'Enter') { e.preventDefault(); self.slashPick(); return; }
        if (e.key === 'Escape') { e.preventDefault(); self.closeSlash(); return; }
      }
      var b = node._block;
      var plain = text.textContent;
      // 마크다운 단축: "# " → 제목1, "> " → 인용, "- " → 목록, "1. " → 번호 목록
      if (e.key === ' ' && (b.type === 'paragraph') && plain.length <= 3) {
        for (var i = 0; i < MD_SHORTCUTS.length; i++) {
          if (MD_SHORTCUTS[i][0].test(plain)) {
            e.preventDefault(); text.textContent = ''; MD_SHORTCUTS[i][1](self); return;
          }
        }
      }
      if (e.key === 'Enter' && !e.shiftKey && !opts.multiline) {
        e.preventDefault();
        if (b.type === 'paragraph' && /^(---|\*\*\*|___)$/.test(plain.trim())) { text.textContent = ''; self.convertTo(node, 'divider'); self.addBlock('paragraph'); return; }
        if (b.type === 'paragraph' && /^```/.test(plain.trim())) { var nb = self.newBlock('code'); nb.lang = plain.trim().slice(3).trim(); self.replaceWith(node, nb); return; }
        // 제목·인용에서 Enter 는 항상 새 본문 문단
        if (caretAt(text, 'end') || b.type !== 'paragraph') { self.addBlock('paragraph', node); return; }
        // 문단 중간에서 Enter → 캐럿 뒤 내용을 새 문단으로 분리
        var sel = window.getSelection(); var r = sel.getRangeAt(0);
        var tail = document.createRange(); tail.selectNodeContents(text); tail.setStart(r.endContainer, r.endOffset);
        var frag = tail.extractContents(); var holder = document.createElement('div'); holder.appendChild(frag);
        var np = self.newBlock('paragraph'); np.align = b.align || 'left'; np.html = cleanInline(holder);
        var fresh = self.renderBlock(np); self.list.insertBefore(fresh, node.nextSibling);
        var nt = fresh.querySelector('.be-text'); nt.focus();
        var rr = document.createRange(); rr.selectNodeContents(nt); rr.collapse(true); sel.removeAllRanges(); sel.addRange(rr);
        self.setFocus(fresh); self.changed();
      } else if (e.key === 'Backspace' && !text.textContent && !text.querySelector('img') && self.list.children.length > 1) {
        e.preventDefault(); self.removeBlock(node);
      } else if (e.key === 'Backspace' && caretAt(text, 'start') && b.type !== 'paragraph' && b.type !== 'list' && b.type !== 'table') {
        e.preventDefault(); self.convert('paragraph');   // 제목/인용 맨 앞에서 Backspace → 본문으로
      } else if (e.key === 'ArrowUp' && !e.altKey && caretAt(text, 'start')) {
        if (self.focusNeighbor(node, -1, true)) e.preventDefault();
      } else if (e.key === 'ArrowDown' && !e.altKey && caretAt(text, 'end')) {
        if (self.focusNeighbor(node, 1, false)) e.preventDefault();
      }
    });
    text.addEventListener('input', function () {
      self.changed();
      var plain = text.textContent;
      if (node._block.type === 'paragraph' && plain.charAt(0) === '/' && plain.length <= 20 && !text.querySelector('img')) self.openSlash(node, plain.slice(1));
      else if (self.slashMenu) self.closeSlash();
    });
    text.addEventListener('blur', function () { setTimeout(function () { if (self.slashMenu && !self.slashMenu.contains(document.activeElement)) self.closeSlash(); }, 150); });
    text.addEventListener('paste', function (e) {
      e.preventDefault();
      var cd = e.clipboardData || window.clipboardData;
      var html = cd.getData('text/html');
      var t = cd.getData('text/plain');
      if (html && /<[a-z][\s\S]*>/i.test(html)) { self.pasteHtml(node, text, html, t); return; }
      // 여러 줄 평문은 문단으로 분할
      var lines = (t || '').replace(/\r/g, '').split(/\n{2,}|\n/);
      if (lines.length > 1 && node._block.type === 'paragraph') { self.pasteBlocks(node, text, lines.map(function (l) { return { type: 'paragraph', align: node._block.align || 'left', html: escapeHtml(l) }; })); return; }
      document.execCommand('insertText', false, t);
    });
  };

  function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /** 다른 타입으로 교체 (내용 없이) */
  Editor.prototype.convertTo = function (node, type) { this.replaceWith(node, this.newBlock(type)); };
  Editor.prototype.replaceWith = function (node, block) {
    var fresh = this.renderBlock(block);
    this.list.replaceChild(fresh, node);
    this.focusBlock(fresh);
    this.changed();
    return fresh;
  };

  /* ----- 서식 유지 붙여넣기: HTML → 블록 ----- */
  var BLOCK_TAGS = { P: 1, DIV: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, UL: 1, OL: 1, BLOCKQUOTE: 1, TABLE: 1, PRE: 1, HR: 1, FIGURE: 1, SECTION: 1, ARTICLE: 1, HEADER: 1, FOOTER: 1, MAIN: 1, ASIDE: 1, NAV: 1, LI: 1, TR: 1, TBODY: 1, THEAD: 1, IMG: 1 };
  function htmlToBlocks(html) {
    var doc; try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch (e) { return []; }
    var body = doc.body; if (!body) return [];
    var blocks = [], run = document.createElement('div');
    function flush() {
      var h = cleanInline(run);
      if (h.replace(/<br\s*\/?>/g, '').trim()) blocks.push({ type: 'paragraph', align: 'left', html: h });
      run = document.createElement('div');
    }
    function hasBlockChild(n) { for (var i = 0; i < n.children.length; i++) { if (BLOCK_TAGS[n.children[i].tagName]) return true; } return false; }
    function walk(n) {
      if (n.nodeType === 3) { if (n.nodeValue.trim()) run.appendChild(document.createTextNode(n.nodeValue)); return; }
      if (n.nodeType !== 1) return;
      var tag = n.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'META' || tag === 'LINK' || tag === 'TITLE') return;
      if (tag === 'IMG') {
        flush();
        var src = (n.getAttribute('src') || '').trim();
        if (/^(https?:\/\/|\/uploads\/)/.test(src)) blocks.push({ type: 'image', url: src, alt: n.getAttribute('alt') || '', caption: '', width: 'full', align: 'center', link: '' });
        return;
      }
      if (tag === 'HR') { flush(); blocks.push({ type: 'divider' }); return; }
      if (/^H[1-6]$/.test(tag)) { flush(); var lv = Math.min(3, Math.max(1, parseInt(tag.charAt(1), 10))); var hh = cleanInline(n); if (hh.trim()) blocks.push({ type: 'heading', level: lv, html: hh }); return; }
      if (tag === 'BLOCKQUOTE') { flush(); var q = cleanInline(n); if (q.trim()) blocks.push({ type: 'quote', html: q }); return; }
      if (tag === 'PRE') { flush(); var code = n.textContent.replace(/\n$/, ''); if (code.trim()) blocks.push({ type: 'code', lang: '', code: code }); return; }
      if (tag === 'UL' || tag === 'OL') {
        flush();
        var items = [];
        Array.prototype.forEach.call(n.querySelectorAll(':scope > li'), function (li) {
          var clone = li.cloneNode(true);
          Array.prototype.forEach.call(clone.querySelectorAll('ul,ol'), function (sub) { sub.remove(); });
          var ih = cleanInline(clone); if (ih.trim()) items.push(ih);
          Array.prototype.forEach.call(li.querySelectorAll(':scope > ul > li, :scope > ol > li'), function (sli) { var sh = cleanInline(sli); if (sh.trim()) items.push('&nbsp;&nbsp;– ' + sh); });
        });
        if (items.length) blocks.push({ type: 'list', style: tag === 'OL' ? 'number' : 'bullet', items: items });
        return;
      }
      if (tag === 'TABLE') {
        flush();
        var rows = [];
        Array.prototype.forEach.call(n.querySelectorAll('tr'), function (tr) {
          var cells = []; Array.prototype.forEach.call(tr.children, function (c) { if (c.tagName === 'TD' || c.tagName === 'TH') cells.push(cleanInline(c)); });
          if (cells.length) rows.push(cells);
        });
        if (rows.length) { var w = Math.min(12, Math.max.apply(null, rows.map(function (r) { return r.length; }))); rows = rows.slice(0, 50).map(function (r) { r = r.slice(0, w); while (r.length < w) r.push(''); return r; }); blocks.push({ type: 'table', rows: rows }); }
        return;
      }
      if (tag === 'BR') { run.appendChild(document.createElement('br')); return; }
      if (BLOCK_TAGS[tag] || hasBlockChild(n)) {
        // 블록 컨테이너: 앞 내용 마감 후 자식 순회, 끝나면 마감
        if (tag === 'P' || tag === 'DIV' || tag === 'LI') flush();
        Array.prototype.slice.call(n.childNodes).forEach(walk);
        if (tag === 'P' || tag === 'DIV' || tag === 'LI') flush();
        return;
      }
      run.appendChild(n.cloneNode(true));   // 인라인 요소는 cleanInline 이 정리
    }
    Array.prototype.slice.call(body.childNodes).forEach(walk);
    flush();
    return blocks;
  }

  Editor.prototype.pasteHtml = function (node, text, html, plain) {
    var blocks = htmlToBlocks(html);
    if (!blocks.length) { document.execCommand('insertText', false, plain || ''); return; }
    // 인라인 조각 하나면 그 자리에 삽입
    if (blocks.length === 1 && (blocks[0].type === 'paragraph' || node._block.type !== 'paragraph') && blocks[0].html !== undefined) {
      document.execCommand('insertHTML', false, blocks[0].html);
      this.changed();
      return;
    }
    this.pasteBlocks(node, text, blocks);
  };
  /** 첫 블록은 캐럿 위치에 이어 붙이고 나머지는 새 블록으로 삽입 */
  Editor.prototype.pasteBlocks = function (node, text, blocks) {
    var self = this;
    var anchor = node;
    var first = blocks[0];
    if (first.type === 'paragraph' && node._block.type === 'paragraph') {
      document.execCommand('insertHTML', false, first.html);
      blocks = blocks.slice(1);
    } else if (node._block.type === 'paragraph' && !text.textContent.trim()) {
      var f = self.renderBlock(blocks[0]); self.list.replaceChild(f, node); anchor = f; blocks = blocks.slice(1);
    }
    blocks.forEach(function (b) { var n = self.renderBlock(b); self.list.insertBefore(n, anchor.nextSibling); anchor = n; });
    if (anchor !== node) self.focusBlock(anchor);
    self.changed();
    toast('서식을 유지해 붙여넣었습니다.');
  };

  /* ----- '/' 블록 메뉴 ----- */
  var SLASH_ITEMS = [
    { k: 'h1', label: '제목 1', hint: '큰 제목', run: function (ed) { ed.convert('heading', 1); } },
    { k: 'h2', label: '제목 2', hint: '소제목', run: function (ed) { ed.convert('heading', 2); } },
    { k: 'h3', label: '제목 3', hint: '작은 제목', run: function (ed) { ed.convert('heading', 3); } },
    { k: 'quote', label: '인용구', hint: '> 로도 가능', run: function (ed) { ed.convert('quote'); } },
    { k: 'bullet', label: '글머리 기호 목록', hint: '- 로도 가능', run: function (ed) { ed.setListStyle('bullet'); } },
    { k: 'number', label: '번호 목록', hint: '1. 로도 가능', run: function (ed) { ed.setListStyle('number'); } },
    { k: 'image', label: '이미지', hint: '업로드 · 붙여넣기 · 드래그', run: function (ed) { ed.addBlock('image'); } },
    { k: 'table', label: '표', hint: '2×2 로 시작', run: function (ed) { ed.addBlock('table'); } },
    { k: 'code', label: '코드 블록', hint: '``` 로도 가능', run: function (ed) { ed.addBlock('code'); } },
    { k: 'divider', label: '구분선', hint: '--- 로도 가능', run: function (ed) { ed.addBlock('divider'); ed.addBlock('paragraph'); } }
  ];
  Editor.prototype.openSlash = function (node, query) {
    var self = this;
    query = (query || '').trim().toLowerCase();
    var items = SLASH_ITEMS.filter(function (it) { return !query || it.label.toLowerCase().indexOf(query) >= 0 || it.k.indexOf(query) >= 0; });
    if (!items.length) { this.closeSlash(); return; }
    if (!this.slashMenu) {
      this.slashMenu = el('div', { 'class': 'be-slash' });
      document.body.appendChild(this.slashMenu);
    }
    var menu = this.slashMenu; menu._node = node; menu._items = items; menu._idx = 0;
    menu.innerHTML = '';
    menu.appendChild(el('div', { 'class': 'be-slash-title', text: '블록 삽입 — ↑↓ 선택 · Enter 확인 · Esc 닫기' }));
    items.forEach(function (it, i) {
      menu.appendChild(el('div', { 'class': 'be-slash-item' + (i === 0 ? ' on' : ''), on: { mousedown: function (e) { e.preventDefault(); menu._idx = i; self.slashPick(); } } }, [
        el('b', { text: it.label }), el('span', { text: it.hint })
      ]));
    });
    var r = node.getBoundingClientRect();
    menu.style.left = Math.max(8, r.left + 40) + 'px';
    menu.style.top = (r.bottom + window.scrollY + 4) + 'px';
  };
  Editor.prototype.slashMove = function (d) {
    var m = this.slashMenu; if (!m) return;
    m._idx = (m._idx + d + m._items.length) % m._items.length;
    Array.prototype.forEach.call(m.querySelectorAll('.be-slash-item'), function (it, i) { it.classList.toggle('on', i === m._idx); });
  };
  Editor.prototype.slashPick = function () {
    var m = this.slashMenu; if (!m) return;
    var node = m._node, item = m._items[m._idx];
    this.closeSlash();
    var t = node.querySelector('.be-text'); if (t) t.textContent = '';
    this.setFocus(node); if (t) t.focus();
    item.run(this);
  };
  Editor.prototype.closeSlash = function () { if (this.slashMenu) { this.slashMenu.remove(); this.slashMenu = null; } };

  Editor.prototype.renderText = function (node, b) {
    var text = el('div', {
      'class': 'be-text', contenteditable: 'true', spellcheck: 'false',
      'data-placeholder': b.type === 'heading' ? '제목' : b.type === 'quote' ? '인용문' : '내용을 입력하세요',
      html: b.html || ''
    });
    if (b.type === 'heading') node.setAttribute('data-level', b.level || 2);
    if (b.type === 'paragraph') text.style.textAlign = b.align || 'left';
    node.appendChild(text);
    this.bindText(node, text, {});
  };

  Editor.prototype.renderList = function (node, b) {
    var self = this;
    var text = el('div', { 'class': 'be-text', contenteditable: 'true', spellcheck: 'false' });
    var listEl = el(b.style === 'number' ? 'ol' : 'ul');
    (b.items && b.items.length ? b.items : ['']).forEach(function (it) { listEl.appendChild(el('li', { html: it || '' })); });
    text.appendChild(listEl);
    node.appendChild(text);
    text.addEventListener('input', function () {
      if (!text.querySelector('ul,ol')) {
        var nl = el(b.style === 'number' ? 'ol' : 'ul'); nl.appendChild(el('li', { text: text.textContent }));
        text.innerHTML = ''; text.appendChild(nl);
      }
      self.changed();
    });
    text.addEventListener('paste', function (e) {
      e.preventDefault();
      document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
    });
    text.addEventListener('keydown', function (e) {
      // 빈 항목에서 Enter → 목록 종료 후 새 문단
      if (e.key === 'Enter' && !e.shiftKey) {
        var sel = window.getSelection(); var li = sel && sel.anchorNode ? (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentNode) : null;
        while (li && li.tagName !== 'LI') li = li.parentNode;
        if (li && !li.textContent.trim() && li.parentNode.children.length > 1) { e.preventDefault(); li.remove(); self.addBlock('paragraph', node); }
      }
    });
  };
  Editor.prototype.setListStyle = function (style) {
    var node = this.focused();
    if (!node) return;
    var b = node._block;
    if (b.type !== 'list') {
      // 텍스트 블록을 목록으로 전환
      if (!(b.type in TEXT_TYPES) || b.type === 'table') { this.addBlock('list'); this.focused()._block.style = style; this.refreshList(this.focused()); return; }
      var html = cleanInline(node.querySelector('.be-text'));
      var nb = this.newBlock('list'); nb.style = style; nb.items = html ? html.split(/<br\s*\/?>/) : [''];
      var fresh = this.renderBlock(nb); this.list.replaceChild(fresh, node); this.focusBlock(fresh); this.changed(); return;
    }
    b.style = style;
    this.refreshList(node);
  };
  Editor.prototype.refreshList = function (node) {
    var b = node._block, text = node.querySelector('.be-text');
    var newList = el(b.style === 'number' ? 'ol' : 'ul');
    var cur = text.querySelector('ul,ol');
    while (cur && cur.firstChild) newList.appendChild(cur.firstChild);
    text.innerHTML = ''; text.appendChild(newList);
    this.changed();
  };

  Editor.prototype.renderImage = function (node, b) {
    var self = this;
    node.setAttribute('data-width', b.width || 'full');
    node.setAttribute('data-align', b.align || 'center');
    var body = el('div', { 'class': 'be-image-body' });
    node.appendChild(body);
    function draw() {
      body.innerHTML = '';
      if (b.uploading) {
        body.appendChild(el('div', { 'class': 'be-drop uploading' }, [
          el('div', { 'class': 'be-spin' }),
          el('div', { 'class': 'be-drop-title', text: '업로드 중…' }),
          el('div', { 'class': 'be-drop-sub', text: b.fileName || '' })
        ]));
        return;
      }
      if (!b.url) {
        var fileInput = el('input', { type: 'file', accept: 'image/*', multiple: 'multiple', hidden: 'hidden' });
        var urlInput = el('input', { type: 'text', 'class': 'be-inp', placeholder: '또는 이미지 URL (https://...)', style: 'width:240px' });
        var drop = el('div', { 'class': 'be-drop', on: { click: function (e) { if (e.target === drop || e.target.classList.contains('be-drop-title') || e.target.classList.contains('be-drop-sub')) fileInput.click(); } } }, [
          el('div', { 'class': 'be-drop-title', text: '여기를 클릭해 이미지를 선택하거나, 파일을 끌어다 놓으세요' }),
          el('div', { 'class': 'be-drop-sub', text: 'Ctrl+V 로 클립보드 이미지 붙여넣기도 됩니다 · JPG · PNG · GIF · WEBP · 큰 사진은 자동으로 줄여서 올립니다' }),
          el('div', { 'class': 'row' }, [
            el('button', { type: 'button', 'class': 'be-btn pri', text: '파일 선택', on: { click: function () { fileInput.click(); } } }),
            el('button', { type: 'button', 'class': 'be-btn', text: '보관함', on: { click: function () { self.openPicker(function (url) { b.url = url; draw(); self.changed(); }); } } }),
            urlInput,
            el('button', { type: 'button', 'class': 'be-btn', text: '적용', on: { click: function () {
              var v = urlInput.value.trim();
              if (!/^(https?:\/\/|\/uploads\/)/.test(v)) { toast('http(s):// 로 시작하는 주소를 입력하세요.', true); return; }
              b.url = v; draw(); self.changed();
            } } })
          ]),
          fileInput
        ]);
        function doUpload(files) {
          if (!files.length) return;
          // 첫 파일은 이 블록에, 나머지는 뒤에 이어서
          var first = files[0], rest = Array.prototype.slice.call(files, 1);
          b.uploading = true; b.fileName = first.name; draw();
          upload(first, self.opts.uploadUrl).then(function (res) { b.url = res.url; b.uploading = false; if (!b.alt) b.alt = res.name || ''; draw(); self.changed(); if (rest.length) self.insertImages(rest, node); })
            .catch(function (e) { b.uploading = false; toast(e.message, true); draw(); });
        }
        fileInput.addEventListener('change', function () { doUpload(fileInput.files); fileInput.value = ''; });
        drop.addEventListener('dragover', function (e) { e.preventDefault(); e.stopPropagation(); drop.classList.add('over'); });
        drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
        drop.addEventListener('drop', function (e) { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); doUpload(imageFiles(e.dataTransfer)); });
        body.appendChild(drop);
        return;
      }
      var img = el('img', { src: b.url, alt: b.alt || '' });
      var alt = el('input', { type: 'text', 'class': 'be-inp', placeholder: '대체 텍스트', value: b.alt || '', on: { input: function () { b.alt = alt.value; self.changed(); } } });
      var cap = el('input', { type: 'text', 'class': 'be-inp', placeholder: '캡션 (선택)', value: b.caption || '', on: { input: function () { b.caption = cap.value; self.changed(); } } });
      var width = el('select', { 'class': 'be-inp', title: '표시 너비', on: { change: function () { b.width = width.value; node.setAttribute('data-width', b.width); self.changed(); } } });
      [['full', '전체 너비'], ['medium', '중간'], ['small', '작게']].forEach(function (o) {
        var op = el('option', { value: o[0], text: o[1] }); if ((b.width || 'full') === o[0]) op.selected = true; width.appendChild(op);
      });
      var align = el('select', { 'class': 'be-inp', title: '정렬', on: { change: function () { b.align = align.value; node.setAttribute('data-align', b.align); self.changed(); } } });
      [['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']].forEach(function (o) {
        var op = el('option', { value: o[0], text: o[1] }); if ((b.align || 'center') === o[0]) op.selected = true; align.appendChild(op);
      });
      var link = el('input', { type: 'url', 'class': 'be-inp', placeholder: '클릭 시 이동할 주소 (선택)', value: b.link || '', style: 'width:220px', on: { change: function () {
        var v = link.value.trim();
        if (v && !validUrl(v)) { toast('http(s):// 로 시작하는 주소만 사용할 수 있습니다.', true); link.value = b.link || ''; return; }
        b.link = v; self.changed();
      } } });
      var change = el('button', { type: 'button', 'class': 'be-btn', text: '이미지 변경', on: { click: function () { b.url = ''; draw(); self.changed(); } } });
      var open = el('a', { 'class': 'be-btn', text: '원본 보기', href: b.url, target: '_blank', rel: 'noopener' });
      body.appendChild(img);
      body.appendChild(el('div', { 'class': 'be-meta' }, [alt, cap, width, align, link, change, open]));
    }
    draw();
  };

  Editor.prototype.renderTable = function (node, b) {
    var self = this;
    var wrap = el('div', { 'class': 'be-table-wrap' });
    var table = el('table', { 'class': 'be-text', contenteditable: 'false' });
    function build() {
      table.innerHTML = '';
      b.rows.forEach(function (row, ri) {
        var tr = el('tr');
        row.forEach(function (cell, ci) {
          var td = el(ri === 0 ? 'th' : 'td', { contenteditable: 'true', html: cell || '', 'data-r': ri, 'data-c': ci });
          td.addEventListener('input', function () { b.rows[ri][ci] = cleanInline(td); self.changed(); });
          td.addEventListener('focus', function () { self.setFocus(node); });
          td.addEventListener('paste', function (e) { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain')); });
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });
    }
    build();
    var ctl = el('div', { 'class': 'be-table-ctl' }, [
      el('button', { type: 'button', 'class': 'be-btn', text: '+ 행', on: { click: function () { b.rows.push(b.rows[0].map(function () { return ''; })); build(); self.changed(); } } }),
      el('button', { type: 'button', 'class': 'be-btn', text: '− 행', on: { click: function () { if (b.rows.length > 1) { b.rows.pop(); build(); self.changed(); } } } }),
      el('button', { type: 'button', 'class': 'be-btn', text: '+ 열', on: { click: function () { if (b.rows[0].length < 12) { b.rows.forEach(function (r) { r.push(''); }); build(); self.changed(); } } } }),
      el('button', { type: 'button', 'class': 'be-btn', text: '− 열', on: { click: function () { if (b.rows[0].length > 1) { b.rows.forEach(function (r) { r.pop(); }); build(); self.changed(); } } } }),
      el('span', { 'class': 'be-hint', text: '첫 행은 머리글' })
    ]);
    wrap.appendChild(table);
    wrap.appendChild(ctl);
    node.appendChild(wrap);
  };

  Editor.prototype.renderCode = function (node, b) {
    var self = this;
    var lang = el('input', { type: 'text', 'class': 'be-inp be-lang', placeholder: '언어 (java, js, sql…)', value: b.lang || '', on: { input: function () { b.lang = lang.value; self.changed(); } } });
    var ta = el('textarea', { 'class': 'be-codearea', spellcheck: 'false', placeholder: '코드를 입력하세요', on: {
      input: function () { b.code = ta.value; ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 4) + 'px'; self.changed(); },
      keydown: function (e) { if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); } }
    } });
    ta.value = b.code || '';
    node.appendChild(el('div', { 'class': 'be-code-head' }, [lang]));
    node.appendChild(ta);
    setTimeout(function () { ta.style.height = (ta.scrollHeight + 4) + 'px'; }, 0);
  };

  Editor.prototype.openPicker = function (onPick) {
    var self = this;
    var grid = el('div', { 'class': 'grid' }, [el('div', { 'class': 'be-empty', text: '불러오는 중…' })]);
    var overlay = el('div', { 'class': 'be-picker' }, [
      el('div', { 'class': 'box' }, [
        el('div', { 'class': 'head' }, [el('b', { text: '이미지 보관함 (최근 30개)' }), el('button', { type: 'button', 'class': 'be-btn', text: '닫기', on: { click: function () { overlay.remove(); } } })]),
        grid
      ])
    ]);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    fetch(self.opts.recentUrl, { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (items) {
      grid.innerHTML = '';
      if (!items.length) { grid.appendChild(el('div', { 'class': 'be-empty', text: '업로드된 이미지가 없습니다.' })); return; }
      items.forEach(function (it) { grid.appendChild(el('img', { src: it.url, title: it.name, on: { click: function () { onPick(it.url); overlay.remove(); } } })); });
    }).catch(function () { grid.innerHTML = '<div class="be-empty">목록을 불러오지 못했습니다.</div>'; });
  };

  Editor.prototype.enableDrag = function (node, handle) {
    var self = this;
    handle.addEventListener('dragstart', function (e) { self.dragging = node; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'block'); });
    node.addEventListener('dragover', function (e) { if (!self.dragging || self.dragging === node) return; e.preventDefault(); node.classList.add('dragover'); });
    node.addEventListener('dragleave', function () { node.classList.remove('dragover'); });
    node.addEventListener('drop', function (e) { node.classList.remove('dragover'); if (!self.dragging || self.dragging === node) return; e.preventDefault(); self.list.insertBefore(self.dragging, node); self.dragging = null; self.changed(); });
    handle.addEventListener('dragend', function () { self.dragging = null; Array.prototype.forEach.call(self.list.children, function (c) { c.classList.remove('dragover'); }); });
  };

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
  Editor.prototype.openLinkDialog = function (existing) {
    var self = this;
    var node = this.focused();
    if (!node || !node.querySelector('.be-text')) { toast('링크를 넣을 문단을 먼저 선택하세요.', true); return; }
    var text = node.querySelector('.be-text');
    if (this.savedRange) restoreRange(this.savedRange);
    var a = existing || anchorOfSelection(text);
    var range = saveRange();
    var selectedText = a ? a.textContent : (range ? range.toString() : '');
    var urlInp = el('input', { type: 'url', 'class': 'be-inp', placeholder: 'https://', value: a ? (a.getAttribute('href') || '') : '', maxlength: '1000', style: 'width:100%' });
    var txtInp = el('input', { type: 'text', 'class': 'be-inp', placeholder: '비우면 주소가 그대로 표시됩니다', value: selectedText, maxlength: '300', style: 'width:100%' });
    var newTab = el('input', { type: 'checkbox' }); newTab.checked = a ? a.getAttribute('target') === '_blank' : true;
    var err = el('div', { 'class': 'be-dlg-err' });
    var overlay = el('div', { 'class': 'be-picker be-dlg' });
    function close() { overlay.remove(); document.removeEventListener('keydown', onKey); text.focus(); if (range) restoreRange(range); }
    function apply() {
      var url = urlInp.value.trim();
      if (/^www\./i.test(url)) url = 'https://' + url;
      if (!validUrl(url)) { err.textContent = '올바른 http 또는 https 주소를 입력하세요.'; urlInp.focus(); return; }
      var label = txtInp.value.trim() || url;
      overlay.remove(); document.removeEventListener('keydown', onKey);
      text.focus();
      if (a && a.parentNode) {
        a.setAttribute('href', url); a.textContent = label;
        if (newTab.checked) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); } else { a.removeAttribute('target'); a.removeAttribute('rel'); }
      } else {
        if (range) restoreRange(range);
        var html = '<a href="' + escapeHtml(url).replace(/"/g, '&quot;') + '"' + (newTab.checked ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + escapeHtml(label) + '</a>';
        document.execCommand('insertHTML', false, html);
      }
      self.savedRange = saveRange();
      self.changed();
    }
    function unlink() {
      overlay.remove(); document.removeEventListener('keydown', onKey);
      if (a && a.parentNode) { var parent = a.parentNode; while (a.firstChild) parent.insertBefore(a.firstChild, a); parent.removeChild(a); self.changed(); }
      text.focus();
    }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } if (e.key === 'Enter' && (e.target === urlInp || e.target === txtInp)) { e.preventDefault(); apply(); } }
    var foot = [el('button', { type: 'button', 'class': 'be-btn', text: '취소', on: { click: close } }), el('button', { type: 'button', 'class': 'be-btn pri', text: a ? '수정' : '링크 적용', on: { click: apply } })];
    if (a) foot.unshift(el('button', { type: 'button', 'class': 'be-btn danger', text: '링크 제거', on: { click: unlink } }));
    overlay.appendChild(el('div', { 'class': 'box' }, [
      el('div', { 'class': 'head' }, [el('b', { text: a ? '링크 수정' : '링크 넣기' }), el('button', { type: 'button', 'class': 'be-btn', text: '닫기', on: { click: close } })]),
      el('div', { 'class': 'be-dlg-body' }, [
        el('label', { 'class': 'be-dlg-lbl', text: '연결 주소' }), urlInp,
        el('label', { 'class': 'be-dlg-lbl', text: '표시할 문구' }), txtInp,
        el('label', { 'class': 'be-dlg-chk' }, [newTab, el('span', { text: ' 새 탭에서 열기' })]),
        err
      ]),
      el('div', { 'class': 'be-dlg-foot' }, foot)
    ]));
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    setTimeout(function () { urlInp.focus(); urlInp.select(); }, 0);
  };

  /* ----- 상단 도구 모음 ----- */
  Editor.prototype.exec = function (cmd, value) {
    var node = this.focused();
    if (!node) { toast('먼저 서식을 적용할 문단을 선택하세요.'); return; }
    var editable = document.activeElement && document.activeElement.isContentEditable ? document.activeElement : node.querySelector('[contenteditable="true"]');
    if (!editable) return;
    if (this.savedRange) restoreRange(this.savedRange);
    editable.focus();
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(cmd, false, value || null);
    this.savedRange = saveRange();
    this.changed();
  };
  Editor.prototype.setFontSize = function (px) {
    var node = this.focused(); if (!node) return;
    var editable = node.querySelector('[contenteditable="true"]');
    if (this.savedRange) restoreRange(this.savedRange);
    editable.focus();
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('fontSize', false, '7');
    Array.prototype.forEach.call(node.querySelectorAll('span,font'), function (s) {
      var fs = s.style ? s.style.fontSize : '';
      if (fs === 'xxx-large' || fs === '-webkit-xxx-large' || s.getAttribute('size') === '7') { s.removeAttribute('size'); s.style.fontSize = px; }
    });
    this.savedRange = saveRange();
    this.changed();
  };
  /** 글꼴 적용: 선택 영역이 있으면 그 부분에, 없으면 현재 블록 전체에 */
  Editor.prototype.setFont = function (family) {
    var node = this.focused(); if (!node) { toast('글꼴을 적용할 문단을 먼저 선택하세요.'); return; }
    var editable = node.querySelector('[contenteditable="true"]'); if (!editable) return;
    if (this.savedRange) restoreRange(this.savedRange);
    editable.focus();
    var sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !editable.contains(sel.anchorNode)) {
      var r = document.createRange(); r.selectNodeContents(editable); sel.removeAllRanges(); sel.addRange(r);
    }
    document.execCommand('styleWithCSS', false, true);
    if (family) {
      document.execCommand('fontName', false, family);
    } else {
      // 기본서체: 선택 영역의 font-family 제거 — 임시 글꼴을 입힌 뒤 그 span 에서 속성만 벗긴다
      document.execCommand('fontName', false, 'aica-reset');
      Array.prototype.forEach.call(editable.querySelectorAll('span,font'), function (sp) {
        if (sp.style && /aica-reset/.test(sp.style.fontFamily)) sp.style.fontFamily = '';
        if (sp.tagName === 'FONT' && /aica-reset/.test(sp.getAttribute('face') || '')) sp.removeAttribute('face');
      });
    }
    this.savedRange = saveRange();
    this.changed();
    this.updateToolbarState();
  };

  Editor.prototype.setAlign = function (align) {
    var node = this.focused(); if (!node) return;
    var b = node._block;
    if (b.type === 'paragraph') { b.align = align; node.querySelector('.be-text').style.textAlign = align; this.changed(); }
    else if (b.type === 'heading' || b.type === 'quote') { node.querySelector('.be-text').style.textAlign = align; }
    this.updateToolbarState();
  };

  /**
   * 도구 모음 구성 (aica-cms 편집기 참고):
   *   bar   — 기본 서식 줄: 문단 모양 · B · I · 목록 · 실행취소/다시실행 · [추가 서식] 토글
   *   bar2  — 추가 서식 줄(기본 숨김): 글꼴 · 크기 · U · S · 글자색 · 배경 · 정렬 · 서식 지우기 · 블록 삭제
   *   tools — 삽입 도구 줄: + 사진·파일 · 보관함 · 링크 · 표 · 인용구 · 구분선 · 소스코드
   * bar2/tools 가 없으면 모두 bar 한 줄에 넣는다.
   */
  Editor.prototype.buildToolbar = function (bar, bar2, tools) {
    var self = this;
    bar.classList.add('be-toolbar');
    var more = bar2 || bar, ins = tools || bar;
    if (bar2) bar2.classList.add('be-toolbar', 'be-more');
    if (tools) tools.classList.add('be-tools');

    function btn(label, title, onClick, extra) {
      var b = el('button', { type: 'button', 'class': 'tb' + (extra && extra.cls ? ' ' + extra.cls : ''), title: title, html: label,
        on: { mousedown: function (e) { e.preventDefault(); self.savedRange = saveRange(); }, click: onClick } });
      if (extra && extra.cmd) b.setAttribute('data-cmd', extra.cmd);
      if (extra && extra.align) b.setAttribute('data-align', extra.align);
      return b;
    }
    function sep() { return el('span', { 'class': 'sep' }); }
    function dropdown(labelEl, buildMenu, cls) {
      var d = el('details', { 'class': 'dd' + (cls ? ' ' + cls : '') });
      var s = el('summary', {}, [labelEl]);
      s.addEventListener('mousedown', function () { self.savedRange = saveRange(); });
      var menu = el('div', { 'class': 'dd-menu' });
      buildMenu(menu, function () { d.removeAttribute('open'); });
      d.appendChild(s); d.appendChild(menu);
      return d;
    }
    document.addEventListener('click', function (e) {
      [bar, bar2, tools].forEach(function (c) {
        if (!c) return;
        Array.prototype.forEach.call(c.querySelectorAll('details.dd[open]'), function (d) { if (!d.contains(e.target)) d.removeAttribute('open'); });
      });
    });
    function isTextBlock(f) { return f && (f._block.type in TEXT_TYPES) && f._block.type !== 'list' && f._block.type !== 'table'; }

    /* ── 기본 서식 줄 ── */
    var styleLabel = el('span', { 'class': 'lbl', text: '본문' });
    this.styleLabel = styleLabel;
    bar.appendChild(dropdown(el('span', {}, [styleLabel, el('i', { 'class': 'car' })]), function (m, close) {
      [['paragraph', 0, '본문'], ['heading', 1, '제목 1'], ['heading', 2, '제목 2'], ['heading', 3, '제목 3'], ['quote', 0, '인용구']].forEach(function (o) {
        m.appendChild(el('a', { text: o[2], 'class': 'st-' + o[0] + o[1], on: { click: function () { close(); self.convert(o[0], o[1]); } } }));
      });
    }, 'style'));
    bar.appendChild(btn('<b>B</b>', '굵게 (Ctrl+B)', function () { self.exec('bold'); }, { cmd: 'bold' }));
    bar.appendChild(btn('<i>I</i>', '기울임 (Ctrl+I)', function () { self.exec('italic'); }, { cmd: 'italic' }));
    bar.appendChild(btn('<span class="txt">• 목록</span>', '글머리 기호 목록 ("- " 로도 가능)', function () { self.setListStyle('bullet'); }));
    bar.appendChild(btn('<span class="txt">1. 목록</span>', '번호 목록 ("1. " 로도 가능)', function () { self.setListStyle('number'); }));
    bar.appendChild(btn('<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>', '실행 취소 (Ctrl+Z)', function () { document.execCommand('undo'); self.changed(); }));
    bar.appendChild(btn('<svg viewBox="0 0 24 24"><path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>', '다시 실행 (Ctrl+Y)', function () { document.execCommand('redo'); self.changed(); }));
    if (bar2) {
      var moreBtn = el('button', { type: 'button', 'class': 'tb-more', text: '추가 서식', on: { click: function () {
        var open = bar2.hasAttribute('hidden');
        if (open) bar2.removeAttribute('hidden'); else bar2.setAttribute('hidden', 'hidden');
        moreBtn.textContent = open ? '간단히' : '추가 서식';
        moreBtn.classList.toggle('on', open);
      } } });
      bar.appendChild(el('span', { 'class': 'grow' }));
      bar.appendChild(moreBtn);
    }

    /* ── 추가 서식 줄 ── */
    var fontLabel = el('span', { 'class': 'lbl', text: '기본서체' });
    this.fontLabel = fontLabel;
    more.appendChild(dropdown(el('span', {}, [fontLabel, el('i', { 'class': 'car' })]), function (m, close) {
      FONTS.forEach(function (f) {
        m.appendChild(el('a', { text: f[1], 'data-font': f[0], style: f[0] ? "font-family:'" + f[0] + "'" : '', on: { click: function () { close(); self.setFont(f[0]); } } }));
      });
    }, 'font'));
    var sizeLabel = el('span', { 'class': 'lbl', text: '크기' });
    more.appendChild(dropdown(el('span', {}, [sizeLabel, el('i', { 'class': 'car' })]), function (m, close) {
      FONT_SIZES.forEach(function (s) { m.appendChild(el('a', { text: s.replace('px', '') + ' px', style: 'font-size:' + Math.min(parseInt(s, 10), 20) + 'px', on: { click: function () { close(); self.setFontSize(s); } } })); });
    }, 'size'));
    more.appendChild(sep());
    more.appendChild(btn('<u>U</u>', '밑줄 (Ctrl+U)', function () { self.exec('underline'); }, { cmd: 'underline' }));
    more.appendChild(btn('<s>S</s>', '취소선', function () { self.exec('strikeThrough'); }, { cmd: 'strikeThrough' }));
    more.appendChild(dropdown(el('span', { html: '<span class="ic-color">T<i id="beColorBar"></i></span><i class="car"></i>' }), function (m) {
      var pal = el('div', { 'class': 'pal' });
      COLORS.forEach(function (c) { pal.appendChild(el('span', { 'class': 'sw', style: 'background:' + c, title: c, on: { mousedown: function (e) { e.preventDefault(); }, click: function () { self.exec('foreColor', c); document.getElementById('beColorBar').style.background = c; } } })); });
      var pick = el('input', { type: 'color', value: '#111827', on: { input: function () { self.exec('foreColor', pick.value); } } });
      pal.appendChild(pick);
      m.appendChild(el('div', { 'class': 'pal-title', text: '글자색' })); m.appendChild(pal);
    }, 'color'));
    more.appendChild(dropdown(el('span', { html: '<span class="ic-bg">T</span><i class="car"></i>' }), function (m) {
      var pal = el('div', { 'class': 'pal' });
      BG_COLORS.forEach(function (c) { pal.appendChild(el('span', { 'class': 'sw' + (c === 'transparent' ? ' none' : ''), style: 'background:' + c, title: c === 'transparent' ? '배경 없음' : c, on: { mousedown: function (e) { e.preventDefault(); }, click: function () { self.exec('hiliteColor', c === 'transparent' ? 'transparent' : c); } } })); });
      m.appendChild(el('div', { 'class': 'pal-title', text: '글자 배경' })); m.appendChild(pal);
    }, 'color'));
    more.appendChild(sep());
    [['left', '<svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h12M3 18h18"/></svg>', '왼쪽 정렬'],
     ['center', '<svg viewBox="0 0 24 24"><path d="M3 6h18M6 12h12M3 18h18"/></svg>', '가운데 정렬'],
     ['right', '<svg viewBox="0 0 24 24"><path d="M3 6h18M9 12h12M3 18h18"/></svg>', '오른쪽 정렬']].forEach(function (a) {
      more.appendChild(btn(a[1], a[2], function () { self.setAlign(a[0]); }, { align: a[0] }));
    });
    more.appendChild(sep());
    more.appendChild(btn('<span class="txt">서식 지우기</span>', '선택한 글자의 서식·링크 제거', function () { self.exec('removeFormat'); self.exec('unlink'); }));
    more.appendChild(btn('<span class="txt">블록 삭제</span>', '현재 블록 삭제', function () { var f = self.focused(); if (f) self.removeBlock(f); }));

    /* ── 삽입 도구 줄 ── */
    var tbFile = el('input', { type: 'file', accept: 'image/*', multiple: 'multiple', hidden: 'hidden' });
    tbFile.addEventListener('change', function () { if (tbFile.files.length) self.insertImages(tbFile.files); tbFile.value = ''; });
    ins.appendChild(tbFile);
    function tool(label, title, onClick, cls) {
      return el('button', { type: 'button', 'class': 'tl' + (cls ? ' ' + cls : ''), title: title, text: label,
        on: { mousedown: function (e) { e.preventDefault(); self.savedRange = saveRange(); }, click: onClick } });
    }
    function insertImageUrl(url) {
      var b = self.newBlock('image'); b.url = url; var n = self.renderBlock(b);
      var f = self.focused(); if (f && f.parentNode === self.list) self.list.insertBefore(n, f.nextSibling); else self.list.appendChild(n);
      self.setFocus(n); self.changed();
    }
    ins.appendChild(tool('+ 사진', '이미지 업로드 — 여러 장 선택 가능 · 본문에 붙여넣기/드래그도 됩니다', function () { tbFile.click(); }, 'pri'));
    ins.appendChild(tool('보관함', '최근 업로드한 이미지에서 선택', function () { self.openPicker(insertImageUrl); }));
    ins.appendChild(tool('링크', '링크 넣기 (Ctrl+K)', function () { self.openLinkDialog(); }));
    ins.appendChild(tool('표', '표 삽입', function () { self.addBlock('table'); }));
    ins.appendChild(tool('인용구', '인용구', function () { var f = self.focused(); if (f && f._block.type !== 'quote' && isTextBlock(f)) self.convert('quote'); else self.addBlock('quote'); }));
    ins.appendChild(tool('구분선', '구분선 (--- Enter)', function () { self.addBlock('divider'); self.addBlock('paragraph'); }));
    ins.appendChild(tool('소스코드', '코드 블록 (``` Enter)', function () { self.addBlock('code'); }));
    ins.appendChild(tool('이미지 URL', '이미지 주소로 넣기', function () {
      var url = window.prompt('이미지 주소 (https://...)', 'https://'); if (!url) return;
      if (!/^(https?:\/\/|\/uploads\/)/.test(url.trim())) { toast('http(s):// 로 시작하는 주소를 입력하세요.', true); return; }
      insertImageUrl(url.trim());
    }));
    ins.appendChild(el('span', { 'class': 'hint', text: '빈 줄에서 "/" 를 입력하면 블록 메뉴가 열립니다' }));

    this.toolbar = bar;
    this.toolbar2 = bar2 || null;
  };

  Editor.prototype.updateToolbarState = function () {
    if (!this.toolbar) return;
    var focused = this.focused();
    var b = focused ? focused._block : null;
    var bars = [this.toolbar]; if (this.toolbar2) bars.push(this.toolbar2);
    var scope = { querySelectorAll: function (sel) { var out = []; bars.forEach(function (b) { Array.prototype.push.apply(out, b.querySelectorAll(sel)); }); return out; } };
    if (this.fontLabel) {
      var cur = '';
      try { cur = fontName(document.queryCommandValue('fontName')); } catch (e) { cur = ''; }
      this.fontLabel.textContent = FONT_OK[cur] || '기본서체';
    }
    Array.prototype.forEach.call(scope.querySelectorAll('[data-cmd]'), function (btn) {
      var on = false; try { on = document.queryCommandState(btn.getAttribute('data-cmd')); } catch (e) { on = false; }
      btn.classList.toggle('on', !!on);
    });
    var align = b && b.type === 'paragraph' ? (b.align || 'left') : (focused && focused.querySelector('.be-text') ? (focused.querySelector('.be-text').style.textAlign || 'left') : '');
    Array.prototype.forEach.call(scope.querySelectorAll('[data-align]'), function (btn) { btn.classList.toggle('on', btn.getAttribute('data-align') === align); });
    if (this.styleLabel) {
      this.styleLabel.textContent = !b ? '본문' : b.type === 'heading' ? '제목 ' + (b.level || 2) : b.type === 'quote' ? '인용구' : b.type === 'list' ? '목록' : b.type === 'table' ? '표' : b.type === 'code' ? '코드' : b.type === 'image' ? '이미지' : '본문';
    }
  };

  /* ----- 직렬화 ----- */
  /** 블록 DOM 하나 → 저장용 객체 (비어 있으면 null) */
  Editor.prototype.serializeBlock = function (node) {
    var b = node._block, text = node.querySelector('.be-text');
    switch (b.type) {
      case 'paragraph': return { type: 'paragraph', align: b.align || 'left', html: cleanInline(text) };
      case 'heading': return { type: 'heading', level: b.level || 2, html: cleanInline(text) };
      case 'quote': return { type: 'quote', html: cleanInline(text) };
      case 'list': {
        var items = [];
        Array.prototype.forEach.call(text.querySelectorAll('li'), function (li) { var h = cleanInline(li); if (h) items.push(h); });
        return { type: 'list', style: b.style || 'bullet', items: items };
      }
      case 'image': return b.url ? { type: 'image', url: b.url, alt: b.alt || '', caption: b.caption || '', width: b.width || 'full', align: b.align || 'center', link: b.link || '' } : null;
      case 'table': {
        var rows = b.rows.map(function (r) { return r.map(function (c) { return c || ''; }); });
        var hasContent = rows.some(function (r) { return r.some(function (c) { return c.replace(/<br\s*\/?>/g, '').trim(); }); });
        return hasContent ? { type: 'table', rows: rows } : null;
      }
      case 'code': return (b.code || '').trim() ? { type: 'code', lang: b.lang || '', code: b.code } : null;
      case 'divider': return { type: 'divider' };
    }
    return null;
  };
  Editor.prototype.getBlocks = function () {
    var self = this, out = [];
    Array.prototype.forEach.call(this.list.children, function (node) { var b = self.serializeBlock(node); if (b) out.push(b); });
    return out.filter(function (b) {
      if (b.type === 'image' || b.type === 'divider' || b.type === 'table' || b.type === 'code') return true;
      if (b.type === 'list') return b.items.length > 0;
      return b.html.replace(/<br\s*\/?>/g, '').trim().length > 0;
    });
  };

  /** 글자 수 통계 (공백 포함/제외) */
  Editor.prototype.stats = function () {
    var t = '';
    Array.prototype.forEach.call(this.list.querySelectorAll('.be-text, .be-codearea'), function (n) { t += (n.value !== undefined ? n.value : n.textContent) + '\n'; });
    var noSpace = t.replace(/\s/g, '').length;
    return { chars: t.replace(/\n/g, '').length, charsNoSpace: noSpace, blocks: this.list.children.length, images: this.list.querySelectorAll('.be-image img').length };
  };

  global.BlockEditor = {
    mount: function (container, opts) { return new Editor(container, opts); },
    upload: upload,
    cleanInline: cleanInline,
    htmlToBlocks: htmlToBlocks,
    validUrl: validUrl,
    prepareImage: prepareImage
  };
})(window);
