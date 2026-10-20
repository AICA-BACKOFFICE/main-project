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
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import egovframework.backoffice.BackofficeApplication;
import egovframework.testsupport.CmsMockMvcConfig;
import org.springframework.test.context.TestPropertySource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 게시물 관리 › 인사교 라이프 게시물 관리. 시설 사진 · 오늘 점심 · 바람 쐬러 가요 카드 모두 처음 켤 때 페이지에서 DB로 옮기고,
 * 저장하면 DB · 공개 API · 사본이 바뀐다(페이지 파일은 그대로, 페이지 편집 임시저장과도 상관없음). 그사이 내용이 바뀌었으면 저장하지 않는다.
 * 목록에서 뺀 카드는 휴지통(휴지통 › 인사교 라이프 카드)으로 가서 꺼내거나 완전 삭제할 수 있고,
 * 바꿀 때마다 바로 전 모습이 버전 기록에 남아 그 모습으로 되돌릴 수 있다.
 */
@TestPropertySource(properties = {
        "datasource.url=jdbc:h2:mem:backoffice-life-photos-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "backoffice.upload-dir=${java.io.tmpdir}/aica-life-photos-test/uploads",
        "backoffice.pages.site-root=${java.io.tmpdir}/aica-life-photos-test/site",
        "backoffice.pages.data-dir=${java.io.tmpdir}/aica-life-photos-test/data",
        "backoffice.initial-admin.password=test-pass-1234"
})
@SpringJUnitWebConfig({BackofficeApplication.class, CmsMockMvcConfig.class})
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
            "              <span class=\"fdc-cat\" data-field=\"category\">한식</span>",
            "              <span class=\"fdc-pht\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 8h3l1.6-2h6.8L17 8h3v11H4z\"></path><circle cx=\"12\" cy=\"13.5\" r=\"3.4\"></circle></svg>사진 준비 중</span>",
            "            </div>",
            "            <div class=\"fdc-b\">",
            "              <div class=\"fdc-gw\"><p class=\"fdc-g solo\">혼밥하기 편해요</p><span class=\"fdc-wk\" data-field=\"walk\">도보 약 4분</span></div>",
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
            "              <span class=\"fdc-cat\" data-field=\"category\">고기</span>",
            "              <span class=\"fdc-pht\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 8h3l1.6-2h6.8L17 8h3v11H4z\"></path><circle cx=\"12\" cy=\"13.5\" r=\"3.4\"></circle></svg>사진 준비 중</span>",
            "            </div>",
            "            <div class=\"fdc-b\">",
            "              <div class=\"fdc-gw\"><p class=\"fdc-g group\">여럿이 가기 좋아요</p><span class=\"fdc-wk\" data-field=\"walk\">도보 약 7분</span></div>",
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
            "              <span class=\"fdc-cat\" data-field=\"category\">카페</span>",
            "              <span class=\"fdc-pht\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 8h3l1.6-2h6.8L17 8h3v11H4z\"></path><circle cx=\"12\" cy=\"13.5\" r=\"3.4\"></circle></svg>사진 준비 중</span>",
            "            </div>",
            "            <div class=\"fdc-b\">",
            "              <div class=\"fdc-gw\"><p class=\"fdc-g solo\">혼자 가기 편해요</p><span class=\"fdc-wk\" data-field=\"walk\">도보 약 10분</span></div>",
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

        // 사진은 DB에: 페이지 파일은 그대로, 사이트는 공개 API · 사본으로 그림
        assertThat(Files.readString(LIFE, UTF_8)).isEqualTo(PAGE);
        JsonNode fac = publicLife().get("fac");
        assertThat(fac.at("/bx9s-23-0/badge").asText()).isEmpty();
        assertThat(fac.at("/bx9s-23-0/photos")).hasSize(3);
        assertThat(fac.at("/bx9s-23-0/photos/0/src").asText()).isEqualTo(path);
        assertThat(fac.at("/bx9s-23-0/photos/0/bp").asText()).isEqualTo("40% 60%");
        assertThat(fac.at("/bx9s-23-0/photos/0/caption").asText()).isEqualTo("새 강의실 <사진>");
        assertThat(fac.at("/bx9s-23-0/photos/1/cls").asText()).isEqualTo("im-b_class");
        assertThat(fac.at("/bx9s-23-0/photos/1/bs").asText()).isEqualTo("240%");
        // 다른 공간은 그대로
        assertThat(fac.at("/bx9s-8-0/photos")).hasSize(1);
        assertThat(fac.at("/bx9s-8-0/badge").asText()).isEmpty();
        JsonNode copy = copy();
        assertThat(copy.get("fac")).isEqualTo(fac);
        JsonNode space = model(session).at("/floors/0/spaces/0");
        assertThat(space.get("photos")).hasSize(3);
        assertThat(space.at("/photos/0/url").asText()).isEqualTo("/admin/pages/site/life/" + path);
        // 바로 전 모습(사진 2장)이 버전 기록에
        JsonNode versions = versions(session, "fac");
        assertThat(versions).hasSize(1);
        assertThat(versions.at("/0/reason").asText()).isEqualTo("저장 전");
        assertThat(versions.at("/0/summary").asText()).isEqualTo("사진 3장 (공간 2곳)");

        // 표시를 '임시 사진'으로
        String hash2 = model(session).get("hash").asText();
        save(session, hash2, "[{\"cls\":\"im-classroom\",\"caption\":\"강의실 전경\"}]", "tmp").andExpect(status().isOk());
        assertThat(publicLife().at("/fac/bx9s-23-0/badge").asText()).isEqualTo("tmp");
        assertThat(publicLife().at("/fac/bx9s-23-0/photos")).hasSize(1);

        // 탭 없는 공간도 저장
        String hash3 = model(session).get("hash").asText();
        String body8 = "{\"baseHash\":\"" + hash3 + "\",\"spaces\":[{\"id\":\"bx9s-8-0\",\"badge\":\"tmp\",\"photos\":[{\"cls\":\"im-classroom\",\"caption\":\"구내식당 전경\"},{\"src\":\"" + path + "\",\"caption\":\"배식대\"}]}]}";
        mvc.perform(post("/admin/pages/life-photos/api").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body8))
                .andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(true));
        assertThat(publicLife().at("/fac/bx9s-8-0/photos")).hasSize(2);
        // 페이지에 없는 공간은 받지 않음
        String bad = "{\"baseHash\":\"" + model(session).get("hash").asText() + "\",\"spaces\":[{\"id\":\"bx9s-9-9\",\"badge\":\"\",\"photos\":[{\"cls\":\"im-classroom\",\"caption\":\"x\"}]}]}";
        mvc.perform(post("/admin/pages/life-photos/api").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(bad))
                .andExpect(status().isBadRequest());

        // 그사이 내용이 바뀌었으면(옛 hash) 저장하지 않음
        save(session, hash, "[{\"cls\":\"im-classroom\",\"caption\":\"강의실\"}]", "").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("새로 고친")));
        assertThat(Files.readString(LIFE, UTF_8)).isEqualTo(PAGE);
    }

    @Test
    @Order(3)
    void pageEditorDraftDoesNotBlockFacilityPhotos() throws Exception {
        MockHttpSession session = login();
        String draft = Files.readString(LIFE, UTF_8).replace("<h4>강의실</h4>", "<h4>강의실(고침)</h4>");
        mvc.perform(put("/admin/pages/api/draft").param("page", "life").session(session).with(csrf()).content(draft.getBytes(UTF_8)))
                .andExpect(status().isOk());
        JsonNode m = model(session);
        assertThat(m.get("hasDraft").asBoolean()).isFalse();
        save(session, m.get("hash").asText(), "[{\"cls\":\"im-b_class\",\"caption\":\"노트북 자리\"}]", "").andExpect(status().isOk())
                .andExpect(jsonPath("$.saved").value(true));
        mvc.perform(delete("/admin/pages/api/draft").param("page", "life").session(session).with(csrf())).andExpect(status().isOk());
        assertThat(publicLife().at("/fac/bx9s-23-0/photos/0/caption").asText()).isEqualTo("노트북 자리");
    }
    @Test
    @Order(4)
    void lunchAndOutingCardsAreMovedIntoTheDatabaseAndSavedThere() throws Exception {
        MockHttpSession session = login();
        // 처음 켤 때 페이지에 적혀 있던 카드를 DB로 옮김(메뉴의 줄바꿈 없는 띄어쓰기는 보통 띄어쓰기로)
        JsonNode m = model(session);
        assertThat(m.get("food")).hasSize(3);
        assertThat(m.at("/food/0/id").isNumber()).isTrue();
        assertThat(m.at("/food/0/menu").asText()).isEqualTo("국밥 · 동명동");
        assertThat(m.at("/food/0/example").asBoolean()).isTrue();
        assertThat(m.at("/fun/0/k").asText()).isEqualTo("walk");
        assertThat(m.at("/fun/0/title").asText()).isEqualTo("근처 산책길");
        assertThat(m.at("/fun/0/cards/1/cls").asText()).isEqualTo("im-b_class");
        assertThat(m.at("/fun/0/cards/1/url").asText()).isEqualTo("/admin/pages/site/life/assets/b_class.webp");
        long gukbap = m.at("/food/0/id").asLong(), gogi = m.at("/food/1/id").asLong(), cafe = m.at("/food/2/id").asLong();
        long green = m.at("/fun/0/cards/0/id").asLong(), river = m.at("/fun/0/cards/1/id").asLong();
        String hash = m.get("hash").asText();
        String page = Files.readString(LIFE, UTF_8);
        String path = json.readTree(mvc.perform(post("/admin/pages/api/upload").param("page", "life").param("name", "food.png")
                        .session(session).with(csrf()).content(PNG)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(UTF_8)).get("path").asText();
        // 고깃집 지움 · 국밥집 후기 고침('예시' 빠짐) · 새 카페(사진 있음) · 새 식당(후기 없음). 카드 번호(id)로 같은 카드를 알아봄
        String food = ("[{\"t\":\"cafe\",\"g\":\"group\",\"w\":3,\"category\":\"카페\",\"name\":\"새 카페 & 빵\",\"menu\":\"라떼 · 소금빵 ·충장동\",\"review\":\"\",\"example\":false,\"src\":\"@PATH@\"},"
                + "{\"id\":@GUKBAP@,\"t\":\"food\",\"g\":\"solo\",\"w\":4,\"category\":\"한식\",\"name\":\"국밥집\",\"menu\":\"국밥 · 동명동\",\"review\":\"진짜 후기예요.\",\"example\":true,\"src\":\"\"},"
                + "{\"id\":@CAFE@,\"t\":\"cafe\",\"g\":\"solo\",\"w\":10,\"category\":\"카페\",\"name\":\"카페 하나\",\"menu\":\"커피 · 동명동\",\"review\":\"조용해요.\",\"example\":true,\"src\":\"\"},"
                + "{\"t\":\"food\",\"g\":\"group\",\"w\":12,\"category\":\"중식\",\"name\":\"새 중국집\",\"menu\":\"짜장면\",\"review\":\"\",\"example\":false,\"src\":\"\"}]")
                .replace("@PATH@", path).replace("@GUKBAP@", String.valueOf(gukbap)).replace("@CAFE@", String.valueOf(cafe));
        // 문화 · 여가: 순서 바꾸고 새 장소(올린 사진) 더함
        String fun = ("[{\"k\":\"walk\",\"cards\":[{\"id\":@RIVER@,\"name\":\"광주천 산책로\",\"distance\":\"남쪽 · 약 1km\",\"fee\":\"무료\",\"summary\":\"하천 길이에요.\",\"cls\":\"im-b_class\",\"src\":\"\"},"
                + "{\"id\":@GREEN@,\"name\":\"푸른길 공원\",\"distance\":\"동쪽 · 약 1km\",\"fee\":\"무료\",\"summary\":\"산책로예요.\",\"cls\":\"im-classroom\",\"src\":\"\"},"
                + "{\"name\":\"새 <공원>\",\"distance\":\"북쪽 · 약 2km\",\"fee\":\"무료\",\"summary\":\"새로 생겼어요.\",\"cls\":\"\",\"src\":\"@PATH@\"}]}]")
                .replace("@PATH@", path).replace("@RIVER@", String.valueOf(river)).replace("@GREEN@", String.valueOf(green));

        // 확인: 이름 없음 · 사진 없는 문화 카드 · 카페 0곳 · 없는 그림 이름은 저장 안 함
        tips(session, hash, food.replace("\"name\":\"새 중국집\"", "\"name\":\" \""), null).andExpect(status().isBadRequest());
        tips(session, hash, null, fun.replace("\"src\":\"" + path + "\"", "\"src\":\"\"")).andExpect(status().isBadRequest());
        tips(session, hash, null, fun.replace("im-classroom", "im-nope")).andExpect(status().isBadRequest());
        tips(session, hash, "[{\"t\":\"food\",\"g\":\"solo\",\"w\":4,\"category\":\"한식\",\"name\":\"국밥집\",\"menu\":\"국밥\",\"review\":\"\",\"example\":false,\"src\":\"\"}]", null).andExpect(status().isBadRequest());

        tips(session, hash, food, fun).andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(true));
        // 사이트 페이지 파일은 그대로(카드는 사이트가 공개 API · 사본으로 그림)
        assertThat(Files.readString(LIFE, UTF_8)).isEqualTo(page);
        JsonNode api = json.readTree(mvc.perform(get("/api/public/life")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8));
        assertThat(api.get("source").asText()).isEqualTo("backoffice-api");
        // 식당이 먼저(보낸 순서대로), 그다음 카페
        assertThat(api.get("food").findValuesAsText("name")).containsExactly("국밥집", "새 중국집", "새 카페 & 빵", "카페 하나");
        assertThat(api.at("/food/2/menu").asText()).isEqualTo("라떼 · 소금빵 · 충장동");
        assertThat(api.at("/food/2/src").asText()).isEqualTo(path);
        assertThat(api.at("/food/2/w").asInt()).isEqualTo(3);
        // 고친 후기는 '예시' 표시 없음, 그대로인 후기는 그대로
        assertThat(api.at("/food/0/example").asBoolean()).isFalse();
        assertThat(api.at("/food/0/review").asText()).isEqualTo("진짜 후기예요.");
        assertThat(api.at("/food/3/example").asBoolean()).isTrue();
        assertThat(api.at("/food/1/review").asText()).isEmpty();
        assertThat(api.toString()).doesNotContain("고깃집");
        // 문화 · 여가: 새 순서 · 올린 사진
        assertThat(api.at("/fun/walk").findValuesAsText("name")).containsExactly("광주천 산책로", "푸른길 공원", "새 <공원>");
        assertThat(api.at("/fun/walk/2/src").asText()).isEqualTo(path);
        assertThat(api.at("/fun/walk/2/cls").asText()).isEmpty();
        // 사본(백오피스가 꺼져 있을 때 사이트가 씀)도 같은 내용
        String js = Files.readString(LIFE.resolveSibling("js/life-data.js"), UTF_8);
        JsonNode copy = json.readTree(js.substring(js.indexOf('{'), js.lastIndexOf('}') + 1));
        assertThat(copy.get("food")).isEqualTo(api.get("food"));
        assertThat(copy.get("fun")).isEqualTo(api.get("fun"));
        assertThat(mvc.perform(get("/api/public/life.js")).andReturn().getResponse().getContentAsString(UTF_8)).contains("window.LIFE_DATA = ").contains("새 중국집");

        // 같은 카드는 같은 번호 그대로, 지운 카드는 없음
        JsonNode again = model(session);
        assertThat(again.get("food")).hasSize(4);
        assertThat(again.at("/food/0/id").asLong()).isEqualTo(gukbap);
        assertThat(again.at("/food/3/id").asLong()).isEqualTo(cafe);
        assertThat(again.get("food").findValuesAsText("id")).doesNotContain(String.valueOf(gogi));
        assertThat(again.at("/fun/0/cards/0/id").asLong()).isEqualTo(river);
        assertThat(again.at("/fun/0/cards/2/src").asText()).isEqualTo(path);

        // 그대로 저장하면 바뀌는 것 없음
        StringBuilder same = new StringBuilder("[");
        for (JsonNode f : again.get("food")) {
            com.fasterxml.jackson.databind.node.ObjectNode o = f.deepCopy();
            o.remove("url");
            same.append(same.length() > 1 ? "," : "").append(json.writeValueAsString(o));
        }
        tips(session, again.get("hash").asText(), same.append("]").toString(), null).andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(false));

        // 페이지 편집 임시저장이 있어도 카드는 DB라 저장돼요
        mvc.perform(put("/admin/pages/api/draft").param("page", "life").session(session).with(csrf())
                .content(page.replace("</main>", "<!-- 임시 --></main>").getBytes(UTF_8))).andExpect(status().isOk());
        JsonNode withDraft = model(session);
        tips(session, withDraft.get("hash").asText(), same.toString().replace("진짜 후기예요.", "임시저장이 있어도 저장"), null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(true));
        mvc.perform(delete("/admin/pages/api/draft").param("page", "life").session(session).with(csrf())).andExpect(status().isOk());

        // 지운 고깃집은 휴지통에(사이트 · 목록에서는 빠짐)
        assertThat(model(session).get("trashCount").asInt()).isEqualTo(1);
        assertThat(mvc.perform(get("/admin/posts/trash").param("tab", "life").session(session)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(UTF_8))
                .contains("인사교 라이프 카드").contains("고깃집").contains("/admin/posts/trash/life/food/" + gogi + "/restore");
    }

    @Test
    @Order(5)
    void trashedCardsCanBeRestoredOrPurged() throws Exception {
        MockHttpSession session = login();
        String trash = mvc.perform(get("/admin/posts/trash").param("tab", "life").session(session)).andReturn().getResponse().getContentAsString(UTF_8);
        java.util.regex.Matcher id = java.util.regex.Pattern.compile("/admin/posts/trash/life/food/(\\d+)/restore").matcher(trash);
        assertThat(id.find()).isTrue();
        long gogi = Long.parseLong(id.group(1));
        int before = versions(session, "food").size();

        // 꺼내기: 식당 맨 뒤로 돌아오고 사이트에도 다시 보여요. 바로 전 목록은 버전 기록에
        mvc.perform(post("/admin/posts/trash/life/food/" + gogi + "/restore").session(session).with(csrf()))
                .andExpect(status().is3xxRedirection());
        JsonNode m = model(session);
        assertThat(m.get("trashCount").asInt()).isZero();
        java.util.List<String> foods = m.get("food").findValuesAsText("name");
        assertThat(foods).containsExactly("국밥집", "새 중국집", "고깃집", "새 카페 & 빵", "카페 하나");
        assertThat(publicLife().toString()).contains("고깃집");
        JsonNode versions = versions(session, "food");
        assertThat(versions).hasSize(before + 1);
        assertThat(versions.at("/0/reason").asText()).isEqualTo("휴지통에서 꺼내기 전");

        // 다시 목록에서 빼면(저장) 휴지통으로 · 최상위 관리자는 완전 삭제
        StringBuilder rest = new StringBuilder("[");
        for (JsonNode f : m.get("food")) {
            if (!f.get("name").asText().equals("고깃집")) {
                com.fasterxml.jackson.databind.node.ObjectNode o = f.deepCopy();
                o.remove("url");
                rest.append(rest.length() > 1 ? "," : "").append(json.writeValueAsString(o));
            }
        }
        tips(session, m.get("hash").asText(), rest.append("]").toString(), null).andExpect(status().isOk());
        assertThat(model(session).get("trashCount").asInt()).isEqualTo(1);
        mvc.perform(post("/admin/posts/trash/life/food/" + gogi + "/purge").session(session).with(csrf()))
                .andExpect(status().is3xxRedirection());
        assertThat(model(session).get("trashCount").asInt()).isZero();
        assertThat(mvc.perform(get("/admin/posts/trash").param("tab", "life").session(session)).andReturn().getResponse().getContentAsString(UTF_8))
                .doesNotContain("고깃집");
    }

    @Test
    @Order(6)
    void aVersionCanBeRestoredAndTheCurrentStateIsKept() throws Exception {
        MockHttpSession session = login();
        JsonNode list = versions(session, "fac");
        // 가장 오래된 기록 = 처음 사진(강의실 2장)
        JsonNode oldest = list.get(list.size() - 1);
        assertThat(oldest.get("summary").asText()).isEqualTo("사진 3장 (공간 2곳)");
        JsonNode m = json.readTree(mvc.perform(post("/admin/pages/life-photos/api/versions/" + oldest.get("id").asLong() + "/restore").session(session).with(csrf()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8));
        assertThat(m.get("saved").asBoolean()).isTrue();
        assertThat(m.get("restored").asText()).isEqualTo("fac");
        JsonNode fac = publicLife().get("fac");
        assertThat(fac.at("/bx9s-23-0/photos")).hasSize(2);
        assertThat(fac.at("/bx9s-23-0/badge").asText()).isEqualTo("ex");
        assertThat(fac.at("/bx9s-8-0/photos")).hasSize(1);
        // 되돌리기 전 모습도 기록에 남아 다시 돌아갈 수 있어요
        JsonNode after = versions(session, "fac");
        assertThat(after).hasSize(list.size() + 1);
        assertThat(after.at("/0/reason").asText()).isEqualTo("되돌리기 전");
        // 모르는 묶음 · 없는 기록
        mvc.perform(get("/admin/pages/life-photos/api/versions").param("section", "x").session(session)).andExpect(status().isNotFound());
        mvc.perform(post("/admin/pages/life-photos/api/versions/999999/restore").session(session).with(csrf())).andExpect(status().isNotFound());
    }

    private JsonNode publicLife() throws Exception {
        return json.readTree(mvc.perform(get("/api/public/life")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8));
    }

    private JsonNode copy() throws IOException {
        String js = Files.readString(LIFE.resolveSibling("js/life-data.js"), UTF_8);
        return json.readTree(js.substring(js.indexOf('{'), js.lastIndexOf('}') + 1));
    }

    private JsonNode versions(MockHttpSession session, String section) throws Exception {
        return json.readTree(mvc.perform(get("/admin/pages/life-photos/api/versions").param("section", section).session(session))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8));
    }

    private org.springframework.test.web.servlet.ResultActions tips(MockHttpSession session, String hash, String food, String fun) throws Exception {
        String body = "{\"baseHash\":\"" + hash + "\",\"spaces\":[]" + (food == null ? "" : ",\"food\":" + food) + (fun == null ? "" : ",\"fun\":" + fun) + "}";
        return mvc.perform(post("/admin/pages/life-photos/api").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body));
    }
}
