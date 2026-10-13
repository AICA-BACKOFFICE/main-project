package egovframework.backoffice.notice;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface NoticeMapper {
    /** 관리 화면용 전체(최근순) */
    List<Notice> findAll();

    /** 특정 관리자에게 지금 보여 줄 공지: 활성 · 기간 안 · 그 사람이 닫지 않은 것(고정 공지는 닫아도 보임) */
    List<Notice> findVisibleFor(@Param("adminId") Long adminId);

    Notice findById(@Param("id") Long id);

    int insert(Notice notice);

    int update(Notice notice);

    int setActive(@Param("id") Long id, @Param("active") boolean active);

    int delete(@Param("id") Long id);

    int deleteDismissal(@Param("noticeId") Long noticeId, @Param("adminId") Long adminId);

    int insertDismissal(@Param("noticeId") Long noticeId, @Param("adminId") Long adminId);

    int clearDismissals(@Param("noticeId") Long noticeId);
}
