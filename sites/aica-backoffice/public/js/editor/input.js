/*
 * AICA 블록 에디터 — input: 텍스트 입력 처리(마크다운 단축 · Enter 분할 · ↑↓ 블록 이동 · 붙여넣기 → 블록 분할) · "/" 블록 메뉴
 */
(function (BE, global) {
  'use strict';
  var el = BE.el, csrf = BE.csrf, toast = BE.toast, saveRange = BE.saveRange, restoreRange = BE.restoreRange,
      escapeHtml = BE.escapeHtml, fontName = BE.fontName, cleanInline = BE.cleanInline, upload = BE.upload,
      prepareImage = BE.prepareImage, validUrl = BE.validUrl, hasFiles = BE.hasFiles, imageFiles = BE.imageFiles, caretAt = BE.caretAt,
      FONT_SIZES = BE.FONT_SIZES, COLORS = BE.COLORS, BG_COLORS = BE.BG_COLORS, TEXT_TYPES = BE.TEXT_TYPES, FONTS = BE.FONTS, FONT_OK = BE.FONT_OK;
  var Editor = BE.Editor;

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

  BE.htmlToBlocks = htmlToBlocks;
})(window.BlockEditor = window.BlockEditor || {}, window);
