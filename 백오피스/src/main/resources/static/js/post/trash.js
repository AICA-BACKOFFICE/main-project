(function () {
  'use strict';
  var form = document.getElementById('trash-bulk-form');
  if (!form) return;
  var boxes = Array.prototype.slice.call(document.querySelectorAll('.trash-select'));
  var all = document.getElementById('trash-select-all');
  var clear = document.getElementById('trash-clear-selection');
  var actions = Array.prototype.slice.call(form.querySelectorAll('[data-trash-action]'));
  function selected() { return boxes.filter(function (box) { return box.checked; }); }
  function refresh() {
    var count = selected().length;
    document.getElementById('trash-selected-count').textContent = count + '개 선택';
    all.checked = boxes.length > 0 && count === boxes.length;
    all.indeterminate = count > 0 && count < boxes.length;
    actions.forEach(function (button) { button.disabled = count === 0; });
    clear.disabled = count === 0;
    boxes.forEach(function (box) { box.closest('tr').classList.toggle('trash-row-selected', box.checked); });
  }
  all.addEventListener('change', function () { boxes.forEach(function (box) { box.checked = all.checked; }); refresh(); });
  clear.addEventListener('click', function () { boxes.forEach(function (box) { box.checked = false; }); refresh(); });
  boxes.forEach(function (box) { box.addEventListener('change', refresh); });
  form.addEventListener('submit', function (event) {
    var count = selected().length;
    var action = event.submitter && event.submitter.dataset.trashAction || 'purge';
    if (!count || form.dataset.submitting === 'true') { event.preventDefault(); return; }
    if (action === 'purge' && !window.confirm('선택한 ' + count + '개 게시물을 완전히 삭제할까요?\n복구할 수 없습니다.')) {
      event.preventDefault(); return;
    }
    document.getElementById('trash-bulk-action').value = action;
    form.dataset.submitting = 'true';
    form.setAttribute('aria-busy', 'true');
  });
  window.addEventListener('pageshow', function () { form.dataset.submitting = 'false'; form.removeAttribute('aria-busy'); refresh(); });
  refresh();
})();
