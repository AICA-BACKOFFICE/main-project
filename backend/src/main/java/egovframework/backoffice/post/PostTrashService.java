package egovframework.backoffice.post;

import egovframework.backoffice.common.NotFoundException;
import egovframework.backoffice.common.BusinessException;
import egovframework.backoffice.common.PageResult;
import egovframework.backoffice.media.MediaItem;
import egovframework.backoffice.media.MediaService;
import egovframework.backoffice.page.CheckFaqService;
import egovframework.backoffice.page.FaqItem;
import egovframework.backoffice.page.LifeBoardService;
import egovframework.backoffice.page.LifeItem;
import egovframework.backoffice.post.story.StoryChangedEvent;
import egovframework.backoffice.post.story.StoryKind;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.LinkedHashSet;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * 휴지통: 이동(soft delete) · 목록 · 복원 · 완전 삭제. 후기 · 인터뷰 · 프로젝트 글과 함께 자주 묻는 질문(faqs 표, 2026-10-20 V24)과
 * 미디어(media 표, V25)도 같은 휴지통에 보인다(선택 값 "faq-번호" · "media-번호"). 질문 · 미디어를 휴지통으로 옮기는 것은
 * FAQ 관리(CheckFaqService) · 미디어 관리(MediaService)가 한다. 목록 · 비우기는 종류(kind)를 골라 그 종류만 볼 수도 있다.
 */
@Service
@Transactional
public class PostTrashService {

    private static final String FAQ_PREFIX = PostStore.FAQ_KIND + "-";
    private static final String MEDIA_PREFIX = PostStore.MEDIA_KIND + "-";
    /** 휴지통에서 고를 수 있는 종류(화면 칩 순서) → 이름 */
    public static final java.util.Map<String, String> KINDS;

    static {
        java.util.Map<String, String> kinds = new java.util.LinkedHashMap<>();
        kinds.put(StoryKind.REVIEW.slug(), "후기");
        kinds.put(StoryKind.INTERVIEW.slug(), "인터뷰");
        kinds.put(StoryKind.PROJECT.slug(), "프로젝트");
        kinds.put(StoryKind.COHORT.slug(), "기수별 이모저모");
        kinds.put(PostStore.FAQ_KIND, "FAQ");
        kinds.put(PostStore.MEDIA_KIND, "미디어");
        kinds.put(LifeBoardService.KIND, "인사교 라이프");   // 시설 사진 · 오늘 점심 · 바람 쐬러 가요 카드(V29)
        KINDS = java.util.Collections.unmodifiableMap(kinds);
    }

    private final PostStore mapper;
    private final PostService posts;
    private final ApplicationEventPublisher events;
    private final CheckFaqService faqs;
    private final MediaService media;
    private final LifeBoardService life;

    public PostTrashService(PostStore mapper, PostService posts, ApplicationEventPublisher events, CheckFaqService faqs, MediaService media,
                            LifeBoardService life) {
        this.mapper = mapper;
        this.posts = posts;
        this.events = events;
        this.faqs = faqs;
        this.media = media;
        this.life = life;
    }

    /** 화면에서 받은 종류: 고를 수 있는 종류면 그대로, 아니면(전체 · 모르는 값) null */
    public static String kind(String value) {
        return value != null && KINDS.containsKey(value) ? value : null;
    }

    /**
     * 휴지통으로 이동. 이동 직전 상태를 status_before_trash 에 남기고 상태를 삭제됨(DELETED)으로, 옮긴 시각을 deleted_at 에 적는다 —
     * 게시중이던 글은 그 즉시 공개가 중단된다(선배들의 이야기 글은 사이트에서도 바로 내려간다).
     */
    public void moveToTrash(StoryKind kind, Long id) {
        posts.get(kind, id);
        mapper.softDelete(kind, id);
        events.publishEvent(new StoryChangedEvent(id));
    }

    /** 휴지통 목록. kind 가 있으면 그 종류(후기 · 인터뷰 · 프로젝트 · FAQ · 미디어)만 */
    @Transactional(readOnly = true)
    public PageResult<Post> search(PostSearch search, String kind) {
        List<Post> items = mapper.findTrash(search, kind);
        long total = mapper.countTrash(search, kind);
        return new PageResult<>(items, search.getPage(), search.getSize(), total);
    }

    /** 종류별 휴지통 개수(없는 종류는 0) */
    @Transactional(readOnly = true)
    public java.util.Map<String, Long> counts() {
        java.util.Map<String, Long> found = mapper.trashCounts();
        java.util.Map<String, Long> out = new java.util.LinkedHashMap<>();
        KINDS.keySet().forEach(k -> out.put(k, found.getOrDefault(k, 0L)));
        return out;
    }

    @Transactional(readOnly = true)
    public Post getDeleted(StoryKind kind, Long id) {
        Post post = mapper.findDeletedById(kind, id);
        if (post == null) {
            throw new NotFoundException("휴지통에서 게시물을 찾을 수 없습니다.");
        }
        return post;
    }

