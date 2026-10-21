package egovframework.backoffice.media;

import egovframework.backoffice.account.CurrentAdmin;
import egovframework.backoffice.common.BusinessException;
import egovframework.backoffice.common.NotFoundException;
import egovframework.backoffice.common.PageResult;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

/**
 * 미디어 관리(2026-10-20, 표 media V25) — 로그인한 모든 사람(관리자 · 서포터즈)이 쓴다.
 *  - GET  /admin/media                 목록(종류 IMAGE · VIDEO · 이름 검색 · 쪽)
 *  - POST /admin/media/api/upload      파일 하나 올리기(화면이 여러 개를 하나씩 보냄) → JSON
 *  - POST /admin/media/{id}/rename     이름 바꾸기(관리자 이상 · 서포터즈는 자기가 올린 것만)
 *  - POST /admin/media/{id}/delete     휴지통으로(같은 권한) — 복원 · 완전 삭제는 휴지통 화면
 *  - GET  /admin/media/api             글쓰기 화면 '미디어에서 고르기'용 목록 JSON
 */
@Controller
@RequestMapping("/admin/media")
public class MediaController {

    private static final int PAGE_SIZE = 24;

    private final MediaService media;

    public MediaController(MediaService media) {
        this.media = media;
    }

    @GetMapping
    public String list(@RequestParam(required = false) String type, @RequestParam(required = false) String keyword,
                       @RequestParam(defaultValue = "1") int page, @AuthenticationPrincipal CurrentAdmin me, Model model) {
        String t = "IMAGE".equals(type) || "VIDEO".equals(type) ? type : null;
        model.addAttribute("menu", "media");
        model.addAttribute("type", t);
        model.addAttribute("keyword", keyword);
        model.addAttribute("result", media.list(t, keyword, page, PAGE_SIZE, me));
        model.addAttribute("maxFiles", MediaService.MAX_FILES);
        return "media/index";
    }

    /** 목록으로 돌아가는 주소(보던 종류 · 검색어 · 쪽 그대로) */
    private static String back(String type, String keyword, Integer page) {
        StringBuilder url = new StringBuilder("redirect:/admin/media");
        String sep = "?";
        if ("IMAGE".equals(type) || "VIDEO".equals(type)) {
            url.append(sep).append("type=").append(type);
            sep = "&";
        }
        if (keyword != null && !keyword.isBlank()) {
            url.append(sep).append("keyword=").append(URLEncoder.encode(keyword, StandardCharsets.UTF_8));
            sep = "&";
        }
        if (page != null && page > 1) {
            url.append(sep).append("page=").append(page);
        }
        return url.toString();
    }

    @PostMapping("/{id:[0-9]+}/rename")
    public String rename(@PathVariable Long id, @RequestParam String name, @RequestParam(required = false) String type,
                         @RequestParam(required = false) String keyword, @RequestParam(required = false) Integer page,
                         @AuthenticationPrincipal CurrentAdmin me, RedirectAttributes redirect) {
        try {
            MediaItem item = media.rename(id, name, me);
            redirect.addFlashAttribute("toast", "이름을 ‘" + item.getName() + "’(으)로 바꿨어요. 이 미디어를 쓰는 글은 그대로예요.");
        } catch (BusinessException e) {
            redirect.addFlashAttribute("toastError", e.getMessage());
        }
        return back(type, keyword, page);
    }

    @PostMapping("/{id:[0-9]+}/delete")
    public String delete(@PathVariable Long id, @RequestParam(required = false) String type,
                         @RequestParam(required = false) String keyword, @RequestParam(required = false) Integer page,
                         @AuthenticationPrincipal CurrentAdmin me, RedirectAttributes redirect) {
        MediaItem item = media.moveToTrash(id, me);
        redirect.addFlashAttribute("toast", "‘" + item.getName() + "’을(를) 휴지통으로 옮겼어요. 휴지통 › 미디어에서 복원할 수 있어요.");
        return back(type, keyword, page);
    }

    // ── JSON: 올리기 · 고르기 ──

    @PostMapping("/api/upload")
    @ResponseBody
    public Map<String, Object> upload(@RequestParam("file") MultipartFile file, @AuthenticationPrincipal CurrentAdmin me) {
        return json(media.upload(List.of(file), me).get(0));
    }

    @GetMapping("/api")
    @ResponseBody
    public Map<String, Object> api(@RequestParam(required = false) String type, @RequestParam(required = false) String keyword,
                                   @RequestParam(defaultValue = "1") int page, @AuthenticationPrincipal CurrentAdmin me) {
        String t = "IMAGE".equals(type) || "VIDEO".equals(type) ? type : null;
        PageResult<MediaItem> result = media.list(t, keyword, page, PAGE_SIZE, me);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", result.getItems().stream().map(MediaController::json).toList());
        out.put("page", result.getPage());
        out.put("total", result.getTotal());
        out.put("hasNext", result.isHasNext());
        return out;
    }

    private static Map<String, Object> json(MediaItem item) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", item.getId());
        m.put("name", item.getName());
        m.put("type", item.getMediaType());
        m.put("url", item.getUrl());
        // 게시글 사진 칸에 적는 주소
        m.put("src", item.getPostSrc());
        m.put("size", item.getSizeLabel());
        return m;
    }

    @org.springframework.web.bind.annotation.ExceptionHandler({BusinessException.class, NotFoundException.class})
    public ResponseEntity<Map<String, String>> error(RuntimeException e) {
        HttpStatus status = e instanceof NotFoundException ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
        String text = e.getMessage() == null ? "요청을 처리하지 못했어요." : e.getMessage();
        return ResponseEntity.status(status).body(Map.of("message", text));
    }
}
