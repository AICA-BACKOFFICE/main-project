package egovframework.backoffice.media;

import lombok.Getter;
import lombok.Setter;

/** 미디어 검색 조건 (관리 화면 · 보관함 선택창 공용) */
@Getter
@Setter
public class MediaQuery {
    private Long categoryId;
    private Long subCategoryId;
    /** 미분류만 */
    private boolean unfiled;
    /** IMAGE | VIDEO | DOC | null(전체) */
    private String kind;
    private String keyword;

    public static MediaQuery of(Long categoryId, Long subCategoryId, boolean unfiled, String kind, String keyword) {
        MediaQuery q = new MediaQuery();
        q.categoryId = categoryId;
        q.subCategoryId = subCategoryId;
        q.unfiled = unfiled;
        q.kind = kind == null || kind.isBlank() || "ALL".equals(kind) ? null : kind;
        q.keyword = keyword == null || keyword.isBlank() ? null : keyword.trim();
        return q;
    }
}
