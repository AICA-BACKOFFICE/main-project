package egovframework.backoffice.page;

import static java.nio.charset.StandardCharsets.UTF_8;

import egovframework.backoffice.account.CurrentAdmin;
import egovframework.backoffice.common.BusinessException;
import egovframework.backoffice.common.NotFoundException;
import egovframework.backoffice.media.ImageFile;
import egovframework.backoffice.media.ImageStorageService;
import egovframework.backoffice.media.MediaQuery;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 카테고리 페이지 편집 화면(static/js/page/editor.js)이 부르는 저장·반영 API.
 * 페이지는 ?page=about 처럼 고르고, 오류는 { error, message } 로 돌려준다.
 */
@RestController
@RequestMapping("/admin/pages/api")
public class CategoryPageApiController {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(CategoryPageApiController.class);
    private static final int MEDIA_LIMIT = 300;

    private static final String TEXT = MediaType.TEXT_PLAIN_VALUE + ";charset=UTF-8";

    private final CategoryPageService service;
    private final ImageStorageService media;

    public CategoryPageApiController(CategoryPageService service, ImageStorageService media) {
        this.service = service;
        this.media = media;
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

    /** 그림 올리기: 본문은 파일 그대로, 이름은 ?name= 으로 받는다. 미디어 관리가 받는 그림(JPG · PNG · GIF · WEBP)이면 미디어 관리에도 함께 남긴다. */
    @PostMapping("/upload")
    public Map<String, String> upload(@RequestParam String page, @RequestParam String name, @RequestBody(required = false) byte[] body,
                                      @AuthenticationPrincipal CurrentAdmin me) {
        String path = service.upload(service.page(page), name, body);
        // SVG 아이콘 · AVIF처럼 미디어 관리가 받지 않는 형식은 사이트에만 둔다(AVIF는 동영상으로 잘못 분류되므로 미리 거름).
        // 사이트에는 이미 올라갔으므로 미디어 관리에 남기다 실패해도 올리기는 성공으로 둔다(다시 올려 같은 파일이 쌓이지 않게).
        if (mirrorsToMedia(name, body)) {
            try {
                media.storeBytes(body, name, me == null ? null : me.getId());
            } catch (RuntimeException e) {
                log.warn("사이트 그림을 미디어 관리에도 남기지 못했어요: {} ({})", name, e.getMessage());
            }
        }
        return Map.of("path", path);
    }

    private static final java.util.regex.Pattern MEDIA_IMAGE = java.util.regex.Pattern.compile("(?i).*\\.(jpe?g|png|gif|webp)$");

    /** 미디어 관리에도 남길 그림: 이름이 JPG · PNG · GIF · WEBP 이고 내용이 동영상 상자(ftyp, AVIF · HEIC 등)가 아닌 것 */
    static boolean mirrorsToMedia(String name, byte[] body) {
        boolean ftyp = body != null && body.length > 12 && body[4] == 'f' && body[5] == 't' && body[6] == 'y' && body[7] == 'p';
        return name != null && MEDIA_IMAGE.matcher(name).matches() && !ftyp;
    }

    /** 이미지 바꾸기 창의 '미디어 관리' 목록: 미디어 관리에 올린 그림(최근 것부터) */
    @GetMapping("/media")
    public List<Map<String, Object>> media(HttpServletRequest request) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (ImageFile image : media.search(MediaQuery.of(null, null, false, "IMAGE", null), 1, MEDIA_LIMIT).getItems()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", image.getId());
            item.put("name", image.getDisplayName());
            item.put("url", request.getContextPath() + image.getUrl());
            item.put("size", image.getSizeBytes());
            out.add(item);
        }
        return out;
    }

    /** 미디어 관리의 그림을 이 페이지에서 쓰도록 페이지 폴더(assets/uploads)로 가져온다. */
    @PostMapping("/media-import")
    public Map<String, String> mediaImport(@RequestParam String page, @RequestParam Long id) {
        ImageFile image = media.get(id);
        if (!"IMAGE".equals(image.getKind())) {
            throw new BusinessException("그림만 가져올 수 있어요.");
        }
        String stored = image.getStoredName();
        String ext = stored.substring(stored.lastIndexOf('.') + 1);
        String display = image.getDisplayName() == null ? "image" : image.getDisplayName().replaceAll("\\.[A-Za-z0-9]+$", "");
        try {
            byte[] data = Files.readAllBytes(media.fileOf(image));
            return Map.of("path", service.importImage(service.page(page), display + "." + ext, data));
        } catch (IOException e) {
            throw new CategoryPageService.PageStorageException("미디어 관리의 그림을 읽지 못했어요.", e);
        }
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
