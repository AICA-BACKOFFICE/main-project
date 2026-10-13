package egovframework.backoffice.page;

import egovframework.backoffice.common.BusinessException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.stereotype.Service;

/**
 * 인사교 라이프 › 생활 꿀팁의 두 목록을 게시물처럼 쓰고 고치고 지운다.
 * <ul>
 *   <li>오늘 점심, 여기 어때요?(#tp-food): 식당 · 카페 카드(li.fdc) — 종류 · 혼밥/여럿이 · 걸어서 몇 분 · 분류 · 이름 · 메뉴 · 선배 후기 · 사진(없으면 '사진 준비 중')</li>
 *   <li>수업 끝나고, 바람 쐬러 가요(#tp-fun): 근처 산책길 · 가까운 문화 · 여가 시설 · 멀지만 한 번 가볼 만한 곳 카드(li.fsc) — 사진 · 이름 · 거리 · 요금 · 설명</li>
 * </ul>
 * 저장하면 그 목록(ul#fdList · 묶음마다 ol.fsl)과 목록에 딸린 숫자(식당 n · 카페 n · 'n곳 펼쳐 보기') · 오른쪽 이름 목록(ul.fs-names)만
 * 디자이너 시안과 같은 모양으로 다시 쓴다. 나머지 글자는 그대로({@link LifePhotoService} 와 같은 방식 · 같은 반영 길).
 */
@Service
public class LifeTipService {

    static final int MAX_FOOD = 40;
    static final int MAX_FUN = 10;
    private static final Set<String> KINDS = Set.of("food", "cafe");
    private static final Set<String> GROUPS = Set.of("solo", "group");
    private static final List<String> FUN_KEYS = List.of("walk", "near", "far");
    private static final int[] ROTATE = {-5, 3, -2, 4, -3};
    private static final Pattern IM_CLASS = Pattern.compile("im-[A-Za-z0-9_-]+");
    private static final Pattern UPLOAD_SRC = Pattern.compile("assets/uploads/[A-Za-z0-9_.-]+\\.(?:webp|png|jpe?g|gif|avif)", Pattern.CASE_INSENSITIVE);
    private static final Pattern BG_URL = Pattern.compile("background-image\\s*:\\s*url\\(\\s*[\"']?([^\"')]+)[\"']?\\s*\\)");
    private static final String PHOTO_PENDING = "<span class=\"fdc-pht\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 8h3l1.6-2h6.8L17 8h3v11H4z\"></path>"
            + "<circle cx=\"12\" cy=\"13.5\" r=\"3.4\"></circle></svg>사진 준비 중</span>";

    /** 먹거리 카드: t food·cafe · g solo·group · w 걸어서 몇 분 · example = '예시' 후기 표시(후기를 고치면 서버가 뗌) */
    public record Food(String t, String g, Integer w, String category, String name, String menu, String review, Boolean example, String src) { }

    /** 문화 · 여가 카드: 사진은 cls(사이트에 원래 있던 그림) 또는 src(올린 사진) */
    public record Fun(String name, String distance, String fee, String summary, String cls, String src) { }

    public record FunGroup(String k, List<Fun> cards) { }

    // ── 읽기 ──

