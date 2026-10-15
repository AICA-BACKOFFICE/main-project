package egovframework.backoffice.page;

import egovframework.backoffice.common.BusinessException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.safety.Safelist;
import org.jsoup.select.Elements;
import org.springframework.stereotype.Service;

/**
 * 지원 전 체크 › 자주 묻는 질문(FAQ) 관리.
 * <p>
 * 사이트의 check/index.html 에서 분류 칩(.faq-tabs)과 질문 목록(#faqList &gt; .faq-item)을 읽어 보여 주고, 저장하면 질문 목록과
 * 분류 칩의 질문 수만 그 자리에서 다시 쓴다(나머지 글자는 한 글자도 바꾸지 않음). 쓰기는 카테고리 페이지 관리의 '사이트에 반영'과
 * 같은 길(반영 전 파일은 버전 기록에 백업). 답에는 링크 · 굵게 · 기울임 · 줄바꿈 · '확인 필요' 표시만 남긴다.
 */
@Service
public class CheckFaqService {

    static final String PAGE_ID = "check";
    static final int MAX_ITEMS = 100;
    static final int MAX_QUESTION = 200;
    static final int MAX_ANSWER = 3000;

    /** 질문 목록 여는 태그의 앞부분(뒤에 style 등이 붙어 있어도 됨) */
    private static final String LIST_OPEN = "<ul class=\"faq-list\" id=\"faqList\"";
    private static final String TABS_OPEN = "<div class=\"faq-tabs\"";
    private static final String ANSWER_OPEN = "<div class=\"faq-at\"";
    private static final Pattern TAB_COUNT = Pattern.compile(
            "(<button\\b[^>]*\\bdata-cat=\"([^\"]*)\"[^>]*>[^<]*<em class=\"faq-cnt\"[^>]*>)(\\d*)(</em>)");
    /** 링크 주소의 종류(https: 등). 브라우저는 주소 속 공백 · 줄바꿈 · 탭을 무시하므로 그것들을 지운 뒤에 본다 */
    private static final Pattern URL_SCHEME = Pattern.compile("^([a-zA-Z][a-zA-Z0-9+.-]*):");
    private static final Set<String> SAFE_SCHEMES = Set.of("http", "https", "mailto", "tel");
    private static final Safelist ANSWER_TAGS = new Safelist()
            .addTags("a", "b", "strong", "em", "i", "br", "span")
            .addAttributes("a", "href", "target")
            .addAttributes("span", "class");

    /** 질문 하나: cat 분류(칩의 data-cat) · question 질문 글 · answer 답(HTML) */
    public record Item(String cat, String question, String answer) { }

    /** baseHash: 화면을 열 때의 사이트 파일(그사이 다른 곳에서 바뀌었으면 저장하지 않음) · items: 사이트에 보일 순서대로 전부 */
    public record SaveRequest(String baseHash, List<Item> items) { }

    private record Parsed(List<Map<String, String>> categories, List<Item> items) { }

    private final CategoryPageService pages;

    public CheckFaqService(CategoryPageService pages) {
        this.pages = pages;
    }

    // ── 읽기 ──

    public Map<String, Object> model() {
        CategoryPage page = pages.page(PAGE_ID);
        String html = pages.published(page);
        Parsed parsed = parse(html);
        Map<String, Object> model = new LinkedHashMap<>();
        model.put("hash", LifePhotoService.hash(html));
        model.put("hasDraft", pages.hasDraft(page));
        model.put("draft", pages.draftSummary(page));   // 임시저장이 있으면 무엇이 바뀌었는지(안내에 보여 줌)
        model.put("categories", parsed.categories());
        model.put("items", parsed.items());
        model.put("limits", Map.of("items", MAX_ITEMS, "question", MAX_QUESTION, "answer", MAX_ANSWER));
        return model;
    }

    private static Parsed parse(String html) {
        Document doc = Jsoup.parse(html);
        Element list = doc.getElementById("faqList");
        if (list == null || !html.contains(LIST_OPEN)) {
            throw new BusinessException("지원 전 체크 페이지에서 자주 묻는 질문 목록을 찾지 못했어요.");
        }
        List<Map<String, String>> categories = new ArrayList<>();
        for (Element tab : doc.select(".faq-tabs .faq-tab[data-cat]")) {
            String key = tab.attr("data-cat");
            if (!"all".equals(key)) {
                categories.add(Map.of("key", key, "label", tab.ownText().trim()));
            }
        }
        // 답은 사이트 파일의 글자 그대로 둔다(고치지 않은 답은 다시 저장해도 한 글자도 바뀌지 않게).
        List<String> answers = rawAnswers(html);
        Elements lis = list.select("> li.faq-item");
        if (answers.size() != lis.size()) {
            throw new BusinessException("자주 묻는 질문 목록의 모양이 예상과 달라요. 카테고리 페이지 관리 › 지원 전 체크에서 확인해 주세요.");
        }
        List<Item> items = new ArrayList<>();
        for (int i = 0; i < lis.size(); i++) {
            Element li = lis.get(i);
            Element qt = li.selectFirst(".faq-qt");
            String question = qt == null ? "" : qt.hasAttr("data-text") ? qt.attr("data-text") : qt.text();
            items.add(new Item(li.attr("data-cat"), question, answers.get(i)));
        }
        return new Parsed(categories, items);
    }

