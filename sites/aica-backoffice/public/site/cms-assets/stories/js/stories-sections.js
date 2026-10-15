/* =========================================================
   선배들의 이야기 — 섹션별 추가 동작
   (히어로 캐러셀 · 인터뷰 아카이브 · 영상 인터뷰 재생 · 프로젝트 넘김 등)
   stories.js보다 먼저 불러옵니다(defer 순서)
   글 수 숫자(전체 인터뷰 옆 개수 · 더 보기 남은 수)는 안 씀(2026-10-08 사용자 결정)
   ========================================================= */

(function(){
  var root=document.getElementById('hx');if(!root)return;
  var pn=[].slice.call(root.querySelectorAll('.hx-pn')),cur=0,t=null,hold=false,DUR=3000;
  var reduce=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  function go(i){cur=(i+pn.length)%pn.length;pn.forEach(function(p,k){var on=k===cur;p.classList.toggle('on',on);var tx=p.querySelector('.hx-tx');tx.inert=!on;tx.setAttribute('aria-hidden',on?'false':'true');p.querySelector('.hx-open').tabIndex=on?-1:0});if(hold)paint();run()}
  var segs=[].slice.call(root.querySelectorAll('.hx-segs button'));
  function paint(){segs.forEach(function(s,k){s.classList.toggle('done',k<cur);s.classList.remove('run');s.classList.toggle('hold',hold)});var s=segs[cur];if(s){void s.offsetWidth;s.classList.add('run')}}
  function run(){clearTimeout(t);if(hold){segs.forEach(function(s){s.classList.add('hold')});return}t=setTimeout(function(){go(cur+1)},DUR);paint()}
  segs.forEach(function(s,k){s.addEventListener('click',function(){go(k)})});
  pn.forEach(function(p,k){p.querySelector('.hx-open').addEventListener('click',function(){go(k)})});
  var row=root.querySelector('.hx-row')||root;
  row.addEventListener('pointerenter',function(e){if(e.pointerType==='mouse'){hold=true;run()}});
  row.addEventListener('pointerleave',function(e){if(e.pointerType==='mouse'){hold=false;run()}});
  row.addEventListener('pointerdown',function(e){if(e.pointerType!=='mouse'){hold=true;run()}});
    root.addEventListener('keydown',function(e){if(e.key==='ArrowRight')go(cur+1);if(e.key==='ArrowLeft')go(cur-1)});
  go(0);
})();

(function(){
  var sec=document.getElementById('iv-all');if(!sec)return;
  var src=[].slice.call(document.querySelectorAll('#p-iv .ivgrid a.iv'));
  var D=src.map(function(a){
    var av=a.querySelector('.by .av'),c=av?parseInt(av.textContent,10):0,dur=a.querySelector('.ph .dur');
    return {a:a,c:c,v:!!dur,t:(a.querySelector('h3')||{}).textContent||'',s:(a.querySelector('.tb p')||{}).textContent||'',n:(a.querySelector('.by b')||{}).textContent||'',tr:(a.querySelector('.by em')||{}).textContent||''};
  });
  // 기수 버튼: 3–5기만 한 묶음, 6기부터는 기수마다 따로(지금은 7기 · 6기 · 3–5기). 새 기수 인터뷰가 올라오면 버튼이 저절로 생겨요(백오피스)
  var CS=D.map(function(d){return d.c}).filter(function(v,i,a){return v&&a.indexOf(v)===i}).sort(function(a,b){return b-a});
  var COHS=CS.filter(function(v){return v>5}).map(String);if(CS.some(function(v){return v>=3&&v<=5}))COHS.push('3-5');COHS=COHS.concat(CS.filter(function(v){return v<3}).map(String));
  var STEP=6,pg=1,coh='all',kind='all',view='grid';   // 10-13: '더 보기' → 기수별 이모저모와 같은 숫자 페이지(6개씩)
  try{view=localStorage.getItem('iva-view')||'grid'}catch(e){}
  var out=sec.querySelector('.iva-out'),more=sec.querySelector('.iva-more'),empty=sec.querySelector('.iva-empty');
  function chip(box,val,label,curv){var b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-pressed',val===curv);b.onclick=function(){if(box.dataset.f==='coh')coh=val;else kind=val;pg=1;draw()};box.appendChild(b)}
  function chips(){
    var cb=sec.querySelector('[data-f=coh]'),kb=sec.querySelector('[data-f=kind]');cb.innerHTML='';if(kb)kb.innerHTML='';
    chip(cb,'all','전체 기수',coh);
    COHS.forEach(function(k){chip(cb,k,k.replace('-','–')+'기',coh)});
    if(kb){chip(kb,'all','글·영상',kind);chip(kb,'t','글',kind);chip(kb,'v','영상',kind);}
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
    var list=D.filter(function(d){return (coh==='all'||(coh.indexOf('-')>0?(d.c>=+coh.split('-')[0]&&d.c<=+coh.split('-')[1]):String(d.c)===coh))&&(kind==='all'||(kind==='v')===d.v)});
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

/* 영상 인터뷰: 재생 단추를 누르면 그 자리에서 유튜브가 재생(관리자가 올린 영상 인터뷰 모두) */
[].forEach.call(document.querySelectorAll('.ivd .ivvid'),function(box){
  var d=box.closest('.ivd'),orig=box.innerHTML,h=d.querySelector('h2');
  function bind(){var b=box.querySelector('.ivplay');if(b)b.onclick=function(){
    var f=document.createElement('iframe');f.src='https://www.youtube-nocookie.com/embed/'+box.dataset.yt+'?autoplay=1&rel=0&playsinline=1';
    f.title=h?h.textContent:'인터뷰 영상';f.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';f.allowFullscreen=true;
    var tag=box.querySelector('.ivtag');box.innerHTML='';if(tag)box.appendChild(tag);box.appendChild(f);f.focus();
  }}
  bind();
  // 다른 곳으로 가면 재생을 멈추고 처음 그림으로 되돌림
  addEventListener('hashchange',function(){if(location.hash!=='#'+d.id&&box.querySelector('iframe')){box.innerHTML=orig;bind()}});
});

/* 프로젝트 넘김: 화살표 · 썸네일(label)을 누르면 브라우저가 숨은 라디오로 포커스를 옮기며 화면을 끌어올림 → 직접 고르고 포커스는 옮기지 않음 */
(function(){
  var sec=document.getElementById('p-pr');if(!sec)return;
  sec.addEventListener('click',function(e){
    var l=e.target.closest('label[for^="pr"]');if(!l||!sec.contains(l))return;
    var r=document.getElementById(l.getAttribute('for'));if(!r||r.type!=='radio')return;
    e.preventDefault();var y=window.scrollY;
    if(!r.checked){r.checked=true;r.dispatchEvent(new Event('change',{bubbles:true}))}
    requestAnimationFrame(function(){if(Math.abs(window.scrollY-y)>2)window.scrollTo(0,y)});
  });
})();
