package egovframework.backoffice.page;

import static java.nio.charset.StandardCharsets.UTF_8;

import egovframework.backoffice.common.BusinessException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.stereotype.Service;

/**
 * 인사교 라이프 › 시설 둘러보기의 공간별 사진(사진 넘김 · 작은 사진) 관리.
 * <p>
 * 사이트의 life/index.html 에서 층(.bx9-g) › 공간(.bx9-s) › 사진(.bx9-sl)을 읽어 보여 주고, 저장하면 바꾼 공간의
 * 사진 넘김(.bx9-tr) · 작은 사진(.bx9-th) · 첫 사진 설명과 'N장' 표시 · 공간 탭의 동그란 아이콘 · '사진 예시' 표시만 그 자리에서 고쳐 쓴다
 * (나머지 글자는 한 글자도 바꾸지 않음). 쓰기는 카테고리 페이지 관리의 '사이트에 반영'과 같은 길(반영 전 파일은 버전 기록에 백업).
 * 사진 하나는 사이트에 원래 있던 그림(class im-이름, life.css) 또는 새로 올린 그림(assets/uploads/…, 배경 그림 style) 중 하나이고,
 * --bs(확대) · --bp(보이는 위치)로 화면에 보일 부분을 고른다.
 */
@Service
public class LifePhotoService {

    static final String PAGE_ID = "life";
    static final int MAX_PHOTOS = 12;
    static final int MAX_CAPTION = 60;

    private static final Pattern IM_CLASS = Pattern.compile("im-[A-Za-z0-9_-]+");
    private static final Pattern UPLOAD_SRC = Pattern.compile("assets/uploads/[A-Za-z0-9_.-]+\\.(?:webp|png|jpe?g|gif|avif)", Pattern.CASE_INSENSITIVE);
    private static final Pattern SIZE = Pattern.compile("(\\d{3})%");
    private static final String POS_WORD = "(?:\\d{1,3}%|left|right|center|top|bottom)";
    private static final Pattern POS = Pattern.compile(POS_WORD + "(?: " + POS_WORD + ")?");
    private static final Pattern CSS_IM = Pattern.compile("\\.im-([A-Za-z0-9_-]+)\\{background-image:url\\([\"']?\\.\\./assets/([^\"')]+)[\"']?\\)");
    private static final Pattern BG_URL = Pattern.compile("url\\(\\s*[\"']?([^\"')]+)[\"']?\\s*\\)");
    private static final Pattern SPACE_ID = Pattern.compile("bx9s-\\d+-\\d+");

    /** 사진 하나: cls(원래 그림) 또는 src(올린 그림) 중 하나 · bs 확대 · bp 보이는 위치 · caption 설명 */
    public record Photo(String cls, String src, String bs, String bp, String caption) { }

    /** 저장할 공간 하나: badge = "" 표시 안 함 · "ex" 사진 예시 · "tmp" 임시 사진 */
    public record SpaceEdit(String id, String badge, List<Photo> photos) { }

    /**
     * baseHash: 화면을 열 때의 사이트 파일(그사이 다른 곳에서 바뀌었으면 저장하지 않음).
     * spaces 시설 사진 · food 오늘 점심 카드 · fun 바람 쐬러 가요 묶음 — 바꾼 것만 보낸다({@link LifeTipService}).
     */
    public record SaveRequest(String baseHash, List<SpaceEdit> spaces, List<LifeTipService.Food> food, List<LifeTipService.FunGroup> fun) { }

    private final CategoryPageService pages;
    private final LifeTipService tips;

    public LifePhotoService(CategoryPageService pages, LifeTipService tips) {
        this.pages = pages;
        this.tips = tips;
    }

    // ── 읽기 ──

