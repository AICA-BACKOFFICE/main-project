# AICA Backoffice

블로그형 CMS **백오피스**입니다 (관리자 UI는 블로그 관리자 화면 형태, 글쓰기는 전용 화면). 프론트 오피스와 같은 콘텐츠 구조(카테고리 → 게시물 → 블록)를 관리자가 어렵지 않게 운영할 수 있도록, 디자인보다 사용성과 기능을 우선해 구성했습니다.

Java 17 / Spring Boot 3.4.5 / Spring Security 6.4.5 / Thymeleaf / MyBatis 3.5.16 / Flyway / H2(파일 DB, 개발용).
DB 스키마는 Flyway `V1`(기본) · `V2`(버전 이력) · `V3`(템플릿) · `V4`(이미지 폴더) · `V5`(글 레이아웃) · `V6`(템플릿 레이아웃) · `V7`(카테고리 2단 구조·세부 카테고리) · `V8`(운영진 공지·휴지통 상태·미디어 종류/표시 이름) · `V9`(미디어 분류를 게시물 카테고리로 통일) · `V10`(이메일 로그인 ID) · `V11`(선배들의 이야기 고정 양식 값)으로 관리합니다. 0단계 기술 검증 기록은 [docs/STAGE0_VERIFICATION.md](docs/STAGE0_VERIFICATION.md)에 남아 있습니다(검증 코드는 정리됨).

## 주요 기능

