package egovframework.backoffice.page;

import egovframework.backoffice.common.BackPath;
import egovframework.backoffice.common.BusinessException;
import egovframework.backoffice.common.NotFoundException;
import egovframework.backoffice.config.BackofficeProperties;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

/**
 * 게시물 관리 › 인사교 라이프 게시물 관리(/admin/pages/life-photos — 시설 사진 · 오늘 점심 · 바람 쐬러 가요). 화면은 static/js/page/life-photos.js 가 그리고,
 * 사진 올리기는 카테고리 페이지 관리의 그림 올리기(/admin/pages/api/upload?page=life)를 같이 쓴다. 관리자 이상(SecurityConfig /admin/pages/**).
 * 2026-10-20부터 카드 하나씩 저장한다(DB 표 V29, {@link LifeBoardService}):
 *  - POST /api/{fac|food|fun}               새 카드(완료 = 게시 · 임시저장)
 *  - POST /api/{fac|food|fun}/{id}          고친 내용 저장
 *  - POST /api/{fac|food|fun}/{id}/move     순서(dir -1 앞 · 1 뒤)
 *  - POST /api/{fac|food|fun}/{id}/delete   휴지통으로
 *  - POST /{fac|food|fun}/{id}/delete       휴지통으로(임시저장 목록의 삭제 단추, back 으로 돌아감)
 */
@Controller
public class LifePhotoController {

    private final LifeBoardService board;
    private final BackofficeProperties properties;

    public LifePhotoController(LifeBoardService board, BackofficeProperties properties) {
        this.board = board;
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
        return board.model(request.getContextPath());
    }

    @PostMapping("/admin/pages/life-photos/api/{section:fac|food|fun}")
    @ResponseBody
    public Map<String, Object> create(@PathVariable String section, @RequestBody LifeBoardService.Input body, HttpServletRequest request) {
        Long id = board.save(section, null, body);
        return done(request, id, message(body));
    }

    @PostMapping("/admin/pages/life-photos/api/{section:fac|food|fun}/{id:[0-9]+}")
    @ResponseBody
    public Map<String, Object> update(@PathVariable String section, @PathVariable Long id, @RequestBody LifeBoardService.Input body,
                                      HttpServletRequest request) {
        board.save(section, id, body);
        return done(request, id, message(body));
    }

    @PostMapping("/admin/pages/life-photos/api/{section:fac|food|fun}/{id:[0-9]+}/move")
    @ResponseBody
    public Map<String, Object> move(@PathVariable String section, @PathVariable Long id, @RequestParam int dir, HttpServletRequest request) {
        board.move(section, id, dir);
        return done(request, id, null);
    }

    @PostMapping("/admin/pages/life-photos/api/{section:fac|food|fun}/{id:[0-9]+}/delete")
    @ResponseBody
    public Map<String, Object> delete(@PathVariable String section, @PathVariable Long id, HttpServletRequest request) {
        board.moveToTrash(section, id);
        return done(request, id, "휴지통으로 옮겼어요. 휴지통에서 복원할 수 있어요.");
    }

    /** 임시저장 목록의 삭제 단추: 휴지통으로 옮기고 back(관리 화면 안)으로 */
    @PostMapping("/admin/pages/life-photos/{section:fac|food|fun}/{id:[0-9]+}/delete")
    public String deleteForm(@PathVariable String section, @PathVariable Long id, @RequestParam(required = false) String back,
                             RedirectAttributes redirect) {
        try {
            LifeItem item = board.moveToTrash(section, id);
            redirect.addFlashAttribute("toast", "‘" + title(section, item) + "’을(를) 휴지통으로 옮겼어요.");
        } catch (BusinessException | NotFoundException e) {
            redirect.addFlashAttribute("toast", e.getMessage());
        }
        return "redirect:" + BackPath.or(back, "/admin/pages/life-photos?section=" + section);
    }

    static String title(String section, LifeItem item) {
        String t = "fac".equals(section) ? item.getCaption() : item.getName();
        return t == null || t.isBlank() ? "이름 없는 카드" : t;
    }

    private Map<String, Object> done(HttpServletRequest request, Long id, String message) {
        Map<String, Object> model = board.model(request.getContextPath());
        model.put("id", id);
        if (message != null) {
            model.put("message", message);
        }
        return model;
    }

    private static String message(LifeBoardService.Input body) {
        return "PUBLISHED".equals(body.status()) ? "게시했어요. 사이트의 인사교 라이프에 반영됐어요." : "임시저장했어요. 사이트에는 아직 보이지 않아요.";
    }

    @ExceptionHandler({BusinessException.class, NotFoundException.class, CategoryPageService.PageStorageException.class})
    public ResponseEntity<Map<String, String>> error(RuntimeException e) {
        HttpStatus status = e instanceof NotFoundException ? HttpStatus.NOT_FOUND
                : e instanceof CategoryPageService.PageStorageException ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.BAD_REQUEST;
        String text = e.getMessage() == null ? "요청을 처리하지 못했어요." : e.getMessage();
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).body(Map.of("error", text, "message", text));
    }
}
