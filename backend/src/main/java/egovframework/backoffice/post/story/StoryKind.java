package egovframework.backoffice.post.story;

/**
 * 선배들의 이야기 글 종류. 카테고리 slug 로 정해지고, 사이트 데이터(stories-data.js · 공개 API)의 목록 이름 · 글이 들어가는 표 이름과
 * 글 주소(#r-p12 등)를 가진다. 기수별 이모저모(cohort)는 2026-10-20 cohort_stories 표(V26)로 다시 게시물이 됐다.
 */
public enum StoryKind {
    REVIEW("review", "reviews", "reviews", "r-p", "후기"),
    INTERVIEW("interview", "interviews", "interviews", "iv-p", "인터뷰"),
    PROJECT("project", "projects", "projects", "pj-p", "프로젝트"),
    /** 기수별 이모저모: 사이트 데이터 목록 이름은 cohorts(stories-render.js), 표는 cohort_stories, 글 주소는 #st-3(cohort-v3.js) */
    COHORT("cohort", "cohorts", "cohort_stories", "st-", "기수별 이모저모");

    private final String slug;
    private final String key;
    private final String table;
    private final String anchorPrefix;
    private final String label;

    StoryKind(String slug, String key, String table, String anchorPrefix, String label) {
        this.slug = slug;
        this.key = key;
        this.table = table;
        this.anchorPrefix = anchorPrefix;
        this.label = label;
    }

    /** 카테고리 slug */
    public String slug() {
        return slug;
    }

    /** 사이트 데이터의 목록 이름(reviews · interviews · projects · cohorts) */
    public String key() {
        return key;
    }

    /** 글이 들어가는 표 이름(reviews · interviews · projects · cohort_stories) */
    public String table() {
        return table;
    }

    /** 사이트가 글 조회수를 남기는 종류(기수별 이모저모는 글 창 조회를 따로 세지 않아요) */
    public boolean tracksViews() {
        return this != COHORT;
    }

    public String label() {
        return label;
    }

    /** 글 주소 이름(r-p12) */
    public String anchorFor(String id) {
        return anchorPrefix + id;
    }

    public static StoryKind ofSlug(String slug) {
        if (slug != null) {
            for (StoryKind k : values()) {
                if (k.slug.equals(slug)) {
                    return k;
                }
            }
        }
        return null;
    }
}
