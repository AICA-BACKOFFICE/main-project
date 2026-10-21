/*
 * 카테고리 → 세부 카테고리 연동 셀렉트 (글 관리 필터 · 글쓰기 콘텐츠 속성 공용)
 *   세부 셀렉트의 option 에 data-parent="상위 id" 를 모두 렌더해 두면, 선택한 카테고리의 하위만 남긴다.
 *   하위가 없는 카테고리(인터뷰·프로젝트)를 고르면 세부 셀렉트는 비활성화된다.
 *   CategorySelect.bind(catSel, subSel, { autoSubmit: form })
 */
(function (global) {
  'use strict';
  function bind(catSel, subSel, opts) {
    if (!catSel || !subSel) return;
    opts = opts || {};
    var all = Array.prototype.slice.call(subSel.querySelectorAll('option[data-parent]')).map(function (o) {
      return { value: o.value, text: o.textContent, parent: o.getAttribute('data-parent'), selected: o.selected };
    });
    var placeholder = subSel.querySelector('option:not([data-parent])');
    var placeholderText = placeholder ? placeholder.textContent : '세부 카테고리';
    function rebuild(keep) {
      var cat = catSel.value;
      var prev = keep === undefined ? subSel.value : keep;
      var items = all.filter(function (o) { return cat && o.parent === cat; });
      subSel.innerHTML = '';
      var ph = document.createElement('option'); ph.value = '';
      ph.textContent = items.length ? placeholderText : (cat ? '세부 없음' : placeholderText);
      subSel.appendChild(ph);
      items.forEach(function (o) { var el = document.createElement('option'); el.value = o.value; el.textContent = o.text; subSel.appendChild(el); });
      subSel.disabled = !items.length;
      subSel.value = items.some(function (o) { return o.value === prev; }) ? prev : '';
      subSel.classList.toggle('is-off', !items.length);
    }
    var initial = all.filter(function (o) { return o.selected; }).map(function (o) { return o.value; })[0] || '';
    rebuild(initial);
    catSel.addEventListener('change', function () {
      rebuild('');
      if (opts.autoSubmit) opts.autoSubmit.submit();
      if (typeof opts.onChange === 'function') opts.onChange();
    });
    subSel.addEventListener('change', function () {
      if (opts.autoSubmit) opts.autoSubmit.submit();
      if (typeof opts.onChange === 'function') opts.onChange();
    });
    return { rebuild: rebuild };
  }
  global.CategorySelect = { bind: bind };
})(window);
