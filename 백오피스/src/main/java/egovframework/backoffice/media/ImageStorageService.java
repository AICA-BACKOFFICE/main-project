package egovframework.backoffice.media;

import egovframework.backoffice.category.Category;
import egovframework.backoffice.category.CategoryService;
import egovframework.backoffice.common.BusinessException;
import egovframework.backoffice.common.NotFoundException;
import egovframework.backoffice.common.PageResult;
import egovframework.backoffice.config.BackofficeProperties;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * 미디어(이미지·동영상·문서) 파일 저장과 분류. 분류는 게시물과 같은 카테고리 2단(categories)을 쓴다.
 * 1차 초안은 로컬 디스크(backoffice.upload-dir)에 yyyy/MM 폴더로 저장하고 /uploads/** 로 서비스한다.
 * 운영에서 오브젝트 스토리지(S3 등)로 바꿀 때 이 클래스만 교체한다.
 */
@Service
public class ImageStorageService {

    /** 허용 형식(실제 파일 시그니처로 판별) → 확장자 */
    private static final Map<String, String> ALLOWED = Map.of(
            "image/jpeg", "jpg",
            "image/png", "png",
            "image/gif", "gif",
            "image/webp", "webp",
            "video/mp4", "mp4",
            "video/webm", "webm",
            "application/pdf", "pdf");
    /** 종류별 용량 한도 */
    public static final long MAX_IMAGE = 10L * 1024 * 1024;
    public static final long MAX_VIDEO = 200L * 1024 * 1024;
    public static final long MAX_DOC = 20L * 1024 * 1024;

    private final ImageMapper mapper;
    private final CategoryService categories;
    private final Path root;

    public ImageStorageService(ImageMapper mapper, CategoryService categories, BackofficeProperties properties) {
        this.mapper = mapper;
        this.categories = categories;
        this.root = Paths.get(properties.getUploadDir()).toAbsolutePath().normalize();
    }

    @Transactional
    public ImageFile store(MultipartFile file, Long uploaderId) {
        return store(file, uploaderId, null, null);
    }