    private static List<String> rawAnswers(String html) {
        int at = html.indexOf(LIST_OPEN);
        int[] list = LifePhotoService.element(html, at);
        List<String> out = new ArrayList<>();
        for (int i = html.indexOf(ANSWER_OPEN, list[0]); i >= 0 && i < list[1]; i = html.indexOf(ANSWER_OPEN, i + 1)) {
            int[] r = LifePhotoService.element(html, i);
            out.add(html.substring(r[0], r[1]));
        }
        return out;
    }

    // ── 저장 ──

    public synchronized Map<String, Object> save(SaveRequest request) {
        CategoryPage page = pages.page(PAGE_ID);
        if (request == null || request.items() == null) {
            throw new BusinessException("저장할 내용이 없어요.");
        }
        if (pages.hasDraft(page)) {
            throw new BusinessException("지원 전 체크에 아직 사이트에 반영하지 않은 페이지 편집(임시저장)이 있어요. "
                    + "카테고리 페이지 관리 › 지원 전 체크에서 먼저 반영하거나 편집을 취소한 뒤 저장해 주세요.");
        }
        String html = pages.published(page);
        if (request.baseHash() == null || !request.baseHash().equals(LifePhotoService.hash(html))) {
            throw new BusinessException("화면을 연 뒤에 지원 전 체크 페이지가 바뀌었어요. 화면을 새로 고친 뒤 다시 저장해 주세요(고친 내용은 다시 해 주셔야 해요).");
        }
        Parsed current = parse(html);
        List<Item> items = clean(request.items(), current);
        boolean changed = !items.equals(current.items());
        if (changed) {
            String out = apply(html, items);
            verify(out, items, current);
            pages.publish(page, out);
        }
        Map<String, Object> model = model();
        model.put("saved", changed);
        return model;
    }

    /** 받은 질문 확인 · 정리: 분류는 페이지에 있는 것만, 질문은 한 줄 글자, 답은 허용한 꾸밈만 */
    private static List<Item> clean(List<Item> items, Parsed current) {
        if (items.size() > MAX_ITEMS) {
            throw new BusinessException("질문은 " + MAX_ITEMS + "개까지 둘 수 있어요.");
        }
        Set<String> cats = new HashSet<>();
        current.categories().forEach(c -> cats.add(c.get("key")));
        Set<String> originalAnswers = new HashSet<>();
        current.items().forEach(item -> originalAnswers.add(item.answer()));
        List<Item> out = new ArrayList<>();
        int n = 0;
        for (Item item : items) {
            n++;
            String cat = item == null || item.cat() == null ? "" : item.cat().trim();
            if (!cats.contains(cat)) {
                throw new BusinessException(n + "번째 질문의 분류를 골라 주세요.");
            }
            String question = item.question() == null ? "" : item.question().replaceAll("\\s+", " ").trim();
            if (question.isEmpty()) {
                throw new BusinessException(n + "번째 질문의 질문 글이 비어 있어요.");
            }
            if (question.length() > MAX_QUESTION) {
                throw new BusinessException(n + "번째 질문이 너무 길어요(" + MAX_QUESTION + "자까지).");
            }
            String answer = item.answer() == null ? "" : item.answer();
            if (!originalAnswers.contains(answer)) {
                answer = cleanAnswer(answer);
            }
            if (Jsoup.parse(answer).text().isBlank()) {
                throw new BusinessException(n + "번째 질문의 답이 비어 있어요.");
            }
            if (answer.length() > MAX_ANSWER) {
                throw new BusinessException(n + "번째 질문의 답이 너무 길어요(" + MAX_ANSWER + "자까지).");
            }
            out.add(new Item(cat, question, answer));
        }
        return out;
    }

    /** 링크로 남겨도 되는 주소: 같은 사이트 주소(#자리 · /경로 · 파일)이거나 http(s) · 메일 · 전화 */
    static boolean safeHref(String href) {
        String probe = href.replaceAll("[\\x00-\\x20\\x7f]", "");
        if (probe.isEmpty()) {
            return false;
        }
        Matcher scheme = URL_SCHEME.matcher(probe);
        return !scheme.find() || SAFE_SCHEMES.contains(scheme.group(1).toLowerCase(java.util.Locale.ROOT));
    }

