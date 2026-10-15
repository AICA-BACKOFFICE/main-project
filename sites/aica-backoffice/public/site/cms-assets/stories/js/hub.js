/* 선배들의 이야기 — 한눈에 보기(stories/index.html, 10-13 사본): 흐르는 한마디 멈춤 단추 + 키보드 초점 자리 맞춤.
   흐름 · 마우스 멈춤 · 움직임 줄이기는 CSS(css/hub.css)가 맡음. 터치에서는 멈출 방법이 없어 단추를 둠(5초 넘게 움직이는 내용은 멈출 수 있어야 함, WCAG 2.2.2).
   단추는 HTML에 hidden으로 있고 여기서 보이게 함 → 스크립트가 없으면 동작 안 하는 단추도 보이지 않음 */
(function(){
  var b = document.querySelector('.hb-lq-pp'), lq = document.querySelector('.hb-lq');
  if (!b || !lq) return;
  b.hidden = false;
  b.addEventListener('click', function(){
    var stop = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', stop ? 'true' : 'false');
    lq.classList.toggle('is-paused', stop);
  });
  /* 키보드 초점(10-13 다듬기): 초점이 들어오면 CSS가 흐름을 풀고 손으로 넘기는 줄로 바꿈(.hb-lq:has(a:focus-visible)).
     브라우저는 흐름이 풀리기 전 자리로 스크롤해서 초점 링크 앞부분이 칸 밖에 남음 → 다음 그림에서 링크 시작을 칸 왼쪽에 맞춤 */
  lq.addEventListener('focusin', function(e){
    var a = e.target;
    if (!a.matches || !a.matches(':focus-visible')) return;
    requestAnimationFrame(function(){
      lq.scrollLeft += a.getBoundingClientRect().left - lq.getBoundingClientRect().left;
    });
  });
})();
