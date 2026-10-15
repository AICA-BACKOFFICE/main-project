/* 선배들의 이야기 제목 줄 항상 보이기(10-13): 큰 제목이 헤더 밑으로 지나가면 헤더 바로 아래에 얇은 제목 띠(.st-mhf)가 붙어 따라옴 */
(function(){
  var mh=document.querySelector('#main > .st-mh'); if(!mh) return;
  var t=mh.querySelector('.st-mh-t'); if(!t) return;
  var bar=document.createElement('div'); bar.className='st-mhf'; bar.setAttribute('aria-hidden','true');
  bar.innerHTML='<div class="wrap"><p class="st-mhf-t">'+t.innerHTML+'</p></div>';
  document.body.appendChild(bar);
  var io=new IntersectionObserver(function(es){ var on=!es[0].isIntersecting; bar.classList.toggle('on',on); document.documentElement.classList.toggle('mh-stuck',on); },
    {rootMargin:'-'+(parseInt(getComputedStyle(document.documentElement).getPropertyValue('--hdr'))||72)+'px 0px 0px 0px'});
  io.observe(t);
})();

/* 왼쪽 메뉴 시작 높이를 제목 배너 아래에 맞춤(배너 높이가 고정이 아니라서 계산) */
(function(){
  var mh=document.querySelector('#main > .st-mh'), m=document.getElementById('main'); if(!mh||!m||m.classList.contains('life-page')) return;   // 라이프는 life.js가 화면마다 맞춤
  function f(){ var r=document.getElementById('siteLnb'); if(!r||innerWidth<1200){ m.style.removeProperty('--lnb-top'); return; }
    var gap=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mh-gap'))||56;
    m.style.setProperty('--lnb-top',(mh.getBoundingClientRect().bottom-r.getBoundingClientRect().top+gap+4)+'px'); }
  addEventListener('load',f); addEventListener('resize',f); if(document.fonts) document.fonts.ready.then(f);
})();
