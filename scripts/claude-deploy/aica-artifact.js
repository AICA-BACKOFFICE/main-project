/* 인사교 사이트 시안(Claude 배포 링크)용 페이지 스크립트.
   배포 링크의 틀(사이트 보기 · 편집하기) 안에서 열리면, 이 페이지에 반영된 편집본이 있을 때 그 내용으로 바꿔 보여 주고
   편집 화면 안에서는 편집기를 붙여 줍니다. 틀 밖에서 열리면(그냥 파일로 열기 등) 아무것도 하지 않아요.
   배포 빌드(artifact/build.cjs)가 각 페이지 <head> 바로 뒤에 넣는 파일이라, 페이지 원본에는 들어 있지 않아요. */
(function () {
  'use strict';

  function findShell() {
    var w = window;
    for (var depth = 0; depth < 8; depth++) {
      try { if (w.AICA_SHELL) return w.AICA_SHELL; } catch (e) {}
      if (w.parent === w) break;
      w = w.parent;
    }
    return null;
  }

  // 폴더 주소 링크(…/about/)는 배포 링크에서 열리지 않을 수 있어 파일 주소(…/about/index.html)로 바꿔 엽니다.
  document.addEventListener('click', function (event) {
    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!link || link.target === '_blank') return;
    var url;
    try { url = new URL(link.getAttribute('href'), location.href); } catch (e) { return; }
    if (url.origin !== location.origin || !/\/$/.test(url.pathname)) return;
    link.href = url.pathname + 'index.html' + url.search + url.hash;
  }, true);

  var shell = findShell();
  if (!shell || !shell.ready) return;
  var mode = '';
  try { mode = (window.frameElement && window.frameElement.getAttribute('data-bo-mode')) || ''; } catch (e) {}
  if (!mode) mode = new URLSearchParams(location.search).get('__bo') || '';
  var html = shell.pageHtml(location.pathname, mode);
  // 바꿔 보여 줄 글을 지금 자리에 써 넣고, 원래 파일의 나머지는 <plaintext>로 받아 실행·표시되지 않게 합니다.
  if (html) document.write(html + '<plaintext style="display:none">');
})();
