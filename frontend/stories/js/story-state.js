/* Shared list states. Published content and filters remain owned by each page. */
var StoryState = (function(){
  'use strict';
  var subjects={reviews:'후기',interviews:'인터뷰',projects:'프로젝트',cohorts:'기수 이야기'};
  var icons={
    empty:'<rect x="6" y="3" width="13" height="18" rx="2"/><path d="M3 7v12a3 3 0 0 0 3 3M10 8h5M10 12h5M10 16h3"/>',
    filter:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6"/>',
    error:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/>'
  };
  function node(tag,cls,text){
    var element=document.createElement(tag);element.className=cls;
    if(text!=null)element.textContent=text;return element;
  }
  function render(host,kind,options){
    options=options||{};var subject=options.subject||'이야기';
    var title=kind==='error'?'이야기를 불러오지 못했습니다.':kind==='filter'?'조건에 맞는 '+subject+'가 없습니다.':'아직 등록된 '+subject+'가 없습니다.';
    var description=kind==='error'?'잠시 후 다시 시도해 주세요.':kind==='filter'?'선택한 조건을 바꾸거나 필터를 초기화해 주세요.':'다른 선배들의 이야기도 둘러보세요.';
    host.classList.add('story-state');host.dataset.storyState=kind;host.setAttribute('role','status');
    var icon=node('span','story-state__icon');icon.setAttribute('aria-hidden','true');
    // Fixed artwork only. Content/DB strings are always assigned with textContent.
    icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'+icons[kind]+'</svg>';
    var heading=node('h3','story-state__title',title),copy=node('p','story-state__copy',description),action;
    if(kind==='error'||(kind==='filter'&&options.onReset)){
      action=node('button','story-state__action',kind==='error'?'다시 시도':'필터 초기화');action.type='button';
      action.addEventListener('click',kind==='error'?function(){location.reload();}:options.onReset);
    }else{action=node('a','story-state__action','이야기 전체 보기');action.href='index.html';}
    host.replaceChildren(icon,heading,copy,action);return host;
  }
  function failed(){return document.body?.dataset.publicContentUnavailable==='true';}
  function resetReviews(section){
    var radios=['rc_all','fco_all','pgn1'].map(function(id){return document.getElementById(id);}).filter(Boolean);
    radios.forEach(function(radio){radio.checked=true;});
    radios.forEach(function(radio){radio.dispatchEvent(new Event('change',{bubbles:true}));});
    if(/^#tg-/.test(location.hash))location.hash='p-rev';
    section.dispatchEvent(new Event('reviews:reset'));
  }
  function init(){
    var kind=document.documentElement.dataset.sub,subject=subjects[kind];if(!subject)return;
    var section=document.querySelector({reviews:'#p-rev',interviews:'#p-iv',projects:'#p-pr',cohorts:'#p-coh'}[kind]);
    var host=section?.querySelector('[data-story-list-state]');if(!host)return;
    var cards=kind==='cohorts'?document.getElementById('cv3-data').content.querySelectorAll('a.st'):section.querySelectorAll({reviews:'.idgrid .idc',interviews:'.ivgrid .iv',projects:'.pjgrid .pjc'}[kind]);
    if(failed()||!cards.length){
      render(host,failed()?'error':'empty',{subject:subject});host.hidden=false;
      var selectors={reviews:'.filters,.idgrid,.rvlist,.pager,.sm-reviews,.footnote,[data-review-filter-empty]',interviews:'.ivband,.ivgrid,#iv-all,.sm-ivf,.footnote',projects:'.pj-filter-row,.pjgrid,.sm-projects,.pj-filter-empty,.pj-subject-empty,.pj-pager',cohorts:'.cv3'};
      section.querySelectorAll(selectors[kind]).forEach(function(element){element.hidden=true;element.setAttribute('data-story-state-hidden','');});
      if(kind==='reviews')section.querySelectorAll('input.tr').forEach(function(radio){radio.disabled=true;});
      return;
    }
    // Static desktop reviews use CSS radio/hash filters. Spring/mobile own theirs.
    if(kind==='reviews'&&document.documentElement.dataset.reviewSource!=='spring'){
      host.classList.add('story-state--desktop');
      function reset(){
        resetReviews(section);
        section.querySelector('.dw-fco summary').focus({preventScroll:true});update();
      }
      function update(){
        if(matchMedia('(max-width:600px)').matches){host.hidden=true;return;}
        var listView=section.querySelector('#vm-list')?.checked;
        var entries=listView?section.querySelectorAll('.rvlist .rvr'):cards;
        var any=Array.from(entries).some(function(card){return getComputedStyle(card).display!=='none';});
        if(!any)render(host,'filter',{subject:subject,onReset:reset});host.hidden=any;
        var pager=section.querySelector('.pager');if(pager)pager.hidden=!any;
      }
      section.addEventListener('change',update);addEventListener('hashchange',update);addEventListener('resize',update);update();
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  return {render:render,failed:failed,resetReviews:resetReviews};
})();
