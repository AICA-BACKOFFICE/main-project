/*
 * AICA 블록 에디터 — image-editor: 이미지 블록 기본 보정 (자르기 · 회전 · 반전 · 크기 · 밝기/대비/채도 · 필터)
 *   브라우저 캔버스에서 편집한 결과를 새 이미지로 업로드하고 블록의 url 을 바꿔 끼운다. 원본 파일은 그대로 남는다.
 *   업로드한 이미지(/uploads/..)만 편집할 수 있다 — 외부 주소 이미지는 캔버스가 오염(tainted)되어 내보낼 수 없다.
 * 로드 순서: render.js 뒤, index.js 앞
 */
(function (BE, global) {
  'use strict';
  var el = BE.el, toast = BE.toast, upload = BE.upload;
  var Editor = BE.Editor;

  var RATIOS = [['free', '자유'], ['orig', '원본 비율'], ['1:1', '1:1'], ['4:3', '4:3'], ['16:9', '16:9'], ['3:4', '3:4']];
  var FILTERS = [['none', '없음'], ['gray', '흑백'], ['sepia', '세피아'], ['warm', '따뜻하게'], ['cool', '차갑게']];
  var MAX_W = 2400;

  function filterCss(st) {
    var f = 'brightness(' + st.brightness + '%) contrast(' + st.contrast + '%) saturate(' + st.saturate + '%)';
    if (st.filter === 'gray') f += ' grayscale(100%)';
    else if (st.filter === 'sepia') f += ' sepia(80%)';
    else if (st.filter === 'warm') f += ' sepia(25%) saturate(' + Math.round(st.saturate * 1.15) + '%)';
    else if (st.filter === 'cool') f += ' hue-rotate(-12deg) saturate(' + Math.round(st.saturate * 0.9) + '%)';
    return f;
  }

  /** 회전·반전을 적용한 오프스크린 캔버스 */
  function oriented(img, st) {
    var rot = ((st.rotate % 360) + 360) % 360;
    var swap = rot === 90 || rot === 270;
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

  Editor.prototype.openImageEditor = function (block, onDone) {
    var self = this;
    if (!block.url) return;
    if (!/^\/uploads\//.test(block.url)) { toast('업로드한 이미지만 편집할 수 있습니다. 외부 주소 이미지는 먼저 내 컴퓨터에 저장한 뒤 업로드하세요.', true); return; }

    var st = { rotate: 0, flipH: false, flipV: false, brightness: 100, contrast: 100, saturate: 100, filter: 'none', ratio: 'free', scale: 100 };
    var crop = null;            // {x,y,w,h} in oriented-image pixels (null = 전체)
    var img = new Image();
    var base = null;            // oriented canvas
    var view = { w: 0, h: 0, k: 1 };   // 화면 표시 크기와 축척

    var stage = el('div', { 'class': 'ie-stage' });
    var canvas = el('canvas', { 'class': 'ie-canvas' });
    var cropBox = el('div', { 'class': 'ie-crop', hidden: 'hidden' });
    ['nw', 'ne', 'sw', 'se'].forEach(function (p) { cropBox.appendChild(el('i', { 'class': 'h ' + p, 'data-h': p })); });
    stage.appendChild(canvas); stage.appendChild(cropBox);
    var info = el('div', { 'class': 'ie-info' });
    var err = el('div', { 'class': 'be-dlg-err' });

    function slider(label, key, min, max) {
      var inp = el('input', { type: 'range', min: min, max: max, value: st[key] });
      var val = el('span', { 'class': 'v', text: st[key] + '%' });
      inp.addEventListener('input', function () { st[key] = Number(inp.value); val.textContent = inp.value + '%'; paint(); });
      var row = el('label', { 'class': 'ie-row' }, [el('span', { text: label }), inp, val]);
      row._reset = function () { inp.value = st[key]; val.textContent = st[key] + '%'; };
      return row;
    }
    function seg(items, key, onPick) {
      var wrap = el('div', { 'class': 'ie-seg' });
      items.forEach(function (it) {
        var b = el('button', { type: 'button', 'class': 'be-btn' + (st[key] === it[0] ? ' pri' : ''), text: it[1], on: { click: function () {
          st[key] = it[0];
          Array.prototype.forEach.call(wrap.children, function (c) { c.classList.toggle('pri', c === b); });
          onPick && onPick(it[0]);
        } } });
        wrap.appendChild(b);
      });
      return wrap;
    }

    var bright = slider('밝기', 'brightness', 50, 150), contrast = slider('대비', 'contrast', 50, 150), sat = slider('채도', 'saturate', 0, 200);
    var sizeLabel = el('span', { 'class': 'v' });
    var sizeInp = el('input', { type: 'range', min: 20, max: 100, value: 100 });
    sizeInp.addEventListener('input', function () { st.scale = Number(sizeInp.value); updateInfo(); });

    var controls = el('div', { 'class': 'ie-controls' }, [
      el('div', { 'class': 'ie-sec', text: '자르기' }),
      seg(RATIOS, 'ratio', function (r) { startCrop(r); }),
      el('div', { 'class': 'ie-sec', text: '회전 · 반전' }),
      el('div', { 'class': 'ie-seg' }, [
        el('button', { type: 'button', 'class': 'be-btn', text: '↶ 90°', on: { click: function () { st.rotate -= 90; rebuild(); } } }),
        el('button', { type: 'button', 'class': 'be-btn', text: '↷ 90°', on: { click: function () { st.rotate += 90; rebuild(); } } }),
        el('button', { type: 'button', 'class': 'be-btn', text: '좌우 반전', on: { click: function () { st.flipH = !st.flipH; rebuild(); } } }),
        el('button', { type: 'button', 'class': 'be-btn', text: '상하 반전', on: { click: function () { st.flipV = !st.flipV; rebuild(); } } })
      ]),
      el('div', { 'class': 'ie-sec', text: '보정' }),
      bright, contrast, sat,
      el('div', { 'class': 'ie-sec', text: '필터' }),
      seg(FILTERS, 'filter', function () { paint(); }),
      el('div', { 'class': 'ie-sec', text: '내보내기 크기' }),
      el('label', { 'class': 'ie-row' }, [el('span', { text: '크기' }), sizeInp, sizeLabel]),
      info
    ]);

    var overlay = el('div', { 'class': 'be-picker be-dlg ie-dlg' });
    var btnApply = el('button', { type: 'button', 'class': 'be-btn pri', text: '적용 (새 이미지로 저장)', on: { click: apply } });
    overlay.appendChild(el('div', { 'class': 'box' }, [
      el('div', { 'class': 'head' }, [el('b', { text: '이미지 편집' }), el('button', { type: 'button', 'class': 'be-btn', text: '닫기', on: { click: close } })]),
      el('div', { 'class': 'ie-body' }, [stage, controls]),
      err,
      el('div', { 'class': 'be-dlg-foot' }, [
        el('button', { type: 'button', 'class': 'be-btn', text: '초기화', on: { click: resetAll } }),
        el('button', { type: 'button', 'class': 'be-btn', text: '취소', on: { click: close } }),
        btnApply
      ])
    ]));
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
    function close() { overlay.remove(); document.removeEventListener('keydown', onKey); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);

    /* ---- 그리기 ---- */
    function rebuild() { base = oriented(img, st); crop = null; cropBox.hidden = true; st.ratio = 'free'; fit(); paint(); }
    function fit() {
      var maxW = Math.min(680, window.innerWidth - 420), maxH = Math.min(460, window.innerHeight - 260);
      view.k = Math.min(1, maxW / base.width, maxH / base.height);
      view.w = Math.round(base.width * view.k); view.h = Math.round(base.height * view.k);
      canvas.width = view.w; canvas.height = view.h;
      stage.style.width = view.w + 'px'; stage.style.height = view.h + 'px';
    }
    function paint() {
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, view.w, view.h);
      ctx.filter = filterCss(st);
      ctx.drawImage(base, 0, 0, view.w, view.h);
      ctx.filter = 'none';
      updateInfo();
    }
    function outSize() {
      var r = crop || { w: base.width, h: base.height };
      var k = st.scale / 100;
      var w = Math.round(r.w * k), h = Math.round(r.h * k);
      if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
      return { w: Math.max(1, w), h: Math.max(1, h) };
    }
    function updateInfo() {
      var o = outSize();
      sizeLabel.textContent = st.scale + '%';
      info.textContent = '원본 ' + img.naturalWidth + '×' + img.naturalHeight + (crop ? ' · 자르기 ' + Math.round(crop.w) + '×' + Math.round(crop.h) : '') + ' → 저장 ' + o.w + '×' + o.h + (o.w === MAX_W ? ' (긴 변 ' + MAX_W + 'px 제한)' : '');
    }

    /* ---- 자르기 박스 ---- */
    function ratioOf(r) {
      if (r === 'orig') return base.width / base.height;
      if (r === 'free') return 0;
      var p = r.split(':'); return Number(p[0]) / Number(p[1]);
    }
    function startCrop(r) {
      var ar = ratioOf(r);
      var w = base.width, h = base.height;
      if (ar) { if (w / h > ar) w = h * ar; else h = w / ar; w *= 0.9; h *= 0.9; } else { w *= 0.8; h *= 0.8; }
      crop = { x: (base.width - w) / 2, y: (base.height - h) / 2, w: w, h: h };
      cropBox.hidden = false; drawCrop();
    }
    function drawCrop() {
      if (!crop) return;
      cropBox.style.left = (crop.x * view.k) + 'px'; cropBox.style.top = (crop.y * view.k) + 'px';
      cropBox.style.width = (crop.w * view.k) + 'px'; cropBox.style.height = (crop.h * view.k) + 'px';
      updateInfo();
    }
    var drag = null;
    cropBox.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var h = e.target.getAttribute && e.target.getAttribute('data-h');
      drag = { mode: h || 'move', sx: e.clientX, sy: e.clientY, start: { x: crop.x, y: crop.y, w: crop.w, h: crop.h } };
    });
    function onMove(e) {
      if (!drag || !crop) return;
      var dx = (e.clientX - drag.sx) / view.k, dy = (e.clientY - drag.sy) / view.k, s = drag.start, ar = ratioOf(st.ratio);
      var n = { x: s.x, y: s.y, w: s.w, h: s.h };
      if (drag.mode === 'move') { n.x = s.x + dx; n.y = s.y + dy; }
      else {
        var right = drag.mode.indexOf('e') >= 0, bottom = drag.mode.indexOf('s') >= 0;
        if (right) n.w = s.w + dx; else { n.x = s.x + dx; n.w = s.w - dx; }
        if (bottom) n.h = s.h + dy; else { n.y = s.y + dy; n.h = s.h - dy; }
        if (ar) { var nh = n.w / ar; if (!bottom) n.y += n.h - nh; n.h = nh; }
      }
      n.w = Math.max(20, Math.min(n.w, base.width)); n.h = Math.max(20, Math.min(n.h, base.height));
      n.x = Math.max(0, Math.min(n.x, base.width - n.w)); n.y = Math.max(0, Math.min(n.y, base.height - n.h));
      crop = n; drawCrop();
    }
    function onUp() { drag = null; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    function resetAll() {
      st.rotate = 0; st.flipH = st.flipV = false; st.brightness = st.contrast = st.saturate = 100; st.filter = 'none'; st.scale = 100;
      [bright, contrast, sat].forEach(function (r) { r._reset(); }); sizeInp.value = 100;
      Array.prototype.forEach.call(controls.querySelectorAll('.ie-seg'), function (sg) {
        Array.prototype.forEach.call(sg.children, function (b, i) { b.classList.toggle('pri', i === 0 && (b.textContent === '자유' || b.textContent === '없음')); });
      });
      rebuild();
    }

    /* ---- 적용: 캔버스 → 업로드 → 블록 교체 ---- */
    function apply() {
      var o = outSize();
      var out = document.createElement('canvas'); out.width = o.w; out.height = o.h;
      var ctx = out.getContext('2d');
      ctx.filter = filterCss(st);
      var r = crop || { x: 0, y: 0, w: base.width, h: base.height };
      ctx.drawImage(base, r.x, r.y, r.w, r.h, 0, 0, o.w, o.h);
      var isPng = /\.png$/i.test(block.url);
      btnApply.disabled = true; btnApply.textContent = '저장 중…'; err.textContent = '';
      try {
        out.toBlob(function (blob) {
          if (!blob) { fail('이미지를 만들지 못했습니다.'); return; }
          var name = (block.alt || 'image').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) + '-edited' + (isPng ? '.png' : '.jpg');
          var file = new File([blob], name, { type: isPng ? 'image/png' : 'image/jpeg' });
          upload(file, self.opts.uploadUrl).then(function (res) {
            block.url = res.url;
            close();
            onDone && onDone();
            self.changed();
            toast('편집한 이미지로 바꿨습니다. 원본 파일은 보관함에 그대로 남아 있습니다.');
          }).catch(function (e) { fail(e.message); });
        }, isPng ? 'image/png' : 'image/jpeg', 0.9);
      } catch (e) { fail('이 이미지는 편집 결과를 내보낼 수 없습니다 (외부 이미지).'); }
    }
    function fail(msg) { err.textContent = msg; btnApply.disabled = false; btnApply.textContent = '적용 (새 이미지로 저장)'; }

    img.onload = function () { base = oriented(img, st); fit(); paint(); };
    img.onerror = function () { err.textContent = '이미지를 불러오지 못했습니다.'; };
    img.src = block.url;
  };
})(window.BlockEditor = window.BlockEditor || {}, window);
