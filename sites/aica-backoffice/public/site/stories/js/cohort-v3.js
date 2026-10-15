/* 기수별 이모저모 — 선배들의 이야기 v3 시안(인스타 프로필형): 기수 칩 → 프로필(기수 동그라미 · 계정 · 게시물/영상/기록) → 달별 하이라이트 → 3열 정사각 격자 → 페이지 · 글 창
   자료는 cohorts.html 안 <template id="cv3-data">의 카드(a.st)에서 읽음: 기수(.cg) · 날짜(.dt) · 제목(h3) · 요약(p) · 그림(.illu) · 영상(data-yt) */
(function(){
  var root=document.getElementById('cv3'); if(!root) return;
  var tpl=document.getElementById('cv3-data').content;
  var D=[].slice.call(tpl.querySelectorAll('a.st')).map(function(a){
    var dt=(a.querySelector('.dt')||{}).textContent||'', m=dt.match(/(\d{4})\.\s*(\d{2})\.\s*(\d{2})/);
    return {coh:parseInt((a.querySelector('.cg')||{}).textContent,10)||0, date:dt.trim(), y:m?+m[1]:0, mo:m?+m[2]:0,
      title:(a.querySelector('h3')||{}).textContent||'', sum:(a.querySelector('p')||{}).textContent||'',
      illu:a.querySelector('.illu'), yt:a.getAttribute('data-yt')||''};
  });
  var COHS=[]; D.forEach(function(d){ var k=d.coh>=6?String(d.coh):'3-5'; if(COHS.indexOf(k)<0) COHS.push(k); });
  /* 가장 최근 기수(지금은 7기)만 인스타 스토리 그라데이션 링, 나머지는 회색 링(10-14) */
  var LIVE=String(Math.max.apply(null,D.map(function(d){return d.coh})));
  COHS.sort(function(a,b){return parseInt(b,10)-parseInt(a,10)});   // 10-13: 3~5기는 한 칩(3–5기)으로 묶음
  function inC(d,k){ return k==='3-5'?(d.coh>=3&&d.coh<=5):String(d.coh)===k; }
  function lab(k){ return k==='3-5'?'3–5':k; }
  var PER=9, st={coh:COHS[0], mo:0, pg:1, diff:false};
  var $=function(s){return root.querySelector(s)};
  function acc(c){return 'aica_'+String(c).replace('-','to')+'th'}
  function media(d){ var n=d.illu.cloneNode(true); n.removeAttribute('loading'); n.setAttribute('alt',''); return n; }
  function ym(d){ return d.y*100+d.mo; }
  function list(){ return D.filter(function(d){return inC(d,st.coh) && (!st.mo||ym(d)===st.mo)}).sort(function(a,b){return b.date.localeCompare(a.date)}); }
  function yymm(d){ return String(d.y).slice(2)+'. '+String(d.mo).padStart(2,'0')+'.'; }

  function chips(){
    var box=$('.cv3-chips'); box.innerHTML='';
    COHS.forEach(function(c,i){
      var b=document.createElement('button'); b.type='button'; b.setAttribute('role','tab'); b.setAttribute('aria-selected',c===st.coh);
      b.innerHTML=lab(c)+'기'+(i===0?'<i aria-hidden="true"></i>':'');
      b.onclick=function(){ st.coh=c; st.mo=0; st.pg=1; st.diff=false; draw(); };
      box.appendChild(b);
    });
  }
  function profile(){
    var all=D.filter(function(d){return inC(d,st.coh)}).sort(function(a,b){return ym(a)-ym(b)});
    var vids=all.filter(function(d){return d.yt}).length;
    var range=all.length?yymm(all[0])+' – '+yymm(all[all.length-1]):'';
    var hasDiff=!!document.getElementById('cv3-diff'+st.coh), L=lab(st.coh);
    $('.cv3-prof').innerHTML='<span class="cv3-ring'+(st.coh==='3-5'?' is-grp':'')+(st.coh===LIVE?' is-live':'')+'" role="img" aria-label="'+L+'기"><span aria-hidden="true"><b>'+L+'</b></span></span>'
      +'<div class="cv3-info"><div class="cv3-r1"><b class="cv3-acc">'+acc(st.coh)+'</b><span class="cv3-tag">인공지능사관학교</span>'
      +(hasDiff?'<button type="button" class="cv3-dbtn" aria-expanded="'+st.diff+'">'+(parseInt(st.coh,10)-1)+'기와 달라진 점 '+(st.diff?'접기 ▴':'펼치기 ▾')+'</button>':'')+'</div>'
      +'<div class="cv3-stat"><span>게시물 <b>'+all.length+'</b></span><span>영상 <b>'+vids+'</b></span><span>기록 <b>'+range+'</b></span></div>'
      +'<p class="cv3-bio"><b>인공지능사관학교 '+L+'기</b><br>입교식부터 수료식까지, '+L+'기가 남긴 순간들을 모았어요.</p></div>';
    var db=$('.cv3-dbtn'); if(db) db.onclick=function(){ st.diff=!st.diff; draw(); };
    var box=$('.cv3-diff'); box.hidden=!(hasDiff&&st.diff);
    if(hasDiff&&st.diff){ var t=document.getElementById('cv3-diff'+st.coh).content.querySelector('table'); var g=$('.cv3-dt'); g.innerHTML='';
      [].slice.call(t.querySelectorAll('tr')).forEach(function(tr){ var c=tr.children; g.insertAdjacentHTML('beforeend','<b>'+c[0].textContent+'</b><s>'+c[1].textContent+'</s><span>'+c[2].textContent+'</span>'); }); }
  }
  function highlights(){
    var all=D.filter(function(d){return inC(d,st.coh)});
    var mos=[]; all.forEach(function(d){ if(mos.indexOf(ym(d))<0) mos.push(ym(d)); }); mos.sort(function(a,b){return a-b});
    var multiY=mos.length&&Math.floor(mos[0]/100)!==Math.floor(mos[mos.length-1]/100);
    var box=$('.cv3-hl'); box.innerHTML='';
    [0].concat(mos).forEach(function(m){
      var items=all.filter(function(d){return !m||ym(d)===m}).sort(function(a,b){return ym(b)-ym(a)});
      var b=document.createElement('button'); b.type='button'; b.setAttribute('aria-pressed',st.mo===m);
      var ring=document.createElement('span'); ring.className='cv3-hr'; var ph=document.createElement('span'); ph.appendChild(media(items[0])); ring.appendChild(ph);
      b.appendChild(ring); b.insertAdjacentHTML('beforeend','<b>'+(m?(multiY?String(Math.floor(m/100)).slice(2)+'. '+(m%100)+'월':(m%100)+'월'):'전체')+'</b><small>'+items.length+'개</small>');
      b.onclick=function(){ st.mo=m; st.pg=1; draw(); };
      box.appendChild(b);
    });
  }
  /* 교육과정 고정 게시물(10-13, 디자인통일v1과 같은 내용): 기수마다 격자 첫 칸에 고정. 3–5기는 자료가 없어 안 보임. 새 기수는 여기에 한 줄 */
  var CURR={'7':['AI 금융','AI 피지컬','AI 보안','AI 헬스케어','AI 융합'],'6':['데이터 기술','AI 모델링','AI 기반 서비스','AI 플랫폼&인프라','AI 비즈니스']};
  var OFFICIAL=(typeof SITE_LINKS!=='undefined'&&SITE_LINKS.official&&SITE_LINKS.official.url)||'https://support.gj-aischool.or.kr/fo/main';
  function pinOn(){ return !!CURR[st.coh] && !st.mo; }
  function pinEl(){ var d=document.createElement('div'); d.className='cv3-pin'; d.setAttribute('role','group'); d.setAttribute('aria-label',st.coh+'기 교육과정');
    d.innerHTML='<span class="k">CURRICULUM</span><b>'+st.coh+'기<br>교육과정</b><div class="cc">'+CURR[st.coh].map(function(t){return '<span>'+t+'</span>'}).join('')+'</div>'
      +'<div class="ft"><p>자세한 내용은 공식 홈페이지에서 확인하세요.</p><a href="'+OFFICIAL+'" target="_blank" rel="noopener">공식 홈페이지 <span aria-hidden="true">↗</span></a></div>'
      +'<img class="pn" src="assets/pin-white.png" alt="고정됨" width="96" height="96">';
    return d; }
  function grid(){
    var L=list(), P=pinOn(), first=P?PER-1:PER, pages=Math.max(1,1+Math.ceil(Math.max(0,L.length-first)/PER)); if(st.pg>pages) st.pg=pages;
    var s0=st.pg===1?0:first+(st.pg-2)*PER, s1=st.pg===1?first:s0+PER;
    $('.cv3-gt').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>'+lab(st.coh)+'기 · '+(st.mo?(st.mo%100)+'월':'전체')+' 기록 '+L.length+'개';
    var g=$('.cv3-grid'); g.innerHTML=''; if(P&&st.pg===1) g.appendChild(pinEl());
    L.slice(s0,s1).forEach(function(d){
      var a=document.createElement('a'); a.href='#'; a.className='cv3-it'; a.setAttribute('aria-label',d.title+(d.yt?' (영상)':''));
      a.appendChild(media(d));
      if(d.yt) a.insertAdjacentHTML('beforeend','<svg class="cv3-reel" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M3 8h18M8 3l3 5M14 3l3 5"/><path d="M10 11.5v5l4.5-2.5z" fill="#fff"/></svg>');
      a.insertAdjacentHTML('beforeend','<span class="cv3-ov"><b>'+d.title+'</b><span>'+d.date+'</span></span>');
      a.onclick=function(e){ e.preventDefault(); openM(L.indexOf(d)); };
      g.appendChild(a);
    });
    var nav=root.querySelector('.cv3-pg'); nav.innerHTML='';
    var row=document.createElement('div'); row.className='cv3-pgr';
    function pb(t,to,o){ var b=document.createElement('button'); b.type='button'; b.textContent=t; if(o.cur) b.setAttribute('aria-current','page'); if(o.dis) b.disabled=true; if(o.aria) b.setAttribute('aria-label',o.aria);
      b.onclick=function(){ st.pg=to; draw(); root.scrollIntoView({behavior:'smooth',block:'start'}); }; row.appendChild(b); }
    pb('←',st.pg-1,{dis:st.pg===1,aria:'이전 페이지'}); for(var i=1;i<=pages;i++) pb(String(i),i,{cur:i===st.pg,aria:i+'페이지'}); pb('→',st.pg+1,{dis:st.pg===pages,aria:'다음 페이지'});
    nav.appendChild(row);
    var from=L.length?s0+1:0, to=Math.min(s1,L.length);
    nav.insertAdjacentHTML('beforeend','<p>'+L.length+'개 중 '+from+'–'+to+' · '+st.pg+' / '+pages+' 페이지</p>');
  }
  function draw(){ chips(); profile(); highlights(); grid(); }

  /* 글 창 */
  var M=document.querySelector('.cv3-m'), cur=0, last=null;
  function fill(){
    var L=list(), d=L[cur]; if(!d) return;
    var md=M.querySelector('.cv3-m-media'); md.innerHTML=''; md.classList.remove('can-zoom'); md.appendChild(media(d));
    if(d.yt){ var id=(d.yt.match(/[?&]v=([^&]+)/)||d.yt.match(/youtu\.be\/([^?]+)/)||[])[1];
      var p=document.createElement('button'); p.type='button'; p.className='cv3-play'; p.setAttribute('aria-label','영상 재생'); p.innerHTML='<i></i>';
      p.onclick=function(){ md.innerHTML='<iframe src="https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&rel=0&playsinline=1" title="'+d.title.replace(/"/g,'')+'" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>'; };
      md.appendChild(p); }
    else { /* 사진 크게 보기(10-14): 오른쪽 위 버튼 · 사진 클릭 */
      var z=document.createElement('button'); z.type='button'; z.className='cv3-zoom'; z.setAttribute('aria-label','사진 크게 보기');
      z.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>';
      z.onclick=openZ; md.firstChild.addEventListener('click',openZ); md.classList.add('can-zoom'); md.appendChild(z); }
    M.querySelector('.cv3-av').innerHTML='<b>'+d.coh+'</b>';
    M.querySelector('.cv3-m-acc').textContent=acc(d.coh);
    M.querySelector('h3').innerHTML='<b>'+acc(d.coh)+'</b> '+d.title;
    M.querySelector('.cv3-m-body p').textContent=d.sum;
    M.querySelector('time').textContent=d.date;
    M.querySelectorAll('.cv3-like,.cv3-save').forEach(function(b){b.setAttribute('aria-pressed','false')});
    M.querySelector('.no').textContent=(cur+1)+' / '+L.length;
    M.querySelector('.pv').disabled=cur===0; M.querySelector('.nx').disabled=cur===L.length-1;
  }
  /* 크게 보기 창: 어두운 바탕 + 사진 전체(잘림 없이). ←/→로 넘기면 같이 바뀜 */
  var Z=document.createElement('div'); Z.className='cv3-zv'; Z.hidden=true; Z.setAttribute('role','dialog'); Z.setAttribute('aria-modal','true'); Z.setAttribute('aria-label','사진 크게 보기');
  Z.innerHTML='<button type="button" class="cv3-zv-x" aria-label="크게 보기 닫기">&times;</button><figure><div class="cv3-zv-im"></div><figcaption></figcaption></figure>';
  document.body.appendChild(Z);
  function zfill(){ var d=list()[cur]; if(!d||d.yt){ closeZ(); return; } var n=media(d);
    if(n.tagName==='IMG'){ var sm=n.getAttribute('src'); if(/-sm\.(jpe?g|png|webp)$/i.test(sm)){ n.src=sm.replace(/-sm(\.[a-z]+)$/i,'$1'); n.onerror=function(){ n.onerror=null; n.src=sm; }; } n.removeAttribute('width'); n.removeAttribute('height'); }
    n.setAttribute('alt',d.title); var b=Z.querySelector('.cv3-zv-im'); b.innerHTML=''; b.appendChild(n);
    Z.querySelector('figcaption').textContent=d.title+' · '+d.date; }
  function openZ(){ zfill(); Z.hidden=false; Z.querySelector('.cv3-zv-x').focus(); }
  function closeZ(){ if(Z.hidden) return; Z.hidden=true; Z.querySelector('.cv3-zv-im').innerHTML=''; var z=M.querySelector('.cv3-zoom'); if(z) z.focus(); }
  Z.onclick=function(e){ if(!e.target.closest('.cv3-zv-im img,.cv3-zv-im svg')) closeZ(); };
  function openM(i){ cur=i; last=document.activeElement; fill(); M.hidden=false; document.documentElement.classList.add('cv3-lock'); M.querySelector('.cv3-m-x').focus(); }
  function closeM(){ Z.hidden=true; M.hidden=true; M.querySelector('.cv3-m-media').innerHTML=''; document.documentElement.classList.remove('cv3-lock'); if(last) last.focus(); }
  M.querySelector('.cv3-m-x').onclick=closeM; M.querySelector('.cv3-m-bg').onclick=closeM;
  M.querySelector('.pv').onclick=function(){ if(cur>0){cur--;fill();} };
  M.querySelector('.nx').onclick=function(){ if(cur<list().length-1){cur++;fill();} };
  M.querySelectorAll('.cv3-like,.cv3-save').forEach(function(b){ b.onclick=function(){ b.setAttribute('aria-pressed',b.getAttribute('aria-pressed')!=='true'); }; });
  document.addEventListener('keydown',function(e){ if(M.hidden) return; if(e.key==='Escape'){ if(!Z.hidden) closeZ(); else closeM(); return; } if(e.key==='ArrowLeft') M.querySelector('.pv').click(); if(e.key==='ArrowRight') M.querySelector('.nx').click(); if(!Z.hidden) zfill(); });

  draw();
})();
