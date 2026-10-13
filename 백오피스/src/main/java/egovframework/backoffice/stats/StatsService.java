package egovframework.backoffice.stats;

import egovframework.backoffice.post.Post;
import egovframework.backoffice.post.PostMapper;
import egovframework.backoffice.post.PostStatus;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.Getter;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StatsService {

    private final StatsMapper statsMapper;
    private final PostMapper postMapper;

    public StatsService(StatsMapper statsMapper, PostMapper postMapper) {
        this.statsMapper = statsMapper;
        this.postMapper = postMapper;
    }

    @Transactional
    public void recordVisit(String visitorKey, String path, String userAgent) {
        statsMapper.insertVisit(LocalDate.now(), trim(visitorKey, 64), trim(path, 300), trim(userAgent, 300));
    }

    /** 게시중인 글에만 조회수를 반영한다. 존재하지 않으면 무시. */
    @Transactional
    public boolean recordPostView(Long postId, String visitorKey) {
        Post post = postMapper.findPublishedById(postId);
        if (post == null) {
            return false;
        }
        postMapper.increaseViewCount(postId);
        statsMapper.insertPostView(postId, LocalDate.now(), trim(visitorKey, 64));
        return true;
    }

    @Transactional(readOnly = true)
    public Summary summary(int days) {
        LocalDate today = LocalDate.now();
        LocalDate from = today.minusDays(days - 1L);
        Summary s = new Summary();
        s.days = days;
        s.from = from;
        s.to = today;
        s.todayVisitors = statsMapper.countVisitors(today, today);
        s.yesterdayVisitors = statsMapper.countVisitors(today.minusDays(1), today.minusDays(1));
        s.totalVisitors = statsMapper.countPageViews(LocalDate.of(2000, 1, 1), today);
        s.pendingPosts = postMapper.countByStatus(PostStatus.PENDING);
        s.hiddenPosts = postMapper.countByStatus(PostStatus.HIDDEN);
        s.generatedAt = java.time.LocalDateTime.now();
        s.periodVisitors = statsMapper.countVisitors(from, today);
        s.periodPageViews = statsMapper.countPageViews(from, today);
        s.periodPostViews = statsMapper.countPostViews(from, today);
        s.totalPosts = postMapper.countAll();
        s.publishedPosts = postMapper.countByStatus(PostStatus.PUBLISHED);
        s.draftPosts = postMapper.countByStatus(PostStatus.DRAFT);
        s.topPosts = postMapper.findTopViewed(10);
        s.daily = mergeDaily(from, today);
        s.maxVisitors = s.daily.stream().mapToLong(DailyStat::getVisitors).max().orElse(0);
        s.maxPostViews = s.daily.stream().mapToLong(DailyStat::getPostViews).max().orElse(0);
        return s;
    }

    /** 방문·조회 집계를 날짜별로 합치고 비어 있는 날짜는 0 으로 채운다. */
    private List<DailyStat> mergeDaily(LocalDate from, LocalDate to) {
        Map<LocalDate, DailyStat> byDay = new LinkedHashMap<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            DailyStat stat = new DailyStat();
            stat.setDay(d);
            byDay.put(d, stat);
        }
        for (DailyStat v : statsMapper.dailyVisitors(from, to)) {
            DailyStat stat = byDay.get(v.getDay());
            if (stat != null) {
                stat.setVisitors(v.getVisitors());
                stat.setPageViews(v.getPageViews());
            }
        }
        for (DailyStat v : statsMapper.dailyPostViews(from, to)) {
            DailyStat stat = byDay.get(v.getDay());
            if (stat != null) {
                stat.setPostViews(v.getPostViews());
            }
        }
        return new ArrayList<>(byDay.values());
    }

    private static String trim(String s, int max) {
        if (s == null) {
            return null;
        }
        return s.length() > max ? s.substring(0, max) : s;
    }

    @Getter
    public static class Summary {
        private int days;
        private LocalDate from;
        private LocalDate to;
        private long todayVisitors;
        private long yesterdayVisitors;
        /** 누적 방문수(전체 기간 페이지뷰) */
        private long totalVisitors;
        private long pendingPosts;
        private long hiddenPosts;
        private java.time.LocalDateTime generatedAt;
        private long periodVisitors;
        private long periodPageViews;
        private long periodPostViews;
        private long totalPosts;
        private long publishedPosts;
        private long draftPosts;
        private List<Post> topPosts;
        private List<DailyStat> daily;
        private long maxVisitors;
        private long maxPostViews;
    }
}
