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
  // 기수 버튼: 3–5기만 한 묶음, 6기부터는 기수마다 따로(지금은 7기 · 6기 · 3–5기)
  var CS=D.map(function(d){return d.c}).filter(function(v,i,a){return v&&a.indexOf(v)===i}).sort(function(a,b){return b-a});
  var COHS=CS.filter(function(v){return v>5}).map(String);if(CS.some(function(v){return v>=3&&v<=5}))COHS.push('3-5');COHS=COHS.concat(CS.filter(function(v){return v<3}).map(String));
  var STEP=6,shown=STEP,coh='all',kind='all',view='grid';
  try{view=localStorage.getItem('iva-view')||'grid'}catch(e){}
  var out=sec.querySelector('.iva-out'),more=sec.querySelector('.iva-more'),empty=sec.querySelector('.iva-empty');
  function chip(box,val,label,curv){var b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-pressed',val===curv);b.onclick=function(){if(box.dataset.f==='coh')coh=val;else kind=val;shown=STEP;draw()};box.appendChild(b)}
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
    var by=document.createElement('div');by.className='by';by.innerHTML='<span class="av">'+d.c+'<i>기</i></span>';
    var b=document.createElement('b');b.textContent=d.n;var em=document.createElement('em');em.textContent=d.tr;var bn=document.createElement('span');bn.className='bn';bn.appendChild(b);bn.appendChild(em);by.appendChild(bn);
    if(view==='grid')tx.appendChild(by);else a.appendChild(by);
    return a;
  }
  function draw(){
    chips();
    sec.querySelectorAll('.iva-seg button').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.v===view)});
    var list=D.filter(function(d){return (coh==='all'||(coh.indexOf('-')>0?(d.c>=+coh.split('-')[0]&&d.c<=+coh.split('-')[1]):String(d.c)===coh))&&(kind==='all'||(kind==='v')===d.v)});
    out.dataset.view=view;out.innerHTML='';
    list.slice(0,shown).forEach(function(d){out.appendChild(card(d))});
    empty.hidden=list.length>0;
    more.hidden=list.length<=shown;more.textContent='더 보기';
  }
  more.onclick=function(){shown+=STEP;draw()};
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
