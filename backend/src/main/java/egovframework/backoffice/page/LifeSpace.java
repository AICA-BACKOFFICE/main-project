package egovframework.backoffice.page;

import lombok.Getter;
import lombok.Setter;

/** 인사교 라이프 시설 공간 한 줄(life_facility_spaces, V29) */
@Getter
@Setter
public class LifeSpace {
    /** bx9s-1-0 */
    private String spaceId;
    private String floorKey;
    private String name;
    /** '' 없음 · ex 사진 예시 · tmp 임시 사진 */
    private String badge;
    private Integer sortOrder;
}
