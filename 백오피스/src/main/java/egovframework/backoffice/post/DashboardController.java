package egovframework.backoffice.post;

import egovframework.backoffice.category.Category;
import egovframework.backoffice.category.CategoryService;
import egovframework.backoffice.post.story.StoryKind;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.transaction.annotation.Transactional;

/** 관리자 홈(로그인 후 첫 화면): 후기 · 인터뷰 · 프로젝트 표의 글 수(상태별 · 분류별)와 최근 글 */
@Controller
public class DashboardController {

    private final PostStore posts;
    private final StoryTableMapper tables;
    private final CategoryService categories;

    public DashboardController(PostStore posts, StoryTableMapper tables, CategoryService categories) {
        this.posts = posts;
        this.tables = tables;
        this.categories = categories;
    }

    @GetMapping("/admin")
    @Transactional(readOnly = true)
    public String dashboard(Model model) {
        List<Map<String, Object>> kinds = new ArrayList<>();
        for (StoryKind kind : StoryKind.values()) {
            Category top = categories.findBySlug(kind.slug());
            Map<String, Object> k = new LinkedHashMap<>();
            k.put("slug", kind.slug());
            k.put("label", kind.label());
            k.put("table", kind.key());
            k.put("total", count(top.getId(), null, null));
            k.put("published", count(top.getId(), null, PostStatus.PUBLISHED));
            k.put("draft", count(top.getId(), null, PostStatus.DRAFT));
            k.put("hidden", count(top.getId(), null, PostStatus.HIDDEN));
            // 분류: 후기는 분야, 인터뷰 · 프로젝트는 기수
            List<Map<String, Object>> groups = new ArrayList<>();
            if (kind == StoryKind.REVIEW) {
                for (Category sub : categories.childrenOf(top.getId())) {
                    groups.add(Map.of("name", sub.getName(), "count", count(top.getId(), sub.getId(), null), "subCategoryId", sub.getId()));
                }
            } else {
                for (Map<String, Object> row : kind == StoryKind.INTERVIEW ? tables.interviewCohorts() : tables.projectCohorts()) {
                    Object cohort = row.get("cohort");
                    groups.add(Map.of("name", cohort == null ? "기수 없음" : cohort + "기", "count", ((Number) row.get("cnt")).longValue()));
                }
            }
            k.put("groups", groups);
            kinds.add(k);
        }
        PostSearch recent = new PostSearch();
        recent.setSize(8);
        model.addAttribute("menu", "dashboard");
        model.addAttribute("kinds", kinds);
        model.addAttribute("trashCount", posts.countTrash(new PostSearch()));
        model.addAttribute("recentPosts", posts.search(recent));
        model.addAttribute("generatedAt", LocalDateTime.now());
        return "dashboard/index";
    }

    private long count(Long categoryId, Long subCategoryId, PostStatus status) {
        PostSearch s = new PostSearch();
        s.setCategoryId(categoryId);
        s.setSubCategoryId(subCategoryId);
        s.setStatus(status);
        return posts.countSearch(s);
    }
}
