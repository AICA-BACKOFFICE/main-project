# CLAUDE.md — 인공지능사관학교(인사교) 사이트 + 관리자 페이지

이 파일은 이 저장소에서 일하는 Claude가 처음 읽는 안내예요. 팀원 컴퓨터에서 **DB를 우리와 똑같이 세팅**하는 순서가 핵심이에요.
준비물(프로그램 · 버전)은 [`requirements.txt`](requirements.txt)에 있어요.

## 1. 프로젝트 한눈에

| 폴더 | 내용 |
|---|---|
| `backend/` | 관리자 페이지(Spring Framework MVC · MyBatis · Flyway · PostgreSQL, 표준 WAR). `backend/data/` 아래에 DB 서버(`postgres/`, git 제외) · 올린 사진(`uploads/`) · 페이지 임시저장 · 예전 페이지 백업 파일(`pages/backups`, 지금 버전 기록은 DB 표 `page_versions`) |
| `frontend/` | 사이트(정적 HTML). 페이지마다 폴더: `about` 인사교 알아보기 · `stories` 선배들의 이야기 · `life` 인사교 라이프 · `check` 지원 전 체크 · `home` 홈 · `common` 공통(머리글 · 메뉴 · 바닥글 · 글꼴). 디자인은 aica-site-preview에서 가져와요 |
| `scripts/` | `start.mjs`(npm start) · `front-server/`(사이트 서버, 자동 새로고침) · `claude-deploy/`(Claude 배포 링크 만들기) |
| `docs/` | `db/aica_backoffice.sql`(**DB 생성 코드**: 표 + 데이터 전부) · 표 명세서 · FAQ 시트 · `archive/`(git 제외) |
| `sites/aica-backoffice/` | 클라우드 백오피스(Vinext · Cloudflare, 별도 배포, 로컬 DB와 따로). 운영 설명은 `sites/aica-backoffice/운영안내.md` |

### 켜기 · 끄기

| 명령(맨 위 폴더) | 켜지는 것 |
|---|---|
| `npm start` | 관리자 페이지 http://127.0.0.1:8080/ 와 사이트 http://127.0.0.1:4181/ 를 같이 |
| `npm run backoffice` | 관리자 페이지만 |
| `npm run front` | 사이트만 |

- 끄기는 그 터미널에서 Ctrl+C. 관리자 페이지는 전용 PostgreSQL(5433)도 같이 켜고 꺼요(없으면 처음 켤 때 만들어요).
- 포트 바꾸기 `BACKOFFICE_PORT` · `FRONT_PORT`, 브라우저를 열지 않기 `BACKOFFICE_NO_BROWSER=1`.
- 관리자 페이지에서 '사이트에 반영'하거나 글을 발행하면 열어 둔 사이트 화면이 저절로 새로고침돼요.

### 내용이 어디에 있고 어디서 고치나

| 사이트 | 내용 | 원본 | 관리자 페이지 메뉴 |
|---|---|---|---|
| 선배들의 이야기 | 후기 · 인터뷰 · 프로젝트 | DB 표 `reviews` · `interviews` · `projects` → 페이지가 공개 API `/api/public/stories.js`로 받아 그림(`frontend/stories/js/stories-render.js`) | 게시물 관리 › 선배들의 이야기 게시물 관리 |
| 선배들의 이야기 | 기수별 이모저모 | DB 표 `cohort_stories`(게시중인 글이 하나라도 있으면 그 글로, 없으면 `frontend/stories/cohorts.html`의 카드 그대로) | 같은 메뉴 › 기수별 이모저모 |
| 인사교 라이프 | 시설 사진 · 오늘 점심 · 바람 쐬러 가요 | DB 표 `life_facility_spaces` · `life_facility_photos` · `life_foods` · `life_spots` → 카드를 게시 · 삭제할 때마다 게시중인 것만으로 `frontend/life/index.html`의 그 목록을 다시 씀 | 게시물 관리 › 인사교 라이프 게시물 관리 |
| 지원 전 체크 | 자주 묻는 질문 | DB 표 `faqs` → 공개 API `/api/public/faq.js`(`frontend/check/js/faq-render.js`) | 게시물 관리 › 지원 전 Check FAQ 관리 |
| 모든 페이지 | 그 밖의 글 · 사진 | 페이지 파일(`frontend/<페이지>/index.html` 등), 반영할 때마다 DB 표 `page_versions`에 버전 기록 | 카테고리 페이지 관리 |
| 관리자 페이지 | 함께 쓰는 사진 · 동영상 | 파일은 `backend/data/uploads`, 정보는 DB 표 `media` | 게시물 관리 › 미디어 관리 |
| 모든 페이지 | 방문 통계 | DB 표 `visit_logs` · `post_view_logs` ← 모든 페이지의 `frontend/common/js/track.js` | 통계 › 방문 통계 · 관리자 홈 |

