package egovframework.backoffice.editor;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.safety.Safelist;
import org.springframework.stereotype.Component;

/**
 * 블록 기반 본문(JSON 배열)의 파싱·정화·직렬화.
 *
 * 블록 형식 (에디터 block-editor.js 와 프론트 렌더 fragment front/blocks.html 이 같은 규칙을 사용):
 * <pre>
 *  { "type": "heading",   "level": 2, "html": "..." }
 *  { "type": "paragraph", "align": "left|center|right", "html": "..." }
 *  { "type": "image",     "url": "/uploads/..", "alt": "", "caption": "", "width": "full|medium|small", "align": "left|center|right", "link": "https://.." }
 *  { "type": "quote",     "html": "..." }
 *  { "type": "list",      "style": "bullet|number", "items": ["html", ...] }
 *  { "type": "divider" }
 *  { "type": "table",     "rows": [["html", ...], ...] }           (첫 행은 머리글)
 *  { "type": "code",      "lang": "java", "code": "text" }
 * </pre>
 * 인라인 HTML 은 굵기·기울임·밑줄·취소선·색상·글자 크기·링크만 허용한다(글꼴은 프론트에서 고정).
 */
@Component
public class BlockContent {

    public static final Set<String> TYPES = Set.of("heading", "paragraph", "image", "quote", "list", "divider", "table", "code");
    private static final Set<String> ALIGNS = Set.of("left", "center", "right");
    private static final Set<String> WIDTHS = Set.of("full", "medium", "small");
    private static final Set<String> LIST_STYLES = Set.of("bullet", "number");
    private static final Pattern COLOR = Pattern.compile("^(#[0-9a-fA-F]{3,8}|rgb\\(\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*\\)|[a-zA-Z]{3,20})$");
    private static final Pattern FONT_SIZE = Pattern.compile("^(\\d{1,2}(\\.\\d)?)(px|rem|em)$");
    /** 편집기에서 고를 수 있는 글꼴(Google Fonts). 프론트도 같은 목록을 로드한다. */
    public static final Set<String> FONT_FAMILIES = Set.of(
            "Nanum Gothic", "Nanum Myeongjo", "Gowun Dodum", "Gowun Batang", "Nanum Pen Script", "Do Hyeon");
    private static final Pattern SAFE_URL = Pattern.compile("^(/uploads/[\\w\\-./]+|https?://[^\\s\"'<>]+)$");

    private final ObjectMapper objectMapper;
    private final Safelist inlineSafelist;

    public BlockContent(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.inlineSafelist = new Safelist()
                .addTags("b", "strong", "i", "em", "u", "s", "strike", "br", "span", "a", "sub", "sup", "mark")
                .addAttributes("span", "style")
                .addAttributes("a", "href", "target", "rel")
                .addProtocols("a", "href", "http", "https", "mailto");
    }

