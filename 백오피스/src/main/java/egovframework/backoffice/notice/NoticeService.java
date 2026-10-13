package egovframework.backoffice.notice;

import egovframework.backoffice.common.BusinessException;
import egovframework.backoffice.common.NotFoundException;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 운영진 공지. 정책: 최고관리자만 작성·수정·삭제, 로그인한 운영진 전체에게 상단 띠로 표시(게임 공지처럼),
 * 읽음(닫기)은 개인별 — 고정(pinned) 공지는 닫을 수 없다.
 */
@Service
@Transactional
public class NoticeService {

    private final NoticeMapper mapper;

    public NoticeService(NoticeMapper mapper) {
        this.mapper = mapper;
    }

    @Transactional(readOnly = true)
    public List<Notice> findAll() {
        return mapper.findAll();
    }

    /** 레이아웃 상단 띠에 보여 줄 공지 */
    @Transactional(readOnly = true)
    public List<Notice> visibleFor(Long adminId) {
        return adminId == null ? List.of() : mapper.findVisibleFor(adminId);
    }

    @Transactional(readOnly = true)
    public Notice get(Long id) {
        Notice n = mapper.findById(id);
        if (n == null) {
            throw new NotFoundException("공지를 찾을 수 없습니다.");
        }
        return n;
    }

    public Notice create(NoticeForm form, Long adminId) {
        Notice n = new Notice();
        apply(n, form);
        n.setCreatedBy(adminId);
        mapper.insert(n);
        return get(n.getId());
    }

    /** 수정하면 내용이 바뀐 것이므로 닫았던 사람에게도 다시 보인다 */
    public void update(Long id, NoticeForm form) {
        Notice n = get(id);
        apply(n, form);
        mapper.update(n);
        mapper.clearDismissals(id);
    }

    public void setActive(Long id, boolean active) {
        get(id);
        mapper.setActive(id, active);
    }

    public void delete(Long id) {
        get(id);
        mapper.delete(id);
    }

    /** 개인별 닫기. 고정 공지는 무시된다 */
    public void dismiss(Long noticeId, Long adminId) {
        Notice n = get(noticeId);
        if (n.isPinned()) {
            return;
        }
        mapper.deleteDismissal(noticeId, adminId);
        mapper.insertDismissal(noticeId, adminId);
    }

    private static void apply(Notice n, NoticeForm f) {
        String title = f.getTitle() == null ? "" : f.getTitle().trim();
        if (title.isEmpty()) {
            throw new BusinessException("공지 제목을 입력하세요.");
        }
        if (title.length() > 200) {
            throw new BusinessException("제목은 200자 이내입니다.");
        }
        String body = f.getBody() == null ? null : f.getBody().trim();
        if (body != null && body.length() > 2000) {
            throw new BusinessException("내용은 2000자 이내입니다.");
        }
        if (f.getStartsAt() != null && f.getEndsAt() != null && !f.getEndsAt().isAfter(f.getStartsAt())) {
            throw new BusinessException("종료 시각은 시작 시각 뒤여야 합니다.");
        }
        n.setTitle(title);
        n.setBody(body == null || body.isEmpty() ? null : body);
        n.setLevel(List.of("INFO", "WARN", "URGENT").contains(f.getLevel()) ? f.getLevel() : "INFO");
        n.setPinned(f.isPinned());
        n.setActive(f.isActive());
        n.setStartsAt(f.getStartsAt());
        n.setEndsAt(f.getEndsAt());
    }
}
