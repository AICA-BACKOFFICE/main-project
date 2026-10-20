# AICA Backoffice

블로그형 CMS **백오피스**입니다 (관리자 UI는 블로그 관리자 화면 형태, 글쓰기는 전용 화면). 프론트 오피스와 같은 콘텐츠 구조(카테고리 → 게시물 → 블록)를 관리자가 어렵지 않게 운영할 수 있도록, 디자인보다 사용성과 기능을 우선해 구성했습니다.

Java 17 이상 / Spring Framework 6.2.6 MVC / Spring Security 6.4.5 / Thymeleaf / MyBatis 3.5.17 / Flyway / PostgreSQL 16 이상(개발 실행 시 백오피스 전용 서버를 저절로 켬, 테스트는 H2 메모리 DB).
DB 스키마는 Flyway `V1`(기본) · `V2`(버전 이력) · `V3`(템플릿) · `V4`(이미지 폴더) · `V5`(글 레이아웃) · `V6`(템플릿 레이아웃) · `V7`(카테고리 2단 구조·세부 카테고리) · `V8`(운영진 공지·휴지통 상태·미디어 종류/표시 이름) · `V9`(미디어 분류를 게시물 카테고리로 통일) · `V10`(이메일 로그인 ID) · `V11`(선배들의 이야기 고정 양식 값) · `V12`(후기 취업 성공 · 진로 고민) · `V13`(인사교 라이프 생활 꿀팁 카드 · 지원 전 체크 FAQ) · `V14`(운영진 공지 표 삭제 — 공지 기능 없앰) · `V15`(인사교 라이프 카드 휴지통 · 버전 기록 · 시설 둘러보기 사진 DB)로 관리합니다. 0단계 기술 검증 기록은 [docs/STAGE0_VERIFICATION.md](docs/STAGE0_VERIFICATION.md)에 남아 있습니다(검증 코드는 정리됨).

## 주요 기능

