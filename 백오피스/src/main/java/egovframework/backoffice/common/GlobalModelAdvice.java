package egovframework.backoffice.common;

import egovframework.backoffice.account.CurrentAdmin;
import egovframework.backoffice.config.BackofficeProperties;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ModelAttribute;

/** 모든 화면에서 공통으로 쓰는 모델 값 (서비스 이름, 환경, 로그인 관리자). */
@ControllerAdvice
public class GlobalModelAdvice {

    private final BackofficeProperties properties;
    private final egovframework.backoffice.notice.NoticeService notices;

    public GlobalModelAdvice(BackofficeProperties properties, egovframework.backoffice.notice.NoticeService notices) {
        this.properties = properties;
        this.notices = notices;
    }

    /** 현재 요청 경로(공지 닫기 뒤 돌아올 곳) */
    @ModelAttribute("currentPath")
    public String currentPath(jakarta.servlet.http.HttpServletRequest request) {
        return request == null ? "/admin" : request.getRequestURI();
    }

    /** 상단 띠에 표시할 운영진 공지(로그인한 사람 기준, 닫은 것 제외) */
    @ModelAttribute("liveNotices")
    public java.util.List<egovframework.backoffice.notice.Notice> liveNotices() {
        CurrentAdmin admin = me();
        return admin == null ? java.util.List.of() : notices.visibleFor(admin.getId());
    }

    @ModelAttribute("siteName")
    public String siteName() {
        return properties.getSiteName();
    }

    @ModelAttribute("envLabel")
    public String envLabel() {
        return properties.getEnvironmentLabel();
    }

    @ModelAttribute("frontBaseUrl")
    public String frontBaseUrl() {
        return properties.getFrontBaseUrl();
    }

    /** 사이드바 '카테고리 페이지 관리' 메뉴(인사교 알아보기 · 선배들의 이야기 · 인사교 라이프 · 지원 전 체크) */
    @ModelAttribute("categoryPages")
    public java.util.List<BackofficeProperties.Item> categoryPages() {
        return properties.getPages().getItems();
    }

    @ModelAttribute("me")
    public CurrentAdmin me() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof CurrentAdmin admin) {
            return admin;
        }
        return null;
    }
}
