# 백오피스 (Back-Office) 시스템

전자정부 표준프레임워크(eGovFrame) RTE 4.3.0 기반의 관리자용 백오피스입니다.
관리자 계정 관리(RBAC)와 게시물 관리를 제공하며, 일반 사용자 회원가입 없이
최상위 관리자(SUPER_ADMIN)가 서브 관리자 계정을 직접 발급하는 구조입니다.

---

## 1. 기술 스택

| 구분 | 버전 / 선택 | 비고 |
| --- | --- | --- |
| 표준프레임워크 | 전자정부 표준프레임워크 RTE 4.3.0 | 관리자·사용자 모듈 공통 |
| 언어 | Java 17 | LTS |
| 애플리케이션 | Spring Boot 3.4.5 | 실행형 JAR, 내장 Tomcat |
| 프레임워크 | Spring Framework 6.2.6 | |
| 보안 | Spring Security 6.4.5 | 인증·인가(RBAC) |
| WAS | 내장 Tomcat 10.1.40 | Servlet 6.0 (jakarta.*) |
| 영속성 | MyBatis 3.5.x (eGovFrame 표준 `EgovAbstractMapper`) | XML Mapper |
| 데이터베이스 | PostgreSQL 16 | 개발 환경은 Docker |
| 마이그레이션 | Flyway | `src/main/resources/db/migration` |
| 인증 토큰 | JWT (Access 15분 / Refresh 7일) + BCrypt | jjwt 0.12.x |
| 뷰 | Thymeleaf (서버 렌더링) | 관리 화면. 별도 SPA 없이 단일 배포 |
| 빌드 | Maven 3.9+ (Wrapper 포함) | `./mvnw` |
| API 문서 | springdoc-openapi 2.8.x | `/swagger-ui.html` |
| 배포 | Docker + GitHub Actions | 서버 1대 + 관리형 DB |

> eGovFrame RTE 4.3.0은 Spring Boot 3.x / Jakarta EE 10 기반이므로 `javax.*` 대신 `jakarta.*` 패키지를 사용합니다.
> 기존 eGovFrame 3.x 코드나 라이브러리를 재사용할 경우 패키지 마이그레이션이 필요합니다.

---

## 2. 기능 범위

| 모듈 | 기능 | 사용 역할 |
| --- | --- | --- |
| 인증 | 로그인 / 로그아웃, 토큰 재발급 | 전체 |
| 인증 | 본인 비밀번호 변경 (임시 비밀번호 계정은 첫 로그인 시 변경 강제) | 전체 |
| 계정 관리 | 관리자 계정 생성 (임시 비밀번호 자동 발급, 화면 1회 표시) | SUPER_ADMIN |
| 계정 관리 | 계정 목록 조회, 비활성화, 비밀번호 초기화, 역할 변경 | SUPER_ADMIN |
| 게시물 | 게시물 등록 / 수정 | SUPER_ADMIN, ADMIN |
| 게시물 | 게시물 삭제 (Soft delete). ADMIN은 본인 글만, SUPER_ADMIN은 전체 | SUPER_ADMIN, ADMIN |
| 감사 | 계정 생성·역할 변경·게시물 삭제 이력 조회 | SUPER_ADMIN |

범위 밖: 일반 사용자 회원가입, 소셜 로그인, 이메일 인증, 댓글·검색·통계.

---

## 3. 권한(RBAC) 설계

역할은 두 개로 시작합니다. `users.role` 컬럼(enum)으로 관리하고, 역할이 늘어나면
`roles` / `permissions` 테이블로 분리합니다.

| 기능 | SUPER_ADMIN | ADMIN |
| --- | --- | --- |
| 로그인 / 로그아웃 / 본인 비밀번호 변경 | O | O |
| 관리자 계정 생성·목록·비활성화·초기화 | O | X |
| 게시물 등록 | O | O |
| 본인 게시물 수정·삭제 | O | O |
| 타인 게시물 수정·삭제 | O | X |
| 감사 로그 조회 | O | X |

