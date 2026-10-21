package egovframework.backoffice.page;

import egovframework.backoffice.post.PostStatus;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

/**
 * 지원 전 체크 › 자주 묻는 질문 하나(표 faqs, V23 · V24). 사이트에는 게시중이고 휴지통이 아닌 질문만 sortOrder(번호) 순으로 보인다.
 * 상태 · 휴지통 칸은 다른 게시글 표(후기 · 인터뷰 · 프로젝트)와 같다.
 */
@Getter
@Setter
public class FaqItem {
    private Long id;
    /** 분류: 사이트 분류 버튼(data-cat) 이름 */
    private String category;
    private String question;
    /** 답변(HTML) */
    private String answer;
    /** 임시저장 · 게시중 · 미게시 · 삭제됨(휴지통) */
    private PostStatus status;
    /** 휴지통으로 옮기기 전 상태(복원하면 이 상태로) */
    private PostStatus statusBeforeTrash;
    /** 번호(사이트에 보이는 순서) */
    private int sortOrder;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    /** 휴지통으로 옮긴 시각 */
    private LocalDateTime deletedAt;
}