    /** 화면에 보여 줄 두 목록(사진 미리보기 주소 포함) */
    public Map<String, Object> model(Document doc, Map<String, String> known, String contextPath) {
        Map<String, Object> out = new LinkedHashMap<>();
        List<Map<String, Object>> foods = new ArrayList<>();
        for (Element li : doc.select("#fdList > li.fdc")) {
            Map<String, Object> f = new LinkedHashMap<>();
            f.put("t", li.attr("data-t"));
            f.put("g", li.attr("data-g"));
            f.put("w", parseInt(li.attr("data-w")));
            f.put("category", text(li.selectFirst(".fdc-cat")));
            f.put("name", text(li.selectFirst(".fdc-b h3")));
            f.put("menu", text(li.selectFirst(".fdc-m")).replace(' ', ' '));
            f.put("review", text(li.selectFirst(".fdc-r blockquote")));
            f.put("example", li.selectFirst(".fdc-r .bdg.ex") != null);
            Element ph = li.selectFirst(".fdc-ph");
            String src = ph == null ? "" : bgUrl(ph.attr("style"));
            f.put("src", src);
            f.put("url", src.isEmpty() ? "" : contextPath + "/admin/pages/site/life/" + src);
            foods.add(f);
        }
        out.put("food", foods);
        List<Map<String, Object>> groups = new ArrayList<>();
        for (Element g : doc.select("#tp-fun .fsg")) {
            Map<String, Object> group = new LinkedHashMap<>();
            group.put("k", g.attr("data-k"));
            group.put("title", text(g.selectFirst(".fsh h3")));
            group.put("sub", text(g.selectFirst(".fsh p")));
            List<Map<String, Object>> cards = new ArrayList<>();
            for (Element li : g.select("ol.fsl > li.fsc")) {
                Map<String, Object> c = new LinkedHashMap<>();
                Element ph = li.selectFirst(".fsc-ph");
                String cls = ph == null ? "" : ph.classNames().stream().filter(x -> IM_CLASS.matcher(x).matches()).findFirst().orElse("");
                String src = ph == null ? "" : bgUrl(ph.attr("style"));
                c.put("name", text(li.selectFirst(".fsc-b > b")));
                c.put("distance", text(li.selectFirst(".fsc-b > small")));
                c.put("fee", text(li.selectFirst(".fsc-t")));
                c.put("summary", text(li.selectFirst(".fsc-d")));
                c.put("cls", cls);
                c.put("src", src);
                c.put("url", !src.isEmpty() ? contextPath + "/admin/pages/site/life/" + src : known.getOrDefault(cls, ""));
                cards.add(c);
            }
            group.put("cards", cards);
            groups.add(group);
        }
        out.put("fun", groups);
        out.put("maxFood", MAX_FOOD);
        out.put("maxFun", MAX_FUN);
        return out;
    }

    // ── 쓰기 ──

    /** 오늘 점심, 여기 어때요?: 카드 목록 · 식당/카페 수 */
    public String applyFood(String html, Document doc, List<Food> in, CategoryPage page) {
        if (in == null) {
            return html;
        }
        if (in.size() > MAX_FOOD * 2) {
            throw new BusinessException("먹거리 카드가 너무 많아요.");
        }
        Map<String, String> before = new LinkedHashMap<>();
        for (Element li : doc.select("#fdList > li.fdc")) {
            before.put(text(li.selectFirst(".fdc-b h3")), text(li.selectFirst(".fdc-r blockquote")));
        }
        List<String> lines = new ArrayList<>();
        int food = 0, cafe = 0;
        // 사이트 순서: 식당 카드 → 카페 카드(카페는 처음에 숨김, 탭을 누르면 보임)
        for (String kind : List.of("food", "cafe")) {
            for (Food f : in) {
                if (!kind.equals(f.t())) {
                    continue;
                }
                lines.addAll(foodLines(cleanFood(f, page), before));
                if (kind.equals("food")) {
                    food++;
                } else {
                    cafe++;
                }
            }
        }
        for (Food f : in) {
            if (f.t() == null || !KINDS.contains(f.t())) {
                throw new BusinessException("먹거리 종류(식당 · 카페)가 올바르지 않아요.");
            }
        }
        if (food == 0 || cafe == 0) {
            throw new BusinessException("식당과 카페는 한 곳 이상씩 있어야 해요.");
        }
        if (food > MAX_FOOD || cafe > MAX_FOOD) {
            throw new BusinessException("식당 · 카페는 각각 " + MAX_FOOD + "곳까지 둘 수 있어요.");
        }
        String eol = html.contains("\r\n") ? "\r\n" : "\n";
        int at = html.indexOf("<ul class=\"fdg\" id=\"fdList\"");
        if (at < 0) {
            throw new BusinessException("페이지에서 '오늘 점심, 여기 어때요?' 목록을 찾지 못했어요.");
        }
        String head = html.substring(0, at), rest = html.substring(at);
        rest = LifePhotoService.replaceInner(rest, "<ul class=\"fdg\" id=\"fdList\"", lines, eol);
        html = head + rest;
        html = count(html, "fdk-food", food);
        html = count(html, "fdk-cafe", cafe);
        return html;
    }

