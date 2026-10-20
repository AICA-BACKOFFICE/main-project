package egovframework.backoffice.post;

import egovframework.backoffice.common.BusinessException;
import egovframework.backoffice.common.NotFoundException;
import egovframework.backoffice.post.story.StoryKind;

/**
 * 글 하나를 가리키는 값: 종류 + 번호. 글 번호는 표마다 1번부터라(V19) 번호만으로는 어떤 글인지 모른다.
 * 관리 화면 주소는 /admin/posts/{종류}/{번호}, 휴지통 선택 값은 "종류-번호"(예: project-1).
 */
public record PostKey(StoryKind kind, Long id) {

    /** 주소의 종류 글자(review · interview · project) → 종류. 모르는 종류면 404 */
    public static StoryKind kind(String slug) {
        StoryKind kind = StoryKind.ofSlug(slug);
        if (kind == null) {
            throw new NotFoundException("게시물을 찾을 수 없습니다.");
        }
        return kind;
    }

    /** 휴지통 선택 값 "project-1" → 종류 + 번호 */
    public static PostKey parse(String value) {
        int dash = value == null ? -1 : value.lastIndexOf('-');
        StoryKind kind = dash > 0 ? StoryKind.ofSlug(value.substring(0, dash)) : null;
        try {
            long id = kind == null ? -1 : Long.parseLong(value.substring(dash + 1));
            if (id > 0) {
                return new PostKey(kind, id);
            }
        } catch (NumberFormatException e) {
            // 아래에서 안내
        }
        throw new BusinessException("현재 페이지에서 게시물을 선택해 주세요.");
    }

    /** "project-1" */
    public String value() {
        return kind.slug() + "-" + id;
    }
}
