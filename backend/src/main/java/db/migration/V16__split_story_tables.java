package db.migration;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.Timestamp;
import java.sql.Types;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/**
 * 2026-10-20 DB를 표 4개로: admin_users(관리자) · reviews(후기) · interviews(인터뷰) · projects(프로젝트).
 * <ul>
 *   <li>posts 한 표에 섞여 있던 글을 종류별 표로 옮긴다(글 번호 그대로). 글 양식 JSON(story_json) 대신 칸마다 나눠 담는다.</li>
 *   <li>세 표는 글 번호 하나(story_post_id_seq)를 같이 써서 번호가 겹치지 않는다(관리 화면 주소 /admin/posts/{번호} · 사이트 주소 #r-p{번호} 그대로).</li>
 *   <li>후기는 분야(category), 인터뷰는 기수(cohort), 프로젝트는 기수 · 반으로 나눈다.</li>
 *   <li>그 밖의 표(카테고리 · 버전 기록 · 템플릿 · 미디어 · 방문 기록 · 라이프 · FAQ)는 지운다 — 라이프 · FAQ · 기수별 모아보기는 다시 사이트 HTML.
 *       휴지통에 있던 옛 글(예시 · 더미)과 기수 기록 글은 옮기지 않는다(사용자 확인). 지우기 전 백업: data/db-backups</li>
 * </ul>
 * 테스트(H2 PostgreSQL 모드)와 실제 DB(PostgreSQL)에서 같이 돌도록 자바로 쓴다(글 양식 JSON 읽기 · 글 번호 기본값 문법).
 */
public class V16__split_story_tables extends BaseJavaMigration {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Map<String, String> REVIEW_CATS = Map.of("life", "생활", "class", "수업", "proj", "프로젝트",
            "job", "취업 성공", "career", "취업 성공", "path", "진로 고민");
    private static final Map<String, String> REVIEW_SUBS = Map.of("review-life", "생활", "review-class", "수업", "review-project", "프로젝트",
            "review-job", "취업 성공", "review-career", "취업 성공", "review-path", "진로 고민");
    private static final List<String> REVIEW_TAGS = List.of("#비전공자", "#타지출신", "#직장인출신", "#졸업생", "#적응", "#팀활동", "#취업연계");
    private static final List<String> PHOTO_KEYS = List.of("photos", "cover", "img", "heroImg", "imgLarge", "art", "heroArt");
    private static final Pattern TEAM = Pattern.compile("^(.*?)\\s*·\\s*(\\d{1,3})\\s*명$");
    private static final Pattern COHORT = Pattern.compile("(\\d{1,2})\\s*기");

