/* =========================================================
   사이트 메뉴(카테고리) — IA_v3 01.메뉴요약 기준 · 바깥 연결처
   상단 GNB · 드롭다운 · 하위 메뉴 바 · 모바일 메뉴(common/js/site.js)가 모두 이 목록으로 그려집니다.
   홈 포스터 · 페이지 본문의 링크는 HTML에 직접 씀(메뉴 주소를 바꾸면 같이 고침).
   메뉴 이름 · 순서 · 주소, 지원하기 같은 바깥 연결처, 검색 추천 키워드는 이 파일에서 고칩니다.

   page      사이트 폴더(site/) 기준 페이지 주소
   title     하위 메뉴 바 왼쪽에 보이는 카테고리 페이지 이름(없으면 바 왼쪽 제목 없음 — 알아보기 · 라이프, 2026-10-08 사용자)
   type      anchor = 한 페이지 안에서 위치로 이동(스크롤하면 하위 메뉴 바가 지금 섹션을 따라감)
             tab = 하위 메뉴마다 화면이 따로(라이프 · 이야기는 한 페이지 안 탭 화면, 페이지 JS가 Site.syncSubnav()로 표시)
   children  하위 메뉴. 주소는 기본으로 page#id
             · 같은 페이지의 다른 위치면 anchor:'#위치' (페이지 맨 위면 anchor:'')
             · 하위 메뉴를 따로 만든 페이지면 page:'폴더/파일.html'
   ========================================================= */
const SITE_HOME = 'home/index.html';

const SITE_MENU = [
  { id:'about', label:'인사교 알아보기', type:'anchor', page:'about/index.html', children:[
    { id:'intro', label:'인사교 소개', anchor:'#intro' },
    { id:'learn', label:'무엇을 배우나요?', anchor:'#learning' },
    { id:'activity', label:'어떤 활동을 하나요?', anchor:'#activities' },
    { id:'career', label:'취업·창업 지원', anchor:'#career' } ]},
  { id:'stories', label:'선배들의 이야기', title:'먼저 다녀온 선배들의 SSUL', type:'tab', page:'stories/index.html', children:[
    { id:'reviews', label:'선배 후기' },
    { id:'interviews', label:'선배 인터뷰' },
    { id:'projects', label:'프로젝트' },
    { id:'cohorts', label:'기수별 모아보기' } ]},
  { id:'life', label:'인사교 라이프', type:'tab', page:'life/index.html', children:[
    { id:'facilities', label:'시설 둘러보기' },
    { id:'tips', label:'생활 꿀팁' },
    { id:'directions', label:'오시는 길' } ]},
  { id:'check', label:'지원 전 체크', title:'지원 전 Check', type:'anchor', page:'check/index.html', children:[
    { id:'eligibility', label:'모집 대상' },
    { id:'schedule', label:'모집 프로세스' },
    { id:'benefits', label:'지원 혜택' },
    { id:'faq', label:'자주 묻는 질문' } ]}
];

/* 바깥 연결처. 주소가 정해지면 url만 채웁니다. 비어 있으면 누를 때 note 안내만 띄움.
   본문 링크도 같은 키로 씀: <a data-site-link="apply">(site.js가 주소를 넣거나 안내 토스트) */
const SITE_LINKS = {
  apply:    { url:'', note:'지원하기 연결처는 확인 중이에요' },        // 헤더 · 모바일 메뉴 · 본문 지원하기
  official: { url:'https://support.gj-aischool.or.kr/fo/main', note:'공식 홈페이지 주소는 확정 후 연결돼요' },   // 헤더 · 푸터 '홈페이지'
  notice:   { url:'', note:'모집 공고는 확정 후 연결돼요' },           // 본문 '공식 모집 공고'
  kakao:    { url:'', note:'카카오톡 채널 주소는 확정 후 연결돼요' }   // 본문 카카오톡 문의
};

/* 헤더 검색 패널 아래 추천 키워드. menu · sub는 위 메뉴 · 하위 메뉴 id
   query: 도착 페이지에서 그 분류를 켜 두는 조건(cat=분류 → 본문 [data-cat="분류"][aria-pressed] 버튼, site.js). 통합 검색이 붙기 전까지 */
const SITE_SEARCH_TAGS = [
  { label:'#비전공자', menu:'stories', sub:'reviews' },
  { label:'#타지출신', menu:'life', sub:'tips' },
  { label:'#팀활동', menu:'stories', sub:'reviews' },
  { label:'#지원금', menu:'check', sub:'faq', query:'cat=지원금' }
];
