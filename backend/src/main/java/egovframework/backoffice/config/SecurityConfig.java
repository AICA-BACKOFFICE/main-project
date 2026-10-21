package egovframework.backoffice.config;

import egovframework.backoffice.account.AdminRole;
import egovframework.backoffice.account.AdminUserDetailsService;
import egovframework.backoffice.account.AdminUserMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.HexFormat;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.authentication.AuthenticationEventPublisher;
import org.springframework.security.authentication.DefaultAuthenticationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.util.LinkedHashMap;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.security.web.authentication.DelegatingAuthenticationEntryPoint;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.LoginUrlAuthenticationEntryPoint;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;

/**
 * 세션 기반 관리자 인증. 로그인 화면에서 '로그인 상태 유지'를 켜면(기본) 14일 동안 쿠키로 다시 로그인해 준다 —
 * 30분 동안 요청이 없어 세션이 끝났거나 서버를 다시 켜도 로그인 화면으로 돌아가지 않는다(쿠키는 비밀번호를 바꾸거나 로그아웃하면 무효).
 * - /login, 정적 자원, 업로드 이미지, 프론트용 공개 API(/api/public/**)는 인증 없이 접근
 * - /admin/users/** (관리자 관리)는 SUPER_ADMIN 전용
 * - /admin/pages/** (카테고리 페이지 관리)는 ADMIN 이상
 * - 그 외 모든 화면은 로그인 필요
 */
