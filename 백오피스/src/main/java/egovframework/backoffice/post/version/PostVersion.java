package egovframework.backoffice.post.version;

import egovframework.backoffice.post.Post;
import egovframework.backoffice.post.PostStatus;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

/** 게시물 버전 스냅샷 (저장·발행·복원 시점). */
@Getter
@Setter
public class PostVersion {
    /** 이력 사유 */
    public static final String MANUAL_DRAFT = "MANUAL_DRAFT";
    public static final String PUBLISH = "PUBLISH";
    public static final String RESTORE = "RESTORE";
    public static final String RESTORE_BACKUP = "RESTORE_BACKUP";

    private Long id;
    private Long postId;
    private String reason;
    private String title;
    private String summary;
    private Long categoryId;
    private Long subCategoryId;
    private String thumbnailUrl;
    private String thumbnailMode;
    private PostStatus status;
    private String blocksJson;
    private String layoutJson;
    private String storyJson;
    private Long createdBy;
    private LocalDateTime createdAt;

    // 조인 컬럼
    private String creatorName;
    private String categoryName;

    public String getReasonLabel() {
        return switch (reason == null ? "" : reason) {
            case PUBLISH -> "발행";
            case RESTORE -> "복원";
            case RESTORE_BACKUP -> "복원 전 백업";
            default -> "저장";
        };
    }

    public static PostVersion of(Post p, String reason, Long adminId) {
        PostVersion v = new PostVersion();
        v.setPostId(p.getId());
        v.setReason(reason);
        v.setTitle(p.getTitle());
        v.setSummary(p.getSummary());
        v.setCategoryId(p.getCategoryId());
        v.setSubCategoryId(p.getSubCategoryId());
        v.setThumbnailUrl(p.getThumbnailUrl());
        v.setThumbnailMode(p.getThumbnailMode());
        v.setStatus(p.getStatus());
        v.setBlocksJson(p.getBlocksJson());
        v.setLayoutJson(p.getLayoutJson());
        v.setStoryJson(p.getStoryJson());
        v.setCreatedBy(adminId);
        return v;
    }
}
