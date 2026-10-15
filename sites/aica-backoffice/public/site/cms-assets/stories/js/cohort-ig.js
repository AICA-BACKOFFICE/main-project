/* 기수별 이모저모 카드를 인스타 게시물 구조로(디자인통일v1, 10-12). 모양은 common/css/unify.css. stories.js보다 먼저 실행 */
(function(){
  var I={"heart": "<path d=\"M12 20.6s-7.6-4.6-9.6-9.2C.9 8.1 2.8 4.4 6.6 4.4c2.3 0 3.9 1.3 5.4 3.3 1.5-2 3.1-3.3 5.4-3.3 3.8 0 5.7 3.7 4.2 7C19.6 16 12 20.6 12 20.6z\"/>", "cmt": "<path d=\"M20 16.3a8.6 8.6 0 1 0-3.7 3.7L21.2 21.2z\"/>", "share": "<path d=\"M21.5 2.8 2.6 10.1l7.6 3.1 3.1 7.6z\"/><path d=\"M21.5 2.8 10.2 13.2\"/>", "save": "<path d=\"M18.8 21.2 12 15l-6.8 6.2V2.8h13.6z\"/>"};
  function svg(k){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+I[k]+'</svg>'}
  document.querySelectorAll('#p-coh .g2 > a.st').forEach(function(a){
    var coh=(a.querySelector('.mt .cg')||{}).textContent||'';
    var acc='aica_'+coh.replace('기','')+'th';
    var ph=a.querySelector('.ph'), h=a.querySelector('h3'), p=a.querySelector('p'), mt=a.querySelector('.mt');
    a.classList.add('ig');
    var hd=document.createElement('div'); hd.className='ig-hd';
    hd.innerHTML='<span class="ig-av"><span>'+coh+'</span></span><span class="ig-id"><b>'+acc+'</b><small>인공지능사관학교</small></span><span class="ig-more" aria-hidden="true"><i></i><i></i><i></i></span>';
    a.insertBefore(hd,ph);
    if(a.dataset.yt){var r=document.createElement('span');r.className='ig-reel';r.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M3 8h18M8 3l3 5M14 3l3 5"/><path d="M10 11.5v5l4.5-2.5z" fill="#fff"/></svg>';ph.appendChild(r)}
    var act=document.createElement('div'); act.className='ig-act';
    act.innerHTML='<span class="ig-tg hr" role="button" tabindex="0" aria-pressed="false" aria-label="좋아요"><svg class="o ln" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3s-8-4.9-9.4-10C1.6 6.6 4 3.7 7.2 3.7c2.2 0 3.7 1.2 4.8 3 1.1-1.8 2.6-3 4.8-3 3.2 0 5.6 2.9 4.6 6.6C20 15.4 12 20.3 12 20.3z"/></svg><svg class="f ln" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3s-8-4.9-9.4-10C1.6 6.6 4 3.7 7.2 3.7c2.2 0 3.7 1.2 4.8 3 1.1-1.8 2.6-3 4.8-3 3.2 0 5.6 2.9 4.6 6.6C20 15.4 12 20.3 12 20.3z"/></svg></span>'
      +'<span class="ig-ic" aria-hidden="true"><svg class="ln" viewBox="0 0 24 24" aria-hidden="true"><path d="M19.6 16.4a8.8 8.8 0 1 0-3.3 3.3L20.8 20.8Z"/></svg></span><span class="ig-ic" aria-hidden="true"><svg class="ln" viewBox="0 0 24 24" aria-hidden="true"><line x1="22" y1="3" x2="9.218" y2="10.083"/><polygon points="11.698 20.334 22 3.001 2 3.001 9.218 10.084 11.698 20.334"/></svg></span>'
      +'<span class="ig-tg sv" role="button" tabindex="0" aria-pressed="false" aria-label="저장"><svg class="o ln" viewBox="0 0 24 24" aria-hidden="true"><polygon points="20 21 12 13.44 4 21 4 3 20 3 20 21"/></svg><svg class="f ln" viewBox="0 0 24 24" aria-hidden="true"><polygon points="20 21 12 13.44 4 21 4 3 20 3 20 21"/></svg></span>';
    var cap=document.createElement('div'); cap.className='ig-cap';
    h.setAttribute('data-acc',acc); cap.appendChild(h); if(p) cap.appendChild(p);
    var mo=document.createElement('span'); mo.className='ig-mo'; mo.textContent='더 보기'; cap.appendChild(mo);
    a.insertBefore(act,mt); a.insertBefore(cap,mt);
  });
  /* 좋아요 · 저장: 누르면 색만 바뀜(저장되지 않음, 새로 고치면 처음대로). 카드 글 창이 열리지 않게 클릭을 여기서 멈춤 */
  function tog(b){ var on=b.getAttribute('aria-pressed')!=='true'; b.setAttribute('aria-pressed',String(on)); b.classList.remove('pop'); void b.offsetWidth; if(on) b.classList.add('pop'); }
  document.addEventListener('click',function(e){ var b=e.target.closest('.ig-tg'); if(!b) return; e.preventDefault(); e.stopPropagation(); tog(b); },true);
  document.addEventListener('keydown',function(e){ var b=e.target.closest&&e.target.closest('.ig-tg'); if(!b||(e.key!=='Enter'&&e.key!==' ')) return; e.preventDefault(); e.stopPropagation(); tog(b); },true);
})();
