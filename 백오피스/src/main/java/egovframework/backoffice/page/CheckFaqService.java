package egovframework.backoffice.page;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import egovframework.backoffice.common.BusinessException;
import java.util.ArrayList;
import java.util.HashMap;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 지원 전 체크 › 자주 묻는 질문(FAQ) 관리. 질문은 DB(faq_items)에 두고, 분류는 사이트 check/index.html 의 분류 버튼(.faq-tabs)을 따른다.
 * <p>
 * 사이트(check/js/faq-render.js)는 공개 API({@link #publicScript()}, /api/public/faq.js)로 질문을 받아 목록과 분류별 질문 수를 그린다.
 * 백오피스가 꺼져 있어도 보이도록 같은 내용을 사본(check/js/faq-data.js)으로도 쓴다. 처음 켤 때 DB가 비어 있으면 페이지에 적혀 있던 질문을 옮겨 온다.
 * 답에는 링크 · 굵게 · 기울임 · 줄바꿈 · '확인 필요' 표시만 남긴다(고치지 않은 답은 그대로).
 */
@Service
public class CheckFaqService {

    private static final Logger log = LoggerFactory.getLogger(CheckFaqService.class);

    static final String PAGE_ID = "check";
    static final String DATA_FILE = "check/js/faq-data.js";
    static final int MAX_ITEMS = 100;
    static final int MAX_QUESTION = 200;
    static final int MAX_ANSWER = 3000;

    /** 질문 목록 여는 태그의 앞부분(뒤에 style 등이 붙어 있어도 됨) */
    private static final String LIST_OPEN = "<ul class=\"faq-list\" id=\"faqList\"";
    private static final String ANSWER_OPEN = "<div class=\"faq-at\"";
    /** 링크 주소의 종류(https: 등). 브라우저는 주소 속 공백 · 줄바꿈 · 탭을 무시하므로 그것들을 지운 뒤에 본다 */
    private static final Pattern URL_SCHEME = Pattern.compile("^([a-zA-Z][a-zA-Z0-9+.-]*):");
    private static final Set<String> SAFE_SCHEMES = Set.of("http", "https", "mailto", "tel");
    private static final Safelist ANSWER_TAGS = new Safelist()
            .addTags("a", "b", "strong", "em", "i", "br", "span")
            .addAttributes("a", "href", "target")
            .addAttributes("span", "class");
    private static final String HEADER = "/* 지원 전 체크 자주 묻는 질문 사본: 사이트는 백오피스 공개 API(/api/public/faq.js)로 DB의 질문을 받아 그려요. "
            + "이 파일은 백오피스가 꺼져 있을 때 쓰는 사본이라 FAQ 관리에서 저장할 때마다 다시 써요. 직접 고치지 마세요. */\n";
    private static final String API_HEADER = "/* 지원 전 체크 자주 묻는 질문: 백오피스 DB의 지금 질문(지원 전 Check FAQ 관리) */\n";

    /** 질문 하나: id(새 질문은 null) · cat 분류(칩의 data-cat) · question 질문 글 · answer 답(HTML) */
    public record Item(Long id, String cat, String question, String answer) { }

    /** baseHash: 화면을 열 때의 질문 목록(그사이 다른 곳에서 바뀌었으면 저장하지 않음) · items: 사이트에 보일 순서대로 전부 */
    public record SaveRequest(String baseHash, List<Item> items) { }

    private final CategoryPageService pages;
    private final FaqMapper mapper;
    private final ObjectMapper json;
    private final TransactionTemplate tx;

    public CheckFaqService(CategoryPageService pages, FaqMapper mapper, ObjectMapper json, TransactionTemplate tx) {
        this.pages = pages;
        this.mapper = mapper;
        this.json = json;
        this.tx = tx;
    }

    // ── 읽기 ──

    public Map<String, Object> model() {
        Map<String, Object> model = new LinkedHashMap<>();
        model.put("hash", fingerprint());
        model.put("hasDraft", false);   // 질문은 DB에 있어 페이지 편집 임시저장과 겹치지 않아요
        model.put("categories", categories());
        model.put("items", mapper.findAll().stream().map(i -> new Item(i.getId(), i.getCategory(), i.getQuestion(), i.getAnswer())).toList());
        model.put("limits", Map.of("items", MAX_ITEMS, "question", MAX_QUESTION, "answer", MAX_ANSWER));
        return model;
    }

    /** 분류: 사이트 지원 전 체크 페이지의 분류 버튼(전체 빼고) */
    private List<Map<String, String>> categories() {
        CategoryPage page = pages.page(PAGE_ID);
        if (!pages.exists(page)) {
            throw new BusinessException("지원 전 체크 페이지(check/index.html)를 찾지 못했어요.");
        }
        Document doc = Jsoup.parse(pages.published(page));
        List<Map<String, String>> out = new ArrayList<>();
        for (Element tab : doc.select(".faq-tabs .faq-tab[data-cat]")) {
            String key = tab.attr("data-cat");
            if (!"all".equals(key)) {
                out.add(Map.of("key", key, "label", tab.ownText().trim()));
            }
        }
        return out;
    }

    /** 사이트에 보이는 내용(공개 API · 사본) */
    public Map<String, Object> publicData() {
        List<Map<String, Object>> items = new ArrayList<>();
        for (FaqItem i : mapper.findAll()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("cat", i.getCategory());
            m.put("question", i.getQuestion());
            m.put("answer", i.getAnswer());
            items.add(m);
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("version", 1);
        data.put("source", "backoffice");
        data.put("items", items);
        return data;
    }

    /** 사이트 페이지가 &lt;script&gt;로 바로 쓰는 모양: window.FAQ_DATA = {…} */
    public String publicScript() {
        Map<String, Object> data = publicData();
        data.put("source", "backoffice-api");
        return script(API_HEADER, data);
    }

    private String fingerprint() {
        return CategoryPageService.sha1(script("", publicData()));
    }

    // ── 저장 ──

    public synchronized Map<String, Object> save(SaveRequest request) {
        if (request == null || request.items() == null) {
            throw new BusinessException("저장할 내용이 없어요.");
        }
        String before = fingerprint();
        if (request.baseHash() == null || !request.baseHash().equals(before)) {
            throw new BusinessException("화면을 연 뒤에 자주 묻는 질문이 바뀌었어요. 화면을 새로 고친 뒤 다시 저장해 주세요(고친 내용은 다시 해 주셔야 해요).");
        }
        List<FaqItem> current = mapper.findAll();
        List<FaqItem> items = clean(request.items(), categories(), current);
        tx.executeWithoutResult(status -> {
            Map<Long, FaqItem> old = new HashMap<>();
            current.forEach(i -> old.put(i.getId(), i));
            for (FaqItem item : items) {
                if (item.getId() != null && old.remove(item.getId()) != null) {
                    mapper.update(item);
                } else {
                    item.setId(null);
                    mapper.insert(item);
                }
            }
            old.keySet().forEach(mapper::delete);
        });
        boolean changed = !before.equals(fingerprint());
        if (changed) {
            regenerate();
        }
        Map<String, Object> model = model();
        model.put("saved", changed);
        return model;
    }

    /** 받은 질문 확인 · 정리: 분류는 페이지에 있는 것만, 질문은 한 줄 글자, 답은 허용한 꾸밈만 */
    private static List<FaqItem> clean(List<Item> items, List<Map<String, String>> categories, List<FaqItem> current) {
        if (items.size() > MAX_ITEMS) {
            throw new BusinessException("질문은 " + MAX_ITEMS + "개까지 둘 수 있어요.");
        }
        Set<String> cats = new HashSet<>();
        categories.forEach(c -> cats.add(c.get("key")));
        Set<String> originalAnswers = new HashSet<>();
        current.forEach(item -> originalAnswers.add(item.getAnswer()));
        List<FaqItem> out = new ArrayList<>();
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
            FaqItem row = new FaqItem();
            row.setId(item.id());
            row.setCategory(cat);
            row.setQuestion(question);
            row.setAnswer(answer);
            row.setSortOrder(n);
            out.add(row);
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

    // ── 사본 · 처음 켤 때 ──

    /** 사본(check/js/faq-data.js)을 DB 내용으로 다시 쓴다(같으면 그대로) */
    public void regenerate() {
        CategoryPage page = pages.page(PAGE_ID);
        if (pages.exists(page)) {
            pages.writeSiteData(DATA_FILE, script(HEADER, publicData()));
        }
    }

    @EventListener(ContextRefreshedEvent.class)
    @Order(3)
    public void onReady() {
        try {
            int n = importFromPage();
            if (n > 0) {
                log.info("지원 전 체크 페이지에 있던 자주 묻는 질문 {}개를 DB로 옮겼습니다.", n);
            } else if ((n = importFromCopy()) > 0) {
                log.info("자주 묻는 질문 사본(check/js/faq-data.js)의 질문 {}개를 DB로 옮겼습니다.", n);
            }
            regenerate();
        } catch (RuntimeException e) {
            log.warn("지원 전 체크 자주 묻는 질문을 준비하지 못했습니다.", e);
        }
    }

    /** DB에 질문이 하나도 없을 때만: 사이트 페이지(예전처럼 HTML에 적혀 있던 질문)를 읽어 DB에 넣는다. 답은 페이지 글자 그대로. 넣은 질문 수 */
    public synchronized int importFromPage() {
        CategoryPage page = pages.page(PAGE_ID);
        if (!mapper.findAll().isEmpty() || !pages.exists(page)) {
            return 0;
        }
        String html = pages.published(page);
        int at = html.indexOf(LIST_OPEN);
        if (at < 0) {
            return 0;
        }
        Elements lis = Jsoup.parse(html).select("#faqList > li.faq-item");
        List<String> answers = rawAnswers(html, at);
        if (lis.isEmpty() || answers.size() != lis.size()) {
            return 0;
        }
        List<FaqItem> items = new ArrayList<>();
        for (int i = 0; i < lis.size(); i++) {
            Element li = lis.get(i);
            Element qt = li.selectFirst(".faq-qt");
            FaqItem item = new FaqItem();
            item.setCategory(li.attr("data-cat"));
            item.setQuestion(qt == null ? "" : qt.hasAttr("data-text") ? qt.attr("data-text") : qt.text());
            item.setAnswer(answers.get(i));
            item.setSortOrder(i + 1);
            items.add(item);
        }
        tx.executeWithoutResult(status -> items.forEach(mapper::insert));
        return items.size();
    }

    /**
     * DB도 페이지도 비어 있을 때(질문을 페이지에서 뺀 뒤 새 컴퓨터에서 처음 켤 때): 사본(check/js/faq-data.js)의 질문을 DB에 넣는다.
     * 답은 사본 글자 그대로(백오피스가 정리해 쓴 것). 넣은 질문 수
     */
    public synchronized int importFromCopy() {
        if (!mapper.findAll().isEmpty()) {
            return 0;
        }
        List<FaqItem> items = new ArrayList<>();
        pages.siteDataJson(DATA_FILE).ifPresent(text -> {
            try {
                for (JsonNode it : json.readTree(text).path("items")) {
                    FaqItem item = new FaqItem();
                    item.setCategory(it.path("cat").asText(""));
                    item.setQuestion(it.path("question").asText(""));
                    item.setAnswer(it.path("answer").asText(""));
                    item.setSortOrder(items.size() + 1);
                    if (!item.getCategory().isEmpty() && !item.getQuestion().isBlank() && !item.getAnswer().isBlank()) {
                        items.add(item);
                    }
                }
            } catch (JsonProcessingException e) {
                log.warn("자주 묻는 질문 사본을 읽지 못했습니다.", e);
            }
        });
        if (!items.isEmpty()) {
            tx.executeWithoutResult(status -> items.forEach(mapper::insert));
        }
        return items.size();
    }

    /** 페이지 글자 그대로의 답(div.faq-at 안쪽) */
    private static List<String> rawAnswers(String html, int listAt) {
        int[] list = LifePhotoService.element(html, listAt);
        List<String> out = new ArrayList<>();
        for (int i = html.indexOf(ANSWER_OPEN, list[0]); i >= 0 && i < list[1]; i = html.indexOf(ANSWER_OPEN, i + 1)) {
            int[] r = LifePhotoService.element(html, i);
            out.add(html.substring(r[0], r[1]));
        }
        return out;
    }

    private String script(String header, Map<String, Object> data) {
        try {
            return header + "window.FAQ_DATA = " + json.writerWithDefaultPrettyPrinter().writeValueAsString(data).replace("\r\n", "\n") + ";\n";
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
