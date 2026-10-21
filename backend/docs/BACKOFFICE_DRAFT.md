# 백오피스 1차 초안 — 구성과 확인 요청 사항

작성일: 2026-09-22  
상태: 1차 초안 (기능·CMS 구조 컨펌용). 디자인 확정 후 프론트 개발과 함께 화면을 다듬는다.  
기준 요구사항: 블로그형 CMS, 게시물 CRUD·카테고리·이미지 업로드·미리보기·관리자 관리·방문자/조회수, 블록 기반 작성.

## 1. 화면 구성

블로그 관리자형 UI 로 구성했다: 흰 배경, 얇은 상단바(메뉴·글쓰기·알림·프로필), 가운데 정렬(1010px), 좌측 프로필 카드 + 쓰기 메뉴 + 그룹 메뉴, 우측 콘텐츠. 관리자 홈은 오늘/어제/누적 방문수 → 30일 방문 추이(붉은 선 그래프) → 최근 7일 통계(인기글·게시물 현황) 순이다. 공통 레이아웃은 `templates/layout/admin.html` 한 파일이며 모든 화면이 이 레이아웃을 사용한다.

```
┌ 사이드바 ─────────┬ 상단바(검색 · 로그인 관리자 · 로그아웃) ───────────────────┐
│ 대시보드          │                                                        │
│  · 현황 요약       │  페이지 제목                                             │
│ 콘텐츠            │  ┌ 카드 ───────────────────────────────────────────────┐ │
│  · 게시물 관리     │  │ [필터 ▾] (표시 n건 / 총 n건)              [신규 등록] │ │
│  · 카테고리 관리   │  │ ID | 게시물 | 카테고리 | 상태 | 조회 | 작성자 | 액션     │ │
│  · FAQ 관리(준비중) │  │ ...                                                 │ │
│ 통계              │  └─────────────────────────────────────────────────────┘ │
│  · 방문자·조회수   │                                                        │
│ 관리자            │  Copyright                                               │
│  · 관리자 계정     │                                                        │
│  · 비밀번호 변경   │                                                        │
└──────────────────┴────────────────────────────────────────────────────────┘
```

| 경로 | 화면 | 권한 |
| --- | --- | --- |
| `/login` | 로그인 | 공개 |
| `/admin` | 현황 요약(대시보드) | 로그인 |
| `/admin/posts`, `/new`, `/{id}/edit` | 게시물 목록·작성·수정 | 로그인 |
| `/admin/posts/{id}/preview`, `POST /admin/posts/preview` | 저장본 미리보기 / 저장 전 미리보기 | 로그인 |
| `/admin/categories` | 카테고리 관리(목록+등록/수정 폼 한 화면) | 조회: 로그인 / 변경: SUPER_ADMIN, ADMIN |
| `/admin/faq` | FAQ 관리 (화면 틀만, 기능 후속) | 로그인 |
| `/admin/stats` | 방문자·조회수 | SUPER_ADMIN, ADMIN |
| `/admin/users` | 관리자 계정 | SUPER_ADMIN |
| `/account/password` | 비밀번호 변경 | 로그인 |
| `/api/public/**` | 프론트용 콘텐츠·집계 API | 공개 |

## 2. CMS 구조

```
categories 1 ── n posts ── blocks_json(블록 배열)
                    │
                    ├─ thumbnail_url (AUTO: 본문 첫 이미지 / MANUAL: 직접 지정)
                    └─ status DRAFT/PENDING(답변대기) → PUBLISHED ↔ HIDDEN, deleted_at(소프트 삭제)
images        업로드 파일 메타 (/uploads/yyyy/MM/uuid.ext)
visit_logs    프론트 방문 기록(일자·방문자 키·경로)  → 고유 방문자·페이지뷰
post_view_logs 게시물 조회 기록 + posts.view_count 누적
admin_users   SUPER_ADMIN / ADMIN / SUPPORT
audit_logs    감사 기록 테이블(1차 초안에서는 스키마만 준비)
```

### 블록 형식

에디터(`static/js/block-editor.js`) → 서버 정화(`BlockContent.java`) → 렌더(`templates/front/blocks.html`)가 모두 같은 JSON 형식을 사용한다. 프론트가 서버 렌더링이면 `blocks.html` 조각을 그대로 가져가고, SPA면 `GET /api/public/posts/{id}` 의 `blocks` 배열을 같은 규칙으로 컴포넌트에 매핑하면 된다.

