package egovframework.backoffice.post.story;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

/**
 * 선배들의 이야기 고정 양식 값(story_json) — 정리 · 확인 · 본문 블록 만들기.
 * <pre>
 * 후기     { cat, cohort, author, summary, body[], tags[], hub, photos[], cover, img }   cat: life · class · proj · job · path (예전 career), tags: 0~6
 *          (반 · 직군 track · 흐르는 한마디 ticker 는 2026-10-20부터 후기에 없음. 사이트 흐르는 띠는 요약의 첫 문장)
 * 인터뷰   { cohort, author, track, summary, photos[], cover, img, video{yt,dur}, qa[{q,a,toc}] }
 * 프로젝트 { summary, headline, tags[], cohort, className, major, teamName, teamSize, photos[], cover, img, sections[{h,p}], links[{label,url}] }
 *          hub: 한눈에 보기 포스트잇에 보이기 (한눈에 보기 큰 인터뷰의 꼬리표 · 인용은 2026-10-20부터 사이트 페이지 글)
 *          프로젝트: 글 제목 = 서비스 이름(service_name) · headline = 프로젝트 주제(project_subject, 카드 큰 제목) · summary = 한 줄 요약(카드 제목 아래 · 상세 첫 문단)
 *          프로젝트의 예전 모양(team "AI셈블 · 5명" · type 전공 · term "6기 · 01반")은 읽을 때 새 칸으로 나눈다. 사이트에는 {@link #projectMeta} 로 다시 합쳐 보낸다
 * 공통     img { src, alt, w, h, fit{x,y,z} } — src 는 /uploads/… (관리자 업로드) 또는 assets/… (사이트에 원래 있던 그림)
 *          photos 는 사진 여러 장(최대 12장, 글을 열면 넘겨 봄), cover 는 그중 대표(카드 썸네일) 번호. img 는 늘 대표 사진과 같다
 *          fit 은 썸네일 맞추기: 카드 틀 안에서 보일 위치(x · y, 0~100%)와 확대(z, 1~3배). 사진 파일은 그대로
 *          anchor · heroImg · imgLarge · art · heroArt 는 사이트에서 가져온 글이 원래 모양을 지키려고 그대로 들고 있는 값
 * </pre>
 * 사이트는 이 값을 글자로만 넣는다(stories-render.js 가 이스케이프). 그림 SVG(art)만 마크업이라 위험한 내용이 있으면 버린다.
 */
@Component
public class StoryContent {

    public static final List<String> REVIEW_TAGS = List.of("#비전공자", "#타지출신", "#직장인출신", "#졸업생", "#적응", "#팀활동", "#취업연계");
    /** 후기 분야(2026-10-14 시안: 취업·진로 → 취업 성공 · 진로 고민). 예전 글의 career 는 취업 성공(job)으로 읽는다 */
    public static final Map<String, String> REVIEW_CATS = linked("life", "생활", "class", "수업", "proj", "프로젝트", "job", "취업 성공", "path", "진로 고민");

    private static final Pattern TEAM = Pattern.compile("^(.*?)\\s*·\\s*(\\d{1,3})\\s*명$");
    private static final Pattern TERM_COHORT = Pattern.compile("(\\d{1,2})\\s*기");
    private static final Pattern UPLOAD = Pattern.compile("/uploads/[\\w\\-./]+");
    private static final Pattern SITE_ASSET = Pattern.compile("assets/[\\w\\-./]+");
    private static final int MAX_PHOTOS = 12;
    private static final Pattern YT_ID = Pattern.compile("[\\w-]{6,20}");
    private static final Pattern YT_IN_URL = Pattern.compile("(?:youtube\\.com/(?:watch\\?(?:.*&)?v=|embed/|shorts/|live/)|youtu\\.be/)([\\w-]{6,20})");
    private static final Pattern DURATION = Pattern.compile("\\d{1,3}:\\d{2}");
    private static final Pattern DATE = Pattern.compile("(\\d{4})\\s*[-.]\\s*(\\d{1,2})\\s*[-.]\\s*(\\d{1,2})\\.?");
    private static final Pattern HTTP = Pattern.compile("https?://[^\\s\"'<>]+");
    private static final Pattern SVG_DANGER = Pattern.compile(
            "<script|javascript:|\\son[a-z]+\\s*=|<foreignobject|<iframe|<object|<embed|<image[^>]+href\\s*=\\s*['\"]?(?!data:image/)|<use[^>]+href\\s*=\\s*['\"]?(?!#)",
            Pattern.CASE_INSENSITIVE);