    @Override
    public void migrate(Context context) throws Exception {
        Connection c = context.getConnection();
        boolean postgres = c.getMetaData().getDatabaseProductName().toLowerCase().contains("postgres");
        try (Statement st = c.createStatement()) {
            long next = 1;
            try (ResultSet rs = st.executeQuery("SELECT COALESCE(MAX(id), 0) + 1 FROM posts")) {
                if (rs.next()) {
                    next = Math.max(1, rs.getLong(1));
                }
            }
            st.execute("CREATE SEQUENCE story_post_id_seq START WITH " + next);
            String id = "id BIGINT DEFAULT " + (postgres ? "nextval('story_post_id_seq')" : "NEXT VALUE FOR story_post_id_seq") + " PRIMARY KEY";
            String common = """
                    status              VARCHAR(20)  NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'HIDDEN')),
                    status_before_trash VARCHAR(20),
                    author_id           BIGINT       NOT NULL REFERENCES admin_users (id),
                    published_at        TIMESTAMP,
                    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    deleted_at          TIMESTAMP
                    """;

            st.execute("CREATE TABLE reviews (" + id + """
                    ,
                    category     VARCHAR(10)  NOT NULL CHECK (category IN ('생활', '수업', '프로젝트', '취업 성공', '진로 고민')),
                    cohort       INT          CHECK (cohort BETWEEN 1 AND 99),
                    senior_name  VARCHAR(30),
                    track        VARCHAR(40),
                    title        VARCHAR(200) NOT NULL,
                    summary      TEXT,
                    body         TEXT,
                    tags         VARCHAR(200),
                    ticker       VARCHAR(80),
                    show_on_hub  BOOLEAN      NOT NULL DEFAULT FALSE,
                    photos       TEXT,
                    """ + common + ")");
            st.execute("CREATE TABLE interviews (" + id + """
                    ,
                    cohort       INT          NOT NULL CHECK (cohort BETWEEN 1 AND 99),
                    senior_name  VARCHAR(30),
                    track        VARCHAR(40),
                    title        VARCHAR(200) NOT NULL,
                    kicker       VARCHAR(30),
                    quote        VARCHAR(300),
                    summary      TEXT,
                    qa           TEXT,
                    video_url    VARCHAR(300),
                    video_length VARCHAR(8),
                    photos       TEXT,
                    """ + common + ")");
            st.execute("CREATE TABLE projects (" + id + """
                    ,
                    cohort       INT          CHECK (cohort BETWEEN 1 AND 99),
                    class_name   VARCHAR(20),
                    major        VARCHAR(30),
                    team_name    VARCHAR(60),
                    team_size    INT          CHECK (team_size BETWEEN 1 AND 99),
                    title        VARCHAR(200) NOT NULL,
                    headline     VARCHAR(120),
                    card_summary VARCHAR(200),
                    summary      TEXT,
                    problem      TEXT,
                    features     TEXT,
                    tech         TEXT,
                    tags         VARCHAR(300),
                    links        TEXT,
                    photos       TEXT,
                    """ + common + ")");

            st.execute("CREATE INDEX ix_reviews_category ON reviews (category, cohort)");
            st.execute("CREATE INDEX ix_reviews_list ON reviews (deleted_at, status, published_at)");
            st.execute("CREATE INDEX ix_interviews_cohort ON interviews (cohort)");
            st.execute("CREATE INDEX ix_interviews_list ON interviews (deleted_at, status, published_at)");
            st.execute("CREATE INDEX ix_projects_cohort ON projects (cohort, class_name)");
            st.execute("CREATE INDEX ix_projects_list ON projects (deleted_at, status, published_at)");

            comments(st);
        }

        copyPosts(c);

        // 나머지 표는 지운다(자식 표부터). 없는 표는 건너뜀
        try (Statement st = c.createStatement()) {
            for (String t : List.of("post_view_logs", "post_versions", "post_templates", "visit_logs", "audit_logs", "posts", "images",
                    "categories", "life_versions", "life_facility_photos", "life_facility_spaces", "life_foods", "life_spots", "faq_items",
                    "home_tickers", "notice_dismissals", "notices", "image_folders")) {
                st.execute("DROP TABLE IF EXISTS " + t + " CASCADE");
            }
        }
    }