    /** 답 HTML 정리: 문단 · 줄은 줄바꿈(br)으로, 링크는 사이트 링크 모양(text-link)으로, 위험한 주소는 뺀다. */
    static String cleanAnswer(String html) {
        String s = html.replaceAll("\\r?\\n", " ")
                .replaceAll("(?i)<\\s*(div|p)\\b[^>]*>", "<br>")
                .replaceAll("(?i)</\\s*(div|p)\\s*>", "");
        Document.OutputSettings settings = new Document.OutputSettings().prettyPrint(false);
        Document doc = Jsoup.parseBodyFragment(Jsoup.clean(s, "", ANSWER_TAGS, settings));
        doc.outputSettings(settings);
        for (Element a : doc.select("a")) {
            String href = a.attr("href").trim();
            if (!safeHref(href)) {
                a.unwrap();
                continue;
            }
            a.attr("href", href);
            boolean blank = "_blank".equals(a.attr("target"));
            a.clearAttributes();
            a.attr("class", "text-link").attr("href", href);
            if (blank) {
                a.attr("target", "_blank").attr("rel", "noopener");
            }
        }
        for (Element span : doc.select("span")) {
            if (span.hasClass("tbd")) {
                span.attr("class", "tbd");
            } else {
                span.unwrap();
            }
        }
        return doc.body().html()
                .replaceAll("(?:\\s|<br>)+$", "")
                .replaceAll("^(?:\\s|<br>)+", "")
                .replaceAll("(?:<br>\\s*){3,}", "<br><br>")
                .trim();
    }

    private static String apply(String html, List<Item> items) {
        String eol = html.contains("\r\n") ? "\r\n" : "\n";
        int at = html.indexOf(LIST_OPEN);
        int[] r = LifePhotoService.element(html, at);
        List<String> lines = new ArrayList<>();
        for (int i = 0; i < items.size(); i++) {
            lines.addAll(itemLines(items.get(i), i));
        }
        String block = LifePhotoService.replaceInner(html.substring(at, r[2]), LIST_OPEN, lines, eol);
        return counts(html.substring(0, at) + block + html.substring(r[2]), items);
    }

    /** 질문 하나의 줄들(사이트 지원 전 체크 페이지의 질문 모양 그대로, 모두 접힌 채 — 펼침 · 페이지 나눔은 check.js가) */
    private static List<String> itemLines(Item item, int i) {
        return List.of(
                "<li class=\"faq-item\" data-cat=\"" + LifePhotoService.esc(item.cat()) + "\">",
                "  <h3><button type=\"button\" class=\"faq-q\" id=\"fq-" + i + "\" aria-expanded=\"false\" aria-controls=\"fa-" + i + "\">"
                        + "<span class=\"faq-qa\">Q</span><span class=\"faq-qt\" data-text=\"" + LifePhotoService.esc(item.question()) + "\">" + text(item.question()) + "</span>"
                        + "<span class=\"faq-arrow\" aria-hidden=\"true\"><svg viewBox=\"0 0 24 24\"><path d=\"M6 9l6 6 6-6\"></path></svg></span></button></h3>",
                "  <div class=\"faq-a\" id=\"fa-" + i + "\" role=\"region\" aria-labelledby=\"fq-" + i + "\"><div><span class=\"faq-qa\">A</span>"
                        + ANSWER_OPEN + ">" + item.answer() + "</div></div></div>",
                "</li>");
    }

    /** 분류 칩의 질문 수: 전체 · 분류마다 */
    private static String counts(String html, List<Item> items) {
        int at = html.indexOf(TABS_OPEN);
        if (at < 0) {
            return html;
        }
        int[] r = LifePhotoService.element(html, at);
        Matcher m = TAB_COUNT.matcher(html.substring(at, r[2]));
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            String cat = m.group(2);
            long n = "all".equals(cat) ? items.size() : items.stream().filter(item -> item.cat().equals(cat)).count();
            m.appendReplacement(sb, Matcher.quoteReplacement(m.group(1) + n + m.group(4)));
        }
        m.appendTail(sb);
        return html.substring(0, at) + sb + html.substring(r[2]);
    }

    /** 고친 글을 다시 읽어 질문 수 · 질문 글 · 분류 칩 수가 맞는지 확인 */
    private static void verify(String html, List<Item> items, Parsed before) {
        Parsed after = parse(html);
        boolean ok = after.items().size() == items.size() && after.categories().equals(before.categories());
        for (int i = 0; ok && i < items.size(); i++) {
            ok = after.items().get(i).equals(items.get(i));
        }
        if (!ok) {
            throw new BusinessException("저장할 내용을 확인하다 문제가 생겨 저장하지 않았어요. 다시 시도해 주세요.");
        }
    }

    private static String text(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