| 메뉴 | 기능 |
| --- | --- |
| 관리자 홈 | 오늘·어제·누적 방문수, 최근 30일 일별 방문 그래프, 최근 7일 인기글·게시물 현황 |
| 카테고리 페이지 관리 | 사이드바 **인사교 알아보기 · 선배들의 이야기 · 인사교 라이프 · 지원 전 체크** → 실제 페이지를 화면 그대로 보며 고치는 전용 편집 화면(글자·사진·아이콘 교체, 카드·항목 추가·이동·삭제, 글자 서식, 마우스로 위치 옮기기·열/행 맞춤, PC·태블릿·모바일 보기), 자동 임시저장, **사이트에 반영**(반영 전 파일 자동 백업 · 버전 기록에서 되돌리기) — ADMIN 이상. [사이트 폴더 연결](#카테고리-페이지-관리-사이트-폴더-연결) 참고 |
| 게시물 관리 | 왼쪽 메뉴 **선배들의 이야기 게시물 관리 · 인사교 라이프 게시물 관리** 왼쪽 화살표로 세부 카테고리 펼치기(선배 후기 · 선배 인터뷰 · 프로젝트 · 기수별 모아보기 → `/admin/posts?kind=` / 시설 사진 · 오늘 점심 · 바람 쐬러 → `/admin/pages/life-photos?section=`) / 목록(상태 · **카테고리 → 세부 카테고리** 연동 필터 · 키워드(제목·요약·**작성자 이름/이메일**) · 작성자 링크로 좁히기, 페이징) / 제목 클릭 시 미리보기 / 수정 · 게시 · 미게시 · 휴지통 이동(**이동 시 미게시로 전환**, 이전 상태 기록, 복원하면 이동 전 상태로) / 후기 · 인터뷰 · 프로젝트 · 기수별 모아보기는 **고정 양식**으로 쓰고, 게시 상태가 바뀔 때마다 사이트의 `stories/js/stories-data.js`에 바로 반영(`post/story/`) / 인사교 라이프 게시물 관리: 시설 사진 · 오늘 점심 · 바람 쐬러 가요 모두 DB(`life_facility_photos` · `life_foods` · `life_spots`), 저장할 때마다 바로 전 모습을 **버전 기록**(`life_versions`, 묶음마다 최근 50개)에 남겨 되돌리기, 목록에서 뺀 카드는 **휴지통 › 인사교 라이프 카드** 탭에서 꺼내기 · 완전 삭제(최상위 관리자) |
| 휴지통 | 삭제한 글 목록 / 복원은 관리자 이상, 개별·선택 영구 삭제와 전체 비우기는 최상위 관리자 전용 |
| 글쓰기 | **블록 에디터**(제목·문단·이미지·인용·목록·표·코드·구분선), 서식(굵게·기울임·밑줄·취소선·크기·색·배경·정렬), **글꼴 7종**, 링크 대화상자(http/https 검증), 웹·워드 서식 유지 붙여넣기 → 블록 분할, `/` 블록 메뉴, 마크다운 단축(`# `, `> `, `- `, `1. `, `---`, ```` ``` ````), 키보드 블록 이동·복제, 이미지 업로드(붙여넣기·드래그, 큰 사진 자동 축소)·보관함(기수 폴더별)·정렬·링크, 브라우저 자동 백업·복구, 콘텐츠 속성 패널(공개 상태·카테고리·대표 이미지·요약), 템플릿 패널(불러오기 전용 — 본문 뼈대와 **레이아웃**이 함께 적용) |
| 템플릿 관리 | 레이아웃(프리셋 6종 — 기본·넓게·히어로·매거진·좌/우 사이드바, 전체 정렬·글 영역 폭, 머리 요소 순서와 사이드바·하단 위젯(목차·프로필·최근 글·관련 글·공유)을 드래그로 구성) + 본문 뼈대(빠른 추가·뼈대 세트 4종·블록 에디터)를 템플릿으로 저장 / 미리보기(예시 데이터) / 수정 · 삭제 — 생성·수정·삭제는 ADMIN 이상. 글의 레이아웃은 프론트 미리보기와 공개 API `layout`/`toc` 에 반영 |
| 버전 이력 | 임시저장·발행마다 스냅샷(발행 이력은 모두, 그 외 최근 20개), 내용 보기, 편집기에 불러오기, 복원(복원 전 백업 자동 기록) |
| 템플릿 | 현재 글 구성을 템플릿으로 저장, 불러오기(교체) · 뒤에 추가 · 이름 변경 · 삭제 (최대 100개) |
| 미리보기 | 저장 전·후 모두 프론트 게시물 화면과 같은 템플릿(`front/post.html` + `front/blocks.html`)으로 렌더링 |
| 미디어 관리 | **게시물과 같은 카테고리 2단**(후기 › 생활… / 기수별 모아보기 › 3~5기·6기·7기)으로 분류해 **이미지(10MB) · 동영상 MP4/WEBM(200MB) · PDF(20MB)** 여러 개 업로드(버튼·드래그 앤 드롭, 큰 사진 자동 축소, 파일 시그니처로 형식 판별) / 카테고리·세부 탭 · 종류 탭 · 총 용량 / **표시 이름 변경**(저장 파일명·URL 불변) · 등록자 표시 · 분류 이동 · 주소 복사 · 완전 삭제 / 글쓰기 **보관함**에서 카테고리·세부 탭으로 이미지 꺼내 쓰기 — 분류 이동·이름 변경·삭제는 ADMIN 이상 |
| FAQ 관리 | 메뉴·화면 틀만 준비 (기능 후속 구현), 게시물 상태 `답변대기` 사용 |
| 이미지 업로드 | 에디터·대표 이미지에서 업로드 (JPG/PNG/GIF/WEBP, 10MB, 시그니처 검사), 1.5MB 초과·2000px 초과 사진은 브라우저에서 먼저 축소 |
| 방문 통계 | 7/14/30일 고유 방문자·페이지뷰·게시물 조회 추이, 게시물별 누적 조회수 — 전체 역할 |
| 관리자 계정 | SUPER_ADMIN 전용: 관리자 등록(**로그인 ID = 이메일**, 소문자 정규화)·역할(SUPER_ADMIN / ADMIN / SUPPORT=본인 글·업로드·통계)·활성 상태·비밀번호 재설정, 마지막 최상위 관리자 보호 |
| 비밀번호 변경 | 본인 비밀번호 변경 후 재로그인, 임시 비밀번호 상태면 비밀번호 변경 화면에 안내 |

좌측 프로필 카드의 "AICA 홈페이지 이동" 버튼은 `backoffice.properties`의 `backoffice.front-base-url`(현재 `https://www.aica-gj.kr/main.php`)을 엽니다.

프론트 오피스용 공개 API(인증 없음)도 포함되어 있습니다: `GET /api/public/categories`(2단 트리, children 포함), `GET /api/public/posts?category=&sub=&page=&size=`, `GET /api/public/posts/{id}`, `POST /api/public/track/visit`, `POST /api/public/track/posts/{id}/view`.

사이트 페이지가 게시물을 그릴 때 쓰는 API(DB의 지금 내용, 캐시 없음). 같은 내용을 `.js`로 부르면 `window.STORIES_DATA` · `window.LIFE_DATA` · `window.FAQ_DATA`로 받습니다:
`GET /api/public/stories(.js)`(선배들의 이야기 후기 · 인터뷰 · 프로젝트 · 기수 기록), `GET /api/public/life(.js)`(인사교 라이프 식당 · 카페 · 바람 쐬러 갈 곳 · 시설 둘러보기 사진), `GET /api/public/faq(.js)`(지원 전 체크 자주 묻는 질문).
백오피스가 꺼져 있을 때를 위해 저장할 때마다 같은 내용을 사이트 폴더에 사본(`stories/js/stories-data.js` · `life/js/life-data.js` · `check/js/faq-data.js`)으로도 씁니다.

## 시작하기 (Windows PowerShell)

JDK 17과 `JAVA_HOME`, PostgreSQL 16 이상(설치만)을 준비하면 됩니다. Maven은 Wrapper가 내려받습니다. 개발 실행(`-Pdev exec:java`)은 설치된 PostgreSQL 프로그램(initdb · pg_ctl)으로 `data/postgres`에 백오피스 전용 서버(포트 5433, 계정 `aica`)를 만들고 켭니다. 컴퓨터에 원래 있던 PostgreSQL 서버와 postgres 비밀번호는 쓰지 않습니다. 처음 켤 때 `data/backoffice.mv.db`(예전 H2 데이터)가 있으면 PostgreSQL로 옮깁니다.

```powershell
Set-Location aica-backoffice-main

# 빌드 + 테스트 (기본 검증 + 업무 기능 통합 테스트)
.\mvnw.cmd -B -ntp clean verify

# 실행 (백오피스 전용 PostgreSQL을 data/postgres 에 만들고 켬. 예전 H2 데이터가 있으면 처음 한 번 옮김)
# 개발 중에는 아래 한 줄로 바로 실행
.\mvnw.cmd -B -ntp -Pdev compile exec:java
# 운영: 빌드된 target/backoffice.war를 Tomcat 10.1에 배포 (아래 참고)
```

- 접속: <http://127.0.0.1:8080/> → 로그인 화면
- 최초 관리자: `admin` / `admin1234!` (환경변수 `BACKOFFICE_INITIAL_ADMIN_PASSWORD` 로 변경 가능, 첫 로그인 후 비밀번호 변경 권장)
- DB 들여다보기: `psql -h 127.0.0.1 -p 5433 -U aica aica_backoffice`(비밀번호는 `backoffice.properties`의 `datasource.password`)
- 예전 H2 데이터를 다시 옮기기(PostgreSQL 내용은 지움): `mvnw.cmd -Pdev compile exec:java "-Dexec.args=--copy-h2 --replace"`
- DB 를 초기화하려면 서버를 종료하고 `data/postgres` 폴더를 지운 뒤 다시 실행합니다(예전 H2 데이터가 있으면 다시 옮겨 옴).

IDE에서 실행할 때는 Lombok 애노테이션 처리(annotation processing)를 켜 주세요.

## Spring Framework 실행·배포

Spring Boot parent·starter·자동설정·실행 플러그인을 사용하지 않습니다. `BackofficeWebApplicationInitializer`가 서블릿·보안 필터를 등록하고, `ApplicationConfig`, `DataConfig`, `WebConfig`, `SecurityConfig`가 속성·DB·MyBatis·트랜잭션·Thymeleaf·업로드·인증을 명시적으로 구성합니다.

- **개발:** `mvnw.cmd -Pdev compile exec:java` — 별도 개발 프로필의 Tomcat 실행기를 사용합니다. 루트의 `백오피스.cmd` / `.command`도 이 명령을 실행합니다.
- **운영:** `mvnw.cmd clean verify` → `target/backoffice.war`. Java 17 이상과 **Tomcat 10.1(Servlet 6 / Jakarta)**을 준비하고 `webapps/ROOT.war`로 배포하면 루트 주소에서 사용할 수 있습니다. Tomcat 9의 `javax.servlet` 환경과 호환되지 않습니다.
- **설정:** `src/main/resources/backoffice.properties`. `BACKOFFICE_DB_URL`, `BACKOFFICE_DB_DRIVER`, `BACKOFFICE_DB_USERNAME`, `BACKOFFICE_DB_PASSWORD`, `BACKOFFICE_UPLOAD_DIR`, `BACKOFFICE_SITE_ROOT`, `BACKOFFICE_PAGES_DATA_DIR`, `BACKOFFICE_FRONT_URL`로 덮어쓸 수 있습니다(개발 실행기는 `BACKOFFICE_PG_DATA` · `BACKOFFICE_H2_FROM`도 읽음). 운영에서는 `BACKOFFICE_DB_URL` 등으로 운영 PostgreSQL을 지정하고 개발용 비밀번호를 쓰지 마세요. 외부 파일은 `-Dbackoffice.config=/절대경로/backoffice.properties`로 지정합니다. 상대 경로는 Java 프로세스의 작업 디렉터리 기준이므로 운영에서는 DB·업로드·사이트·백업 경로를 절대 경로로 설정하세요.
- **DB:** PostgreSQL(드라이버는 주소로 저절로 고름). Flyway V1~V13은 그대로 PostgreSQL에서 돌고, 기존 H2 데이터는 개발 실행기가 처음 한 번 옮깁니다(`src/dev/java/egovframework/launcher/H2ToPostgres.java`). 테스트는 H2 메모리 DB(PostgreSQL 모드)로 돌며, 같은 테스트를 PostgreSQL로도 확인했습니다.
- **업로드:** 파일 200MB·요청 205MB. 외부 Tomcat에서는 HTTP Connector의 `maxPostSize="214958080"`, `maxSwallowSize="-1"`을 설정하면 큰 파일의 업로드와 초과 오류 응답을 처리할 수 있습니다. 개발 실행기는 해당 값을 설정합니다.
- **검증:** Spring Test·MockMvc와 실제 Spring Security 필터로 기존 통합 테스트를 실행합니다. Maven Enforcer가 Boot 관련 라이브러리의 재유입을 차단합니다.

현재 `.chatgpt.site`의 `sites/aica-backoffice`는 별도 TypeScript 클라우드 앱입니다. 이 Java WAR의 배포 대상은 Tomcat이며 해당 클라우드 앱과 데이터가 자동 동기화되지 않습니다.

## 카테고리 페이지 관리 (사이트 폴더 연결)

카테고리 페이지는 공유용 사이트(`aica-site-preview`)의 정적 페이지(`about/index.html` 등)를 그대로 고칩니다. 서버가 그 폴더를 알아야 하므로, 실행할 때 사이트 폴더 위치를 알려 주세요.

```powershell
$env:BACKOFFICE_SITE_ROOT = 'C:\경로\aica-site-preview'   # 이 PC: 바탕화면\백오피스 프로젝트\프론트오피스 (백오피스.cmd가 자동으로 넣음)
.\mvnw.cmd -B -ntp -Pdev compile exec:java
```

- 기본값은 `./data/site`(backoffice.properties `backoffice.pages.site-root`). 폴더에 페이지가 없으면 편집 화면에 설정 안내가 나옵니다.
- 사이트를 따로 띄운 프론트오피스(예: `http://127.0.0.1:4181/`)가 있으면 `$env:BACKOFFICE_FRONT_URL`로 알려 주세요. 편집 화면의 '반영된 페이지' 버튼이 그 주소를 엽니다(비우면 이 서버의 `/admin/pages/site/`에서 보여 줌).
- 편집 내용은 자동으로 임시저장(`./data/pages`, 저장소에서 제외)되고, **사이트에 반영**을 눌러야 사이트 폴더의 파일이 바뀝니다. 반영 전 파일은 `./data/pages/backups`에 남아 '버전 기록'에서 다시 불러올 수 있습니다.
- 저장할 때 원본의 줄바꿈(CRLF)·표기(`&middot;` 등)를 그대로 지켜, 고친 부분만 파일에서 바뀝니다. 공개 사이트(GitHub Pages)에는 반영 후 사이트 폴더를 평소처럼 커밋·푸시합니다.
- 메뉴(페이지 목록)는 `backoffice.pages.items`, 편집 화면에서 잠글 공통 영역·글꼴·색 목록은 `BackofficeProperties.Pages` 기본값을 씁니다.
- 편집 화면은 사이트 파일을 `/admin/pages/site/**` 로 읽어(로그인 필요) 실제 페이지와 같은 상대 경로로 CSS·그림을 불러옵니다.

## 프로젝트 구조 (기능별)

Java 패키지 · 매퍼 XML · 템플릿 · 정적 자원이 같은 기능 이름을 공유합니다. 기능 하나를 고칠 때 아래 한 줄의 폴더들만 열면 됩니다.

| 기능 | Java (`egovframework.backoffice.*`) | 매퍼 XML | 템플릿 | JS / CSS |
| --- | --- | --- | --- | --- |
| 인증·계정 | `account/` (로그인, 세션 사용자, 관리자 계정, 비밀번호, 최초 관리자) | `mapper/account/` | `templates/account/` | — |
| 게시물 관리 | `post/` (목록·등록·수정·상태 `PostController`, 휴지통 `PostTrashController`, 미리보기 `PostPreviewController`) | `mapper/post/` | `templates/post/` | `css/admin.css` |
| 버전 이력 | `post/version/` | `mapper/post/PostVersionMapper.xml` | (글쓰기 화면 안) | `js/post/history.js` |
| 글쓰기(블록 에디터) | `editor/BlockContent` (블록 JSON 정화 규칙) | — | `templates/post/editor.html` + `editor/_*.html` | `js/editor/*.js`(라이브러리), `js/post/*.js`(페이지), `css/editor.css`, `css/blocks.css` |
| 템플릿 관리 | `template/` (관리 화면 `PostTemplatePageController`, 불러오기 JSON `PostTemplateController`), `editor/PostLayout`(레이아웃 규칙) | `mapper/template/` | `templates/template/`, `templates/post/editor/_template-panel.html`(글쓰기 불러오기), `front/widgets.html` | `js/template/*.js`, `js/post/templates.js` |
| 미디어 관리 | `media/` | `mapper/media/` | `templates/media/` | `js/media/library.js`, `js/editor/core.js`(축소·업로드) |
| 카테고리(조회 전용, 2단) | `category/` — 후기(생활·수업·프로젝트·취업·진로) · 인터뷰 · 프로젝트 · 기수별 모아보기(3~5기·6기·7기), 값은 V7 시드 | `mapper/category/` | — | `js/category-select.js`(연동 셀렉트) |
| 통계 | `stats/` | `mapper/stats/` | `templates/dashboard/`, `templates/stats/` | `css/dashboard.css` |
| 공개 API | `publicapi/` | — | — | — |
| 카테고리 페이지 관리 | `page/` (편집 화면·사이트 파일 `CategoryPageController`, 저장·반영 API `CategoryPageApiController`, 파일 관리 `CategoryPageService`) | — | `templates/page/editor.html`, `layout/admin.html`(사이드바 메뉴) | `js/page/editor.js`(편집 화면), `js/page/canvas.js`(페이지 위 편집 도구), `js/page/icons.js`, `css/page/*.css` |
| FAQ(자리표시) | `faq/` | — | `templates/faq/` | — |
| 공통 | `common/`(예외·공통 모델), `config/`(보안·속성·정적 자원) | — | `templates/layout/`, `error.html` | `js/admin.js`, `css/admin.css`, `css/front.css` |

- 블록 에디터 JS는 `js/editor/core → blocks → render → input → dialogs → toolbar → index` 순서로 로드해야 합니다(`editor.html` 참고).
- 글쓰기 페이지 설정값은 `editor.html`의 `<div id="editorConfig" data-*>`로 전달되고 `js/post/editor-page.js`의 `PostEditorPage.init()`이 읽습니다.
- Flyway 마이그레이션(`db/migration/V1~V10`)은 체크섬이 기록되므로 이름·내용을 바꾸지 않습니다.

## 문서

- [1차 초안 구성·화면·결정 사항·확인 필요 항목](docs/BACKOFFICE_DRAFT.md) ← 세진님 컨펌용
- [초기 개발 제안서](read.md)
- [현재 파일 구조와 동작 방식 보고서](docs/AICA_백오피스_현재구조_동작보고서.pdf) · [기능별 파일 재분배 기획서](docs/AICA_백오피스_기능별_파일재분배_기획서.pdf)
- [0단계 기술 검증 결과](docs/STAGE0_VERIFICATION.md) (검증 코드는 정리 단계에서 제거, 기록만 보존)
- [동료가 전달한 원본 설계 문서](docs/reference/README.md) / [비교](docs/reference/README_COMPARISON.md)

`target`, `data/postgres`(백오피스 전용 PostgreSQL), `.tools`, `.cache`, `.env`는 저장소에서 제외합니다.

최신 역할별 권한과 테스트 범위는 [권한정책](docs/권한정책.md)을 참고하세요.
