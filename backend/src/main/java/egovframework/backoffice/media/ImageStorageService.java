package egovframework.backoffice.media;

import egovframework.backoffice.common.BusinessException;
import egovframework.backoffice.config.BackofficeProperties;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * 사진 · 동영상 파일 저장소(지금은 서버의 업로드 폴더 backoffice.upload-dir). 파일은 yyyy/MM/임의이름.확장자 로 저장하고,
 * 그 상대 경로(2026/10/a1b2.webp)가 저장소 안의 위치 = storage_key 다. DB(미디어 표 media)에는 파일이 아니라 이 위치와 이름 · 크기만 적는다.
 * <p>
 * 주소는 앞부분(backoffice.media-base-url, 기본 /uploads/) + storage_key 로 만든다. 게시글의 사진 칸에는 /uploads/{storage_key} 로 적고
 * 백오피스가 /uploads/** 로 폴더의 파일을 보여 준다. 운영에서 클라우드 저장소(S3 · R2 · 오브젝트 스토리지)로 바꿀 때는 이 클래스의
 * 저장 · 삭제만 그 저장소로 바꾸고 앞부분 설정을 저장소 주소로 바꾸면 된다(DB의 storage_key 는 그대로).
 */
@Service
public class ImageStorageService {

    /** 게시글 사진 칸에 적는 주소의 앞부분(저장소 안 위치 앞에 붙임) */
    public static final String UPLOAD_PREFIX = "/uploads/";

    /** 허용 형식(실제 파일 시그니처로 판별) → 확장자 */
    private static final Map<String, String> ALLOWED = Map.of(
            "image/jpeg", "jpg",
            "image/png", "png",
            "image/gif", "gif",
            "image/webp", "webp",
            "video/mp4", "mp4",
            "video/webm", "webm",
            "application/pdf", "pdf");
    /** 확장자 → 형식(폴더에 이미 있는 파일을 미디어로 등록할 때) */
    private static final Map<String, String> BY_EXT = Map.of(
            "jpg", "image/jpeg", "jpeg", "image/jpeg", "png", "image/png", "gif", "image/gif", "webp", "image/webp",
            "mp4", "video/mp4", "webm", "video/webm");
    /** 종류별 용량 한도 */
    public static final long MAX_IMAGE = 10L * 1024 * 1024;
    public static final long MAX_VIDEO = 200L * 1024 * 1024;
    public static final long MAX_DOC = 20L * 1024 * 1024;

    /** 저장한 파일: 주소 · 원래 이름 · 종류(IMAGE · VIDEO · DOC) · 크기 · 저장소 안 위치(storage_key) · 형식 */
    public record Stored(String url, String name, String kind, long size, String key, String contentType) { }

    /** 폴더에 이미 있는 파일(미디어 등록용) */
    public record Existing(String key, String contentType, long size) { }

    private final Path root;
    private final String baseUrl;

    public ImageStorageService(BackofficeProperties properties) {
        this.root = Paths.get(properties.getUploadDir()).toAbsolutePath().normalize();
        String base = properties.getMediaBaseUrl();
        this.baseUrl = base == null || base.isBlank() ? UPLOAD_PREFIX : (base.endsWith("/") ? base : base + "/");
    }

    /** 글쓰기 화면에서 올리는 파일: 사진 · 동영상 · 문서(PDF) */
    public Stored store(MultipartFile file) {
        return save(file, true);
    }

    /** 미디어 관리에서 올리는 파일: 사진 · 동영상만 */
    public Stored storeMedia(MultipartFile file) {
        return save(file, false);
    }

    private Stored save(MultipartFile file, boolean allowDocs) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException("업로드할 파일을 선택하세요.");
        }
        String contentType = detectContentType(file);
        String ext = ALLOWED.get(contentType);
        if (ext == null || (!allowDocs && "pdf".equals(ext))) {
            throw new BusinessException(allowDocs ? "이미지(JPG·PNG·GIF·WEBP), 동영상(MP4·WEBM), 문서(PDF)만 업로드할 수 있습니다."
                    : "이미지(JPG·PNG·GIF·WEBP)와 동영상(MP4·WEBM)만 올릴 수 있어요.");
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
        String key = folder + "/" + storedName;
        return new Stored(url(key), safeName(file.getOriginalFilename()), kind, file.getSize(), key, contentType);
    }

    /** 저장소 안 위치 → 보여 줄 주소(앞부분 설정 + 위치) */
    public String url(String key) {
        return baseUrl + key;
    }

    /** 게시글 사진 칸에 적힌 주소(/uploads/…) → 저장소 안 위치. 업로드 파일이 아니면 null */
    public static String keyOf(String src) {
        return src != null && src.startsWith(UPLOAD_PREFIX) ? src.substring(UPLOAD_PREFIX.length()) : null;
    }

    /** 파일 지우기(미디어를 휴지통에서 완전 삭제할 때). 저장소 밖을 가리키면 아무것도 안 함 */
    public void delete(String key) {
        Path file = root.resolve(key).normalize();
        if (!file.startsWith(root) || file.equals(root)) {
            return;
        }
        try {
            Files.deleteIfExists(file);
        } catch (IOException e) {
            throw new IllegalStateException("파일을 지우지 못했습니다.", e);
        }
    }

    /** 폴더에 이미 있는 사진 · 동영상(처음 켤 때 미디어 표에 등록) */
    public List<Existing> existing() {
        List<Existing> out = new ArrayList<>();
        if (!Files.isDirectory(root)) {
            return out;
        }
        try (Stream<Path> walk = Files.walk(root)) {
            walk.filter(Files::isRegularFile).forEach(p -> {
                String name = p.getFileName().toString();
                int dot = name.lastIndexOf('.');
                String type = dot < 0 ? null : BY_EXT.get(name.substring(dot + 1).toLowerCase(Locale.ROOT));
                if (type == null) {
                    return;
                }
                try {
                    out.add(new Existing(root.relativize(p).toString().replace('\\', '/'), type, Files.size(p)));
                } catch (IOException e) {
                    // 읽지 못한 파일은 건너뜀
                }
            });
        } catch (IOException e) {
            throw new IllegalStateException("업로드 폴더를 읽지 못했습니다.", e);
        }
        return out;
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
