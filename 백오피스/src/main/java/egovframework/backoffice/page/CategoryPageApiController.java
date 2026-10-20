package egovframework.backoffice.page;

import static java.nio.charset.StandardCharsets.UTF_8;

import egovframework.backoffice.common.BusinessException;
import egovframework.backoffice.common.NotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 카테고리 페이지 편집 화면(static/js/page/editor.js)이 부르는 저장·반영 API.
 * 페이지는 ?page=about 처럼 고르고, 오류는 { error, message } 로 돌려준다.
 */
@RestController
@RequestMapping("/admin/pages/api")
public class CategoryPageApiController {


    private static final String TEXT = MediaType.TEXT_PLAIN_VALUE + ";charset=UTF-8";

    private final CategoryPageService service;

    public CategoryPageApiController(CategoryPageService service) {
        this.service = service;
    }

    /** 페이지 목록(반영 전 편집이 남아 있는지 포함) */
    @GetMapping("/pages")
    public List<Map<String, Object>> pages(HttpServletRequest request) {
        List<Map<String, Object>> list = new ArrayList<>();
        for (CategoryPage page : service.pages()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", page.id());
            item.put("title", page.title());
            item.put("file", page.file());
            item.put("url", service.siteUrl(request.getContextPath(), page.file()));
            item.put("hasDraft", service.hasDraft(page));
            item.put("ready", service.exists(page));
            list.add(item);
        }
        return list;
    }

    @GetMapping("/state")
    public Map<String, Object> state(@RequestParam String page) {
        return service.state(service.page(page));
    }

    /** 사이트에 반영되어 있는 글(‘현재 사이트 상태로 되돌리기’) */
    @GetMapping(value = "/published", produces = TEXT)
    public String published(@RequestParam String page) {
        return service.published(service.page(page));
    }

    /** 자동 임시저장: 사이트 파일과 같아지면 임시저장본을 지운다. */
    @PutMapping("/draft")
    public Map<String, Object> saveDraft(@RequestParam String page, @RequestParam(required = false) String base,
                                         @RequestBody(required = false) byte[] body) {
        return service.saveDraft(service.page(page), html(body), base);
    }

    @DeleteMapping("/draft")
    public Map<String, Object> discardDraft(@RequestParam String page) {
        return service.discardDraft(service.page(page));
    }

    /** 사이트에 반영: 반영 전 파일은 버전 기록(백업)으로 남는다. */
    @PostMapping("/publish")
    public Map<String, Object> publish(@RequestParam String page, @RequestParam(required = false) String base,
                                       @RequestParam(defaultValue = "false") boolean force, @RequestBody(required = false) byte[] body) {
        return service.publishEdited(service.page(page), html(body), base, force);
    }

    @GetMapping("/backups")
    public List<Map<String, Object>> backups(@RequestParam String page) {
        return service.backups(service.page(page));
    }

    @GetMapping(value = "/backups/{name}", produces = TEXT)
    public String backup(@RequestParam String page, @PathVariable String name) {
        return service.backup(service.page(page), name);
    }

    /** 사이트 안의 그림(그림 바꾸기 창의 목록) */
    @GetMapping("/assets")
    public List<Map<String, Object>> assets(@RequestParam String page) {
        return service.assets(service.page(page));
    }

    /** 그림 올리기: 본문은 파일 그대로, 이름은 ?name= 으로 받는다. 사이트 폴더(assets/uploads)에만 둔다. */
    @PostMapping("/upload")
    public Map<String, String> upload(@RequestParam String page, @RequestParam String name, @RequestBody(required = false) byte[] body) {
        return Map.of("path", service.upload(service.page(page), name, body));
    }

    private static String html(byte[] body) {
        if (body == null || body.length == 0) {
            throw new BusinessException("저장할 내용이 비어 있어요.");
        }
        if (body.length > CategoryPageService.MAX_HTML) {
            throw new BusinessException("페이지가 너무 커서(6MB 초과) 저장하지 않았어요.");
        }
        return new String(body, UTF_8);
    }

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<Map<String, String>> business(BusinessException e) {
        return error(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<Map<String, String>> notFound(NotFoundException e) {
        return error(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler(CategoryPageService.PageConflictException.class)
    public ResponseEntity<Map<String, String>> conflict(CategoryPageService.PageConflictException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("error", e.getMessage(), "message", e.getMessage(), "code", "conflict"));
    }

    @ExceptionHandler(CategoryPageService.PageStorageException.class)
    public ResponseEntity<Map<String, String>> storage(CategoryPageService.PageStorageException e) {
        return error(HttpStatus.INTERNAL_SERVER_ERROR, e.getMessage());
    }

    private static ResponseEntity<Map<String, String>> error(HttpStatus status, String message) {
        String text = message == null ? "요청을 처리하지 못했어요." : message;
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).body(Map.of("error", text, "message", text));
    }
}
