package egovframework.backoffice.post;

public enum PostStatus {
    DRAFT("임시저장", "draft"),
    PUBLISHED("게시중", "published"),
    HIDDEN("미게시", "hidden"),
    /** FAQ 등 질문 게시물: 답변이 등록되기 전 상태 (프론트 미노출) */
    PENDING("답변대기", "pending");

    private final String label;
    private final String css;

    PostStatus(String label, String css) {
        this.label = label;
        this.css = css;
    }

    public String getLabel() {
        return label;
    }

    public String getCss() {
        return css;
    }
}
