package egovframework.backoffice.page;

import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

/**
 * 인사교 라이프 카드 한 줄(V29): 시설 사진(life_facility_photos) · 오늘 점심(life_foods) · 바람 쐬러 가요(life_spots).
 * 세 표의 칸을 모두 가지고, 그 표에 없는 칸은 비어 있다.
 */
@Getter
@Setter
public class LifeItem {
    private Long id;

    // 시설 사진
    private String spaceId;
    private String zoom;
    private String pos;
    private String caption;

    // 시설 사진 · 바람 쐬러 가요: 사이트에 원래 있던 그림(im-이름) 또는 올린 사진(photo)
    private String photoClass;
    private String photo;

    // 오늘 점심
    private String kind;
    private String party;
    private Integer walkMin;
    private String category;
    private String menu;
    private String review;
    private Boolean example;

    // 오늘 점심 · 바람 쐬러 가요
    private String name;

    // 바람 쐬러 가요
    private String groupKey;
    private String distance;
    private String fee;
    private String summary;

    private Integer sortOrder;
    /** DRAFT 임시저장 · PUBLISHED 게시 · HIDDEN 미게시 · DELETED 삭제됨 */
    private String status;
    private String statusBeforeTrash;
    private Long authorId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime deletedAt;
}
