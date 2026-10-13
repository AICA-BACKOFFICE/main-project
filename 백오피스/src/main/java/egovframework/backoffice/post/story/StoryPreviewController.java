package egovframework.backoffice.post.story;

import static java.nio.charset.StandardCharsets.UTF_8;

import jakarta.servlet.http.HttpServletRequest;
import java.net.URLDecoder;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;

/**
 * 선배들의 이야기 미리보기 화면: /admin/posts/story-preview/{미리보기 번호}/stories/index.html#글주소.
 * 사이트 파일을 그대로 보여 주고 데이터 파일만 미리보기 내용으로 바꾼다({@link StorySiteService#previewFile}). 로그인한 운영진 누구나 볼 수 있다.
 */
@Controller
@RequestMapping("/admin/posts/story-preview")
public class StoryPreviewController {

    private final StorySiteService site;

    public StoryPreviewController(StorySiteService site) {
        this.site = site;
    }

    @GetMapping("/{token}/**")
    public ResponseEntity<byte[]> file(@PathVariable String token, HttpServletRequest request) {
        String prefix = request.getContextPath() + "/admin/posts/story-preview/" + token + "/";
        String uri = request.getRequestURI();
        String relative = uri.startsWith(prefix) ? URLDecoder.decode(uri.substring(prefix.length()).replace("+", "%2B"), UTF_8) : "";
        return site.previewFile(token, relative);
    }
}