    public record TrashSnapshot(long count, String token) {}

    private TrashSnapshot snapshot(List<Post> rows) {
        String state = rows.stream().map(p -> p.getKind() + "-" + p.getId() + ":" + p.getDeletedAt()).collect(Collectors.joining("|"));
        try {
            return new TrashSnapshot(rows.size(), HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(state.getBytes(StandardCharsets.UTF_8))));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** 비우기 전 확인용: 휴지통(kind 가 있으면 그 종류)의 개수와 지문 */
    @Transactional(readOnly = true)
    public TrashSnapshot overview(String kind) {
        return snapshot(mapper.findAllDeleted(kind));
    }

    @PreAuthorize("hasAnyRole('SUPER_ADMIN','ADMIN') and (#action != 'purge' or hasRole('SUPER_ADMIN'))")
    /** 선택한 글(값은 "종류-번호", 예: project-1)을 한꺼번에 복원 · 완전 삭제 */
    public int bulk(List<String> requested, String action) {
        if (!List.of("restore", "purge").contains(action)) throw new BusinessException("작업을 확인해 주세요.");
        if (requested == null || requested.isEmpty() || requested.size() > 100) {
            throw new BusinessException("현재 페이지에서 게시물을 선택해 주세요.");
        }
        List<String> unique = List.copyOf(new LinkedHashSet<>(requested));
        // 자주 묻는 질문("faq-번호") · 미디어("media-번호") · 인사교 라이프("life-food-번호" 등)와 글("종류-번호")을 나눠 잠근다
        List<Long> faqIds = unique.stream().filter(v -> v != null && v.startsWith(FAQ_PREFIX)).map(v -> idAfter(v, FAQ_PREFIX)).toList();
        List<Long> mediaIds = unique.stream().filter(v -> v != null && v.startsWith(MEDIA_PREFIX)).map(v -> idAfter(v, MEDIA_PREFIX)).toList();
        List<LifeBoardService.Key> lifeKeys = unique.stream().filter(v -> v != null && v.startsWith(LifeBoardService.KIND_PREFIX)).map(v -> {
            LifeBoardService.Key key = LifeBoardService.Key.parse(v);
            if (key == null) {
                throw new BusinessException("현재 페이지에서 게시물을 선택해 주세요.");
            }
            return key;
        }).toList();
        List<PostKey> keys = unique.stream().filter(v -> v == null || (!v.startsWith(FAQ_PREFIX) && !v.startsWith(MEDIA_PREFIX)
                        && !v.startsWith(LifeBoardService.KIND_PREFIX)))
                .map(PostKey::parse).toList();
        List<Post> locked = keys.isEmpty() ? List.of() : mapper.lockDeleted(keys);
        List<FaqItem> lockedFaqs = faqs.lockDeleted(faqIds);
        List<MediaItem> lockedMedia = media.lockDeleted(mediaIds);
        List<LifeBoardService.Locked> lockedLife = life.lockDeleted(lifeKeys);
        if (locked.size() + lockedFaqs.size() + lockedMedia.size() + lockedLife.size() != unique.size()) {
            throw new BusinessException("휴지통 목록이 변경되었습니다. 새로고침 후 다시 선택해 주세요.");
        }
        boolean restore = "restore".equals(action);
        for (Post post : locked) {
            if (restore) mapper.restore(kindOf(post), post.getId());
            else purgeLocked(post);
        }
        for (FaqItem faq : lockedFaqs) {
            if (restore) faqs.restoreLocked(faq.getId());
            else faqs.purgeLocked(faq.getId());
        }
        for (MediaItem item : lockedMedia) {
            if (restore) media.restoreLocked(item.getId());
            else media.purgeLocked(item);
        }
        if (restore) {
            life.restoreAll(lifeKeys);   // 게시중으로 돌아온 카드가 있으면 인사교 라이프 페이지에도 다시
        } else {
            lifeKeys.forEach(life::purgeLocked);
        }
        if (restore && !locked.isEmpty()) events.publishEvent(new StoryChangedEvent(locked.get(0).getId()));
        if (restore && !lockedFaqs.isEmpty()) faqs.regenerate();
        return locked.size() + lockedFaqs.size() + lockedMedia.size() + lockedLife.size();
    }

    /** 휴지통 비우기: kind 가 없으면 전체, 있으면 그 종류만. 화면을 열 때의 지문(expectedSnapshot)과 같을 때만 */
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public int empty(String expectedSnapshot, String kind) {
        List<Post> locked = new ArrayList<>();
        StoryKind story = kind == null ? null : StoryKind.ofSlug(kind);
        if (kind == null || story != null) {
            locked.addAll(mapper.lockAllDeleted(story));
        }
        if (kind == null || PostStore.FAQ_KIND.equals(kind)) {
            faqs.lockAllDeleted().forEach(faq -> locked.add(row(PostStore.FAQ_KIND, faq.getId(), faq.getDeletedAt())));
        }
        java.util.Map<Long, MediaItem> lockedMedia = new java.util.HashMap<>();
        if (kind == null || PostStore.MEDIA_KIND.equals(kind)) {
            media.lockAllDeleted().forEach(item -> {
                lockedMedia.put(item.getId(), item);
                locked.add(row(PostStore.MEDIA_KIND, item.getId(), item.getDeletedAt()));
            });
        }
        if (kind == null || LifeBoardService.KIND.equals(kind)) {
            life.lockAllDeleted().forEach(r -> locked.add(row(r.kind(), r.id(), r.deletedAt())));
        }
        // 목록(overview)과 같은 순서: 종류 · 번호
        locked.sort(Comparator.comparing(Post::getKind).thenComparing(Post::getId));
        if (!snapshot(locked).token().equals(expectedSnapshot)) {
            throw new BusinessException("휴지통 목록이 변경되었습니다. 새로고침 후 전체 개수를 다시 확인해 주세요.");
        }
        for (Post post : locked) {
            if (PostStore.FAQ_KIND.equals(post.getKind())) faqs.purgeLocked(post.getId());
            else if (PostStore.MEDIA_KIND.equals(post.getKind())) media.purgeLocked(lockedMedia.get(post.getId()));
            else if (post.getKind().startsWith(LifeBoardService.KIND_PREFIX)) life.purgeLocked(LifeBoardService.Key.parse(post.getKind() + "-" + post.getId()));
            else purgeLocked(post);
        }
        return locked.size();
    }

    private void purgeLocked(Post post) {
        mapper.hardDelete(kindOf(post), post.getId());
    }

    /** 잠근 질문 · 미디어(종류 · 번호 · 지운 시각)를 휴지통 목록의 한 줄 모양으로(지문 비교용) */
    private static Post row(String kind, Long id, java.time.LocalDateTime deletedAt) {
        Post p = new Post();
        p.setId(id);
        p.setCategorySlug(kind);
        p.setDeletedAt(deletedAt);
        return p;
    }

    /** "faq-3" · "media-3" → 3 */
    private static Long idAfter(String value, String prefix) {
        try {
            long id = Long.parseLong(value.substring(prefix.length()));
            if (id > 0) {
                return id;
            }
        } catch (NumberFormatException e) {
            // 아래에서 안내
        }
        throw new BusinessException("현재 페이지에서 게시물을 선택해 주세요.");
    }

    /** 자주 묻는 질문 복원 → 지우기 전 상태로 FAQ 관리 목록의 원래 자리에(게시중이었으면 사이트에도 다시). 복원 전 모습 */
    public FaqItem restoreFaq(Long id) {
        FaqItem before = faqs.restore(id);
        faqs.regenerate();
        return before;
    }

    /** 자주 묻는 질문 완전 삭제 — 휴지통에 있는 질문만, 되돌릴 수 없다 */
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public void purgeFaq(Long id) {
        faqs.purge(id);
    }

    /** 미디어 복원 → 미디어 관리 목록에 다시. 복원 전 모습 */
    public MediaItem restoreMedia(Long id) {
        return media.restore(id);
    }

    /** 미디어 완전 삭제 — 휴지통에 있는 것만, 저장소의 파일도 지우며 되돌릴 수 없다 */
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public void purgeMedia(Long id) {
        media.purge(id);
    }

    /** 인사교 라이프 카드 복원 → 옮기기 전 상태로 원래 자리에(게시중이었으면 사이트 페이지에도 다시). 복원 전 모습 */
    public LifeItem restoreLife(String section, Long id) {
        return life.restore(section, id);
    }

    /** 인사교 라이프 카드 완전 삭제 — 휴지통에 있는 카드만, 되돌릴 수 없다(올린 사진 파일은 사이트 폴더에 그대로) */
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public void purgeLife(String section, Long id) {
        life.purge(section, id);
    }

    private static StoryKind kindOf(Post post) {
        return StoryKind.ofSlug(post.getKind());
    }

    /** 복원 → 휴지통으로 옮기기 전 상태로 글 관리 목록에 돌아간다(게시중이었으면 다시 게시중 — 선배들의 이야기 글은 사이트에도 다시 올라간다). */
    public Post restore(StoryKind kind, Long id) {
        Post before = getDeleted(kind, id);
        mapper.restore(kind, id);
        events.publishEvent(new StoryChangedEvent(id));
        return before;
    }

    /** 완전 삭제 — 휴지통에 있는 글만 가능하며 되돌릴 수 없다. */
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public void purge(StoryKind kind, Long id) {
        getDeleted(kind, id);
        mapper.hardDelete(kind, id);
        events.publishEvent(new StoryChangedEvent(id));
    }
}
