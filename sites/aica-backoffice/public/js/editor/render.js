/*
 * AICA 블록 에디터 — render: 블록 DOM 렌더(문단·제목·인용·목록·이미지·표·코드), 목록 스타일, 블록 드래그 정렬
 */
(function (BE, global) {
  'use strict';
  var el = BE.el, csrf = BE.csrf, toast = BE.toast, saveRange = BE.saveRange, restoreRange = BE.restoreRange,
      escapeHtml = BE.escapeHtml, fontName = BE.fontName, cleanInline = BE.cleanInline, upload = BE.upload,
      prepareImage = BE.prepareImage, validUrl = BE.validUrl, hasFiles = BE.hasFiles, imageFiles = BE.imageFiles, caretAt = BE.caretAt,
      FONT_SIZES = BE.FONT_SIZES, COLORS = BE.COLORS, BG_COLORS = BE.BG_COLORS, TEXT_TYPES = BE.TEXT_TYPES, FONTS = BE.FONTS, FONT_OK = BE.FONT_OK;
  var Editor = BE.Editor;

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
      var edit = el('button', { type: 'button', 'class': 'be-btn', text: '편집', title: '자르기 · 회전 · 밝기/대비 · 필터', on: { click: function () { if (self.openImageEditor) self.openImageEditor(b, draw); } } });
      var change = el('button', { type: 'button', 'class': 'be-btn', text: '이미지 변경', on: { click: function () { b.url = ''; draw(); self.changed(); } } });
      var open = el('a', { 'class': 'be-btn', text: '원본 보기', href: b.url, target: '_blank', rel: 'noopener' });
      body.appendChild(img);
      body.appendChild(el('div', { 'class': 'be-meta' }, [alt, cap, width, align, link, edit, change, open]));
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


  Editor.prototype.enableDrag = function (node, handle) {
    var self = this;
    handle.addEventListener('dragstart', function (e) { self.dragging = node; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'block'); });
    node.addEventListener('dragover', function (e) { if (!self.dragging || self.dragging === node) return; e.preventDefault(); node.classList.add('dragover'); });
    node.addEventListener('dragleave', function () { node.classList.remove('dragover'); });
    node.addEventListener('drop', function (e) { node.classList.remove('dragover'); if (!self.dragging || self.dragging === node) return; e.preventDefault(); self.list.insertBefore(self.dragging, node); self.dragging = null; self.changed(); });
    handle.addEventListener('dragend', function () { self.dragging = null; Array.prototype.forEach.call(self.list.children, function (c) { c.classList.remove('dragover'); }); });
  };

})(window.BlockEditor = window.BlockEditor || {}, window);
