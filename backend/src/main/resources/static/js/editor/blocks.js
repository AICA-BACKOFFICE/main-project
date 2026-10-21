/*
 * AICA 블록 에디터 — blocks: Editor 생성자, 블록 상태(setBlocks/getBlocks), 블록 조작(추가·삭제·이동·복제·전환), 직렬화
 */
(function (BE, global) {
  'use strict';
  var el = BE.el, csrf = BE.csrf, toast = BE.toast, saveRange = BE.saveRange, restoreRange = BE.restoreRange,
      escapeHtml = BE.escapeHtml, fontName = BE.fontName, cleanInline = BE.cleanInline, upload = BE.upload,
      prepareImage = BE.prepareImage, validUrl = BE.validUrl, hasFiles = BE.hasFiles, imageFiles = BE.imageFiles, caretAt = BE.caretAt,
      FONT_SIZES = BE.FONT_SIZES, COLORS = BE.COLORS, BG_COLORS = BE.BG_COLORS, TEXT_TYPES = BE.TEXT_TYPES, FONTS = BE.FONTS, FONT_OK = BE.FONT_OK;

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


  /** 다른 타입으로 교체 (내용 없이) */
  Editor.prototype.convertTo = function (node, type) { this.replaceWith(node, this.newBlock(type)); };
  Editor.prototype.replaceWith = function (node, block) {
    var fresh = this.renderBlock(block);
    this.list.replaceChild(fresh, node);
    this.focusBlock(fresh);
    this.changed();
    return fresh;
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
      // 주소가 비어 있어도 '사진 자리'로 남긴다(템플릿 뼈대). 프론트는 빈 자리를 그리지 않는다
      case 'image': return { type: 'image', url: b.url || '', alt: b.alt || '', caption: b.caption || '', width: b.width || 'full', align: b.align || 'center', link: b.link || '' };
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

  BE.Editor = Editor;
})(window.BlockEditor = window.BlockEditor || {}, window);
