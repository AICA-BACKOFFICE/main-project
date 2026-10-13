package egovframework.backoffice.media;

import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

/** 미디어 관리의 파일 1건(이미지·동영상·문서). 분류는 게시물 관리와 같은 카테고리/세부 카테고리를 쓴다. */
@Getter
@Setter
public class ImageFile {
    private Long id;
    /** IMAGE | VIDEO | DOC */
    private String kind;
    /** 운영자가 바꿀 수 있는 표시 이름(저장 파일명·URL 은 불변) */
    private String displayName;
    private String storedName;
    private String originalName;
    private String contentType;
    private long sizeBytes;
    private String url;
    private Long uploadedBy;
    /** 카테고리(후기·인터뷰·프로젝트·기수별 모아보기). NULL 이면 미분류 */
    private Long categoryId;
    /** 세부 카테고리(생활·수업… / 3~5기·6기·7기). NULL 가능 */
    private Long subCategoryId;
    private LocalDateTime createdAt;

    // 조인
    private String categoryName;
    private String subCategoryName;
    private String uploaderName;

    /** "후기 › 생활" */
    public String getCategoryPath() {
        if (categoryName == null) {
            return null;
        }
        return subCategoryName == null ? categoryName : categoryName + " › " + subCategoryName;
    }

    public String getLabel() {
        return displayName == null || displayName.isBlank() ? originalName : displayName;
    }

    public boolean isImage() {
        return "IMAGE".equals(kind);
    }

    public boolean isVideo() {
        return "VIDEO".equals(kind);
    }
}