구현 방식

- URL 단위: `SecurityFilterChain`에서 `/api/v1/users/**`, `/api/v1/audit-logs/**`는 `hasRole('SUPER_ADMIN')`
- 메서드 단위: `@PreAuthorize("hasRole('SUPER_ADMIN')")` / `@PreAuthorize("hasAnyRole('SUPER_ADMIN','ADMIN')")`
- 소유권 검사("본인 글인지")는 서비스 계층에서 `author_id` 비교
- 보호 장치: 마지막 SUPER_ADMIN은 비활성화·강등 불가, 자기 자신의 역할·활성 상태 변경 불가
- 화면은 역할에 따라 메뉴를 숨기지만 최종 검사는 항상 서버에서 수행

---

## 4. 프로젝트 구조

eGovFrame 표준 패키지 규칙(`egovframework.*`)을 따르며, 관리자·사용자 모듈이 공통 모듈을 공유합니다.

```
backoffice/
├── pom.xml
├── mvnw, mvnw.cmd
├── docker-compose.yml                # 로컬 PostgreSQL
├── Dockerfile
└── src/
    ├── main/
    │   ├── java/egovframework/
    │   │   ├── BackofficeApplication.java
    │   │   ├── com/                          # 공통 모듈 (관리자·사용자 공용)
    │   │   │   ├── cmm/                      # 공통 유틸, 응답 래퍼, 예외 처리
    │   │   │   ├── config/                   # Security, MyBatis, Swagger, CORS 설정
    │   │   │   ├── security/                 # JWT 필터, UserDetailsService, 핸들러
    │   │   │   └── audit/                    # 감사 로그 AOP
    │   │   ├── admin/                        # 관리자 모듈
    │   │   │   ├── auth/                     # 로그인, 토큰, 비밀번호 변경
    │   │   │   ├── user/                     # 관리자 계정 관리 (SUPER_ADMIN)
    │   │   │   └── post/                     # 게시물 관리
    │   │   └── user/                         # 사용자 모듈 (공개 API, 향후 확장)
    │   │       └── post/                     # 공개 게시물 조회
    │   └── resources/
    │       ├── application.yml
    │       ├── application-local.yml
    │       ├── application-prod.yml
    │       ├── egovframework/mapper/         # MyBatis XML Mapper
    │       │   ├── admin/
    │       │   └── user/
    │       ├── db/migration/                 # Flyway (V1__init.sql ...)
    │       ├── templates/                    # Thymeleaf 관리 화면
    │       └── static/
    └── test/java/egovframework/
```

각 도메인 패키지는 eGovFrame 표준 계층을 따릅니다.

```
post/
├── web/PostController.java          # @RestController
├── service/PostService.java         # interface
├── service/impl/PostServiceImpl.java    # extends EgovAbstractServiceImpl
├── service/impl/PostMapper.java     # @Mapper("postMapper"), extends EgovAbstractMapper
└── service/PostVO.java              # VO / DTO
```

---

## 5. 데이터베이스

테이블 4개로 시작합니다. 스키마는 Flyway로 관리하며 `V1__init.sql`에 정의합니다.

| 테이블 | 용도 | 주요 컬럼 |
| --- | --- | --- |
| `users` | 관리자 계정 | id(uuid), email(unique), name, password_hash, role, must_change_password, is_active, failed_login_count, locked_until, created_by, created_at, updated_at |
| `posts` | 게시물 | id(uuid), title, content, is_published, author_id, deleted_at, created_at, updated_at |
| `refresh_tokens` | 리프레시 토큰 | id, user_id, token_hash, expires_at, revoked_at |
| `audit_logs` | 감사 로그 | id(bigserial), actor_id, action, target_type, target_id, ip, created_at |

인덱스: `users(email)`, `posts(author_id, deleted_at)`, `refresh_tokens(user_id)`, `audit_logs(actor_id, created_at)`

