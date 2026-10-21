# Spring Framework 전환 (2026-10-16)

Java 백오피스는 Spring Framework 6.2.6 MVC + Spring Security 6.4.5 + MyBatis 3.5.17 기반 표준 WAR다. Spring Boot parent, BOM, starter, 자동설정, 실행 플러그인, Boot 테스트 라이브러리를 제거했다. 프레임워크 구조 전환에 집중해 기존에 검증한 업무 라이브러리 버전을 유지했다.

## 설정과 실행

- `BackofficeApplication`: 컴포넌트 탐색을 선언하는 일반 Spring 설정.
- `BackofficeWebApplicationInitializer`: Servlet 6 초기화, DispatcherServlet, UTF-8, 보안·브라우저 방문 필터, multipart 등록.
- `ApplicationConfig`: `backoffice.properties`와 외부 설정 파일 로딩, Spring DataBinder 기반 속성 바인딩.
- `DataConfig`: Hikari DataSource, Flyway, MyBatis XML·별칭·매퍼 탐색, 트랜잭션 관리자·TransactionTemplate.
- `WebConfig`: MVC, Thymeleaf·Security dialect, JSON·날짜, 정적 자원·업로드 파일, multipart resolver.
- `SecurityConfig`: 기존 URL별 역할·세션·CSRF 정책과 인증 이벤트 발행. 최초 관리자 생성과 이야기 파일 동기화는 Spring ContextRefreshedEvent에서 순서대로 실행.
- `WEB-INF/web.xml`: 표준 WAR의 세션·404/500 오류 페이지 설정.

`mvnw.cmd clean verify`는 `target/backoffice.war`를 만든다. Tomcat 10.1 / Java 17 이상에 `ROOT.war`로 배포한다. `mvnw.cmd -Pdev compile exec:java`는 별도 개발용 Tomcat 실행기를 사용한다. 기본 WAR에는 내장 Tomcat 서버가 포함되지 않는다. 루트의 Windows/macOS 실행 파일도 새 명령을 사용한다.

현재 `.chatgpt.site`는 별도의 TypeScript 앱이며 이번 Java 전환과 별개다. 기존 H2 DB·업로드·사이트·임시저장 파일은 초기화하지 않는다. JDBC URL과 Flyway 마이그레이션 V1~V12는 그대로 사용한다. 설정 위치·환경변수·Tomcat 업로드 한도는 백오피스 README를 참고한다.

## 검증

- Boot 없이 SpringJUnitWebConfig·Spring Test·MockMvc·Spring Security로 기존 회귀 테스트를 실행한다.
- Maven Enforcer가 Spring Boot와 MyBatis Boot 라이브러리의 직접·전이 의존성을 금지한다.
- `scripts/WarSmokeCheck.java`는 애플리케이션 클래스 없이 Tomcat과 Jakarta Annotation API만 서버 클래스패스에 둔 채 WAR 자체의 Servlet 초기화를 검증한다. 명시적으로 `jdbc:h2:mem:` 테스트 설정을 요구하며, 실제 DB에 연결하지 않는다. 로그인·UTF-8·정적 파일·인증 차단·페이지 편집·휴지통·CSRF·multipart 업로드·바이너리 응답·404 처리를 확인한다.

설계 기준: [Spring Servlet 초기화](https://docs.spring.io/spring-framework/reference/6.2/web/webmvc/mvc-servlet/container-config.html), [Spring Security Java 설정](https://docs.spring.io/spring-security/reference/servlet/configuration/java.html), [Tomcat WAR 등록](https://tomcat.apache.org/tomcat-10.1-doc/api/org/apache/catalina/startup/Tomcat.html).

## 이번 전환의 확인 결과

- `clean verify`: 테스트 46개, 실패 0개, 오류 0개. 로그인 시각 기록도 확인했다.
- 기본 WAR: 약 24.9MB, 업무 라이브러리 43개. Spring Boot·MyBatis Boot·내장 Tomcat core·이전 application.yml·개발 실행기 클래스가 포함되지 않음을 ZIP 목록으로 확인했다.
- 개발 명령: 격리된 메모리 DB와 18081 포트에서 로그인·대시보드·휴지통·페이지 편집기 응답을 확인했다.
- WAR 단독 검증: `WAR_SMOKE_OK`. Tomcat Servlet 자동 초기화와 실제 HTTP 로그인·CSRF 차단·multipart 업로드·PNG MIME 응답·404 처리가 통과했다. 확인용 서버는 종료했다.
- 원래 H2 파일·프론트오피스·클라우드 소스는 이번 검증에서 수정하지 않았다.