- 사이트 서버(4181)가 `/api/public/…` 요청을 관리자 페이지(8080)로 넘겨요. 관리자 페이지가 꺼져 있을 때를 위해 같은 내용을 **사본**(`frontend/stories/js/stories-data.js` · `frontend/check/js/faq-data.js`)으로 써 둬요. 사본은 손으로 고치지 마세요.
- 디자인을 새로 가져올 때(aica-site-preview 동기화)는 페이지의 DB 연결 줄(`stories-data.js` → `../api/public/stories.js` → `stories-render.js` 순서, FAQ 스크립트 3줄, `story-state.js`는 `stories-render.js` 다음)과 `track.js` 줄을 지켜 주세요.

## 2. 꼭 지킬 것

- 관리자 DB는 **이 프로젝트 전용 PostgreSQL 서버**예요: 데이터 폴더 `backend/data/postgres`, 포트 **5433**, 계정 **`aica`**, DB 이름 **`aica_backoffice`**.
  비밀번호는 `backend/src/main/resources/backoffice.properties`의 `datasource.password=${BACKOFFICE_DB_PASSWORD:…}` 기본값(`:` 뒤 ~ `}` 앞)이에요.
  **비밀번호를 채팅 · 문서 · 커밋 메시지에 그대로 쓰지 마세요.** 명령에서는 파일에서 읽어 환경 변수(`PGPASSWORD`)로만 넘겨요.
- 컴퓨터에 원래 있는 PostgreSQL 서버(포트 5432)와 `postgres` 관리자 계정 · 비밀번호는 **쓰지도 묻지도 마세요.**
- 표 구조는 Flyway가 관리해요(`backend/src/main/resources/db/migration/V*.sql`, `backend/src/main/java/db/migration/V*.java`, 지금 V1~V30).
  **이미 적용된 마이그레이션 파일은 절대 고치지 말고**, 바꿀 게 있으면 다음 번호(V31…) 파일을 새로 만들어요. 예전 파일을 고치면 Flyway가 서버를 켜지 않아요.
- DB를 바꾸는 작업(마이그레이션 적용 · 데이터 고치기 · 아래 세팅) 전에는 `pg_dump -Fc`로 `backend/data/db-backups/`에 백업해요(git 제외 폴더).
- 테스트는 H2 메모리 DB(PostgreSQL 모드)로 돌아요: `backend` 폴더에서 `.\mvnw.cmd -B -ntp test`. 켜져 있는 관리자 페이지와 겹치지 않게 작업용 사본에서 돌리면 안전해요.
- `.env` · 비밀번호 · DB 폴더(`backend/data/postgres`) · `backend/data/remember-me.key`는 커밋하지 않아요.

## 3. DB를 우리와 똑같이 세팅하기

