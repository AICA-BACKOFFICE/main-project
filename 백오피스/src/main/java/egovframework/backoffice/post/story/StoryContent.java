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
 * 후기     { cat, cohort, author, track, summary, body[], tags[], ticker, hub, photos[], cover, img }   cat: life · class · proj · job · path (예전 career), tags: 0~6
 * 인터뷰   { cohort, author, track, summary, quote, kicker, photos[], cover, img, video{yt,dur}, qa[{q,a,toc}] }
 * 프로젝트 { summary, headline, cardSummary, tags[], team, type, term, photos[], cover, img, sections[{h,p}], links[{label,url}] }
 *          hub: 한눈에 보기 포스트잇에 보이기 · kicker: 한눈에 보기 큰 인터뷰의 작은 꼬리표 · headline/cardSummary: 프로젝트 카드의 한 줄 제목과 짧은 요약
 * 기수 기록 { cohort, date, summary, tags[], photos[], cover, img, video{url,dur}, body[] }            tags: 0~9
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
    public static final List<String> COHORT_TAGS = List.of("입교식", "OT", "특강", "기업탐방", "중간발표회", "해커톤", "프로젝트", "취업박람회", "수료식", "동문회");
    /** 후기 분야(2026-10-14 시안: 취업·진로 → 취업 성공 · 진로 고민). career 는 예전 글을 위해 남겨 둠(사이트에서는 취업 성공으로 보임) */
    public static final Map<String, String> REVIEW_CATS = linked("life", "생활", "class", "수업", "proj", "프로젝트", "job", "취업 성공", "path", "진로 고민", "career", "취업·진로");

    private static final Pattern ANCHOR = Pattern.compile("[a-z][a-z0-9-]{0,40}");
    private static final Pattern UPLOAD = Pattern.compile("/uploads/[\\w\\-./]+");
    private static final Pattern SITE_ASSET = Pattern.compile("assets/[\\w\\-./]+");
    private static final int MAX_PHOTOS = 12;
    private static final Pattern YT_ID = Pattern.compile("[\\w-]{6,20}");
    private static final Pattern YT_IN_URL = Pattern.compile("(?:youtube\\.com/(?:watch\\?(?:.*&)?v=|embed/|shorts/|live/)|youtu\\.be/)([\\w-]{6,20})");
    private static final Pattern DURATION = Pattern.compile("\\d{1,3}:\\d{2}");
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

    public String serialize(Map<String, Object> story) {
        try {
            return json.writeValueAsString(story);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * 양식 값을 종류에 맞게 정리한다(모르는 칸은 버리고 길이를 자른다). publishing 이면 사이트에 꼭 필요한 칸이 비었는지 확인한다.
     */
    public Map<String, Object> normalize(StoryKind kind, String raw, boolean publishing) {
        Map<String, Object> in = parse(raw);
        Map<String, Object> out = new LinkedHashMap<>();
        String anchor = text(in.get("anchor"), 40);
        if (kind != StoryKind.COHORT && ANCHOR.matcher(anchor).matches()) {
            out.put("anchor", anchor);
        }
        switch (kind) {
            case REVIEW -> {
                String cat = text(in.get("cat"), 10);
                put(out, "cat", REVIEW_CATS.containsKey(cat) ? cat : null);
                put(out, "summary", text(in.get("summary"), 1000));
                put(out, "body", paragraphs(in.get("body"), 40, 4000));
                put(out, "cohort", cohort(in.get("cohort")));
                put(out, "author", text(in.get("author"), 30));
                put(out, "track", text(in.get("track"), 40));
                put(out, "tags", indexes(in.get("tags"), REVIEW_TAGS.size()));
                put(out, "ticker", text(in.get("ticker"), 80));
                if (Boolean.TRUE.equals(in.get("hub"))) {
                    out.put("hub", true);
                }
                photos(out, in);
                put(out, "heroImg", image(in.get("heroImg")));
                if (publishing) {
                    require(out, "cat", "후기 분야(생활·수업·프로젝트·취업 성공·진로 고민)를 골라 주세요.");
                    require(out, "cohort", "기수를 입력해 주세요.");
                    require(out, "author", "이름을 입력해 주세요.");
                    require(out, "track", "직군(트랙)을 입력해 주세요.");
                    require(out, "summary", "굵은 첫 문단(요약)을 입력해 주세요.");
                    require(out, "body", "본문 문단을 하나 이상 입력해 주세요.");
                }
            }
            case INTERVIEW -> {
                put(out, "quote", text(in.get("quote"), 300));
                put(out, "kicker", text(in.get("kicker"), 30));
                put(out, "summary", text(in.get("summary"), 1000));
                put(out, "cohort", cohort(in.get("cohort")));
                put(out, "author", text(in.get("author"), 30));
                put(out, "track", text(in.get("track"), 40));
                photos(out, in);
                put(out, "imgLarge", image(in.get("imgLarge")));
                put(out, "art", art(in.get("art")));
                put(out, "video", video(in.get("video"), false));
                put(out, "qa", qa(in.get("qa")));
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
                put(out, "tags", hashtags(in.get("tags")));
                put(out, "summary", text(in.get("summary"), 1000));
                put(out, "headline", text(in.get("headline"), 120));
                put(out, "cardSummary", text(in.get("cardSummary"), 200));
                put(out, "team", text(in.get("team"), 60));
                put(out, "type", text(in.get("type"), 30));
                put(out, "term", text(in.get("term"), 40));
                photos(out, in);
                put(out, "art", art(in.get("art")));
                put(out, "heroArt", art(in.get("heroArt")));
                put(out, "sections", sections(in.get("sections")));
                put(out, "links", links(in.get("links")));
                if (publishing) {
                    require(out, "summary", "요약을 입력해 주세요.");
                    require(out, "team", "팀을 입력해 주세요.");
                    require(out, "type", "유형을 입력해 주세요.");
                    require(out, "term", "기간을 입력해 주세요.");
                }
            }
            case COHORT -> {
                put(out, "cohort", cohort(in.get("cohort")));
                put(out, "tags", indexes(in.get("tags"), COHORT_TAGS.size()));
                put(out, "summary", text(in.get("summary"), 1000));
                put(out, "date", text(in.get("date"), 20));
                photos(out, in);
                put(out, "art", art(in.get("art")));
                put(out, "video", video(in.get("video"), true));
                put(out, "body", paragraphs(in.get("body"), 40, 4000));
                if (publishing) {
                    require(out, "cohort", "기수를 입력해 주세요.");
                    require(out, "date", "날짜를 입력해 주세요.");
                    require(out, "summary", "요약을 입력해 주세요.");
                }
            }
            default -> { }
        }
        return out;
    }

    // ── 게시물 칸에 넣을 값 ──

    public String summaryOf(Map<String, Object> story) {
        return text(story.get("summary"), 1000);
    }

    /** 세부 카테고리: 후기는 분야(review-life…), 기수 기록은 기수(cohort-7 · cohort-6 · cohort-3-5) */
    public String subCategorySlug(StoryKind kind, Map<String, Object> story) {
        if (kind == StoryKind.REVIEW) {
            String cat = text(story.get("cat"), 10);
            return cat.isEmpty() ? null : "review-" + ("proj".equals(cat) ? "project" : cat);   // review-life · class · project · job · path (예전 career)
        }
        if (kind == StoryKind.COHORT && story.get("cohort") instanceof Number n) {
            int c = n.intValue();
            return c >= 3 && c <= 5 ? "cohort-3-5" : c == 6 || c == 7 ? "cohort-" + c : null;
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
                if (!text(s.get("quote"), 300).isEmpty()) {
                    b.add(block("quote", "html", esc(text(s.get("quote"), 300))));
                }
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
                paragraph(b, join(" · ", text(s.get("team"), 60), text(s.get("type"), 30), text(s.get("term"), 40)), true);
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
                paragraph(b, join(" · ", s.get("cohort") instanceof Number n ? n + "기" : "", text(s.get("date"), 20),
                        String.join(" ", names(s.get("tags"), COHORT_TAGS))), true);
                paragraph(b, text(s.get("summary"), 1000), true);
                for (Object p : list(s.get("body"))) {
                    paragraph(b, String.valueOf(p), false);
                }
                if (s.get("video") instanceof Map<?, ?> v && v.get("url") != null) {
                    paragraph(b, "영상: " + v.get("url"), false);
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

    static String youtubeId(String raw) {
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
