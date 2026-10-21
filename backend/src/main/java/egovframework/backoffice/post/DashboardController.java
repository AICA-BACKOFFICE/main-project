package egovframework.backoffice.post;

import egovframework.backoffice.category.CategoryService;
import egovframework.backoffice.post.story.StoryKind;
import egovframework.backoffice.stats.DailyStat;
import egovframework.backoffice.stats.StatsService;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Controller;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * 관리자 홈(로그인 후 첫 화면). 화면 모양은 원래 관리자 홈(방문수 · 30일 방문 그래프 · 7일 인기글 · 게시물 현황) 그대로다.
 * 방문수 · 그래프 · 인기글은 방문 통계 표(V22 visit_logs · post_view_logs, {@link StatsService})에서,
 * 게시물 현황은 후기 · 인터뷰 · 프로젝트 표에서 센다(휴지통 제외). 관리자 홈은 서포터즈도 같이 본다(2026-10-16 권한 정책).
 */
@Controller
public class DashboardController {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d");
    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("M월");

    private final PostStore posts;
    private final CategoryService categories;
    private final StatsService stats;

    public DashboardController(PostStore posts, CategoryService categories, StatsService stats) {
        this.posts = posts;
        this.categories = categories;
        this.stats = stats;
    }

    @GetMapping("/admin")
    @Transactional(readOnly = true)
    public String dashboard(Model model) {
        List<Map<String, Object>> kinds = new ArrayList<>();
        long total = 0, published = 0, draft = 0, hidden = 0;
        for (StoryKind kind : StoryKind.values()) {
            Long categoryId = categories.findBySlug(kind.slug()).getId();
            long count = count(categoryId, null);
            total += count;
            published += count(categoryId, PostStatus.PUBLISHED);
            draft += count(categoryId, PostStatus.DRAFT);
            hidden += count(categoryId, PostStatus.HIDDEN);
            Map<String, Object> k = new LinkedHashMap<>();
            k.put("slug", kind.slug());
            k.put("label", kind.label());
            k.put("count", count);
            kinds.add(k);
        }
        StatsService.Summary monthly = stats.summary(30);
        model.addAttribute("menu", "dashboard");
        model.addAttribute("generatedAt", monthly.getGeneratedAt());
        model.addAttribute("stats", monthly);
        model.addAttribute("chart", chart(monthly));
        model.addAttribute("topPosts", stats.topPosts(7, 5));
        model.addAttribute("weekPostViews", stats.postViews(7));
        model.addAttribute("kinds", kinds);
        model.addAttribute("total", total);
        model.addAttribute("published", published);
        model.addAttribute("draft", draft);
        model.addAttribute("hidden", hidden);
        return "dashboard/index";
    }

    /** 30일 방문 그래프: 날짜(일) · 월 · 방문자 수 — 템플릿이 JSON 으로 넣어 SVG 선 그래프를 그린다 */
    private static List<Map<String, Object>> chart(StatsService.Summary monthly) {
        List<Map<String, Object>> chart = new ArrayList<>();
        for (DailyStat d : monthly.getDaily()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("d", d.getStatDay().format(DAY));
            m.put("m", d.getStatDay().format(MONTH));
            m.put("v", d.getVisitors());
            chart.add(m);
        }
        return chart;
    }

    private long count(Long categoryId, PostStatus status) {
        PostSearch s = new PostSearch();
        s.setCategoryId(categoryId);
        s.setStatus(status);
        return posts.countSearch(s);
    }
}
