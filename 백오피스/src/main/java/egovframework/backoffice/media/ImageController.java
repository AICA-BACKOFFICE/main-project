package egovframework.backoffice.media;

import egovframework.backoffice.account.CurrentAdmin;
import egovframework.backoffice.category.Category;
import egovframework.backoffice.common.BusinessException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.multipart.MultipartFile;

/**
 * 에디터·미디어 관리가 fetch 로 호출하는 JSON API.
 *  POST /admin/images?categoryId=&subCategoryId=   업로드(분류는 선택)
 *  GET  /admin/images/recent        보관함 선택창 목록 — categoryId / subCategoryId / unfiled=true / kind(IMAGE 기본|VIDEO|DOC|ALL)
 *  GET  /admin/images/categories    분류 트리(건수 포함) + 전체·미분류 건수
 */
@Controller
@RequestMapping("/admin/images")
public class ImageController {

    private static final int PICKER_MAX = 200;

    private final ImageStorageService storage;

    public ImageController(ImageStorageService storage) {
        this.storage = storage;
    }

    /** multipart 업로드 → {"id":..,"url":"/uploads/..","name":"..","kind":..} */
    @PostMapping
    @ResponseBody
    public Map<String, Object> upload(@RequestParam("file") MultipartFile file,
                                      @RequestParam(required = false) Long categoryId,
                                      @RequestParam(required = false) Long subCategoryId,
                                      @AuthenticationPrincipal CurrentAdmin me) {
        return json(storage.store(file, me.getId(), categoryId, subCategoryId));
    }

    @GetMapping("/recent")
    @ResponseBody
    public List<Map<String, Object>> recent(@RequestParam(required = false) Long categoryId,
                                            @RequestParam(required = false) Long subCategoryId,
                                            @RequestParam(defaultValue = "false") boolean unfiled,
                                            @RequestParam(defaultValue = "IMAGE") String kind,
                                            @RequestParam(defaultValue = "60") int limit) {
        int n = Math.max(1, Math.min(limit, PICKER_MAX));
        // 에디터 보관함은 기본적으로 이미지만 보여 준다(kind=ALL 이면 전체)
        return storage.search(MediaQuery.of(categoryId, subCategoryId, unfiled, kind, null), 1, n)
                .getItems().stream().map(ImageController::json).toList();
    }

    @GetMapping("/categories")
    @ResponseBody
    public Map<String, Object> categories() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", storage.countAll());
        out.put("unfiled", storage.countUnfiled());
        out.put("categories", storage.categoryTreeWithCounts().stream().map(ImageController::categoryJson).toList());
        return out;
    }

    private static Map<String, Object> categoryJson(Category c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("name", c.getName());
        m.put("count", c.getPostCount());
        m.put("children", c.getChildren().stream().map(ImageController::categoryJson).toList());
        return m;
    }

    private static Map<String, Object> json(ImageFile i) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", i.getId());
        m.put("url", i.getUrl());
        m.put("name", i.getLabel());
        m.put("originalName", i.getOriginalName());
        m.put("kind", i.getKind());
        m.put("size", i.getSizeBytes());
        m.put("categoryId", i.getCategoryId());
        m.put("subCategoryId", i.getSubCategoryId());
        m.put("categoryPath", i.getCategoryPath());
        return m;
    }

    @ExceptionHandler(BusinessException.class)
    @ResponseBody
    public ResponseEntity<Map<String, String>> handleBusiness(BusinessException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", e.getMessage()));
    }
}
