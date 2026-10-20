package egovframework.backoffice.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 실행 파일(백오피스.cmd · .command)이 서버가 켜진 뒤 브라우저를 열지 정할 때 묻는 곳.
 * 서버가 켜진 뒤 이미 누군가 브라우저로 관리자 화면(로그인 화면 포함)을 열었으면, 새 창을 또 열지 않는다
 * (서버가 늦게 준비된 사이 열어 둔 창에서 로그인했는데 새 창이 하나 더 뜨던 문제).
 */
@RestController
public class LauncherController {

    private final BrowserVisits visits;

    public LauncherController(BrowserVisits visits) {
        this.visits = visits;
    }

    @GetMapping("/launcher/browser-seen")
    public Map<String, Boolean> browserSeen() {
        return Map.of("seen", visits.seen());
    }

    /** 서버가 켜진 뒤 브라우저가 화면(HTML)을 한 번이라도 열었는지 */
    @Component("browserVisitsFilter")
    public static class BrowserVisits extends OncePerRequestFilter {

        private final AtomicBoolean seen = new AtomicBoolean();

        public boolean seen() {
            return seen.get();
        }

        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                throws ServletException, IOException {
            String accept = request.getHeader("Accept");
            if ("GET".equals(request.getMethod()) && accept != null && accept.contains("text/html")
                    && !request.getRequestURI().startsWith(request.getContextPath() + "/launcher/")) {
                seen.set(true);
            }
            chain.doFilter(request, response);
        }
    }
}
