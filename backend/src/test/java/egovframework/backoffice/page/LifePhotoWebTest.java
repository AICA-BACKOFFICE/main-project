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
 * 게시물 관리 › 인사교 라이프 게시물 관리(2026-10-20부터 DB 표 V29): 처음 켤 때 페이지의 공간 · 사진 · 카드가 표로 옮겨지고,
 * 카드 하나씩 추가(템플릿) · 완료(게시) · 임시저장 · 순서 · 삭제(휴지통) · 복원하면 게시중인 것만으로 그 목록 부분만 페이지에 다시 쓴다
 * (나머지 글자 · 줄바꿈 · 문자 참조는 그대로, 버전 기록에 남음). 페이지 편집기 임시저장이 있으면 게시는 하지 않는다.
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

    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    /** 카드 하나 저장 · 순서 · 삭제(JSON) */
    private org.springframework.test.web.servlet.ResultActions send(MockHttpSession session, String url, String body) throws Exception {
        return mvc.perform(post("/admin/pages/life-photos/api" + url).session(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body == null ? "{}" : body));
    }

    private long id(String sql, Object... args) {
        return jdbc.queryForObject(sql, Long.class, args);
    }

    private String stateOf(String table, long id) {
        return jdbc.queryForObject("SELECT status FROM " + table + " WHERE id = ?", String.class, id);
    }

    private String upload(MockHttpSession session, String name) throws Exception {
        return json.readTree(mvc.perform(post("/admin/pages/api/upload").param("page", "life").param("name", name)
                        .session(session).with(csrf()).content(PNG)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(UTF_8)).get("path").asText();
    }

    @Test
    @Order(1)
    void pageCardsAreMovedIntoTablesAndShownFromThem() throws Exception {
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

        // 처음 켤 때 지금 페이지의 공간 · 사진 · 카드를 게시중으로 표에 옮겨 담음(페이지 파일은 그대로)
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM life_facility_spaces", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM life_facility_photos WHERE status = 'PUBLISHED'", Integer.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM life_foods WHERE status = 'PUBLISHED'", Integer.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM life_spots WHERE status = 'PUBLISHED'", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT badge FROM life_facility_spaces WHERE space_id = 'bx9s-23-0'", String.class)).isEqualTo("ex");
        assertThat(Files.readString(LIFE, UTF_8)).isEqualTo(PAGE);

        JsonNode m = model(session);
        JsonNode space = m.at("/floors/0/spaces/0");
        assertThat(m.at("/defaultFloor").asText()).isEqualTo("23");
        assertThat(space.get("name").asText()).isEqualTo("강의실");
        assertThat(space.get("badge").asText()).isEqualTo("ex");
        assertThat(space.get("photos")).hasSize(2);
        assertThat(space.at("/photos/0/status").asText()).isEqualTo("PUBLISHED");
        assertThat(space.at("/photos/0/id").asLong()).isPositive();
        assertThat(space.at("/photos/1/cls").asText()).isEqualTo("im-b_class");
        assertThat(space.at("/photos/1/bs").asText()).isEqualTo("240%");
        assertThat(space.at("/photos/1/bp").asText()).isEqualTo("28% 72%");
        assertThat(space.at("/photos/0/url").asText()).isEqualTo("/admin/pages/site/life/assets/classroom.webp");
        // 공간이 하나뿐이라 탭이 없는 층: 이름은 안내 카드 제목
        assertThat(m.at("/floors/1/spaces/0/name").asText()).isEqualTo("구내식당");
        assertThat(m.at("/floors/1/spaces/0/photos")).hasSize(1);
        assertThat(m.get("food")).hasSize(3);
        assertThat(m.at("/food/0/menu").asText()).isEqualTo("국밥 · 동명동");
        assertThat(m.at("/food/0/example").asBoolean()).isTrue();
        assertThat(m.at("/fun/0/k").asText()).isEqualTo("walk");
        assertThat(m.at("/fun/0/title").asText()).isEqualTo("근처 산책길");
        assertThat(m.at("/fun/0/cards/1/cls").asText()).isEqualTo("im-b_class");
        // 위쪽 '저장' 단추는 없음(카드마다 완료 · 임시저장 · 취소)
        assertThat(mvc.perform(get("/js/page/life-photos.js")).andReturn().getResponse().getContentAsString(UTF_8))
                .doesNotContain("id=\"lpSave\"").contains("data-act=\"done\"").contains("data-act=\"draft\"").contains("data-act=\"cancel\"");
    }

    @Test
    @Order(2)
    void facilityPhotoIsAddedAsTemplateThenPublishedMovedTrashedAndRestored() throws Exception {
        MockHttpSession session = login();
        String path = upload(session, "facility-bx9s-23-0.png");
        assertThat(path).startsWith("assets/uploads/").contains("facility-bx9s-23-0").endsWith(".png");

        // ＋ 추가 → 빈칸이 있어도 임시저장은 됨(사이트에는 안 보임)
        send(session, "/fac", "{\"space\":\"bx9s-23-0\",\"caption\":\"\",\"status\":\"DRAFT\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("임시저장")));
        long fresh = id("SELECT MAX(id) FROM life_facility_photos");
        assertThat(stateOf("life_facility_photos", fresh)).isEqualTo("DRAFT");
        assertThat(Files.readString(LIFE, UTF_8)).isEqualTo(PAGE);
        // 게시하려면 사진 · 사진 이름이 있어야 함 · 없는 파일 · 모르는 공간 · 모르는 상태는 안 됨
        send(session, "/fac/" + fresh, "{\"caption\":\"이름만\",\"status\":\"PUBLISHED\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("사진")));
        send(session, "/fac/" + fresh, "{\"src\":\"assets/uploads/none.webp\",\"caption\":\"x\",\"status\":\"PUBLISHED\"}").andExpect(status().isBadRequest());
        send(session, "/fac", "{\"space\":\"bx9s-9-9\",\"caption\":\"x\",\"status\":\"DRAFT\"}").andExpect(status().isBadRequest());
        send(session, "/fac/" + fresh, "{\"caption\":\"x\",\"status\":\"DELETED\"}").andExpect(status().isBadRequest());
        assertThat(stateOf("life_facility_photos", fresh)).isEqualTo("DRAFT");

        // 완료(게시) → 그 공간 사진 넘김 맨 뒤에
        send(session, "/fac/" + fresh, "{\"src\":\"" + path + "\",\"bp\":\"40% 60%\",\"caption\":\"새 강의실 <사진>\",\"status\":\"PUBLISHED\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("게시")));
        String slide = "<div class=\"bx9-sl\" style=\"background-image:url(" + path + ");--bp:40% 60%;\" role=\"img\" aria-label=\"새 강의실 &lt;사진&gt;\"></div>";
        String out = Files.readString(LIFE, UTF_8);
        assertThat(out).contains("                <div class=\"bx9-tr\">\r\n"
                + "                  <div class=\"bx9-sl im-classroom\" role=\"img\" aria-label=\"강의실 전경\"></div>\r\n"
                + "                  <div class=\"bx9-sl im-b_class\" style=\"--bs:240%;--bp:28% 72%;\" role=\"img\" aria-label=\"노트북 자리\"></div>\r\n"
                + "                  " + slide + "\r\n                </div>\r\n                <span class=\"bx-ex\">사진 예시</span>");
        assertThat(out).contains("aria-label=\"강의실 사진 3장\"");
        assertThat(out.split("bx9-tb", -1)).hasSize(5);   // 작은 사진: 강의실 3 + 구내식당 1
        // 다른 곳은 그대로: 문자 참조 · 줄바꿈(CRLF)
        assertThat(out).contains("<li>평일 &middot; 9시</li>");
        assertThat(out.replace("\r\n", "")).doesNotContain("\n");

        // 순서: 앞으로 두 번 → 첫 사진(설명 · 탭 아이콘도)
        send(session, "/fac/" + fresh + "/move?dir=-1", null).andExpect(status().isOk());
        send(session, "/fac/" + fresh + "/move?dir=-1", null).andExpect(status().isOk());
        out = Files.readString(LIFE, UTF_8);
        assertThat(out).contains("<div class=\"bx9-tr\">\r\n                  " + slide);
        assertThat(out).contains("<p class=\"bx9-cap\"><span>새 강의실 &lt;사진&gt;</span><span class=\"bx9-n\"><b>1</b> / 3</span></p>");
        assertThat(out).contains("<span class=\"bx9-tt\" aria-hidden=\"true\" style=\"background-image:url(" + path + ");--bp:40% 60%;\"></span><b>강의실</b>");

        // 삭제 → 휴지통(사이트에서 내려감), 휴지통의 인사교 라이프 칩에서 보임
        long classroom = id("SELECT id FROM life_facility_photos WHERE caption = '강의실 전경' AND space_id = 'bx9s-23-0'");
        send(session, "/fac/" + classroom + "/delete", null).andExpect(status().isOk());
        assertThat(stateOf("life_facility_photos", classroom)).isEqualTo("DELETED");
        assertThat(Files.readString(LIFE, UTF_8)).contains("aria-label=\"강의실 사진 2장\"");
        assertThat(mvc.perform(get("/admin/posts/trash").param("kind", "life").session(session)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(UTF_8)).contains("인사교 라이프").contains("강의실 전경")
                .contains("value=\"life-fac-" + classroom + "\"").contains("/admin/posts/life-fac/" + classroom + "/restore");
        // 공간에 게시중인 사진이 한 장도 안 남게는 못 지움
        long canteen = id("SELECT id FROM life_facility_photos WHERE space_id = 'bx9s-8-0'");
        send(session, "/fac/" + canteen + "/delete", null).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("게시중인 사진이 한 장은")));
        assertThat(stateOf("life_facility_photos", canteen)).isEqualTo("PUBLISHED");

        // 휴지통에서 복원 → 원래 자리(두 번째)로, 사이트에도 다시
        mvc.perform(post("/admin/posts/life-fac/" + classroom + "/restore").session(session).with(csrf()))
                .andExpect(status().is3xxRedirection())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl("/admin/pages/life-photos?section=fac"));
        out = Files.readString(LIFE, UTF_8);
        assertThat(out).contains("aria-label=\"강의실 사진 3장\"");
        assertThat(out.indexOf(slide)).isLessThan(out.indexOf("aria-label=\"강의실 전경\"></div>"));
        assertThat(out.indexOf("aria-label=\"강의실 전경\"></div>")).isLessThan(out.indexOf("aria-label=\"노트북 자리\"></div>"));

        // 게시중인 카드를 임시저장하면 사이트에서는 내려감
        send(session, "/fac/" + fresh, "{\"src\":\"" + path + "\",\"caption\":\"새 강의실\",\"status\":\"DRAFT\"}").andExpect(status().isOk());
        assertThat(Files.readString(LIFE, UTF_8)).contains("aria-label=\"강의실 사진 2장\"").doesNotContain(path);
        // 반영할 때마다 버전 기록(page_versions)에
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM page_versions WHERE page_id = 'life' AND note = '인사교 라이프 게시물 관리'", Integer.class))
                .isGreaterThanOrEqualTo(5);
    }

    @Test
    @Order(3)
    void pageEditorDraftBlocksPublishingButNotDrafts() throws Exception {
        MockHttpSession session = login();
        String draft = Files.readString(LIFE, UTF_8).replace("<h4>강의실</h4>", "<h4>강의실(고침)</h4>");
        mvc.perform(put("/admin/pages/api/draft").param("page", "life").session(session).with(csrf()).content(draft.getBytes(UTF_8)))
                .andExpect(status().isOk());
        assertThat(model(session).get("hasDraft").asBoolean()).isTrue();
        // 임시저장(사이트에 안 씀)은 되고, 게시는 페이지 편집기 임시저장을 먼저 정리해야 함
        send(session, "/fac", "{\"space\":\"bx9s-8-0\",\"cls\":\"im-b_class\",\"caption\":\"배식대\",\"status\":\"DRAFT\"}").andExpect(status().isOk());
        long id = id("SELECT MAX(id) FROM life_facility_photos");
        send(session, "/fac/" + id, "{\"cls\":\"im-b_class\",\"caption\":\"배식대\",\"status\":\"PUBLISHED\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("임시저장")));
        assertThat(stateOf("life_facility_photos", id)).isEqualTo("DRAFT");
        mvc.perform(delete("/admin/pages/api/draft").param("page", "life").session(session).with(csrf())).andExpect(status().isOk());
        send(session, "/fac/" + id, "{\"cls\":\"im-b_class\",\"caption\":\"배식대\",\"status\":\"PUBLISHED\"}").andExpect(status().isOk());
        assertThat(Files.readString(LIFE, UTF_8)).contains("aria-label=\"구내식당 사진 2장\"");
    }

    @Test
    @Order(4)
    void lunchAndOutingCardsAreSavedOneByOne() throws Exception {
        MockHttpSession session = login();
        String path = upload(session, "food.png");

        // 새 카페(사진 있음) 완료 → 카페 수 · 숨김 · 메뉴 글자 정리
        send(session, "/food", "{\"t\":\"cafe\",\"g\":\"group\",\"w\":3,\"category\":\"카페\",\"name\":\"새 카페 & 빵\",\"menu\":\"라떼 · 소금빵 ·충장동\",\"src\":\"" + path + "\",\"status\":\"PUBLISHED\"}")
                .andExpect(status().isOk());
        String out = Files.readString(LIFE, UTF_8);
        assertThat(out).contains("data-fk=\"cafe\">카페<span>2</span>");
        assertThat(out).contains("<li class=\"fdc\" data-t=\"cafe\" data-g=\"group\" data-w=\"3\" hidden>");
        assertThat(out).contains("<div class=\"fdc-ph has-img\" role=\"img\" aria-label=\"새 카페 &amp; 빵 대표 메뉴 그림\" data-field=\"photo\"><img src=\"" + path + "\" alt=\"\" loading=\"lazy\">");
        assertThat(out).contains("<p class=\"fdc-m\" data-field=\"menu\">라떼&nbsp;· 소금빵&nbsp;· 충장동</p>");
        // 빈칸이 있으면 게시 안 됨 · 임시저장은 사이트에 안 보이고 임시저장 목록에
        send(session, "/food", "{\"t\":\"food\",\"name\":\"\",\"status\":\"PUBLISHED\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("가게 이름")));
        send(session, "/food", "{\"t\":\"food\",\"name\":\"새 중국집\",\"status\":\"DRAFT\"}").andExpect(status().isOk());
        long draft = id("SELECT id FROM life_foods WHERE name = '새 중국집'");
        assertThat(Files.readString(LIFE, UTF_8)).doesNotContain("새 중국집");
        String drafts = mvc.perform(get("/admin/posts/drafts").param("kind", "life").session(session)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(UTF_8);
        assertThat(drafts).contains("새 중국집").contains("인사교 라이프에서 수정")
                .contains("/admin/pages/life-photos?section=food&amp;edit=" + draft).contains("/admin/pages/life-photos/food/" + draft + "/delete");

        // 국밥집 후기를 고쳐 완료 → '예시' 표시 빠짐(그대로인 후기는 그대로)
        long gukbap = id("SELECT id FROM life_foods WHERE name = '국밥집'");
        send(session, "/food/" + gukbap, "{\"g\":\"solo\",\"w\":4,\"category\":\"한식\",\"name\":\"국밥집\",\"menu\":\"국밥 · 동명동\",\"review\":\"진짜 후기예요.\",\"status\":\"PUBLISHED\"}")
                .andExpect(status().isOk());
        out = Files.readString(LIFE, UTF_8);
        assertThat(out).contains("<figcaption><b>선배 후기</b></figcaption>\r\n              <blockquote data-field=\"review\">진짜 후기예요.</blockquote>");
        assertThat(out).contains("<figcaption><b>선배 후기</b><span class=\"bdg ex\">예시</span></figcaption>\r\n              <blockquote data-field=\"review\">조용해요.</blockquote>");

        // 고깃집 삭제 → 사이트에서 내려감, 마지막 식당은 못 지움
        long gogi = id("SELECT id FROM life_foods WHERE name = '고깃집'");
        send(session, "/food/" + gogi + "/delete", null).andExpect(status().isOk());
        assertThat(Files.readString(LIFE, UTF_8)).doesNotContain("고깃집").contains("id=\"fdk-food\" aria-selected=\"true\" data-fk=\"food\">식당<span>1</span>");
        send(session, "/food/" + gukbap + "/delete", null).andExpect(status().isBadRequest());
        // 휴지통 일괄 복원 → 다시 사이트에
        mvc.perform(post("/admin/posts/trash/bulk").session(session).with(csrf()).param("ids", "life-food-" + gogi).param("action", "restore"))
                .andExpect(status().is3xxRedirection());
        assertThat(Files.readString(LIFE, UTF_8)).contains("고깃집");
        // 임시저장 목록의 삭제 단추 → 휴지통 → 완전 삭제
        mvc.perform(post("/admin/pages/life-photos/food/" + draft + "/delete").session(session).with(csrf()).param("back", "/admin/posts/drafts?kind=life"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl("/admin/posts/drafts?kind=life"));
        assertThat(stateOf("life_foods", draft)).isEqualTo("DELETED");
        mvc.perform(post("/admin/posts/life-food/" + draft + "/purge").session(session).with(csrf())).andExpect(status().is3xxRedirection());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM life_foods WHERE id = ?", Integer.class, draft)).isZero();

        // 바람 쐬러 가요: 사진 없이는 게시 안 됨, 새 장소 완료 · 순서 바꾸기
        send(session, "/fun", "{\"k\":\"walk\",\"name\":\"사진 없음\",\"distance\":\"x\",\"fee\":\"무료\",\"summary\":\"x\",\"status\":\"PUBLISHED\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("사진")));
        send(session, "/fun", "{\"k\":\"walk\",\"name\":\"새 <공원>\",\"distance\":\"북쪽 · 약 2km\",\"fee\":\"무료\",\"summary\":\"새로 생겼어요.\",\"src\":\"" + path + "\",\"status\":\"PUBLISHED\"}")
                .andExpect(status().isOk());
        long river = id("SELECT id FROM life_spots WHERE name = '광주천 산책로'");
        send(session, "/fun/" + river + "/move?dir=-1", null).andExpect(status().isOk());
        out = Files.readString(LIFE, UTF_8);
        assertThat(out).contains("<span class=\"o\">3곳 펼쳐 보기</span>");
        assertThat(out).contains("<ul class=\"fs-names\"><li>광주천 산책로</li><li>푸른길 공원</li><li>새 &lt;공원&gt;</li></ul>");
        assertThat(out).contains("<li class=\"fsc\" style=\"--i:2;--rt:-2deg;--z:1\">\r\n                <span class=\"fsc-ph\" style=\"background-image:url(" + path + ")\" role=\"img\" aria-label=\"새 &lt;공원&gt;\" data-field=\"photo\"></span>");
        assertThat(out.replace("\r\n", "")).doesNotContain("\n");
        // 쓴 사람이 남음
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM life_spots s JOIN admin_users u ON u.id = s.author_id WHERE s.name = '새 <공원>' AND u.login_id = 'admin'",
                Integer.class)).isEqualTo(1);
    }
}