    private Food cleanFood(Food f, CategoryPage page) {
        String t = trim(f.t()), g = trim(f.g());
        if (!KINDS.contains(t) || !GROUPS.contains(g)) {
            throw new BusinessException("먹거리 종류 · 혼밥/여럿이 값이 올바르지 않아요.");
        }
        int w = f.w() == null ? 0 : f.w();
        String name = one(f.name(), 40, "가게 이름");
        if (w < 1 || w > 120) {
            throw new BusinessException("'" + name + "'의 걸어서 걸리는 시간(분)을 1~120 사이로 적어 주세요.");
        }
        String category = one(f.category(), 12, "'" + name + "'의 분류(예: 한식)");
        String menu = trim(f.menu()).replaceAll("\\s+", " ").replaceAll("\\s*·\\s*", " · ");
        if (menu.isEmpty()) {
            throw new BusinessException("'" + name + "'의 메뉴 · 위치를 적어 주세요(예: 국밥 · 동명동).");
        }
        if (menu.length() > 80) {
            throw new BusinessException("'" + name + "'의 메뉴 · 위치는 80자까지 써 주세요.");
        }
        String review = trim(f.review()).replaceAll("\\s+", " ");
        if (review.length() > 200) {
            throw new BusinessException("'" + name + "'의 선배 후기는 200자까지 써 주세요.");
        }
        String src = photo(f.src(), page);
        return new Food(t, g, w, category, name, menu, review, Boolean.TRUE.equals(f.example()), src);
    }

    private static List<String> foodLines(Food f, Map<String, String> before) {
        List<String> l = new ArrayList<>();
        String n = LifePhotoService.esc(f.name());
        l.add("<li class=\"fdc\" data-t=\"" + f.t() + "\" data-g=\"" + f.g() + "\" data-w=\"" + f.w() + "\"" + ("cafe".equals(f.t()) ? " hidden" : "") + ">");
        if (f.src().isEmpty()) {
            l.add("  <div class=\"fdc-ph\" role=\"img\" aria-label=\"" + n + " 사진 자리(사진 준비 중)\" data-field=\"photo\">");
        } else {
            l.add("  <div class=\"fdc-ph\" role=\"img\" aria-label=\"" + n + " 사진\" data-field=\"photo\" style=\"background-image:url(" + f.src()
                    + ");background-size:cover;background-position:center\">");
        }
        l.add("    <span class=\"fdc-cat\" data-field=\"category\">" + html(f.category()) + "</span><span class=\"fdc-wk\" data-field=\"walk\">도보 약 " + f.w() + "분</span>");
        if (f.src().isEmpty()) {
            l.add("    " + PHOTO_PENDING);
        }
        l.add("  </div>");
        l.add("  <div class=\"fdc-b\">");
        l.add("    <p class=\"fdc-g " + f.g() + "\">" + ("group".equals(f.g()) ? "여럿이 가기 좋아요" : "cafe".equals(f.t()) ? "혼자 가기 편해요" : "혼밥하기 편해요") + "</p>");
        l.add("    <h3 data-field=\"name\">" + html(f.name()) + "</h3>");
        l.add("    <p class=\"fdc-m\" data-field=\"menu\">" + html(f.menu()) + "</p>");
        l.add("  </div>");
        if (!f.review().isEmpty()) {
            // '예시' 표시는 원래 예시였고 후기를 고치지 않았을 때만 남김(관리자가 쓴 후기는 진짜 후기)
            boolean example = f.example() && f.review().equals(before.get(f.name()));
            l.add("  <figure class=\"fdc-r\">");
            l.add("    <figcaption><b>선배 후기</b>" + (example ? "<span class=\"bdg ex\">예시</span>" : "") + "</figcaption>");
            l.add("    <blockquote data-field=\"review\">" + html(f.review()) + "</blockquote>");
            l.add("  </figure>");
        }
        l.add("</li>");
        return l;
    }