    public List<Map<String, Object>> parse(String json) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<Map<String, Object>>>() {});
        } catch (Exception e) {
            throw new IllegalArgumentException("본문 블록 형식이 올바르지 않습니다.", e);
        }
    }

    public String serialize(List<Map<String, Object>> blocks) {
        try {
            return objectMapper.writeValueAsString(blocks);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** 허용되지 않은 블록·속성·HTML 을 제거하고 값 형식을 정규화한다. */
    public List<Map<String, Object>> sanitize(List<Map<String, Object>> blocks) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> raw : blocks) {
            String type = str(raw.get("type"));
            if (!TYPES.contains(type)) {
                continue;
            }
            Map<String, Object> b = new LinkedHashMap<>();
            b.put("type", type);
            switch (type) {
                case "heading" -> {
                    int level = toInt(raw.get("level"), 2);
                    b.put("level", Math.min(3, Math.max(1, level)));
                    b.put("html", cleanInline(str(raw.get("html"))));
                }
                case "paragraph" -> {
                    String align = str(raw.get("align"));
                    b.put("align", ALIGNS.contains(align) ? align : "left");
                    b.put("html", cleanInline(str(raw.get("html"))));
                }
                case "image" -> {
                    String url = str(raw.get("url")).trim();
                    // 주소가 비어 있으면 "사진 자리"(템플릿 뼈대)로 남긴다. 잘못된 주소는 버린다. 프론트는 빈 자리를 그리지 않는다
                    if (!url.isEmpty() && !SAFE_URL.matcher(url).matches()) {
                        continue;
                    }
                    String width = str(raw.get("width"));
                    b.put("url", url);
                    b.put("alt", plain(str(raw.get("alt")), 200));
                    b.put("caption", plain(str(raw.get("caption")), 300));
                    b.put("width", WIDTHS.contains(width) ? width : "full");
                    String align = str(raw.get("align"));
                    b.put("align", ALIGNS.contains(align) ? align : "center");
                    String link = str(raw.get("link")).trim();
                    b.put("link", SAFE_URL.matcher(link).matches() ? link : "");
                }
                case "quote" -> b.put("html", cleanInline(str(raw.get("html"))));
                case "list" -> {
                    String style = str(raw.get("style"));
                    b.put("style", LIST_STYLES.contains(style) ? style : "bullet");
                    List<String> items = new ArrayList<>();
                    if (raw.get("items") instanceof List<?> list) {
                        for (Object item : list) {
                            items.add(cleanInline(str(item)));
                        }
                    }
                    b.put("items", items);
                }
                case "table" -> {
                    List<List<String>> rows = new ArrayList<>();
                    if (raw.get("rows") instanceof List<?> rawRows) {
                        int cols = 0;
                        for (Object r : rawRows) {
                            if (r instanceof List<?> cells && rows.size() < 50) {
                                List<String> row = new ArrayList<>();
                                for (Object c : cells) {
                                    if (row.size() < 12) {
                                        row.add(cleanInline(str(c)));
                                    }
                                }
                                cols = Math.max(cols, row.size());
                                rows.add(row);
                            }
                        }
                        for (List<String> row : rows) {
                            while (row.size() < cols) {
                                row.add("");
                            }
                        }
                    }
                    if (rows.isEmpty()) {
                        continue;
                    }
                    b.put("rows", rows);
                }
                case "code" -> {
                    String code = str(raw.get("code"));
                    b.put("lang", str(raw.get("lang")).replaceAll("[^a-zA-Z0-9+#.-]", "").toLowerCase());
                    b.put("code", code.length() > 20000 ? code.substring(0, 20000) : code);
                }
                default -> { /* divider: 추가 속성 없음 */ }
            }
            result.add(b);
        }
        return result;
    }

    /** 대표 이미지 자동 지정용: 본문에서 첫 이미지 URL */
    public String firstImageUrl(List<Map<String, Object>> blocks) {
        for (Map<String, Object> b : blocks) {
            if ("image".equals(b.get("type")) && !str(b.get("url")).isBlank()) {
                return str(b.get("url"));
            }
        }
        return null;
    }

    /** 요약 자동 생성용: 텍스트 블록의 순수 텍스트 */
    public String plainText(List<Map<String, Object>> blocks, int maxLength) {
        StringBuilder sb = new StringBuilder();
        for (Map<String, Object> b : blocks) {
            String type = str(b.get("type"));
            if (type.equals("paragraph") || type.equals("heading") || type.equals("quote")) {
                append(sb, Jsoup.parse(str(b.get("html"))).text());
            } else if (type.equals("list") && b.get("items") instanceof List<?> items) {
                for (Object item : items) {
                    append(sb, Jsoup.parse(str(item)).text());
                }
            }
            if (sb.length() >= maxLength) {
                break;
            }
        }
        String text = sb.toString().trim();
        return text.length() > maxLength ? text.substring(0, maxLength - 1) + "…" : text;
    }

    private static void append(StringBuilder sb, String text) {
        if (text == null || text.isBlank()) {
            return;
        }
        if (sb.length() > 0) {
            sb.append(' ');
        }
        sb.append(text.trim());
    }

    /** 인라인 서식 HTML 정화: 허용 태그 외 제거, span style 은 색상·크기·굵기·기울임·밑줄만 유지 */
    String cleanInline(String html) {
        if (html == null || html.isBlank()) {
            return "";
        }
        Document doc = Jsoup.parseBodyFragment(html);
        for (Element span : doc.select("span[style]")) {
            span.attr("style", filterStyle(span.attr("style")));
            if (span.attr("style").isEmpty()) {
                span.removeAttr("style");
            }
        }
        for (Element a : doc.select("a[href]")) {
            a.attr("target", "_blank");
            a.attr("rel", "noopener noreferrer");
        }
        String body = doc.body().html();
        return Jsoup.clean(body, "", inlineSafelist, new Document.OutputSettings().prettyPrint(false));
    }

    static String filterStyle(String style) {
        StringBuilder kept = new StringBuilder();
        for (String decl : style.split(";")) {
            String[] kv = decl.split(":", 2);
            if (kv.length != 2) {
                continue;
            }
            String prop = kv[0].trim().toLowerCase();
            String value = kv[1].trim();
            boolean ok = switch (prop) {
                case "color", "background-color" -> COLOR.matcher(value).matches();
                case "font-size" -> FONT_SIZE.matcher(value).matches();
                case "font-family" -> FONT_FAMILIES.contains(fontName(value));
                case "font-weight" -> value.matches("^(bold|normal|[1-9]00)$");
                case "font-style" -> value.matches("^(italic|normal)$");
                case "text-decoration", "text-decoration-line" -> value.matches("^(underline|line-through|none)( (underline|line-through))?$");
                default -> false;
            };
            if (ok) {
                if (prop.equals("font-family")) {
                    value = "'" + fontName(value) + "'";
                }
                kept.append(prop).append(": ").append(value).append("; ");
            }
        }
        return kept.toString().trim();
    }

    /** "'Nanum Gothic', sans-serif" 같은 값에서 첫 글꼴 이름만 (따옴표 제거) */
    private static String fontName(String value) {
        String first = value.split(",")[0].trim();
        return first.replaceAll("^[\"']|[\"']$", "").trim();
    }

    private static String plain(String s, int max) {
        String t = Jsoup.parse(s == null ? "" : s).text().trim();
        return t.length() > max ? t.substring(0, max) : t;
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    private static int toInt(Object o, int def) {
        if (o instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(o));
        } catch (Exception e) {
            return def;
        }
    }
}