[`docs/db/aica_backoffice.sql`](docs/db/aica_backoffice.sql)은 우리 DB(2026-10-21)를 `pg_dump`로 그대로 뽑은 **DB 생성 코드**예요.
표 15개(Flyway 기록표 포함)를 만들고 모든 데이터를 원본 그대로 넣어요. 이 파일을 넣으면 Flyway 기록도 V30까지 똑같이 들어가서,
그 뒤 `npm start`를 하면 마이그레이션을 다시 돌리거나 사이트 파일에서 글을 다시 가져오지 않아요(이미 DB에 다 있으니까요).

> 순서를 지켜 주세요. 먼저 `npm start`부터 하면 관리자 페이지가 빈 DB를 보고 사이트 파일에서 글을 자동으로 가져와 버려요.
> 그래도 아래 5번에서 DB를 지우고 다시 만들기 때문에 결과는 같지만, 처음부터 이 순서대로 하는 게 깔끔해요.

아래 명령은 **Windows PowerShell**, 저장소 맨 위 폴더 기준이에요(macOS는 맨 아래 참고).
명령을 `.ps1` 파일로 저장해서 돌릴 때는 **UTF-8(BOM 있음)**으로 저장하세요. Windows PowerShell 5.1은 BOM 없는 파일을 한국어 ANSI로 읽어서,
폴더 이름(`백오피스 프로젝트`)이나 한글 주석이 깨지고 다음 줄까지 망가져요.

**1) 준비물 확인** — 모두 [`requirements.txt`](requirements.txt)의 버전 이상이어야 해요.

```powershell
node -v
java -version
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" --version   # 17.6 이상
```

**2) 관리자 페이지 끄기** — `npm start`가 켜져 있으면 그 창에서 Ctrl+C. 포트 5433 · 8080이 비어 있어야 해요.

```powershell
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -in 5433, 8080
# 아무것도 안 나와야 해요
```

**3) 변수 준비** (비밀번호는 화면에 찍지 않아요)

```powershell
$PG   = "C:\Program Files\PostgreSQL\17\bin"
$DATA = Join-Path (Get-Location) "backend\data\postgres"      # 폴더 이름에 띄어쓰기가 있어 전체 경로로
$LOG  = Join-Path (Get-Location) "backend\data\postgres.log"
$pw = (Select-String -Path backend\src\main\resources\backoffice.properties `
        -Pattern '^datasource\.password=\$\{BACKOFFICE_DB_PASSWORD:(.*)\}\s*$').Matches[0].Groups[1].Value
$env:PGPASSWORD = $pw
$env:PGCLIENTENCODING = "UTF8"
```

**4) DB 서버 만들기 · 켜기**

- `backend\data\postgres` 폴더가 **없으면**(처음) — 관리자 페이지 실행기(`LocalPostgres.java`)와 똑같은 설정으로 만들어요:

  ```powershell
  $pwfile = New-TemporaryFile
  [IO.File]::WriteAllText($pwfile, $pw)
  & "$PG\initdb.exe" -D $DATA -U aica -A scram-sha-256 "--pwfile=$pwfile" -E UTF8 --locale=C
  Remove-Item $pwfile
  ```

- 폴더가 **이미 있으면**(전에 켠 적 있음) 그대로 두고 다음으로 가요. 5)에서 DB 안을 통째로 바꾸므로, 그 DB에 지키고 싶은 내용이 있으면 켠 뒤 먼저 백업해요(아래 명령).

```powershell
# 켜기: 숨은 창으로 따로 띄우고 포트가 열릴 때까지 기다려요.
# (& "$PG\pg_ctl.exe" start … 로 바로 실행하면 DB 서버가 이 창의 출력을 붙잡아, 서버는 켜졌는데 명령이 끝나지 않을 수 있어요)
Start-Process -FilePath "$PG\pg_ctl.exe" -WindowStyle Hidden `
  -ArgumentList @('start', '-w', '-t', '60', '-D', "`"$DATA`"", '-l', "`"$LOG`"", '-o', '"-p 5433"')
