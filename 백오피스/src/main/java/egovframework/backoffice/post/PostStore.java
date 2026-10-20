package egovframework.backoffice.post;

import egovframework.backoffice.category.Category;
import egovframework.backoffice.category.CategoryService;
import egovframework.backoffice.editor.BlockContent;
import egovframework.backoffice.post.story.StoryContent;
import egovframework.backoffice.post.story.StoryKind;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Component;

/**
 * 게시물 저장소: 글 종류마다 따로 있는 표(reviews · interviews · projects, {@link StoryTableMapper})를 게시물 하나({@link Post})로 읽고 쓴다.
 * 글 번호는 표마다 1번부터(V19)라 글 하나는 늘 종류 + 번호({@link PostKey})로 가리킨다. 목록 · 휴지통은 세 표를 합쳐 본다.
 */
@Component
public class PostStore {

    private final StoryTableMapper tables;
    private final CategoryService categories;
    private final StoryContent stories;
    private final BlockContent blocks;

    public PostStore(StoryTableMapper tables, CategoryService categories, StoryContent stories, BlockContent blocks) {
        this.tables = tables;
        this.categories = categories;
        this.stories = stories;
        this.blocks = blocks;
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

    public List<Post> findTrash(PostSearch s) {
        return light(tables.findTrash(s));
    }

    public long countTrash(PostSearch s) {
        return tables.countTrash(s);
    }

    public List<Post> findAllDeleted() {
        return light(tables.findAllDeleted());
    }

    /** 게시중인 글(세 표), 최신 게시 순 — 사이트 데이터 · 미리보기용 */
    public List<Post> findPublishedStories() {
        List<StoryRow> rows = new ArrayList<>();
        rows.addAll(tables.publishedReviews());
        rows.addAll(tables.publishedInterviews());
        rows.addAll(tables.publishedProjects());
        rows.sort(Comparator.comparing(StoryRow::getPublishedAt, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(StoryRow::getId, Comparator.reverseOrder()));
        return rows.stream().map(r -> toPost(r, true)).toList();
    }

    /** 세 표 모두 비어 있는지(휴지통 포함) — 새 DB면 사이트 사본에서 글을 가져온다 */
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
     * post 의 번호 · 종류가 바뀐다(관리 화면은 새 주소로 연다).
     */
    public void update(Post post, StoryKind from) {
        StoryKind kind = kindOf(post);
        StoryRow row = toRow(kind, post);
        if (from != kind) {
            tables.deleteLive(table(from), post.getId());
            row.setId(null);
            insertRow(kind, row);
            post.setId(row.getId());
            post.setCategorySlug(kind.slug());
            return;
        }
        row.setId(post.getId());
        switch (kind) {
            case REVIEW -> tables.updateReview(row);
            case INTERVIEW -> tables.updateInterview(row);
            case PROJECT -> tables.updateProject(row);
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

    public void hardDelete(StoryKind kind, Long id) {
        tables.hardDelete(table(kind), id);
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

    public List<Post> lockAllDeleted() {
        List<StoryRow> rows = new ArrayList<>();
        for (StoryKind k : StoryKind.values()) {
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
        return kind.key();   // reviews · interviews · projects
    }

    private void insertRow(StoryKind kind, StoryRow row) {
        switch (kind) {
            case REVIEW -> tables.insertReview(row);
            case INTERVIEW -> tables.insertInterview(row);
            case PROJECT -> tables.insertProject(row);
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
        };
    }

    private StoryKind kindOf(Post post) {
        StoryKind kind = categories.findAll().stream().filter(c -> c.getId().equals(post.getCategoryId())).findFirst()
                .map(c -> StoryKind.ofSlug(c.getSlug())).orElse(null);
        if (kind == null) {
            throw new IllegalArgumentException("글 종류(후기 · 인터뷰 · 프로젝트)를 골라 주세요.");
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
