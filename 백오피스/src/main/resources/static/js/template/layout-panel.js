/*
 * 레이아웃 패널(템플릿 관리 편집 화면에서 사용): 프리셋(1단/2단) · 정렬 · 폭 · 머리 요소 순서 · 사이드바/하단 위젯을 드래그로 구성
 *   LayoutPanel.mount(panelEl, hiddenInput, { onChange })  → { get(), set(json), reset() }
 * 결과는 hiddenInput 에 JSON 으로 저장 → 서버 editor/PostLayout 이 검증 → front/post.html 이 그대로 그린다.
 * JSON 형식과 허용값은 PostLayout.java 와 같다. 글쓰기 화면에는 이 패널이 없고, 템플릿을 불러올 때 레이아웃이 함께 적용된다.
 */
(function (global) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function mount(panel, input, opts) {
    opts = opts || {};
    if (!panel || !input) return null;
    var markDirty = opts.onChange || function () {};

    var PRESETS = ['basic', 'wide', 'side-left', 'side-right', 'hero', 'magazine'];
    var ITEMS = {
      category: { label: '카테고리', zones: ['header'] },
      title: { label: '제목', zones: ['header'], fixed: true },
      meta: { label: '작성자·날짜', zones: ['header'] },
      thumbnail: { label: '대표 이미지', zones: ['header'] },
      summary: { label: '요약', zones: ['header'] },
      toc: { label: '목차', zones: ['sidebar', 'footer'] },
      author: { label: '프로필', zones: ['sidebar', 'footer'] },
      recent: { label: '최근 글', zones: ['sidebar', 'footer'] },
      related: { label: '관련 글', zones: ['sidebar', 'footer'] },
      share: { label: '공유 버튼', zones: ['sidebar', 'footer'] }
    };
    var HEADER_ITEMS = ['category', 'title', 'meta', 'thumbnail', 'summary'];
    var WIDGETS = ['toc', 'author', 'recent', 'related', 'share'];
    var DEFAULTS = { preset: 'basic', align: 'center', width: 'normal',
      header: ['category', 'title', 'meta', 'thumbnail', 'summary'], sidebar: ['toc', 'author', 'recent'], footer: ['share', 'related'] };

    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function clean(list, allowed) { var out = []; (list || []).forEach(function (k) { if (allowed.indexOf(k) >= 0 && out.indexOf(k) < 0) out.push(k); }); return out; }
    function hasSidebar(l) { return l.preset === 'side-left' || l.preset === 'side-right'; }

    /** 서버/백업에서 온 JSON → 안전한 상태 객체 */
    function read(json) {
      var d = clone(DEFAULTS);
      if (!json) return d;
      var o; try { o = JSON.parse(json); } catch (e) { return d; }
      if (!o || typeof o !== 'object') return d;
      var l = {
        preset: PRESETS.indexOf(o.preset) >= 0 ? o.preset : d.preset,
        align: o.align === 'left' ? 'left' : 'center',
        width: o.width === 'wide' ? 'wide' : 'normal',
        header: Array.isArray(o.header) ? clean(o.header, HEADER_ITEMS) : d.header,
        sidebar: Array.isArray(o.sidebar) ? clean(o.sidebar, WIDGETS) : d.sidebar,
        footer: Array.isArray(o.footer) ? clean(o.footer, WIDGETS) : d.footer
      };
      if (l.header.indexOf('title') < 0) l.header.unshift('title');
      l.footer = l.footer.filter(function (k) { return l.sidebar.indexOf(k) < 0; });
      return l;
    }
    function isDefault(l) { return JSON.stringify(l) === JSON.stringify(DEFAULTS); }

    var state = read(input.value);

    // ---- 상태 → hidden input ----
    function commit(silent) {
      input.value = isDefault(state) ? '' : JSON.stringify(state);
      if (!silent) markDirty();
      render();
    }

    // ---- 렌더 ----
    var presetBtns = panel.querySelectorAll('.lo-preset');
    var zones = {};
    panel.querySelectorAll('.lo-chips').forEach(function (z) { zones[z.dataset.zone] = z; });
    var middle = panel.querySelector('.lo-middle');
    var summaryEl = panel.querySelector('[data-layout-summary]');

    function chip(key) {
      var it = ITEMS[key];
      var c = document.createElement('div');
      c.className = 'lo-chip' + (it.fixed ? ' fixed' : '') + (HEADER_ITEMS.indexOf(key) >= 0 ? ' head' : ' widget');
      c.draggable = !it.fixed;
      c.dataset.key = key;
      c.innerHTML = '<span class="grip">⋮⋮</span>' + esc(it.label) + (it.fixed ? '' : '<button type="button" class="lo-chip-x" title="사용 안 함">✕</button>');
      return c;
    }
    function render() {
      presetBtns.forEach(function (b) { b.classList.toggle('on', b.dataset.preset === state.preset); });
      panel.querySelectorAll('[name="loAlign"]').forEach(function (r) { r.checked = r.value === state.align; });
      panel.querySelectorAll('[name="loWidth"]').forEach(function (r) { r.checked = r.value === state.width; });
      middle.classList.toggle('side-left', state.preset === 'side-left');
      middle.classList.toggle('side-right', state.preset === 'side-right');
      middle.classList.toggle('no-side', !hasSidebar(state));
      zones.header.innerHTML = ''; zones.sidebar.innerHTML = ''; zones.footer.innerHTML = ''; zones.tray.innerHTML = '';
      state.header.forEach(function (k) { zones.header.appendChild(chip(k)); });
      state.sidebar.forEach(function (k) { zones.sidebar.appendChild(chip(k)); });
      state.footer.forEach(function (k) { zones.footer.appendChild(chip(k)); });
      Object.keys(ITEMS).forEach(function (k) {
        if (state.header.indexOf(k) < 0 && state.sidebar.indexOf(k) < 0 && state.footer.indexOf(k) < 0) zones.tray.appendChild(chip(k));
      });
      if (!zones.tray.children.length) zones.tray.innerHTML = '<div class="lo-empty">모든 요소를 사용 중입니다</div>';
      if (!zones.sidebar.children.length) zones.sidebar.innerHTML = '<div class="lo-empty">위젯을 끌어다 놓으세요</div>';
      if (!zones.footer.children.length) zones.footer.innerHTML = '<div class="lo-empty">위젯을 끌어다 놓으세요</div>';
      var name = panel.querySelector('.lo-preset[data-preset="' + state.preset + '"]');
      if (summaryEl) summaryEl.textContent = (name ? name.textContent.trim() : state.preset) + ' · ' + (state.align === 'left' ? '좌측 정렬' : '중앙 정렬') + ' · ' + (state.width === 'wide' ? '넓게' : '보통')
        + (hasSidebar(state) ? ' · 사이드바 ' + state.sidebar.length + '개' : '') + (state.footer.length ? ' · 하단 ' + state.footer.length + '개' : '') + (isDefault(state) ? ' (기본값)' : '');
    }

    // ---- 프리셋 · 설정 ----
    presetBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        var p = b.dataset.preset;
        state.preset = p;
        if (p === 'wide') state.width = 'wide';
        if (p === 'basic') state.width = 'normal';
        if (p === 'hero' || p === 'magazine') {
          // 대표 이미지를 반드시 포함하고, 히어로는 맨 위로
          state.header = state.header.filter(function (k) { return k !== 'thumbnail'; });
          if (p === 'hero') state.header.unshift('thumbnail'); else state.header.push('thumbnail');
        }
        if (hasSidebar(state) && !state.sidebar.length) {
          state.sidebar = DEFAULTS.sidebar.filter(function (k) { return state.footer.indexOf(k) < 0; });
        }
        commit();
      });
    });
    panel.addEventListener('change', function (e) {
      if (e.target.name === 'loAlign') { state.align = e.target.value; commit(); }
      if (e.target.name === 'loWidth') { state.width = e.target.value; commit(); }
    });

    // ---- 드래그 앤 드롭 ----
    var dragKey = null;
    panel.addEventListener('dragstart', function (e) {
      var c = e.target.closest && e.target.closest('.lo-chip');
      if (!c || c.classList.contains('fixed')) { e.preventDefault(); return; }
      dragKey = c.dataset.key; c.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragKey); } catch (err) { /* ignore */ }
      ITEMS[dragKey].zones.concat(['tray']).forEach(function (z) { if (zones[z]) zones[z].parentNode.classList.add('can-drop'); });
    });
    panel.addEventListener('dragend', function () {
      dragKey = null;
      panel.querySelectorAll('.dragging').forEach(function (c) { c.classList.remove('dragging'); });
      panel.querySelectorAll('.can-drop, .over').forEach(function (z) { z.classList.remove('can-drop'); z.classList.remove('over'); });
    });
    function zoneOf(el) { var z = el.closest && el.closest('.lo-chips'); return z ? z.dataset.zone : null; }
    function allowed(key, zone) { return zone === 'tray' || ITEMS[key].zones.indexOf(zone) >= 0; }
    panel.addEventListener('dragover', function (e) {
      if (!dragKey) return;
      var zone = zoneOf(e.target); if (!zone || !allowed(dragKey, zone)) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      panel.querySelectorAll('.over').forEach(function (z) { z.classList.remove('over'); });
      zones[zone].parentNode.classList.add('over');
    });
    panel.addEventListener('drop', function (e) {
      if (!dragKey) return;
      var zone = zoneOf(e.target); if (!zone || !allowed(dragKey, zone)) return;
      e.preventDefault();
      var key = dragKey;
      // 모든 영역에서 제거
      ['header', 'sidebar', 'footer'].forEach(function (z) { state[z] = state[z].filter(function (k) { return k !== key; }); });
      if (zone !== 'tray') {
        // 놓은 위치(앞/뒤 칩) 계산
        var list = state[zone];
        var target = e.target.closest && e.target.closest('.lo-chip');
        var idx = list.length;
        if (target && target.dataset.key !== key) {
          var tIdx = list.indexOf(target.dataset.key);
          var rect = target.getBoundingClientRect();
          var col = zones[zone].classList.contains('lo-chips-col');
          var after = col ? e.clientY > rect.top + rect.height / 2 : e.clientX > rect.left + rect.width / 2;
          idx = tIdx + (after ? 1 : 0);
        }
        list.splice(idx, 0, key);
      }
      commit();
    });
    panel.addEventListener('click', function (e) {
      var x = e.target.closest && e.target.closest('.lo-chip-x');
      if (!x) return;
      var key = x.parentNode.dataset.key;
      ['header', 'sidebar', 'footer'].forEach(function (z) { state[z] = state[z].filter(function (k) { return k !== key; }); });
      commit();
    });

    // ---- 초기화 · 외부 변경 ----
    var resetBtn = panel.querySelector('[data-layout-reset]');
    if (resetBtn) resetBtn.addEventListener('click', function () { state = clone(DEFAULTS); commit(); });
    input.addEventListener('layout:external', function () { state = read(input.value); render(); });
    render();
    return { get: function () { return clone(state); }, set: function (json) { state = read(json); commit(); }, reset: function () { state = clone(DEFAULTS); commit(); } };
  }

  global.LayoutPanel = { mount: mount };
})(window);