    /** 카테고리·세부 카테고리를 지정해 저장한다. 세부가 카테고리의 하위가 아니면 세부는 버린다. */
    @Transactional
    public ImageFile store(MultipartFile file, Long uploaderId, Long categoryId, Long subCategoryId) {
        if (categoryId != null) {
            categories.get(categoryId);   // 없는 카테고리면 404
        }
        Long sub = categories.validSubCategory(categoryId, subCategoryId);
        if (file == null || file.isEmpty()) {
            throw new BusinessException("업로드할 파일을 선택하세요.");
        }
        String contentType = detectContentType(file);
        String ext = ALLOWED.get(contentType);
        if (ext == null) {
            throw new BusinessException("이미지(JPG·PNG·GIF·WEBP), 동영상(MP4·WEBM), 문서(PDF)만 업로드할 수 있습니다.");
        }
        String kind = kindOf(contentType);
        long max = switch (kind) { case "VIDEO" -> MAX_VIDEO; case "DOC" -> MAX_DOC; default -> MAX_IMAGE; };
        if (file.getSize() > max) {
            throw new BusinessException(kindLabel(kind) + "은(는) " + (max / 1024 / 1024) + "MB 이하만 업로드할 수 있습니다.");
        }
        String folder = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy/MM"));
        String storedName = UUID.randomUUID().toString().replace("-", "") + "." + ext;
        Path dir = root.resolve(folder);
        try {
            Files.createDirectories(dir);
            try (InputStream in = file.getInputStream()) {
                Files.copy(in, dir.resolve(storedName), StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw new IllegalStateException("파일 저장에 실패했습니다.", e);
        }
        ImageFile image = new ImageFile();
        image.setKind(kind);
        image.setStoredName(folder + "/" + storedName);
        image.setOriginalName(safeName(file.getOriginalFilename()));
        image.setDisplayName(image.getOriginalName());
        image.setContentType(contentType);
        image.setSizeBytes(file.getSize());
        image.setUrl("/uploads/" + folder + "/" + storedName);
        image.setUploadedBy(uploaderId);
        image.setCategoryId(categoryId);
        image.setSubCategoryId(sub);
        mapper.insert(image);
        return mapper.findById(image.getId());
    }

    public List<ImageFile> recent(int limit) {
        return mapper.findRecent(limit);
    }

    /** 관리 화면·보관함 선택창 목록 */
    public PageResult<ImageFile> search(MediaQuery q, int page, int size) {
        List<ImageFile> items = mapper.search(q, size, PageResult.offset(page, size));
        long total = mapper.count(q);
        return new PageResult<>(items, page, size, total);
    }

    public long countUnfiled() {
        return mapper.countUnfiled();
    }

    public long countAll() {
        return mapper.count(MediaQuery.of(null, null, false, null, null));
    }

    public long countByKind(String kind) {
        return mapper.countByKind(kind);
    }

    public long totalBytes() {
        return mapper.sumSizeBytes();
    }

    /** 카테고리 트리(활성) + 각 노드의 미디어 건수 — 탭 표시용. 1단 건수는 세부 포함 전체 */
    public List<Category> categoryTreeWithCounts() {
        Map<Long, Long> byCat = new HashMap<>();
        mapper.countByCategory().forEach(r -> byCat.put(r.getId(), r.getCnt()));
        Map<Long, Long> bySub = new HashMap<>();
        mapper.countBySubCategory().forEach(r -> bySub.put(r.getId(), r.getCnt()));
        List<Category> tree = categories.tree();
        for (Category c : tree) {
            c.setPostCount(byCat.getOrDefault(c.getId(), 0L));
            for (Category s : c.getChildren()) {
                s.setPostCount(bySub.getOrDefault(s.getId(), 0L));
            }
        }
        return tree;
    }

    public ImageFile get(Long id) {
        ImageFile image = mapper.findById(id);
        if (image == null) {
            throw new NotFoundException("파일을 찾을 수 없습니다.");
        }
        return image;
    }

    /** 분류 이동. categoryId 가 null 이면 미분류로 */
    @Transactional
    public void move(Long id, Long categoryId, Long subCategoryId) {
        get(id);
        if (categoryId != null) {
            categories.get(categoryId);
        }
        mapper.updateCategory(id, categoryId, categories.validSubCategory(categoryId, subCategoryId));
    }

    /** 표시 이름 변경. 저장 파일명과 URL 은 그대로라 글 본문의 참조가 깨지지 않는다. */
    @Transactional
    public void rename(Long id, String displayName) {
        get(id);
        String n = displayName == null ? "" : displayName.trim();
        if (n.isEmpty()) {
            throw new BusinessException("표시 이름을 입력하세요.");
        }
        if (n.length() > 255) {
            n = n.substring(0, 255);
        }
        mapper.updateDisplayName(id, n);
    }

    /** 완전 삭제: DB 행과 디스크 파일을 함께 지운다. 글 본문에서 참조 중이면 그 글에서 깨진다. */
    @Transactional
    public void delete(Long id) {
        ImageFile image = get(id);
        mapper.delete(id);
        Path file = root.resolve(image.getStoredName()).normalize();
        if (!file.startsWith(root)) {
            return;
        }
        try {
            Files.deleteIfExists(file);
        } catch (IOException e) {
            throw new IllegalStateException("파일을 삭제하지 못했습니다.", e);
        }
    }

    public static String kindOf(String contentType) {
        if (contentType.startsWith("video/")) {
            return "VIDEO";
        }
        if ("application/pdf".equals(contentType)) {
            return "DOC";
        }
        return "IMAGE";
    }

    public static String kindLabel(String kind) {
        return switch (kind) { case "VIDEO" -> "동영상"; case "DOC" -> "문서"; default -> "이미지"; };
    }

    /** 파일 시그니처(매직 넘버)로 실제 형식을 판별한다. 확장자·브라우저가 보낸 Content-Type 은 믿지 않는다. */
    private static String detectContentType(MultipartFile file) {
        try (InputStream in = file.getInputStream()) {
            byte[] head = in.readNBytes(12);
            if (head.length >= 8 && head[4] == 'f' && head[5] == 't' && head[6] == 'y' && head[7] == 'p') {
                return "video/mp4";      // ISO BMFF (mp4 · m4v · mov 계열)
            }
            if (head.length >= 4 && (head[0] & 0xFF) == 0x1A && (head[1] & 0xFF) == 0x45 && (head[2] & 0xFF) == 0xDF && (head[3] & 0xFF) == 0xA3) {
                return "video/webm";     // Matroska/WebM
            }
            if (head.length >= 5 && head[0] == '%' && head[1] == 'P' && head[2] == 'D' && head[3] == 'F') {
                return "application/pdf";
            }
            if (head.length >= 3 && (head[0] & 0xFF) == 0xFF && (head[1] & 0xFF) == 0xD8) {
                return "image/jpeg";
            }
            if (head.length >= 8 && (head[0] & 0xFF) == 0x89 && head[1] == 'P' && head[2] == 'N' && head[3] == 'G') {
                return "image/png";
            }
            if (head.length >= 6 && head[0] == 'G' && head[1] == 'I' && head[2] == 'F') {
                return "image/gif";
            }
            if (head.length >= 12 && head[0] == 'R' && head[1] == 'I' && head[2] == 'F' && head[3] == 'F'
                    && head[8] == 'W' && head[9] == 'E' && head[10] == 'B' && head[11] == 'P') {
                return "image/webp";
            }
        } catch (IOException e) {
            throw new IllegalStateException("파일을 읽을 수 없습니다.", e);
        }
        return "unknown";
    }

    private static String safeName(String name) {
        if (name == null || name.isBlank()) {
            return "file";
        }
        String base = Paths.get(name).getFileName().toString();
        return base.length() > 255 ? base.substring(base.length() - 255) : base;
    }
}
