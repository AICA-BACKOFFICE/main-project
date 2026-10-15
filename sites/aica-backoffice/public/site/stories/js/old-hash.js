/* 옛 주소 이어 주기(10-13 사본): 이야기가 한 페이지 탭이던 때의 주소(stories/index.html#reviews · #iv-3 · #r-life-0 …)로 오면 나뉜 페이지로.
   한눈에 보기(index.html)의 <head>에서 defer 없이 읽음 → 한눈에 보기 안 id는 r- · iv- · q- · pj- · tg- 로 시작하지 않게 */
(function(){
  function go(){
  var h = decodeURIComponent(location.hash.slice(1)); if (!h) return;
  var to = { reviews:'reviews.html', interviews:'interviews.html', projects:'projects.html', cohorts:'cohorts.html',
    'go-iv':'interviews.html', 'go-pr':'projects.html', 'go-coh':'cohorts.html',
    'p-rev':'reviews.html', 'p-iv':'interviews.html', 'p-pr':'projects.html', 'p-coh':'cohorts.html', 'iv-all':'interviews.html',
    'write-rev':'reviews.html', 'write-iv':'interviews.html', 'write-pr':'projects.html', 'write-coh':'cohorts.html' }[h];   // 없앤 쓰기 창 옛 주소(10-08)
  if (!to) {
    if (/^(r-|tg-)/.test(h)) to = 'reviews.html#' + h;
    else if (/^(iv-|q-)/.test(h)) to = 'interviews.html#' + h;
    else if (/^pj-/.test(h)) to = 'projects.html#' + h;
  }
  if (to) location.replace(to);
  }
  go();
  addEventListener('hashchange', go);   // 허브를 연 채로 옛 주소(#reviews 등)만 바뀌어도(같은 문서 안 이동이라 다시 안 읽힘)
})();
