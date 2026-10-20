package egovframework.backoffice.page;

import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

/** 인사교 라이프 버전 기록 하나(life_versions): 목록을 바꾸기 바로 전 모습 */
@Getter
@Setter
public class LifeVersion {
    private Long id;
    /** food 오늘 점심 · fun 바람 쐬러 가요 · fac 시설 사진 */
    private String section;
    /** SAVE 저장 전 · RESTORE 되돌리기 전 · TRASH_RESTORE 휴지통에서 꺼내기 전 */
    private String reason;
    private String summary;
    /** 그때 목록 전체(JSON) */
    private String data;
    private Long createdBy;
    private String createdByName;
    private LocalDateTime createdAt;
}
