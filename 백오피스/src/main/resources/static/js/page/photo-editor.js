/*
 * 사진 편집 창 — 게시물 글쓰기(선배들의 이야기 양식)와 카테고리 페이지 관리(페이지 편집기)가 함께 써요. (2026-10-14)
 *   PhotoEditor.edit({ src, name, ratios, ratio, upload, onDone })
 *     자르기(비율 고르기) · 회전 · 뒤집기 · 밝기/대비/채도 · 필터 → 새 사진 파일로 저장해요. 원래 파일은 그대로 남아요.
 *     ratios: [{ key, label, value(가로/세로) }] 기본 비율 앞에 더할 비율(예: '이 자리 비율'), ratio: 처음에 고를 비율 key
 *     upload(file) → Promise<{ url 또는 path, width, height }>, onDone(올린 결과 + width · height)
 *   PhotoEditor.frame({ src, ratio, fit, title, note, onDone })
 *     썸네일 맞추기: 카드 틀 안에서 보일 부분(위치)과 확대 정도를 정해요. 사진 파일은 바꾸지 않고 { x, y, z } 값만 돌려줘요.
 *   PhotoEditor.fitStyle(fit) → 그 값을 그대로 보여 줄 style 문자열(object-position · 확대)
 * 다른 파일에 기대지 않아요(스타일도 이 파일이 넣어요). 같은 주소(사이트 · 관리자)에서 불러온 사진만 편집할 수 있어요.
 */
