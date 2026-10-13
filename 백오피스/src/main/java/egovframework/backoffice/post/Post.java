package egovframework.backoffice.post;

import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class Post {
    private Long id;
    private Long categoryId;
    /** 세부 카테고리(후기 → 생활·수업… / 기수별 → 3~5기·6기·7기). 없으면 NULL */
    private Long subCategoryId;
    private String title;
    private String summary;
    private String thumbnailUrl;
    /** AUTO: 본문 첫 이미지 사용 / MANUAL: 직접 지정 */
    private String thumbnailMode;
    private PostStatus status;
    private String blocksJson;
    /** 화면 레이아웃 설정 JSON(PostLayout). NULL 이면 기본 레이아웃 */
    private String layoutJson;
    /** 선배들의 이야기 고정 양식 값(JSON, {@link egovframework.backoffice.post.story.StoryContent}). 있으면 게시할 때 사이트에 반영된다 */
    private String storyJson;
    private Long authorId;
    private long viewCount;
    private LocalDateTime publishedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime deletedAt;
    /** 휴지통 이동 직전 상태(휴지통 목록 '삭제 전 게시중' 표시용). 복원하면 이 상태로 되돌린다 */
    private PostStatus statusBeforeTrash;

    // 조인 컬럼
    private String categoryName;
    private String categorySlug;
    private String subCategoryName;
    private String subCategorySlug;

    /** 목록 표시용: "후기 › 생활" */
    public String getCategoryPath() {
        if (categoryName == null) {
            return null;
        }
        return subCategoryName == null ? categoryName : categoryName + " › " + subCategoryName;
    }
    private String authorName;
}
