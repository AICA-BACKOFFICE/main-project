package egovframework.backoffice.publicapi;

import egovframework.backoffice.post.story.StorySiteService;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 사이트(프론트 오피스)가 쓰는 공개 API (인증 없음). 2026-10-20부터 DB에서 읽는 것은 선배들의 이야기 글(후기 · 인터뷰 · 프로젝트 표)뿐이다.
 *  - GET /api/public/stories    : 게시중인 글
 *  - GET /api/public/stories.js : 같은 내용을 사이트 페이지가 &lt;script&gt;로 쓰는 모양(window.STORIES_DATA)
 * 인사교 라이프 · 지원 전 체크 · 기수별 모아보기는 사이트 HTML에 적혀 있다(카테고리 페이지 관리에서 고침).
 */
@RestController
@RequestMapping("/api/public")
public class PublicApiController {

    private static final MediaType JS = MediaType.parseMediaType("text/javascript;charset=UTF-8");

    private final StorySiteService storySite;

    public PublicApiController(StorySiteService storySite) {
        this.storySite = storySite;
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
}
