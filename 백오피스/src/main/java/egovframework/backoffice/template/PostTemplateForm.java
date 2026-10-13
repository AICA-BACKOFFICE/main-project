package egovframework.backoffice.template;

import lombok.Getter;
import lombok.Setter;

/** 템플릿 관리 편집 폼 (template/editor.html). 본문과 레이아웃은 hidden input 의 JSON 으로 전달된다. */
@Getter
@Setter
public class PostTemplateForm {
    private Long id;
    private String name;
    private String titleHint;
    private Long categoryId;
    private String blocksJson = "[]";
    private String layoutJson;

    public static PostTemplateForm from(PostTemplate t) {
        PostTemplateForm f = new PostTemplateForm();
        f.setId(t.getId());
        f.setName(t.getName());
        f.setTitleHint(t.getTitleHint());
        f.setCategoryId(t.getCategoryId());
        f.setBlocksJson(t.getBlocksJson());
        f.setLayoutJson(t.getLayoutJson());
        return f;
    }
}
