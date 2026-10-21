package egovframework.backoffice.page;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import egovframework.backoffice.common.BusinessException;
import egovframework.backoffice.common.NotFoundException;
import egovframework.backoffice.post.PostStatus;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 지원 전 체크 › 자주 묻는 질문(FAQ) 관리. 2026-10-20부터 질문은 DB 표 faqs(V23)에 있다(처음 21개는 V23이 넣음).
 * <p>
 * 관리 화면이 고친 질문은 표에 저장하고, 사이트는 공개 API(/api/public/faq.js)로 받아 질문 목록과 분류 버튼의 질문 수를 그린다
 * (check/js/faq-render.js). 백오피스가 꺼져 있을 때를 위해 같은 내용을 사본(check/js/faq-data.js)으로도 쓴다.
 * 분류는 사이트 지원 전 체크 페이지의 분류 버튼(.faq-tabs)에 있는 것만 쓴다. 답에는 링크 · 굵게 · 기울임 · 강조 · 줄바꿈 · '확인 필요' 표시만 남긴다.
 * 질문마다 상태(임시저장 · 게시중 · 미게시)가 있고 사이트에는 게시중인 질문만 보인다(V24). 관리 화면에서 지운 질문은 다른 게시글처럼 휴지통으로 가고
 * (삭제됨 · 지운 시각 · 지우기 전 상태), 휴지통 화면(PostTrashService)에서 복원하거나 완전 삭제한다.
 * (예전 DB 버전은 Git c7b276b — 그때 표 이름은 faq_items)
 */
@Service
public class CheckFaqService {

    private static final Logger log = LoggerFactory.getLogger(CheckFaqService.class);

    static final String PAGE_ID = "check";
    static final String DATA_FILE = "check/js/faq-data.js";
    static final int MAX_ITEMS = 100;
    static final int MAX_QUESTION = 200;
    static final int MAX_ANSWER = 3000;

    /** 링크 주소의 종류(https: 등). 브라우저는 주소 속 공백 · 줄바꿈 · 탭을 무시하므로 그것들을 지운 뒤에 본다 */
    private static final Pattern URL_SCHEME = Pattern.compile("^([a-zA-Z][a-zA-Z0-9+.-]*):");
    private static final Set<String> SAFE_SCHEMES = Set.of("http", "https", "mailto", "tel");
    private static final Safelist ANSWER_TAGS = new Safelist()
            .addTags("a", "b", "strong", "em", "i", "br", "span", "mark")
            .addAttributes("a", "href", "target")
            .addAttributes("span", "class")
            .addAttributes("mark", "class");
    private static final String HEADER = "/* 지원 전 체크 자주 묻는 질문 사본: 사이트는 백오피스 공개 API(/api/public/faq.js)로 DB(표 faqs)의 질문을 받아 그려요. "
            + "이 파일은 백오피스가 꺼져 있을 때 쓰는 사본이라 FAQ 관리에서 저장할 때마다 다시 써요. 직접 고치지 마세요. */\n";
    private static final String API_HEADER = "/* 지원 전 체크 자주 묻는 질문: 백오피스 DB(표 faqs)의 지금 질문(지원 전 Check FAQ 관리) */\n";

    /** 질문 하나: id(새 질문은 null) · cat 분류(칩의 data-cat) · question 질문 글 · answer 답(HTML) · status 상태(DRAFT · PUBLISHED · HIDDEN, 없으면 게시중) */
    public record Item(Long id, String cat, String question, String answer, String status) { }

    /** 관리 화면에서 고를 수 있는 상태(삭제됨은 '삭제' 버튼 → 휴지통으로만) */
    private static final List<PostStatus> CHOOSABLE = PostStatus.CHOOSABLE;

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
        model.put("statuses", CHOOSABLE.stream().map(st -> Map.of("key", st.name(), "label", st.getLabel(), "css", st.getCss())).toList());
        model.put("items", liveItems());
        // NEW: 최근 24시간 안에 새로 쓴 질문(NavBadges.NEW_FOR) — 관리 화면 목록에 작게 표시
        java.time.LocalDateTime since = java.time.LocalDateTime.now().minus(egovframework.backoffice.common.NavBadges.NEW_FOR);
        model.put("newIds", mapper.findLive().stream().filter(i -> i.getCreatedAt() != null && i.getCreatedAt().isAfter(since))
                .map(FaqItem::getId).toList());
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

    /** 관리 화면의 질문(휴지통 제외, 상태 포함) */
    private List<Item> liveItems() {
        return mapper.findLive().stream().map(i -> new Item(i.getId(), i.getCategory(), i.getQuestion(), i.getAnswer(), i.getStatus().name())).toList();
    }

