package egovframework.backoffice.stats;

import java.time.LocalDate;
import lombok.Getter;
import lombok.Setter;

/** 일별 방문자·조회수 집계 행 */
@Getter
@Setter
public class DailyStat {
    /** 컬럼 별칭 stat_day (day 는 H2/PostgreSQL 예약어) */
    private LocalDate statDay;

    public LocalDate getDay() {
        return statDay;
    }

    public void setDay(LocalDate day) {
        this.statDay = day;
    }
    private long visitors;
    private long pageViews;
    private long postViews;
}
