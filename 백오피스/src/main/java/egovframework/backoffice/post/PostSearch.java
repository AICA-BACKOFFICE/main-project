package egovframework.backoffice.post;

import lombok.Getter;
import lombok.Setter;

/** 게시물 목록 검색 조건 (쿼리 파라미터 바인딩). */
@Getter
@Setter
public class PostSearch {
    private String keyword;
    private Long categoryId;
    private Long subCategoryId;
    /** 작성자(관리자) id 로 좁히기 — 목록의 작성자 이름을 누르면 설정된다 */
    private Long authorId;
    private PostStatus status;
    private int page = 1;
    private int size = 20;

    public int getOffset() {
        return (Math.max(page, 1) - 1) * size;
    }

    public boolean isFiltered() {
        return (keyword != null && !keyword.isBlank()) || categoryId != null || subCategoryId != null || authorId != null || status != null;
    }
}