while (-not (Get-NetTCPConnection -LocalPort 5433 -State Listen -ErrorAction SilentlyContinue)) { Start-Sleep -Seconds 1 }
# (폴더가 이미 있었고 지킬 내용이 있으면) 백업:
# New-Item -ItemType Directory -Force backend\data\db-backups | Out-Null
# & "$PG\pg_dump.exe" -h 127.0.0.1 -p 5433 -U aica -d aica_backoffice -Fc -f backend\data\db-backups\before-team-setup.dump
```

**5) DB를 새로 만들기** — 있던 `aica_backoffice`는 지우고 빈 DB를 만들어요(다른 표가 섞이지 않게).

```powershell
& "$PG\psql.exe" -h 127.0.0.1 -p 5433 -U aica -d postgres -v ON_ERROR_STOP=1 `
  -c "DROP DATABASE IF EXISTS aica_backoffice" `
  -c "CREATE DATABASE aica_backoffice ENCODING 'UTF8' TEMPLATE template0"
```

**6) DB 생성 코드 넣기** — 표 15개와 데이터 전부

```powershell
& "$PG\psql.exe" -h 127.0.0.1 -p 5433 -U aica -d aica_backoffice -v ON_ERROR_STOP=1 -q -f docs\db\aica_backoffice.sql
```

중간에 `set_config` · `setval` 결과 표가 여러 개 찍히는 건 정상이에요(번호 줄을 우리 값으로 맞추는 줄). 오류 없이 끝나면 돼요.

**7) 확인** — 아래 숫자가 **모두 같아야** 해요(우리 DB 2026-10-21 기준).

```powershell
& "$PG\psql.exe" -h 127.0.0.1 -p 5433 -U aica -d aica_backoffice -A -F " | " -c "
SELECT 'admin_users' t, COUNT(*) FROM admin_users UNION ALL SELECT 'reviews', COUNT(*) FROM reviews
UNION ALL SELECT 'interviews', COUNT(*) FROM interviews UNION ALL SELECT 'projects', COUNT(*) FROM projects
UNION ALL SELECT 'cohort_stories', COUNT(*) FROM cohort_stories UNION ALL SELECT 'faqs', COUNT(*) FROM faqs
UNION ALL SELECT 'media', COUNT(*) FROM media UNION ALL SELECT 'page_versions', COUNT(*) FROM page_versions
UNION ALL SELECT 'life_facility_spaces', COUNT(*) FROM life_facility_spaces UNION ALL SELECT 'life_facility_photos', COUNT(*) FROM life_facility_photos
UNION ALL SELECT 'life_foods', COUNT(*) FROM life_foods UNION ALL SELECT 'life_spots', COUNT(*) FROM life_spots
UNION ALL SELECT 'visit_logs', COUNT(*) FROM visit_logs UNION ALL SELECT 'post_view_logs', COUNT(*) FROM post_view_logs
UNION ALL SELECT 'flyway_schema_history', COUNT(*) FROM flyway_schema_history
UNION ALL SELECT '(표 개수)', COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'"
```

| 표 | 무엇 | 줄 수 |
|---|---|---|
| admin_users | 관리자 계정(아이디 · 이름 · 비밀번호 해시 · 권한) | 3 |
| reviews | 선배들의 이야기 › 후기 | 64 |
| interviews | 선배들의 이야기 › 인터뷰 | 14 |
| projects | 선배들의 이야기 › 프로젝트 | 42 |
| cohort_stories | 선배들의 이야기 › 기수별 이모저모(사이트 카드 17개를 옮김, 2026-10-21) | 17 |
| faqs | 지원 전 Check › 자주 묻는 질문 | 22 |
| media | 미디어 관리(사진 · 동영상 정보) | 12 |
| page_versions | 카테고리 페이지 관리 버전 기록(반영한 페이지 HTML 전체) | 14 |
| life_facility_spaces | 인사교 라이프 › 시설 공간 | 7 |
| life_facility_photos | 인사교 라이프 › 시설 사진 | 20 |
| life_foods | 인사교 라이프 › 오늘 점심, 여기 어때요? | 20 |
| life_spots | 인사교 라이프 › 수업 끝나고, 바람 쐬러 가요 | 13 |
| visit_logs | 방문 통계(페이지 방문) | 56 |
| post_view_logs | 방문 통계(글 조회) | 4 |
| flyway_schema_history | Flyway 기록(V1~V30 적용) | 30 |
| **(표 개수)** | | **15** |

글 · 카드 · 질문의 상태 칸은 공통 규칙이에요: `DRAFT` 임시저장 · `PUBLISHED` 게시 · `HIDDEN` 미게시 · `DELETED` 삭제됨(휴지통). 휴지통으로 옮기기 전 상태는 `status_before_trash`, 옮긴 시각은 `deleted_at`.
표마다 칸 설명은 SQL 파일 안의 `COMMENT ON COLUMN public.표이름…`에 있어요.

**8) DB 서버 끄고 평소처럼 켜기** — 이제부터는 `npm start`가 DB 서버도 같이 켜고 꺼요.

```powershell
& "$PG\pg_ctl.exe" stop -m fast -D $DATA
Remove-Item Env:PGPASSWORD
npm start
```

관리자 페이지 기록에 `Successfully validated 30 migrations`, `Schema "public" is up to date. No migration necessary.`가 나오면 끝이에요.
'사이트에 있던 글을 가져왔습니다' 같은 줄은 나오지 않아야 해요. 로그인 계정 · 비밀번호는 우리와 같아요(비밀번호는 팀에 직접 물어보세요).

### 함께 맞아야 하는 파일(이미 git에 있음)

DB는 사진 파일을 주소로만 가리켜요. 아래 파일은 git으로 같이 받아지니 따로 할 일은 없어요.

- `backend/data/uploads/` — 미디어 관리 · 글쓰기에서 올린 사진(`media.storage_key`)
- `frontend/**/assets/uploads/` — 사이트 폴더에 복사된 사진(선배들의 이야기 · 인사교 라이프)
- `frontend/stories/js/stories-data.js` · `frontend/life/index.html` — 지금 DB와 같은 내용. 켜면 관리자 페이지가 이 파일들을 DB 기준으로 다시 쓰는데, 내용이 같아서 바뀌지 않아요

### macOS

PostgreSQL 위치만 다르고 명령은 같아요(`.exe` 없이). 예: `PG=/Applications/Postgres.app/Contents/Versions/17/bin` 또는 `PG=$(brew --prefix postgresql@17)/bin`.
비밀번호는 `export PGPASSWORD="$(sed -n 's/^datasource\.password=\${BACKOFFICE_DB_PASSWORD:\(.*\)}$/\1/p' backend/src/main/resources/backoffice.properties)"`,
비밀번호 파일은 `printf %s "$PGPASSWORD" > /tmp/aica-pw && "$PG/initdb" ... --pwfile=/tmp/aica-pw && rm /tmp/aica-pw`.

## 4. DB 생성 코드를 새로 뽑기(우리 쪽 DB가 바뀌었을 때)

글 · 표가 바뀐 뒤 팀원에게 같은 DB를 주려면, 관리자 페이지가 켜진 상태(DB 서버가 켜져 있음)에서 아래로 다시 뽑고 커밋해요.
그리고 위 7)의 줄 수 표를 새 값으로 고쳐요.

```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -h 127.0.0.1 -p 5433 -U aica -d aica_backoffice `
  --format=plain --encoding=UTF8 --no-owner --no-privileges --clean --if-exists -f docs\db\aica_backoffice.sql
```

