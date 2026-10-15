/*
 * AICA 블록 에디터 — toolbar: 서식 명령(exec/글꼴/크기/정렬), 도구 모음 3줄 구성(buildToolbar), 활성 상태 표시
 */
(function (BE, global) {
  'use strict';
  var el = BE.el, csrf = BE.csrf, toast = BE.toast, saveRange = BE.saveRange, restoreRange = BE.restoreRange,
      escapeHtml = BE.escapeHtml, fontName = BE.fontName, cleanInline = BE.cleanInline, upload = BE.upload,
      prepareImage = BE.prepareImage, validUrl = BE.validUrl, hasFiles = BE.hasFiles, imageFiles = BE.imageFiles, caretAt = BE.caretAt,
      FONT_SIZES = BE.FONT_SIZES, COLORS = BE.COLORS, BG_COLORS = BE.BG_COLORS, TEXT_TYPES = BE.TEXT_TYPES, FONTS = BE.FONTS, FONT_OK = BE.FONT_OK;
  var Editor = BE.Editor;

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
    ins.appendChild(tool('보관함', '미디어 관리에 올려 둔 이미지에서 선택 (카테고리별)', function () { self.openPicker(insertImageUrl); }));
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
})(window.BlockEditor = window.BlockEditor || {}, window);
