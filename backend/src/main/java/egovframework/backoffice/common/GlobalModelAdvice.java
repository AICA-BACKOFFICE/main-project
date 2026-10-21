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

    public GlobalModelAdvice(BackofficeProperties properties) {
        this.properties = properties;
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

    /**
     * 왼쪽 '인사교 홈페이지 이동': 프론트오피스 사이트. 사이트 주소(backoffice.pages.front-url · BACKOFFICE_FRONT_URL —
     * npm start 는 http://127.0.0.1:4181/)가 있으면 그 사이트, 없으면 front-base-url
     */
    @ModelAttribute("frontHomeUrl")
    public String frontHomeUrl() {
        String front = properties.getPages().getFrontUrl();
        return front == null || front.isBlank() ? properties.getFrontBaseUrl() : front.trim();
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