    private static void comments(Statement st) throws Exception {
        String[][] items = {
                {"TABLE reviews", "후기 — 선배들의 이야기 › 후기. 분야(category)로 나눠요. 휴지통은 deleted_at"},
                {"COLUMN reviews.id", "글 번호(후기 · 인터뷰 · 프로젝트가 번호 하나를 같이 써요)"},
                {"COLUMN reviews.category", "분야: 생활 · 수업 · 프로젝트 · 취업 성공 · 진로 고민"},
                {"COLUMN reviews.cohort", "기수(숫자)"},
                {"COLUMN reviews.senior_name", "후기를 쓴 선배 이름"},
                {"COLUMN reviews.track", "반 · 직군(선택)"},
                {"COLUMN reviews.summary", "굵은 첫 문단(요약)"},
                {"COLUMN reviews.body", "본문(문단 사이는 빈 줄)"},
                {"COLUMN reviews.tags", "태그(예: #비전공자 #적응)"},
                {"COLUMN reviews.ticker", "첫 화면 검은 띠에 흐르는 한마디(비우면 첫 문장)"},
                {"COLUMN reviews.show_on_hub", "한눈에 보기 포스트잇으로 보이기"},
                {"COLUMN reviews.photos", "사진(JSON: 사진 목록 · 대표 사진)"},
                {"TABLE interviews", "인터뷰 — 선배들의 이야기 › 인터뷰. 기수(cohort)로 나눠요. 휴지통은 deleted_at"},
                {"COLUMN interviews.id", "글 번호(후기 · 인터뷰 · 프로젝트가 번호 하나를 같이 써요)"},
                {"COLUMN interviews.cohort", "기수(숫자) — 기수가 늘면 숫자만 새로 넣어요"},
                {"COLUMN interviews.senior_name", "인터뷰한 선배 이름"},
                {"COLUMN interviews.track", "반 · 직군"},
                {"COLUMN interviews.kicker", "한눈에 보기 큰 인터뷰의 작은 꼬리표"},
                {"COLUMN interviews.quote", "카드에 크게 들어가는 한 줄 인용"},
                {"COLUMN interviews.summary", "요약(카드 · 상세 첫 문단)"},
                {"COLUMN interviews.qa", "질문과 답 목록(JSON: q 질문 · a 답 · toc 목차 문구)"},
                {"COLUMN interviews.video_url", "유튜브 영상 주소(선택)"},
                {"COLUMN interviews.video_length", "영상 길이(예: 8:05)"},
                {"COLUMN interviews.photos", "사진(JSON: 사진 목록 · 대표 사진)"},
                {"TABLE projects", "프로젝트 — 선배들의 이야기 › 프로젝트. 기수 · 반으로 나눠요. 휴지통은 deleted_at"},
                {"COLUMN projects.id", "글 번호(후기 · 인터뷰 · 프로젝트가 번호 하나를 같이 써요)"},
                {"COLUMN projects.cohort", "기수(숫자)"},
                {"COLUMN projects.class_name", "반(예: 01반)"},
                {"COLUMN projects.major", "전공(예: 자연어처리A)"},
                {"COLUMN projects.team_name", "팀 이름"},
                {"COLUMN projects.team_size", "팀 인원(명)"},
                {"COLUMN projects.title", "프로젝트 이름"},
                {"COLUMN projects.headline", "카드 한 줄 제목(비우면 프로젝트 이름)"},
                {"COLUMN projects.card_summary", "카드 짧은 요약(비우면 요약 첫 문장)"},
                {"COLUMN projects.summary", "요약(상세 첫 문단)"},
                {"COLUMN projects.problem", "문제 정의"},
                {"COLUMN projects.features", "주요 기능(• 마다 한 줄)"},
                {"COLUMN projects.tech", "기술 설명"},
                {"COLUMN projects.tags", "기술 태그(예: #Python #React)"},
                {"COLUMN projects.links", "자료 링크(JSON: label 이름 · url 주소)"},
                {"COLUMN projects.photos", "사진(JSON: 사진 목록 · 대표 사진)"},
        };
        for (String table : List.of("reviews", "interviews", "projects")) {
            st.execute("COMMENT ON COLUMN " + table + ".status IS '상태: DRAFT 임시저장 · PUBLISHED 게시중 · HIDDEN 미게시'");
            st.execute("COMMENT ON COLUMN " + table + ".status_before_trash IS '휴지통으로 옮기기 전 상태(복원하면 이 상태로)'");
            st.execute("COMMENT ON COLUMN " + table + ".author_id IS '글을 올린 관리자(admin_users.id)'");
            st.execute("COMMENT ON COLUMN " + table + ".deleted_at IS '휴지통으로 옮긴 시각(비어 있으면 휴지통 아님)'");
        }
        for (String[] item : items) {
            st.execute("COMMENT ON " + item[0] + " IS '" + item[1].replace("'", "''") + "'");
        }
    }

    // ── posts → 종류별 표 ──

