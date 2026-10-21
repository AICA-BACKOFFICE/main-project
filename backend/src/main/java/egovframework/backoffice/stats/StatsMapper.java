package egovframework.backoffice.stats;

import java.time.LocalDate;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 방문 통계 표(V22): visit_logs(사이트 페이지 방문) · post_view_logs(선배들의 이야기 글 조회).
 * 날짜(visited_on · viewed_on)는 한국 시간 날짜이고, 기간은 from ~ to 를 모두 포함한다.
 */
@Mapper
public interface StatsMapper {

    int insertVisit(@Param("day") LocalDate day, @Param("visitorKey") String visitorKey, @Param("path") String path,
                    @Param("device") String device);

    /** type: review · interview · project */
    int insertPostView(@Param("type") String type, @Param("postId") Long postId, @Param("day") LocalDate day,
                       @Param("visitorKey") String visitorKey);

    /** 게시중인 글이면 1(휴지통 제외). table 인자는 StoryKind.table()(reviews · interviews · projects)만 넣는다 */
    long countPublished(@Param("table") String table, @Param("id") Long id);

    /** 기간 동안 서로 다른 방문자 수 */
    long countVisitors(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /** 기간 동안 페이지뷰(방문 기록 줄 수) */
    long countPageViews(@Param("from") LocalDate from, @Param("to") LocalDate to);

    long countPostViews(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /** 누적 방문수: 날짜마다 센 방문자 수를 모두 더한 값 */
    long totalVisitors();

    List<DailyStat> dailyVisitors(@Param("from") LocalDate from, @Param("to") LocalDate to);

    List<DailyStat> dailyPostViews(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /** 많이 본 글(휴지통 글 제외), 조회 많은 순. from 이 없으면 전체 기간 */
    List<TopPost> topPosts(@Param("from") LocalDate from, @Param("to") LocalDate to, @Param("limit") int limit);

    /** 글을 완전히 지울 때 그 글의 조회 기록도 지운다 */
    int deletePostViews(@Param("type") String type, @Param("postId") Long postId);

    /** 글 종류를 바꿔 다른 표로 옮길 때(새 번호를 받음) 조회 기록도 따라간다 */
    int movePostViews(@Param("fromType") String fromType, @Param("fromId") Long fromId,
                      @Param("toType") String toType, @Param("toId") Long toId);
}
