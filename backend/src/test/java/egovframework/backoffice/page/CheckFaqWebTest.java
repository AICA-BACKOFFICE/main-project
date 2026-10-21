package egovframework.backoffice.page;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.authenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import egovframework.backoffice.BackofficeApplication;
import egovframework.testsupport.CmsMockMvcConfig;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * 게시물 관리 › 지원 전 Check FAQ 관리(2026-10-20 V23): 자주 묻는 질문은 DB 표 faqs 에 있다(처음 21개는 V23이 넣음).
 * 새로 쓰기 · 고치기 · 순서 · 지우기를 저장하면 표가 바뀌고, 사이트가 받는 공개 API(/api/public/faq.js)와 사본(check/js/faq-data.js)이
 * 같은 내용이 된다. 페이지 파일(check/index.html)은 그대로라 페이지 편집 임시저장 · 반영과 부딪치지 않는다. 답은 허용한 꾸밈만 남는다.
 * 편집 화면에서 올린 그림은 페이지 폴더(assets/uploads)에만 둔다(2026-10-20부터 미디어 관리 없음).
 */
@TestPropertySource(properties = {
        "datasource.url=jdbc:h2:mem:backoffice-check-faq-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "backoffice.upload-dir=${java.io.tmpdir}/aica-check-faq-test/uploads",
        "backoffice.pages.site-root=${java.io.tmpdir}/aica-check-faq-test/site",
        "backoffice.pages.data-dir=${java.io.tmpdir}/aica-check-faq-test/data",
        "backoffice.initial-admin.password=test-pass-1234"
})
@SpringJUnitWebConfig({BackofficeApplication.class, CmsMockMvcConfig.class})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class CheckFaqWebTest {

    private static final Path ROOT = Paths.get(System.getProperty("java.io.tmpdir"), "aica-check-faq-test");
    private static final Path CHECK = ROOT.resolve("site/check/index.html");
    private static final String ARROW = "<span class=\"faq-arrow\" aria-hidden=\"true\"><svg viewBox=\"0 0 24 24\"><path d=\"M6 9l6 6 6-6\"></path></svg></span>";
    /** 사이트 지원 전 체크 페이지 모양(분류 버튼 다섯 개 · 페이지에 적힌 옛 질문 하나) */
    private static final String PAGE = String.join("\r\n",
            "<!doctype html>",
            "<html lang=\"ko\"><head><meta charset=\"utf-8\"><title>지원 전 체크</title>",
            "<script src=\"js/faq-data.js\" defer></script>",
            "<script src=\"../api/public/faq.js\" defer></script>",
            "<script src=\"js/faq-render.js\" defer></script>",
            "</head>",
            "<body>",
            "  <section id=\"faq\" class=\"sec\"><div class=\"wrap\">",
            "    <div class=\"faq rv\">",
            "      <div class=\"faq-tools\">",
            "        <div class=\"faq-tabs\" role=\"group\" aria-label=\"질문 분류\">",
            "          <button type=\"button\" class=\"faq-tab\" data-cat=\"all\" aria-pressed=\"true\">전체<em class=\"faq-cnt\">1</em></button>",
            "          <button type=\"button\" class=\"faq-tab\" data-cat=\"준비사항\" aria-pressed=\"false\">준비사항<em class=\"faq-cnt\">1</em></button>",
            "          <button type=\"button\" class=\"faq-tab\" data-cat=\"수업\" aria-pressed=\"false\">수업<em class=\"faq-cnt\">0</em></button>",
            "          <button type=\"button\" class=\"faq-tab\" data-cat=\"생활\" aria-pressed=\"false\">생활<em class=\"faq-cnt\">0</em></button>",
            "          <button type=\"button\" class=\"faq-tab\" data-cat=\"지원금\" aria-pressed=\"false\">지원금<em class=\"faq-cnt\">0</em></button>",
            "          <button type=\"button\" class=\"faq-tab\" data-cat=\"프로젝트\" aria-pressed=\"false\">프로젝트<em class=\"faq-cnt\">0</em></button>",
            "        </div>",
            "      </div>",
            "      <ul class=\"faq-list\" id=\"faqList\">",
            "        <li id=\"faq-1\" class=\"faq-item\" data-cat=\"준비사항\">",
            "          <h3><button type=\"button\" class=\"faq-q\" id=\"fq-0\" aria-expanded=\"false\" aria-controls=\"fa-0\"><span class=\"faq-qa\">Q</span>"
                    + "<span class=\"faq-qt\" data-text=\"페이지에 적힌 옛 질문\">페이지에 적힌 옛 질문</span>" + ARROW + "</button></h3>",
            "          <div class=\"faq-a\" id=\"fa-0\" role=\"region\" aria-labelledby=\"fq-0\"><div><span class=\"faq-qa\">A</span><div class=\"faq-at\">옛 답</div></div></div>",
            "        </li>",
            "      </ul>",
            "    </div>",
            "  </div></section>",
            "</body>",
            "</html>",
            "");
    private static final byte[] PNG = java.util.Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");

    static {
        try {
            if (Files.exists(ROOT)) {
                try (Stream<Path> walk = Files.walk(ROOT)) {
                    walk.sorted(Comparator.reverseOrder()).forEach(path -> path.toFile().delete());
                }
            }
            Files.createDirectories(CHECK.getParent());
            Files.writeString(CHECK, PAGE, UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;

    private MockHttpSession login() throws Exception {
        return (MockHttpSession) mvc.perform(formLogin("/login").user("loginId", "admin").password("password", "test-pass-1234"))
                .andExpect(authenticated()).andReturn().getRequest().getSession(false);
    }

    private JsonNode model(MockHttpSession session) throws Exception {
        return json.readTree(mvc.perform(get("/admin/pages/faq/api").session(session)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(UTF_8));
    }

    private ResultActions save(MockHttpSession session, String hash, ArrayNode items) throws Exception {
        ObjectNode body = json.createObjectNode().put("baseHash", hash);
        body.set("items", items);
        return mvc.perform(post("/admin/pages/faq/api").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    private ObjectNode item(String cat, String question, String answer) {
        return json.createObjectNode().put("cat", cat).put("question", question).put("answer", answer);
    }

    /** DB에 있는 질문을 그 번호(id) · 상태 그대로 보낼 때 */
    private ObjectNode item(JsonNode current) {
        return item(current.get("cat").asText(), current.get("question").asText(), current.get("answer").asText())
                .put("id", current.get("id").asLong()).put("status", current.get("status").asText());
    }

    private ArrayNode all(JsonNode model) {
        ArrayNode items = json.createArrayNode();
        model.get("items").forEach(it -> items.add(item(it)));
        return items;
    }

    private JsonNode publicApi() throws Exception {
        return json.readTree(mvc.perform(get("/api/public/faq")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8));
    }

    private JsonNode copy() throws IOException {
        String js = Files.readString(CHECK.resolveSibling("js/faq-data.js"), UTF_8);
        return json.readTree(js.substring(js.indexOf('{'), js.lastIndexOf('}') + 1));
    }

    @Test
    @Order(1)
    void theTwentyOneQuestionsAreInTheFaqsTable() throws Exception {
        // 표: 번호 · 분류 · 질문 · 답변(처음 21개)
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM faqs", Long.class)).isEqualTo(21);
        assertThat(jdbc.queryForList("SELECT category FROM faqs GROUP BY category ORDER BY MIN(sort_order)", String.class))
                .containsExactly("준비사항", "수업", "생활", "지원금", "프로젝트");
        assertThat(jdbc.queryForObject("SELECT question FROM faqs WHERE sort_order = 21", String.class)).isEqualTo("팀원과 갈등이 생기면 어떻게 하나요?");
        // 다른 게시글 표처럼 상태 · 휴지통 칸(V24): 처음 21개는 모두 게시중, 휴지통 아님
        assertThat(jdbc.queryForList("SELECT LOWER(column_name) FROM information_schema.columns WHERE LOWER(table_name) = 'faqs'", String.class))
                .contains("status", "status_before_trash", "deleted_at");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM faqs WHERE status = 'PUBLISHED' AND deleted_at IS NULL AND status_before_trash IS NULL", Long.class))
                .isEqualTo(21);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> jdbc.update("UPDATE faqs SET status = 'GONE' WHERE sort_order = 1"))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);

        MockHttpSession session = login();
        assertThat(mvc.perform(get("/admin/faq").session(session)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8))
                .contains("지원 전 Check FAQ 관리").contains("/admin/pages/faq/api");
        JsonNode m = model(session);
        assertThat(m.get("categories")).hasSize(5);
        assertThat(m.at("/categories/4/key").asText()).isEqualTo("프로젝트");
        assertThat(m.get("items")).hasSize(21);
        assertThat(m.at("/items/0/id").isNumber()).isTrue();
        assertThat(m.at("/items/0/question").asText()).isEqualTo("비전공자인데 수업을 따라갈 수 있을까요?");
        // 답은 사이트에 있던 링크 · 강조를 살린 HTML, 새로 받은 답은 그 글 그대로
        assertThat(m.at("/items/0/answer").asText()).contains("<mark class=\"hl\">비전공자도 지원할 수 있어요</mark>")
                .contains("<a class=\"text-link\" href=\"../stories/index.html#reviews\">선배 후기</a>");
        assertThat(m.at("/items/2/answer").asText()).startsWith("지원 전에 반드시 이수해야 하는 별도의 사전학습은 없습니다.");
        assertThat(m.at("/items/6/answer").asText()).isEqualTo("하루 일과는 <a class=\"text-link\" href=\"../about/index.html#learning\">인사교 알아보기</a>에서 볼 수 있어요.");
        assertThat(m.toString()).doesNotContain("확인 필요");
        assertThat(m.at("/hasDraft").asBoolean()).isFalse();
        assertThat(m.at("/items/0/status").asText()).isEqualTo("PUBLISHED");
        assertThat(m.get("statuses")).hasSize(3);
        // 사이트가 받는 공개 API(로그인 없이)와 사본이 같은 내용, 페이지에 적힌 옛 질문은 쓰지 않음
        JsonNode api = publicApi();
        assertThat(api.get("source").asText()).isEqualTo("backoffice-api");
        assertThat(api.get("items")).hasSize(21);
        assertThat(api.at("/items/20/cat").asText()).isEqualTo("프로젝트");
        assertThat(copy().get("items")).isEqualTo(api.get("items"));
        assertThat(api.toString()).doesNotContain("페이지에 적힌 옛 질문");
        assertThat(mvc.perform(get("/api/public/faq.js")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8))
                .startsWith("/*").contains("window.FAQ_DATA = ").contains("팀원과 갈등이 생기면 어떻게 하나요?");
    }

    @Test
    @Order(2)
    void savingUnchangedQuestionsChangesNothing() throws Exception {
        MockHttpSession session = login();
        JsonNode m = model(session);
        save(session, m.get("hash").asText(), all(m)).andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(false));
        assertThat(Files.readString(CHECK, UTF_8)).isEqualTo(PAGE);
        assertThat(model(session).get("hash").asText()).isEqualTo(m.get("hash").asText());
    }

    @Test
    @Order(3)
    void writeEditReorderAndDeleteAreSavedInTheTableNotThePage() throws Exception {
        MockHttpSession session = login();
        JsonNode m = model(session);
        JsonNode first = m.at("/items/0"), coding = m.at("/items/1"), last = m.at("/items/20");
        List<Long> oldIds = new ArrayList<>();
        m.get("items").forEach(it -> oldIds.add(it.get("id").asLong()));
        ArrayNode items = json.createArrayNode();
        // 마지막 질문을 맨 앞으로(질문 글 고침), 새 질문, 나머지는 그대로 · 둘째 질문(코딩 테스트)은 지움
        items.add(item(last).put("question", "팀원과 갈등이 생기면 누구에게 말하나요?"));
        items.add(item("생활", "점심은 어떻게 먹나요?",
                "<b>구내식당</b>이 있어요.<div>둘째 줄 <i>기울임</i> <mark style=\"color:red\">강조</mark></div><a href=\"javascript:alert(1)\">위험</a>"
                        + "<a href=\"https://example.com\" target=\"_blank\" onclick=\"x()\">링크</a><script>alert(1)</script><span style=\"color:red\">빨강</span>"));
        for (int i = 0; i < 20; i++) {
            if (i != 1) {
                items.add(item(m.at("/items/" + i)));
            }
        }
        save(session, m.get("hash").asText(), items).andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(true));

        JsonNode after = model(session);
        assertThat(after.get("items")).hasSize(21);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM faqs WHERE deleted_at IS NULL", Long.class)).isEqualTo(21);
        // 같은 질문은 같은 번호로 고쳐지고(순서는 sort_order), 새 질문은 새 번호, 지운 질문은 없어짐
        assertThat(after.at("/items/0/id").asLong()).isEqualTo(last.get("id").asLong());
        assertThat(after.at("/items/0/question").asText()).isEqualTo("팀원과 갈등이 생기면 누구에게 말하나요?");
        assertThat(after.at("/items/0/answer").asText()).isEqualTo(last.get("answer").asText());
        assertThat(after.at("/items/1/id").asLong()).isNotIn(oldIds);
        assertThat(after.at("/items/2/id").asLong()).isEqualTo(first.get("id").asLong());
        assertThat(jdbc.queryForObject("SELECT sort_order FROM faqs WHERE id = ?", Integer.class, last.get("id").asLong())).isEqualTo(1);
        assertThat(after.toString()).doesNotContain(coding.get("question").asText());
        // 지운 질문은 표에서 없어지지 않고 휴지통으로(삭제됨 · 지우기 전 상태 · 지운 시각)
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM faqs", Long.class)).isEqualTo(22);
        Map<String, Object> trashed = jdbc.queryForMap("SELECT status, status_before_trash, deleted_at FROM faqs WHERE id = ?", coding.get("id").asLong());
        assertThat(trashed.get("status")).isEqualTo("DELETED");
        assertThat(trashed.get("status_before_trash")).isEqualTo("PUBLISHED");
        assertThat(trashed.get("deleted_at")).isNotNull();
        // 새 답: 문단은 줄바꿈으로, 강조는 사이트 강조 모양으로, 위험한 주소 · 스크립트 · 꾸밈(style)은 빼고, 링크는 사이트 링크 모양으로
        assertThat(after.at("/items/1/answer").asText()).isEqualTo("<b>구내식당</b>이 있어요.<br>둘째 줄 <i>기울임</i> <mark class=\"hl\">강조</mark>위험"
                + "<a class=\"text-link\" href=\"https://example.com\" target=\"_blank\" rel=\"noopener\">링크</a>빨강");
        // 사이트: 공개 API와 사본이 바로 같은 순서로(페이지 파일은 그대로 — 사이트가 데이터로 그림)
        JsonNode api = publicApi();
        assertThat(api.at("/items/0/question").asText()).isEqualTo("팀원과 갈등이 생기면 누구에게 말하나요?");
        assertThat(api.at("/items/1/question").asText()).isEqualTo("점심은 어떻게 먹나요?");
        assertThat(api.at("/items/2/question").asText()).isEqualTo(first.get("question").asText());
        assertThat(api.toString()).doesNotContain("<script").doesNotContain("javascript:").doesNotContain("onclick");
        assertThat(copy().get("items")).isEqualTo(api.get("items"));
        assertThat(Files.readString(CHECK, UTF_8)).isEqualTo(PAGE);
    }

    @Test
    @Order(4)
    void emptyQuestionUnknownCategoryAndStaleHashAreRefusedButAPageDraftDoesNotBlock() throws Exception {
        MockHttpSession session = login();
        JsonNode m = model(session);
        String hash = m.get("hash").asText();
        ArrayNode blank = json.createArrayNode().add(item("생활", "  ", "답"));
        save(session, hash, blank).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("1번째 질문의 질문 글이 비어 있어요."));
        ArrayNode unknown = json.createArrayNode().add(item("없는분류", "질문", "답"));
        save(session, hash, unknown).andExpect(status().isBadRequest());
        save(session, "stale", all(m)).andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM faqs WHERE deleted_at IS NULL", Long.class)).isEqualTo(21);

        // 페이지 편집 임시저장이 있어도 질문은 DB라 저장돼요
        String draft = Files.readString(CHECK, UTF_8).replace("</body>", "<!-- 임시 --></body>");
        mvc.perform(put("/admin/pages/api/draft").param("page", "check").session(session).with(csrf()).content(draft.getBytes(UTF_8)))
                .andExpect(status().isOk());
        assertThat(model(session).get("hasDraft").asBoolean()).isFalse();
        ArrayNode items = all(m);
        ((ObjectNode) items.get(0)).put("question", "임시저장이 있어도 저장");
        save(session, hash, items).andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(true));
        assertThat(publicApi().at("/items/0/question").asText()).isEqualTo("임시저장이 있어도 저장");
        mvc.perform(delete("/admin/pages/api/draft").param("page", "check").session(session).with(csrf())).andExpect(status().isOk());
    }

    @Test
    @Order(5)
    void editorUploadsStayInThePageFolder() throws Exception {
        MockHttpSession session = login();
        String uploaded = json.readTree(mvc.perform(post("/admin/pages/api/upload").param("page", "check").param("name", "campus.png")
                        .session(session).with(csrf()).content(PNG)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8))
                .get("path").asText();
        assertThat(uploaded).startsWith("assets/uploads/").endsWith("-campus.png");
        assertThat(Files.readAllBytes(CHECK.getParent().resolve(uploaded))).isEqualTo(PNG);
        // 미디어 관리 목록 · 가져오기는 없어졌다
        mvc.perform(get("/admin/pages/api/media").session(session)).andExpect(status().isNotFound());
    }

    @Test
    @Order(6)
    void publishingThePageInTheEditorDoesNotUndoAFaqSave() throws Exception {
        MockHttpSession session = login();
        // 페이지 편집기가 check 페이지를 연 순간의 사이트 파일 지문과 화면
        String base = json.readTree(mvc.perform(get("/admin/pages/api/state").param("page", "check").session(session))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8)).get("publishedHash").asText();
        String opened = Files.readString(CHECK, UTF_8);
        // 그사이 FAQ 관리에서 질문을 고쳐 저장(DB) — 페이지 파일은 그대로라 편집기 반영과 부딪치지 않음
        JsonNode m = model(session);
        ArrayNode items = all(m);
        ((ObjectNode) items.get(0)).put("question", "편집기를 연 뒤 바꾼 질문");
        save(session, m.get("hash").asText(), items).andExpect(status().isOk());
        String edited = opened.replace("</body>", "<!-- 편집 --></body>");
        mvc.perform(post("/admin/pages/api/publish").param("page", "check").param("base", base).session(session).with(csrf())
                .content(edited.getBytes(UTF_8))).andExpect(status().isOk());
        assertThat(Files.readString(CHECK, UTF_8)).contains("<!-- 편집 -->");
        assertThat(publicApi().at("/items/0/question").asText()).isEqualTo("편집기를 연 뒤 바꾼 질문");
        // 페이지 편집 화면에서 질문 목록은 'FAQ 관리에서 고쳐요' 안내가 붙는 곳
        assertThat(mvc.perform(get("/admin/pages/site/check/index.html").param("__bo", "edit").session(session)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(UTF_8)).contains("#faqList").contains("지원 전 Check FAQ 관리");
    }

    @Test
    @Order(7)
    void answerLinksKeepOnlySafeAddressesEvenWithHiddenCharacters() {
        assertThat(CheckFaqService.cleanAnswer("<a href=\"java\tscript:alert(1)\">a</a>")).doesNotContain("href");
        assertThat(CheckFaqService.cleanAnswer("<a href=\"java&#10;script:alert(1)\">b</a>")).doesNotContain("href");
        assertThat(CheckFaqService.cleanAnswer("<a href=\"vbscript:x\">c</a>")).doesNotContain("href");
        assertThat(CheckFaqService.cleanAnswer("<a href=\"https://aica-gj.kr/apply\">d</a>")).contains("href=\"https://aica-gj.kr/apply\"");
        assertThat(CheckFaqService.cleanAnswer("<a href=\"mailto:help@example.com\">e</a>")).contains("href=\"mailto:help@example.com\"");
        assertThat(CheckFaqService.cleanAnswer("<a href=\"#faq\">f</a>")).contains("href=\"#faq\"");
        assertThat(CheckFaqService.cleanAnswer("<mark onclick=\"x()\">g</mark>")).isEqualTo("<mark class=\"hl\">g</mark>");
    }

    @Test
    @Order(8)
    void statusDecidesWhatTheSiteShows() throws Exception {
        MockHttpSession session = login();
        JsonNode m = model(session);
        String hidden = m.at("/items/0/question").asText(), draft = m.at("/items/1/question").asText();
        ArrayNode items = all(m);
        ((ObjectNode) items.get(0)).put("status", "HIDDEN");
        ((ObjectNode) items.get(1)).put("status", "DRAFT");
        save(session, m.get("hash").asText(), items).andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(true));

        // 관리 화면에는 그대로(상태와 함께), 사이트(공개 API · 사본)에는 게시중만
        JsonNode after = model(session);
        assertThat(after.get("items")).hasSize(21);
        assertThat(after.at("/items/0/status").asText()).isEqualTo("HIDDEN");
        assertThat(after.at("/items/1/status").asText()).isEqualTo("DRAFT");
        JsonNode api = publicApi();
        assertThat(api.get("items")).hasSize(19);
        assertThat(api.toString()).doesNotContain(hidden).doesNotContain(draft);
        assertThat(copy().get("items")).isEqualTo(api.get("items"));
        // 삭제됨은 '삭제' 버튼(휴지통)으로만, 모르는 상태는 받지 않음
        ArrayNode bad = all(after);
        ((ObjectNode) bad.get(2)).put("status", "DELETED");
        save(session, after.get("hash").asText(), bad).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("3번째 질문의 상태(게시중 · 임시저장 · 미게시)를 골라 주세요."));

        // 다시 게시중으로
        ArrayNode back = all(after);
        ((ObjectNode) back.get(0)).put("status", "PUBLISHED");
        ((ObjectNode) back.get(1)).put("status", "PUBLISHED");
        save(session, after.get("hash").asText(), back).andExpect(status().isOk());
        assertThat(publicApi().get("items")).hasSize(21);
    }

    /** FAQ 관리 목록에서 이 질문을 빼고 저장(→ 휴지통) */
    private void deleteInList(MockHttpSession session, long id) throws Exception {
        JsonNode m = model(session);
        ArrayNode items = json.createArrayNode();
        m.get("items").forEach(it -> { if (it.get("id").asLong() != id) items.add(item(it)); });
        save(session, m.get("hash").asText(), items).andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(true));
    }

    private String trashPage(MockHttpSession session, String... params) throws Exception {
        var req = get("/admin/posts/trash").session(session);
        for (int i = 0; i + 1 < params.length; i += 2) {
            req = req.param(params[i], params[i + 1]);
        }
        return mvc.perform(req).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8);
    }

    private Map<String, Object> row(long id) {
        return jdbc.queryForMap("SELECT status, status_before_trash, deleted_at, sort_order FROM faqs WHERE id = ?", id);
    }

    @Test
    @Order(9)
    void deletedQuestionsAreRestoredOrPurgedInTheSharedTrash() throws Exception {
        MockHttpSession session = login();
        // 3번 시험에서 지운 질문(코딩 테스트)이 휴지통에: 후기 · 인터뷰 · 프로젝트 글과 같은 화면
        long coding = jdbc.queryForObject("SELECT id FROM faqs WHERE deleted_at IS NOT NULL", Long.class);
        String trash = trashPage(session);
        assertThat(trash).contains("코딩 테스트를 꼭 봐야 하나요?").contains("지원 전 Check FAQ › 준비사항").contains("value=\"faq-" + coding + "\"")
                .contains("삭제 전 게시중").contains("/admin/posts/faq/" + coding + "/restore").contains("/admin/posts/faq/" + coding + "/purge");
        assertThat(trashPage(session, "keyword", "코딩 테스트")).contains("코딩 테스트를 꼭 봐야 하나요?");
        assertThat(trashPage(session, "keyword", "없는 질문")).doesNotContain("코딩 테스트를 꼭 봐야 하나요?");

        // 하나 복원: 지우기 전 상태(게시중)로 FAQ 관리 목록의 원래 자리(지울 때 2번)에, 사이트에도 다시
        mvc.perform(post("/admin/posts/faq/" + coding + "/restore").session(session).with(csrf()))
                .andExpect(status().is3xxRedirection()).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl("/admin/faq"));
        assertThat(row(coding).get("status")).isEqualTo("PUBLISHED");
        assertThat(row(coding).get("deleted_at")).isNull();
        assertThat(row(coding).get("status_before_trash")).isNull();
        JsonNode m = model(session);
        assertThat(m.get("items")).hasSize(22);
        assertThat(m.at("/items/1/id").asLong()).isEqualTo(coding);
        assertThat(row(coding).get("sort_order")).isEqualTo(2);
        // 뒤의 질문들은 한 칸씩 밀려 번호가 겹치지 않음
        assertThat(jdbc.queryForObject("SELECT COUNT(DISTINCT sort_order) FROM faqs WHERE deleted_at IS NULL", Long.class)).isEqualTo(22);
        assertThat(publicApi().toString()).contains("코딩 테스트를 꼭 봐야 하나요?");
        assertThat(copy().get("items")).isEqualTo(publicApi().get("items"));
        assertThat(trashPage(session)).doesNotContain("코딩 테스트를 꼭 봐야 하나요?");

        // 선택 복원 · 선택 삭제(값 "faq-번호")
        deleteInList(session, coding);
        mvc.perform(post("/admin/posts/trash/bulk").session(session).with(csrf()).param("ids", "faq-" + coding).param("action", "restore"))
                .andExpect(status().is3xxRedirection());
        assertThat(row(coding).get("deleted_at")).isNull();
        assertThat(model(session).at("/items/1/id").asLong()).isEqualTo(coding);
        deleteInList(session, coding);
        mvc.perform(post("/admin/posts/trash/bulk").session(session).with(csrf()).param("ids", "faq-" + coding).param("action", "purge"))
                .andExpect(status().is3xxRedirection());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM faqs WHERE id = ?", Long.class, coding)).isZero();
        // 이미 없는 질문을 고르면 하지 않음
        mvc.perform(post("/admin/posts/trash/bulk").session(session).with(csrf()).param("ids", "faq-" + coding).param("action", "restore"))
                .andExpect(status().isBadRequest());

        // 하나 완전 삭제 · 휴지통 전체 비우기에도 질문이 같이
        long first = model(session).at("/items/0/id").asLong(), second = model(session).at("/items/1/id").asLong();
        deleteInList(session, first);
        mvc.perform(post("/admin/posts/faq/" + first + "/purge").session(session).with(csrf())).andExpect(status().is3xxRedirection());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM faqs WHERE id = ?", Long.class, first)).isZero();
        deleteInList(session, second);
        Matcher snapshot = Pattern.compile("name=\"snapshot\" value=\"([0-9a-f]+)\"").matcher(trashPage(session));
        assertThat(snapshot.find()).isTrue();
        mvc.perform(post("/admin/posts/trash/empty").session(session).with(csrf()).param("snapshot", snapshot.group(1)))
                .andExpect(status().is3xxRedirection());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM faqs WHERE deleted_at IS NOT NULL", Long.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM faqs WHERE id = ?", Long.class, second)).isZero();
    }
}
