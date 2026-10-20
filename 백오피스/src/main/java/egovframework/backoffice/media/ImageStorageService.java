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
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * 글에 넣는 사진 · 파일 저장. 2026-10-20부터 DB 표 없이 파일로만 둔다(미디어 관리 메뉴 없음):
 * 업로드 폴더(backoffice.upload-dir)에 yyyy/MM 폴더로 저장하고 /uploads/** 로 보여 준다. 글은 그 주소를 사진 칸(photos)에 적는다.
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

    /** 저장한 파일: 주소(/uploads/…) · 원래 이름 · 종류(IMAGE · VIDEO · DOC) · 크기 */
    public record Stored(String url, String name, String kind, long size) { }

    private final Path root;

    public ImageStorageService(BackofficeProperties properties) {
        this.root = Paths.get(properties.getUploadDir()).toAbsolutePath().normalize();
    }

    public Stored store(MultipartFile file) {
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
        return new Stored("/uploads/" + folder + "/" + storedName, safeName(file.getOriginalFilename()), kind, file.getSize());
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