```json
[
  {"type":"heading","level":2,"html":"제목"},
  {"type":"paragraph","align":"left","html":"본문 <b>굵게</b> <span style=\"color: #dc2626; font-size: 20px;\">색·크기</span>"},
  {"type":"image","url":"/uploads/2026/09/….png","alt":"","caption":"설명","width":"full|medium|small"},
  {"type":"list","style":"bullet|number","items":["항목","<i>항목</i>"]},
  {"type":"quote","html":"인용"},
  {"type":"divider"},
  {"type":"table","rows":[["머리글1","머리글2"],["셀","셀"]]},
  {"type":"code","lang":"java","code":"..."}
]
```

- 인라인 HTML 은 서버에서 allow-list 로 정화한다: `b i u s br span a sub sup mark`, `span` 의 `style` 은 `color / background-color / font-size(px·rem·em, 두 자리) / font-weight / font-style / text-decoration` 만 허용. `<script>`, 이벤트 속성, `position` 등은 제거된다. 이미지 URL 은 `/uploads/…` 또는 `http(s)://` 만 허용.
- 새 블록 타입이 필요하면 세 파일(에디터·정화·렌더)에 한 케이스씩 추가하면 된다.

## 3. 요구사항 대비 결정 사항

| 요구사항 | 1차 초안 결정 | 비고 |
| --- | --- | --- |
| 블록/컴포넌트 기반 작성 | 좌측 메뉴 없는 **별도 글쓰기 화면**(`post/editor.html`): 상단 도구 모음(이미지·문단 모양·크기·B/I/U/S·글자색·배경색·정렬·인용·표·링크·목록·구분선·더보기(코드/서식 지우기)), 카테고리 → 제목 → 본문 → 요약 세로 배치, 하단 바(미리보기·글 관리·삭제 / 자동 저장 안내·임시저장·완료→발행 설정 패널). 블록 8종(텍스트·제목·이미지·목록·인용·구분선·표·코드) | 자동 저장은 브라우저 로컬(3초), Ctrl+S 임시저장. Editor.js 등으로 교체 가능하도록 JSON 형식 독립 유지 |
| 글씨 크기·굵기·기울임·색상 | 텍스트 계열 블록(텍스트·제목·인용·목록) 툴바에서 제공 | 글자 크기는 12~32px 8단계 프리셋 |
| **글꼴 고정** | 에디터에 글꼴 선택을 두지 않고 `front.css` 의 `--f-font` 로 고정 | 프론트 디자인 확정 시 이 변수만 교체 |
| **대표 이미지 지정 방식 (결정 필요)** | 두 방식을 모두 구현해 화면에서 선택: **① 본문 첫 이미지 자동(기본)** ② 직접 업로드 지정 | 세진님과 하나로 확정하거나 둘 다 유지할지 결정 → §5 |
| 미리보기 | 저장 전(편집 중 내용)·저장 후 모두 새 탭에서 프론트 게시물 레이아웃으로 표시 | 상단 검은 띠는 미리보기 표시용(프론트에는 없음) |
| 카테고리 유지보수 | 목록 화면에서 바로 등록·수정·순서·표시/숨김 | 게시물이 있는 카테고리는 삭제 차단 |
| 이미지 업로드 | 로컬 디스크 `data/uploads/yyyy/MM/`, 확장자가 아닌 파일 시그니처로 형식 검사 | 운영에서 S3 등으로 전환 시 `ImageStorageService` 만 교체 |
| 관리자 관리 | SUPER_ADMIN / ADMIN / SUPPORT 3단계. SUPPORT 는 게시물 등록·수정만 가능(삭제·게시 상태 변경·카테고리·통계·계정 관리 불가). 마지막 SUPER_ADMIN 비활성/강등 차단 | SUPPORT 는 경로 권한(SecurityConfig)과 화면 버튼 숨김으로 이중 차단 |
| 방문자 수·조회수 | 프론트가 공개 API 로 방문·조회를 기록하고 백오피스가 집계 | 방문자 키(쿠키 등)는 프론트가 생성해 전달 |
| 삭제 | 게시물은 소프트 삭제(`deleted_at`) | 복구 화면은 후속 |
| DB | H2 파일 DB(설치 없이 실행), SQL 은 PostgreSQL 호환 문법 | PostgreSQL 전환 시 `prod` 프로필 + `postgresql` 드라이버 + `flyway-database-postgresql` 추가 |