    public Map<String, Object> model(String contextPath) {
        CategoryPage page = pages.page(PAGE_ID);
        String html = pages.published(page);
        Map<String, String> known = knownImages(contextPath);
        Document doc = Jsoup.parse(html);
        Element root = doc.selectFirst("#pg-facility .bx9");
        if (root == null) {
            throw new BusinessException("인사교 라이프 페이지에서 시설 둘러보기(건물 · 사진)를 찾지 못했어요.");
        }
        List<Map<String, Object>> floors = new ArrayList<>();
        for (Element g : root.select(".bx9-g")) {
            Map<String, Object> floor = new LinkedHashMap<>();
            floor.put("g", g.attr("data-g"));
            Element fb = g.selectFirst(".bx9-fb");
            Element h3 = g.selectFirst(".bx9-head h3");
            floor.put("floor", fb == null ? "" : fb.text());
            floor.put("name", h3 == null ? g.attr("aria-label") : h3.text());
            List<Map<String, Object>> spaces = new ArrayList<>();
            for (Element s : g.select(".bx9-s")) {
                Map<String, Object> space = new LinkedHashMap<>();
                space.put("id", s.id());
                space.put("name", spaceName(doc, s));
                Element ex = s.selectFirst(".bx9-ph .bx-ex");
                space.put("badge", ex == null ? "" : ex.hasClass("tmp") ? "tmp" : "ex");
                List<Map<String, Object>> photos = new ArrayList<>();
                for (Element sl : s.select(".bx9-tr > .bx9-sl")) {
                    photos.add(photoOf(sl, known, contextPath));
                }
                space.put("photos", photos);
                spaces.add(space);
            }
            floor.put("spaces", spaces);
            floors.add(floor);
        }
        Map<String, Object> model = new LinkedHashMap<>();
        model.put("hash", hash(html));
        model.put("hasDraft", pages.hasDraft(page));
        model.put("draft", pages.draftSummary(page));   // 임시저장이 있으면 무엇이 바뀌었는지(안내에 보여 줌)
        model.put("defaultFloor", root.attr("data-g"));
        model.put("floors", floors);
        model.put("maxPhotos", MAX_PHOTOS);
        model.putAll(tips.model(doc, known, contextPath));   // 생활 꿀팁: food · fun
        return model;
    }

    /** 공간 이름: 공간 탭의 글자. 공간이 하나뿐인 층(8F 구내식당)은 탭이 없어 안내 카드 제목 · 층 이름으로 */
    private static String spaceName(Document doc, Element space) {
        String tabId = space.attr("aria-labelledby");
        Element tab = tabId.isEmpty() ? null : doc.getElementById(tabId);
        Element b = tab == null ? null : tab.selectFirst("b");
        if (b != null) {
            return b.text();
        }
        Element h4 = space.selectFirst(".bx9-info h4");
        if (h4 != null && !h4.text().isBlank()) {
            return h4.text();
        }
        Element g = space.closest(".bx9-g");
        Element h3 = g == null ? null : g.selectFirst(".bx9-head h3");
        return h3 != null ? h3.text() : space.id();
    }

    private Map<String, Object> photoOf(Element sl, Map<String, String> known, String contextPath) {
        Map<String, Object> photo = new LinkedHashMap<>();
        String cls = sl.classNames().stream().filter(c -> IM_CLASS.matcher(c).matches()).findFirst().orElse("");
        Map<String, String> style = parseStyle(sl.attr("style"));
        String src = "";
        Matcher url = BG_URL.matcher(style.getOrDefault("background-image", ""));
        if (url.find()) {
            src = url.group(1).trim();
        }
        photo.put("cls", cls);
        photo.put("src", src);
        photo.put("bs", style.getOrDefault("--bs", ""));
        photo.put("bp", style.getOrDefault("--bp", ""));
        photo.put("caption", sl.attr("aria-label"));
        photo.put("url", !src.isEmpty() ? contextPath + "/admin/pages/site/life/" + src : known.getOrDefault(cls, ""));
        return photo;
    }

    /** life.css 의 .im-이름{background-image:url(../assets/파일)} → 미리보기 주소 */
    private Map<String, String> knownImages(String contextPath) {
        Map<String, String> map = new LinkedHashMap<>();
        Optional<Path> css = pages.siteFile("life/css/life.css");
        if (css.isEmpty()) {
            return map;
        }
        try {
            Matcher m = CSS_IM.matcher(Files.readString(css.get(), UTF_8));
            while (m.find()) {
                map.putIfAbsent("im-" + m.group(1), contextPath + "/admin/pages/site/life/assets/" + m.group(2));
            }
        } catch (IOException e) {
            throw new BusinessException("인사교 라이프 스타일 파일(life.css)을 읽지 못했어요.");
        }
        return map;
    }

    private static Map<String, String> parseStyle(String style) {
        Map<String, String> map = new LinkedHashMap<>();
        if (style == null) {
            return map;
        }
        for (String part : style.split(";")) {
            int colon = part.indexOf(':');
            if (colon > 0) {
                map.put(part.substring(0, colon).trim().toLowerCase(), part.substring(colon + 1).trim());
            }
        }
        return map;
    }

    // ── 저장 ──