이 파일에는 관리자 계정(로그인 아이디 · 이름 · 비밀번호 **해시**)과 방문 기록도 들어 있어요. 비밀번호 자체는 들어 있지 않지만, 저장소를 비공개로 유지해 주세요.

## 5. 함께 작업할 때 — GitHub `AICA-BACKOFFICE/main-project`

- 최신 받기: 켜 둔 관리자 페이지를 먼저 끄고(Ctrl+C) `git pull`(또는 GitHub Desktop `Fetch origin › Pull`).
- 올리기: 관리자 페이지를 끄고 → 바뀐 파일 커밋 → 푸시. DB 내용을 같이 주려면 4번대로 DB 생성 코드를 다시 뽑아 함께 커밋해요.
- 관리자 DB는 각자 컴퓨터에만 있어요(git에는 DB 생성 코드만). 관리자 페이지에서 고친 글은 그 컴퓨터 DB에만 있어요.
- 사이트 파일은 받은 사람 컴퓨터에서도 바이트 그대로 같도록 줄바꿈을 바꾸지 않아요(`.gitattributes`). 파일을 고칠 때 원래 줄바꿈(CRLF/LF)을 지켜 주세요.
- 관리자 페이지 코드 · 설정 · 운영 배포는 아래 6번에 있어요.

