package egovframework.backoffice.common;

import egovframework.backoffice.account.CurrentAdmin;
import egovframework.backoffice.config.BackofficeProperties;
import egovframework.backoffice.page.CategoryPageService;
import egovframework.backoffice.post.PostStore;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * 왼쪽 메뉴 · 목록의 작은 표시(2026-10-20). 화면(Thymeleaf)이 ${@nav.…} 로 부른다.
 * <ul>
 *   <li>임시저장 개수: 관리자 이상은 모든 임시저장 글 · 질문, 서포터즈는 자기가 쓴 글만</li>
 *   <li>NEW: 최근 {@link #NEW_FOR}(24시간) 안에 글이 새로 생기거나 고쳐진 메뉴 · 새로 생긴 글. 시간이 지나면 저절로 사라진다</li>
 * </ul>
 */
@Component("nav")
public class NavBadges {

    /** NEW 를 보여 주는 시간 */
    public static final Duration NEW_FOR = Duration.ofHours(24);

    private final NavMapper mapper;
    private final PostStore posts;
    private final CategoryPageService pages;
    private final BackofficeProperties properties;

    public NavBadges(NavMapper mapper, PostStore posts, CategoryPageService pages, BackofficeProperties properties) {
        this.mapper = mapper;
        this.posts = posts;
        this.pages = pages;
        this.properties = properties;
    }

    /** 이 시각 뒤에 생기거나 고쳐졌으면 NEW */
    public LocalDateTime since() {
        return LocalDateTime.now().minus(NEW_FOR);
    }

    /** 이 시각이 NEW 기간 안인지 */
    public boolean isNew(LocalDateTime at) {
        return at != null && at.isAfter(since());
    }

    /** 왼쪽 메뉴 '임시저장' 옆 개수 */
    public long drafts(CurrentAdmin me) {
        if (me == null) {
            return 0;
        }
        boolean manager = me.getRole().canManageContent();
        return posts.draftCounts(manager ? null : me.getId(), manager).values().stream().mapToLong(Long::longValue).sum();
    }

    /**
     * 메뉴별 NEW: review · interview · project · cohort(선배들의 이야기 각 종류) · posts(넷 중 하나라도) · faq · media ·
     * page-{id}(카테고리 페이지 관리 — 사이트에 반영한 시각) · life-photos(인사교 라이프 게시물 관리 — 라이프 페이지 반영)
     */
    public Map<String, Boolean> fresh() {
        LocalDateTime since = since();
        Map<String, Boolean> out = new LinkedHashMap<>();
        for (Map<String, Object> row : mapper.lastChanges()) {
            LocalDateTime at = time(row.get("at"));
            out.put(String.valueOf(row.get("kind")), at != null && at.isAfter(since));
        }
        out.put("posts", Boolean.TRUE.equals(out.get("review")) || Boolean.TRUE.equals(out.get("interview")) || Boolean.TRUE.equals(out.get("project"))
                || Boolean.TRUE.equals(out.get("cohort")));
        for (BackofficeProperties.Item item : properties.getPages().getItems()) {
            if (item.getParent() == null) {
                LocalDateTime at = pages.lastPublished(pages.page(item.getId()));
                out.put("page-" + item.getId(), at != null && at.isAfter(since));
            }
        }
        out.put("life-photos", Boolean.TRUE.equals(out.get("page-life")));
        return out;
    }

    private static LocalDateTime time(Object value) {
        if (value instanceof LocalDateTime t) {
            return t;
        }
        if (value instanceof Timestamp t) {
            return t.toLocalDateTime();
        }
        if (value instanceof java.time.OffsetDateTime t) {
            return t.toLocalDateTime();
        }
        return null;
    }
}
