package egovframework.backoffice.media;

import egovframework.backoffice.common.BusinessException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.multipart.MultipartFile;

/**
 * 글쓰기 화면의 사진 올리기(fetch). 파일만 저장하고 주소를 돌려준다(DB 표 없음).
 *  POST /admin/images   multipart file → {"url":"/uploads/..","name":"..","kind":"IMAGE","size":..}
 */
@Controller
@RequestMapping("/admin/images")
public class ImageController {

    private final ImageStorageService storage;

    public ImageController(ImageStorageService storage) {
        this.storage = storage;
    }

    @PostMapping
    @ResponseBody
    public Map<String, Object> upload(@RequestParam("file") MultipartFile file) {
        ImageStorageService.Stored s = storage.store(file);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("url", s.url());
        m.put("name", s.name());
        m.put("originalName", s.name());
        m.put("kind", s.kind());
        m.put("size", s.size());
        return m;
    }

    @ExceptionHandler(BusinessException.class)
    @ResponseBody
    public ResponseEntity<Map<String, String>> handleBusiness(BusinessException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", e.getMessage()));
    }
}
