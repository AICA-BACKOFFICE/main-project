# 0단계 기술 검증 결과와 실행 방법

> **참고(2026-09-22):** 이 문서는 0단계 기술 검증 기록이다. 1차 초안에서 `/__stage0/status` 화면과 `Stage0WebTest`는 업무 기능·`BackofficeWebTest`로 대체되었고, 실행 JAR 이름은 `backoffice-0.1.0-SNAPSHOT.jar`, DB·MyBatis·Flyway 의존성은 실행 범위로 옮겨졌다. 현재 구성은 [BACKOFFICE_DRAFT.md](BACKOFFICE_DRAFT.md)를 참고한다. `Stage0DatabaseTest`와 `egov43-probe` 프로필의 RTE 검증은 그대로 유지된다.

검증일: 2026-09-21  
기준: [read.md](../read.md)의 0단계와 이번 작업의 범위 제한  
판정: **최소 프로젝트와 선택한 기술 검증 범위 통과. 전체 RTE 호환성·운영 구성 확정은 아님.**

## 1. 이번에 만든 범위

Maven 프로젝트, Wrapper, 최소 Spring Boot 서버, Thymeleaf 기동 확인 화면, 기술 검증 테스트를 만들었다. 로그인·로그아웃·비밀번호 변경·계정 발급·역할 enum/RBAC·게시물 기능과 업무 테이블은 구현하지 않았다. 세션 인증·MyBatis·Thymeleaf라는 기존 제안은 유지한다.

실행 애플리케이션에는 `/__stage0/status`만 있다. 이 경로 외 요청은 Spring Security에서 차단하며, 기본 로그인 화면·HTTP Basic·자동 생성 사용자도 비활성화했다. 이는 보안 필터 적용 확인용 설정이다. 실제 사용자 인증과 역할별 접근 제어의 완료를 의미하지 않는다.

| 구성 | 현재 포함 범위 |
| --- | --- |
| 기본 실행 JAR | Boot Web·Security·Thymeleaf, 상태 확인 화면 |
| 기본 테스트 | 버전·실제 HTTP 응답·접근 차단, H2·Flyway·MyBatis·트랜잭션 |
| `egov43-probe` Maven 프로필 | 기본 테스트 + 실제 RTE 매퍼·서비스 검증 3건 |
| RTE·JDBC·MyBatis·Flyway·H2 | 모두 검증용 `test` 의존성. 실행 JAR에는 포함하지 않음 |

RTE 실험을 통과했으므로 해당 사용 범위를 후속 업무용 구성의 후보로 남긴다. 지금 생성한 실행 JAR 자체를 RTE와 업무 DB까지 연결된 백오피스라고 간주하지 않는다.

## 2. 실제 검증한 버전

| 항목 | 버전 | 선택 근거 |
| --- | --- | --- |
| Java | 17, 실제 실행 Temurin 17.0.20.1+1 | 요청한 Java 17, Enforcer로 메이저 버전 제한 |
| Maven | 3.9.11 | Wrapper 초기 선택, 배포 ZIP의 SHA-256 고정 |
| Spring Boot | 3.4.5 | 요청 버전·parent POM |
| Spring Framework | 6.2.6 | Boot 버전 관리, 실행 시 버전 확인 |
| Spring Security | 6.4.5 | Boot 버전 관리, 실행 시 버전 확인 |
| 내장 Tomcat | 10.1.40 | Boot 버전 관리, 실행 시 버전 확인 |
| RTE | 4.3.0 | 별도 프로필에서 검증 |
| MyBatis | 3.5.16 | RTE 데이터 접근 모듈과 같은 버전으로 실험 |
| MyBatis-Spring | 3.0.4 | Spring 6용 검증 후보, RTE의 2.1.2보다 우선 선택 |
| Flyway | 10.20.1 | Boot 버전 관리, 테스트 전용 |
| H2 | 2.3.232 | Boot 버전 관리, 테스트 전용 |

위 검증 후보 버전은 운영 구성 확정사항이 아니다. PostgreSQL 16 제안을 H2로 바꾼 것이 아니며, H2는 외부 DB 없이 데이터 접근과 롤백을 확인하기 위한 도구다. PostgreSQL 및 운영 DB 검증은 남아 있다.

## 3. RTE 적용 후보와 의존성 조정

| 모듈 | 검증한 사용 지점 | 결과·제한 |
| --- | --- | --- |
| `org.egovframe.rte.psl.dataaccess:4.3.0` | `EgovAbstractMapper` 상속, SQL 실행·조회·롤백, `sqlSession` 리소스 주입 | 통과. iBATIS 및 모듈의 모든 기능을 검증한 것은 아님 |
| `org.egovframe.rte.fdl.cmmn:4.3.0` | `EgovAbstractServiceImpl` 상속, 메시지 소스 주입과 `processException` | 통과. 추적·예외 처리 체계 전체의 운영 검증은 아님 |
| `org.egovframe.rte.fdl.logging:4.3.0` | 위 두 모듈의 전이 의존성 | 함께 로딩됨. RTE 전용 로깅 설정·운영 동작은 별도 미검증 |
| `org.egovframe.rte.ptl.mvc:4.3.0` | POM·소스의 Servlet/JSP 의존성 조사만 수행 | 실행 의존성에서 제외. Thymeleaf 초기안에서는 사용하지 않음 |

