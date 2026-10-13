/*
 * 템플릿 관리 — 편집 화면: 레이아웃 패널(LayoutPanel) + 본문 구성(BlockEditor) + 빠른 추가/뼈대 세트
 * 저장은 일반 form POST (blocksJson · layoutJson hidden). 서버: template/PostTemplatePageController
 */
(function (global) {
  'use strict';
  var T = global.TemplateEditorPage = {};

  function block(type, extra) {
    var b = { type: type };
    if (type === 'heading') { b.level = 2; b.html = ''; }
    if (type === 'paragraph') { b.align = 'left'; b.html = ''; }
    if (type === 'quote') { b.html = ''; }
    if (type === 'list') { b.style = 'bullet'; b.items = ['']; }
    if (type === 'image') { b.url = ''; b.alt = ''; b.caption = ''; b.width = 'full'; b.align = 'center'; b.link = ''; }
    if (type === 'table') { b.rows = [['', ''], ['', '']]; }
    if (type === 'code') { b.lang = ''; b.code = ''; }
    Object.keys(extra || {}).forEach(function (k) { b[k] = extra[k]; });
    return b;
  }
  function h(text, level) { return block('heading', { html: text, level: level || 2 }); }
  function p(text) { return block('paragraph', { html: text }); }

  /** 자주 쓰는 글 뼈대. 안내 문구는 글쓰기에서 지우고 채우는 용도 */
  var SKELETONS = {
    notice: [h('안내 개요'), p('무엇을, 언제, 누구에게 안내하는지 한 문단으로 적습니다.'),
      h('일정'), block('list', { items: ['일시: ', '장소: ', '대상: '] }),
      h('신청 방법'), p('신청 절차와 링크를 적습니다.'),
      h('문의'), p('담당 부서 · 연락처 · 이메일')],
    review: [p('행사 전체를 한두 문장으로 소개합니다.'), block('image'),
      h('현장 스케치'), p('현장 분위기와 주요 장면을 적습니다.'), block('image'),
      h('참가자 이야기'), block('quote', { html: '참가자 한마디를 인용합니다.' }),
      h('마무리'), p('다음 일정이나 참여 방법으로 마무리합니다.')],
    interview: [p('인터뷰이 소개 (기수 · 역할 · 한 줄 소개)'), block('image', { width: 'medium' }),
      h('Q. 첫 번째 질문', 3), p('답변'),
      h('Q. 두 번째 질문', 3), p('답변'),
      h('Q. 세 번째 질문', 3), p('답변'),
      block('divider'), p('인터뷰 · 정리: 담당자')],
    faq: [block('quote', { html: '질문 내용을 그대로 옮깁니다.' }),
      h('답변'), p('핵심 답변을 먼저 적습니다.'),
      h('자세한 설명'), block('list', { items: ['', ''] }),
      h('참고'), p('관련 안내 링크나 문의처')]
  };

  T.init = function (cfg) {
    var form = document.getElementById('templateForm');
    var statsEl = document.getElementById('edStats');
    var editor = BlockEditor.mount(document.getElementById('editor'), {
      input: form.querySelector('[name="blocksJson"]'),
      toolbar: document.getElementById('toolbar'),
      toolbar2: document.getElementById('toolbar2'),
      tools: document.getElementById('tools'),
      uploadUrl: cfg.uploadUrl, recentUrl: cfg.recentUrl, categoriesUrl: cfg.categoriesUrl,
      onChange: refresh
    });
    var layout = LayoutPanel.mount(document.getElementById('layoutPanel'), document.getElementById('layoutJson'), { onChange: refresh });

    function refresh() {
      if (!statsEl) return;
      var st = editor.stats();
      statsEl.textContent = '블록 ' + st.blocks + (st.images ? ' · 사진 자리 ' + st.images : '');
    }
    refresh();

    // 빠른 추가 · 뼈대 세트
    document.getElementById('tplQuick').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button'); if (!b) return;
      if (b.dataset.add) { editor.appendBlocks([block(b.dataset.add)]); refresh(); return; }
      var sk = SKELETONS[b.dataset.skeleton]; if (!sk) return;
      if (!editor.isEmpty() && !window.confirm('현재 본문 구성을 "' + b.textContent.trim() + '" 뼈대로 바꿀까요? (취소하면 뒤에 이어 붙입니다)')) {
        editor.appendBlocks(JSON.parse(JSON.stringify(sk)));
      } else {
        editor.setBlocks(JSON.parse(JSON.stringify(sk)));
      }
      // 뼈대에 맞는 레이아웃을 제안 (이미 바꾼 경우 그대로 둠)
      var cur = layout.get();
      if (cur.preset === 'basic') {
        if (b.dataset.skeleton === 'review') layout.set(JSON.stringify(Object.assign(cur, { preset: 'hero' , header: ['thumbnail', 'category', 'title', 'meta', 'summary'] })));
        if (b.dataset.skeleton === 'interview') layout.set(JSON.stringify(Object.assign(cur, { preset: 'magazine' })));
        if (b.dataset.skeleton === 'faq') layout.set(JSON.stringify(Object.assign(cur, { preset: 'side-right', sidebar: ['toc', 'related'], footer: ['share'] })));
      }
      refresh();
    });

    form.addEventListener('submit', function (e) {
      editor.sync(true);
      var isPreview = e.submitter && e.submitter.hasAttribute('formtarget');
      if (isPreview) return;
      var name = form.querySelector('[name="name"]');
      if (!name.value.trim()) { e.preventDefault(); name.focus(); notify('템플릿 이름을 입력하세요.', true); return; }
      if (editor.isEmpty()) { e.preventDefault(); notify('본문 구성이 비어 있습니다. 블록을 하나 이상 넣어 주세요.', true); }
    });
  };
})(window);