    public synchronized Map<String, Object> save(SaveRequest request, String contextPath) {
        CategoryPage page = pages.page(PAGE_ID);
        List<SpaceEdit> spaces = request == null || request.spaces() == null ? List.of() : request.spaces();
        if (request == null || (spaces.isEmpty() && request.food() == null && request.fun() == null)) {
            throw new BusinessException("저장할 내용이 없어요.");
        }
        if (pages.hasDraft(page)) {
            throw new BusinessException("인사교 라이프에 아직 사이트에 반영하지 않은 페이지 편집(임시저장)이 있어요. "
                    + "카테고리 페이지 관리 › 인사교 라이프에서 먼저 반영하거나 편집을 취소한 뒤 사진을 저장해 주세요.");
        }
        String html = pages.published(page);
        if (request.baseHash() == null || !request.baseHash().equals(hash(html))) {
            throw new BusinessException("화면을 연 뒤에 인사교 라이프 페이지가 바뀌었어요. 화면을 새로 고친 뒤 다시 저장해 주세요(고친 사진은 다시 해 주셔야 해요).");
        }
        Map<String, String> known = knownImages(contextPath);
        Document doc = Jsoup.parse(html);
        String out = html;
        for (SpaceEdit edit : spaces) {
            out = applySpace(out, doc, edit, clean(edit, page, known, html));
        }
        out = tips.applyFood(out, doc, request.food(), page);
        out = tips.applyFun(out, request.fun(), page, known);
        boolean changed = !out.equals(html);
        if (changed) {
            verify(out, spaces);
            tips.verify(Jsoup.parse(out), request.food(), request.fun());
            pages.publish(page, out);
        }
        Map<String, Object> model = model(contextPath);
        model.put("saved", changed);
        return model;
    }

    /** 받은 사진 값 확인 · 정리 */
    private List<Photo> clean(SpaceEdit edit, CategoryPage page, Map<String, String> known, String html) {
        if (edit.id() == null || !SPACE_ID.matcher(edit.id()).matches()) {
            throw new BusinessException("알 수 없는 공간이에요.");
        }
        List<Photo> in = edit.photos() == null ? List.of() : edit.photos();
        if (in.isEmpty()) {
            throw new BusinessException("공간마다 사진이 한 장은 있어야 해요.");
        }
        if (in.size() > MAX_PHOTOS) {
            throw new BusinessException("공간 하나에 사진은 " + MAX_PHOTOS + "장까지 둘 수 있어요.");
        }
        List<Photo> out = new ArrayList<>();
        for (Photo p : in) {
            String cls = trim(p.cls()), src = trim(p.src()), bs = trim(p.bs()), bp = trim(p.bp());
            String caption = trim(p.caption()).replaceAll("\\s+", " ");
            if (cls.isEmpty() == src.isEmpty()) {
                throw new BusinessException("사진 정보가 올바르지 않아요. 화면을 새로 고쳐 주세요.");
            }
            boolean onPage = html.contains(" " + cls + "\"") || html.contains(" " + cls + " ");   // 디자이너가 새로 넣은 그림 이름도 받음
            if (!cls.isEmpty() && (!IM_CLASS.matcher(cls).matches() || !(known.containsKey(cls) || onPage))) {
                throw new BusinessException("사이트에 없는 그림이에요: " + cls);
            }
            if (!src.isEmpty()) {
                Path file = page.dir().resolve(src).normalize();
                if (!UPLOAD_SRC.matcher(src).matches() || !file.startsWith(page.dir()) || !Files.isRegularFile(file)) {
                    throw new BusinessException("올린 사진 파일을 찾지 못했어요. 사진을 다시 올려 주세요.");
                }
            }
            Matcher size = SIZE.matcher(bs);
            if (!bs.isEmpty() && (!size.matches() || Integer.parseInt(size.group(1)) < 100 || Integer.parseInt(size.group(1)) > 400)) {
                throw new BusinessException("확대 값이 올바르지 않아요.");
            }
            if (!bp.isEmpty() && !POS.matcher(bp).matches()) {
                throw new BusinessException("사진 위치 값이 올바르지 않아요.");
            }
            if (caption.isEmpty()) {
                throw new BusinessException("사진마다 설명을 적어 주세요(사진 아래와 화면 낭독기에 쓰여요).");
            }
            if (caption.length() > MAX_CAPTION) {
                throw new BusinessException("사진 설명은 " + MAX_CAPTION + "자까지 써 주세요: " + caption.substring(0, 20) + "…");
            }
            out.add(new Photo(cls, src, bs, bp, caption));
        }
        return out;
    }

