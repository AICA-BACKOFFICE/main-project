/* Shared public-detail navigation. Reads only published cards already rendered
   by static build or Spring; titles use textContent, never editor HTML. */
(function(){
  'use strict';
  const page=document.querySelector('.stories-page');
  if(!page)return;
  const kinds=[
    {key:'review',unit:'후기',cards:'#p-rev .idgrid .idc',detail:'.ov',title:'.mtop h3',host:'.mscroll',list:'#p-rev'},
    {key:'interview',unit:'인터뷰',cards:'#p-iv .ivgrid a.iv',detail:'.ivd',title:'h2',host:'.ivwrap',list:'#p-iv'},
    {key:'project',unit:'프로젝트',cards:'#p-pr .pjgrid a.pjc',detail:'.pjd',title:'h2',host:'.ivwrap',list:'#p-pr'}
  ];
  const groups=[];
  function node(tag,cls,text){const n=document.createElement(tag);n.className=cls;if(text!=null)n.textContent=text;return n;}
  function direction(item,previous,kind){
    const label=(previous?'이전 ':'다음 ')+kind.unit;
    const a=node(item?'a':'span','sd-direction '+(previous?'sd-prev':'sd-next'));
    if(item){a.setAttribute('href','#'+item.detail.id);a.dataset.storyDirection=kind.key;a.setAttribute('aria-label',label+': '+item.title);}
    else{a.setAttribute('aria-disabled','true');}
    a.append(node('span','sd-label',previous?'← '+label:label+' →'),node('span','sd-title',item?item.title:'더 이상 글이 없어요'));
    return a;
  }
  kinds.forEach(kind=>{
    const seen=new Set(),items=[];
    page.querySelectorAll(kind.cards).forEach(card=>{
      const hash=card.getAttribute('href')||'';
      if(!hash.startsWith('#'))return;
      const detail=document.getElementById(hash.slice(1));
      if(!detail||!detail.matches(kind.detail)||seen.has(detail.id))return;
      const heading=detail.querySelector(kind.title),host=detail.querySelector(kind.host);
      if(!heading||!host)return;
      seen.add(detail.id);items.push({card,detail,host,heading,title:heading.textContent.trim()});
    });
    if(!items.length)return;
    items.forEach((item,index)=>paint(kind,item,items,index));
    groups.push({kind,items,returnTo:null});
  });
  function paint(kind,item,items,index){
    const side=kind.key==='project'&&item.detail.querySelector('.pjnav');
    if(side){
      side.hidden=false;side.replaceChildren();
      [items[index-1],items[index+1]].forEach((target,direction)=>{
        const label=direction?'다음 프로젝트':'이전 프로젝트';
        const link=node(target?'a':'span',target?'':'pjnav-boundary');
        if(target){link.setAttribute('href','#'+target.detail.id);link.dataset.storyDirection=kind.key;link.setAttribute('aria-label',label+': '+target.title);}
        else link.setAttribute('aria-disabled','true');
        link.append(node('small','',label),node('span','',target?target.title:'더 이상 글이 없어요'));side.append(link);
      });
    }
    const nav=node('nav','sd-nav');nav.setAttribute('aria-label',kind.unit+' 이전 글 다음 글');
    const pair=node('div','sd-pair');pair.append(direction(items[index-1],true,kind),direction(items[index+1],false,kind));
    const back=node('a','sd-list',kind.unit+' 목록');back.href=kind.list;back.dataset.storyList=kind.key;
    nav.append(pair,back);const old=item.detail.querySelector('.sd-nav');
    if(old)old.replaceWith(nav);else if(kind.key==='review')item.host.append(nav);else item.host.after(nav);
  }
  let tag='';
  function matching(group){
    if(group.kind.key==='review'){
      const section=document.querySelector('#p-rev'),sm=section.querySelector('.sm-reviews');
      const mobile=sm&&getComputedStyle(sm).display!=='none';
      const selected=section.querySelector('input[name="rc"]:checked');
      const category=selected?selected.id.slice(3):'all';
      let cohort='';
      if(mobile){cohort=sm.querySelector('.sm-cohort-chips [aria-pressed="true"]')?.dataset.value||'';}
      else{
        const live=section.querySelector('[data-review-cohorts] [aria-pressed="true"]');
        const radio=section.querySelector('input[name="fco"]:checked');
        const label=radio&&section.querySelector('label[for="'+radio.id+'"]');
        cohort=((live||label)?.textContent.match(/(\d+)기/)||[])[1]||'';
      }
      return group.items.filter(item=>(category==='all'||item.card.classList.contains('cat-'+category))&&(!cohort||item.card.classList.contains('coh'+cohort))&&(!tag||item.card.classList.contains('tg'+tag)));
    }
    if(group.kind.key==='interview'){
      const selected=document.querySelector('#iv-all [data-f="coh"] [aria-pressed="true"]');
      const value=selected?.textContent||'';
      if(value.includes('전체'))return group.items;
      const cohort=(value.match(/\d+/)||[])[0];
      if(!cohort)return group.items;
      return group.items.filter(item=>{const c=Number.parseInt(item.card.querySelector('.by .av')?.textContent,10);return value.includes('–')||value.includes('-')?c>=3&&c<=5:c===Number(cohort);});
    }
    if(group.kind.key==='project'){
      const cohort=document.querySelector('.pj-cohort-filters [aria-pressed="true"]')?.dataset.cohort;
      const subject=document.querySelector('.pj-subject-options [aria-pressed="true"]')?.dataset.subject;
      const items=group.items.filter(item=>(!cohort||item.card.dataset.cohort===cohort)&&(!subject||item.card.dataset.subject===subject));
      const mobile=document.querySelector('#p-pr .sm-projects');
      if(!mobile||getComputedStyle(mobile).display==='none')return items;
      const type=mobile.querySelector('.sm-filter-tabs [aria-pressed="true"]')?.textContent.trim()||'전체';
      return type==='전체'?items:items.filter(item=>item.card.querySelector('.pjc-type')?.textContent.trim()===type);
    }
    return group.items;
  }
  function refreshCurrent(){
    const hash=/^#tg-([0-6])$/.exec(location.hash);if(hash)tag=hash[1];else if(!/^#r-/.test(location.hash))tag='';
    groups.forEach(group=>{const item=group.items.find(item=>'#'+item.detail.id===location.hash);if(!item)return;let items=matching(group);if(!items.includes(item))items=group.items;paint(group.kind,item,items,items.indexOf(item));});
  }
  setTimeout(refreshCurrent,0);
  // The type tabs belong to the <=600px projection; desktop uses all projects.
  if(groups.some(group=>group.kind.key==='project'))
    matchMedia('(max-width:600px)').addEventListener('change',refreshCurrent);
  let navigating=false;

  document.addEventListener('click',event=>{
    const a=event.target.closest('a[href]');if(!a)return;
    if(a.dataset.storyDirection){navigating=true;return;}
    const group=groups.find(g=>g.kind.key===a.dataset.storyList);
    if(group){
      if(group.returnTo){
        a.setAttribute('href',group.returnTo.hash);
        const y=group.returnTo.y;
        setTimeout(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:y,behavior:'instant'}))),0);
      }
      return;
    }
    // Remember the actual listing location, not a previous detail's navigation link.
    if(a.closest('.ov,.ivd,.pjd'))return;
    groups.forEach(g=>{
      if(g.items.some(item=>'#'+item.detail.id===a.getAttribute('href')))
        g.returnTo={hash:location.hash||g.kind.list,y:window.scrollY};
    });
  },true);
  addEventListener('hashchange',()=>{
    refreshCurrent();
    if(!navigating)return;navigating=false;
    const item=groups.flatMap(g=>g.items).find(item=>'#'+item.detail.id===location.hash);
    if(!item)return;
    const scroll=item.detail.querySelector('.mscroll');if(scroll)scroll.scrollTop=0;
    if(!scroll){item.heading.tabIndex=-1;requestAnimationFrame(()=>item.heading.focus({preventScroll:true}));}
  });
})();