## 4. 코드 구조

```
src/main/java/egovframework/backoffice/
├── config/        SecurityConfig(세션 로그인·경로 권한), WebConfig(/uploads 정적 서빙), BackofficeProperties
├── auth/          로그인 처리(UserDetailsService, CurrentAdmin)
├── adminuser/     관리자 계정 CRUD, 비밀번호 변경
├── category/      카테고리 CRUD·순서
├── post/          게시물 CRUD·상태·미리보기, BlockContent(블록 파싱·정화)
├── image/         이미지 업로드·보관함
├── stats/         대시보드·방문/조회 집계
├── api/           프론트용 공개 API
├── bootstrap/     최초 관리자 생성
└── common/        페이징·예외·공통 모델
src/main/resources/
├── db/migration/V1__init_cms.sql   스키마
├── mapper/*.xml                    MyBatis SQL
├── templates/layout/admin.html     공통 레이아웃  |  front/post.html, front/blocks.html  프론트형 렌더
├── static/css/admin.css, front.css |  static/js/block-editor.js, admin.js
```

각 기능은 `Controller(화면·요청) → Service(규칙·트랜잭션) → Mapper(SQL)` 3층이며, 새 콘텐츠 종류가 생기면 `post` 패키지를 복제하는 대신 카테고리와 블록 타입 추가로 대응하는 것을 우선한다.

## 5. 컨펌 요청 항목

1. **대표 이미지**: "본문 첫 이미지 자동"만 남길지, "직접 지정"을 함께 유지할지. (현재 둘 다 제공, 기본은 자동)
2. **블록 종류**: 텍스트·제목·이미지·목록·인용·구분선·표·코드 8종. 추가 후보 — 동영상(유튜브) 임베드, 버튼/링크 카드, 이미지 갤러리, 접은글.
3. **글자 크기 프리셋**(12~32px)과 색상 팔레트(10색 + 직접 선택)를 그대로 둘지, 디자인 가이드에 맞춰 줄일지.
4. **게시물 상태**: 임시저장 / 게시중 / 숨김 / 답변대기(FAQ 질문용) 4단계로 충분한지, 예약 게시(발행 예정 시각)가 필요한지.
5. **관리자 역할**: SUPER_ADMIN / ADMIN / SUPPORT 3단계. SUPPORT 가 타인 글도 수정할 수 있게 둘지, 본인 글만으로 제한할지.
6. **방문자 집계 방식**: 프론트에서 방문자 키(쿠키)를 만들어 API 로 보내는 방식으로 확정할지, 별도 분석 도구(GA 등)를 병행할지.
7. **글꼴**: 프론트 고정 글꼴(현재 Pretendard → 시스템 글꼴 순 fallback) 확정.
8. **운영 DB·이미지 저장소**: PostgreSQL 16 / 오브젝트 스토리지 여부.

## 6. 남은 작업 (디자인 확정 후)

- 시안에 맞춘 색상·간격·아이콘 반영, 프론트 CSS 공유로 미리보기 완전 일치
- 감사 기록(`audit_logs`) 적재와 조회 화면, 삭제 게시물 복구
- 예약 게시, 게시물 검색 고도화(본문 검색), 이미지 리사이즈/썸네일 생성
- PostgreSQL 전환·배포 설정, 운영 환경 세션 저장소
- 임시 비밀번호 상태에서 비밀번호 변경 강제(현재는 안내만 표시)

## 7. 검증

`.\mvnw.cmd -B -ntp clean verify` 로 다음 테스트가 실행된다.

- `BackofficeWebTest` — 로그인/권한, 카테고리 등록, 게시물 등록(스크립트·위험 스타일 정화 확인) → 미리보기 → 게시 → 공개 API 노출·조회수 집계 → 카테고리 삭제 차단 → 소프트 삭제, 이미지 업로드 형식 검사, 관리자 등록과 마지막 SUPER_ADMIN 보호, ADMIN 의 계정 관리 접근 차단
- `BlockContentTest` — 블록 정화 규칙, 대표 이미지·요약 자동 생성, 스타일 필터
- `Stage0DatabaseTest` — 0단계 Flyway·MyBatis·트랜잭션 검증(유지)
