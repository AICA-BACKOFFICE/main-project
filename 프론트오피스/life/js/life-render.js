/* =========================================================
   인사교 라이프 — 생활 꿀팁 카드 · 시설 둘러보기 사진 그리기
   카드와 시설 사진은 페이지에 적어 두지 않고 백오피스 DB에서 받아요(관리자 페이지 '인사교 라이프 게시물 관리').
   window.LIFE_DATA 로 받아요(head의 defer 순서):
     1) js/life-data.js         — 사본(백오피스가 꺼져 있을 때 · 서버 없이 볼 때). 백오피스가 저장할 때마다 다시 써요
     2) ../api/public/life.js   — 백오피스 공개 API(DB의 지금 카드). 불러오면 1)을 덮어써요
   - 오늘 점심, 여기 어때요?(#fdList): 식당 → 카페 카드, 탭의 식당 · 카페 수
   - 수업 끝나고, 바람 쐬러 가요(#tp-fun .fsg): 묶음마다 겹친 사진 카드(ol.fsl)와 오른쪽 이름 목록(.fs-names)
   탭 · 거르기 · 페이지 넘김 · 펼치기는 지금처럼 js/life.js가 맡아요. 이 파일은 그보다 먼저 불러옵니다.
   ========================================================= */
(function () {
  'use strict';
  var D = window.LIFE_DATA;
  if (!D) return;
  var ROTATE = [-5, 3, -2, 4, -3];   // 겹친 사진 카드가 기우는 각도(시안)
  var PENDING = '<span class="fdc-pht"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.6-2h6.8L17 8h3v11H4z"></path>'
    + '<circle cx="12" cy="13.5" r="3.4"></circle></svg>사진 준비 중</span>';

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
  // 글자 칸: 줄바꿈 없는 띄어쓰기는 &nbsp; 로(메뉴는 ' · ' 앞에서 줄이 바뀌지 않게)
  function txt(t) { return esc(t).replace(/ /g, '&nbsp;'); }
  function menu(t) { return txt(t).replace(/ · /g, '&nbsp;· '); }

  /* ── 오늘 점심, 여기 어때요? ── */
  var list = document.getElementById('fdList');
  if (list && D.food) {
    var count = { food: 0, cafe: 0 };
    list.innerHTML = D.food.map(function (f) {
      count[f.t] = (count[f.t] || 0) + 1;
      var n = esc(f.name), photo = f.src
        ? '<div class="fdc-ph has-img" role="img" aria-label="' + n + ' 대표 메뉴 그림" data-field="photo"><img src="' + esc(f.src) + '" alt="" loading="lazy">'
          + '<span class="fdc-cat" data-field="category">' + txt(f.category) + '</span></div>'
        : '<div class="fdc-ph" role="img" aria-label="' + n + ' 사진 자리(사진 준비 중)" data-field="photo">'
          + '<span class="fdc-cat" data-field="category">' + txt(f.category) + '</span>' + PENDING + '</div>';
      var who = f.g === 'group' ? '여럿이 가기 좋아요' : f.t === 'cafe' ? '혼자 가기 편해요' : '혼밥하기 편해요';
      return '<li class="fdc" data-t="' + esc(f.t) + '" data-g="' + esc(f.g) + '" data-w="' + esc(f.w) + '"' + (f.t === 'cafe' ? ' hidden' : '') + '>'
        + photo
        + '<div class="fdc-b"><div class="fdc-gw"><p class="fdc-g ' + esc(f.g) + '">' + who + '</p><span class="fdc-wk" data-field="walk">도보 약 ' + esc(f.w) + '분</span></div>'
        + '<h3 data-field="name">' + txt(f.name) + '</h3><p class="fdc-m" data-field="menu">' + menu(f.menu) + '</p></div>'
        + (f.review ? '<figure class="fdc-r"><figcaption><b>선배 후기</b>' + (f.example ? '<span class="bdg ex">예시</span>' : '') + '</figcaption>'
          + '<blockquote data-field="review">' + txt(f.review) + '</blockquote></figure>' : '')
        + '</li>';
    }).join('');
    ['food', 'cafe'].forEach(function (k) {
      var n = document.querySelector('#fdk-' + k + ' span');
      if (n) n.textContent = count[k] || 0;
    });
  }

  /* ── 수업 끝나고, 바람 쐬러 가요 ── */
  [].forEach.call(document.querySelectorAll('#tp-fun .fsg[data-k]'), function (g) {
    var cards = (D.fun || {})[g.getAttribute('data-k')];
    if (!cards) return;
    var ol = g.querySelector('ol.fsl'), names = g.querySelector('.fs-names'), open = g.querySelector('.fs-tg .o');
    if (ol) ol.innerHTML = cards.map(function (c, i) {
      var n = esc(c.name);
      var photo = c.src
        ? '<span class="fsc-ph" style="background-image:url(' + esc(c.src) + ')" role="img" aria-label="' + n + '" data-field="photo"></span>'
        : '<span class="fsc-ph ' + esc(c.cls) + '" role="img" aria-label="' + n + '" data-field="photo"></span>';
      return '<li class="fsc" style="--i:' + i + ';--rt:' + ROTATE[i % ROTATE.length] + 'deg;--z:' + (cards.length - i) + '">' + photo
        + '<span class="fsc-b"><b data-field="name">' + txt(c.name) + '</b><small data-field="distance">' + txt(c.distance) + '</small>'
        + '<span class="fsc-t" data-field="fee">' + txt(c.fee) + '</span><span class="fsc-d" data-field="summary">' + txt(c.summary) + '</span></span></li>';
    }).join('');
    if (names) names.innerHTML = cards.map(function (c) { return '<li>' + txt(c.name) + '</li>'; }).join('');
    // 'n곳 펼쳐 보기'처럼 숫자가 있는 시안이면 숫자도 맞춰요
    if (open && /^\d+곳/.test(open.textContent)) open.textContent = open.textContent.replace(/^\d+/, cards.length);
  });

  /* ── 시설 둘러보기(#pg-facility .bx9-s): 공간마다 사진 넘김 · 작은 사진 · 첫 사진 설명과 'N장' · 공간 탭 아이콘 · '사진 예시' 표시 ──
     사진 하나: cls(사이트에 원래 있던 그림, life.css 의 im-이름) 또는 src(올린 사진) · bs 확대 · bp 가운데에 보일 곳 · caption 설명 */
  function photoAttrs(p, withSize) {
    var style = (p.src ? 'background-image:url(' + p.src + ');' : '') + (withSize && p.bs ? '--bs:' + p.bs + ';' : '') + (p.bp ? '--bp:' + p.bp + ';' : '');
    return { cls: p.cls ? ' ' + esc(p.cls) : '', style: style ? ' style="' + esc(style) + '"' : '' };
  }
  [].forEach.call(document.querySelectorAll('#pg-facility .bx9-s[id]'), function (s) {
    var space = (D.fac || {})[s.id];
    if (!space || !space.photos || !space.photos.length) return;
    var photos = space.photos, ph = s.querySelector('.bx9-ph'), tr = s.querySelector('.bx9-tr'), th = s.querySelector('.bx9-th');
    if (tr) tr.innerHTML = photos.map(function (p) {
      var a = photoAttrs(p, true);
      return '<div class="bx9-sl' + a.cls + '"' + a.style + ' role="img" aria-label="' + esc(p.caption) + '"></div>';
    }).join('');
    if (th) th.innerHTML = photos.map(function (p, i) {
      var a = photoAttrs(p, true);
      return '<button type="button" class="bx9-tb' + a.cls + '"' + a.style + ' aria-label="' + esc(p.caption) + ' 보기"' + (i === 0 ? ' aria-current="true"' : '') + '></button>';
    }).join('');
    if (ph) {
      // '사진 예시' · '임시 사진' 표시: 사진 넘김 바로 뒤
      [].forEach.call(ph.querySelectorAll('.bx-ex'), function (x) { x.remove(); });
      if (tr && (space.badge === 'ex' || space.badge === 'tmp')) {
        var badge = document.createElement('span');
        badge.className = space.badge === 'tmp' ? 'bx-ex tmp' : 'bx-ex';
        badge.textContent = space.badge === 'tmp' ? '임시 사진' : '사진 예시';
        tr.insertAdjacentElement('afterend', badge);
      }
      var cap = ph.querySelector('.bx9-cap');
      if (cap) cap.innerHTML = '<span>' + esc(photos[0].caption) + '</span><span class="bx9-n"><b>1</b> / ' + photos.length + '</span>';
      var label = ph.getAttribute('aria-label') || '';
      ph.setAttribute('aria-label', /사진 \d+장$/.test(label) ? label.replace(/\d+장$/, photos.length + '장') : label + ' 사진 ' + photos.length + '장');
    }
    // 공간 탭의 동그란 아이콘 = 첫 사진(확대는 빼고 늘 꽉 차게)
    var tab = document.getElementById(s.getAttribute('aria-labelledby') || ''), icon = tab && tab.querySelector('.bx9-tt');
    if (icon) {
      var a = photoAttrs(photos[0], false);
      icon.outerHTML = '<span class="bx9-tt' + a.cls + '" aria-hidden="true"' + a.style + '></span>';
    }
  });
})();
