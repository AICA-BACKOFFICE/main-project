package egovframework.backoffice.page;

import lombok.Getter;
import lombok.Setter;

/** 인사교 라이프 › 시설 둘러보기 사진 하나(life_facility_photos). 공간(spaceId)마다 sortOrder 순으로 사진 넘김에 보인다. */
@Getter
@Setter
public class LifeFacilityPhoto {
    private Long id;
    /** 사이트 life/index.html 의 공간(bx9s-층-번호) */
    private String spaceId;
    /** 사이트에 원래 있던 그림(life.css 의 im-이름). 없으면 빈 글자 */
    private String photoClass;
    /** 올린 사진(life/ 기준 주소). 없으면 빈 글자 */
    private String photo;
    /** 확대(예: 230%). 비우면 꽉 차게 */
    private String zoom;
    /** 가운데에 보일 곳(예: 70% 40%) */
    private String pos;
    private String caption;
    private int sortOrder;
}