    /** 사이트에 보이는 내용(공개 API · 사본): 게시중인 질문만 */
    public Map<String, Object> publicData() {
        List<Map<String, Object>> items = new ArrayList<>();
        for (FaqItem i : mapper.findPublished()) {
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

    /** 관리 화면이 연 질문 목록의 지문(질문 · 답 · 분류 · 상태 · 순서). 그사이 다른 화면에서 저장하거나 휴지통에서 복원하면 바뀐다 */
    private String fingerprint() {
        try {
            return CategoryPageService.sha1(json.writeValueAsString(liveItems()));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
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
        List<FaqItem> current = mapper.findLive();
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
            // 목록에서 빠진 질문은 휴지통으로(휴지통 화면에서 복원 · 완전 삭제)
            old.keySet().forEach(mapper::softDelete);
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
            PostStatus state = status(item.status(), n);
            FaqItem row = new FaqItem();
            row.setId(item.id());
            row.setCategory(cat);
            row.setQuestion(question);
            row.setAnswer(answer);
            row.setStatus(state);
            row.setSortOrder(n);
            out.add(row);
        }
        return out;
    }

    /** 받은 상태: 비어 있으면 게시중(예전 화면 · 새 질문), 고를 수 있는 상태만 */
    private static PostStatus status(String value, int n) {
        if (value == null || value.isBlank()) {
            return PostStatus.PUBLISHED;
        }
        for (PostStatus st : CHOOSABLE) {
            if (st.name().equals(value.trim())) {
                return st;
            }
        }
        throw new BusinessException(n + "번째 질문의 상태(게시중 · 임시저장 · 미게시)를 골라 주세요.");
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

    /** 답 HTML 정리: 문단 · 줄은 줄바꿈(br)으로, 링크는 사이트 링크 모양(text-link)으로, 강조는 사이트 강조(mark.hl)로, 위험한 주소는 뺀다. */
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
        for (Element mark : doc.select("mark")) {
            mark.clearAttributes();
            mark.attr("class", "hl");
        }
        return doc.body().html()
                .replaceAll("(?:\\s|<br>)+$", "")
                .replaceAll("^(?:\\s|<br>)+", "")
                .replaceAll("(?:<br>\\s*){3,}", "<br><br>")
                .trim();
    }

    /** 질문 하나를 휴지통으로(임시저장 목록의 '삭제'). 사이트 사본도 맞춘다 */
    public synchronized void moveToTrash(Long id) {
        if (mapper.softDelete(id) == 0) {
            throw new NotFoundException("질문을 찾을 수 없습니다.");
        }
        regenerate();
    }

    // ── 휴지통(PostTrashService 가 휴지통 화면에서 부름 · 같은 트랜잭션) ──

    /** 휴지통에 있는 질문 하나(없으면 404) */
    public FaqItem getDeleted(Long id) {
        FaqItem item = mapper.findDeleted(id);
        if (item == null) {
            throw new NotFoundException("휴지통에서 질문을 찾을 수 없습니다.");
        }
        return item;
    }

    /** 복원: 지우기 전 상태로 FAQ 관리 목록의 원래 자리(지울 때의 번호)에 돌아온다(게시중이었으면 사이트에도 다시). 복원 전 모습을 돌려준다 */
    public FaqItem restore(Long id) {
        FaqItem before = getDeleted(id);
        restoreLocked(id);
        return before;
    }

    /** 완전 삭제(휴지통에 있는 것만, 되돌릴 수 없음) */
    public void purge(Long id) {
        getDeleted(id);
        mapper.hardDelete(id);
    }

    /** 휴지통의 이 질문들을 잠근다. 휴지통에 없는 질문은 빠진다 */
    public List<FaqItem> lockDeleted(List<Long> ids) {
        return ids.isEmpty() ? List.of() : mapper.lockDeleted(ids);
    }

    public List<FaqItem> lockAllDeleted() {
        return mapper.lockAllDeleted();
    }

    /** 복원 · 완전 삭제 뒤: 잠근 질문을 하나씩. 복원은 원래 자리를 비우고 그 자리로 */
    public void restoreLocked(Long id) {
        mapper.makeRoom(id);
        mapper.restore(id);
    }

    public void purgeLocked(Long id) {
        mapper.hardDelete(id);
    }

    // ── 사본 ──

    /** 사본(check/js/faq-data.js)을 DB 내용으로 다시 쓴다(같으면 그대로). 사이트에 지원 전 체크 페이지가 없으면 건너뛴다 */
    public void regenerate() {
        CategoryPage page = pages.page(PAGE_ID);
        if (pages.exists(page)) {
            pages.writeSiteData(DATA_FILE, script(HEADER, publicData()));
        }
    }

    /** 켤 때 사본을 DB 내용에 맞춘다(다른 컴퓨터에서 받은 사본이 이 컴퓨터 DB와 달라도 사이트가 이 DB 내용을 보이게) */
    @EventListener(ContextRefreshedEvent.class)
    @Order(3)
    public void onReady() {
        try {
            regenerate();
        } catch (RuntimeException e) {
            log.warn("지원 전 체크 자주 묻는 질문 사본을 쓰지 못했습니다.", e);
        }
    }

    private String script(String header, Map<String, Object> data) {
        try {
            return header + "window.FAQ_DATA = " + json.writerWithDefaultPrettyPrinter().writeValueAsString(data).replace("\r\n", "\n") + ";\n";
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
