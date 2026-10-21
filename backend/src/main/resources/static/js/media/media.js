/*
 * 게시물 관리 › 미디어 관리 (templates/media/index.html)
 *   - 올리기: 고른 사진 · 동영상을 하나씩 /admin/media/api/upload 로 보내고(큰 동영상도 한 번에 하나씩), 다 올리면 목록을 새로 고침
 *   - 이름 바꾸기: 카드의 '이름 바꾸기'를 누르면 입력 칸이 열리고, 저장하면 이름만 바뀜(파일 · 주소 · 그 미디어를 쓰는 글은 그대로)
 */
(function () {
  'use strict';
  var box = document.getElementById('mdUpload');
  var input = document.getElementById('mdFiles');
  var progress = document.getElementById('mdProgress');
  var meta = function (n) { var m = document.querySelector('meta[name="' + n + '"]'); return m ? m.getAttribute('content') : ''; };
  function toast(msg, err) { if (window.notify) window.notify(msg, err); else alert(msg); }

  function uploadOne(file) {
    var body = new FormData();
    body.append('file', file);
    var headers = {};
    headers[meta('_csrf_header') || 'X-CSRF-TOKEN'] = meta('_csrf');
    return fetch(box.dataset.api, { method: 'POST', body: body, headers: headers, credentials: 'same-origin' })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (res) {
          if (!r.ok) throw new Error((file.name ? file.name + ': ' : '') + (res.message || '올리지 못했어요 (' + r.status + ')'));
          return res;
        });
      });
  }

  if (box && input) {
    input.addEventListener('change', function () {
      var files = [].slice.call(input.files || []);
      input.value = '';
      if (!files.length) return;
      var max = Number(box.dataset.max) || 20;
      if (files.length > max) { toast('한 번에 ' + max + '개까지 올릴 수 있어요. 앞의 ' + max + '개만 올릴게요.', true); files = files.slice(0, max); }
      var done = 0, failed = [];
      var check = window.BOSession ? window.BOSession.check() : Promise.resolve(true);
      check.then(function (ok) {
        if (!ok) throw new Error('로그인이 풀려서 올리지 못했어요. 다시 로그인한 뒤 한 번 더 해 주세요.');
        return files.reduce(function (chain, file) {
          return chain.then(function () {
            progress.textContent = '올리는 중… ' + (done + failed.length + 1) + ' / ' + files.length;
            return uploadOne(file).then(function () { done++; }, function (e) { failed.push(e.message); });
          });
        }, Promise.resolve());
      }).then(function () {
        progress.textContent = '';
        if (failed.length) toast(failed.join('\n'), true);
        if (done) location.reload();
      }).catch(function (e) { progress.textContent = ''; toast(e.message, true); });
    });
  }

  // 이름 바꾸기: 입력 칸 열기 · 닫기
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-md]');
    if (!b) return;
    var card = b.closest('.md-card');
    var form = card && card.querySelector('.md-rename');
    if (!form) return;
    var open = b.dataset.md === 'rename';
    form.hidden = !open;
    card.querySelector('.md-name').hidden = open;
    card.querySelector('.md-acts').hidden = open;
    if (open) { var f = form.querySelector('input[name="name"]'); f.focus(); f.select(); }
  });
})();