    private static void copyPosts(Connection c) throws Exception {
        String sql = """
                SELECT p.id, c.slug, sc.slug AS sub_slug, p.title, p.status, p.status_before_trash, p.story_json, p.author_id,
                       p.published_at, p.created_at, p.updated_at
                  FROM posts p
                  JOIN categories c ON c.id = p.category_id
                  LEFT JOIN categories sc ON sc.id = p.sub_category_id
                 WHERE p.deleted_at IS NULL AND c.slug IN ('review', 'interview', 'project')
                 ORDER BY p.id
                """;
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                Map<String, Object> s = parse(rs.getString("story_json"));
                Row row = new Row(rs);
                switch (rs.getString("slug")) {
                    case "review" -> review(c, row, s, rs.getString("sub_slug"));
                    case "interview" -> interview(c, row, s);
                    default -> project(c, row, s);
                }
            }
        }
    }

    /** 세 표가 같이 가진 칸 */
    private record Row(long id, String title, String status, String statusBeforeTrash, long authorId,
                       Timestamp publishedAt, Timestamp createdAt, Timestamp updatedAt) {
        Row(ResultSet rs) throws Exception {
            this(rs.getLong("id"), rs.getString("title"), status(rs.getString("status")), rs.getString("status_before_trash"),
                    rs.getLong("author_id"), rs.getTimestamp("published_at"), rs.getTimestamp("created_at"), rs.getTimestamp("updated_at"));
        }

        private static String status(String s) {
            return "PUBLISHED".equals(s) || "HIDDEN".equals(s) ? s : "DRAFT";
        }
    }

    private static void review(Connection c, Row r, Map<String, Object> s, String subSlug) throws Exception {
        String category = REVIEW_CATS.get(text(s.get("cat")));
        if (category == null) {
            category = REVIEW_SUBS.getOrDefault(subSlug, "생활");
        }
        List<String> tags = new ArrayList<>();
        for (Object o : list(s.get("tags"))) {
            if (o instanceof Number n && n.intValue() >= 0 && n.intValue() < REVIEW_TAGS.size()) {
                tags.add(REVIEW_TAGS.get(n.intValue()));
            }
        }
        List<String> body = new ArrayList<>();
        for (Object o : list(s.get("body"))) {
            if (!text(o).isEmpty()) {
                body.add(String.valueOf(o).trim());
            }
        }
        insert(c, "reviews", r, new Object[][] {
                {"category", category}, {"cohort", cohort(s.get("cohort"))}, {"senior_name", blank(s.get("author"))},
                {"track", blank(s.get("track"))}, {"summary", blank(s.get("summary"))}, {"body", body.isEmpty() ? null : String.join("\n\n", body)},
                {"tags", tags.isEmpty() ? null : String.join(" ", tags)}, {"ticker", blank(s.get("ticker"))},
                {"show_on_hub", Boolean.TRUE.equals(s.get("hub"))}, {"photos", photos(s)}});
    }

    private static void interview(Connection c, Row r, Map<String, Object> s) throws Exception {
        Integer cohort = cohort(s.get("cohort"));
        String videoUrl = null, videoLength = null;
        if (s.get("video") instanceof Map<?, ?> v && !text(v.get("yt")).isEmpty()) {
            videoUrl = "https://www.youtube.com/watch?v=" + text(v.get("yt"));
            videoLength = blank(v.get("dur"));
        }
        insert(c, "interviews", r, new Object[][] {
                {"cohort", cohort == null ? 1 : cohort}, {"senior_name", blank(s.get("author"))}, {"track", blank(s.get("track"))},
                {"kicker", blank(s.get("kicker"))}, {"quote", blank(s.get("quote"))}, {"summary", blank(s.get("summary"))},
                {"qa", list(s.get("qa")).isEmpty() ? null : write(s.get("qa"))}, {"video_url", videoUrl}, {"video_length", videoLength},
                {"photos", photos(s)}});
    }

    private static void project(Connection c, Row r, Map<String, Object> s) throws Exception {
        // "AI셈블 · 5명" → 팀 이름 · 인원, "6기 · 01반" → 기수 · 반
        String team = text(s.get("team")), term = text(s.get("term"));
        String teamName = team;
        Integer teamSize = null;
        Matcher tm = TEAM.matcher(team);
        if (tm.matches()) {
            teamName = tm.group(1).trim();
            teamSize = Integer.valueOf(tm.group(2));
        }
        Integer cohort = null;
        Matcher cm = COHORT.matcher(term);
        if (cm.find()) {
            cohort = Integer.valueOf(cm.group(1));
        }
        String className = term.contains("·") ? term.substring(term.indexOf('·') + 1).trim() : (cohort == null ? term : "");
        // 세 칸(문제 정의 · 주요 기능 · 기술 설명): 제목으로 찾고, 없으면 순서대로
        String[] sec = new String[3];
        List<?> sections = list(s.get("sections"));
        for (int i = 0; i < sections.size(); i++) {
            if (sections.get(i) instanceof Map<?, ?> m) {
                String h = text(m.get("h"));
                int at = h.contains("문제") ? 0 : h.contains("기능") ? 1 : h.contains("기술") ? 2 : i;
                if (at < 3 && sec[at] == null) {
                    sec[at] = blank(m.get("p"));
                }
            }
        }
        List<String> tags = new ArrayList<>();
        for (Object o : list(s.get("tags"))) {
            if (!text(o).isEmpty()) {
                tags.add(text(o));
            }
        }
        insert(c, "projects", r, new Object[][] {
                {"cohort", cohort}, {"class_name", className.isEmpty() ? null : cut(className, 20)}, {"major", cut(blank(s.get("type")), 30)},
                {"team_name", cut(teamName.isEmpty() ? null : teamName, 60)}, {"team_size", teamSize},
                {"headline", blank(s.get("headline"))}, {"card_summary", blank(s.get("cardSummary"))}, {"summary", blank(s.get("summary"))},
                {"problem", sec[0]}, {"features", sec[1]}, {"tech", sec[2]},
                {"tags", tags.isEmpty() ? null : cut(String.join(" ", tags), 300)},
                {"links", list(s.get("links")).isEmpty() ? null : write(s.get("links"))}, {"photos", photos(s)}});
    }

    private static void insert(Connection c, String table, Row r, Object[][] cols) throws Exception {
        StringBuilder names = new StringBuilder("id, title, status, status_before_trash, author_id, published_at, created_at, updated_at");
        StringBuilder marks = new StringBuilder("?, ?, ?, ?, ?, ?, ?, ?");
        for (Object[] col : cols) {
            names.append(", ").append(col[0]);
            marks.append(", ?");
        }
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO " + table + " (" + names + ") VALUES (" + marks + ")")) {
            ps.setLong(1, r.id());
            ps.setString(2, r.title());
            ps.setString(3, r.status());
            ps.setString(4, r.statusBeforeTrash());
            ps.setLong(5, r.authorId());
            ps.setTimestamp(6, r.publishedAt());
            ps.setTimestamp(7, r.createdAt());
            ps.setTimestamp(8, r.updatedAt());
            int i = 9;
            for (Object[] col : cols) {
                Object v = col[1];
                if (v == null) {
                    ps.setNull(i++, Types.NULL);
                } else if (v instanceof Integer n) {
                    ps.setInt(i++, n);
                } else if (v instanceof Boolean b) {
                    ps.setBoolean(i++, b);
                } else {
                    ps.setString(i++, String.valueOf(v));
                }
            }
            ps.executeUpdate();
        }
    }

    // ── 값 다듬기 ──

    private static Map<String, Object> parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            Map<String, Object> m = JSON.readValue(raw, new TypeReference<LinkedHashMap<String, Object>>() {});
            return m == null ? new LinkedHashMap<>() : m;
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    private static String write(Object v) throws Exception {
        return JSON.writeValueAsString(v);
    }

    /** 사진 · 대표 사진 · 사이트에서 가져온 그림 → JSON 하나(없으면 NULL) */
    private static String photos(Map<String, Object> s) throws Exception {
        Map<String, Object> out = new LinkedHashMap<>();
        for (String k : PHOTO_KEYS) {
            if (s.get(k) != null) {
                out.put(k, s.get(k));
            }
        }
        return out.isEmpty() ? null : write(out);
    }

    private static List<?> list(Object v) {
        return v instanceof List<?> l ? l : List.of();
    }

    private static String text(Object v) {
        return v == null || v instanceof Map || v instanceof List ? "" : String.valueOf(v).replaceAll("\\s+", " ").trim();
    }

    private static String blank(Object v) {
        String t = text(v);
        return t.isEmpty() ? null : t;
    }

    private static String cut(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max).trim();
    }

    private static Integer cohort(Object v) {
        try {
            int n = v instanceof Number num ? num.intValue() : Integer.parseInt(text(v).replaceAll("[^0-9]", ""));
            return n >= 1 && n <= 99 ? n : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
