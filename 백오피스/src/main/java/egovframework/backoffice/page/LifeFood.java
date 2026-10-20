package egovframework.backoffice.page;

import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

/** 인사교 라이프 › 오늘 점심, 여기 어때요? 카드 하나(life_foods). 사이트에는 식당 → 카페, 각각 sortOrder 순으로 보인다. */
@Getter
@Setter
public class LifeFood {
    private Long id;
    /** food 식당 | cafe 카페 */
    private String kind;
    /** solo 혼밥(혼자) | group 여럿이 */
    private String party;
    private int walkMin;
    private String category;
    private String name;
    /** 메뉴 · 위치 */
    private String menu;
    /** 선배 후기(없으면 빈 글자) */
    private String review;
    /** '예시' 후기 */
    private boolean example;
    /** 사진(life/ 기준 주소). 없으면 빈 글자 */
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
