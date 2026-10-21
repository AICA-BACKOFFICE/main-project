package egovframework.backoffice.stats;

import java.time.LocalDate;
import lombok.Getter;
import lombok.Setter;

/** 하루 집계: 방문자(서로 다른 방문자 번호 수) · 페이지뷰(방문 기록 줄 수) · 게시물 조회(조회 기록 줄 수) */
@Getter
@Setter
public class DailyStat {
    private LocalDate statDay;
    private long visitors;
    private long pageViews;
    private long postViews;
}
