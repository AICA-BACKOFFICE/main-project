package egovframework.backoffice.notice;

import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

/** 운영진 공지(상단 띠). 최고관리자만 작성하고 로그인한 운영진 전체에게 보인다. */
@Getter
@Setter
public class Notice {
    private Long id;
    private String title;
    private String body;
    /** INFO | WARN | URGENT */
    private String level;
    /** TRUE 면 개인이 닫을 수 없다(항상 표시) */
    private boolean pinned;
    private boolean active;
    private LocalDateTime startsAt;
    private LocalDateTime endsAt;
    private Long createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // 조인
    private String creatorName;
    /** 전체 운영진 중 닫은 사람 수 */
    private long dismissCount;

    public String getLevelLabel() {
        return switch (level == null ? "INFO" : level) { case "URGENT" -> "긴급"; case "WARN" -> "주의"; default -> "안내"; };
    }

    public String getLevelCss() {
        return (level == null ? "info" : level).toLowerCase();
    }

    /** 지금 표시 중인지(활성 + 기간 안) */
    public boolean isLive() {
        LocalDateTime now = LocalDateTime.now();
        return active && (startsAt == null || !startsAt.isAfter(now)) && (endsAt == null || endsAt.isAfter(now));
    }
}
