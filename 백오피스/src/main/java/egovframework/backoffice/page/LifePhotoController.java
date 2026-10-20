package egovframework.backoffice.page;

import egovframework.backoffice.account.CurrentAdmin;
import egovframework.backoffice.common.BusinessException;
import egovframework.backoffice.common.NotFoundException;
import egovframework.backoffice.config.BackofficeProperties;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

/**
 * 게시물 관리 › 인사교 라이프 게시물 관리(/admin/pages/life-photos — 시설 사진 · 오늘 점심 · 바람 쐬러 가요). 화면은 static/js/page/life-photos.js 가 그리고,
 * 사진 올리기는 카테고리 페이지 관리의 그림 올리기(/admin/pages/api/upload?page=life)를 같이 쓴다. 관리자 이상(SecurityConfig /admin/pages/**).
 */
@Controller
public class LifePhotoController {

    private final LifePhotoService service;
    private final BackofficeProperties properties;

    public LifePhotoController(LifePhotoService service, BackofficeProperties properties) {
        this.service = service;
        this.properties = properties;
    }

    @GetMapping("/admin/pages/life-photos")
    public String view(@RequestParam(required = false) String section, Model model, HttpServletRequest request) {
        String context = request.getContextPath();
        String front = properties.getPages().getFrontUrl();
        model.addAttribute("menu", "life-photos");
        // 왼쪽 메뉴 세부 카테고리로 열 탭: 시설 사진(fac) · 오늘 점심, 여기 어때요?(food) · 수업 끝나고, 바람 쐬러 가요(fun)
        model.addAttribute("lifeSection", "food".equals(section) || "fun".equals(section) ? section : "fac");
        model.addAttribute("frontLink", (front == null || front.isBlank() ? context + "/admin/pages/site/" : front.trim().replaceAll("/*$", "/"))
                + "life/index.html#facilities");
        return "page/life-photos";
    }

    @GetMapping("/admin/pages/life-photos/api")
    @ResponseBody
    public Map<String, Object> model(HttpServletRequest request) {
        return service.model(request.getContextPath());
    }

    @PostMapping("/admin/pages/life-photos/api")
    @ResponseBody
    public Map<String, Object> save(@RequestBody LifePhotoService.SaveRequest body, HttpServletRequest request, @AuthenticationPrincipal CurrentAdmin me) {
        return service.save(body, request.getContextPath(), me == null ? null : me.getId());
    }

    /** 버전 기록(최근 것부터): section = food · fun · fac */
    @GetMapping("/admin/pages/life-photos/api/versions")
    @ResponseBody
    public List<Map<String, Object>> versions(@RequestParam String section) {
        return service.versions(section);
    }

    /** 그 버전의 모습으로 되돌리기(지금 모습은 버전 기록에 남음) */
    @PostMapping("/admin/pages/life-photos/api/versions/{id}/restore")
    @ResponseBody
    public Map<String, Object> restore(@PathVariable Long id, HttpServletRequest request, @AuthenticationPrincipal CurrentAdmin me) {
        return service.restore(id, request.getContextPath(), me == null ? null : me.getId());
    }

    @ExceptionHandler({BusinessException.class, NotFoundException.class, CategoryPageService.PageStorageException.class})
    public ResponseEntity<Map<String, String>> error(RuntimeException e) {
        HttpStatus status = e instanceof NotFoundException ? HttpStatus.NOT_FOUND
                : e instanceof CategoryPageService.PageStorageException ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.BAD_REQUEST;
        String text = e.getMessage() == null ? "요청을 처리하지 못했어요." : e.getMessage();
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).body(Map.of("error", text, "message", text));
    }
}