    /** 공간 하나의 사진 부분만 고쳐 쓴다(그 밖의 글자는 그대로) */
    private String applySpace(String html, Document doc, SpaceEdit edit, List<Photo> photos) {
        String eol = html.contains("\r\n") ? "\r\n" : "\n";
        int idAt = html.indexOf("id=\"" + edit.id() + "\"");
        if (idAt < 0) {
            throw new BusinessException("페이지에서 공간을 찾지 못했어요: " + edit.id());
        }
        int start = html.lastIndexOf("<div", idAt);
        int[] range = element(html, start);
        String block = html.substring(start, range[2]);
        Element spaceEl = doc.getElementById(edit.id());
        String name = spaceEl == null ? edit.id() : spaceName(doc, spaceEl);

        List<String> slides = new ArrayList<>(), thumbs = new ArrayList<>();
        for (int i = 0; i < photos.size(); i++) {
            Photo p = photos.get(i);
            slides.add("<div class=\"bx9-sl" + classOf(p) + "\"" + styleOf(p, true) + " role=\"img\" aria-label=\"" + esc(p.caption()) + "\"></div>");
            thumbs.add("<button type=\"button\" class=\"bx9-tb" + classOf(p) + "\"" + styleOf(p, true) + " aria-label=\"" + esc(p.caption()) + " 보기\""
                    + (i == 0 ? " aria-current=\"true\"" : "") + "></button>");
        }
        block = replaceInner(block, "<div class=\"bx9-tr\"", slides, eol);
        block = replaceInner(block, "<div class=\"bx9-th\"", thumbs, eol);
        block = badge(block, edit.badge() == null ? "" : edit.badge(), eol);
        block = replaceFirst(block, Pattern.compile("<p class=\"bx9-cap\">.*?</p>"), Matcher.quoteReplacement(
                "<p class=\"bx9-cap\"><span>" + esc(photos.get(0).caption()) + "</span><span class=\"bx9-n\"><b>1</b> / " + photos.size() + "</span></p>"));
        block = replaceFirst(block, Pattern.compile("(<div class=\"bx9-ph\"[^>]*?aria-label=\")[^\"]*(\")"),
                "$1" + Matcher.quoteReplacement(esc(name) + " 사진 " + photos.size() + "장") + "$2");
        html = html.substring(0, start) + block + html.substring(range[2]);

        // 공간 탭의 동그란 아이콘 = 첫 사진
        String tabId = spaceEl == null ? "" : spaceEl.attr("aria-labelledby");
        int tabAt = tabId.isEmpty() ? -1 : html.indexOf("id=\"" + tabId + "\"");
        if (tabAt >= 0) {
            int iconStart = html.indexOf("<span class=\"bx9-tt", tabAt);
            int buttonEnd = html.indexOf("</button>", tabAt);
            if (iconStart >= 0 && iconStart < buttonEnd) {
                int iconEnd = html.indexOf("</span>", iconStart) + "</span>".length();
                Photo first = photos.get(0);
                String icon = "<span class=\"bx9-tt" + classOf(first) + "\" aria-hidden=\"true\"" + styleOf(first, false) + "></span>";
                html = html.substring(0, iconStart) + icon + html.substring(iconEnd);
            }
        }
        return html;
    }

    private static String classOf(Photo p) {
        return p.cls().isEmpty() ? "" : " " + p.cls();
    }

    /** 배경 그림(올린 사진) · 확대(--bs) · 위치(--bp). 탭 아이콘은 늘 꽉 차게라 확대는 빼요 */
    private static String styleOf(Photo p, boolean withSize) {
        StringBuilder s = new StringBuilder();
        if (!p.src().isEmpty()) {
            s.append("background-image:url(").append(p.src()).append(");");
        }
        if (withSize && !p.bs().isEmpty()) {
            s.append("--bs:").append(p.bs()).append(';');
        }
        if (!p.bp().isEmpty()) {
            s.append("--bp:").append(p.bp()).append(';');
        }
        return s.isEmpty() ? "" : " style=\"" + s + "\"";
    }

    /** '사진 예시' · '임시 사진' 표시(사진 넘김 왼쪽 위). 사진 넘김(.bx9-tr) 바로 뒤 한 줄 */
    private static String badge(String block, String badge, String eol) {
        String html = switch (badge) {
            case "ex" -> "<span class=\"bx-ex\">사진 예시</span>";
            case "tmp" -> "<span class=\"bx-ex tmp\">임시 사진</span>";
            case "" -> "";
            default -> throw new BusinessException("알 수 없는 사진 표시예요.");
        };
        int trAt = block.indexOf("<div class=\"bx9-tr\"");
        String indent = indentAt(block, trAt);
        Matcher m = Pattern.compile("[ \\t]*<span class=\"bx-ex[^\"]*\">[^<]*</span>\\r?\\n").matcher(block);
        String line = html.isEmpty() ? "" : indent + html + eol;
        if (m.find()) {
            return block.substring(0, m.start()) + line + block.substring(m.end());
        }
        if (line.isEmpty()) {
            return block;
        }
        int[] tr = element(block, trAt);
        int at = tr[2];
        if (block.startsWith(eol, at)) {
            at += eol.length();
        }
        return block.substring(0, at) + line + block.substring(at);
    }