    /** 수업 끝나고, 바람 쐬러 가요: 묶음(walk · near · far)마다 카드 · 'n곳 펼쳐 보기' · 오른쪽 이름 목록 */
    public String applyFun(String html, List<FunGroup> groups, CategoryPage page, Map<String, String> known) {
        if (groups == null) {
            return html;
        }
        String eol = html.contains("\r\n") ? "\r\n" : "\n";
        for (FunGroup group : groups) {
            if (group == null || !FUN_KEYS.contains(group.k())) {
                throw new BusinessException("알 수 없는 문화 · 여가 묶음이에요.");
            }
            List<Fun> cards = new ArrayList<>();
            for (Fun c : group.cards() == null ? List.<Fun>of() : group.cards()) {
                cards.add(cleanFun(c, page, known, html));
            }
            if (cards.isEmpty()) {
                throw new BusinessException("문화 · 여가 묶음마다 한 곳 이상 있어야 해요.");
            }
            if (cards.size() > MAX_FUN) {
                throw new BusinessException("문화 · 여가 묶음 하나에 " + MAX_FUN + "곳까지 둘 수 있어요.");
            }
            int start = html.indexOf("<section class=\"fsg\" data-k=\"" + group.k() + "\"");
            if (start < 0) {
                throw new BusinessException("페이지에서 문화 · 여가 묶음을 찾지 못했어요: " + group.k());
            }
            int[] range = LifePhotoService.element(html, start);
            String block = html.substring(start, range[2]);
            List<String> lines = new ArrayList<>();
            for (int i = 0; i < cards.size(); i++) {
                Fun c = cards.get(i);
                String name = LifePhotoService.esc(c.name());
                String photo = c.src().isEmpty()
                        ? "<span class=\"fsc-ph " + c.cls() + "\" role=\"img\" aria-label=\"" + name + "\" data-field=\"photo\"></span>"
                        : "<span class=\"fsc-ph\" style=\"background-image:url(" + c.src() + ")\" role=\"img\" aria-label=\"" + name + "\" data-field=\"photo\"></span>";
                lines.add("<li class=\"fsc\" style=\"--i:" + i + ";--rt:" + ROTATE[i % ROTATE.length] + "deg;--z:" + (cards.size() - i) + "\">");
                lines.add("  " + photo);
                lines.add("  <span class=\"fsc-b\"><b data-field=\"name\">" + html(c.name()) + "</b><small data-field=\"distance\">" + html(c.distance())
                        + "</small><span class=\"fsc-t\" data-field=\"fee\">" + html(c.fee()) + "</span><span class=\"fsc-d\" data-field=\"summary\">"
                        + html(c.summary()) + "</span></span>");
                lines.add("</li>");
            }
            block = LifePhotoService.replaceInner(block, "<ol class=\"fsl\"", lines, eol);
            block = replaceFirst(block, Pattern.compile("(<span class=\"o\">)\\d+(곳 펼쳐 보기</span>)"), "$1" + cards.size() + "$2");
            StringBuilder names = new StringBuilder("<ul class=\"fs-names\">");
            for (Fun c : cards) {
                names.append("<li>").append(html(c.name())).append("</li>");
            }
            names.append("</ul>");
            block = replaceFirst(block, Pattern.compile("<ul class=\"fs-names\">.*?</ul>"), Matcher.quoteReplacement(names.toString()));
            html = html.substring(0, start) + block + html.substring(range[2]);
        }
        return html;
    }

