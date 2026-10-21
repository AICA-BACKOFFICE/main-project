/*
 * 미디어에서 고르기 창 — 글쓰기 화면(선배들의 이야기 양식)의 사진 칸에서 연다.
 *   MediaPicker.open({ api: '/admin/media/api', type: 'IMAGE', max: 3 }) → Promise([{ id, name, type, url, src }]) (닫으면 [])
 *   미디어 관리에 올라온 사진 · 동영상(모든 관리자 · 서포터즈가 올린 것)을 이름으로 찾아 여러 개 고를 수 있다.
 *   고른 미디어의 src(/uploads/{저장소 안 위치})를 글의 사진 칸에 적는다.
 */
(function (global) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function open(opts) {
    opts = opts || {};
    var max = Math.max(1, opts.max || 1), type = opts.type || 'IMAGE', api = opts.api || '/admin/media/api';
    return new Promise(function (resolve) {
      var picked = [], page = 1, keyword = '', loading = false;
      var back = document.createElement('div');
      back.className = 'mp-back';
      back.innerHTML = '<div class="mp-box" role="dialog" aria-modal="true" aria-label="미디어에서 고르기">'
        + '<div class="mp-head"><b>미디어에서 고르기</b><span class="mp-hint">' + (max > 1 ? max + '개까지 고를 수 있어요' : '하나를 골라 주세요') + '</span>'
        + '<button type="button" class="mp-x" data-mp="close" aria-label="닫기">×</button></div>'
        + '<form class="mp-search"><input class="input" type="search" placeholder="이름으로 찾기" aria-label="이름으로 찾기"><button class="btn sm" type="submit">찾기</button></form>'
        + '<div class="mp-grid" aria-live="polite"></div>'
        + '<div class="mp-more" hidden><button type="button" class="btn sm" data-mp="more">더 보기</button></div>'
        + '<div class="mp-foot"><span class="mp-count">0개 고름</span><button type="button" class="btn" data-mp="close">닫기</button>'
        + '<button type="button" class="btn primary" data-mp="ok" disabled>넣기</button></div></div>';
      var grid = back.querySelector('.mp-grid'), more = back.querySelector('.mp-more');
      var count = back.querySelector('.mp-count'), ok = back.querySelector('[data-mp="ok"]');

      function done(list) {
        document.removeEventListener('keydown', key, true);
        back.remove();
        resolve(list);
      }
      function key(e) { if (e.key === 'Escape') { e.preventDefault(); done([]); } }
      function sync() {
        count.textContent = picked.length + '개 고름';
        ok.disabled = !picked.length;
        ok.textContent = picked.length ? '넣기 (' + picked.length + ')' : '넣기';
        [].forEach.call(grid.querySelectorAll('[data-id]'), function (el) {
          var at = picked.map(function (p) { return String(p.id); }).indexOf(el.getAttribute('data-id'));
          el.classList.toggle('on', at > -1);
          el.setAttribute('aria-pressed', String(at > -1));
          var n = el.querySelector('.mp-n'); if (n) n.textContent = at > -1 ? String(at + 1) : '';
        });
      }
      function load(reset) {
        if (loading) return;
        loading = true;
        if (reset) { page = 1; grid.innerHTML = '<p class="mp-empty">불러오는 중…</p>'; }
        var url = api + (api.indexOf('?') < 0 ? '?' : '&') + 'type=' + encodeURIComponent(type) + '&page=' + page + '&keyword=' + encodeURIComponent(keyword);
        fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then(function (r) {
          if (!r.ok) throw new Error('미디어 목록을 불러오지 못했어요 (' + r.status + ')');
          return r.json();
        }).then(function (res) {
          if (reset) grid.innerHTML = '';
          res.items.forEach(function (m) {
            var el = document.createElement('button');
            el.type = 'button';
            el.className = 'mp-item';
            el.setAttribute('data-id', m.id);
            el.title = m.name;
            el._media = m;
            el.innerHTML = '<span class="mp-ph">' + (m.type === 'VIDEO' ? '<video src="' + esc(m.url) + '#t=0.5" preload="metadata" muted></video>' : '<img src="' + esc(m.url) + '" alt="" loading="lazy">')
              + '<span class="mp-n"></span></span><span class="mp-name">' + esc(m.name) + '</span>';
            grid.appendChild(el);
          });
          if (!grid.children.length) grid.innerHTML = '<p class="mp-empty">' + (keyword ? '찾는 이름의 미디어가 없어요.' : '아직 미디어 관리에 올린 ' + (type === 'VIDEO' ? '동영상' : '사진') + '이 없어요.') + '</p>';
          more.hidden = !res.hasNext;
          page = res.page + 1;
          sync();
        }).catch(function (e) {
          grid.innerHTML = '<p class="mp-empty">' + esc(e.message) + '</p>';
        }).then(function () { loading = false; });
      }

      back.addEventListener('click', function (e) {
        if (e.target === back) return done([]);
        var b = e.target.closest('[data-mp]');
        if (b) {
          var act = b.getAttribute('data-mp');
          if (act === 'close') return done([]);
          if (act === 'ok') return done(picked.slice());
          if (act === 'more') return load(false);
        }
        var item = e.target.closest('.mp-item');
        if (!item) return;
        var m = item._media, at = picked.map(function (p) { return p.id; }).indexOf(m.id);
        if (at > -1) picked.splice(at, 1);
        else if (max === 1) picked = [m];
        else if (picked.length >= max) { if (global.notify) global.notify(max + '개까지 고를 수 있어요.', true); return; }
        else picked.push(m);
        sync();
      });
      back.querySelector('.mp-search').addEventListener('submit', function (e) {
        e.preventDefault();
        keyword = back.querySelector('.mp-search input').value.trim();
        load(true);
      });
      document.addEventListener('keydown', key, true);
      document.body.appendChild(back);
      load(true);
      back.querySelector('.mp-search input').focus();
    });
  }

  global.MediaPicker = { open: open };
})(window);
