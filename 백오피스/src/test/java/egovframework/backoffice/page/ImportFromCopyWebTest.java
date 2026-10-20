package egovframework.backoffice.page;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import egovframework.backoffice.BackofficeApplication;
import egovframework.testsupport.CmsMockMvcConfig;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Comparator;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 새 컴퓨터에서 처음 켤 때(DB가 비어 있고, 카드 · 질문은 이미 페이지 HTML에서 빠져 사본에만 있을 때):
 * 생활 꿀팁 카드와 자주 묻는 질문을 사본(life/js/life-data.js · check/js/faq-data.js)에서 DB로 옮겨, 사이트가 비어 보이지 않는다.
 */
@TestPropertySource(properties = {
        "datasource.url=jdbc:h2:mem:backoffice-import-copy-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "backoffice.upload-dir=${java.io.tmpdir}/aica-import-copy-test/uploads",
        "backoffice.pages.site-root=${java.io.tmpdir}/aica-import-copy-test/site",
        "backoffice.pages.data-dir=${java.io.tmpdir}/aica-import-copy-test/data",
        "backoffice.initial-admin.password=test-pass-1234"
})
@SpringJUnitWebConfig({BackofficeApplication.class, CmsMockMvcConfig.class})
class ImportFromCopyWebTest {

    private static final Path ROOT = Paths.get(System.getProperty("java.io.tmpdir"), "aica-import-copy-test");
    private static final Path SITE = ROOT.resolve("site");
    /** 질문 목록을 뺀 지원 전 체크 페이지(사이트가 공개 API로 그림) */
    private static final String CHECK = String.join("\r\n",
            "<!doctype html>",
            "<html lang=\"ko\"><head><meta charset=\"utf-8\"><title>지원 전 체크</title></head><body>",
            "  <div class=\"faq-tabs\"><button type=\"button\" class=\"faq-tab\" data-cat=\"all\">전체<em class=\"faq-cnt\"></em></button>"
                    + "<button type=\"button\" class=\"faq-tab\" data-cat=\"준비사항\">준비사항<em class=\"faq-cnt\"></em></button>"
                    + "<button type=\"button\" class=\"faq-tab\" data-cat=\"생활\">생활<em class=\"faq-cnt\"></em></button></div>",
            "  <ul class=\"faq-list\" id=\"faqList\"></ul>",
            "</body></html>", "");
    private static final String FAQ_COPY = "/* 사본 */\nwindow.FAQ_DATA = {\n  \"version\" : 1,\n  \"source\" : \"backoffice\",\n  \"items\" : [ "
            + "{ \"cat\" : \"준비사항\", \"question\" : \"비전공자도 지원할 수 있나요?\", \"answer\" : \"네, <b>전공</b>은 상관없어요.\" }, "
            + "{ \"cat\" : \"생활\", \"question\" : \"기숙사가 있나요?\", \"answer\" : \"없어요.<br>통학해요.\" } ]\n};\n";
    /** 카드를 뺀 인사교 라이프 페이지 */
    private static final String LIFE = String.join("\r\n",
            "<!doctype html>",
            "<html lang=\"ko\"><head><meta charset=\"utf-8\"><title>인사교 라이프</title></head><body>",
            "  <div id=\"tp-food\"><ul class=\"fdl\" id=\"fdList\"></ul></div>",
            "  <div id=\"tp-fun\"><div class=\"fsg\" data-k=\"walk\"><div class=\"fsh\"><h3>근처 산책길</h3><p></p></div><ol class=\"fsl\"></ol></div></div>",
            "</body></html>", "");
    private static final String LIFE_COPY = "/* 사본 */\nwindow.LIFE_DATA = {\n  \"version\" : 1,\n  \"source\" : \"backoffice\",\n  \"food\" : [ "
            + "{ \"t\" : \"food\", \"g\" : \"solo\", \"w\" : 5, \"category\" : \"한식\", \"name\" : \"국밥집\", \"menu\" : \"국밥 · 정문 앞\", \"review\" : \"든든해요\", \"example\" : true, \"src\" : \"\" }, "
            + "{ \"t\" : \"cafe\", \"g\" : \"group\", \"w\" : 3, \"category\" : \"카페\", \"name\" : \"골목카페\", \"menu\" : \"라떼\", \"review\" : null, \"example\" : false, \"src\" : \"\" } ],\n"
            + "  \"fun\" : { \"walk\" : [ { \"name\" : \"푸른길\", \"distance\" : \"동쪽 · 약 1km\", \"fee\" : \"무료\", \"summary\" : \"걷기 좋아요\", \"cls\" : \"im-walk\", \"src\" : \"\" } ], \"near\" : [ ], \"far\" : [ ] }\n};\n";

    static {
        try {
            if (Files.exists(ROOT)) {
                try (Stream<Path> walk = Files.walk(ROOT)) {
                    walk.sorted(Comparator.reverseOrder()).forEach(path -> path.toFile().delete());
                }
            }
            write("check/index.html", CHECK);
            write("check/js/faq-data.js", FAQ_COPY);
            write("life/index.html", LIFE);
            write("life/js/life-data.js", LIFE_COPY);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void write(String relative, String content) throws IOException {
        Path file = SITE.resolve(relative);
        Files.createDirectories(file.getParent());
        Files.writeString(file, content, UTF_8);
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired CheckFaqService faq;
    @Autowired LifeTipService life;

    private JsonNode api(String path) throws Exception {
        return json.readTree(mvc.perform(get(path)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8));
    }

    private JsonNode copy(String relative) throws IOException {
        String js = Files.readString(SITE.resolve(relative), UTF_8);
        return json.readTree(js.substring(js.indexOf('{'), js.lastIndexOf('}') + 1));
    }

    @Test
    void questionsAndCardsComeBackFromTheCopiesWhenTheDatabaseAndPagesAreEmpty() throws Exception {
        JsonNode questions = api("/api/public/faq");
        assertThat(questions.get("items")).hasSize(2);
        assertThat(questions.at("/items/0/cat").asText()).isEqualTo("준비사항");
        assertThat(questions.at("/items/0/question").asText()).isEqualTo("비전공자도 지원할 수 있나요?");
        // 답은 사본 글자 그대로
        assertThat(questions.at("/items/0/answer").asText()).isEqualTo("네, <b>전공</b>은 상관없어요.");
        assertThat(questions.at("/items/1/answer").asText()).isEqualTo("없어요.<br>통학해요.");
        // 사본은 DB 내용으로 다시 써도 같은 질문(비어 버리지 않음)
        assertThat(copy("check/js/faq-data.js").get("items")).isEqualTo(questions.get("items"));

        JsonNode cards = api("/api/public/life");
        assertThat(cards.get("food")).hasSize(2);
        assertThat(cards.at("/food/0/name").asText()).isEqualTo("국밥집");
        assertThat(cards.at("/food/0/w").asInt()).isEqualTo(5);
        assertThat(cards.at("/food/0/example").asBoolean()).isTrue();
        assertThat(cards.at("/food/1/t").asText()).isEqualTo("cafe");
        assertThat(cards.at("/fun/walk")).hasSize(1);
        assertThat(cards.at("/fun/walk/0/cls").asText()).isEqualTo("im-walk");
        assertThat(cards.at("/fun/near")).isEmpty();
        assertThat(copy("life/js/life-data.js").get("food")).isEqualTo(cards.get("food"));

        // 한 번 옮긴 뒤에는 다시 켜도 또 넣지 않음
        assertThat(faq.importFromCopy()).isZero();
        assertThat(life.importFromCopy()).isZero();
        assertThat(api("/api/public/faq").get("items")).hasSize(2);
    }
}
