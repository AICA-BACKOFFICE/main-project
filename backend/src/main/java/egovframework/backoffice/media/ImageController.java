package egovframework.backoffice.media;

import egovframework.backoffice.account.CurrentAdmin;
import egovframework.backoffice.common.BusinessException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.multipart.MultipartFile;

/**
 * 글쓰기 화면의 사진 올리기(fetch). 파일을 저장소에 저장하고 주소를 돌려준다. 사진 · 동영상은 미디어 표(media)에도 남아
 * 미디어 관리 · '미디어에서 고르기'에서 다른 사람도 쓸 수 있다(문서 PDF 는 남기지 않음).
 *  POST /admin/images   multipart file → {"url":"/uploads/..","name":"..","kind":"IMAGE","size":..,"mediaId":..}
 */
@Controller
@RequestMapping("/admin/images")
public class ImageController {

    private final ImageStorageService storage;
    private final MediaService media;

    public ImageController(ImageStorageService storage, MediaService media) {
        this.storage = storage;
        this.media = media;
    }

    @PostMapping
    @ResponseBody
    public Map<String, Object> upload(@RequestParam("file") MultipartFile file, @AuthenticationPrincipal CurrentAdmin me) {
        ImageStorageService.Stored s = storage.store(file);
        MediaItem item = media.record(s, me);
        Map<String, Object> m = new LinkedHashMap<>();
        // 게시글 사진 칸에는 /uploads/{저장소 안 위치} 로 적는다(저장소를 옮겨도 글은 그대로)
        m.put("url", ImageStorageService.UPLOAD_PREFIX + s.key());
        m.put("name", s.name());
        m.put("originalName", s.name());
        m.put("kind", s.kind());
        m.put("size", s.size());
        m.put("mediaId", item == null ? null : item.getId());
        return m;
    }

    @ExceptionHandler(BusinessException.class)
    @ResponseBody
    public ResponseEntity<Map<String, String>> handleBusiness(BusinessException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", e.getMessage()));
    }
}
