package egovframework.backoffice.category;

import lombok.Getter;
import lombok.Setter;

/** 카테고리(글 종류 · 후기 분야). 값은 {@link CategoryService} 에 정해져 있다(DB 표 없음). */
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
    /** 트리 조회 시 채워지는 세부 카테고리 목록 */
    private java.util.List<Category> children = new java.util.ArrayList<>();

    public boolean isTop() {
        return parentId == null;
    }
}
