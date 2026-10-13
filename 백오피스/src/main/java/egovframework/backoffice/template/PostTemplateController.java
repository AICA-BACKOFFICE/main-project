package egovframework.backoffice.template;

import egovframework.backoffice.account.CurrentAdmin;
import egovframework.backoffice.common.BusinessException;
import egovframework.backoffice.common.NotFoundException;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 글쓰기 템플릿 JSON API — 글쓰기 화면의 템플릿 패널(static/js/post/templates.js)이 불러오기용으로 호출한다. 관리 화면은 PostTemplatePageController. */
@RestController
@RequestMapping("/admin/templates/api")
public class PostTemplateController {

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final PostTemplateService service;

    public PostTemplateController(PostTemplateService service) {
        this.service = service;
    }

    /** 요청 본문: { name, titleHint, categoryId, blocksJson } */
    public record TemplateRequest(String name, String titleHint, Long categoryId, String blocksJson, String layoutJson) { }

    @GetMapping
    public List<Map<String, Object>> list() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (PostTemplate t : service.findAll()) {
            Map<String, Object> m = summary(t);
            PostTemplateService.CardInfo card = service.cardInfo(t);
            m.put("blockCount", card.blockCount());
            m.put("preview", card.preview());
            m.put("thumbnailUrl", card.thumbnailUrl());
            out.add(m);
        }
        return out;
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable Long id) {
        PostTemplate t = service.get(id);
        Map<String, Object> m = summary(t);
        m.put("blocks", service.blocksOf(t));
        m.put("layoutJson", t.getLayoutJson());
        m.put("layout", service.layoutOf(t).toMap());
        return m;
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody TemplateRequest req, @AuthenticationPrincipal CurrentAdmin me) {
        return summary(service.create(req.name(), req.titleHint(), req.categoryId(), req.blocksJson(), req.layoutJson(), me.getId()));
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable Long id, @RequestBody TemplateRequest req) {
        return summary(service.update(id, req.name(), req.titleHint(), req.categoryId(), req.blocksJson(), req.layoutJson()));
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable Long id) {
        service.delete(id);
        return Map.of("ok", true);
    }

    private Map<String, Object> summary(PostTemplate t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", t.getId());
        m.put("name", t.getName());
        m.put("titleHint", t.getTitleHint());
        m.put("categoryId", t.getCategoryId());
        m.put("categoryName", t.getCategoryName());
        m.put("creatorName", t.getCreatorName());
        m.put("layoutPreset", service.layoutOf(t).getPreset());
        m.put("createdAt", t.getCreatedAt() == null ? null : t.getCreatedAt().format(TIME));
        m.put("updatedAt", t.getUpdatedAt() == null ? null : t.getUpdatedAt().format(TIME));
        return m;
    }

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<Map<String, String>> business(BusinessException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", e.getMessage()));
    }

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<Map<String, String>> notFound(NotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", e.getMessage()));
    }
}