## 6. 관리자 페이지(backend) 코드 · 설정 · 운영 배포

### 개발 명령(`backend` 폴더)

| 명령 | 하는 일 |
|---|---|
| `.\mvnw.cmd -B -ntp clean verify` | 빌드 + 테스트 전부(H2 메모리 DB) → `target/backoffice.war` |
| `.\mvnw.cmd -B -ntp -Pdev compile exec:java` | 개발 실행(내장 Tomcat 실행기 `src/dev/java/egovframework/launcher/`, 전용 PostgreSQL 5433도 켬). `npm start` · `npm run backoffice`가 이 명령을 돌려요 |
| `psql -h 127.0.0.1 -p 5433 -U aica aica_backoffice` | DB 들여다보기(비밀번호는 2번 규칙대로 `PGPASSWORD`로) |

- JDK 17 이상(우리는 21), `JAVA_HOME` 필요. Maven은 Wrapper가 받아요. IDE에서 돌릴 때는 Lombok 애노테이션 처리(annotation processing)를 켜요.
- 최초 관리자: 표 `admin_users`가 비어 있으면 켤 때 아이디 `admin`(최상위 관리자)을 하나 만들어요(`account/InitialAdminRunner`). 비밀번호는 `backoffice.properties`의 `backoffice.initial-admin.password` 기본값이거나 `BACKOFFICE_INITIAL_ADMIN_PASSWORD` 환경 변수이고, 첫 로그인 때 바꾸게 해요. 3번대로 DB를 넣었으면 이미 계정이 있어서 만들지 않아요.
- 로그인 ID = 이메일(소문자로 맞춤). 권한은 `SUPER_ADMIN` 최상위 관리자(계정 관리 · 영구 삭제까지) · `ADMIN` 관리자(모든 글 · 사이트 편집 · 휴지통 복원) · `SUPPORT` 서포터즈(본인 글 작성 · 수정 · 사진 올리기). 자세한 표는 [`backend/docs/권한정책.md`](backend/docs/권한정책.md).

### Spring Boot 없이 짠 구조

Spring Boot(parent · starter · 자동 설정)를 쓰지 않아요. Maven Enforcer가 Boot 라이브러리가 들어오면 빌드를 막아요.
`config/BackofficeWebApplicationInitializer`가 서블릿 · 보안 필터를 등록하고, `ApplicationConfig`(속성) · `DataConfig`(DB · MyBatis · Flyway · 트랜잭션) · `WebConfig`(Thymeleaf · 정적 자원 · 업로드) · `SecurityConfig`(로그인 · 권한)가 나머지를 직접 설정해요.

### 기능별 파일 위치

Java 패키지(`backend/src/main/java/egovframework/backoffice/`) · 매퍼 XML(`resources/mapper/`) · 템플릿(`resources/templates/`) · JS/CSS(`resources/static/`)가 같은 기능 이름을 써요. 기능 하나를 고칠 때 그 줄의 폴더만 열면 돼요.

