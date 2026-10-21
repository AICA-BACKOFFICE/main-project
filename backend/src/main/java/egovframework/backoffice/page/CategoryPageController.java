package egovframework.backoffice.page;

import static java.nio.charset.StandardCharsets.UTF_8;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * 카테고리 페이지 관리 화면.
 * <ul>
 *   <li>/admin/pages/{id}/edit — 실제 페이지를 화면 그대로 보며 고치는 전용 편집 화면(글쓰기처럼 전체 화면)</li>
 *   <li>/admin/pages/site/** — 사이트 폴더의 파일. 편집 화면(iframe)은 실제 페이지와 같은 상대 경로로 CSS·그림을 읽는다.
 *       ?__bo=edit 이면 편집 중인 글(임시저장본 우선)에 편집기를 붙여 보내고, ?__bo=preview 면 편집 중인 글을 그대로 보낸다.
 *       붙이지 않으면 사이트에 반영된 파일 그대로(‘반영된 페이지 보기’). 페이지가 부르는 공개 API(api/public/…)는 이 서버의 /api/public/… 로 보낸다.</li>
 * </ul>
 * 저장·반영 API 는 {@link CategoryPageApiController}.
 */
@Controller
public class CategoryPageController {

    static final String SITE_PREFIX = "/admin/pages/site/";
    private static final String PUBLIC_API = "api/public/";
    private static final MediaType HTML = new MediaType("text", "html", UTF_8);
    private static final Map<String, MediaType> TYPES = Map.ofEntries(
            Map.entry("html", HTML),
            Map.entry("css", new MediaType("text", "css", UTF_8)),
            Map.entry("js", new MediaType("text", "javascript", UTF_8)),
            Map.entry("mjs", new MediaType("text", "javascript", UTF_8)),
            Map.entry("json", new MediaType("application", "json", UTF_8)),
            Map.entry("txt", new MediaType("text", "plain", UTF_8)),
            Map.entry("svg", MediaType.valueOf("image/svg+xml")),
            Map.entry("png", MediaType.IMAGE_PNG),
            Map.entry("jpg", MediaType.IMAGE_JPEG),
            Map.entry("jpeg", MediaType.IMAGE_JPEG),
            Map.entry("gif", MediaType.IMAGE_GIF),
            Map.entry("webp", MediaType.valueOf("image/webp")),
            Map.entry("avif", MediaType.valueOf("image/avif")),
            Map.entry("ico", MediaType.valueOf("image/x-icon")),
            Map.entry("woff2", MediaType.valueOf("font/woff2")),
            Map.entry("woff", MediaType.valueOf("font/woff")),
            Map.entry("ttf", MediaType.valueOf("font/ttf")),
            Map.entry("otf", MediaType.valueOf("font/otf")),
            Map.entry("mp4", MediaType.valueOf("video/mp4")),
            Map.entry("webm", MediaType.valueOf("video/webm")),
            Map.entry("pdf", MediaType.APPLICATION_PDF));

    private final CategoryPageService service;

    public CategoryPageController(CategoryPageService service) {
        this.service = service;
    }

    /** 사이드바 그룹 제목에서 오면 첫 페이지 편집 화면으로 */
    @GetMapping({"/admin/pages", "/admin/pages/"})
    public String index() {
        return "redirect:/admin/pages/" + service.pages().get(0).id() + "/edit";
    }

    @GetMapping("/admin/pages/{id}/edit")
    public String editor(@PathVariable String id, Model model, HttpServletRequest request) {
        CategoryPage page = service.page(id);
        CsrfToken csrf = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
        model.addAttribute("menu", "page-" + page.id());
        model.addAttribute("page", page);
        model.addAttribute("siteReady", service.exists(page));
        model.addAttribute("siteRoot", service.siteRoot().toString());
        model.addAttribute("configJson", service.editorConfig(page, request.getContextPath(), csrf));
        return "page/editor";
    }

    @GetMapping("/admin/pages/site/**")
    public ResponseEntity<?> site(HttpServletRequest request, @RequestParam(name = "__bo", required = false) String mode) throws IOException {
        String relative = relativePath(request);
        // 사이트 페이지가 부르는 공개 API(../api/public/… — 게시물 관리의 글)는 이 서버의 API에서
        if (relative.startsWith(PUBLIC_API)) {
            String uri = request.getRequestURI();
            return ResponseEntity.status(HttpStatus.FOUND)
                    .location(URI.create(request.getContextPath() + "/" + uri.substring(uri.indexOf(PUBLIC_API)))).build();
        }
        if ("edit".equals(mode) || "preview".equals(mode)) {
            Optional<CategoryPage> page = service.pageForFile(relative);
            if (page.isPresent()) {
                String html = service.working(page.get());
                if ("edit".equals(mode)) {
                    html = service.withEditor(page.get(), html, request.getContextPath());
                }
                return ResponseEntity.ok().contentType(HTML).cacheControl(CacheControl.noStore()).body(html);
            }
        }
        Optional<Path> file = service.siteFile(relative);
        if (file.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        Path path = file.get();
        return ResponseEntity.ok()
                .contentType(mediaType(path))
                .cacheControl(CacheControl.noCache())
                .lastModified(Files.getLastModifiedTime(path).toMillis())
                .body(new FileSystemResource(path));
    }

    /** 요청 주소에서 /admin/pages/site/ 뒤의 사이트 폴더 기준 경로 */
    static String relativePath(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String base = request.getContextPath() + SITE_PREFIX;
        String raw = uri.startsWith(base) ? uri.substring(base.length()) : "";
        return URLDecoder.decode(raw.replace("+", "%2B"), UTF_8);
    }

    private static MediaType mediaType(Path path) {
        String name = path.getFileName().toString();
        int dot = name.lastIndexOf('.');
        String ext = dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
        MediaType known = TYPES.get(ext);
        return known != null ? known : MediaTypeFactory.getMediaType(name).orElse(MediaType.APPLICATION_OCTET_STREAM);
    }
}