    private Fun cleanFun(Fun c, CategoryPage page, Map<String, String> known, String html) {
        String name = one(c.name(), 40, "장소 이름");
        String distance = one(c.distance(), 40, "'" + name + "'의 거리(예: 동쪽 · 약 1km)");
        String fee = one(c.fee(), 30, "'" + name + "'의 요금(예: 무료)");
        String summary = one(c.summary(), 200, "'" + name + "'의 설명");
        String cls = trim(c.cls()), src = photo(c.src(), page);
        if (src.isEmpty()) {
            boolean onPage = html.contains(" " + cls + "\"") || html.contains(" " + cls + " ");
            if (cls.isEmpty() || !IM_CLASS.matcher(cls).matches() || !(known.containsKey(cls) || onPage)) {
                throw new BusinessException("'" + name + "'에 사진을 올려 주세요.");
            }
        } else {
            cls = "";
        }
        return new Fun(name, distance, fee, summary, cls, src);
    }

    /** 고친 글을 다시 읽어 확인 */
    public void verify(Document doc, List<Food> food, List<FunGroup> fun) {
        if (food != null && doc.select("#fdList > li.fdc").size() != food.size()) {
            throw new BusinessException("저장할 내용을 확인하다 문제가 생겨 저장하지 않았어요(먹거리).");
        }
        if (fun != null) {
            for (FunGroup g : fun) {
                Element el = doc.selectFirst("#tp-fun .fsg[data-k=" + g.k() + "]");
                if (el == null || el.select("ol.fsl > li.fsc").size() != g.cards().size() || el.select(".fs-names li").size() != g.cards().size()) {
                    throw new BusinessException("저장할 내용을 확인하다 문제가 생겨 저장하지 않았어요(문화 · 여가).");
                }
            }
        }
    }

    // ── 도움 ──

    private static String photo(String raw, CategoryPage page) {
        String src = trim(raw);
        if (src.isEmpty()) {
            return "";
        }
        Path file = page.dir().resolve(src).normalize();
        if (!UPLOAD_SRC.matcher(src).matches() || !file.startsWith(page.dir()) || !Files.isRegularFile(file)) {
            throw new BusinessException("올린 사진 파일을 찾지 못했어요. 사진을 다시 올려 주세요.");
        }
        return src;
    }

    /** 식당 13 · 카페 7 같은 탭 숫자 */
    private static String count(String html, String tabId, int n) {
        Pattern p = Pattern.compile("(<button[^>]*id=\"" + tabId + "\"[^>]*>[^<]*<span>)\\d+(</span>)");
        return replaceFirst(html, p, "$1" + n + "$2");
    }

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

    private static String one(String v, int max, String label) {
        String s = trim(v).replaceAll("\\s+", " ");
        if (s.isEmpty()) {
            throw new BusinessException(label + "을(를) 적어 주세요.");
        }
        if (s.length() > max) {
            throw new BusinessException(label + "은(는) " + max + "자까지 써 주세요.");
        }
        return s;
    }

    /** 글자 칸: &lt; &gt; &amp; 를 바꾸고, 줄바꿈 없는 띄어쓰기(메뉴의 ' · ' 앞)는 &amp;nbsp; 로 */
    private static String html(String s) {
        return LifePhotoService.esc(s).replace(" ", "&nbsp;");
    }

    private static String text(Element e) {
        return e == null ? "" : e.text();
    }

    private static String bgUrl(String style) {
        Matcher m = BG_URL.matcher(style == null ? "" : style);
        return m.find() ? m.group(1).trim() : "";
    }

    private static Integer parseInt(String s) {
        try {
            return Integer.valueOf(s.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }
}
