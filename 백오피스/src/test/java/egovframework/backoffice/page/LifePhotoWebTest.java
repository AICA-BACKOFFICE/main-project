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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 콘텐츠 › 인사교 라이프 시설 사진 관리: 공간의 사진을 읽고, 새 사진을 올려 순서 · 설명 · 위치 · 표시를 바꿔 저장하면
 * 그 공간의 사진 부분만 바뀌고(나머지 글자 · 줄바꿈 · 문자 참조는 그대로) 반영 전 파일은 백업된다. 임시저장이 있거나 그사이 파일이 바뀌면 저장하지 않는다.
 */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:backoffice-life-photos-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "backoffice.upload-dir=${java.io.tmpdir}/aica-life-photos-test/uploads",
        "backoffice.pages.site-root=${java.io.tmpdir}/aica-life-photos-test/site",
        "backoffice.pages.data-dir=${java.io.tmpdir}/aica-life-photos-test/data",
        "backoffice.initial-admin.password=test-pass-1234"
})
@AutoConfigureMockMvc
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class LifePhotoWebTest {

    private static final Path ROOT = Paths.get(System.getProperty("java.io.tmpdir"), "aica-life-photos-test");
    private static final Path LIFE = ROOT.resolve("site/life/index.html");
    private static final String PAGE = String.join("\r\n",
            "<!doctype html>",
            "<html lang=\"ko\" data-menu=\"life\"><head><meta charset=\"utf-8\"><title>인사교 라이프</title></head>",
            "<body>",
            "<main id=\"main\" class=\"life-page\">",
            "<div class=\"page\" id=\"pg-facility\" data-page=\"facility\" hidden>",
            "      <div class=\"bx9\" data-g=\"23\">",
            "        <div class=\"bx9-main\">",
            "          <section class=\"bx9-g\" data-g=\"23\" aria-label=\"2·3F 교육장\">",
            "            <div class=\"bx9-head\"><span class=\"bx9-fb\">2·3F</span><h3>교육장</h3>",
            "              <div class=\"bx9-tabs\" role=\"tablist\">",
            "                <button type=\"button\" role=\"tab\" class=\"bx9-t\" id=\"bx9t-23-0\" aria-controls=\"bx9s-23-0\" aria-selected=\"true\"><span class=\"bx9-tt im-classroom\" aria-hidden=\"true\"></span><b>강의실</b></button>",
            "              </div>",
            "            </div>",
            "            <div class=\"bx9-s\" id=\"bx9s-23-0\" role=\"tabpanel\" aria-labelledby=\"bx9t-23-0\">",
            "              <div class=\"bx9-ph\" tabindex=\"0\" aria-roledescription=\"사진 넘김\" aria-label=\"강의실 사진 2장\">",
            "                <div class=\"bx9-tr\">",
            "                  <div class=\"bx9-sl im-classroom\" role=\"img\" aria-label=\"강의실 전경\"></div>",
            "                  <div class=\"bx9-sl im-b_class\" style=\"--bs:240%;--bp:28% 72%;\" role=\"img\" aria-label=\"노트북 자리\"></div>",
            "                </div>",
            "                <span class=\"bx-ex\">사진 예시</span>",
            "                <button type=\"button\" class=\"bx9-a prev\" aria-label=\"이전 사진\">‹</button>",
            "                <button type=\"button\" class=\"bx9-a next\" aria-label=\"다음 사진\">›</button>",
            "                <p class=\"bx9-cap\"><span>강의실 전경</span><span class=\"bx9-n\"><b>1</b> / 2</span></p>",
            "              </div>",
            "              <div class=\"bx9-foot\">",
            "                <div class=\"bx9-info\"><h4>강의실</h4><ul><li>평일 &middot; 9시</li></ul></div>",
            "                <div class=\"bx9-th\" role=\"group\" aria-label=\"강의실 사진 고르기\">",
            "                  <button type=\"button\" class=\"bx9-tb im-classroom\" aria-label=\"강의실 전경 보기\" aria-current=\"true\"></button>",
            "                  <button type=\"button\" class=\"bx9-tb im-b_class\" style=\"--bs:240%;--bp:28% 72%;\" aria-label=\"노트북 자리 보기\"></button>",
            "                </div>",
            "              </div>",
            "            </div>",
            "          </section>",
            "          <section class=\"bx9-g\" data-g=\"8\" hidden aria-label=\"8F 구내식당\">",
            "            <div class=\"bx9-head\"><span class=\"bx9-fb\">8F</span><h3>구내식당</h3>",
            "            </div>",
            "            <div class=\"bx9-s\" id=\"bx9s-8-0\">",
            "              <div class=\"bx9-ph\" tabindex=\"0\" aria-roledescription=\"사진 넘김\" aria-label=\"구내식당 사진 1장\">",
            "                <div class=\"bx9-tr\">",
            "                  <div class=\"bx9-sl im-classroom\" role=\"img\" aria-label=\"구내식당 전경\"></div>",
            "                </div>",
            "                <p class=\"bx9-cap\"><span>구내식당 전경</span><span class=\"bx9-n\"><b>1</b> / 1</span></p>",
            "              </div>",
            "              <div class=\"bx9-foot\">",
            "                <div class=\"bx9-info\"><h4>구내식당</h4></div>",
            "                <div class=\"bx9-th\" role=\"group\" aria-label=\"구내식당 사진 고르기\">",
            "                  <button type=\"button\" class=\"bx9-tb im-classroom\" aria-label=\"구내식당 전경 보기\" aria-current=\"true\"></button>",
            "                </div>",
            "              </div>",
            "            </div>",
            "          </section>",
            "        </div>",
            "      </div>",
            "</div>",
            "<section class=\"sec tp-sec\" id=\"tp-food\">",
            "        <div class=\"fdk\" role=\"tablist\">",
            "          <button type=\"button\" class=\"fdk-b\" role=\"tab\" id=\"fdk-food\" aria-selected=\"true\" data-fk=\"food\">식당<span>2</span></button>",
            "          <button type=\"button\" class=\"fdk-b\" role=\"tab\" id=\"fdk-cafe\" aria-selected=\"false\" tabindex=\"-1\" data-fk=\"cafe\">카페<span>1</span></button>",
            "        </div>",
            "        <ul class=\"fdg\" id=\"fdList\" aria-labelledby=\"fdk-food\">",
            "          <li class=\"fdc\" data-t=\"food\" data-g=\"solo\" data-w=\"4\">",
            "            <div class=\"fdc-ph\" role=\"img\" aria-label=\"국밥집 사진 자리(사진 준비 중)\" data-field=\"photo\">",
            "              <span class=\"fdc-cat\" data-field=\"category\">한식</span><span class=\"fdc-wk\" data-field=\"walk\">도보 약 4분</span>",
            "              <span class=\"fdc-pht\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 8h3l1.6-2h6.8L17 8h3v11H4z\"></path><circle cx=\"12\" cy=\"13.5\" r=\"3.4\"></circle></svg>사진 준비 중</span>",
            "            </div>",
            "            <div class=\"fdc-b\">",
            "              <p class=\"fdc-g solo\">혼밥하기 편해요</p>",
            "              <h3 data-field=\"name\">국밥집</h3>",
            "              <p class=\"fdc-m\" data-field=\"menu\">국밥&nbsp;· 동명동</p>",
            "            </div>",
            "            <figure class=\"fdc-r\">",
            "              <figcaption><b>선배 후기</b><span class=\"bdg ex\">예시</span></figcaption>",
            "              <blockquote data-field=\"review\">혼자 가기 편했어요.</blockquote>",
            "            </figure>",
            "          </li>",
            "          <li class=\"fdc\" data-t=\"food\" data-g=\"group\" data-w=\"7\">",
            "            <div class=\"fdc-ph\" role=\"img\" aria-label=\"고깃집 사진 자리(사진 준비 중)\" data-field=\"photo\">",
            "              <span class=\"fdc-cat\" data-field=\"category\">고기</span><span class=\"fdc-wk\" data-field=\"walk\">도보 약 7분</span>",
            "              <span class=\"fdc-pht\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 8h3l1.6-2h6.8L17 8h3v11H4z\"></path><circle cx=\"12\" cy=\"13.5\" r=\"3.4\"></circle></svg>사진 준비 중</span>",
            "            </div>",
            "            <div class=\"fdc-b\">",
            "              <p class=\"fdc-g group\">여럿이 가기 좋아요</p>",
            "              <h3 data-field=\"name\">고깃집</h3>",
            "              <p class=\"fdc-m\" data-field=\"menu\">삼겹살&nbsp;· 동명동</p>",
            "            </div>",
            "            <figure class=\"fdc-r\">",
            "              <figcaption><b>선배 후기</b><span class=\"bdg ex\">예시</span></figcaption>",
            "              <blockquote data-field=\"review\">팀끼리 갔어요.</blockquote>",
            "            </figure>",
            "          </li>",
            "          <li class=\"fdc\" data-t=\"cafe\" data-g=\"solo\" data-w=\"10\" hidden>",
            "            <div class=\"fdc-ph\" role=\"img\" aria-label=\"카페 하나 사진 자리(사진 준비 중)\" data-field=\"photo\">",
            "              <span class=\"fdc-cat\" data-field=\"category\">카페</span><span class=\"fdc-wk\" data-field=\"walk\">도보 약 10분</span>",
            "              <span class=\"fdc-pht\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 8h3l1.6-2h6.8L17 8h3v11H4z\"></path><circle cx=\"12\" cy=\"13.5\" r=\"3.4\"></circle></svg>사진 준비 중</span>",
            "            </div>",
            "            <div class=\"fdc-b\">",
            "              <p class=\"fdc-g solo\">혼자 가기 편해요</p>",
            "              <h3 data-field=\"name\">카페 하나</h3>",
            "              <p class=\"fdc-m\" data-field=\"menu\">커피&nbsp;· 동명동</p>",
            "            </div>",
            "            <figure class=\"fdc-r\">",
            "              <figcaption><b>선배 후기</b><span class=\"bdg ex\">예시</span></figcaption>",
            "              <blockquote data-field=\"review\">조용해요.</blockquote>",
            "            </figure>",
            "          </li>",
            "        </ul>",
            "</section>",
            "<section class=\"sec alt tp-sec\" id=\"tp-fun\">",
            "        <div class=\"fs\">",
            "        <section class=\"fsg\" data-k=\"walk\" aria-labelledby=\"fs-walk-t\">",
            "          <div class=\"fsh\">",
            "            <span class=\"fsn\" aria-hidden=\"true\">01</span>",
            "            <div><h3 id=\"fs-walk-t\">근처 산책길</h3><p>수업 끝나고 걷기 좋은 길 안팎</p></div>",
            "            <button type=\"button\" class=\"fs-tg\" aria-expanded=\"false\" aria-controls=\"fs-walk\"><span class=\"o\">2곳 펼쳐 보기</span><span class=\"c\">접기</span></button>",
            "          </div>",
            "          <div class=\"fsd\" id=\"fs-walk\">",
            "            <ol class=\"fsl\">",
            "              <li class=\"fsc\" style=\"--i:0;--rt:-5deg;--z:2\">",
            "                <span class=\"fsc-ph im-classroom\" role=\"img\" aria-label=\"푸른길 공원\" data-field=\"photo\"></span>",
            "                <span class=\"fsc-b\"><b data-field=\"name\">푸른길 공원</b><small data-field=\"distance\">동쪽 · 약 1km</small><span class=\"fsc-t\" data-field=\"fee\">무료</span><span class=\"fsc-d\" data-field=\"summary\">산책로예요.</span></span>",
            "              </li>",
            "              <li class=\"fsc\" style=\"--i:1;--rt:3deg;--z:1\">",
            "                <span class=\"fsc-ph im-b_class\" role=\"img\" aria-label=\"광주천 산책로\" data-field=\"photo\"></span>",
            "                <span class=\"fsc-b\"><b data-field=\"name\">광주천 산책로</b><small data-field=\"distance\">남쪽 · 약 1km</small><span class=\"fsc-t\" data-field=\"fee\">무료</span><span class=\"fsc-d\" data-field=\"summary\">하천 길이에요.</span></span>",
            "              </li>",
            "            </ol>",
            "            <div class=\"fs-side\" aria-hidden=\"true\"><ul class=\"fs-names\"><li>푸른길 공원</li><li>광주천 산책로</li></ul><span class=\"fs-hint\">눌러서 펼치기</span></div>",
            "          </div>",
            "        </section>",
            "        </div>",
            "</section>",
            "</main>",
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
            Files.createDirectories(LIFE.getParent().resolve("css"));
            Files.writeString(LIFE, PAGE, UTF_8);
            Files.writeString(LIFE.getParent().resolve("css/life.css"),
                    ".life-page .im-classroom{background-image:url(../assets/classroom.webp)}\n.life-page .im-b_class{background-image:url(../assets/b_class.webp)}\n", UTF_8);
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
        return json.readTree(mvc.perform(get("/admin/pages/life-photos/api").session(session)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(UTF_8));
    }

    private org.springframework.test.web.servlet.ResultActions save(MockHttpSession session, String hash, String photos, String badge) throws Exception {
        String body = "{\"baseHash\":\"" + hash + "\",\"spaces\":[{\"id\":\"bx9s-23-0\",\"badge\":\"" + badge + "\",\"photos\":" + photos + "}]}";
        return mvc.perform(post("/admin/pages/life-photos/api").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    @Order(1)
    void readsFloorsSpacesAndPhotos() throws Exception {
        MockHttpSession session = login();
        mvc.perform(get("/admin/pages/life-photos").session(session)).andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("인사교 라이프 게시물 관리")));
        // 왼쪽 메뉴 세부 카테고리로 열면 그 탭이 선택되고, 모르는 값이면 시설 사진
        String food = mvc.perform(get("/admin/pages/life-photos").param("section", "food").session(session)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(UTF_8);
        assertThat(food).contains("data-section=\"food\"").contains("class=\"lnb-tree open\"")
                .containsPattern("<a[^>]*class=\"on\"[^>]*>오늘 점심, 여기 어때요\\?</a>");
        assertThat(mvc.perform(get("/admin/pages/life-photos").param("section", "x").session(session))
                .andReturn().getResponse().getContentAsString(UTF_8)).contains("data-section=\"fac\"");
        JsonNode m = model(session);
        JsonNode space = m.at("/floors/0/spaces/0");
        assertThat(m.at("/defaultFloor").asText()).isEqualTo("23");
        assertThat(space.get("name").asText()).isEqualTo("강의실");
        assertThat(space.get("badge").asText()).isEqualTo("ex");
        assertThat(space.get("photos")).hasSize(2);
        assertThat(space.at("/photos/1/cls").asText()).isEqualTo("im-b_class");
        assertThat(space.at("/photos/1/bs").asText()).isEqualTo("240%");
        assertThat(space.at("/photos/1/bp").asText()).isEqualTo("28% 72%");
        assertThat(space.at("/photos/0/url").asText()).isEqualTo("/admin/pages/site/life/assets/classroom.webp");
        // 공간이 하나뿐이라 탭이 없는 층: 이름은 안내 카드 제목
        assertThat(m.at("/floors/1/spaces/0/name").asText()).isEqualTo("구내식당");
        assertThat(m.at("/floors/1/spaces/0/photos")).hasSize(1);
    }

    @Test
    @Order(2)
    void newPhotoOrderCaptionAndBadgeAreSavedOnlyInThatSpace() throws Exception {
        MockHttpSession session = login();
        String hash = model(session).get("hash").asText();
        String path = json.readTree(mvc.perform(post("/admin/pages/api/upload").param("page", "life").param("name", "facility-bx9s-23-0.png")
                        .session(session).with(csrf()).content(PNG)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(UTF_8)).get("path").asText();
        assertThat(path).startsWith("assets/uploads/").contains("facility-bx9s-23-0").endsWith(".png");

        // 확인: 설명 없음 · 없는 파일 · 사진 0장은 저장하지 않음
        save(session, hash, "[{\"cls\":\"im-classroom\",\"caption\":\" \"}]", "").andExpect(status().isBadRequest());
        save(session, hash, "[{\"src\":\"assets/uploads/none.webp\",\"caption\":\"x\"}]", "").andExpect(status().isBadRequest());
        save(session, hash, "[]", "").andExpect(status().isBadRequest());
        save(session, hash, "[{\"cls\":\"im-nope\",\"caption\":\"x\"}]", "").andExpect(status().isBadRequest());

        save(session, hash, "[{\"src\":\"" + path + "\",\"bp\":\"40% 60%\",\"caption\":\"새 강의실 <사진>\"},"
                + "{\"cls\":\"im-b_class\",\"bs\":\"240%\",\"bp\":\"28% 72%\",\"caption\":\"노트북 자리\"},"
                + "{\"cls\":\"im-classroom\",\"caption\":\"강의실 전경\"}]", "")
                .andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(true));

        String out = Files.readString(LIFE, UTF_8);
        String slide = "<div class=\"bx9-sl\" style=\"background-image:url(" + path + ");--bp:40% 60%;\" role=\"img\" aria-label=\"새 강의실 &lt;사진&gt;\"></div>";
        assertThat(out).contains("                <div class=\"bx9-tr\">\r\n                  " + slide + "\r\n"
                + "                  <div class=\"bx9-sl im-b_class\" style=\"--bs:240%;--bp:28% 72%;\" role=\"img\" aria-label=\"노트북 자리\"></div>\r\n"
                + "                  <div class=\"bx9-sl im-classroom\" role=\"img\" aria-label=\"강의실 전경\"></div>\r\n"
                + "                </div>\r\n                <button type=\"button\" class=\"bx9-a prev\"");
        assertThat(out).doesNotContain("bx-ex");
        assertThat(out).contains("<p class=\"bx9-cap\"><span>새 강의실 &lt;사진&gt;</span><span class=\"bx9-n\"><b>1</b> / 3</span></p>");
        assertThat(out).contains("aria-label=\"강의실 사진 3장\"");
        assertThat(out).contains("<button type=\"button\" class=\"bx9-tb\" style=\"background-image:url(" + path + ");--bp:40% 60%;\" aria-label=\"새 강의실 &lt;사진&gt; 보기\" aria-current=\"true\"></button>");
        assertThat(out).contains("<span class=\"bx9-tt\" aria-hidden=\"true\" style=\"background-image:url(" + path + ");--bp:40% 60%;\"></span><b>강의실</b>");
        assertThat(out.split("bx9-tb", -1)).hasSize(5);   // 작은 사진: 강의실 3 + 구내식당 1
        // 다른 곳은 그대로: 문자 참조 · 줄바꿈(CRLF)
        assertThat(out).contains("<li>평일 &middot; 9시</li>");
        assertThat(out.replace("\r\n", "")).doesNotContain("\n");
        // 반영 전 파일은 버전 기록(백업)으로
        mvc.perform(get("/admin/pages/api/backups").param("page", "life").session(session))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));

        // 표시를 다시 '임시 사진'으로: 사진 넘김 바로 뒤 한 줄
        String hash2 = model(session).get("hash").asText();
        save(session, hash2, "[{\"cls\":\"im-classroom\",\"caption\":\"강의실 전경\"}]", "tmp").andExpect(status().isOk());
        String out2 = Files.readString(LIFE, UTF_8);
        assertThat(out2).contains("                </div>\r\n                <span class=\"bx-ex tmp\">임시 사진</span>\r\n                <button type=\"button\" class=\"bx9-a prev\"");
        assertThat(out2).contains("aria-label=\"강의실 사진 1장\"").contains("<span class=\"bx9-tt im-classroom\" aria-hidden=\"true\"></span>");

        // 탭 없는 공간도 저장(아이콘은 없으니 그대로)
        String hash3 = model(session).get("hash").asText();
        String body8 = "{\"baseHash\":\"" + hash3 + "\",\"spaces\":[{\"id\":\"bx9s-8-0\",\"badge\":\"tmp\",\"photos\":[{\"cls\":\"im-classroom\",\"caption\":\"구내식당 전경\"},{\"src\":\"" + path + "\",\"caption\":\"배식대\"}]}]}";
        mvc.perform(post("/admin/pages/life-photos/api").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body8))
                .andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(true));
        assertThat(Files.readString(LIFE, UTF_8)).contains("aria-label=\"구내식당 사진 2장\"").contains("<span class=\"bx-ex tmp\">임시 사진</span>");

        // 그사이 파일이 바뀌었으면(옛 hash) 저장하지 않음
        save(session, hash, "[{\"cls\":\"im-classroom\",\"caption\":\"강의실\"}]", "").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("새로 고친")));
    }

    @Test
    @Order(3)
    void pageEditorDraftBlocksSaving() throws Exception {
        MockHttpSession session = login();
        String hash = model(session).get("hash").asText();
        String draft = Files.readString(LIFE, UTF_8).replace("<h4>강의실</h4>", "<h4>강의실(고침)</h4>");
        mvc.perform(put("/admin/pages/api/draft").param("page", "life").session(session).with(csrf()).content(draft.getBytes(UTF_8)))
                .andExpect(status().isOk());
        save(session, hash, "[{\"cls\":\"im-b_class\",\"caption\":\"노트북 자리\"}]", "").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("임시저장")));
        assertThat(model(session).get("hasDraft").asBoolean()).isTrue();
        mvc.perform(delete("/admin/pages/api/draft").param("page", "life").session(session).with(csrf())).andExpect(status().isOk());
        save(session, hash, "[{\"cls\":\"im-b_class\",\"caption\":\"노트북 자리\"}]", "").andExpect(status().isOk());
    }
    @Test
    @Order(4)
    void lunchAndOutingCardsCanBeAddedEditedReorderedAndDeleted() throws Exception {
        MockHttpSession session = login();
        JsonNode m = model(session);
        assertThat(m.get("food")).hasSize(3);
        assertThat(m.at("/food/0/menu").asText()).isEqualTo("국밥 · 동명동");
        assertThat(m.at("/food/0/example").asBoolean()).isTrue();
        assertThat(m.at("/fun/0/k").asText()).isEqualTo("walk");
        assertThat(m.at("/fun/0/cards/1/cls").asText()).isEqualTo("im-b_class");
        String hash = m.get("hash").asText();
        String path = json.readTree(mvc.perform(post("/admin/pages/api/upload").param("page", "life").param("name", "food.png")
                        .session(session).with(csrf()).content(PNG)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(UTF_8)).get("path").asText();
        // 고깃집 지움 · 국밥집 후기 고침('예시' 빠짐) · 새 카페(사진 있음) · 새 식당(후기 없음)
        String food = "[{\"t\":\"cafe\",\"g\":\"group\",\"w\":3,\"category\":\"카페\",\"name\":\"새 카페 & 빵\",\"menu\":\"라떼 · 소금빵 ·충장동\",\"review\":\"\",\"example\":false,\"src\":\"@PATH@\"},{\"t\":\"food\",\"g\":\"solo\",\"w\":4,\"category\":\"한식\",\"name\":\"국밥집\",\"menu\":\"국밥 · 동명동\",\"review\":\"진짜 후기예요.\",\"example\":true,\"src\":\"\"},{\"t\":\"cafe\",\"g\":\"solo\",\"w\":10,\"category\":\"카페\",\"name\":\"카페 하나\",\"menu\":\"커피 · 동명동\",\"review\":\"조용해요.\",\"example\":true,\"src\":\"\"},{\"t\":\"food\",\"g\":\"group\",\"w\":12,\"category\":\"중식\",\"name\":\"새 중국집\",\"menu\":\"짜장면\",\"review\":\"\",\"example\":false,\"src\":\"\"}]".replace("@PATH@", path);
        // 문화 · 여가: 순서 바꾸고 새 장소(올린 사진) 더함
        String fun = "[{\"k\":\"walk\",\"cards\":[{\"name\":\"광주천 산책로\",\"distance\":\"남쪽 · 약 1km\",\"fee\":\"무료\",\"summary\":\"하천 길이에요.\",\"cls\":\"im-b_class\",\"src\":\"\"},{\"name\":\"푸른길 공원\",\"distance\":\"동쪽 · 약 1km\",\"fee\":\"무료\",\"summary\":\"산책로예요.\",\"cls\":\"im-classroom\",\"src\":\"\"},{\"name\":\"새 <공원>\",\"distance\":\"북쪽 · 약 2km\",\"fee\":\"무료\",\"summary\":\"새로 생겼어요.\",\"cls\":\"\",\"src\":\"@PATH@\"}]}]".replace("@PATH@", path);

        // 확인: 이름 없음 · 사진 없는 문화 카드 · 카페 0곳은 저장 안 함
        tips(session, hash, food.replace("\"name\":\"새 중국집\"", "\"name\":\" \""), null).andExpect(status().isBadRequest());
        tips(session, hash, null, fun.replace("\"src\":\"" + path + "\"", "\"src\":\"\"")).andExpect(status().isBadRequest());
        tips(session, hash, "[{\"t\":\"food\",\"g\":\"solo\",\"w\":4,\"category\":\"한식\",\"name\":\"국밥집\",\"menu\":\"국밥\",\"review\":\"\",\"example\":false,\"src\":\"\"}]", null).andExpect(status().isBadRequest());

        tips(session, hash, food, fun).andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(true));
        String out = Files.readString(LIFE, UTF_8);
        assertThat(out).contains("id=\"fdk-food\" aria-selected=\"true\" data-fk=\"food\">식당<span>2</span>").contains("data-fk=\"cafe\">카페<span>2</span>");
        assertThat(out).doesNotContain("고깃집");
        // 식당이 먼저, 카페는 처음에 숨김
        assertThat(out.indexOf("새 중국집")).isLessThan(out.indexOf("새 카페 &amp; 빵"));
        assertThat(out).contains("<li class=\"fdc\" data-t=\"cafe\" data-g=\"group\" data-w=\"3\" hidden>");
        assertThat(out).contains("<div class=\"fdc-ph\" role=\"img\" aria-label=\"새 카페 &amp; 빵 사진\" data-field=\"photo\" style=\"background-image:url(" + path + ");background-size:cover;background-position:center\">");
        assertThat(out).contains("<p class=\"fdc-m\" data-field=\"menu\">라떼&nbsp;· 소금빵&nbsp;· 충장동</p>");
        assertThat(out).contains("<p class=\"fdc-g group\">여럿이 가기 좋아요</p>\r\n              <h3 data-field=\"name\">새 카페 &amp; 빵</h3>");
        // 고친 후기는 '예시' 표시 없음, 그대로인 후기는 그대로
        assertThat(out).contains("<figcaption><b>선배 후기</b></figcaption>\r\n              <blockquote data-field=\"review\">진짜 후기예요.</blockquote>");
        assertThat(out).contains("<figcaption><b>선배 후기</b><span class=\"bdg ex\">예시</span></figcaption>\r\n              <blockquote data-field=\"review\">조용해요.</blockquote>");
        // 후기 없는 카드는 후기 칸 없이
        assertThat(out.substring(out.indexOf("새 중국집"), out.indexOf("</li>", out.indexOf("새 중국집")))).doesNotContain("fdc-r");
        // 문화 · 여가: 순서 · 회전 · 쌓임 · 펼쳐 보기 수 · 오른쪽 이름
        assertThat(out).contains("<li class=\"fsc\" style=\"--i:0;--rt:-5deg;--z:3\">\r\n                <span class=\"fsc-ph im-b_class\" role=\"img\" aria-label=\"광주천 산책로\" data-field=\"photo\"></span>");
        assertThat(out).contains("<li class=\"fsc\" style=\"--i:2;--rt:-2deg;--z:1\">\r\n                <span class=\"fsc-ph\" style=\"background-image:url(" + path + ")\" role=\"img\" aria-label=\"새 &lt;공원&gt;\" data-field=\"photo\"></span>");
        assertThat(out).contains("<span class=\"o\">3곳 펼쳐 보기</span>");
        assertThat(out).contains("<ul class=\"fs-names\"><li>광주천 산책로</li><li>푸른길 공원</li><li>새 &lt;공원&gt;</li></ul>");
        assertThat(out.replace("\r\n", "")).doesNotContain("\n");

        // 다시 읽으면 같은 내용 · 그대로 저장하면 바뀌는 것 없음
        JsonNode again = model(session);
        assertThat(again.get("food")).hasSize(4);
        assertThat(again.at("/food/2/name").asText()).isEqualTo("새 카페 & 빵");
        assertThat(again.at("/fun/0/cards/2/src").asText()).isEqualTo(path);
        tips(session, again.get("hash").asText(), food.replace("\"example\":true,\"src\":\"\"},{\"t\":\"cafe\",\"g\":\"solo\"", "\"example\":false,\"src\":\"\"},{\"t\":\"cafe\",\"g\":\"solo\""), fun)
                .andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(false));
    }

    private org.springframework.test.web.servlet.ResultActions tips(MockHttpSession session, String hash, String food, String fun) throws Exception {
        String body = "{\"baseHash\":\"" + hash + "\",\"spaces\":[]" + (food == null ? "" : ",\"food\":" + food) + (fun == null ? "" : ",\"fun\":" + fun) + "}";
        return mvc.perform(post("/admin/pages/life-photos/api").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body));
    }
}
