/* Both views filter the already-rendered cards. Spring renders published DB rows only. */
(function(){
  'use strict';
  function init(){
    const section=document.querySelector('#p-pr');
    const filters=section?.querySelector('.pj-cohort-filters');
    if(!filters||filters.dataset.ready)return;
    filters.dataset.ready='true';
    const dropdown=section.querySelector('.pj-subject-filter');
    const summary=dropdown.querySelector('summary');
    const options=dropdown.querySelector('.pj-subject-options');
    function selectSubject(value){
      options.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.subject===value)));
      summary.querySelector('b').textContent=value||'과정';
    }
    const cards=Array.from(section.querySelectorAll('.pjgrid .pjc'));
    const live=document.documentElement.dataset.storySource==='spring';
    if(live){
      // Never derive classification from sample IDs, drafts, tags or project types.
      const cohorts=Array.from(new Set(cards.map(card=>card.dataset.cohort).filter(value=>/^[1-9]\d?$/.test(value)))).sort((a,b)=>Number(b)-Number(a));
      const subjects=Array.from(new Set(cards.map(card=>card.dataset.subject).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ko'));
      function choices(group,key,values,label){
        group.replaceChildren();
        [''].concat(values).forEach(value=>{
          const button=document.createElement('button');button.type='button';
          button.dataset[key]=value;button.textContent=value?label(value):'전체';
          button.setAttribute('aria-pressed',String(!value));group.append(button);
        });
      }
      choices(filters,'cohort',cohorts,value=>value+'기');
      choices(options,'subject',subjects,value=>value);
    }
    function close(){dropdown.open=false;}
    const pager=document.createElement('nav');pager.className='cpager pj-pager';
    pager.setAttribute('aria-label','프로젝트 페이지');section.querySelector('.pjgrid').after(pager);
    let page=1;const pageSize=6;
    function pageButton(label,to,disabled,current){
      const button=document.createElement('button');button.type='button';button.textContent=label;
      button.disabled=disabled;button.setAttribute('aria-label',label==='←'?'이전 페이지':label==='→'?'다음 페이지':to+'페이지');
      if(current)button.setAttribute('aria-current','page');
      button.addEventListener('click',()=>{
        page=to;refresh();pager.querySelector('[aria-current="page"]').focus({preventScroll:true});
        section.querySelector('.pj-filter-row').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
      });return button;
    }
    function refresh(reset=false){
      if(reset)page=1;
      const cohort=filters.querySelector('[aria-pressed="true"]').dataset.cohort;
      const subject=options.querySelector('[aria-pressed="true"]').dataset.subject;
      const mobile=section.querySelector('.sm-projects');
      const eligible=cards.filter(card=>(!cohort||card.dataset.cohort===cohort)&&(!subject||card.dataset.subject===subject));
      const matching=eligible;
      const total=Math.max(1,Math.ceil(matching.length/pageSize));page=Math.min(page,total);
      const visible=new Set(matching.slice((page-1)*pageSize,page*pageSize));
      cards.forEach(card=>{card.hidden=!visible.has(card);});
      if(mobile){
        const items=Array.from(mobile.querySelectorAll('.sm-project'));
        items.forEach((item,index)=>{item.hidden=!visible.has(cards[index]);if(item.hidden)item.open=false;});
        const first=items.find(item=>!item.hidden);
        if(first&&!items.some(item=>!item.hidden&&item.open))first.open=true;
        mobile.hidden=!eligible.length;
      }
      const upcoming=!live&&cohort==='7'&&!cards.some(card=>card.dataset.cohort==='7');
      const notice=section.querySelector('.pj-filter-empty');
      if(notice)notice.hidden=!upcoming;
      const noResults=section.querySelector('.pj-subject-empty');
      if(!matching.length&&!upcoming&&cards.length&&typeof StoryState!=='undefined')StoryState.render(noResults,'filter',{subject:'프로젝트',onReset:()=>{
        selectSubject('');filters.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(!button.dataset.cohort)));refresh(true);filters.querySelector('button').focus({preventScroll:true});
      }});
      noResults.hidden=!cards.length||!!matching.length||upcoming;
      pager.replaceChildren();pager.hidden=!matching.length;
      if(matching.length){
        pager.append(pageButton('←',page-1,page===1,false));
        const start=Math.max(1,Math.min(page-2,total-4));
        for(let n=start;n<=Math.min(total,start+4);n++)pager.append(pageButton(String(n),n,false,n===page));
        pager.append(pageButton('→',page+1,page===total,false));
      }
    }
    section.querySelector('.pj-empty-back')?.addEventListener('click',()=>{
      // The suggested action must always reveal the existing sixth-cohort list.
      selectSubject('');
      const button=filters.querySelector('[data-cohort="6"]');button.click();button.focus({preventScroll:true});
    });
    filters.addEventListener('click',event=>{
      const button=event.target.closest('button[data-cohort]');if(!button)return;
      filters.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));refresh(true);
    });
    options.addEventListener('click',event=>{
      const button=event.target.closest('button[data-subject]');if(!button)return;
      selectSubject(button.dataset.subject);
      close();summary.focus({preventScroll:true});refresh(true);
    });
    matchMedia('(max-width:600px)').addEventListener('change',()=>{close();refresh();});
    document.addEventListener('click',event=>{if(!dropdown.contains(event.target))close();});
    dropdown.addEventListener('keydown',event=>{if(event.key==='Escape'){close();summary.focus();}});
    dropdown.addEventListener('focusout',event=>{if(!dropdown.contains(event.relatedTarget))close();});
    refresh();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
