package egovframework.backoffice.stats;

import egovframework.backoffice.post.story.StoryKind;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import lombok.Getter;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 방문 통계(2026-10-20, V22). 사이트(frontend/common/js/track.js)가 페이지를 열 때 방문을, 선배들의 이야기 글을 열 때 조회를 보내고,
 * 관리자 홈 · 방문 통계 화면이 날짜별로 센다. 날짜는 한국 시간. 방문자 번호는 브라우저가 만든 임의 값이라 이름 · IP는 남지 않는다.
 * (원래 집계 코드는 Git c7b276b 의 stats/StatsService — 그때는 글 표가 하나라 조회 기록이 글 번호만 가졌다)
 */
@Service
public class StatsService {

    public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

    private static final Pattern VISITOR_KEY = Pattern.compile("[A-Za-z0-9_-]{8,64}");
    /** 검색 로봇은 세지 않는다 */
    private static final Pattern BOT = Pattern.compile("bot|crawl|spider|slurp", Pattern.CASE_INSENSITIVE);

    private final StatsMapper stats;

    public StatsService(StatsMapper stats) {
        this.stats = stats;
    }

    /** 사이트가 보낸 방문자 번호가 맞는 모양인지(영문 · 숫자 · - · _ 8~64자) */
    public static boolean validVisitorKey(String key) {
        return key != null && VISITOR_KEY.matcher(key).matches();
    }

    public static LocalDate today() {
        return LocalDate.now(ZONE);
    }

    /** 사이트 페이지 방문 한 번 */
    @Transactional
    public void recordVisit(String visitorKey, String path, String device, String userAgent) {
        if (isBot(userAgent)) {
            return;
        }
        stats.insertVisit(today(), visitorKey, cleanPath(path), "MOBILE".equals(device) || "PC".equals(device) ? device : null);
    }

    /** 게시중인 글이면 조회 한 번을 남기고 true, 없거나 게시중이 아니면 false */
    @Transactional
    public boolean recordPostView(StoryKind kind, Long id, String visitorKey, String userAgent) {
        if (kind == null || id == null || !kind.tracksViews() || stats.countPublished(kind.table(), id) == 0) {
            return false;
        }
        if (!isBot(userAgent)) {
            stats.insertPostView(kind.slug(), id, today(), visitorKey);
        }
        return true;
    }

    /** 최근 days일(오늘 포함) 집계 */
    @Transactional(readOnly = true)
    public Summary summary(int days) {
        LocalDate today = today();
        LocalDate from = today.minusDays(days - 1L);
        Summary s = new Summary();
        s.days = days;
        s.from = from;
        s.to = today;
        s.generatedAt = LocalDateTime.now(ZONE);
        s.todayVisitors = stats.countVisitors(today, today);
        s.yesterdayVisitors = stats.countVisitors(today.minusDays(1), today.minusDays(1));
        s.totalVisitors = stats.totalVisitors();
        s.periodVisitors = stats.countVisitors(from, today);
        s.periodPageViews = stats.countPageViews(from, today);
        s.periodPostViews = stats.countPostViews(from, today);
        s.daily = mergeDaily(from, today);
        s.maxVisitors = s.daily.stream().mapToLong(DailyStat::getVisitors).max().orElse(0);
        s.maxPostViews = s.daily.stream().mapToLong(DailyStat::getPostViews).max().orElse(0);
        return s;
    }

    /** 최근 days일(오늘 포함) 게시물 조회 수 */
    @Transactional(readOnly = true)
    public long postViews(int days) {
        LocalDate today = today();
        return stats.countPostViews(today.minusDays(days - 1L), today);
    }

    /** 많이 본 글. days 가 0이면 전체 기간 */
    @Transactional(readOnly = true)
    public List<TopPost> topPosts(int days, int limit) {
        LocalDate today = today();
        return days > 0 ? stats.topPosts(today.minusDays(days - 1L), today, limit) : stats.topPosts(null, null, limit);
    }

    /** 방문 · 조회 집계를 날짜별로 합치고 기록이 없는 날은 0으로 채운다 */
    private List<DailyStat> mergeDaily(LocalDate from, LocalDate to) {
        Map<LocalDate, DailyStat> byDay = new LinkedHashMap<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            DailyStat stat = new DailyStat();
            stat.setStatDay(d);
            byDay.put(d, stat);
        }
        for (DailyStat v : stats.dailyVisitors(from, to)) {
            DailyStat stat = byDay.get(v.getStatDay());
            if (stat != null) {
                stat.setVisitors(v.getVisitors());
                stat.setPageViews(v.getPageViews());
            }
        }
        for (DailyStat v : stats.dailyPostViews(from, to)) {
            DailyStat stat = byDay.get(v.getStatDay());
            if (stat != null) {
                stat.setPostViews(v.getPostViews());
            }
        }
        return new ArrayList<>(byDay.values());
    }

    private static boolean isBot(String userAgent) {
        return userAgent != null && BOT.matcher(userAgent).find();
    }

    /** 페이지 주소만(?, # 뒤는 버림), 300자까지 */
    private static String cleanPath(String path) {
        if (path == null || !path.startsWith("/")) {
            return null;
        }
        int cut = path.length();
        for (char c : new char[] {'?', '#'}) {
            int i = path.indexOf(c);
            if (i >= 0 && i < cut) {
                cut = i;
            }
        }
        return path.substring(0, Math.min(cut, 300));
    }

    @Getter
    public static class Summary {
        private int days;
        private LocalDate from;
        private LocalDate to;
        private LocalDateTime generatedAt;
        private long todayVisitors;
        private long yesterdayVisitors;
        /** 누적 방문수: 날짜마다 센 방문자 수의 합 */
        private long totalVisitors;
        private long periodVisitors;
        private long periodPageViews;
        private long periodPostViews;
        private List<DailyStat> daily;
        private long maxVisitors;
        private long maxPostViews;
    }
}