로컬 DB 실행:

```bash
docker compose up -d postgres
```

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: backoffice
      POSTGRES_USER: backoffice
      POSTGRES_PASSWORD: backoffice
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

---

## 6. API 개요

기본 경로 `/api/v1`. 로그인·토큰 재발급을 제외한 모든 API는 `Authorization: Bearer <token>` 필요.

| 메서드 | 경로 | 설명 | 허용 역할 |
| --- | --- | --- | --- |
| POST | /auth/login | 로그인, 토큰 발급 | 공개 |
| POST | /auth/refresh | Access Token 재발급 | 공개 (Refresh 쿠키) |
| POST | /auth/logout | Refresh Token 폐기 | 전체 |
| GET | /auth/me | 내 정보 | 전체 |
| PATCH | /auth/me/password | 내 비밀번호 변경 | 전체 |
| GET | /users | 관리자 목록 | SUPER_ADMIN |
| POST | /users | 관리자 계정 생성 | SUPER_ADMIN |
| PATCH | /users/{id} | 이름·역할·활성 상태 변경 | SUPER_ADMIN |
| POST | /users/{id}/reset-password | 임시 비밀번호 재발급 | SUPER_ADMIN |
| GET | /posts | 게시물 목록 (페이징, 검색) | 전체 |
| GET | /posts/{id} | 게시물 상세 | 전체 |
| POST | /posts | 게시물 등록 | 전체 |
| PATCH | /posts/{id} | 게시물 수정 | 본인 글 또는 SUPER_ADMIN |
| DELETE | /posts/{id} | 게시물 삭제 (soft) | 본인 글 또는 SUPER_ADMIN |
| GET | /audit-logs | 감사 로그 조회 | SUPER_ADMIN |

에러 응답은 `{ "code": "...", "message": "..." }`로 통일하며 401(인증 실패)과 403(권한 없음)을 구분합니다.
상세 스펙은 실행 후 `http://localhost:8080/swagger-ui.html`에서 확인합니다.

---

## 7. 시작하기

### 요구 사항

- JDK 17
- Docker (로컬 PostgreSQL)
- Maven은 Wrapper(`./mvnw`) 사용, 별도 설치 불필요

### 환경 변수

`application-local.yml`은 아래 환경 변수를 읽습니다. 저장소에 실제 값을 커밋하지 않습니다.

| 변수 | 설명 | 예시 |
| --- | --- | --- |
| `DB_URL` | JDBC URL | `jdbc:postgresql://localhost:5432/backoffice` |
| `DB_USERNAME` / `DB_PASSWORD` | DB 접속 정보 | `backoffice` / `backoffice` |
| `JWT_SECRET` | HS256 서명 키 (32바이트 이상) | `openssl rand -base64 48` 로 생성 |
| `JWT_ACCESS_TTL` | Access Token 만료(분) | `15` |
| `JWT_REFRESH_TTL` | Refresh Token 만료(일) | `7` |
| `INIT_ADMIN_EMAIL` | 최초 SUPER_ADMIN 이메일 | `admin@example.com` |
| `INIT_ADMIN_PASSWORD` | 최초 SUPER_ADMIN 임시 비밀번호 | 첫 로그인 시 변경 강제 |

### 실행

```bash
# 1) DB 기동
docker compose up -d postgres

# 2) 환경 변수 설정 (예: .env.local 을 source)
export DB_URL=jdbc:postgresql://localhost:5432/backoffice
export DB_USERNAME=backoffice
export DB_PASSWORD=backoffice
export JWT_SECRET=$(openssl rand -base64 48)
export INIT_ADMIN_EMAIL=admin@example.com
export INIT_ADMIN_PASSWORD=ChangeMe!2026

# 3) 애플리케이션 실행 (Flyway 마이그레이션 + 최초 관리자 seed 자동 수행)
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

- 관리 화면: `http://localhost:8080/`
- API 문서: `http://localhost:8080/swagger-ui.html`