(function (global) {
  'use strict';
  if (global.PhotoEditor) return;

  var BASE_RATIOS = [['free', '자유', 0], ['orig', '원본 비율', -1], ['1:1', '1:1', 1], ['4:3', '4:3', 4 / 3], ['16:9', '16:9', 16 / 9], ['3:4', '3:4', 3 / 4]];
  var FILTERS = [['none', '없음'], ['gray', '흑백'], ['sepia', '옛날 사진'], ['warm', '따뜻하게'], ['cool', '차갑게'], ['vivid', '선명하게']];
  var MAX_SIDE = 2400;     // 저장할 때 긴 변 최대
  var MIN_CROP = 24;       // 자르기 상자 최소 크기(화면 px)
  var Z_MAX = 3;

  var CSS = [
    '.pe-ov{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(17,20,28,.62);font:14px/1.5 "Pretendard","BO Pretendard","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;color:#1d2230}',
    '.pe-box{display:flex;flex-direction:column;width:min(1040px,100%);max-height:calc(100vh - 40px);border-radius:16px;background:#fff;box-shadow:0 30px 80px -20px rgba(0,0,0,.5);overflow:hidden}',
    '.pe-box.sm{width:min(640px,100%)}',
    '.pe-head{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid #e7e9ef}',
    '.pe-head b{font-size:16px}',
    '.pe-head .pe-sub{color:#6b7280;font-size:13px}',
    '.pe-x{margin-left:auto;width:34px;height:34px;border:0;border-radius:8px;background:none;color:#4b5263;font-size:20px;cursor:pointer}',
    '.pe-x:hover{background:#f1f3f7}',
    '.pe-body{display:flex;gap:18px;min-height:0;padding:16px 18px;overflow:auto}',
    '.pe-stage-wrap{flex:1;display:grid;place-items:center;min-width:0;min-height:320px;border-radius:12px;background:#f1f3f7 repeating-conic-gradient(#e6e9ef 0 25%,#f1f3f7 0 50%) 0 0/20px 20px}',
    '.pe-stage{position:relative;overflow:hidden;touch-action:none;user-select:none}',
    '.pe-stage canvas{display:block}',
    '.pe-crop{position:absolute;box-shadow:0 0 0 9999px rgba(17,20,28,.55);outline:2px solid #fff;cursor:move;touch-action:none}',
    '.pe-crop::before,.pe-crop::after{content:"";position:absolute;inset:33.33% 0;border-top:1px solid rgba(255,255,255,.55);border-bottom:1px solid rgba(255,255,255,.55);pointer-events:none}',
    '.pe-crop::after{inset:0 33.33%;border:0;border-left:1px solid rgba(255,255,255,.55);border-right:1px solid rgba(255,255,255,.55)}',
    '.pe-crop i{position:absolute;width:18px;height:18px;border:3px solid #fff;touch-action:none}',
    '.pe-crop i.nw{left:-4px;top:-4px;border-width:4px 0 0 4px;cursor:nwse-resize}',
    '.pe-crop i.ne{right:-4px;top:-4px;border-width:4px 4px 0 0;cursor:nesw-resize}',
    '.pe-crop i.sw{left:-4px;bottom:-4px;border-width:0 0 4px 4px;cursor:nesw-resize}',
    '.pe-crop i.se{right:-4px;bottom:-4px;border-width:0 4px 4px 0;cursor:nwse-resize}',
    '.pe-side{flex:none;width:300px;display:flex;flex-direction:column;gap:6px}',
    '.pe-sec{margin-top:8px;font-size:12.5px;font-weight:700;color:#6b7280}',
    '.pe-sec:first-child{margin-top:0}',
    '.pe-seg{display:flex;flex-wrap:wrap;gap:6px}',
    '.pe-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:34px;padding:0 12px;border:1px solid #d9dde6;border-radius:8px;background:#fff;color:#1d2230;font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}',
    '.pe-btn:hover{background:#f5f6f9}',
    '.pe-btn.on{border-color:#3a5bff;background:#eef1ff;color:#2443e0}',
    '.pe-btn.pri{border-color:#2443e0;background:#2f50f0;color:#fff}',
    '.pe-btn.pri:hover{background:#2443e0}',
    '.pe-btn:disabled{opacity:.55;cursor:default}',
    '.pe-row{display:grid;grid-template-columns:42px 1fr 46px;align-items:center;gap:8px;font-size:13px}',
    '.pe-row input{width:100%;accent-color:#2f50f0}',
    '.pe-row .v{color:#6b7280;text-align:right;font-variant-numeric:tabular-nums}',
    '.pe-info{margin-top:auto;padding-top:10px;color:#6b7280;font-size:12.5px}',
    '.pe-foot{display:flex;align-items:center;gap:8px;padding:12px 18px;border-top:1px solid #e7e9ef}',
    '.pe-foot .pe-err{flex:1;color:#d22c3b;font-size:13px}',
    '.pe-note{margin:0;color:#4b5263;font-size:13.5px}',
    '.pe-frame-wrap{display:grid;place-items:center;padding:6px 0 4px}',
    '.pe-frame{position:relative;overflow:hidden;border-radius:12px;background:#e9ecf2;cursor:grab;touch-action:none;box-shadow:0 0 0 1px rgba(0,0,0,.08)}',
    '.pe-frame.drag{cursor:grabbing}',
    '.pe-frame img{display:block;width:100%;height:100%;object-fit:cover;pointer-events:none;user-select:none}',
    '.pe-frame-hint{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);padding:5px 10px;border-radius:999px;background:rgba(17,20,28,.62);color:#fff;font-size:12px;white-space:nowrap;pointer-events:none}',
    '.pe-zoom{display:grid;grid-template-columns:auto 34px 1fr 34px 52px;align-items:center;gap:8px;font-size:13px}',
    '.pe-zoom .pe-btn{width:34px;padding:0}',
    '.pe-zoom input{width:100%;accent-color:#2f50f0}',
    '.pe-zoom .v{color:#6b7280;text-align:right;font-variant-numeric:tabular-nums}',
    '@media (max-width:760px){.pe-body{flex-direction:column}.pe-side{width:auto}}'
  ].join('\n');

  function injectCss() {
    if (document.getElementById('pe-style')) return;
    var st = document.createElement('style');
    st.id = 'pe-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  function h(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (k === 'text') n.textContent = v;
      else if (k === 'on') Object.keys(v).forEach(function (ev) { n.addEventListener(ev, v[ev]); });
      else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  // 끄는 동안 손가락 · 마우스가 상자 밖으로 나가도 계속 따라오게(안 되는 환경이면 그냥 넘어가요)
  function capture(el, e) { try { el.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ } }
  var FILTER_OK = (function () { try { return typeof document.createElement('canvas').getContext('2d').filter === 'string'; } catch (e) { return false; } })();

  function filterCss(st) {
    var f = 'brightness(' + st.brightness + '%) contrast(' + st.contrast + '%) saturate(' + st.saturate + '%)';
    if (st.filter === 'gray') f += ' grayscale(100%)';
    else if (st.filter === 'sepia') f += ' sepia(75%)';
    else if (st.filter === 'warm') f += ' sepia(22%) saturate(115%)';
    else if (st.filter === 'cool') f += ' hue-rotate(-12deg) saturate(90%)';
    else if (st.filter === 'vivid') f += ' contrast(110%) saturate(135%)';
    return f;
  }
  function plain(st) { return st.brightness === 100 && st.contrast === 100 && st.saturate === 100 && st.filter === 'none'; }

  // 회전 · 뒤집기를 적용한 원본 크기 캔버스
  function oriented(img, st) {
    var rot = ((st.rotate % 360) + 360) % 360, swap = rot === 90 || rot === 270;
    var c = document.createElement('canvas');
    c.width = swap ? img.naturalHeight : img.naturalWidth;
    c.height = swap ? img.naturalWidth : img.naturalHeight;
    var ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(rot * Math.PI / 180);
    ctx.scale(st.flipH ? -1 : 1, st.flipV ? -1 : 1);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    return c;
  }

  function dialog(title, sub, small) {
    injectCss();
    var close = h('button', { type: 'button', 'class': 'pe-x', 'aria-label': '닫기', text: '×' });
    var box = h('div', { 'class': 'pe-box' + (small ? ' sm' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      h('div', { 'class': 'pe-head' }, [h('b', { text: title }), sub ? h('span', { 'class': 'pe-sub', text: sub }) : null, close])
    ]);
    var ov = h('div', { 'class': 'pe-ov' }, [box]);
    var last = document.activeElement, cleanups = [], closed = false;
    function done() {
      if (closed) return;
      closed = true;
      cleanups.forEach(function (fn) { fn(); });
      ov.remove();
      if (last && last.focus) try { last.focus(); } catch (e) { /* 무시 */ }
    }
    // Esc로 닫기, Tab은 창 안에서만 돌기(뒤의 화면으로 초점이 빠지지 않게)
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(); return; }
      if (e.key !== 'Tab') return;
      var list = [].filter.call(box.querySelectorAll('button, input, [tabindex="0"]'), function (el) { return !el.disabled && el.offsetParent !== null; });
      if (!list.length) return;
      var first = list[0], end = list[list.length - 1], at = document.activeElement;
      if (!box.contains(at)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && at === first) { e.preventDefault(); end.focus(); }
      else if (!e.shiftKey && at === end) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    cleanups.push(function () { document.removeEventListener('keydown', onKey, true); });
    close.addEventListener('click', done);
    // 바깥을 누르면 닫기. 단추를 두 번 눌러 연 경우 두 번째 클릭에 바로 닫히지 않게 잠깐은 무시
    var openedAt = Date.now();
    ov.addEventListener('pointerdown', function (e) { if (e.target === ov && Date.now() - openedAt > 400) done(); });
    document.body.appendChild(ov);
    close.focus();
    return { ov: ov, box: box, close: done, isClosed: function () { return closed; }, onClose: function (fn) { cleanups.push(fn); } };
  }

  // 투명한 곳이 있는지(줄여서 훑어봐요). 없으면 PNG도 JPG로 저장해 파일을 작게
  function hasAlpha(c) {
    try {
      var t = document.createElement('canvas');
      t.width = Math.min(256, c.width); t.height = Math.min(256, c.height);
      var x = t.getContext('2d');
      x.drawImage(c, 0, 0, t.width, t.height);
      var px = x.getImageData(0, 0, t.width, t.height).data;
      for (var i = 3; i < px.length; i += 4) if (px[i] < 255) return true;
      return false;
    } catch (e) { return true; }
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('사진을 불러오지 못했어요.')); };
      img.src = src;
    });
  }

  /* ───────── 사진 편집: 자르기 · 회전 · 보정 → 새 파일 ───────── */
  function edit(opts) {
    opts = opts || {};
    if (!opts.src || typeof opts.upload !== 'function') return;
    var st = { rotate: 0, flipH: false, flipV: false, brightness: 100, contrast: 100, saturate: 100, filter: 'none', ratio: 'free' };
    var ratios = (opts.ratios || []).filter(function (r) { return r && r.value > 0; }).map(function (r) { return [r.key, r.label, r.value]; }).concat(BASE_RATIOS);
    var startRatio = ratios.some(function (r) { return r[0] === opts.ratio; }) ? opts.ratio : 'free';
    var img = null, base = null, crop = null, view = { w: 0, h: 0, k: 1 };

    var d = dialog('사진 편집', '원래 사진은 그대로 두고, 편집한 사진을 새로 저장해요');
    var canvas = h('canvas');
    var cropBox = h('div', { 'class': 'pe-crop' }, ['nw', 'ne', 'sw', 'se'].map(function (p) { return h('i', { 'class': p, 'data-h': p }); }));
    var stage = h('div', { 'class': 'pe-stage' }, [canvas, cropBox]);
    var info = h('div', { 'class': 'pe-info', text: '사진을 불러오는 중…' });
    var err = h('div', { 'class': 'pe-err', role: 'alert' });

    function seg(items, key, pick) {
      var wrap = h('div', { 'class': 'pe-seg' });
      items.forEach(function (it) {
        var b = h('button', { type: 'button', 'class': 'pe-btn', 'data-v': it[0], text: it[1], on: { click: function () { st[key] = it[0]; mark(wrap, it[0]); if (pick) pick(it[0]); } } });
        wrap.appendChild(b);
      });
      mark(wrap, st[key]);
      return wrap;
    }
    function mark(wrap, v) { Array.prototype.forEach.call(wrap.children, function (b) { b.classList.toggle('on', b.getAttribute('data-v') === v); }); }
    function slider(label, key, min, max) {
      var inp = h('input', { type: 'range', min: min, max: max, value: st[key], 'aria-label': label });
      var val = h('span', { 'class': 'v', text: st[key] + '%' });
      inp.addEventListener('input', function () { st[key] = Number(inp.value); val.textContent = inp.value + '%'; paint(); });
      var row = h('label', { 'class': 'pe-row' }, [h('span', { text: label }), inp, val]);
      row.reset = function () { inp.value = st[key]; val.textContent = st[key] + '%'; };
      return row;
    }
    var ratioSeg = seg(ratios, 'ratio', function (r) { startCrop(r); });
    var filterSeg = seg(FILTERS, 'filter', function () { paint(); });
    var rows = [slider('밝기', 'brightness', 50, 150), slider('대비', 'contrast', 50, 150), slider('채도', 'saturate', 0, 200)];
    var side = h('div', { 'class': 'pe-side' }, [
      h('div', { 'class': 'pe-sec', text: '자르기 · 비율을 고른 뒤 상자를 끌어 맞춰요' }), ratioSeg,
      h('div', { 'class': 'pe-sec', text: '돌리기 · 뒤집기' }),
      h('div', { 'class': 'pe-seg' }, [
        h('button', { type: 'button', 'class': 'pe-btn', text: '↶ 왼쪽으로', on: { click: function () { st.rotate -= 90; rebuild(); } } }),
        h('button', { type: 'button', 'class': 'pe-btn', text: '↷ 오른쪽으로', on: { click: function () { st.rotate += 90; rebuild(); } } }),
        h('button', { type: 'button', 'class': 'pe-btn', text: '좌우 뒤집기', on: { click: function () { st.flipH = !st.flipH; rebuild(); } } }),
        h('button', { type: 'button', 'class': 'pe-btn', text: '상하 뒤집기', on: { click: function () { st.flipV = !st.flipV; rebuild(); } } })
      ])
    ].concat(FILTER_OK ? [h('div', { 'class': 'pe-sec', text: '밝기 · 색' })].concat(rows, [h('div', { 'class': 'pe-sec', text: '필터' }), filterSeg]) : [], [info]));
    var btnApply = h('button', { type: 'button', 'class': 'pe-btn pri', text: '적용', on: { click: apply } });
    d.box.appendChild(h('div', { 'class': 'pe-body' }, [h('div', { 'class': 'pe-stage-wrap' }, [stage]), side]));
    d.box.appendChild(h('div', { 'class': 'pe-foot' }, [err,
      h('button', { type: 'button', 'class': 'pe-btn', text: '처음으로', on: { click: resetAll } }),
      h('button', { type: 'button', 'class': 'pe-btn', text: '취소', on: { click: d.close } }),
      btnApply]));
    btnApply.disabled = true;

    function rebuild() { base = oriented(img, st); fit(); paint(); startCrop(st.ratio); }
    function fit() {
      var wrap = stage.parentElement.getBoundingClientRect();
      var maxW = Math.max(240, Math.min(wrap.width - 24, 700)), maxH = Math.max(220, Math.min(window.innerHeight - 260, 520));
      view.k = Math.min(1, maxW / base.width, maxH / base.height);
      view.w = Math.max(1, Math.round(base.width * view.k)); view.h = Math.max(1, Math.round(base.height * view.k));
      canvas.width = view.w; canvas.height = view.h;
      stage.style.width = view.w + 'px'; stage.style.height = view.h + 'px';
    }
    function paint() {
      if (!base) return;
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, view.w, view.h);
      ctx.drawImage(base, 0, 0, view.w, view.h);
      canvas.style.filter = plain(st) ? '' : filterCss(st);   // 화면은 CSS 필터로 미리 보기
      updateInfo();
    }
    function ratioOf(key) {
      var r = ratios.filter(function (x) { return x[0] === key; })[0];
      if (!r || !r[2]) return 0;
      return r[2] === -1 ? base.width / base.height : r[2];   // 원본 비율은 돌린 뒤의 가로/세로
    }
    function startCrop(key) {
      var ar = ratioOf(key);
      var w = base.width, hh = base.height;
      if (ar) { if (w / hh > ar) w = hh * ar; else hh = w / ar; }
      crop = { x: (base.width - w) / 2, y: (base.height - hh) / 2, w: w, h: hh };
      drawCrop();
    }
    function drawCrop() {
      cropBox.style.left = (crop.x * view.k) + 'px'; cropBox.style.top = (crop.y * view.k) + 'px';
      cropBox.style.width = (crop.w * view.k) + 'px'; cropBox.style.height = (crop.h * view.k) + 'px';
      updateInfo();
    }
    function outSize() {
      var w = Math.round(crop.w), hh = Math.round(crop.h), k = Math.min(1, MAX_SIDE / Math.max(w, hh));
      return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(hh * k)) };
    }
    function updateInfo() {
      if (!crop) return;
      var o = outSize();
      info.textContent = '원래 사진 ' + img.naturalWidth + '×' + img.naturalHeight + ' → 저장할 사진 ' + o.w + '×' + o.h;
    }

    // 자르기 상자 끌기(옮기기 · 모서리로 크기)
    var drag = null;
    cropBox.addEventListener('pointerdown', function (e) {
      if (!crop) return;
      e.preventDefault();
      capture(cropBox, e);
      drag = { mode: e.target.getAttribute('data-h') || 'move', sx: e.clientX, sy: e.clientY, s: { x: crop.x, y: crop.y, w: crop.w, h: crop.h } };
    });
    cropBox.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = (e.clientX - drag.sx) / view.k, dy = (e.clientY - drag.sy) / view.k, s = drag.s, W = base.width, H = base.height;
      var ar = ratioOf(st.ratio), min = MIN_CROP / view.k;
      if (drag.mode === 'move') {
        crop = { x: clamp(s.x + dx, 0, W - s.w), y: clamp(s.y + dy, 0, H - s.h), w: s.w, h: s.h };
      } else {
        var east = drag.mode.indexOf('e') >= 0, south = drag.mode.indexOf('s') >= 0;
        var ax = east ? s.x : s.x + s.w, ay = south ? s.y : s.y + s.h;          // 움직이지 않는 맞은편 모서리
        var px = clamp((east ? s.x + s.w : s.x) + dx, 0, W), py = clamp((south ? s.y + s.h : s.y) + dy, 0, H);
        var w = Math.max(min, east ? px - ax : ax - px), hh = Math.max(min, south ? py - ay : ay - py);
        if (ar) { if (w / hh > ar) hh = w / ar; else w = hh * ar; }
        var maxW = east ? W - ax : ax, maxH = south ? H - ay : ay;
        if (w > maxW) { w = maxW; if (ar) hh = w / ar; }
        if (hh > maxH) { hh = maxH; if (ar) w = hh * ar; }
        crop = { x: east ? ax : ax - w, y: south ? ay : ay - hh, w: w, h: hh };
      }
      drawCrop();
    });
    function endDrag() { drag = null; }
    cropBox.addEventListener('pointerup', endDrag);
    cropBox.addEventListener('pointercancel', endDrag);
    function onResize() { if (base) { var rel = crop && { x: crop.x, y: crop.y, w: crop.w, h: crop.h }; fit(); paint(); if (rel) { crop = rel; drawCrop(); } } }
    window.addEventListener('resize', onResize);
    d.onClose(function () { window.removeEventListener('resize', onResize); });

    function resetAll() {
      st.rotate = 0; st.flipH = st.flipV = false; st.brightness = st.contrast = st.saturate = 100; st.filter = 'none'; st.ratio = startRatio;
      rows.forEach(function (r) { r.reset(); }); mark(filterSeg, 'none'); mark(ratioSeg, st.ratio);
      rebuild();
    }

    function apply() {
      var o = outSize();
      var out = document.createElement('canvas'); out.width = o.w; out.height = o.h;
      var ctx = out.getContext('2d');
      if (FILTER_OK && !plain(st)) ctx.filter = filterCss(st);
      ctx.drawImage(base, crop.x, crop.y, crop.w, crop.h, 0, 0, o.w, o.h);
      var png = hasAlpha(out);   // 투명한 곳이 있으면 PNG(어떤 형식이든), 없으면 JPG
      var type = png ? 'image/png' : 'image/jpeg';
      btnApply.disabled = true; btnApply.textContent = '저장하는 중…'; err.textContent = '';
      try {
        out.toBlob(function (blob) {
          if (!blob) return fail('사진을 만들지 못했어요.');
          var stem = String(opts.name || 'photo').split(/[?#]/)[0].split('/').pop().replace(/\.[a-z0-9]+$/i, '').replace(/-edited(-\d+)?$/, '');
          var name = stem.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40) + '-edited' + (png ? '.png' : '.jpg');
          var file;
          try { file = new File([blob], name, { type: type }); } catch (e) { file = blob; file.name = name; }
          Promise.resolve(opts.upload(file)).then(function (res) {
            if (d.isClosed()) return;   // 올리는 동안 창을 닫았으면(취소) 사진을 바꾸지 않아요
            if (!res) return fail('사진을 저장하지 못했어요.');
            res.width = res.width || o.w; res.height = res.height || o.h;
            d.close();
            if (opts.onDone) opts.onDone(res);
          }).catch(function (e) { fail((e && e.message) || '사진을 저장하지 못했어요.'); });
        }, type, 0.9);
      } catch (e) {
        fail('이 사진은 편집한 결과를 저장할 수 없어요(다른 사이트의 사진).');
      }
    }
    function fail(msg) { err.textContent = msg; btnApply.disabled = false; btnApply.textContent = '적용'; }

    loadImage(opts.src).then(function (loaded) {
      img = loaded; st.ratio = startRatio; mark(ratioSeg, st.ratio);
      base = oriented(img, st);
      try { base.getContext('2d').getImageData(0, 0, 1, 1); } catch (e) { info.textContent = ''; err.textContent = '다른 사이트의 사진이라 편집할 수 없어요. 내 컴퓨터에 저장한 뒤 다시 올려 주세요.'; return; }
      fit(); paint(); startCrop(st.ratio);
      btnApply.disabled = false;
    }).catch(function (e) { info.textContent = ''; err.textContent = e.message; });
  }

  /* ───────── 썸네일 맞추기: 틀 안에서 보일 부분 · 확대 ───────── */
  function normFit(f) {
    f = f || {};
    return { x: clamp(isFinite(f.x) ? Number(f.x) : 50, 0, 100), y: clamp(isFinite(f.y) ? Number(f.y) : 50, 0, 100), z: clamp(isFinite(f.z) && f.z ? Number(f.z) : 1, 1, Z_MAX) };
  }
  function fitStyle(f) {
    if (!f) return '';
    var n = normFit(f), pos = n.x + '% ' + n.y + '%';
    return 'object-fit:cover;object-position:' + pos + ';transform-origin:' + pos + (n.z > 1 ? ';transform:scale(' + n.z + ')' : '');
  }

  function frame(opts) {
    opts = opts || {};
    if (!opts.src) return;
    var ratio = opts.ratio > 0 ? opts.ratio : 16 / 10, f = normFit(opts.fit);
    var d = dialog(opts.title || '썸네일 맞추기', '', true);
    var pic = h('img', { alt: '', draggable: 'false' });
    var hint = h('span', { 'class': 'pe-frame-hint', text: '끌어서 보일 부분을 옮겨요' });
    var box = h('div', { 'class': 'pe-frame' }, [pic, hint]);
    var zoom = h('input', { type: 'range', min: 100, max: Z_MAX * 100, step: 5, value: Math.round(f.z * 100), 'aria-label': '확대' });
    var zv = h('span', { 'class': 'v' });
    var err = h('div', { 'class': 'pe-err', role: 'alert' });
    function setZ(z) { f.z = clamp(Math.round(z * 100) / 100, 1, Z_MAX); zoom.value = Math.round(f.z * 100); show(); }
    d.box.appendChild(h('div', { 'class': 'pe-body', style: 'flex-direction:column;gap:12px' }, [
      h('p', { 'class': 'pe-note', text: opts.note || '카드에 보일 부분을 끌어서 정하고, 필요하면 확대해요. 사진 파일은 바뀌지 않아요.' }),
      h('div', { 'class': 'pe-frame-wrap' }, [box]),
      h('div', { 'class': 'pe-zoom' }, [h('span', { text: '확대' }),
        h('button', { type: 'button', 'class': 'pe-btn', 'aria-label': '작게', text: '−', on: { click: function () { setZ(f.z - 0.1); } } }), zoom,
        h('button', { type: 'button', 'class': 'pe-btn', 'aria-label': '크게', text: '+', on: { click: function () { setZ(f.z + 0.1); } } }), zv])
    ]));
    d.box.appendChild(h('div', { 'class': 'pe-foot' }, [err,
      h('button', { type: 'button', 'class': 'pe-btn', text: '가운데로', on: { click: function () { f = { x: 50, y: 50, z: 1 }; zoom.value = 100; show(); } } }),
      h('button', { type: 'button', 'class': 'pe-btn', text: '취소', on: { click: d.close } }),
      h('button', { type: 'button', 'class': 'pe-btn pri', text: '적용', on: { click: function () {
        d.close();
        if (opts.onDone) opts.onDone(f.x === 50 && f.y === 50 && f.z === 1 ? null : { x: Math.round(f.x), y: Math.round(f.y), z: f.z });
      } } })]));
    zoom.addEventListener('input', function () { f.z = Number(zoom.value) / 100; show(); });

    function size() {
      var maxW = Math.min(560, window.innerWidth - 80), maxH = Math.min(400, window.innerHeight - 300);
      var w = maxW, hh = w / ratio;
      if (hh > maxH) { hh = maxH; w = hh * ratio; }
      box.style.width = Math.round(w) + 'px'; box.style.height = Math.round(hh) + 'px';
    }
    function show() { pic.setAttribute('style', fitStyle(f)); zv.textContent = Math.round(f.z * 100) + '%'; }
    // 끌기: 보이는 범위가 사진 끝에서 끝까지 움직이도록, 끈 거리를 위치(%)로 바꿔요
    var drag = null;
    function range(axis) {
      var W = box.clientWidth, H = box.clientHeight, iw = pic.naturalWidth || 1, ih = pic.naturalHeight || 1;
      var s = Math.max(W / iw, H / ih), over = axis === 'x' ? iw * s - W : ih * s - H, side = axis === 'x' ? W : H;
      return f.z * over + side * (f.z - 1);
    }
    box.addEventListener('pointerdown', function (e) {
      e.preventDefault(); capture(box, e); box.classList.add('drag'); hint.hidden = true;
      drag = { sx: e.clientX, sy: e.clientY, x: f.x, y: f.y, rx: range('x'), ry: range('y') };
    });
    box.addEventListener('pointermove', function (e) {
      if (!drag) return;
      if (drag.rx > 0.5) f.x = clamp(drag.x - (e.clientX - drag.sx) / drag.rx * 100, 0, 100);
      if (drag.ry > 0.5) f.y = clamp(drag.y - (e.clientY - drag.sy) / drag.ry * 100, 0, 100);
      show();
    });
    function end() { drag = null; box.classList.remove('drag'); }
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    box.addEventListener('wheel', function (e) { e.preventDefault(); setZ(f.z - e.deltaY * 0.0015); }, { passive: false });
    window.addEventListener('resize', size);
    d.onClose(function () { window.removeEventListener('resize', size); });
    size(); show();
    pic.onerror = function () { err.textContent = '사진을 불러오지 못했어요.'; };
    pic.src = opts.src;
  }

  global.PhotoEditor = { edit: edit, frame: frame, fitStyle: fitStyle };
})(window);