| 기능 | Java | 매퍼 XML | 템플릿 | JS / CSS |
|---|---|---|---|---|
| 로그인 · 계정 · 내 정보 | `account/` | `account/` | `account/` | — |
| 선배들의 이야기 게시물(후기 · 인터뷰 · 프로젝트 · 기수별 이모저모), 휴지통, 임시저장함, 관리자 홈 | `post/`(`PostController` · `PostTrashController` · `PostDraftController` · `PostPreviewController` · `DashboardController`, 표 읽고 쓰기 `PostStore` · `StoryTableMapper` · `StoryColumns`), `post/story/`(종류별 양식 `StoryKind` · `StoryContent`, 사이트 사본 쓰기 `StorySiteService`) | `post/StoryTableMapper.xml` | `post/` · `dashboard/` · `front/`(미리보기) | `js/post/` · `css/admin.css` · `css/dashboard.css` |
| 블록 에디터 | `editor/`(블록 JSON 정리 `BlockContent`) | — | `post/editor.html` | `js/editor/*.js` · `css/editor.css` · `css/blocks.css` |
| 미디어 관리 · 사진 올리기 | `media/` | `media/` | `media/` | `js/media/` |
| 카테고리 페이지 관리(버전 기록 `page_versions`) | `page/CategoryPage*` · `PageVersion*` | `page/PageVersionMapper.xml` | `page/editor.html` | `js/page/editor.js` · `canvas.js` · `icons.js` · `photo-editor.js` · `css/page/` |
| 인사교 라이프 게시물 | `page/LifeBoardService`(DB → `life/index.html` 다시 쓰기) · `LifePhotoService` · `LifeTipService` · `LifePhotoController` | `page/LifeMapper.xml` | `page/life-photos.html` | `js/page/life-photos.js` · `css/page/life-photos.css` |
| 지원 전 Check FAQ | `page/CheckFaq*` · `FaqMapper` | `page/FaqMapper.xml` | `faq/` | `js/page/faq.js` |
| 방문 통계 | `stats/` | `stats/` | `stats/` | — |
| 공개 API(로그인 없음) | `publicapi/`(`/api/public/stories(.js)` · `/api/public/faq(.js)` · 방문 기록) | — | — | — |
| 메뉴 분류(코드에 고정, DB 표 없음) | `category/CategoryService` | — | — | `js/category-select.js` |
| 공통 · 설정 | `common/`(예외 · 메뉴 NEW 표시 `NavBadges`) · `config/` | `common/` | `layout/` · `error.html` | `js/admin.js` · `css/admin.css` |
| DB 표 바꾸기 | `backend/src/main/java/db/migration/V*.java` | `db/migration/V*.sql` | — | — |

- 블록 에디터 JS는 `js/editor/core → blocks → render → input → dialogs → toolbar → image-editor → index` 순서로 불러와야 해요(`post/editor.html` 참고). 글쓰기 화면 설정은 `editor.html`의 `<div id="editorConfig" data-*>`로 넘기고 `js/post/editor-page.js`가 읽어요.
- 템플릿에서 CSS · JS를 고치면 주소 끝 `?v=` 값을 새로 바꿔요(브라우저 캐시 때문에).

### 카테고리 페이지 관리와 사이트 폴더

- 관리자 페이지는 사이트 폴더(`BACKOFFICE_SITE_ROOT`, `npm start`가 `frontend`로 넣어 줌)의 HTML 파일을 직접 고쳐요. 기본값 `./data/site`에 페이지가 없으면 편집 화면에 설정 안내가 나와요.
- 편집 중 내용은 `backend/data/pages`에 자동 임시저장되고, **사이트에 반영**을 눌러야 사이트 파일이 바뀌어요. 반영할 때마다 DB 표 `page_versions`에 버전이 남아 '버전 기록'에서 되돌릴 수 있어요(페이지마다 최근 100개).
- 저장할 때 원본의 줄바꿈(CRLF) · 표기(`&middot;` 등)를 지켜 고친 부분만 바뀌어요. 메뉴(페이지 목록)는 `backoffice.pages.items`, 잠글 공통 영역 · 글꼴 · 색은 `BackofficeProperties.Pages` 기본값.
- `BACKOFFICE_FRONT_URL`(예: `http://127.0.0.1:4181/`)을 주면 '반영된 페이지' 버튼이 그 주소를 열어요(비우면 `/admin/pages/site/`).

