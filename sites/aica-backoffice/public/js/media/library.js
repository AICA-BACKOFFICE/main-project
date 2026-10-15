/*
 * 자산 관리 화면: 여러 파일 업로드(버튼·드래그 앤 드롭) → 폴더에 저장 → 새로고침, 주소 복사, 표시 이름 인라인 수정
 * 업로드는 에디터와 같은 BlockEditor.upload(core.js) — 이미지는 올리기 전에 줄이고(prepareImage), 동영상·PDF 는 그대로 보낸다.
 */
(function () {
  'use strict';
  var cfg = document.getElementById('mediaConfig');
  if (!cfg) return;
  var uploadUrl = cfg.dataset.uploadUrl;
  var kind = cfg.dataset.kind || 'ALL';
  var catSel = document.getElementById('uploadCategory');
  var subSel = document.getElementById('uploadSubCategory');
  if (window.CategorySelect && catSel && subSel) CategorySelect.bind(catSel, subSel);
  // 카드의 분류 이동: 카테고리나 세부를 바꾸면 바로 저장(카테고리를 바꾸면 세부는 비워진 채 저장되고, 이어서 세부를 고르면 다시 저장)
  document.querySelectorAll('.media-move-form').forEach(function (form) {
    var c = form.querySelector('.move-cat'), sub = form.querySelector('.move-sub');
    if (!window.CategorySelect || !c || !sub) return;
    CategorySelect.bind(c, sub, { autoSubmit: form });
  });
  var ACCEPT = /^(image\/(jpeg|png|gif|webp)|video\/(mp4|webm|quicktime)|application\/pdf)$/;
  var EXT = /\.(jpe?g|png|gif|webp|mp4|m4v|mov|webm|pdf)$/i;
  var LIMIT = { image: 10 * 1024 * 1024, video: 200 * 1024 * 1024, doc: 20 * 1024 * 1024 };
  function kindOf(f) { if (/^video\//.test(f.type) || /\.(mp4|m4v|mov|webm)$/i.test(f.name)) return 'video'; if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) return 'doc'; return 'image'; }
  var input = document.getElementById('uploadInput');
  var btn = document.getElementById('uploadBtn');
  var drop = document.getElementById('dropZone');
  var progress = document.getElementById('uploadProgress');
  var busy = false;

  function uploadQuery() {
    var q = [];
    if (catSel && catSel.value) q.push('categoryId=' + encodeURIComponent(catSel.value));
    if (subSel && subSel.value && !subSel.disabled) q.push('subCategoryId=' + encodeURIComponent(subSel.value));
    return q.length ? uploadUrl + (uploadUrl.indexOf('?') < 0 ? '?' : '&') + q.join('&') : uploadUrl;
  }

  function uploadAll(fileList) {
    var all = Array.prototype.slice.call(fileList || []);
    var files = all.filter(function (f) { return ACCEPT.test(f.type) || EXT.test(f.name); });
    if (!files.length) { window.notify('이미지(JPG·PNG·GIF·WEBP), 동영상(MP4·WEBM), 문서(PDF)만 올릴 수 있습니다.', true); return; }
    var tooBig = files.filter(function (f) { var k = kindOf(f); return k !== 'image' && f.size > LIMIT[k]; });
    if (tooBig.length) { window.notify(tooBig[0].name + ' — ' + (kindOf(tooBig[0]) === 'video' ? '동영상은 200MB' : '문서는 20MB') + ' 이하만 올릴 수 있습니다.', true); files = files.filter(function (f) { return tooBig.indexOf(f) < 0; }); if (!files.length) return; }
    if (busy) { window.notify('업로드가 진행 중입니다. 잠시 기다려 주세요.', true); return; }
    busy = true; btn.disabled = true;
    var url = uploadQuery(), done = 0, failed = [];
    progress.hidden = false;
    var totalMb = files.reduce(function (a, f) { return a + f.size; }, 0) / 1048576;
    function tick(cur) { progress.textContent = '업로드 중… ' + done + ' / ' + files.length + (cur ? ' — ' + cur : '') + (totalMb > 20 ? ' (총 ' + totalMb.toFixed(0) + 'MB, 동영상은 시간이 걸릴 수 있습니다)' : '') + (failed.length ? ' · 실패 ' + failed.length : ''); }
    tick();
    var chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () {
        tick(f.name);
        return window.BlockEditor.upload(f, url).catch(function (e) { failed.push(f.name + ': ' + (e && e.message || '실패')); })
          .then(function () { done++; tick(); });
      });
    });
    chain.then(function () {
      busy = false; btn.disabled = false;
      var target = (catSel && catSel.value) ? catSel.value : 'unfiled';
      var subQ = (subSel && subSel.value && !subSel.disabled) ? '&sub=' + encodeURIComponent(subSel.value) : '';
      if (failed.length) {
        window.notify(failed[0] + (failed.length > 1 ? ' 외 ' + (failed.length - 1) + '건 실패' : ''), true);
        setTimeout(function () { location.href = location.pathname + '?cat=' + target + subQ + '&kind=' + encodeURIComponent(kind); }, 1800);
      } else {
        location.href = location.pathname + '?cat=' + target + subQ + '&kind=' + encodeURIComponent(kind);
      }
    });
  }

  if (btn && input) {
    btn.addEventListener('click', function () { input.value = ''; input.click(); });
    input.addEventListener('change', function () { if (input.files && input.files.length) uploadAll(input.files); });
  }

  if (drop) {
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
    });
    drop.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) uploadAll(e.dataTransfer.files);
    });
  }

  // 표시 이름 인라인 수정: 포커스 시 저장 버튼 표시, Enter 저장, Esc 되돌리기
  document.querySelectorAll('.media-rename-form').forEach(function (form) {
    var inp = form.querySelector('.name-input'); if (!inp || inp.readOnly) return;
    var orig = inp.value;
    inp.addEventListener('focus', function () { form.classList.add('editing'); });
    inp.addEventListener('blur', function () { setTimeout(function () { if (inp.value === orig) form.classList.remove('editing'); }, 150); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { inp.value = orig; inp.blur(); form.classList.remove('editing'); }
    });
    form.addEventListener('submit', function (e) { if (!inp.value.trim()) { e.preventDefault(); window.notify('표시 이름을 입력하세요.', true); inp.focus(); } });
    // 연필 아이콘: 이름 칸으로 가서 글자를 모두 골라 바로 고칠 수 있게
    var pen = form.querySelector('.name-edit');
    if (pen) pen.addEventListener('click', function () { form.classList.add('editing'); inp.focus(); inp.select(); });
  });

  // 주소 복사
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.copy-url');
    if (!b) return;
    var url = location.origin + b.dataset.url;
    var p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(url) : Promise.reject();
    p.then(function () { window.notify('파일 주소를 복사했습니다.'); })
     .catch(function () { window.prompt('아래 주소를 복사하세요', url); });
  });
})();
