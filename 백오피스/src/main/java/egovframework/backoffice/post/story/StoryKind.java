package egovframework.backoffice.post.story;

/**
 * 선배들의 이야기 글 종류. 카테고리 slug 로 정해지고, 글이 들어가는 표 이름(= 사이트 데이터 stories-data.js 의 목록 이름)과
 * 글 주소(#r-p12 등)를 가진다. 기수별 모아보기는 2026-10-20부터 사이트 HTML(게시물 아님).
 */
public enum StoryKind {
    REVIEW("review", "reviews", "r-p", "후기"),
    INTERVIEW("interview", "interviews", "iv-p", "인터뷰"),
    PROJECT("project", "projects", "pj-p", "프로젝트");

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

    /** 글이 들어가는 표 이름이자 사이트 데이터의 목록 이름(reviews · interviews · projects) */
    public String key() {
        return key;
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
