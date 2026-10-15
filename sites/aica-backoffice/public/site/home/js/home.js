/* =========================================================
   홈(랜딩) 첫 화면: 인사교 ARCHIVE 포스터의 움직임(카테고리 하이라이트 · 마우스 패럴랙스 · 진입 애니메이션)
   포스터 마크업 · 사진 · 링크는 home/index.html에 있습니다(서버 템플릿으로 그대로 옮길 수 있게 JS로 그리지 않음).
   헤더 · 메뉴 · 푸터는 공통 틀(common/js/site.js).
   ========================================================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const { reduce } = Site;

/* --- 홈: 카테고리 하이라이트 · 마우스 패럴랙스 · 진입 애니메이션 --- */
function setupHome(main){
  const grid=$('#axGrid',main), ax=$('.ax',main); if(!grid) return;
  const setCat=c=>{ if(c) ax.dataset.active=c; else delete ax.dataset.active; };
  $$('[data-cat]',ax).forEach(el=>{
    el.addEventListener('mouseenter',()=>setCat(el.dataset.cat));
    el.addEventListener('mouseleave',()=>setCat(null));
    el.addEventListener('focusin',()=>setCat(el.dataset.cat));
    el.addEventListener('focusout',()=>setCat(null));
  });
  requestAnimationFrame(()=>requestAnimationFrame(()=>ax.classList.add('is-in')));
  setTimeout(()=>ax.classList.add('is-settled'),reduce?0:2200);
  /* 터치 화면: 마우스 올리기 대신 문을 차례로 하나씩 깨움(01 → 02 → 03 → 04 → 오시는 길, 1.5초씩 — 10-14 사용자 '2.5초 너무 길다'). 들어오는 움직임이 끝난 뒤 시작, 포스터가 화면 밖이거나 탭이 숨으면 멈춤. 움직임 줄이기면 안 돎(CSS가 처음부터 컬러) */
  if(!reduce && matchMedia('(hover: none)').matches){
    const order=['1','2','3','4','5']; let i=-1, timer=0, seen=false, ready=false;
    const step=()=>{ i=(i+1)%order.length; setCat(order[i]); };
    const play=()=>{ if(timer||!ready||!seen||document.hidden) return; step(); timer=setInterval(step,1500); };
    const stop=()=>{ clearInterval(timer); timer=0; };
    new IntersectionObserver(([e])=>{ seen=e.isIntersecting; seen?play():stop(); },{threshold:.35}).observe(grid);
    document.addEventListener('visibilitychange',()=>document.hidden?stop():play());
    setTimeout(()=>{ ready=true; play(); },2200);
  }
  if(reduce || matchMedia('(hover: none)').matches) return;
  const layers=$$('[data-depth]',grid); let raf, tx=0, ty=0;
  const onMove=e=>{ const r=grid.getBoundingClientRect();
    tx=((e.clientX-r.left)/r.width-.5); ty=((e.clientY-r.top)/r.height-.5);
    cancelAnimationFrame(raf); raf=requestAnimationFrame(()=>layers.forEach(l=>{ const d=+l.dataset.depth; l.style.translate=`${(tx*d).toFixed(1)}px ${(ty*d).toFixed(1)}px`; })); };
  const onLeave=()=>layers.forEach(l=>l.style.translate='0px 0px');
  grid.addEventListener('mousemove',onMove); grid.addEventListener('mouseleave',onLeave);
}

/* 예전 해시 주소(#/메뉴/하위 메뉴)로 들어오면 그 페이지로 넘기고, 아니면 홈 움직임을 붙임 */
{
  const [, oldMenu, oldChild] = location.hash.split('/');
  if (oldMenu && Site.menu(oldMenu)) location.replace(Site.href(oldMenu, oldChild));
  else setupHome($('#main'));
}
