package egovframework.backoffice.category;

import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class Category {
    private Long id;
    private String name;
    private String slug;
    private String description;
    private int sortOrder;
    private boolean active;
    /** 상위 카테고리 id. NULL 이면 1단(카테고리), 값이 있으면 2단(세부 카테고리) */
    private Long parentId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    /** 목록 조회 시 함께 계산되는 게시물 수 (삭제 제외) */
    private long postCount;
    /** 트리 조회 시 채워지는 세부 카테고리 목록 */
    private java.util.List<Category> children = new java.util.ArrayList<>();

    public boolean isTop() {
        return parentId == null;
    }
}