    private final ObjectMapper json;

    public StoryContent(ObjectMapper json) {
        this.json = json;
    }

    // ── 읽기 · 쓰기 ──

    public Map<String, Object> parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            Map<String, Object> map = json.readValue(raw, new TypeReference<LinkedHashMap<String, Object>>() {});
            return map == null ? new LinkedHashMap<>() : map;
        } catch (Exception e) {
            throw new IllegalArgumentException("글 양식 내용을 읽지 못했습니다. 화면을 새로 고친 뒤 다시 저장해 주세요.", e);
        }
    }

    public String serialize(Object story) {
        try {
            return json.writeValueAsString(story);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** JSON 목록(인터뷰 질문과 답 · 프로젝트 링크 칸). 못 읽으면 빈 목록 */
    public List<?> parseList(String raw) {
        try {
            Object v = raw == null || raw.isBlank() ? null : json.readValue(raw, Object.class);
            return v instanceof List<?> l ? l : List.of();
        } catch (Exception e) {
            return List.of();
        }
    }

    /**
     * 양식 값을 종류에 맞게 정리한다(모르는 칸은 버리고 길이를 자른다). publishing 이면 사이트에 꼭 필요한 칸이 비었는지 확인한다.
     */
    public Map<String, Object> normalize(StoryKind kind, String raw, boolean publishing) {
        Map<String, Object> in = parse(raw);
        Map<String, Object> out = new LinkedHashMap<>();
        switch (kind) {
            case REVIEW -> {
                String cat = text(in.get("cat"), 10);
                cat = "career".equals(cat) ? "job" : cat;
                put(out, "cat", REVIEW_CATS.containsKey(cat) ? cat : null);
                put(out, "summary", text(in.get("summary"), 1000));
                put(out, "body", paragraphs(in.get("body"), 40, 4000));
                put(out, "cohort", cohort(in.get("cohort")));
                put(out, "author", maskName(text(in.get("author"), 30)));
                put(out, "tags", indexes(in.get("tags"), REVIEW_TAGS.size()));
                if (Boolean.TRUE.equals(in.get("hub"))) {
                    out.put("hub", true);
                }
                photos(out, in);
                put(out, "heroImg", image(in.get("heroImg")));
                hideName(out, text(in.get("author"), 30), "summary", "body");
                if (publishing) {
                    require(out, "cat", "후기 분야(생활·수업·프로젝트·취업 성공·진로 고민)를 골라 주세요.");
                    require(out, "cohort", "기수를 입력해 주세요.");
                    require(out, "author", "이름을 입력해 주세요.");
                    require(out, "summary", "굵은 첫 문단(요약)을 입력해 주세요.");
                    require(out, "body", "본문 문단을 하나 이상 입력해 주세요.");
                }
            }
            case INTERVIEW -> {
                put(out, "summary", text(in.get("summary"), 1000));
                put(out, "cohort", cohort(in.get("cohort")));
                put(out, "author", maskName(text(in.get("author"), 30)));
                put(out, "track", text(in.get("track"), 40));
                photos(out, in);
                put(out, "imgLarge", image(in.get("imgLarge")));
                put(out, "art", art(in.get("art")));
                put(out, "video", video(in.get("video"), false));
                put(out, "qa", qa(in.get("qa")));
                hideName(out, text(in.get("author"), 30), "summary", "qa");
                if (publishing) {
                    require(out, "cohort", "기수를 입력해 주세요.");
                    require(out, "author", "이름을 입력해 주세요.");
                    require(out, "track", "직군(트랙)을 입력해 주세요.");
                    require(out, "summary", "요약을 입력해 주세요.");
                    if (!out.containsKey("qa") && !out.containsKey("video")) {
                        throw new IllegalArgumentException("질문과 답을 하나 이상 넣거나 유튜브 영상 주소를 넣어 주세요.");
                    }
                }
            }
            case PROJECT -> {
                upgradeProject(in);
                put(out, "tags", hashtags(in.get("tags")));
                put(out, "summary", text(in.get("summary"), 1000));
                put(out, "headline", text(in.get("headline"), 200));
                put(out, "cohort", cohort(in.get("cohort")));
                put(out, "className", text(in.get("className"), 20));
                put(out, "major", text(in.get("major"), 30));
                put(out, "teamName", text(in.get("teamName"), 60));
                Integer size = cohort(in.get("teamSize"));   // 1~99 숫자
                put(out, "teamSize", size);
                photos(out, in);
                put(out, "art", art(in.get("art")));
                put(out, "heroArt", art(in.get("heroArt")));
                put(out, "sections", sections(in.get("sections")));
                put(out, "links", links(in.get("links")));
                if (publishing) {
                    require(out, "summary", "한 줄 요약을 입력해 주세요.");
                    require(out, "cohort", "기수를 입력해 주세요.");
                    require(out, "className", "반을 입력해 주세요.");
                    require(out, "major", "전공을 입력해 주세요.");
                    require(out, "teamName", "팀 이름을 입력해 주세요.");
                }
            }
            case COHORT -> {
                // 기수별 이모저모(cohort-v3.js): 기수 칩 · 계정 이름(aica_7th)은 기수로, 달별 동그라미는 있었던 날의 연 · 월로 나뉘어요
                put(out, "cohort", cohort(in.get("cohort")));
                put(out, "date", date(in.get("date")));
                put(out, "body", paragraphs(in.get("body"), 40, 4000));
                photos(out, in);
                put(out, "art", art(in.get("art")));   // 사이트 카드에서 가져온 시안 그림(사진이 없는 카드 2개, 2026-10-21)
                put(out, "video", video(in.get("video"), false));
                if (publishing) {
                    require(out, "cohort", "기수를 입력해 주세요.");
                    require(out, "date", "있었던 날(날짜)을 넣어 주세요. 달별로 나눠 보여 줄 때 써요.");
                    if (!out.containsKey("img") && !out.containsKey("art") && !out.containsKey("video")) {
                        throw new IllegalArgumentException("사진을 한 장 이상 올리거나 유튜브 영상 주소를 넣어 주세요. 격자 칸에 보일 그림이 필요해요.");
                    }
                }
            }
            default -> { }
        }
        return out;
    }

    /** 이름을 가리지 않고 그대로 두는 값 */
    private static final Set<String> UNMASKED_NAMES = Set.of("익명");

    /**
     * 선배 이름(후기 · 인터뷰)은 성(첫 글자)만 보이고 나머지는 모두 *로(2026-10-21 사용자 요청): 김민서 · 김*서 → 김**, 백*하늘 → 백***.
     * 띄어쓰기는 빼고, '익명'은 그대로. 이미 가린 이름은 그대로 나온다
     */
    public static String maskName(String name) {
        String s = name == null ? "" : name.replaceAll("\\s+", "");
        if (s.isEmpty() || UNMASKED_NAMES.contains(s)) {
            return s;
        }
        int first = s.offsetByCodePoints(0, 1);
        return s.substring(0, first) + "*".repeat(s.codePointCount(first, s.length()));
    }

    /**
     * 이름을 그대로(김민서 · 김*서) 적었으면 요약 · 본문 · 질문과 답(자기소개 '김민서입니다' 등) 안의 그 이름도 가린 이름(김**)으로 바꾼다.
     * 한 글자 이름 · 익명 · 이미 다 가린 이름은 그대로
     */
    private static void hideName(Map<String, Object> out, String typed, String... keys) {
        String raw = typed == null ? "" : typed.replaceAll("\\s+", "");
        String masked = maskName(raw);
        if (raw.codePointCount(0, raw.length()) < 2 || raw.equals(masked)) {
            return;
        }
        for (String key : keys) {
            if (out.containsKey(key)) {
                out.put(key, replaceText(out.get(key), raw, masked));
            }
        }
    }

    /** 글자 · 글자 목록 · 질문과 답(q · a · toc) 안의 from 을 to 로 */
    private static Object replaceText(Object v, String from, String to) {
        if (v instanceof String s) {
            return s.replace(from, to);
        }
        if (v instanceof List<?> list) {
            List<Object> out = new ArrayList<>();
            list.forEach(o -> out.add(replaceText(o, from, to)));
            return out;
        }
        if (v instanceof Map<?, ?> map) {
            Map<String, Object> out = new LinkedHashMap<>();
            map.forEach((k, o) -> out.put(String.valueOf(k), replaceText(o, from, to)));
            return out;
        }
        return v;
    }

    /** 날짜: 2026-08-20 · 2026. 08. 20 모두 받아 2026-08-20 으로. 날짜가 아니면 null */
    private static String date(Object v) {
        Matcher m = DATE.matcher(text(v, 20));
        if (!m.matches()) {
            return null;
        }
        try {
            return java.time.LocalDate.of(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3))).toString();
        } catch (java.time.DateTimeException e) {
            return null;
        }
    }

    /** 사이트 카드의 날짜 모양: 2026-08-20 → 2026. 08. 20 */
    public static String siteDate(Object v) {
        String iso = date(v);
        return iso == null ? "" : iso.replace("-", ". ");
    }

    /** 프로젝트의 예전 모양(team · type · term 한 칸씩)을 새 칸(팀 이름 · 인원 · 전공 · 기수 · 반)으로 나눈다. 새 칸이 있으면 그대로 */
    private static void upgradeProject(Map<String, Object> in) {
        String team = text(in.get("team"), 80), term = text(in.get("term"), 40), type = text(in.get("type"), 30);
        if (!team.isEmpty() && !in.containsKey("teamName")) {
            Matcher m = TEAM.matcher(team);
            in.put("teamName", m.matches() ? m.group(1).trim() : team);
            if (m.matches()) {
                in.put("teamSize", Integer.valueOf(m.group(2)));
            }
        }
        if (!type.isEmpty() && !in.containsKey("major")) {
            in.put("major", type);
        }
        if (!term.isEmpty() && !in.containsKey("cohort") && !in.containsKey("className")) {
            Matcher m = TERM_COHORT.matcher(term);
            boolean found = m.find();
            if (found) {
                in.put("cohort", Integer.valueOf(m.group(1)));
            }
            String className = term.contains("·") ? term.substring(term.indexOf('·') + 1).trim() : found ? "" : term;
            if (!className.isEmpty()) {
                in.put("className", className);
            }
        }
    }

    /** 사이트가 보여 주는 프로젝트 정보 세 줄: 팀("AI셈블 · 5명") · 전공 · 기수 · 반("6기 · 01반") */
    public static Map<String, String> projectMeta(Map<String, Object> s) {
        Map<String, String> m = new LinkedHashMap<>();
        String size = s.get("teamSize") instanceof Number n ? n + "명" : "";
        m.put("team", join(" · ", text(s.get("teamName"), 60), size));
        m.put("type", text(s.get("major"), 30));
        m.put("term", join(" · ", s.get("cohort") instanceof Number n ? n + "기" : "", text(s.get("className"), 20)));
        return m;
    }

    // ── 게시물 칸에 넣을 값 ──

    public String summaryOf(Map<String, Object> story) {
        return text(story.get("summary"), 1000);
    }

    /** 세부 카테고리: 후기 분야(review-life · class · project · job · path). 다른 종류는 없음 */
    public String subCategorySlug(StoryKind kind, Map<String, Object> story) {
        if (kind == StoryKind.REVIEW) {
            String cat = text(story.get("cat"), 10);
            return cat.isEmpty() ? null : "review-" + ("proj".equals(cat) ? "project" : cat);
        }
        return null;
    }

    /** 목록 대표 이미지: 업로드한 사진은 그대로, 사이트에 원래 있던 그림은 사이트 파일 주소로 */
    public String thumbnail(Map<String, Object> story) {
        for (String key : List.of("img", "heroImg", "imgLarge")) {
            if (story.get(key) instanceof Map<?, ?> m && m.get("src") instanceof String src) {
                return src.startsWith("/uploads/") ? src : "/admin/pages/site/stories/" + src;
            }
        }
        return null;
    }

    /** 관리자 화면(미리보기 · 버전 이력 · 공개 API)에서 보일 본문 블록. 글자는 모두 이스케이프한다 */
    public List<Map<String, Object>> toBlocks(StoryKind kind, Map<String, Object> s) {
        List<Map<String, Object>> b = new ArrayList<>();
        String who = join(" · ", s.get("cohort") instanceof Number n ? n + "기" : "", text(s.get("author"), 30), text(s.get("track"), 40));
        switch (kind) {
            case REVIEW -> {
                images(b, s);
                paragraph(b, join(" · ", REVIEW_CATS.getOrDefault(text(s.get("cat"), 10), ""), who), true);
                paragraph(b, text(s.get("summary"), 1000), true);
                for (Object p : list(s.get("body"))) {
                    paragraph(b, String.valueOf(p), false);
                }
                paragraph(b, String.join(" ", names(s.get("tags"), REVIEW_TAGS)), false);
            }
            case INTERVIEW -> {
                images(b, s);
                paragraph(b, who, true);
                paragraph(b, text(s.get("summary"), 1000), true);
                if (s.get("video") instanceof Map<?, ?> v && v.get("yt") != null) {
                    paragraph(b, "영상: https://www.youtube.com/watch?v=" + v.get("yt"), false);
                }
                int i = 1;
                for (Object o : list(s.get("qa"))) {
                    if (o instanceof Map<?, ?> q) {
                        Map<String, Object> h = block("heading", "html", esc("Q" + i++ + ". " + str(q.get("q"))));
                        h.put("level", 3);
                        b.add(h);
                        paragraph(b, str(q.get("a")), false);
                    }
                }
            }
            case PROJECT -> {
                images(b, s);
                paragraph(b, text(s.get("headline"), 120), true);
                Map<String, String> meta = projectMeta(s);
                paragraph(b, join(" · ", meta.get("team"), meta.get("type"), meta.get("term")), true);
                paragraph(b, text(s.get("summary"), 1000), true);
                paragraph(b, String.join(" ", strings(s.get("tags"))), false);
                for (Object o : list(s.get("sections"))) {
                    if (o instanceof Map<?, ?> sec) {
                        Map<String, Object> h = block("heading", "html", esc(str(sec.get("h"))));
                        h.put("level", 3);
                        b.add(h);
                        paragraph(b, str(sec.get("p")), false);
                    }
                }
                for (Object o : list(s.get("links"))) {
                    if (o instanceof Map<?, ?> l) {
                        paragraph(b, str(l.get("label")) + ": " + str(l.get("url")), false);
                    }
                }
            }
            case COHORT -> {
                images(b, s);
                paragraph(b, join(" · ", s.get("cohort") instanceof Number n ? n + "기" : "", siteDate(s.get("date"))), true);
                if (s.get("video") instanceof Map<?, ?> v && v.get("yt") != null) {
                    paragraph(b, "영상: https://www.youtube.com/watch?v=" + v.get("yt"), false);
                }
                for (Object p : list(s.get("body"))) {
                    paragraph(b, String.valueOf(p), false);
                }
            }
            default -> { }
        }
        return b;
    }

    // ── 칸 정리 ──

    private static void put(Map<String, Object> out, String key, Object value) {
        if (value == null || (value instanceof String s && s.isEmpty()) || (value instanceof List<?> l && l.isEmpty())
                || (value instanceof Map<?, ?> m && m.isEmpty())) {
            return;
        }
        out.put(key, value);
    }

    private static void require(Map<String, Object> out, String key, String message) {
        if (!out.containsKey(key)) {
            throw new IllegalArgumentException(message);
        }
    }

    private static String str(Object v) {
        return v == null ? "" : String.valueOf(v);
    }

    /** 한 줄 글자: 제어 문자 · 연속 공백 정리, 최대 길이 */
    static String text(Object v, int max) {
        if (v == null || v instanceof Map || v instanceof List) {
            return "";
        }
        String s = String.valueOf(v).replaceAll("[\\p{Cntrl}&&[^\\n\\t]]", "").replaceAll("\\s+", " ").trim();
        return s.length() > max ? s.substring(0, max).trim() : s;
    }

    private static List<?> list(Object v) {
        return v instanceof List<?> l ? l : List.of();
    }

    private static List<String> paragraphs(Object v, int maxCount, int maxLength) {
        List<String> out = new ArrayList<>();
        if (v instanceof String s) {
            v = List.of(s.split("\\n\\s*\\n"));
        }
        for (Object o : list(v)) {
            String t = text(o, maxLength);
            if (!t.isEmpty() && out.size() < maxCount) {
                out.add(t);
            }
        }
        return out;
    }

    private static Integer cohort(Object v) {
        try {
            int n = v instanceof Number num ? num.intValue() : Integer.parseInt(text(v, 4).replaceAll("[^0-9]", ""));
            return n >= 1 && n <= 99 ? n : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static List<Integer> indexes(Object v, int size) {
        Set<Integer> out = new LinkedHashSet<>();
        for (Object o : list(v)) {
            Integer i = o instanceof Number n ? Integer.valueOf(n.intValue()) : null;
            if (i != null && i >= 0 && i < size) {
                out.add(i);
            }
        }
        return new ArrayList<>(out);
    }

    private static List<String> hashtags(Object v) {
        List<String> out = new ArrayList<>();
        if (v instanceof String s) {
            v = List.of(s.split("[\\s,]+"));
        }
        for (Object o : list(v)) {
            String t = text(o, 24).replace(" ", "");
            if (t.isEmpty() || t.equals("#")) {
                continue;
            }
            t = t.startsWith("#") ? t : "#" + t;
            if (!out.contains(t) && out.size() < 8) {
                out.add(t);
            }
        }
        return out;
    }

    private static List<String> strings(Object v) {
        List<String> out = new ArrayList<>();
        for (Object o : list(v)) {
            out.add(String.valueOf(o));
        }
        return out;
    }

    private static List<String> names(Object v, List<String> table) {
        List<String> out = new ArrayList<>();
        for (Object o : list(v)) {
            if (o instanceof Number n && n.intValue() >= 0 && n.intValue() < table.size()) {
                out.add(table.get(n.intValue()));
            }
        }
        return out;
    }

    private static Map<String, Object> image(Object v) {
        if (!(v instanceof Map<?, ?> m)) {
            return null;
        }
        String src = text(m.get("src"), 300);
        boolean ok = (UPLOAD.matcher(src).matches() || SITE_ASSET.matcher(src).matches()) && !src.contains("..");
        if (!ok) {
            return null;
        }
        Map<String, Object> img = new LinkedHashMap<>();
        img.put("src", src);
        img.put("alt", text(m.get("alt"), 200));
        Integer w = size(m.get("w")), h = size(m.get("h"));
        if (w != null && h != null) {
            img.put("w", w);
            img.put("h", h);
        }
        Map<String, Object> fit = fit(m.get("fit"));
        if (fit != null) {
            img.put("fit", fit);
        }
        return img;
    }

    /** 사진 여러 장(photos)과 대표(cover → img). 여러 장이 없으면 예전처럼 img 하나만 */
    private static void photos(Map<String, Object> out, Map<String, Object> in) {
        List<Map<String, Object>> photos = new ArrayList<>();
        int wanted = in.get("cover") instanceof Number n ? n.intValue() : -1, cover = -1, i = 0;
        for (Object o : list(in.get("photos"))) {
            Map<String, Object> img = image(o);
            if (img != null && photos.size() < MAX_PHOTOS) {
                if (i == wanted) {
                    cover = photos.size();   // 앞의 잘못된 사진이 빠져도 고른 대표 사진 그대로
                }
                photos.add(img);
            }
            i++;
        }
        if (photos.isEmpty()) {
            put(out, "img", image(in.get("img")));
            return;
        }
        if (cover < 0 && in.get("img") instanceof Map<?, ?> m && m.get("src") instanceof String src) {
            // 대표 번호가 없거나 맞지 않으면 대표 사진(img)과 같은 사진으로
            for (int k = 0; k < photos.size() && cover < 0; k++) {
                if (src.equals(photos.get(k).get("src"))) {
                    cover = k;
                }
            }
        }
        cover = Math.max(0, cover);
        out.put("img", new LinkedHashMap<>(photos.get(cover)));
        out.put("photos", photos);
        out.put("cover", cover);
    }

    /** 썸네일 맞추기: 보일 위치 x · y(0~100%), 확대 z(1~3배). 가운데 · 확대 없음이면 null */
    private static Map<String, Object> fit(Object v) {
        if (!(v instanceof Map<?, ?> m)) {
            return null;
        }
        long x = Math.round(number(m.get("x"), 50, 0, 100)), y = Math.round(number(m.get("y"), 50, 0, 100));
        double z = Math.round(number(m.get("z"), 1, 1, 3) * 100) / 100.0;
        if (x == 50 && y == 50 && z == 1) {
            return null;
        }
        Map<String, Object> fit = new LinkedHashMap<>();
        fit.put("x", x);
        fit.put("y", y);
        fit.put("z", z);
        return fit;
    }

    private static double number(Object v, double fallback, double min, double max) {
        double d = v instanceof Number n ? n.doubleValue() : fallback;
        return Double.isFinite(d) ? Math.max(min, Math.min(max, d)) : fallback;
    }

    private static Integer size(Object v) {
        return v instanceof Number n && n.intValue() > 0 && n.intValue() <= 20000 ? n.intValue() : null;
    }

    /** 사이트에서 가져온 그림(SVG). 스크립트 · 바깥 주소 같은 위험한 내용이 있으면 버린다 */
    private static String art(Object v) {
        if (!(v instanceof String s)) {
            return null;
        }
        String t = s.trim();
        return t.startsWith("<svg") && t.endsWith("</svg>") && t.length() <= 60000 && !SVG_DANGER.matcher(t).find() ? t : null;
    }

    /** 유튜브: 주소나 영상 번호를 받아 번호(yt) 또는 정식 주소(url)로. 길이는 m:ss */
    private static Map<String, Object> video(Object v, boolean asUrl) {
        if (!(v instanceof Map<?, ?> m)) {
            return null;
        }
        String raw = text(m.get(asUrl ? "url" : "yt"), 300);
        if (raw.isEmpty()) {
            raw = text(m.get(asUrl ? "yt" : "url"), 300);
        }
        String id = youtubeId(raw);
        if (id == null) {
            return null;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        if (asUrl) {
            out.put("url", "https://www.youtube.com/watch?v=" + id);
        } else {
            out.put("yt", id);
        }
        String dur = text(m.get("dur"), 8);
        if (DURATION.matcher(dur).matches()) {
            out.put("dur", dur);
        }
        return out;
    }

    public static String youtubeId(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        if (YT_ID.matcher(raw).matches()) {
            return raw;
        }
        Matcher m = YT_IN_URL.matcher(raw);
        return m.find() ? m.group(1) : null;
    }

    private static List<Map<String, Object>> qa(Object v) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object o : list(v)) {
            if (o instanceof Map<?, ?> m && out.size() < 40) {
                String q = text(m.get("q"), 300), a = text(m.get("a"), 6000), toc = text(m.get("toc"), 80);
                if (q.isEmpty() && a.isEmpty()) {
                    continue;
                }
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("q", q);
                item.put("a", a);
                if (!toc.isEmpty() && !toc.equals(q)) {
                    item.put("toc", toc);
                }
                out.add(item);
            }
        }
        return out;
    }

    private static List<Map<String, Object>> sections(Object v) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object o : list(v)) {
            if (o instanceof Map<?, ?> m && out.size() < 3) {
                Map<String, Object> s = new LinkedHashMap<>();
                s.put("h", text(m.get("h"), 40));
                s.put("p", text(m.get("p"), 6000));
                out.add(s);
            }
        }
        // 셋 다 비었으면 칸 없이(사이트는 자리 안내 문구를 보여 줌)
        return out.stream().allMatch(s -> str(s.get("p")).isEmpty() && str(s.get("h")).isEmpty()) ? List.of() : out;
    }

    private static List<Map<String, Object>> links(Object v) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object o : list(v)) {
            if (o instanceof Map<?, ?> m && out.size() < 6) {
                String url = text(m.get("url"), 500);
                if (!HTTP.matcher(url).matches()) {
                    continue;
                }
                Map<String, Object> l = new LinkedHashMap<>();
                l.put("label", text(m.get("label"), 40));
                l.put("url", url);
                out.add(l);
            }
        }
        return out;
    }

    // ── 블록 ──

    private static String esc(String s) {
        return HtmlUtils.htmlEscape(s == null ? "" : s);
    }

    private static String join(String sep, String... parts) {
        List<String> out = new ArrayList<>();
        for (String p : parts) {
            if (p != null && !p.isBlank()) {
                out.add(p);
            }
        }
        return String.join(sep, out);
    }

    private static Map<String, Object> block(String type, String key, Object value) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", type);
        m.put(key, value);
        return m;
    }

    private static void paragraph(List<Map<String, Object>> b, String text, boolean bold) {
        if (text == null || text.isBlank()) {
            return;
        }
        b.add(block("paragraph", "html", bold ? "<b>" + esc(text) + "</b>" : esc(text)));
    }

    /** 사진 여러 장이면 모두, 아니면 대표 사진(예전 후기는 사이트에서 가져온 heroImg) */
    private static void images(List<Map<String, Object>> b, Map<String, Object> s) {
        List<?> photos = list(s.get("photos"));
        if (!photos.isEmpty()) {
            photos.forEach(p -> image(b, p));
            return;
        }
        image(b, s.get("img") != null ? s.get("img") : s.get("heroImg"));
    }

    private static void image(List<Map<String, Object>> b, Object img) {
        if (img instanceof Map<?, ?> m && m.get("src") instanceof String src && src.startsWith("/uploads/")) {
            Map<String, Object> block = block("image", "url", src);
            block.put("alt", str(m.get("alt")));
            b.add(block);
        }
    }

    private static Map<String, String> linked(String... kv) {
        Map<String, String> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            m.put(kv[i], kv[i + 1]);
        }
        return java.util.Collections.unmodifiableMap(m);
    }
}
