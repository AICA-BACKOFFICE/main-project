package egovframework.backoffice.common;

/** 작업 뒤 돌아갈 관리 화면 주소(폼의 back 값). 이 관리자 페이지 안(/admin/…)만 받고, 아니면 기본 주소 */
public final class BackPath {

    private BackPath() {
    }

    public static String or(String back, String fallback) {
        if (back == null || !back.startsWith("/admin/") || back.contains("//") || back.contains("\\") || back.contains("{") || back.contains("}")
                || back.chars().anyMatch(c -> c < 0x20)) {
            return fallback;
        }
        return back;
    }
}
