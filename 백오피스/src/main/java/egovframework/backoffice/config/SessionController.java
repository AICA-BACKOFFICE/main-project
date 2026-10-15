package egovframework.backoffice.config;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 열어 둔 관리자 화면이 로그인이 살아 있는지 묻는 곳. 관리자 서버를 다시 켜면 로그인이 풀리는데(쓰던 화면은 그대로),
 * 다시 로그인한 뒤에는 여기서 새 보안 토큰(CSRF)을 받아 그 화면에서 이어서 올리거나 저장할 수 있다.
 * 로그인이 풀렸으면 로그인 화면 대신 401(SecurityConfig).
 */
@RestController
public class SessionController {

    @GetMapping("/admin/session")
    public Map<String, Object> session(CsrfToken csrf) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        if (csrf != null) {
            out.put("token", csrf.getToken());
            out.put("header", csrf.getHeaderName());
            out.put("parameter", csrf.getParameterName());
        }
        return out;
    }
}
