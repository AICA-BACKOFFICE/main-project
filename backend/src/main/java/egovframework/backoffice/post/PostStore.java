package egovframework.backoffice.post;

import egovframework.backoffice.category.Category;
import egovframework.backoffice.category.CategoryService;
import egovframework.backoffice.editor.BlockContent;
import egovframework.backoffice.media.ImageStorageService;
import egovframework.backoffice.page.LifeBoardService;
import egovframework.backoffice.post.story.StoryContent;
import egovframework.backoffice.post.story.StoryKind;
import egovframework.backoffice.stats.StatsMapper;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Component;

/**
 * 게시물 저장소: 글 종류마다 따로 있는 표(reviews · interviews · projects · cohort_stories, {@link StoryTableMapper})를 게시물 하나({@link Post})로 읽고 쓴다.
 * 글 번호는 표마다 1번부터(V19)라 글 하나는 늘 종류 + 번호({@link PostKey})로 가리킨다. 목록 · 휴지통은 네 표를 합쳐 본다.
 */
@Component
public class PostStore {

    /** 휴지통 목록에서 자주 묻는 질문(faqs 표)의 종류 이름. 휴지통 선택 값은 "faq-번호" */
    public static final String FAQ_KIND = "faq";
    /** 휴지통 목록에서 미디어(media 표)의 종류 이름. 휴지통 선택 값은 "media-번호" */
    public static final String MEDIA_KIND = "media";

    private final StoryTableMapper tables;
    private final CategoryService categories;
    private final StoryContent stories;
    private final BlockContent blocks;
    private final StatsMapper stats;
    private final ImageStorageService storage;

    public PostStore(StoryTableMapper tables, CategoryService categories, StoryContent stories, BlockContent blocks, StatsMapper stats,
                     ImageStorageService storage) {
        this.tables = tables;
        this.categories = categories;
        this.stories = stories;
        this.blocks = blocks;
        this.stats = stats;
        this.storage = storage;
    }

    // ── 목록 ──

    public List<Post> search(PostSearch s) {
        Filter f = filter(s);
        return f.none ? List.of() : light(tables.search(s, f.kind, f.category));
    }

    public long countSearch(PostSearch s) {
        Filter f = filter(s);
        return f.none ? 0 : tables.countSearch(s, f.kind, f.category);
    }

    /** 휴지통. kind(review · interview · project · faq · media)를 주면 그 종류만 */
    public List<Post> findTrash(PostSearch s, String kind) {
        return light(tables.findTrash(s, kind));
    }

    public long countTrash(PostSearch s, String kind) {
        return tables.countTrash(s, kind);
    }

    public List<Post> findAllDeleted(String kind) {
        return light(tables.findAllDeleted(kind));
    }

    /** 휴지통 종류별 개수 */
    public Map<String, Long> trashCounts() {
        return counts(tables.trashCounts());
    }

    /** 임시저장 목록(휴지통 아님). kind: 그 종류만, authorId: 그 사람 글만, withFaq: 임시저장 자주 묻는 질문도 */
    public List<Post> findDrafts(PostSearch s, String kind, Long authorId, boolean withFaq) {
        return light(tables.findDrafts(s, kind, authorId, withFaq));
    }

    public long countDrafts(PostSearch s, String kind, Long authorId, boolean withFaq) {
        return tables.countDrafts(s, kind, authorId, withFaq);
    }

    /** 임시저장 종류별 개수 */
    public Map<String, Long> draftCounts(Long authorId, boolean withFaq) {
        return counts(tables.draftCounts(authorId, withFaq));
    }