    /** 요소의 안쪽을 줄마다 다시 쓴다: 첫 자식 줄의 들여쓰기 · 닫는 태그 앞 들여쓰기는 그대로 */
    static String replaceInner(String block, String openMarker, List<String> lines, String eol) {
        int at = block.indexOf(openMarker);
        if (at < 0) {
            throw new BusinessException("페이지 모양이 예상과 달라 저장하지 않았어요(" + openMarker + "). 페이지가 바뀌었는지 확인해 주세요.");
        }
        int[] r = element(block, at);
        String inner = block.substring(r[0], r[1]);
        int lastNl = inner.lastIndexOf('\n');
        String closeIndent = lastNl >= 0 ? inner.substring(lastNl + 1) : "";
        if (lastNl < 0 || !closeIndent.isBlank()) {
            closeIndent = indentAt(block, at);   // 한 줄에 몰려 있으면 여는 태그 줄의 들여쓰기로
        }
        String childIndent = closeIndent + "  ";
        int firstNl = inner.indexOf('\n');
        if (firstNl >= 0) {
            Matcher m = Pattern.compile("[ \\t]*").matcher(inner.substring(firstNl + 1));
            if (m.lookingAt() && !m.group().isEmpty()) {
                childIndent = m.group();
            }
        }
        StringBuilder sb = new StringBuilder(eol);
        for (String line : lines) {
            sb.append(childIndent).append(line).append(eol);
        }
        sb.append(closeIndent);
        return block.substring(0, r[0]) + sb + block.substring(r[1]);
    }

    private static String indentAt(String s, int index) {
        int lineStart = s.lastIndexOf('\n', index) + 1;
        Matcher m = Pattern.compile("[ \\t]*").matcher(s.substring(lineStart, index));
        return m.lookingAt() ? m.group() : "";
    }

    /** 첫 번째로 맞는 곳만 바꾼다(replacement 는 Matcher 바꿀 글 — $1 사용 가능) */
    private static String replaceFirst(String s, Pattern p, String replacement) {
        Matcher m = p.matcher(s);
        if (!m.find()) {
            throw new BusinessException("페이지 모양이 예상과 달라 저장하지 않았어요. 페이지가 바뀌었는지 확인해 주세요.");
        }
        StringBuilder sb = new StringBuilder();
        m.appendReplacement(sb, replacement);
        m.appendTail(sb);
        return sb.toString();
    }

    /** start 의 여는 태그와 짝이 맞는 닫는 태그: {여는 태그 끝, 닫는 태그 시작, 닫는 태그 끝} */
    static int[] element(String s, int start) {
        Matcher name = Pattern.compile("<([a-zA-Z0-9]+)").matcher(s);
        if (start < 0 || !name.find(start) || name.start() != start) {
            throw new BusinessException("페이지 모양이 예상과 달라 저장하지 않았어요.");
        }
        Matcher tag = Pattern.compile("<(/?)" + name.group(1) + "\\b[^>]*>").matcher(s);
        int openEnd = s.indexOf('>', start) + 1, depth = 0, pos = start;
        while (tag.find(pos)) {
            depth += tag.group(1).isEmpty() ? 1 : -1;
            if (depth == 0) {
                return new int[] {openEnd, tag.start(), tag.end()};
            }
            pos = tag.end();
        }
        throw new BusinessException("페이지 모양이 예상과 달라 저장하지 않았어요(닫는 태그 없음).");
    }

    /** 고친 글을 다시 읽어 공간마다 사진 · 작은 사진 수가 맞는지 확인 */
    private static void verify(String html, List<SpaceEdit> spaces) {
        Document doc = Jsoup.parse(html);
        for (SpaceEdit edit : spaces) {
            Element s = doc.getElementById(edit.id());
            int n = edit.photos().size();
            if (s == null || s.select(".bx9-tr > .bx9-sl").size() != n || s.select(".bx9-th > .bx9-tb").size() != n) {
                throw new BusinessException("저장할 내용을 확인하다 문제가 생겨 저장하지 않았어요. 다시 시도해 주세요.");
            }
        }
        if (doc.select("#pg-facility .bx9-s").isEmpty()) {
            throw new BusinessException("저장할 내용을 확인하다 문제가 생겨 저장하지 않았어요.");
        }
    }

    static String hash(String html) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(html.getBytes(UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }

    static String esc(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
