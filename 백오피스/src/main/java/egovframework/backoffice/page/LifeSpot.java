package egovframework.backoffice.page;

import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

/** 인사교 라이프 › 수업 끝나고, 바람 쐬러 가요 장소 카드 하나(life_spots). 묶음(groupKey)마다 sortOrder 순. */
@Getter
@Setter
public class LifeSpot {
    private Long id;
    /** walk 근처 산책길 | near 가까운 시설 | far 멀지만 가볼 만한 곳 */
    private String groupKey;
    private String name;
    private String distance;
    private String fee;
    private String summary;
    /** 사이트에 원래 있던 그림(life.css 의 im-이름). 올린 사진이면 빈 글자 */
    private String photoClass;
    /** 올린 사진(life/ 기준 주소). 원래 그림이면 빈 글자 */
    private String photo;
    private int sortOrder;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    /** 휴지통으로 옮긴 시각(없으면 목록에 있음) · 옮긴 관리자 */
    private LocalDateTime deletedAt;
    private Long deletedBy;
    /** 휴지통 화면에 보일 옮긴 관리자 이름 */
    private String deletedByName;
}