@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    AuthenticationEventPublisher authenticationEventPublisher(ApplicationEventPublisher publisher) {
        return new DefaultAuthenticationEventPublisher(publisher);
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, AdminUserMapper users, AdminUserDetailsService userDetails,
                                           BackofficeProperties properties) throws Exception {
        http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/login", "/css/**", "/js/**", "/img/**", "/favicon.ico", "/error").permitAll()
                // 실행 파일이 브라우저를 열지 묻는 곳(LauncherController)
                .requestMatchers("/launcher/**").permitAll()
                .requestMatchers("/uploads/**", "/api/public/**").permitAll()
                .requestMatchers("/h2-console/**").permitAll()
                .requestMatchers("/admin/users/**").hasRole(AdminRole.SUPER_ADMIN.name())
                // 글 주소는 /admin/posts/{종류}/{번호}/… (글 번호는 표마다 1번부터)
                .requestMatchers("/admin/posts/*/*/purge", "/admin/posts/trash/empty").hasRole(AdminRole.SUPER_ADMIN.name())
                // 서포터즈는 본인 게시글 작성·수정. 휴지통·상태 변경은 관리자 이상.
                .requestMatchers("/admin/posts/trash", "/admin/posts/trash/**", "/admin/posts/*/*/delete", "/admin/posts/*/*/restore",
                        "/admin/posts/*/*/status").hasAnyRole(
                        AdminRole.SUPER_ADMIN.name(), AdminRole.ADMIN.name())
                // 카테고리 페이지 관리(사이트 페이지 편집·반영) · 지원 전 Check FAQ 관리(사이트 질문 목록 반영): 관리자 이상
                .requestMatchers("/admin/pages/**", "/admin/faq", "/admin/faq/**").hasAnyRole(AdminRole.SUPER_ADMIN.name(), AdminRole.ADMIN.name())
                .anyRequest().authenticated())
            // 카테고리 페이지 편집 화면의 저장 API 는 로그인이 끝났을 때 로그인 화면 대신 401 을 돌려준다(화면이 편집 내용을 보관한 채 안내).
            // 그 밖의 요청은 지금처럼 로그인 화면으로 보낸다.
            .exceptionHandling(ex -> ex.authenticationEntryPoint(authenticationEntryPoint()))
            .formLogin(form -> form
                .loginPage("/login")
                .loginProcessingUrl("/login")
                .usernameParameter("loginId")
                .passwordParameter("password")
                .defaultSuccessUrl("/admin", false)
                .failureUrl("/login?error")
                .permitAll())
            .logout(logout -> logout
                .logoutRequestMatcher(new AntPathRequestMatcher("/logout", "POST"))
                .logoutSuccessUrl("/login?logout")
                .invalidateHttpSession(true)
                .deleteCookies("JSESSIONID"))
            .rememberMe(remember -> remember
                .key(rememberMeKey(properties))
                .userDetailsService(userDetails)
                .rememberMeParameter("remember")
                .rememberMeCookieName(REMEMBER_COOKIE)
                .tokenValiditySeconds((int) REMEMBER_FOR.toSeconds()))
            .sessionManagement(session -> session.sessionFixation().migrateSession())
            .addFilterAfter(new AdminSessionFilter(users), SecurityContextHolderFilter.class)
            .csrf(csrf -> csrf.ignoringRequestMatchers("/api/public/**", "/h2-console/**"))
            .headers(headers -> headers.frameOptions(frame -> frame.sameOrigin()));
        return http.build();
    }

    /** 로그인 상태 유지 쿠키 이름 · 기간 */
    public static final String REMEMBER_COOKIE = "AICA_REMEMBER";
    static final Duration REMEMBER_FOR = Duration.ofDays(14);

    /**
     * 로그인 상태 유지 쿠키 서명 열쇠: 설정(BACKOFFICE_REMEMBER_KEY)이 있으면 그것, 없으면 열쇠 파일(data/remember-me.key)에
     * 처음 한 번 만들어 두고 계속 쓴다(서버를 다시 켜도 같은 열쇠라 로그인이 이어진다). 파일을 못 쓰면 이번 실행에만 쓰는 열쇠.
     */
    static String rememberMeKey(BackofficeProperties properties) {
        String configured = properties.getRememberMeKey();
        if (configured != null && !configured.isBlank()) {
            return configured.trim();
        }
        String fresh = HexFormat.of().formatHex(randomBytes(32));
        String file = properties.getRememberMeKeyFile();
        if (file == null || file.isBlank()) {
            return fresh;
        }
        Path path = Path.of(file).toAbsolutePath().normalize();
        try {
            if (Files.isRegularFile(path)) {
                String saved = Files.readString(path, StandardCharsets.UTF_8).trim();
                if (saved.length() >= 32) {
                    return saved;
                }
            }
            Files.createDirectories(path.getParent());
            Files.writeString(path, fresh, StandardCharsets.UTF_8);
        } catch (IOException e) {
            // 이번 실행에만 쓰는 열쇠(다시 켜면 로그인 상태 유지가 풀린다)
        }
        return fresh;
    }

    private static byte[] randomBytes(int size) {
        byte[] bytes = new byte[size];
        new SecureRandom().nextBytes(bytes);
        return bytes;
    }

    private static AuthenticationEntryPoint authenticationEntryPoint() {
        LinkedHashMap<RequestMatcher, AuthenticationEntryPoint> entryPoints = new LinkedHashMap<>();
        entryPoints.put(new AntPathRequestMatcher("/admin/pages/api/**"), new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED));
        // FAQ 관리 · 인사교 라이프 게시물 관리 화면의 API 도 같이(로그인 화면 HTML을 받아 화면이 깨지지 않고 '다시 로그인' 안내가 나오게)
        entryPoints.put(new AntPathRequestMatcher("/admin/pages/faq/api/**"), new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED));
        entryPoints.put(new AntPathRequestMatcher("/admin/pages/life-photos/api/**"), new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED));
        // 열어 둔 화면의 로그인 확인(SessionController)
        entryPoints.put(new AntPathRequestMatcher("/admin/session"), new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED));
        DelegatingAuthenticationEntryPoint entryPoint = new DelegatingAuthenticationEntryPoint(entryPoints);
        entryPoint.setDefaultEntryPoint(new LoginUrlAuthenticationEntryPoint("/login"));
        return entryPoint;
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
