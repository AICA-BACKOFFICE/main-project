package egovframework.backoffice.publicapi;

import egovframework.backoffice.page.CheckFaqService;
import egovframework.backoffice.post.story.StoryKind;
import egovframework.backoffice.post.story.StorySiteService;
import egovframework.backoffice.stats.StatsService;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 사이트(프론트 오피스)가 쓰는 공개 API (인증 없음). DB에서 읽는 것은 선배들의 이야기 글(후기 · 인터뷰 · 프로젝트 표)과
 * 지원 전 체크 자주 묻는 질문(faqs 표, 2026-10-20 V23)이다.
 *  - GET /api/public/stories    : 게시중인 글
 *  - GET /api/public/stories.js : 같은 내용을 사이트 페이지가 &lt;script&gt;로 쓰는 모양(window.STORIES_DATA)
 *  - GET /api/public/faq(.js)   : 자주 묻는 질문(window.FAQ_DATA) — 지원 전 체크 페이지가 check/js/faq-render.js로 그림
 *  - POST /api/public/track/visit : 방문 기록 {visitorKey, path, device} — 사이트 페이지가 열릴 때(common/js/track.js)
 *  - POST /api/public/track/posts/{종류}/{번호}/view : 게시중인 글 조회 기록 {visitorKey} — 글(#r-p12 등)을 열 때
 * 인사교 라이프 · 기수별 모아보기는 사이트 HTML에 적혀 있다(카테고리 페이지 관리에서 고침).
 */
@RestController
@RequestMapping("/api/public")
public class PublicApiController {

    private static final MediaType JS = MediaType.parseMediaType("text/javascript;charset=UTF-8");

    private final StorySiteService storySite;
    private final StatsService stats;
    private final CheckFaqService faq;

    public PublicApiController(StorySiteService storySite, StatsService stats, CheckFaqService faq) {
        this.storySite = storySite;
        this.stats = stats;
        this.faq = faq;
    }

    /** 사이트 데이터는 늘 DB의 지금 내용(캐시 안 함) */
    @GetMapping("/stories")
    public ResponseEntity<Map<String, Object>> stories() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(storySite.publishedData());
    }

    @GetMapping("/stories.js")
    public ResponseEntity<byte[]> storiesScript() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(JS)
                .body(storySite.publishedScript().getBytes(StandardCharsets.UTF_8));
    }

    /** 자주 묻는 질문도 늘 DB의 지금 내용 */
    @GetMapping("/faq")
    public ResponseEntity<Map<String, Object>> faq() {
        Map<String, Object> data = faq.publicData();
        data.put("source", "backoffice-api");
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(data);
    }

    @GetMapping("/faq.js")
    public ResponseEntity<byte[]> faqScript() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(JS)
                .body(faq.publicScript().getBytes(StandardCharsets.UTF_8));
    }

    @PostMapping("/track/visit")
    public ResponseEntity<Map<String, Object>> trackVisit(@RequestBody(required = false) Map<String, Object> body,
                                                          HttpServletRequest request) {
        String key = text(body, "visitorKey");
        if (!StatsService.validVisitorKey(key)) {
            return answer(HttpStatus.BAD_REQUEST);
        }
        stats.recordVisit(key, text(body, "path"), text(body, "device"), request.getHeader(HttpHeaders.USER_AGENT));
        return answer(HttpStatus.OK);
    }

    @PostMapping("/track/posts/{kind:review|interview|project}/{id:[0-9]{1,18}}/view")
    public ResponseEntity<Map<String, Object>> trackPostView(@PathVariable String kind, @PathVariable Long id,
                                                             @RequestBody(required = false) Map<String, Object> body,
                                                             HttpServletRequest request) {
        String key = text(body, "visitorKey");
        if (!StatsService.validVisitorKey(key)) {
            return answer(HttpStatus.BAD_REQUEST);
        }
        boolean ok = stats.recordPostView(StoryKind.ofSlug(kind), id, key, request.getHeader(HttpHeaders.USER_AGENT));
        return answer(ok ? HttpStatus.OK : HttpStatus.NOT_FOUND);
    }

    private static ResponseEntity<Map<String, Object>> answer(HttpStatus status) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(Map.of("ok", status == HttpStatus.OK));
    }

    private static String text(Map<String, Object> body, String key) {
        Object value = body == null ? null : body.get(key);
        return value instanceof String s ? s : null;
    }
}