| 메뉴 | 기능 |
| --- | --- |
| 관리자 홈 | 오늘·어제·누적 방문수, 최근 30일 일별 방문 그래프, 최근 7일 인기글·게시물 현황 (SUPPORT 는 글 관리로 이동) |
| 카테고리 페이지 관리 | 사이드바 **인사교 알아보기 · 선배들의 이야기 · 인사교 라이프 · 지원 전 체크** → 실제 페이지를 화면 그대로 보며 고치는 전용 편집 화면(글자·사진·아이콘 교체, 카드·항목 추가·이동·삭제, 글자 서식, 마우스로 위치 옮기기·열/행 맞춤, PC·태블릿·모바일 보기), 자동 임시저장, **사이트에 반영**(반영 전 파일 자동 백업 · 버전 기록에서 되돌리기) — ADMIN 이상. [사이트 폴더 연결](#카테고리-페이지-관리-사이트-폴더-연결) 참고 |
| 게시물 관리 | 목록(상태 · **카테고리 → 세부 카테고리** 연동 필터 · 키워드(제목·요약·**작성자 이름/이메일**) · 작성자 링크로 좁히기, 페이징) / 제목 클릭 시 미리보기 / 수정 · 게시 · 미게시 · 휴지통 이동(**이동 시 미게시로 전환**, 이전 상태 기록, 복원하면 이동 전 상태로) / 후기 · 인터뷰 · 프로젝트 · 기수별 모아보기는 **고정 양식**으로 쓰고, 게시 상태가 바뀔 때마다 사이트의 `stories/js/stories-data.js`에 바로 반영(`post/story/`) |
| 휴지통 | 삭제한 글 목록 / 복원(삭제 전 상태 그대로) / 완전 삭제(이력·조회 로그까지 제거) — ADMIN 이상 |
| 글쓰기 | **블록 에디터**(제목·문단·이미지·인용·목록·표·코드·구분선), 서식(굵게·기울임·밑줄·취소선·크기·색·배경·정렬), **글꼴 7종**, 링크 대화상자(http/https 검증), 웹·워드 서식 유지 붙여넣기 → 블록 분할, `/` 블록 메뉴, 마크다운 단축(`# `, `> `, `- `, `1. `, `---`, ```` ``` ````), 키보드 블록 이동·복제, 이미지 업로드(붙여넣기·드래그, 큰 사진 자동 축소)·보관함(기수 폴더별)·정렬·링크, 브라우저 자동 백업·복구, 콘텐츠 속성 패널(공개 상태·카테고리·대표 이미지·요약), 템플릿 패널(불러오기 전용 — 본문 뼈대와 **레이아웃**이 함께 적용) |
| 템플릿 관리 | 레이아웃(프리셋 6종 — 기본·넓게·히어로·매거진·좌/우 사이드바, 전체 정렬·글 영역 폭, 머리 요소 순서와 사이드바·하단 위젯(목차·프로필·최근 글·관련 글·공유)을 드래그로 구성) + 본문 뼈대(빠른 추가·뼈대 세트 4종·블록 에디터)를 템플릿으로 저장 / 미리보기(예시 데이터) / 수정 · 삭제 — 생성·수정·삭제는 ADMIN 이상. 글의 레이아웃은 프론트 미리보기와 공개 API `layout`/`toc` 에 반영 |
| 버전 이력 | 임시저장·발행마다 스냅샷(발행 이력은 모두, 그 외 최근 20개), 내용 보기, 편집기에 불러오기, 복원(복원 전 백업 자동 기록) |
| 템플릿 | 현재 글 구성을 템플릿으로 저장, 불러오기(교체) · 뒤에 추가 · 이름 변경 · 삭제 (최대 100개) |
| 미리보기 | 저장 전·후 모두 프론트 게시물 화면과 같은 템플릿(`front/post.html` + `front/blocks.html`)으로 렌더링 |
| 미디어 관리 | **게시물과 같은 카테고리 2단**(후기 › 생활… / 기수별 모아보기 › 3~5기·6기·7기)으로 분류해 **이미지(10MB) · 동영상 MP4/WEBM(200MB) · PDF(20MB)** 여러 개 업로드(버튼·드래그 앤 드롭, 큰 사진 자동 축소, 파일 시그니처로 형식 판별) / 카테고리·세부 탭 · 종류 탭 · 총 용량 / **표시 이름 변경**(저장 파일명·URL 불변) · 등록자 표시 · 분류 이동 · 주소 복사 · 완전 삭제 / 글쓰기 **보관함**에서 카테고리·세부 탭으로 이미지 꺼내 쓰기 — 분류 이동·이름 변경·삭제는 ADMIN 이상 |
| 운영진 공지 | 최고관리자가 올리면 로그인한 운영진 **전체** 화면 상단에 띠로 표시(안내·주의·긴급, 표시 기간, 고정) / 각자 닫기(개인별) · 수정 시 다시 표시 / 목록·내리기·삭제 |
| FAQ 관리 | 메뉴·화면 틀만 준비 (기능 후속 구현), 게시물 상태 `답변대기` 사용 |
| 이미지 업로드 | 에디터·대표 이미지에서 업로드 (JPG/PNG/GIF/WEBP, 10MB, 시그니처 검사), 1.5MB 초과·2000px 초과 사진은 브라우저에서 먼저 축소 |
| 방문 통계 | 7/14/30일 고유 방문자·페이지뷰·게시물 조회 추이, 게시물별 누적 조회수 — ADMIN 이상 |
| 관리자 계정 | SUPER_ADMIN 전용: 관리자 등록(**로그인 ID = 이메일**, 소문자 정규화)·역할(SUPER_ADMIN / ADMIN / SUPPORT=게시물 등록·수정만)·활성 상태·비밀번호 재설정, 마지막 최상위 관리자 보호 |
| 비밀번호 변경 | 본인 비밀번호 변경 후 재로그인, 임시 비밀번호 상태면 상단에 안내 |

좌측 프로필 카드의 "AICA 홈페이지 이동" 버튼은 `application.yml`의 `backoffice.front-base-url`(현재 `https://www.aica-gj.kr/main.php`)을 엽니다.

프론트 오피스용 공개 API(인증 없음)도 포함되어 있습니다: `GET /api/public/categories`(2단 트리, children 포함), `GET /api/public/posts?category=&sub=&page=&size=`, `GET /api/public/posts/{id}`, `POST /api/public/track/visit`, `POST /api/public/track/posts/{id}/view`.

## 시작하기 (Windows PowerShell)

JDK 17과 `JAVA_HOME`만 준비하면 됩니다. Maven은 Wrapper가 내려받고, DB는 실행 폴더의 `data/`에 H2 파일로 자동 생성됩니다.

```powershell
Set-Location aica-backoffice-main

# 빌드 + 테스트 (기본 검증 + 업무 기능 통합 테스트)
.\mvnw.cmd -B -ntp clean verify

# 실행 (DB 는 data/ 폴더에 자동 생성, 초기 데이터 없음)
# 개발 중에는 아래 한 줄로 바로 실행
.\mvnw.cmd -B -ntp spring-boot:run
# 또는 빌드된 JAR 실행
& "$env:JAVA_HOME\bin\java.exe" -jar .\target\backoffice-0.1.0-SNAPSHOT.jar
```

- 접속: <http://127.0.0.1:8080/> → 로그인 화면
- 최초 관리자: `admin` / `admin1234!` (환경변수 `BACKOFFICE_INITIAL_ADMIN_PASSWORD` 로 변경 가능, 첫 로그인 후 비밀번호 변경 권장)
- H2 콘솔(local 전용): <http://127.0.0.1:8080/h2-console> (JDBC URL `jdbc:h2:file:./data/backoffice`, 사용자 `sa`, 비밀번호 없음)
- DB 를 초기화하려면 서버를 종료하고 `data` 폴더를 삭제한 뒤 다시 실행합니다.

IDE에서 실행할 때는 Lombok 애노테이션 처리(annotation processing)를 켜 주세요.

## 카테고리 페이지 관리 (사이트 폴더 연결)

카테고리 페이지는 공유용 사이트(`aica-site-preview`)의 정적 페이지(`about/index.html` 등)를 그대로 고칩니다. 서버가 그 폴더를 알아야 하므로, 실행할 때 사이트 폴더 위치를 알려 주세요.

```powershell
$env:BACKOFFICE_SITE_ROOT = 'C:\경로\aica-site-preview'   # 이 PC: 바탕화면\백오피스 프로젝트\프론트오피스 (백오피스.cmd가 자동으로 넣음)
.\mvnw.cmd -B -ntp spring-boot:run
```

- 기본값은 `./data/site`(application.yml `backoffice.pages.site-root`). 폴더에 페이지가 없으면 편집 화면에 설정 안내가 나옵니다.
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
| 운영진 공지 | `notice/` | `mapper/notice/` | `templates/notice/`, `layout/admin.html`(상단 띠) | `css/admin.css` |
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

`target`, `data`(H2 파일·업로드 이미지), `.tools`, `.cache`, `.env`는 저장소에서 제외합니다.
