package egovframework.backoffice.page;

import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

/** 카테고리 페이지 버전 기록 한 줄(page_versions, V28). 목록에서는 html 을 비워 둔다 */
@Getter
@Setter
public class PageVersion {
    private Long id;
    private String pageId;
    private String html;
    private String contentHash;
    private Integer htmlSize;
    /** 어디서: 사이트에 반영 · 인사교 라이프 게시물 관리 · 반영 전 사이트 상태 · 예전 백업 파일 */
    private String note;
    private Long savedBy;
    /** 반영한 관리자 이름(목록) */
    private String savedByName;
    private LocalDateTime createdAt;
}
