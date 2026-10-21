package egovframework.backoffice.media;

import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

/** 미디어 하나(표 media, V25): 함께 쓰는 사진 · 동영상의 정보. 파일은 저장소의 storageKey 위치에 있다 */
@Getter
@Setter
public class MediaItem {
    private Long id;
    /** IMAGE · VIDEO */
    private String mediaType;
    /** 미디어 이름(바꿀 수 있음) */
    private String name;
    private String originalName;
    /** 저장소 안 위치(2026/10/a1b2.webp) */
    private String storageKey;
    private String contentType;
    private long fileSize;
    private Long uploadedBy;
    /** 올린 사람 이름(목록 조회 때 admin_users 와 이어서) */
    private String uploaderName;
    /** ACTIVE · DELETED */
    private String status;
    private LocalDateTime deletedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // 화면용(표 칸 아님)
    /** 보여 줄 주소(설정의 앞부분 + storageKey) */
    private String url;
    /** 게시글 사진 칸에 적는 주소(/uploads/{storageKey}) */
    private String postSrc;
    /** 이 미디어를 쓰는 게시글 수 */
    private long usage;
    /** 지금 보는 사람이 이름 바꾸기 · 삭제를 할 수 있는지 */
    private boolean editable;

    public boolean isImage() {
        return "IMAGE".equals(mediaType);
    }

    public boolean isVideo() {
        return "VIDEO".equals(mediaType);
    }

    public String getTypeLabel() {
        return isVideo() ? "동영상" : "이미지";
    }

    /** 1.2 MB · 340 KB */
    public String getSizeLabel() {
        if (fileSize >= 1024 * 1024) {
            return String.format("%.1f MB", fileSize / 1024.0 / 1024.0);
        }
        return Math.max(1, Math.round(fileSize / 1024.0)) + " KB";
    }
}
