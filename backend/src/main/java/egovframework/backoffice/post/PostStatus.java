package egovframework.backoffice.post;

import java.util.List;

/**
 * 글 상태(표의 status 칸). 사이트에는 게시중만 보인다.
 * 삭제됨은 휴지통 버튼으로만 바뀌고(옮기기 전 상태는 status_before_trash 에), 복원하면 그 상태로 돌아간다(V18).
 */
public enum PostStatus {
    DRAFT("임시저장", "draft"),
    PUBLISHED("게시중", "published"),
    HIDDEN("미게시", "hidden"),
    DELETED("삭제됨", "deleted");

    /** 글쓰기 · 목록에서 고를 수 있는 상태(삭제됨은 휴지통 버튼으로만) */
    public static final List<PostStatus> CHOOSABLE = List.of(DRAFT, PUBLISHED, HIDDEN);

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
