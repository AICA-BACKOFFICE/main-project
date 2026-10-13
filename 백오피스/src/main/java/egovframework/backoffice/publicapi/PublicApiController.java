package egovframework.backoffice.publicapi;

import egovframework.backoffice.category.Category;
import egovframework.backoffice.category.CategoryService;
import egovframework.backoffice.common.NotFoundException;
import egovframework.backoffice.post.Post;
import egovframework.backoffice.post.PostMapper;
import egovframework.backoffice.post.PostService;
import egovframework.backoffice.stats.StatsService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 프론트 오피스가 사용하는 공개 API (인증 없음).
 *  - GET  /api/public/categories                : 활성 카테고리
 *  - GET  /api/public/posts?category=slug&page= : 게시중 목록
 *  - GET  /api/public/posts/{id}                : 게시물 본문(블록)
 *  - POST /api/public/track/visit               : 방문 기록 {visitorKey, path}
 *  - POST /api/public/track/posts/{id}/view     : 게시물 조회 기록 {visitorKey}
 */
@RestController
@RequestMapping("/api/public")
public class PublicApiController {

    private final CategoryService categoryService;
    private final PostService postService;
    private final PostMapper postMapper;
    private final StatsService statsService;

    public PublicApiController(CategoryService categoryService, PostService postService,
                               PostMapper postMapper, StatsService statsService) {
        this.categoryService = categoryService;
        this.postService = postService;
        this.postMapper = postMapper;
        this.statsService = statsService;
    }

    @GetMapping("/categories")
    public List<Map<String, Object>> categories() {
        // 2단 트리: [{id,name,slug,...,children:[...]}] — 프론트 탭(후기 → 생활·수업… / 기수별 → 3~5기·6기·7기)
        return categoryService.tree().stream().map(PublicApiController::categoryJson).toList();
    }

    @GetMapping("/posts")
    public Map<String, Object> posts(@RequestParam(required = false) String category,
                                     @RequestParam(required = false) String sub,
                                     @RequestParam(defaultValue = "1") int page,
                                     @RequestParam(defaultValue = "10") int size) {
        int safeSize = Math.min(Math.max(size, 1), 50);
        int safePage = Math.max(page, 1);
        List<Post> items = postMapper.findPublished(category, sub, (safePage - 1) * safeSize, safeSize);
        long total = postMapper.countPublished(category, sub);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("page", safePage);
        body.put("size", safeSize);
        body.put("total", total);
        body.put("items", items.stream().map(p -> postJson(p, false)).toList());
        return body;
    }

    @GetMapping("/posts/{id}")
    public Map<String, Object> post(@PathVariable Long id) {
        Post post = postService.getPublished(id);
        Map<String, Object> json = postJson(post, true);
        var blocks = postService.blocksOf(post);
        json.put("blocks", blocks);
        json.put("layout", postService.layoutOf(post).toMap());   // 프론트가 같은 규칙으로 화면을 구성
        json.put("toc", postService.tocOf(blocks));
        return json;
    }

    @PostMapping("/track/visit")
    public Map<String, Object> trackVisit(@RequestBody(required = false) Map<String, String> body,
                                          HttpServletRequest request) {
        String key = value(body, "visitorKey", request.getRemoteAddr());
        statsService.recordVisit(key, value(body, "path", null), request.getHeader("User-Agent"));
        return Map.of("ok", true);
    }

    @PostMapping("/track/posts/{id}/view")
    public Map<String, Object> trackPostView(@PathVariable Long id,
                                             @RequestBody(required = false) Map<String, String> body,
                                             HttpServletRequest request) {
        String key = value(body, "visitorKey", request.getRemoteAddr());
        return Map.of("ok", statsService.recordPostView(id, key));
    }

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<Map<String, String>> notFound(NotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("code", "NOT_FOUND", "message", e.getMessage()));
    }

    private static String value(Map<String, String> body, String key, String def) {
        if (body == null || body.get(key) == null || body.get(key).isBlank()) {
            return def;
        }
        return body.get(key);
    }

    private static Map<String, Object> categoryJson(Category c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("name", c.getName());
        m.put("slug", c.getSlug());
        m.put("description", c.getDescription());
        m.put("postCount", c.getPostCount());
        m.put("parentId", c.getParentId());
        if (c.isTop()) {
            m.put("children", c.getChildren().stream().map(PublicApiController::categoryJson).toList());
        }
        return m;
    }

    private static Map<String, Object> postJson(Post p, boolean detail) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", p.getId());
        m.put("title", p.getTitle());
        m.put("summary", p.getSummary());
        m.put("thumbnailUrl", p.getThumbnailUrl());
        m.put("category", p.getCategoryName());
        m.put("categorySlug", p.getCategorySlug());
        m.put("subCategory", p.getSubCategoryName());
        m.put("subCategorySlug", p.getSubCategorySlug());
        m.put("author", p.getAuthorName());
        m.put("viewCount", p.getViewCount());
        m.put("publishedAt", p.getPublishedAt());
        if (detail) {
            m.put("updatedAt", p.getUpdatedAt());
        }
        return m;
    }
}
