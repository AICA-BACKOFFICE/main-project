package egovframework.backoffice.page;

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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseBody;

/**
 * 게시물 관리 › 지원 전 Check FAQ 관리(/admin/faq — 지원 전 체크의 자주 묻는 질문). 화면은 static/js/page/faq.js 가 그리고,
 * 저장은 {@link CheckFaqService} 가 사이트의 check/index.html 질문 목록만 고쳐 반영한다. 관리자 이상(SecurityConfig).
 */
@Controller
public class CheckFaqController {

    private final CheckFaqService service;
    private final BackofficeProperties properties;

    public CheckFaqController(CheckFaqService service, BackofficeProperties properties) {
        this.service = service;
        this.properties = properties;
    }

    @GetMapping("/admin/faq")
    public String view(Model model, HttpServletRequest request) {
        String front = properties.getPages().getFrontUrl();
        model.addAttribute("menu", "faq");
        model.addAttribute("frontLink", (front == null || front.isBlank() ? request.getContextPath() + "/admin/pages/site/" : front.trim().replaceAll("/*$", "/"))
                + "check/index.html#faq");
        return "faq/index";
    }

    @GetMapping("/admin/pages/faq/api")
    @ResponseBody
    public Map<String, Object> model() {
        return service.model();
    }

    @PostMapping("/admin/pages/faq/api")
    @ResponseBody
    public Map<String, Object> save(@RequestBody CheckFaqService.SaveRequest body) {
        return service.save(body);
    }

    /** 질문 하나를 휴지통으로(임시저장 목록의 '삭제') → back(관리 화면 주소)으로 */
    @PostMapping("/admin/faq/{id:[0-9]+}/delete")
    public String delete(@PathVariable Long id, @RequestParam(name = "back", required = false) String back, RedirectAttributes redirect) {
        service.moveToTrash(id);
        redirect.addFlashAttribute("toast", "질문을 휴지통으로 옮겼어요. 휴지통 › FAQ에서 복원할 수 있어요.");
        return "redirect:" + egovframework.backoffice.common.BackPath.or(back, "/admin/faq");
    }

    @ExceptionHandler({BusinessException.class, NotFoundException.class, CategoryPageService.PageStorageException.class})
    public ResponseEntity<Map<String, String>> error(RuntimeException e) {
        HttpStatus status = e instanceof NotFoundException ? HttpStatus.NOT_FOUND
                : e instanceof CategoryPageService.PageStorageException ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.BAD_REQUEST;
        String text = e.getMessage() == null ? "요청을 처리하지 못했어요." : e.getMessage();
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).body(Map.of("error", text, "message", text));
    }
}