최초 SUPER_ADMIN은 `users` 테이블이 비어 있을 때만 `INIT_ADMIN_*` 값으로 1회 생성되며,
첫 로그인 시 비밀번호 변경 화면으로 강제 이동합니다.

### 테스트

```bash
./mvnw test                 # 단위 + 슬라이스 테스트
./mvnw verify -Pintegration # Testcontainers(PostgreSQL) 통합 테스트
```

### 빌드 및 배포

```bash
./mvnw clean package -DskipTests
java -jar target/backoffice-0.0.1-SNAPSHOT.jar --spring.profiles.active=prod
```

Docker 이미지:

```bash
docker build -t backoffice:latest .
docker run -d --name backoffice -p 8080:8080 --env-file .env.prod backoffice:latest
```

`main` 브랜치 머지 시 GitHub Actions가 이미지를 빌드·푸시하고 서버에 배포합니다.
롤백은 이전 이미지 태그로 재기동합니다.

---

## 8. 보안 정책

- 비밀번호는 BCrypt(strength 12)로 저장. 정책: 10자 이상, 영문·숫자·특수문자 중 2종 이상
- Access Token은 응답 본문으로, Refresh Token은 `HttpOnly; Secure; SameSite=Strict` 쿠키로만 전달. DB에는 해시만 저장
- 로그인 5회 연속 실패 시 10분 잠금, IP 기준 분당 20회 요청 제한(Bucket4j)
- 모든 입력은 Bean Validation(`jakarta.validation`)으로 검증, 게시물 본문 HTML은 저장 시 OWASP Java HTML Sanitizer로 정제
- 계정 생성·역할 변경·게시물 삭제는 `audit_logs`에 기록(AOP)
- HTTPS 강제, 보안 헤더는 Spring Security 기본값 + CSP 적용
- 운영 환경은 가능하면 사내 IP / VPN 대역으로 접근 제한
- 2단계 인증(TOTP)은 1차 범위 제외, 외부 접근 허용 시 추가

---

## 9. 개발 일정 (개발자 1명 기준 약 6주)

| 주차 | 단계 | 산출물 |
| --- | --- | --- |
| 1 | 환경 세팅 | eGovFrame RTE 4.3.0 프로젝트 생성, Docker Compose, Flyway 초기 스키마, CI |
| 2 | 인증 | 로그인·로그아웃·토큰 재발급·비밀번호 변경, 최초 관리자 seed, 로그인 화면 |
| 3 | 계정 관리 + RBAC | 계정 CRUD, Spring Security 역할 설정, 계정 관리 화면 |
| 4 | 게시물 | 게시물 CRUD, 에디터·목록·삭제 화면, 감사 로그 |
| 5 | 배포·보안 | 서버·DB 구성, HTTPS, rate limit, 모니터링 |
| 6 | QA·안정화 | 통합 테스트, 권한 시나리오 점검, 운영 문서 |

---

## 10. 미결 사항

- [ ] 데이터베이스: PostgreSQL 유지 vs 사내 표준 DB(MariaDB / Oracle / Cubrid 등)
- [ ] 화면 방식: Thymeleaf 서버 렌더링 유지 vs 별도 프론트(React/Vue) 분리
- [ ] 서버 위치: 클라우드 신규 구성 vs 사내 기존 인프라
- [ ] 게시물 용도: 외부 서비스 공개 여부, 이미지 업로드 필요 여부
- [ ] 접근 제한: 사내 IP/VPN 한정 여부 (외부 허용 시 2단계 인증 1차 포함)

---

## 참고

- 전자정부 표준프레임워크 포털: https://www.egovframe.go.kr
- eGovFrame RTE 4.3.0 개발 가이드 (실행환경 / 개발환경 문서)
- Spring Boot 3.4 Reference, Spring Security 6.4 Reference
