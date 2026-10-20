package egovframework.backoffice.page;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.authenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Comparator;
import java.util.stream.Stream;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import egovframework.backoffice.BackofficeApplication;
import egovframework.testsupport.CmsMockMvcConfig;
import org.springframework.test.context.TestPropertySource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * 게시물 관리 › 지원 전 Check FAQ 관리: 처음 켤 때 사이트 페이지에 적혀 있던 질문을 DB로 옮기고, 새로 쓰기 · 고치기 · 순서 · 지우기를 저장하면
 * DB와 사이트 사본(check/js/faq-data.js) · 공개 API(/api/public/faq)가 바뀐다(페이지 파일은 그대로). 답은 허용한 꾸밈만 남는다.
 * 그사이 다른 곳에서 질문이 바뀌었으면 저장하지 않는다. 페이지 편집 임시저장 · 반영과는 서로 상관없다.
 * 이미지 바꾸기 창 ↔ 미디어 관리: 편집 화면에서 올린 그림은 미디어 관리에도 남고, 미디어 관리의 그림은 페이지 폴더로 가져와 쓴다.
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
    private static final String ANSWER0 = "전공은 상관없어요. 자세한 순서는 <a class=\"text-link\" href=\"#schedule\">모집 프로세스</a>에서 확인해 주세요.";
    private static final String ANSWER2 = "[안내] <span class=\"tbd\">확인 필요</span> 기숙사는 없어요 &amp; 통학해요.";
    private static final String ARROW = "<span class=\"faq-arrow\" aria-hidden=\"true\"><svg viewBox=\"0 0 24 24\"><path d=\"M6 9l6 6 6-6\"></path></svg></span>";
    private static final String HEAD = String.join("\r\n",
            "<!doctype html>",
            "<html lang=\"ko\"><head><meta charset=\"utf-8\"><title>지원 전 체크</title></head>",
            "<body>",
            "  <section id=\"faq\" class=\"sec\"><div class=\"wrap\">",
            "    <div class=\"faq rv\">",
            "      <div class=\"faq-tools\">",
            "        <div class=\"faq-tabs\" role=\"group\" aria-label=\"질문 분류\">",
            "          <button type=\"button\" class=\"faq-tab\" data-cat=\"all\" aria-pressed=\"true\">전체<em class=\"faq-cnt\">3</em></button>",
            "          <button type=\"button\" class=\"faq-tab\" data-cat=\"준비사항\" aria-pressed=\"false\">준비사항<em class=\"faq-cnt\">2</em></button>",
            "          <button type=\"button\" class=\"faq-tab\" data-cat=\"생활\" aria-pressed=\"false\">생활<em class=\"faq-cnt\">1</em></button>",
            "        </div>",
            "      </div>",
            "      <ul class=\"faq-list\" id=\"faqList\" style=\"min-height: 327px;\">",
            "");
    private static final String TAIL = String.join("\r\n",
            "      </ul>",
            "      <div class=\"faq-empty\" id=\"faqEmpty\" hidden><p>카카오톡으로 물어보시면 알려드려요.</p></div>",
            "    </div>",
            "  </div></section>",
            "</body>",
            "</html>",
            "");
    private static final String PAGE = HEAD
            + item(0, "준비사항", "비전공자도 지원할 수 있나요?", ANSWER0)
            + item(1, "준비사항", "코딩 테스트를 꼭 봐야 하나요?", "포트폴리오가 있으면 면제돼요.")
            + item(2, "생활", "기숙사가 있나요?", ANSWER2)
            + TAIL;
    private static final byte[] PNG = java.util.Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");

    /** 질문 하나(사이트 1014 지원 전 체크의 질문 모양) */
    private static String item(int i, String cat, String question, String answer) {
        return String.join("\r\n",
                "        <li class=\"faq-item\" data-cat=\"" + cat + "\">",
                "          <h3><button type=\"button\" class=\"faq-q\" id=\"fq-" + i + "\" aria-expanded=\"false\" aria-controls=\"fa-" + i + "\">"
                        + "<span class=\"faq-qa\">Q</span><span class=\"faq-qt\" data-text=\"" + question + "\">" + question + "</span>" + ARROW + "</button></h3>",
                "          <div class=\"faq-a\" id=\"fa-" + i + "\" role=\"region\" aria-labelledby=\"fq-" + i + "\"><div><span class=\"faq-qa\">A</span><div class=\"faq-at\">" + answer + "</div></div></div>",
                "        </li>",
                "");
    }

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

    /** DB에 있는 질문을 그 번호(id) 그대로 보낼 때 */
    private ObjectNode item(JsonNode current) {
        return item(current.get("cat").asText(), current.get("question").asText(), current.get("answer").asText()).put("id", current.get("id").asLong());
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
    void questionsOnThePageAreMovedIntoTheDatabaseOnStartup() throws Exception {
        MockHttpSession session = login();
        assertThat(mvc.perform(get("/admin/faq").session(session)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8))
                .contains("지원 전 Check FAQ 관리").contains("/admin/pages/faq/api");
        JsonNode m = model(session);
        assertThat(m.at("/categories/0/key").asText()).isEqualTo("준비사항");
        assertThat(m.at("/categories/1/label").asText()).isEqualTo("생활");
        assertThat(m.get("categories")).hasSize(2);
        assertThat(m.get("items")).hasSize(3);
        assertThat(m.at("/items/0/id").isNumber()).isTrue();
        assertThat(m.at("/items/0/question").asText()).isEqualTo("비전공자도 지원할 수 있나요?");
        // 답은 페이지 글자 그대로
        assertThat(m.at("/items/0/answer").asText()).isEqualTo(ANSWER0);
        assertThat(m.at("/items/2/answer").asText()).isEqualTo(ANSWER2);
        assertThat(m.at("/hasDraft").asBoolean()).isFalse();
        // 사이트가 받는 공개 API(로그인 없이)와 사본이 같은 내용
        JsonNode api = publicApi();
        assertThat(api.get("source").asText()).isEqualTo("backoffice-api");
        assertThat(api.get("items")).hasSize(3);
        assertThat(api.at("/items/2/cat").asText()).isEqualTo("생활");
        assertThat(copy().get("items")).isEqualTo(api.get("items"));
        assertThat(mvc.perform(get("/api/public/faq.js")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8))
                .startsWith("/*").contains("window.FAQ_DATA = ").contains("기숙사가 있나요?");
    }

    @Test
    @Order(2)
    void savingUnchangedQuestionsChangesNothing() throws Exception {
        MockHttpSession session = login();
        JsonNode m = model(session);
        ArrayNode same = json.createArrayNode();
        m.get("items").forEach(it -> same.add(item(it)));
        save(session, m.get("hash").asText(), same).andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(false));
        assertThat(Files.readString(CHECK, UTF_8)).isEqualTo(PAGE);
        assertThat(model(session).get("hash").asText()).isEqualTo(m.get("hash").asText());
    }

    @Test
    @Order(3)
    void writeEditReorderAndDeleteAreSavedInTheDatabaseNotThePage() throws Exception {
        MockHttpSession session = login();
        JsonNode m = model(session);
        JsonNode first = m.at("/items/0"), second = m.at("/items/1"), third = m.at("/items/2");
        ArrayNode items = json.createArrayNode();
        // 셋째 질문(생활)을 맨 앞으로 · 고친 질문 글, 새 질문, 첫 질문은 그대로, 둘째 질문은 지움
        items.add(item(third).put("question", "기숙사나 숙소가 있나요?"));
        items.add(item("생활", "점심은 어떻게 먹나요?",
                "<b>구내식당</b>이 있어요.<div>둘째 줄 <i>기울임</i></div><a href=\"javascript:alert(1)\">위험</a>"
                        + "<a href=\"https://example.com\" target=\"_blank\" onclick=\"x()\">링크</a><script>alert(1)</script><span style=\"color:red\">빨강</span>"));
        items.add(item(first));
        save(session, m.get("hash").asText(), items).andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(true));

        JsonNode after = model(session);
        assertThat(after.get("items")).hasSize(3);
        // 같은 질문은 같은 번호로 고쳐지고, 새 질문은 새 번호, 지운 질문은 없어짐
        assertThat(after.at("/items/0/id").asLong()).isEqualTo(third.get("id").asLong());
        assertThat(after.at("/items/0/question").asText()).isEqualTo("기숙사나 숙소가 있나요?");
        assertThat(after.at("/items/0/answer").asText()).isEqualTo(ANSWER2);
        assertThat(after.at("/items/1/id").asLong()).isNotIn(first.get("id").asLong(), second.get("id").asLong(), third.get("id").asLong());
        assertThat(after.at("/items/2/id").asLong()).isEqualTo(first.get("id").asLong());
        assertThat(after.toString()).doesNotContain("코딩 테스트를 꼭 봐야 하나요?");
        // 새 답: 문단은 줄바꿈으로, 위험한 주소 · 스크립트 · 꾸밈(style)은 빼고, 링크는 사이트 링크 모양으로
        assertThat(after.at("/items/1/answer").asText()).isEqualTo("<b>구내식당</b>이 있어요.<br>둘째 줄 <i>기울임</i>위험"
                + "<a class=\"text-link\" href=\"https://example.com\" target=\"_blank\" rel=\"noopener\">링크</a>빨강");
        // 사이트: 공개 API와 사본이 바로 같은 순서로(페이지 파일은 그대로 — 사이트가 데이터로 그림)
        JsonNode api = publicApi();
        assertThat(api.at("/items/0/question").asText()).isEqualTo("기숙사나 숙소가 있나요?");
        assertThat(api.at("/items/1/question").asText()).isEqualTo("점심은 어떻게 먹나요?");
        assertThat(api.at("/items/2/question").asText()).isEqualTo("비전공자도 지원할 수 있나요?");
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
        ArrayNode all = json.createArrayNode();
        m.get("items").forEach(it -> all.add(item(it)));
        save(session, "stale", all).andExpect(status().isBadRequest());

        // 페이지 편집 임시저장이 있어도 질문은 DB라 저장돼요
        String draft = Files.readString(CHECK, UTF_8).replace("</body>", "<!-- 임시 --></body>");
        mvc.perform(put("/admin/pages/api/draft").param("page", "check").session(session).with(csrf()).content(draft.getBytes(UTF_8)))
                .andExpect(status().isOk());
        assertThat(model(session).get("hasDraft").asBoolean()).isFalse();
        ((ObjectNode) all.get(0)).put("question", "임시저장이 있어도 저장");
        save(session, hash, all).andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(true));
        assertThat(publicApi().at("/items/0/question").asText()).isEqualTo("임시저장이 있어도 저장");
        mvc.perform(delete("/admin/pages/api/draft").param("page", "check").session(session).with(csrf())).andExpect(status().isOk());
    }

    @Test
    @Order(5)
    void editorUploadsGoToMediaAndMediaImagesCanBeUsedOnThePage() throws Exception {
        MockHttpSession session = login();
        // 편집 화면에서 올린 그림: 페이지 폴더에 저장 + 미디어 관리에도 남음
        String uploaded = json.readTree(mvc.perform(post("/admin/pages/api/upload").param("page", "check").param("name", "campus.png")
                        .session(session).with(csrf()).content(PNG)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8))
                .get("path").asText();
        assertThat(uploaded).startsWith("assets/uploads/").endsWith("-campus.png");
        JsonNode media = json.readTree(mvc.perform(get("/admin/pages/api/media").session(session)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(UTF_8));
        assertThat(media).hasSize(1);
        assertThat(media.at("/0/name").asText()).isEqualTo("campus.png");
        assertThat(media.at("/0/url").asText()).startsWith("/uploads/");
        // 같은 그림을 미디어 관리에서 고르면 이미 있는 파일을 그대로 씀
        mvc.perform(post("/admin/pages/api/media-import").param("page", "check").param("id", media.at("/0/id").asText()).session(session).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.path").value(uploaded));
        // 미디어 관리에만 올린 그림은 페이지 폴더로 복사
        byte[] other = java.util.Arrays.copyOf(PNG, PNG.length + 4);
        mvc.perform(multipart("/admin/images").file(new MockMultipartFile("file", "로고 사진.png", "image/png", other)).session(session).with(csrf()))
                .andExpect(status().isOk());
        JsonNode after = json.readTree(mvc.perform(get("/admin/pages/api/media").session(session)).andReturn().getResponse().getContentAsString(UTF_8));
        assertThat(after).hasSize(2);
        String id = after.at("/0/name").asText().equals("로고 사진.png") ? after.at("/0/id").asText() : after.at("/1/id").asText();
        String imported = json.readTree(mvc.perform(post("/admin/pages/api/media-import").param("page", "check").param("id", id).session(session).with(csrf()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8)).get("path").asText();
        assertThat(imported).startsWith("assets/uploads/").endsWith(".png").isNotEqualTo(uploaded);
        assertThat(Files.readAllBytes(CHECK.getParent().resolve(imported))).isEqualTo(other);
        // SVG 아이콘처럼 미디어 관리가 받지 않는 그림은 사이트에만
        mvc.perform(post("/admin/pages/api/upload").param("page", "check").param("name", "icon.svg").session(session).with(csrf())
                .content("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M4 4h16\"/></svg>".getBytes(UTF_8)))
                .andExpect(status().isOk());
        assertThat(json.readTree(mvc.perform(get("/admin/pages/api/media").session(session)).andReturn().getResponse().getContentAsString(UTF_8))).hasSize(2);
        // AVIF는 사이트에만(미디어 관리에 동영상으로 잘못 남지 않게)
        byte[] avif = {0, 0, 0, 0x1c, 'f', 't', 'y', 'p', 'a', 'v', 'i', 'f', 0, 0, 0, 0};
        mvc.perform(post("/admin/pages/api/upload").param("page", "check").param("name", "photo.avif").session(session).with(csrf()).content(avif))
                .andExpect(status().isOk());
        assertThat(json.readTree(mvc.perform(get("/admin/pages/api/media").session(session)).andReturn().getResponse().getContentAsString(UTF_8))).hasSize(2);
    }

    @Test
    @Order(6)
    void publishingThePageInTheEditorDoesNotUndoAFaqSave() throws Exception {
        MockHttpSession session = login();
        // 페이지 편집기가 check 페이지를 연 순간의 화면
        String base = json.readTree(mvc.perform(get("/admin/pages/api/state").param("page", "check").session(session))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8)).get("publishedHash").asText();
        String opened = Files.readString(CHECK, UTF_8);
        // 그사이 FAQ 관리에서 질문을 고쳐 저장(DB) — 페이지 파일은 그대로라 편집기 반영과 부딪치지 않음
        JsonNode m = model(session);
        ArrayNode items = json.createArrayNode();
        m.get("items").forEach(it -> items.add(item(it)));
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
    }
}
