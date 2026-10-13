package egovframework.backoffice.notice;

import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;
import org.springframework.format.annotation.DateTimeFormat;

@Getter
@Setter
public class NoticeForm {
    private Long id;
    private String title;
    private String body;
    private String level = "INFO";
    private boolean pinned;
    private boolean active = true;
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
    private LocalDateTime startsAt;
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
    private LocalDateTime endsAt;

    public static NoticeForm from(Notice n) {
        NoticeForm f = new NoticeForm();
        f.setId(n.getId());
        f.setTitle(n.getTitle());
        f.setBody(n.getBody());
        f.setLevel(n.getLevel());
        f.setPinned(n.isPinned());
        f.setActive(n.isActive());
        f.setStartsAt(n.getStartsAt());
        f.setEndsAt(n.getEndsAt());
        return f;
    }
}