RTE 4.3 공식 기준은 Spring 5.3.37이다. 이번 실험에서는 RTE JAR를 수정하지 않고 다음 의존성 조정을 적용했다. 이는 RTE 원본 POM 전체를 그대로 적용한 결과가 아니다. [공식 마이그레이션 가이드](https://www.egovframe.go.kr/wiki/doku.php?id=egovframework:rtemigration4.3), [데이터 접근 POM](https://maven.egovframe.go.kr/maven/org/egovframe/rte/org.egovframe.rte.psl.dataaccess/4.3.0/org.egovframe.rte.psl.dataaccess-4.3.0.pom)

- Boot 3.4.5의 버전 관리로 Spring 모듈을 6.2.6으로 통일했다. 의존성 트리의 `version managed from 5.3.37`은 중재 이전 버전이며, Spring 5가 동시에 선택되었다는 뜻이 아니다.
- MyBatis-Spring 3.0.4를 직접 지정했다. RTE의 2.1.2는 의존성 충돌 중재로 제외되었다.
- 사용하지 않는 `javax:javaee-api` 묶음과 `ibatis-sqlmap`을 제외했다. 기존 Java EE 웹 API를 추가해서 Tomcat 10과 맞추는 방식은 채택하지 않았다.
- 기본 Boot 로깅을 사용하도록 `log4j-slf4j-impl`, `jcl-over-slf4j`, `log4j-over-slf4j`를 제외했다. RTE에서 들어온 `log4j-core`는 테스트 경로에 남으며 Boot 관리 버전 2.24.3이 선택되었다.
- RTE가 사용하는 `javax.annotation-api:1.3.2`는 테스트 경로에 유지했다. Boot의 `jakarta.annotation-api:2.1.1`과 함께 존재한다.

RTE의 `javax.annotation.Resource` 주입은 이번 테스트에서 정상 동작했다. Spring 6.2.6의 `CommonAnnotationBeanPostProcessor`는 기존 `javax.annotation` 형식도 지원한다. 따라서 `javax`라는 이름만으로 이 주입이 실패한다고 판단하지 않는다. 다만 이 결과가 `javax.servlet` 기반 RTE MVC/JSP 기능까지 Jakarta Servlet과 호환된다는 뜻은 아니다. [Spring 6.2.6 공식 소스](https://github.com/spring-projects/spring-framework/blob/v6.2.6/spring-context/src/main/java/org/springframework/context/annotation/CommonAnnotationBeanPostProcessor.java)

`ptl.mvc`의 기존 Servlet/JSP 사용은 POM·소스에서 확인한 제약이다. 해당 모듈의 런타임 실패를 재현했다거나 RTE 전체가 호환되지 않는다고 결론 내린 것은 아니다. [MVC 모듈 POM](https://maven.egovframe.go.kr/maven/org/egovframe/rte/org.egovframe.rte.ptl.mvc/4.3.0/org.egovframe.rte.ptl.mvc-4.3.0.pom)

## 4. 검증 결과

| 검증 | 결과 |
| --- | --- |
| Java 17 컴파일·실행 JAR 생성 | 성공 |
| 생성된 JAR 직접 기동·HTTP 응답 재확인 | 성공. 확인 후 서버 종료, 테스트 전용 라이브러리의 JAR 미포함도 확인 |
| Boot·Spring·Security·Tomcat 요청 버전 로딩 | 일치 |
| 실제 내장 Tomcat에서 Thymeleaf 상태 화면 조회 | HTTP 200, `STAGE0_BOOTSTRAP_OK` 출력 |
| 미허용 경로 및 `/login`, `/admin/accounts`, `/admin/posts` 요청 | HTTP 401. 업무 경로가 구현되었다는 의미는 아님 |
| Flyway 검증용 마이그레이션·MyBatis SQL | 성공 |
| Spring `@Transactional` 예외 롤백·정상 커밋 | 성공 |
| RTE 매퍼 조회·트랜잭션 롤백 | 성공 |
| RTE 매퍼의 기존 Resource 자동 주입 | 성공 |
| RTE 서비스의 기존 Resource 주입·메시지 예외 처리 | 성공 |

기본 테스트는 **4건**, RTE 프로필을 포함하면 **총 7건**이다. 테스트를 건너뛰거나 실패를 무시하는 옵션을 사용하지 않았다. DB는 매 테스트마다 새 H2 인메모리 DB를 생성하며, 업무 데이터가 아닌 `stage0_probe` 테이블만 사용한다.

관측된 경고도 남긴다. Flyway 10.20.1은 H2 2.3.232가 검증한 H2 범위보다 최신이라는 경고를 출력했으나 이번 마이그레이션·조회·롤백은 통과했다. RTE 공식 저장소의 일부 POM/JAR 다운로드에서는 체크섬 파일 부재 경고가 발생했다. 이를 해결했다고 표시하거나 라이브러리 버전을 임의 변경하지 않았다.

현재 작업 폴더의 `.cache/stage0-evidence/`에는 의존성 트리와 테스트 보고서를 보관한다. 이 폴더는 Git 제외 대상이며, 동료 환경에서는 아래 명령으로 다시 생성할 수 있다. Surefire 기본 보고서 위치는 `target/surefire-reports/`이고 `clean` 시 초기화된다.

## 5. Windows PowerShell 실행 방법

프로젝트 루트는 `AICA-back-office-main`이다. 다른 폴더에서 실행 중이면 먼저 해당 폴더로 이동한다.

```powershell
Set-Location 'C:\Users\sfsf1\OneDrive\Desktop\exex1\BOFC\AICA-back-office-main'

# 기본 빌드·기술 검증 4건
.\scripts\mvn-local.ps1 -B -ntp clean verify

# RTE를 함께 로딩하고 기술 검증 총 7건 실행
.\scripts\mvn-local.ps1 -B -ntp -Pegov43-probe clean verify

# RTE 포함 의존성 트리 재생성
.\scripts\mvn-local.ps1 -B -ntp -Pegov43-probe dependency:tree -Dverbose '-DoutputFile=.cache/stage0-evidence/dependency-tree-egov43.txt'
```

`egov43-probe`는 **Maven 프로필**이다. 애플리케이션 실행 시 `spring.profiles.active`로 지정하는 프로필이 아니다. 프로필을 바꿔 테스트할 때는 위처럼 `clean`을 포함해 이전 테스트 클래스가 남지 않게 한다. 최초 실행에는 Maven Central과 전자정부 Maven 저장소 연결이 필요하다. 의존성을 받은 뒤에는 `-o`를 추가해 오프라인 실행할 수 있다.

이 PC에는 검증용 JDK를 프로젝트의 `.tools/jdk/`에 별도로 준비했다. `mvn-local.ps1`은 `JAVA_HOME`이 없으면 이 JDK를 사용하고 실행 후 환경 변수를 복구한다. 시스템 환경 변수나 전역 Java 설치를 변경하지 않았다. `.tools`는 공유 소스에 포함되지 않으므로 동료는 JDK 17을 준비해 `JAVA_HOME`을 설정해야 한다. JDK 17이 설정된 환경에서는 `mvnw.cmd`를 직접 실행해도 된다.

현재 PC에서 생성된 JAR를 실행하는 예시는 다음과 같다. `JAVA_HOME` 지정은 현재 PowerShell 세션에만 적용된다.

```powershell
$env:JAVA_HOME = (Resolve-Path '.\.tools\jdk\jdk-17.0.20.1+1').Path
& "$env:JAVA_HOME\bin\java.exe" -jar .\target\backoffice-stage0-0.0.1-SNAPSHOT.jar
```

브라우저에서 `http://127.0.0.1:8080/__stage0/status`를 열면 기동 확인 문구가 나온다. 기본 설정은 로컬 주소에만 바인딩한다. 루트 `/`를 포함한 다른 주소의 401은 현재 검증용 설정의 정상 결과다. 로그인 계정은 없다. 종료는 서버를 실행한 터미널에서 `Ctrl+C`를 누른다.

## 6. 다음 단계 전에 확인할 사항

1. RTE 4.3.0과 Boot 3.4.5가 모두 필수인지, 담당자가 검증한 표준 프로젝트나 `pom.xml`이 있는지.
2. RTE 서비스·데이터 접근 기능을 위 조정 조건으로 사용하는 범위가 요구사항에 맞는지. MVC/JSP·전용 로깅 등 추가 RTE 기능이 필수라면 그 기능은 별도 검증해야 한다.
3. 운영 DB·기존 스키마·개발 DB 환경. PostgreSQL 16을 사용할 경우 해당 DB와 드라이버·Flyway 모듈까지 연결해 검증해야 한다.
4. 기존 사용자 모듈과 공통 기반·연동 기준. 현재 기존 소스가 없어 통합 검증은 하지 못했다.

이 확인사항은 기술 구성의 채택 조건이다. 역할 수와 세부 권한은 기존 `read.md`의 초기 제안 상태를 유지한다. 이번 작업에서는 후속 인증·계정·게시물 개발을 시작하지 않는다.
