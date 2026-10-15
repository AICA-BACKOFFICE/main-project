/*
 * AICA 블록 에디터 — dialogs: 이미지 보관함 선택창, 링크 넣기/수정 대화상자
 */
(function (BE, global) {
  'use strict';
  var el = BE.el, csrf = BE.csrf, toast = BE.toast, saveRange = BE.saveRange, restoreRange = BE.restoreRange,
      escapeHtml = BE.escapeHtml, fontName = BE.fontName, cleanInline = BE.cleanInline, upload = BE.upload,
      prepareImage = BE.prepareImage, validUrl = BE.validUrl, hasFiles = BE.hasFiles, imageFiles = BE.imageFiles, caretAt = BE.caretAt,
      FONT_SIZES = BE.FONT_SIZES, COLORS = BE.COLORS, BG_COLORS = BE.BG_COLORS, TEXT_TYPES = BE.TEXT_TYPES, FONTS = BE.FONTS, FONT_OK = BE.FONT_OK;
  var Editor = BE.Editor, anchorOfSelection = BE.anchorOfSelection;

  /**
   * 이미지 보관함 선택창. 미디어 관리와 같은 카테고리(게시물 카테고리 2단) 탭으로 나눠 보여 주고,
   * 고른 이미지의 주소를 onPick(url) 로 넘긴다. 분류 목록 주소는 opts.categoriesUrl(없으면 recentUrl 의 recent → categories).
   */
  Editor.prototype.openPicker = function (onPick) {
    var self = this;
    var recentUrl = self.opts.recentUrl;
    var categoriesUrl = self.opts.categoriesUrl || String(recentUrl).replace(/\/recent(\?.*)?$/, '/categories');
    var tabs = el('div', { 'class': 'be-picker-tabs' });
    var subtabs = el('div', { 'class': 'be-picker-tabs be-picker-subtabs' });
    var grid = el('div', { 'class': 'grid' }, [el('div', { 'class': 'be-empty', text: '불러오는 중…' })]);
    var overlay = el('div', { 'class': 'be-picker' }, [
      el('div', { 'class': 'box' }, [
        el('div', { 'class': 'head' }, [el('b', { text: '이미지 보관함' }), el('button', { type: 'button', 'class': 'be-btn', text: '닫기', on: { click: function () { overlay.remove(); } } })]),
        tabs, subtabs, grid
      ])
    ]);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    var tree = [];
    var state = self.pickerState || { cat: 'all', sub: '' };   // 마지막으로 본 분류 기억
    function tab(container, key, label, count, onClick) {
      var t = el('button', { type: 'button', 'class': 'be-ptab', text: label, on: { click: onClick } });
      t.dataset.key = key;
      if (count !== undefined) t.appendChild(el('b', { text: String(count) }));
      container.appendChild(t);
      return t;
    }
    function query() {
      if (state.cat === 'all') return '';
      if (state.cat === 'unfiled') return '?unfiled=true';
      return '?categoryId=' + encodeURIComponent(state.cat) + (state.sub ? '&subCategoryId=' + encodeURIComponent(state.sub) : '');
    }
    function load() {
      self.pickerState = { cat: state.cat, sub: state.sub };
      Array.prototype.forEach.call(tabs.children, function (t) { t.classList.toggle('on', t.dataset.key === state.cat); });
      // 세부 탭
      subtabs.innerHTML = '';
      var cur = tree.filter(function (c) { return String(c.id) === state.cat; })[0];
      if (cur && cur.children && cur.children.length) {
        tab(subtabs, '', '전체', cur.count, function () { state.sub = ''; load(); });
        cur.children.forEach(function (sc) { tab(subtabs, String(sc.id), sc.name, sc.count, function () { state.sub = String(sc.id); load(); }); });
        Array.prototype.forEach.call(subtabs.children, function (t) { t.classList.toggle('on', t.dataset.key === state.sub); });
        subtabs.hidden = false;
      } else { subtabs.hidden = true; }
      grid.innerHTML = '<div class="be-empty">불러오는 중…</div>';
      fetch(recentUrl + query(), { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (items) {
        grid.innerHTML = '';
        if (!items.length) { grid.appendChild(el('div', { 'class': 'be-empty', text: state.cat === 'all' ? '업로드된 이미지가 없습니다. 미디어 관리에서 올려 두세요.' : '이 분류에 이미지가 없습니다.' })); return; }
        items.forEach(function (it) {
          var tile = el('figure', { 'class': 'be-pick', title: it.name + (it.categoryPath ? ' · ' + it.categoryPath : '') }, [
            el('img', { src: it.url, alt: it.name, loading: 'lazy' }),
            el('figcaption', { text: it.name })
          ]);
          tile.addEventListener('click', function () { onPick(it.url); overlay.remove(); });
          grid.appendChild(tile);
        });
      }).catch(function () { grid.innerHTML = '<div class="be-empty">목록을 불러오지 못했습니다.</div>'; });
    }

    fetch(categoriesUrl, { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (data) {
      tree = data.categories || [];
      tab(tabs, 'all', '전체', data.total, function () { state = { cat: 'all', sub: '' }; load(); });
      tree.forEach(function (c) { tab(tabs, String(c.id), c.name, c.count, function () { state = { cat: String(c.id), sub: '' }; load(); }); });
      if (data.unfiled) tab(tabs, 'unfiled', '미분류', data.unfiled, function () { state = { cat: 'unfiled', sub: '' }; load(); });
      var known = Array.prototype.some.call(tabs.children, function (t) { return t.dataset.key === state.cat; });
      if (!known) state = { cat: 'all', sub: '' };
      load();
    }).catch(function () { tab(tabs, 'all', '전체', undefined, function () { state = { cat: 'all', sub: '' }; load(); }); state = { cat: 'all', sub: '' }; load(); });
  };


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
})(window.BlockEditor = window.BlockEditor || {}, window);
