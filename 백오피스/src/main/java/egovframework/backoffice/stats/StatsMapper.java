package egovframework.backoffice.stats;

import java.time.LocalDate;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface StatsMapper {
    int insertVisit(@Param("day") LocalDate day, @Param("visitorKey") String visitorKey,
                    @Param("path") String path, @Param("userAgent") String userAgent);

    int insertPostView(@Param("postId") Long postId, @Param("day") LocalDate day,
                       @Param("visitorKey") String visitorKey);

    long countVisitors(@Param("from") LocalDate from, @Param("to") LocalDate to);

    long countPageViews(@Param("from") LocalDate from, @Param("to") LocalDate to);

    long countPostViews(@Param("from") LocalDate from, @Param("to") LocalDate to);

    List<DailyStat> dailyVisitors(@Param("from") LocalDate from, @Param("to") LocalDate to);

    List<DailyStat> dailyPostViews(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
