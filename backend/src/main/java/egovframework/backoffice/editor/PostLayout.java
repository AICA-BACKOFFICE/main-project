package egovframework.backoffice.editor;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.Getter;

/**
 * 글 화면 레이아웃 설정. 글쓰기 "레이아웃" 패널(static/js/post/layout.js)이 만든 JSON 을 서버에서 허용값으로만 정리해 저장하고,
 * 미리보기(front/post.html)와 공개 API 가 같은 객체를 읽어 화면을 구성한다.
 *
 * <pre>
 * { "preset": "basic|wide|side-left|side-right|hero|magazine",
 *   "align":  "center|left",            // 전체 정렬
 *   "width":  "normal|wide",            // 글 영역 폭
 *   "header": ["category","title","meta","thumbnail","summary"],   // 글 머리 요소(순서대로)
 *   "sidebar":["toc","author","recent","related","share"],         // 2단 프리셋에서만 표시
 *   "footer": ["share","related"] }                                // 본문 아래
 * </pre>
 */
@Getter
public final class PostLayout {

    public static final List<String> PRESETS = List.of("basic", "wide", "side-left", "side-right", "hero", "magazine");
    public static final Set<String> HEADER_ITEMS = new LinkedHashSet<>(List.of("category", "title", "meta", "thumbnail", "summary"));
    public static final Set<String> WIDGET_ITEMS = new LinkedHashSet<>(List.of("toc", "author", "recent", "related", "share"));

    private static final ObjectMapper JSON = new ObjectMapper();

    private final String preset;
    private final String align;
    private final String width;
    private final List<String> header;
    private final List<String> sidebar;
    private final List<String> footer;

    private PostLayout(String preset, String align, String width, List<String> header, List<String> sidebar, List<String> footer) {
        this.preset = preset;
        this.align = align;
        this.width = width;
        this.header = List.copyOf(header);
        this.sidebar = List.copyOf(sidebar);
        this.footer = List.copyOf(footer);
    }

    public static PostLayout defaults() {
        return new PostLayout("basic", "center", "normal",
                List.of("category", "title", "meta", "thumbnail", "summary"),
                List.of("toc", "author", "recent"),
                List.of("share", "related"));
    }

    /** 느슨하게 읽는다: 비어 있거나 깨진 JSON 은 기본값, 모르는 값은 버린다. 제목은 항상 머리에 포함. */
    public static PostLayout parse(String json) {
        PostLayout d = defaults();
        if (json == null || json.isBlank()) {
            return d;
        }
        JsonNode n;
        try {
            n = JSON.readTree(json);
        } catch (JsonProcessingException e) {
            return d;
        }
        if (n == null || !n.isObject()) {
            return d;
        }
        String preset = pick(n, "preset", PRESETS, d.preset);
        String align = pick(n, "align", List.of("center", "left"), d.align);
        String width = pick(n, "width", List.of("normal", "wide"), d.width);
        List<String> header = list(n.get("header"), HEADER_ITEMS, d.header);
        if (!header.contains("title")) {
            header = new ArrayList<>(header);
            header.add(0, "title");
        }
        List<String> sidebar = list(n.get("sidebar"), WIDGET_ITEMS, d.sidebar);
        List<String> footer = list(n.get("footer"), WIDGET_ITEMS, d.footer);
        // 같은 위젯이 사이드바와 하단에 동시에 있으면 사이드바 쪽만 남긴다
        List<String> f2 = new ArrayList<>();
        for (String s : footer) {
            if (!sidebar.contains(s)) {
                f2.add(s);
            }
        }
        return new PostLayout(preset, align, width, header, sidebar, f2);
    }

    /** 저장용 정규화 JSON. 기본값과 같으면 null 을 돌려 컬럼을 비워 둔다. */
    public static String normalize(String json) {
        PostLayout l = parse(json);
        return l.toMap().equals(defaults().toMap()) ? null : l.toJson();
    }

    public boolean isHasSidebar() {
        return preset.startsWith("side-");
    }

    /** left / right / none */
    public String getSidebarSide() {
        return "side-left".equals(preset) ? "left" : "side-right".equals(preset) ? "right" : "none";
    }

    /** 본문 CSS 클래스: 프리셋·정렬·폭 */
    public String getCssClass() {
        return "lo-" + preset + " lo-align-" + align + " lo-width-" + width;
    }

    public boolean shows(String item) {
        return header.contains(item);
    }

    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("preset", preset);
        m.put("align", align);
        m.put("width", width);
        m.put("header", header);
        m.put("sidebar", sidebar);
        m.put("footer", footer);
        return m;
    }

    public String toJson() {
        try {
            return JSON.writeValueAsString(toMap());
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String pick(JsonNode n, String key, List<String> allowed, String def) {
        JsonNode v = n.get(key);
        return v != null && v.isTextual() && allowed.contains(v.asText()) ? v.asText() : def;
    }

    private static List<String> list(JsonNode arr, Set<String> allowed, List<String> def) {
        if (arr == null || !arr.isArray()) {
            return def;
        }
        List<String> out = new ArrayList<>();
        for (JsonNode v : arr) {
            if (v.isTextual() && allowed.contains(v.asText()) && !out.contains(v.asText())) {
                out.add(v.asText());
            }
        }
        return out;
    }
}