    /** 종류별 개수. 인사교 라이프 카드(life-fac · life-food · life-fun)는 'life' 하나로 합친다(종류 칩이 하나) */
    private static Map<String, Long> counts(List<Map<String, Object>> rows) {
        Map<String, Long> out = new java.util.LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String kind = String.valueOf(row.get("kind"));
            if (kind.startsWith(LifeBoardService.KIND_PREFIX)) {
                kind = LifeBoardService.KIND;
            }
            out.merge(kind, ((Number) row.get("cnt")).longValue(), Long::sum);
        }
        return out;
    }

    /** 게시중인 글(네 표), 최신 게시 순 — 사이트 데이터 · 미리보기용(기수별 이모저모는 사이트에서 있었던 날 순으로 다시 정렬) */
    public List<Post> findPublishedStories() {
        List<StoryRow> rows = new ArrayList<>();
        rows.addAll(tables.publishedReviews());
        rows.addAll(tables.publishedInterviews());
        rows.addAll(tables.publishedProjects());
        rows.addAll(tables.publishedCohorts());
        rows.sort(Comparator.comparing(StoryRow::getPublishedAt, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(StoryRow::getId, Comparator.reverseOrder()));
        return rows.stream().map(r -> toPost(r, true)).toList();
    }

    /** 네 표 모두 비어 있는지(휴지통 포함) — 새 DB면 사이트 사본에서 글을 가져온다 */
    public boolean isEmpty() {
        return tables.countAll() == 0;
    }

    // ── 글 하나(번호는 표마다 1번부터라 늘 종류 + 번호로) ──

    /** 휴지통이 아닌 글 */
    public Post findById(StoryKind kind, Long id) {
        StoryRow row = find(kind, id);
        return row == null || row.getDeletedAt() != null ? null : toPost(row, true);
    }

    /** 휴지통에 있는 글 */
    public Post findDeletedById(StoryKind kind, Long id) {
        StoryRow row = find(kind, id);
        return row == null || row.getDeletedAt() == null ? null : toPost(row, true);
    }

    /** 새 글: 그 종류 표의 다음 번호를 받는다 */
    public void insert(Post post) {
        StoryKind kind = kindOf(post);
        StoryRow row = toRow(kind, post);
        row.setId(null);
        insertRow(kind, row);
        post.setId(row.getId());
        post.setCategorySlug(kind.slug());
    }

    /**
     * 고친 내용 저장. 글 종류(카테고리)를 바꿨으면 원래 표에서 빼고 새 종류의 표로 옮긴다 — 그 표의 새 번호를 받으므로
     * post 의 번호 · 종류가 바뀐다(관리 화면은 새 주소로 연다). 그 글의 조회 기록(post_view_logs)도 새 종류 + 번호로 옮긴다.
     */
    public void update(Post post, StoryKind from) {
        StoryKind kind = kindOf(post);
        StoryRow row = toRow(kind, post);
        if (from != kind) {
            Long oldId = post.getId();
            tables.deleteLive(table(from), oldId);
            row.setId(null);
            insertRow(kind, row);
            if (from.tracksViews() && kind.tracksViews()) {
                stats.movePostViews(from.slug(), oldId, kind.slug(), row.getId());
            } else {
                stats.deletePostViews(from.slug(), oldId);   // 기수별 이모저모는 조회 기록을 두지 않아요
            }
            post.setId(row.getId());
            post.setCategorySlug(kind.slug());
            return;
        }
        row.setId(post.getId());
        switch (kind) {
            case REVIEW -> tables.updateReview(row);
            case INTERVIEW -> tables.updateInterview(row);
            case PROJECT -> tables.updateProject(row);
            case COHORT -> tables.updateCohort(row);
        }
    }

    public void updateStatus(StoryKind kind, Long id, PostStatus status) {
        tables.updateStatus(table(kind), id, status);
    }

    public void softDelete(StoryKind kind, Long id) {
        tables.softDelete(table(kind), id);
    }

    public void restore(StoryKind kind, Long id) {
        tables.restore(table(kind), id);
    }

    /** 완전 삭제(휴지통 글만). 그 글의 조회 기록도 같이 지운다 */
    public void hardDelete(StoryKind kind, Long id) {
        if (tables.hardDelete(table(kind), id) > 0) {
            stats.deletePostViews(kind.slug(), id);
        }
    }

    /** 휴지통의 이 글들을 잠근다(같이 비우거나 복원하는 동안 다른 사람이 못 바꾸게). 휴지통에 없는 글은 빠진다 */
    public List<Post> lockDeleted(List<PostKey> keys) {
        List<StoryRow> rows = new ArrayList<>();
        for (StoryKind k : StoryKind.values()) {
            List<Long> ids = keys.stream().filter(key -> key.kind() == k).map(PostKey::id).toList();
            if (!ids.isEmpty()) {
                tables.lockDeleted(table(k), ids).forEach(r -> {
                    r.setKind(k.slug());
                    rows.add(r);
                });
            }
        }
        rows.sort(Comparator.comparing(StoryRow::getKind).thenComparing(StoryRow::getId));
        return light(rows);
    }

    /** 휴지통의 글 전부(only 가 있으면 그 종류만)를 잠근다 */
    public List<Post> lockAllDeleted(StoryKind only) {
        List<StoryRow> rows = new ArrayList<>();
        for (StoryKind k : StoryKind.values()) {
            if (only != null && only != k) {
                continue;
            }
            tables.lockAllDeleted(table(k)).forEach(r -> {
                r.setKind(k.slug());
                rows.add(r);
            });
        }
        rows.sort(Comparator.comparing(StoryRow::getKind).thenComparing(StoryRow::getId));
        return light(rows);
    }

    // ── 표 ↔ 게시물 ──

    private static String table(StoryKind kind) {
        return kind.table();   // reviews · interviews · projects · cohort_stories
    }

    private void insertRow(StoryKind kind, StoryRow row) {
        switch (kind) {
            case REVIEW -> tables.insertReview(row);
            case INTERVIEW -> tables.insertInterview(row);
            case PROJECT -> tables.insertProject(row);
            case COHORT -> tables.insertCohort(row);
        }
    }

    private StoryRow find(StoryKind kind, Long id) {
        if (kind == null || id == null) {
            return null;
        }
        return switch (kind) {
            case REVIEW -> tables.findReview(id);
            case INTERVIEW -> tables.findInterview(id);
            case PROJECT -> tables.findProject(id);
            case COHORT -> tables.findCohort(id);
        };
    }

    private StoryKind kindOf(Post post) {
        StoryKind kind = categories.findAll().stream().filter(c -> c.getId().equals(post.getCategoryId())).findFirst()
                .map(c -> StoryKind.ofSlug(c.getSlug())).orElse(null);
        if (kind == null) {
            throw new IllegalArgumentException("글 종류(후기 · 인터뷰 · 프로젝트 · 기수별 이모저모)를 골라 주세요.");
        }
        return kind;
    }

    /** 게시물 → 표 한 줄. 표가 꼭 받아야 하는 분류(후기 분야 · 인터뷰 기수)는 임시저장할 때도 확인한다 */
    private StoryRow toRow(StoryKind kind, Post post) {
        StoryRow row = new StoryRow();
        row.setId(post.getId());
        row.setTitle(post.getTitle());
        row.setStatus(post.getStatus() == null ? PostStatus.DRAFT : post.getStatus());
        row.setAuthorId(post.getAuthorId());
        row.setPublishedAt(post.getPublishedAt());
        Map<String, Object> story = stories.parse(post.getStoryJson());
        StoryColumns.toRow(kind, story, row, stories);
        if (kind == StoryKind.REVIEW && row.getCategory() == null) {
            throw new IllegalArgumentException("후기 분야(생활 · 수업 · 프로젝트 · 취업 성공 · 진로 고민)를 골라 주세요. 임시저장할 때도 필요해요.");
        }
        if (kind == StoryKind.INTERVIEW && row.getCohort() == null) {
            throw new IllegalArgumentException("기수를 입력해 주세요. 인터뷰는 기수로 나눠 두어서 임시저장할 때도 필요해요.");
        }
        if (kind == StoryKind.COHORT && row.getCohort() == null) {
            throw new IllegalArgumentException("기수를 입력해 주세요. 기수별 이모저모는 기수로 나눠 두어서 임시저장할 때도 필요해요.");
        }
        return row;
    }

    private List<Post> light(List<StoryRow> rows) {
        return rows.stream().map(r -> toPost(r, false)).toList();
    }

    /** full: 글쓰기 · 미리보기 · 사이트용으로 양식 값과 본문 블록까지 */
    private Post toPost(StoryRow r, boolean full) {
        Post p = new Post();
        p.setId(r.getId());
        p.setTitle(r.getTitle());
        p.setStatus(r.getStatus());
        p.setStatusBeforeTrash(r.getStatusBeforeTrash());
        p.setAuthorId(r.getAuthorId());
        p.setAuthorName(r.getAuthorName());
        p.setPublishedAt(r.getPublishedAt());
        p.setCreatedAt(r.getCreatedAt());
        p.setUpdatedAt(r.getUpdatedAt());
        p.setDeletedAt(r.getDeletedAt());
        p.setSummary(r.getSummary());
        p.setThumbnailMode("AUTO");
        p.setBlocksJson("[]");
        if (FAQ_KIND.equals(r.getKind())) {
            // 휴지통의 자주 묻는 질문: 제목 = 질문, 카테고리 = 지원 전 Check FAQ › 분류
            p.setCategorySlug(FAQ_KIND);
            p.setCategoryName("지원 전 Check FAQ");
            p.setSubCategoryName(r.getCategory());
            return p;
        }
        if (MEDIA_KIND.equals(r.getKind())) {
            // 휴지통의 미디어: 제목 = 이름, 카테고리 = 미디어 › 이미지 · 동영상, 사진이면 썸네일(photos = 저장소 위치)
            boolean image = "IMAGE".equals(r.getCategory());
            p.setCategorySlug(MEDIA_KIND);
            p.setCategoryName("미디어");
            p.setSubCategoryName(image ? "이미지" : "동영상");
            if (image && r.getPhotos() != null) {
                p.setThumbnailUrl(storage.url(r.getPhotos()));
            }
            return p;
        }
        if (r.getKind() != null && r.getKind().startsWith(LifeBoardService.KIND_PREFIX)) {
            // 휴지통 · 임시저장의 인사교 라이프 카드: 카테고리 = 인사교 라이프 › 시설 사진 · 오늘 점심(식당/카페) · 바람 쐬러 가요, 사진이 있으면 썸네일
            String section = r.getKind().substring(LifeBoardService.KIND_PREFIX.length());
            p.setCategorySlug(r.getKind());
            p.setCategoryName("인사교 라이프");
            p.setSubCategoryName("food".equals(section) ? ("cafe".equals(r.getCategory()) ? "오늘 점심 · 카페" : "오늘 점심 · 식당")
                    : "fun".equals(section) ? "바람 쐬러 가요" : "시설 사진" + (r.getSummary() == null ? "" : " · " + r.getSummary()));
            if (r.getPhotos() != null && !r.getPhotos().isBlank()) {
                p.setThumbnailUrl("/admin/pages/site/life/" + r.getPhotos());
            }
            return p;
        }
        StoryKind kind = StoryKind.ofSlug(r.getKind());
        if (kind == null) {
            return p;
        }
        Category top = categories.findBySlug(kind.slug());
        p.setCategoryId(top.getId());
        p.setCategoryName(top.getName());
        p.setCategorySlug(top.getSlug());
        if (kind == StoryKind.REVIEW && r.getCategory() != null) {
            categories.childrenOf(top.getId()).stream().filter(c -> Objects.equals(c.getName(), r.getCategory())).findFirst().ifPresent(c -> {
                p.setSubCategoryId(c.getId());
                p.setSubCategoryName(c.getName());
                p.setSubCategorySlug(c.getSlug());
            });
        }
        p.setThumbnailUrl(stories.thumbnail(StoryColumns.photoMap(r.getPhotos(), stories)));
        if (full) {
            Map<String, Object> story = StoryColumns.toStory(kind, r, stories);
            p.setStoryJson(stories.serialize(story));
            p.setBlocksJson(blocks.serialize(blocks.sanitize(stories.toBlocks(kind, story))));
        }
        return p;
    }

    /** 목록 거르기: 카테고리 → 표(kind), 후기 세부 카테고리 → 분야(category). 맞지 않는 거르기면 none */
    private record Filter(String kind, String category, boolean none) { }

    private Filter filter(PostSearch s) {
        String kind = null, category = null;
        if (s.getCategoryId() != null) {
            Category c = categories.findAll().stream().filter(x -> x.getId().equals(s.getCategoryId())).findFirst().orElse(null);
            StoryKind k = c == null ? null : StoryKind.ofSlug(c.getSlug());
            if (k == null) {
                return new Filter(null, null, true);
            }
            kind = k.slug();
        }
        if (s.getSubCategoryId() != null) {
            Category sub = categories.findAll().stream().filter(x -> x.getId().equals(s.getSubCategoryId())).findFirst().orElse(null);
            if (sub == null || sub.isTop() || !CategoryService.REVIEW_ID.equals(sub.getParentId())) {
                return new Filter(null, null, true);
            }
            kind = StoryKind.REVIEW.slug();
            category = sub.getName();
        }
        return new Filter(kind, category, false);
    }
}
