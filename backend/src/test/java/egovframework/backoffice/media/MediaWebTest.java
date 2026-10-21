package egovframework.backoffice.media;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.authenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
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
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 미디어 관리(V25 media): 파일은 저장소(업로드 폴더), 표에는 이름 · 종류 · 저장소 안 위치 · 크기 · 올린 사람.
 * 올리기(사진 · 동영상만) · 이름 바꾸기(파일 · 주소 그대로) · 휴지통 · 복원 · 완전 삭제(파일도) · 권한(서포터즈는 자기 것만) ·
 * 글쓰기 화면 업로드도 미디어로 · 처음 켤 때 폴더에 있던 파일 등록 · 휴지통 종류 고르기.
 */
@TestPropertySource(properties = {
        "datasource.url=jdbc:h2:mem:backoffice-media-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "backoffice.pages.site-root=${java.io.tmpdir}/aica-media-test/site",
        "backoffice.pages.data-dir=${java.io.tmpdir}/aica-media-test/data",
        "backoffice.upload-dir=${java.io.tmpdir}/aica-media-test/uploads",
        "backoffice.initial-admin.password=test-pass-1234"
})
@SpringJUnitWebConfig({BackofficeApplication.class, CmsMockMvcConfig.class})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class MediaWebTest {

    private static final Path ROOT = Paths.get(System.getProperty("java.io.tmpdir"), "aica-media-test");
    private static final Path UPLOADS = ROOT.resolve("uploads");
    private static final byte[] PNG = java.util.Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");
    private static final byte[] MP4 = {0, 0, 0, 0x18, 'f', 't', 'y', 'p', 'm', 'p', '4', '2', 0, 0, 0, 0};
    private static final byte[] PDF = "%PDF-1.4 test".getBytes(UTF_8);

    static {
        try {
            if (Files.exists(ROOT)) {
                try (Stream<Path> walk = Files.walk(ROOT)) {
                    walk.sorted(Comparator.reverseOrder()).forEach(path -> path.toFile().delete());
                }
            }
            // 미디어 표가 생기기 전에 글쓰기 화면에서 올려 둔 파일(처음 켤 때 미디어로 등록돼야 함)
            Files.createDirectories(UPLOADS.resolve("2026/09"));
            Files.write(UPLOADS.resolve("2026/09/old-photo.png"), PNG);
            Files.writeString(UPLOADS.resolve("2026/09/memo.txt"), "not media");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;

    private MockHttpSession login(String id, String password) throws Exception {
        return (MockHttpSession) mvc.perform(formLogin("/login").user("loginId", id).password("password", password))
                .andExpect(authenticated()).andReturn().getRequest().getSession(false);
    }

    private MockHttpSession admin() throws Exception {
        return login("admin", "test-pass-1234");
    }

    /** 서포터즈 계정(없으면 만들고) 로그인 */
    private MockHttpSession supporter() throws Exception {
        if (jdbc.queryForObject("SELECT COUNT(*) FROM admin_users WHERE login_id = 'support@media.example.test'", Long.class) == 0) {
            mvc.perform(post("/admin/users").session(admin()).with(csrf()).param("loginId", "support@media.example.test")
                    .param("name", "미디어 서포터즈").param("role", "SUPPORT").param("active", "true").param("password", "media-support-pass-1"))
                    .andExpect(status().is3xxRedirection());
        }
        return login("support@media.example.test", "media-support-pass-1");
    }

    private JsonNode upload(MockHttpSession session, String name, String type, byte[] bytes) throws Exception {
        return json.readTree(mvc.perform(multipart("/admin/media/api/upload").file(new MockMultipartFile("file", name, type, bytes))
                        .session(session).with(csrf()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8));
    }

    private Map<String, Object> row(long id) {
        return jdbc.queryForMap("SELECT * FROM media WHERE id = ?", id);
    }

    private String page(MockHttpSession session, String url) throws Exception {
        return mvc.perform(get(url).session(session)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8);
    }

    @Test
    @Order(1)
    void filesAlreadyInTheUploadFolderBecomeMediaOnStartup() throws Exception {
        Map<String, Object> old = jdbc.queryForMap("SELECT * FROM media WHERE storage_key = '2026/09/old-photo.png'");
        assertThat(old.get("name")).isEqualTo("old-photo");
        assertThat(old.get("media_type")).isEqualTo("IMAGE");
        assertThat(old.get("status")).isEqualTo("ACTIVE");
        assertThat(old.get("uploaded_by")).isNull();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM media WHERE storage_key LIKE '%memo.txt'", Long.class)).isZero();
        // 미디어 관리 화면(왼쪽 메뉴에도)
        assertThat(page(admin(), "/admin/media")).contains("미디어 관리").contains("old-photo").contains("href=\"/uploads/2026/09/old-photo.png\"");
    }

    @Test
    @Order(2)
    void uploadKeepsOnlyInfoInTheTableAndTheFileInStorage() throws Exception {
        MockHttpSession session = admin();
        long adminId = jdbc.queryForObject("SELECT id FROM admin_users WHERE login_id = 'admin'", Long.class);
        JsonNode photo = upload(session, "입교식 단체사진.png", "image/png", PNG);
        assertThat(photo.get("name").asText()).isEqualTo("입교식 단체사진");
        assertThat(photo.get("type").asText()).isEqualTo("IMAGE");
        assertThat(photo.get("src").asText()).startsWith("/uploads/").endsWith(".png");
        Map<String, Object> r = row(photo.get("id").asLong());
        assertThat(r.get("original_name")).isEqualTo("입교식 단체사진.png");
        assertThat(((Number) r.get("uploaded_by")).longValue()).isEqualTo(adminId);
        assertThat(((Number) r.get("file_size")).longValue()).isEqualTo(PNG.length);
        String key = (String) r.get("storage_key");
        assertThat(photo.get("src").asText()).isEqualTo("/uploads/" + key);
        assertThat(Files.readAllBytes(UPLOADS.resolve(key))).isEqualTo(PNG);

        JsonNode video = upload(session, "수료식.mp4", "video/mp4", MP4);
        assertThat(video.get("type").asText()).isEqualTo("VIDEO");
        // 문서(PDF)는 미디어에 올릴 수 없어요
        mvc.perform(multipart("/admin/media/api/upload").file(new MockMultipartFile("file", "안내.pdf", "application/pdf", PDF)).session(session).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("이미지(JPG·PNG·GIF·WEBP)와 동영상(MP4·WEBM)만 올릴 수 있어요."));

        // 글쓰기 화면에서 올린 사진도 미디어로 남고(다른 사람이 고를 수 있게), PDF 는 남지 않음
        long before = jdbc.queryForObject("SELECT COUNT(*) FROM media", Long.class);
        String editor = mvc.perform(multipart("/admin/images").file(new MockMultipartFile("file", "글 사진.png", "image/png", PNG)).session(session).with(csrf()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8);
        assertThat(json.readTree(editor).get("mediaId").isNumber()).isTrue();
        mvc.perform(multipart("/admin/images").file(new MockMultipartFile("file", "첨부.pdf", "application/pdf", PDF)).session(session).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.mediaId").isEmpty());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM media", Long.class)).isEqualTo(before + 1);

        // '미디어에서 고르기' 목록: 종류 · 이름으로
        JsonNode api = json.readTree(page(session, "/admin/media/api?type=IMAGE&keyword=입교식"));
        assertThat(api.get("items")).hasSize(1);
        assertThat(api.at("/items/0/src").asText()).isEqualTo(photo.get("src").asText());
        assertThat(json.readTree(page(session, "/admin/media/api?type=VIDEO")).get("items")).hasSize(1);
    }

    @Test
    @Order(3)
    void renamingChangesOnlyTheNameAndSupportersEditOnlyTheirOwn() throws Exception {
        MockHttpSession admin = admin();
        long photo = jdbc.queryForObject("SELECT id FROM media WHERE name = '입교식 단체사진'", Long.class);
        String key = (String) row(photo).get("storage_key");
        mvc.perform(post("/admin/media/" + photo + "/rename").session(admin).with(csrf()).param("name", "  7기 입교식   단체 사진 "))
                .andExpect(status().is3xxRedirection()).andExpect(redirectedUrl("/admin/media"));
        assertThat(row(photo).get("name")).isEqualTo("7기 입교식 단체 사진");
        assertThat(row(photo).get("storage_key")).isEqualTo(key);
        // 빈 이름은 안 받음(안내만 띄우고 그대로)
        mvc.perform(post("/admin/media/" + photo + "/rename").session(admin).with(csrf()).param("name", "   ")).andExpect(status().is3xxRedirection());
        assertThat(row(photo).get("name")).isEqualTo("7기 입교식 단체 사진");

        // 서포터즈: 올리기 · 고르기는 되고, 이름 바꾸기 · 삭제는 자기가 올린 것만
        MockHttpSession support = supporter();
        JsonNode mine = upload(support, "서포터즈 사진.png", "image/png", PNG);
        mvc.perform(post("/admin/media/" + photo + "/rename").session(support).with(csrf()).param("name", "남의 사진")).andExpect(status().isForbidden());
        mvc.perform(post("/admin/media/" + photo + "/delete").session(support).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(post("/admin/media/" + mine.get("id").asLong() + "/rename").session(support).with(csrf()).param("name", "내 사진"))
                .andExpect(status().is3xxRedirection());
        assertThat(row(mine.get("id").asLong()).get("name")).isEqualTo("내 사진");
        String list = page(support, "/admin/media");
        assertThat(list).contains("7기 입교식 단체 사진").contains("내 사진");
        assertThat(list.split("data-md=\"rename\"", -1).length - 1).isEqualTo(1);   // 이름 바꾸기 버튼은 자기 것에만
        assertThat(json.readTree(page(support, "/admin/media/api?type=IMAGE")).get("items").size()).isGreaterThanOrEqualTo(3);
    }

    @Test
    @Order(4)
    void deletedMediaGoToTheTrashAndPurgeRemovesTheFile() throws Exception {
        MockHttpSession admin = admin();
        long photo = jdbc.queryForObject("SELECT id FROM media WHERE name = '7기 입교식 단체 사진'", Long.class);
        String key = (String) row(photo).get("storage_key");
        // 글에서 쓰는 중이면 목록에 알려 줌
        long adminId = jdbc.queryForObject("SELECT id FROM admin_users WHERE login_id = 'admin'", Long.class);
        jdbc.update("INSERT INTO reviews(category, title, status, author_id, photos) VALUES('생활', '사진 쓰는 후기', 'DRAFT', ?, ?)",
                adminId, "{\"photos\":[{\"src\":\"/uploads/" + key + "\"}]}");
        assertThat(page(admin, "/admin/media")).contains("글 1개에서 쓰는 중");

        mvc.perform(post("/admin/media/" + photo + "/delete").session(admin).with(csrf())).andExpect(status().is3xxRedirection());
        assertThat(row(photo).get("status")).isEqualTo("DELETED");
        assertThat(row(photo).get("deleted_at")).isNotNull();
        assertThat(Files.exists(UPLOADS.resolve(key))).isTrue();   // 휴지통에서는 파일 그대로
        assertThat(page(admin, "/admin/media")).doesNotContain("id=\"media-" + photo + "\"");   // 목록에서 빠짐(위의 안내 글에는 이름이 나옴)

        // 휴지통: 종류 칩으로 미디어만 · 후기만
        assertThat(page(admin, "/admin/posts/trash?kind=media")).contains("7기 입교식 단체 사진").contains("미디어 › 이미지")
                .contains("value=\"media-" + photo + "\"").contains("미디어 휴지통 비우기");
        assertThat(page(admin, "/admin/posts/trash?kind=review")).doesNotContain("7기 입교식 단체 사진");
        assertThat(page(admin, "/admin/posts/trash")).contains("7기 입교식 단체 사진");

        // 복원 → 미디어 관리에 다시
        mvc.perform(post("/admin/posts/media/" + photo + "/restore").session(admin).with(csrf()))
                .andExpect(status().is3xxRedirection()).andExpect(redirectedUrl("/admin/media"));
        assertThat(row(photo).get("status")).isEqualTo("ACTIVE");
        assertThat(row(photo).get("deleted_at")).isNull();

        // 다시 지우고 선택 복원 · 완전 삭제(파일도 지움)
        mvc.perform(post("/admin/media/" + photo + "/delete").session(admin).with(csrf())).andExpect(status().is3xxRedirection());
        mvc.perform(post("/admin/posts/trash/bulk").session(admin).with(csrf()).param("ids", "media-" + photo).param("action", "restore").param("kind", "media"))
                .andExpect(redirectedUrl("/admin/posts/trash?kind=media"));
        assertThat(row(photo).get("deleted_at")).isNull();
        mvc.perform(post("/admin/media/" + photo + "/delete").session(admin).with(csrf())).andExpect(status().is3xxRedirection());
        mvc.perform(post("/admin/posts/media/" + photo + "/purge").session(admin).with(csrf()).param("back", "media"))
                .andExpect(redirectedUrl("/admin/posts/trash?kind=media"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM media WHERE id = ?", Long.class, photo)).isZero();
        assertThat(Files.exists(UPLOADS.resolve(key))).isFalse();
    }

    @Test
    @Order(5)
    void emptyingOneKindLeavesTheOtherKindsInTheTrash() throws Exception {
        MockHttpSession admin = admin();
        long video = jdbc.queryForObject("SELECT id FROM media WHERE media_type = 'VIDEO'", Long.class);
        String key = (String) row(video).get("storage_key");
        mvc.perform(post("/admin/media/" + video + "/delete").session(admin).with(csrf())).andExpect(status().is3xxRedirection());
        long review = jdbc.queryForObject("SELECT id FROM reviews WHERE title = '사진 쓰는 후기'", Long.class);
        mvc.perform(post("/admin/posts/review/" + review + "/delete").session(admin).with(csrf())).andExpect(status().is3xxRedirection());

        String trash = page(admin, "/admin/posts/trash?kind=media");
        java.util.regex.Matcher snapshot = java.util.regex.Pattern.compile("name=\"snapshot\" value=\"([0-9a-f]+)\"").matcher(trash);
        assertThat(snapshot.find()).isTrue();
        mvc.perform(post("/admin/posts/trash/empty").session(admin).with(csrf()).param("snapshot", snapshot.group(1)).param("kind", "media"))
                .andExpect(redirectedUrl("/admin/posts/trash?kind=media"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM media WHERE deleted_at IS NOT NULL", Long.class)).isZero();
        assertThat(Files.exists(UPLOADS.resolve(key))).isFalse();
        // 후기는 휴지통에 그대로
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM reviews WHERE id = ? AND deleted_at IS NOT NULL", Long.class, review)).isEqualTo(1);
        assertThat(page(admin, "/admin/posts/trash?kind=review")).contains("사진 쓰는 후기");

        // 전체 휴지통 지문으로 한 종류만 비우려 하면(목록이 다름) 하지 않음
        String all = page(admin, "/admin/posts/trash");
        java.util.regex.Matcher allSnapshot = java.util.regex.Pattern.compile("name=\"snapshot\" value=\"([0-9a-f]+)\"").matcher(all);
        assertThat(allSnapshot.find()).isTrue();
        mvc.perform(post("/admin/posts/trash/empty").session(admin).with(csrf()).param("snapshot", allSnapshot.group(1)).param("kind", "faq"))
                .andExpect(status().isBadRequest());
    }
}
