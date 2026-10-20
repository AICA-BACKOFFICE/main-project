package egovframework.backoffice.page;

import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

/** 지원 전 체크 › 자주 묻는 질문 하나(faq_items). 사이트에는 sortOrder 순으로 보인다. */
@Getter
@Setter
public class FaqItem {
    private Long id;
    /** 사이트 분류 버튼(data-cat) 이름 */
    private String category;
    private String question;
    /** 답(HTML) */
    private String answer;
    private int sortOrder;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
