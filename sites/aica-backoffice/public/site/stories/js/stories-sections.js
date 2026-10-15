/* =========================================================
   선배들의 이야기 — 섹션별 추가 동작
   (전체 인터뷰 목록 · 영상 인터뷰 재생, 인터뷰 페이지만)
   stories.js보다 먼저 불러옵니다(defer 순서)
   글 수 숫자(전체 인터뷰 옆 개수 · 더 보기 남은 수)는 안 씀(2026-10-08 사용자 결정)
   ========================================================= */

(function(){
  var sec=document.getElementById('iv-all');if(!sec)return;
  var src=[].slice.call(document.querySelectorAll('#p-iv .ivgrid a.iv'));
  var D=src.map(function(a){
    var av=a.querySelector('.by .av'),c=av?parseInt(av.textContent,10):0,dur=a.querySelector('.ph .dur');
    return {a:a,c:c,v:!!dur,t:(a.querySelector('h3')||{}).textContent||'',s:(a.querySelector('.tb p')||{}).textContent||'',n:(a.querySelector('.by b')||{}).textContent||'',tr:(a.querySelector('.by em')||{}).textContent||''};
  });
  var STEP=6,pg=1,coh='all',view='grid';   // 10-13: '더 보기' → 기수별 이모저모와 같은 숫자 페이지(6개씩)
  try{view=localStorage.getItem('iva-view')||'grid'}catch(e){}
  var out=sec.querySelector('.iva-out'),more=sec.querySelector('.iva-more'),empty=sec.querySelector('.iva-empty');
  function chip(box,val,label,curv){var b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-pressed',val===curv);b.onclick=function(){coh=val;pg=1;draw()};box.appendChild(b)}
  function chips(){
    var cb=sec.querySelector('[data-f=coh]');cb.innerHTML='';
    chip(cb,'all','전체 기수',coh);
    [['7','7기'],['6','6기'],['3-5','3–5기']].forEach(function(g){chip(cb,g[0],g[1],coh)});
  }
  function card(d){
    var a=document.createElement('a');a.className='iva-c';a.href=d.a.getAttribute('href');
    if(d.a.target){a.target=d.a.target;a.rel='noopener'}
    var ph=d.a.querySelector('.ph').cloneNode(true);ph.querySelectorAll('[id]').forEach(function(x){x.removeAttribute('id')});
    a.appendChild(ph);
    var tx=document.createElement('div');
    var h=document.createElement('h4');h.textContent=d.t;if(d.v){var bd=document.createElement('span');bd.className='iva-badge';bd.textContent='영상';h.appendChild(bd)}
    var p=document.createElement('p');p.textContent=d.s;tx.appendChild(h);tx.appendChild(p);a.appendChild(tx);
    // 10-13: 기수 동그라미 대신 '7기 · 김ㅇㅇ · AI 모델링' 한 줄 글자
    var by=document.createElement('div');by.className='by by-t';by.textContent=[d.c?d.c+'기':'',d.n,d.tr].filter(Boolean).join(' · ');
    if(view==='grid')tx.appendChild(by);else a.appendChild(by);
    return a;
  }
  function draw(){
    chips();
    sec.querySelectorAll('.iva-seg button').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.v===view)});
    var list=D.filter(function(d){return (coh==='all'||(coh==='3-5'?(d.c>=3&&d.c<=5):String(d.c)===coh))});
    out.dataset.view=view;out.innerHTML='';
    var pages=Math.max(1,Math.ceil(list.length/STEP));if(pg>pages)pg=pages;
    list.slice((pg-1)*STEP,pg*STEP).forEach(function(d){out.appendChild(card(d))});
    empty.hidden=list.length>0;
    more.hidden=true;
    nav.innerHTML='';nav.hidden=pages<2;
    if(pages>1){
      nav.appendChild(pbtn('←',pg-1,{dis:pg===1,aria:'이전 페이지'}));
      for(var i=1;i<=pages;i++)nav.appendChild(pbtn(String(i),i,{cur:i===pg,aria:i+'페이지'}));
      nav.appendChild(pbtn('→',pg+1,{dis:pg===pages,aria:'다음 페이지'}));
    }
  }
  var nav=document.createElement('nav');nav.className='cpager';nav.setAttribute('aria-label','인터뷰 페이지');more.parentNode.insertBefore(nav,more);
  function pbtn(label,to,o){var b=document.createElement('button');b.type='button';b.textContent=label;
    if(o.cur)b.setAttribute('aria-current','page');if(o.dis)b.disabled=true;if(o.aria)b.setAttribute('aria-label',o.aria);
    b.onclick=function(){pg=to;draw();var top=sec.getBoundingClientRect().top+scrollY-140;scrollTo({top:top,behavior:'smooth'})};return b}
  sec.querySelectorAll('.iva-seg button').forEach(function(b){b.onclick=function(){view=b.dataset.v;try{localStorage.setItem('iva-view',view)}catch(e){}draw()}});
  draw();
})();

(function(){
  var box=document.querySelector('#iv-7 .ivvid');if(!box)return;var orig=box.innerHTML;
  function bind(){var b=box.querySelector('.ivplay');if(b)b.onclick=function(){
    var f=document.createElement('iframe');f.src='https://www.youtube-nocookie.com/embed/'+box.dataset.yt+'?autoplay=1&rel=0&playsinline=1';
    f.title='6기 수료생 인터뷰 — 인프라 직군';f.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';f.allowFullscreen=true;
    var tag=box.querySelector('.ivtag');box.innerHTML='';if(tag)box.appendChild(tag);box.appendChild(f);f.focus();
  }}
  bind();
  // 다른 곳으로 가면 재생을 멈추고 처음 그림으로 되돌림
  addEventListener('hashchange',function(){if(location.hash!=='#iv-7'&&box.querySelector('iframe')){box.innerHTML=orig;bind()}});
})();
