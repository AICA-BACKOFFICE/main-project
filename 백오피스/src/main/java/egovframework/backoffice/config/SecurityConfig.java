package egovframework.backoffice.config;

import egovframework.backoffice.account.AdminRole;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.util.LinkedHashMap;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.DelegatingAuthenticationEntryPoint;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.LoginUrlAuthenticationEntryPoint;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;

/**
 * 세션 기반 관리자 인증.
 * - /login, 정적 자원, 업로드 이미지, 프론트용 공개 API(/api/public/**)는 인증 없이 접근
 * - /admin/users/** (관리자 관리)는 SUPER_ADMIN 전용
 * - /admin/pages/** (카테고리 페이지 관리)는 ADMIN 이상
 * - 그 외 모든 화면은 로그인 필요
 */
@Configuration(proxyBeanMethods = false)
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/login", "/css/**", "/js/**", "/img/**", "/favicon.ico", "/error").permitAll()
                .requestMatchers("/uploads/**", "/api/public/**").permitAll()
                .requestMatchers("/h2-console/**").permitAll()
                .requestMatchers("/admin/users/**").hasRole(AdminRole.SUPER_ADMIN.name())
                // SUPPORT 는 게시물 등록·수정만: 삭제·휴지통·상태 변경·통계는 관리자 이상
                .requestMatchers("/admin/posts/trash", "/admin/posts/*/delete", "/admin/posts/*/restore",
                        "/admin/posts/*/purge", "/admin/posts/*/status", "/admin/stats/**").hasAnyRole(
                        AdminRole.SUPER_ADMIN.name(), AdminRole.ADMIN.name())
                // 운영진 공지: 보기·닫기는 전원, 작성·수정·내리기·삭제는 최고관리자
                .requestMatchers("/admin/notices/*/dismiss").authenticated()
                .requestMatchers(HttpMethod.POST, "/admin/notices/**").hasRole(AdminRole.SUPER_ADMIN.name())
                // 템플릿 관리: 보기·불러오기는 전원, 생성·수정·삭제는 관리자 이상
                .requestMatchers(HttpMethod.POST, "/admin/templates/**").hasAnyRole(
                        AdminRole.SUPER_ADMIN.name(), AdminRole.ADMIN.name())
                .requestMatchers(HttpMethod.PUT, "/admin/templates/**").hasAnyRole(
                        AdminRole.SUPER_ADMIN.name(), AdminRole.ADMIN.name())
                .requestMatchers(HttpMethod.DELETE, "/admin/templates/**").hasAnyRole(
                        AdminRole.SUPER_ADMIN.name(), AdminRole.ADMIN.name())
                // 미디어 관리: 업로드·보기는 전원, 분류 이동·이름 변경·삭제는 관리자 이상
                .requestMatchers("/admin/media/*/move", "/admin/media/*/rename", "/admin/media/*/delete").hasAnyRole(
                        AdminRole.SUPER_ADMIN.name(), AdminRole.ADMIN.name())
                // 카테고리 페이지 관리(사이트 페이지 편집·반영): 관리자 이상
                .requestMatchers("/admin/pages/**").hasAnyRole(AdminRole.SUPER_ADMIN.name(), AdminRole.ADMIN.name())
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
            .sessionManagement(session -> session.sessionFixation().migrateSession())
            .csrf(csrf -> csrf.ignoringRequestMatchers("/api/public/**", "/h2-console/**"))
            .headers(headers -> headers.frameOptions(frame -> frame.sameOrigin()));
        return http.build();
    }

    private static AuthenticationEntryPoint authenticationEntryPoint() {
        LinkedHashMap<RequestMatcher, AuthenticationEntryPoint> entryPoints = new LinkedHashMap<>();
        entryPoints.put(new AntPathRequestMatcher("/admin/pages/api/**"), new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED));
        DelegatingAuthenticationEntryPoint entryPoint = new DelegatingAuthenticationEntryPoint(entryPoints);
        entryPoint.setDefaultEntryPoint(new LoginUrlAuthenticationEntryPoint("/login"));
        return entryPoint;
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
