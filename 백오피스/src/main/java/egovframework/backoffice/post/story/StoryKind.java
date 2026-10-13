package egovframework.backoffice.post.story;

/**
 * 선배들의 이야기 글 종류. 카테고리 slug(V7 카테고리 트리)로 정해지고, 사이트 데이터(stories-data.js)의 목록 이름과
 * 글 주소(#r-p12 등)를 가진다. 기수 기록은 창이 따로 없어 주소 대신 카드 번호(data-st)로 연다.
 */
public enum StoryKind {
    REVIEW("review", "reviews", "r-p", "후기"),
    INTERVIEW("interview", "interviews", "iv-p", "인터뷰"),
    PROJECT("project", "projects", "pj-p", "프로젝트"),
    COHORT("cohort", "cohorts", null, "기수 기록");

    private final String slug;
    private final String key;
    private final String anchorPrefix;
    private final String label;

    StoryKind(String slug, String key, String anchorPrefix, String label) {
        this.slug = slug;
        this.key = key;
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

    public String label() {
        return label;
    }

    /** 새 글의 주소 이름(r-p12). 기수 기록은 없음 */
    public String anchorFor(String id) {
        return anchorPrefix == null ? null : anchorPrefix + id;
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
