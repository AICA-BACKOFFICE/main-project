package egovframework.backoffice.page;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** 자주 묻는 질문 표(faqs, V23 · V24). 휴지통은 다른 게시글 표와 같은 규칙(status DELETED · status_before_trash · deleted_at) */
@Mapper
public interface FaqMapper {
    /** 휴지통이 아닌 질문(FAQ 관리 화면), 사이트 순서(번호 sort_order) */
    List<FaqItem> findLive();

    /** 사이트에 보이는 질문: 게시중이고 휴지통이 아닌 것 */
    List<FaqItem> findPublished();

    int insert(FaqItem item);

    int update(FaqItem item);

    /** 휴지통으로: 옮기기 전 상태를 남기고 삭제됨으로(사이트에서 바로 내려감) */
    int softDelete(@Param("id") Long id);

    /** 휴지통에 있는 질문 하나 */
    FaqItem findDeleted(@Param("id") Long id);

    /** 복원 전에 원래 자리(지울 때의 번호)를 비운다: 그 번호부터 뒤의 질문을 한 칸씩 뒤로 */
    int makeRoom(@Param("id") Long id);

    /** 복원: 옮기기 전 상태로, 번호는 지울 때의 자리 그대로(먼저 makeRoom) */
    int restore(@Param("id") Long id);

    /** 완전 삭제(휴지통에 있는 것만) */
    int hardDelete(@Param("id") Long id);

    /** 휴지통의 이 질문들을 잠근다(같이 비우거나 복원하는 동안 다른 사람이 못 바꾸게). 번호 · 지운 시각만 */
    List<FaqItem> lockDeleted(@Param("ids") List<Long> ids);

    List<FaqItem> lockAllDeleted();
}