### 설정(`backend/src/main/resources/backoffice.properties`)

환경 변수로 덮어써요: `BACKOFFICE_DB_URL` · `BACKOFFICE_DB_DRIVER` · `BACKOFFICE_DB_USERNAME` · `BACKOFFICE_DB_PASSWORD` · `BACKOFFICE_UPLOAD_DIR` · `BACKOFFICE_MEDIA_BASE_URL` · `BACKOFFICE_REMEMBER_KEY_FILE` · `BACKOFFICE_INITIAL_ADMIN_PASSWORD` · `BACKOFFICE_SITE_ROOT` · `BACKOFFICE_PAGES_DATA_DIR` · `BACKOFFICE_FRONT_URL` · `BACKOFFICE_FRONT_BASE_URL`(왼쪽 'AICA 홈페이지 이동' 버튼).
개발 실행(`npm start` · `-Pdev`)만 읽는 값: `BACKOFFICE_PORT` · `BACKOFFICE_NO_BROWSER` · `BACKOFFICE_PG_DATA`. 설정 파일 통째로 바꾸기: `-Dbackoffice.config=/절대경로/backoffice.properties`.

### 운영 배포(아직 서버 · DB는 정하지 않음)

- `.\mvnw.cmd -B -ntp clean verify` → `target/backoffice.war`를 **Tomcat 10.1(Servlet 6 / Jakarta)**의 `webapps/ROOT.war`로. Tomcat 9(`javax.servlet`)에서는 안 돌아요. Java 17 이상.
- 운영 DB는 `BACKOFFICE_DB_URL` 등으로 운영 PostgreSQL을 지정하고, 개발용 비밀번호 · 최초 관리자 기본 비밀번호를 쓰지 마세요. 표는 처음 켤 때 Flyway가 만들어요(3번 DB 생성 코드를 넣어도 돼요).
- 상대 경로는 Java 프로세스 작업 폴더 기준이라, 운영에서는 업로드 · 사이트 · 페이지 임시저장 · remember-me 키 경로를 **절대 경로**로 줘요.
- 업로드 한도: 파일 200MB · 요청 205MB. 외부 Tomcat은 HTTP Connector에 `maxPostSize="214958080"` · `maxSwallowSize="-1"`을 넣어요(개발 실행기는 이미 설정).

### 데이터 위치와 보관

| 위치 | 내용 | git |
|---|---|---|
| `backend/data/postgres/` | 관리자 전용 PostgreSQL 데이터 폴더. 파일을 직접 복사하지 말고 `pg_dump`로 백업 | 제외 |
| `backend/data/db-backups/` | DB를 바꾸기 전 `pg_dump -Fc` 백업 | 제외 |
| `backend/data/uploads/` | 미디어 관리 · 글쓰기에서 올린 사진 | 포함 |
| `backend/data/pages/` | 카테고리 페이지 편집 임시저장 · 예전 백업 HTML(`backups/`) | 포함 |
| `backend/data/remember-me.key` | 로그인 유지 키 | 제외 |
| `docs/db/aica_backoffice.sql` | 팀원용 DB 생성 코드(3 · 4번) | 포함 |
| `docs/archive/` | 큰 원본 자료(약 8GB) | 제외 |

- `sites/aica-backoffice/`(클라우드 백오피스)는 이 Java 앱과 다른 앱이고 데이터도 자동으로 맞춰지지 않아요.
