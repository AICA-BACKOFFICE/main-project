package egovframework.backoffice;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.authenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrlPattern;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/**
 * 로그인 → 카테고리 등록 → 게시물 등록·미리보기·게시 → 공개 API 조회·조회수 집계 흐름을 실제 컨텍스트로 검증한다.
 */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:backoffice-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "backoffice.upload-dir=${java.io.tmpdir}/backoffice-test-uploads",
        "backoffice.initial-admin.password=test-pass-1234"
})
@AutoConfigureMockMvc
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class BackofficeWebTest {

    @Autowired MockMvc mvc;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    private MockHttpSession login() throws Exception {
        MvcResult result = mvc.perform(formLogin("/login").user("loginId", "admin").password("password", "test-pass-1234"))
                .andExpect(authenticated())
                .andExpect(redirectedUrl("/admin"))
                .andReturn();
        return (MockHttpSession) result.getRequest().getSession(false);
    }

    @Test
    @Order(1)
    void loginPageIsPublicAndAdminPagesRequireLogin() throws Exception {
        mvc.perform(get("/login")).andExpect(status().isOk());
        mvc.perform(get("/admin/posts")).andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrlPattern("**/login"));
        mvc.perform(get("/api/public/categories")).andExpect(status().isOk());
        // 열어 둔 화면의 로그인 확인: 풀렸으면 로그인 화면 대신 401, 살아 있으면 새 보안 토큰
        mvc.perform(get("/admin/session")).andExpect(status().isUnauthorized());
    }

    @Test
    @Order(2)
    void initialSuperAdminCanLoginAndSeeDashboard() throws Exception {
        MockHttpSession session = login();
        mvc.perform(get("/admin").session(session)).andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("누적 방문수")));
        mvc.perform(get("/admin/users").session(session)).andExpect(status().isOk());
        mvc.perform(get("/admin/session").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.header").value("X-CSRF-TOKEN"))
                .andExpect(jsonPath("$.parameter").value("_csrf"));
    }

    @Test
    @Order(3)
    void categoryPostPreviewPublishAndPublicApiFlow() throws Exception {
        MockHttpSession session = login();

        // 카테고리는 Flyway(V7)로 심은 2단 구조만 쓴다(조회 전용) — 관리 URL 은 없다
        mvc.perform(get("/admin/categories").session(session)).andExpect(status().isNotFound());
        mvc.perform(get("/api/public/categories")).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$[0].slug").value("review"))
                .andExpect(jsonPath("$[0].children.length()").value(5))   // 2026-10-14: 취업·진로 → 취업 성공 · 진로 고민
                .andExpect(jsonPath("$[0].children[3].slug").value("review-job")).andExpect(jsonPath("$[0].children[4].slug").value("review-path"))
                .andExpect(jsonPath("$[0].children[0].slug").value("review-life"))
                .andExpect(jsonPath("$[3].slug").value("cohort"))
                .andExpect(jsonPath("$[3].children[2].name").value("7기"))
                .andExpect(jsonPath("$[1].children.length()").value(0));
        String categoryId = String.valueOf(jdbc.queryForObject("SELECT id FROM categories WHERE slug = 'review'", Long.class));
        String subId = String.valueOf(jdbc.queryForObject("SELECT id FROM categories WHERE slug = 'review-life'", Long.class));
        String wrongSubId = String.valueOf(jdbc.queryForObject("SELECT id FROM categories WHERE slug = 'cohort-7'", Long.class));

        // 게시물 등록 (임시저장) — 스크립트가 포함된 인라인 HTML 은 정화되어야 한다
        String blocks = """
            [{"type":"heading","level":2,"html":"첫 <b>글</b><script>alert(1)</script>"},
             {"type":"paragraph","align":"center","html":"<span style=\\"color: #dc2626; position: absolute;\\">빨간</span> 글자"},
             {"type":"list","style":"number","items":["하나","<i>둘</i>"]},
             {"type":"image","url":"javascript:alert(1)","alt":"x","caption":"","width":"full"},
             {"type":"divider"}]
            """;
        MvcResult created = mvc.perform(post("/admin/posts").session(session).with(csrf())
                        .param("title", "테스트 게시물").param("categoryId", categoryId).param("subCategoryId", subId).param("status", "DRAFT")
                        .param("thumbnailMode", "AUTO").param("blocksJson", blocks))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrlPattern("/admin/posts/*/edit"))
                .andReturn();
        String postId = created.getResponse().getRedirectedUrl().replaceAll("\\D", "");

        // 글 관리 목록: 카테고리 › 세부 표시, 카테고리/세부 필터
        String list0 = mvc.perform(get("/admin/posts").session(session).param("categoryId", categoryId).param("subCategoryId", subId))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(list0).contains("후기 › 생활").contains("id=\"filterSubCategory\"");
        assertThat(mvc.perform(get("/admin/posts").session(session).param("subCategoryId", wrongSubId))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8)).doesNotContain("테스트 게시물");
        // 검색어로 작성자(이름·이메일)도 찾는다 · 작성자 링크(authorId)로 좁히기
        String adminName = jdbc.queryForObject("SELECT name FROM admin_users WHERE login_id = 'admin'", String.class);
        assertThat(mvc.perform(get("/admin/posts").session(session).param("keyword", adminName))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8)).contains("테스트 게시물");
        assertThat(mvc.perform(get("/admin/posts").session(session).param("keyword", "없는작성자"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8)).doesNotContain("테스트 게시물");
        assertThat(mvc.perform(get("/admin/posts").session(session).param("authorId", "1"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8)).contains("테스트 게시물");
        assertThat(mvc.perform(get("/admin/posts").session(session).param("authorId", "999"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8)).doesNotContain("테스트 게시물");

        // 미리보기: 허용 서식 유지, script·위험 스타일·javascript: 이미지 제거
        String preview = mvc.perform(get("/admin/posts/" + postId + "/preview").session(session))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(preview).contains("첫 <b>글</b>")
                .contains("color: #dc2626")
                .doesNotContain("<script>")
                .doesNotContain("position: absolute")
                .doesNotContain("javascript:alert")
                .contains("<ol>").contains("<i>둘</i>")
                .contains("저장된 내용 미리보기");

        // 임시저장 상태는 공개 API 에 노출되지 않음
        mvc.perform(get("/api/public/posts")).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/public/posts/" + postId)).andExpect(status().isNotFound());

        // 게시 → 공개 API 노출, 조회수 집계
        mvc.perform(post("/admin/posts/" + postId + "/status").session(session).with(csrf()).param("status", "PUBLISHED"))
                .andExpect(status().is3xxRedirection());
        mvc.perform(get("/api/public/posts")).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].title").value("테스트 게시물"))
                .andExpect(jsonPath("$.items[0].categorySlug").value("review"))
                .andExpect(jsonPath("$.items[0].subCategorySlug").value("review-life"));
        mvc.perform(get("/api/public/posts").param("category", "review").param("sub", "review-life")).andExpect(jsonPath("$.total").value(1));
        mvc.perform(get("/api/public/posts").param("category", "review").param("sub", "review-class")).andExpect(jsonPath("$.total").value(0));
        mvc.perform(get("/api/public/posts").param("category", "cohort")).andExpect(jsonPath("$.total").value(0));
        mvc.perform(post("/api/public/track/posts/" + postId + "/view").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"visitorKey\":\"v1\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.ok").value(true));
        mvc.perform(post("/api/public/track/visit").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"visitorKey\":\"v1\",\"path\":\"/\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/public/posts/" + postId)).andExpect(status().isOk())
                .andExpect(jsonPath("$.viewCount").value(1))
                .andExpect(jsonPath("$.blocks[0].type").value("heading"));

        // 통계 화면
        String stats = mvc.perform(get("/admin/stats").session(session)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(stats).contains("테스트 게시물");

        // 버전 이력: 등록(저장) 1건 → 수정 후 2건, 첫 버전으로 복원하면 백업+복원 이력이 추가되고 제목이 되돌아간다
        String v1 = mvc.perform(get("/admin/posts/" + postId + "/versions").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].reason").value("MANUAL_DRAFT"))
                .andExpect(jsonPath("$[0].title").value("테스트 게시물"))
                .andReturn().getResponse().getContentAsString().replaceAll(".*?\"id\":(\\d+).*", "$1");
        mvc.perform(post("/admin/posts/" + postId).session(session).with(csrf())
                        .param("title", "수정된 제목").param("categoryId", categoryId).param("subCategoryId", wrongSubId).param("status", "PUBLISHED")
                        .param("thumbnailMode", "AUTO").param("blocksJson", blocks))
                .andExpect(status().is3xxRedirection());
        // 다른 카테고리의 세부(7기)를 후기에 붙이면 저장 시 비워진다
        mvc.perform(get("/api/public/posts/" + postId)).andExpect(jsonPath("$.subCategory").value(org.hamcrest.Matchers.nullValue()));
        mvc.perform(get("/admin/posts/" + postId + "/versions").session(session))
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].reason").value("PUBLISH"));
        mvc.perform(get("/admin/posts/" + postId + "/versions/" + v1).session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("테스트 게시물"))
                .andExpect(jsonPath("$.blocks[0].type").value("heading"));
        mvc.perform(post("/admin/posts/" + postId + "/versions/" + v1 + "/restore").session(session).with(csrf()))
                .andExpect(status().is3xxRedirection())
                .andExpect(header().string("Location", "/admin/posts/" + postId + "/edit"));
        mvc.perform(get("/admin/posts/" + postId + "/versions").session(session))
                .andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$[0].reason").value("RESTORE"))
                .andExpect(jsonPath("$[1].reason").value("RESTORE_BACKUP"));
        assertThat(mvc.perform(get("/admin/posts/" + postId + "/edit").session(session)).andReturn().getResponse().getContentAsString())
                .contains("테스트 게시물");

        // 휴지통으로 이동(soft) → 상태는 미게시(HIDDEN)로 바뀌고 이전 상태(게시중)가 기록된다. 목록·공개 API 에서 제외
        mvc.perform(post("/admin/posts/" + postId + "/delete").session(session).with(csrf()))
                .andExpect(status().is3xxRedirection());
        mvc.perform(get("/api/public/posts")).andExpect(jsonPath("$.total").value(0));
        String trashPage = mvc.perform(get("/admin/posts/trash").session(session)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(trashPage).contains("복원").contains("미게시").contains("삭제 전 게시중");
        assertThat(jdbc.queryForObject("SELECT status FROM posts WHERE id = " + postId, String.class)).isEqualTo("HIDDEN");
        assertThat(jdbc.queryForObject("SELECT status_before_trash FROM posts WHERE id = " + postId, String.class)).isEqualTo("PUBLISHED");

        // 복원 → 휴지통으로 옮기기 전 상태(게시중)로 돌아와 다시 공개 API 에 노출
        mvc.perform(post("/admin/posts/" + postId + "/restore").session(session).with(csrf()))
                .andExpect(status().is3xxRedirection())
                .andExpect(header().string("Location", "/admin/posts"));
        mvc.perform(get("/api/public/posts")).andExpect(jsonPath("$.total").value(1));
        assertThat(jdbc.queryForObject("SELECT status FROM posts WHERE id = " + postId, String.class)).isEqualTo("PUBLISHED");
        // 미게시 → 휴지통 → 복원하면 미게시 그대로
        mvc.perform(post("/admin/posts/" + postId + "/status").session(session).with(csrf()).param("status", "HIDDEN"))
                .andExpect(status().is3xxRedirection());
        mvc.perform(post("/admin/posts/" + postId + "/delete").session(session).with(csrf()))
                .andExpect(status().is3xxRedirection());
        mvc.perform(post("/admin/posts/" + postId + "/restore").session(session).with(csrf()))
                .andExpect(status().is3xxRedirection());
        assertThat(jdbc.queryForObject("SELECT status FROM posts WHERE id = " + postId, String.class)).isEqualTo("HIDDEN");
        mvc.perform(post("/admin/posts/" + postId + "/status").session(session).with(csrf()).param("status", "PUBLISHED"))
                .andExpect(status().is3xxRedirection());
        mvc.perform(get("/api/public/posts")).andExpect(jsonPath("$.total").value(1));

        // 다시 휴지통 → 완전 삭제 → 어디에서도 조회 불가
        mvc.perform(post("/admin/posts/" + postId + "/delete").session(session).with(csrf()))
                .andExpect(status().is3xxRedirection());
        mvc.perform(post("/admin/posts/" + postId + "/purge").session(session).with(csrf()))
                .andExpect(status().is3xxRedirection())
                .andExpect(header().string("Location", "/admin/posts/trash"));
        mvc.perform(get("/admin/posts/" + postId + "/edit").session(session)).andExpect(status().isNotFound());
        mvc.perform(get("/api/public/posts")).andExpect(jsonPath("$.total").value(0));
    }

    @Test
    @Order(4)
    void templatesAreManagedInAdminPageAndLoadedViaApiWithLayout() throws Exception {
        MockHttpSession session = login();
        String blocksJson = "[{\"type\":\"heading\",\"level\":2,\"html\":\"<span style=\\\"font-family: 'Nanum Myeongjo'; position: absolute\\\">제목</span>\"},{\"type\":\"image\",\"url\":\"\",\"alt\":\"\",\"caption\":\"\",\"width\":\"full\"},{\"type\":\"divider\"}]";
        String layout = "{\"preset\":\"side-right\",\"sidebar\":[\"toc\",\"author\"],\"footer\":[\"share\"]}";

        // 템플릿 관리 화면: 목록 · 새 템플릿 폼 · 저장(form POST)
        mvc.perform(get("/admin/templates").session(session)).andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("새 템플릿")));
        mvc.perform(get("/admin/templates/new").session(session)).andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("id=\"layoutPanel\"")));
        mvc.perform(post("/admin/templates").session(session).with(csrf())
                        .param("name", "공지 기본형").param("titleHint", "[공지] ").param("blocksJson", blocksJson).param("layoutJson", layout))
                .andExpect(status().is3xxRedirection()).andExpect(redirectedUrl("/admin/templates"));
        String list = mvc.perform(get("/admin/templates").session(session)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(list).contains("공지 기본형").contains("우 사이드바");
        // 이름 없는 저장은 폼으로 되돌아오며 오류 표시
        mvc.perform(post("/admin/templates").session(session).with(csrf()).param("name", " ").param("blocksJson", blocksJson))
                .andExpect(status().isOk()).andExpect(content().string(org.hamcrest.Matchers.containsString("템플릿 이름을 입력하세요")));

        // 글쓰기 패널이 쓰는 JSON API: 목록 · 상세(레이아웃 포함) — 빈 주소의 '사진 자리' 블록은 유지, 위험한 style 은 제거
        String api = mvc.perform(get("/admin/templates/api").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].blockCount").value(3))
                .andExpect(jsonPath("$[0].layoutPreset").value("side-right"))
                .andReturn().getResponse().getContentAsString();
        String id = api.replaceAll(".*?\"id\":(\\d+).*", "$1");
        String loaded = mvc.perform(get("/admin/templates/api/" + id).session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.layout.preset").value("side-right"))
                .andExpect(jsonPath("$.blocks[1].type").value("image"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(loaded).contains("Nanum Myeongjo").doesNotContain("position").contains("\"layoutJson\"");

        // 템플릿 미리보기는 레이아웃대로(2단) 그려지고, 빈 사진 자리는 그리지 않는다
        String preview = mvc.perform(get("/admin/templates/" + id + "/preview").session(session)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(preview).contains("lo-side-right").contains("템플릿 미리보기").doesNotContain("blk-image");

        // 수정 화면 · 수정 저장 · 삭제
        mvc.perform(get("/admin/templates/" + id + "/edit").session(session)).andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("공지 기본형")));
        mvc.perform(post("/admin/templates/" + id).session(session).with(csrf())
                        .param("name", "공지 기본형 v2").param("blocksJson", blocksJson).param("layoutJson", ""))
                .andExpect(status().is3xxRedirection());
        mvc.perform(get("/admin/templates/api/" + id).session(session))
                .andExpect(jsonPath("$.name").value("공지 기본형 v2"))
                .andExpect(jsonPath("$.layout.preset").value("basic"));
        mvc.perform(post("/admin/templates/" + id + "/delete").session(session).with(csrf())).andExpect(status().is3xxRedirection());
        mvc.perform(get("/admin/templates/api/" + id).session(session)).andExpect(status().isNotFound());
    }

    @Test
    @Order(5)
    void imageUploadRejectsNonImagesAndAcceptsPng() throws Exception {
        MockHttpSession session = login();
        var fake = new MockMultipartFile("file", "evil.png", "image/png", "not an image".getBytes());
        mvc.perform(MockMvcRequestBuilders.multipart("/admin/images").file(fake).session(session).with(csrf()))
                .andExpect(status().isBadRequest());

        byte[] png = java.util.Base64.getDecoder().decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");
        var real = new MockMultipartFile("file", "dot.png", "image/png", png);
        mvc.perform(MockMvcRequestBuilders.multipart("/admin/images").file(real).session(session).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.url").value(org.hamcrest.Matchers.startsWith("/uploads/")));
    }

    @Test
    @Order(8)
    void postLayoutIsSavedRenderedInPreviewAndExposedByPublicApi() throws Exception {
        MockHttpSession session = login();
        String blocks = "[{\"type\":\"heading\",\"level\":2,\"html\":\"첫 소제목\"},{\"type\":\"paragraph\",\"align\":\"left\",\"html\":\"본문\"}]";
        String layout = "{\"preset\":\"side-right\",\"align\":\"left\",\"width\":\"wide\",\"header\":[\"title\",\"meta\"],\"sidebar\":[\"toc\",\"author\"],\"footer\":[\"share\"],\"junk\":1}";
        MvcResult created = mvc.perform(post("/admin/posts").session(session).with(csrf())
                        .param("title", "레이아웃 글").param("status", "PUBLISHED").param("thumbnailMode", "AUTO")
                        .param("blocksJson", blocks).param("layoutJson", layout))
                .andExpect(status().is3xxRedirection()).andReturn();
        String postId = created.getResponse().getRedirectedUrl().replaceAll("\\D", "");

        // 편집 화면에 저장된 레이아웃이 hidden input 으로 다시 실린다
        String edit = mvc.perform(get("/admin/posts/" + postId + "/edit").session(session)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(edit).contains("id=\"layoutJson\"").contains("side-right").doesNotContain("btnLayout");

        // 미리보기: 2단 우측 사이드바 + 목차 위젯(제목 블록 앵커) + 하단 공유, 요약은 머리에서 제외
        String preview = mvc.perform(get("/admin/posts/" + postId + "/preview").session(session)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(preview).contains("lo-side-right lo-align-left lo-width-wide")
                .contains("class=\"f-side\"").contains("href=\"#h-0\"").contains("첫 소제목")
                .contains("f-w-share").contains("f-foot-widgets")
                .doesNotContain("class=\"summary\"");

        // 공개 API 에 정리된 layout 과 toc 가 실린다 (모르는 키 junk 는 제거)
        mvc.perform(get("/api/public/posts/" + postId)).andExpect(status().isOk())
                .andExpect(jsonPath("$.layout.preset").value("side-right"))
                .andExpect(jsonPath("$.layout.sidebar[0]").value("toc"))
                .andExpect(jsonPath("$.layout.junk").doesNotExist())
                .andExpect(jsonPath("$.toc[0].text").value("첫 소제목"))
                .andExpect(jsonPath("$.toc[0].index").value(0));

        // 레이아웃을 비우면 기본값(1단)으로 돌아간다
        mvc.perform(post("/admin/posts/" + postId).session(session).with(csrf())
                        .param("title", "레이아웃 글").param("status", "PUBLISHED").param("thumbnailMode", "AUTO")
                        .param("blocksJson", blocks).param("layoutJson", ""))
                .andExpect(status().is3xxRedirection());
        mvc.perform(get("/api/public/posts/" + postId)).andExpect(jsonPath("$.layout.preset").value("basic"));
    }

    @Test
    @Order(9)
    void superAdminNoticesShowForEveryoneAndCanBeDismissedPerUser() throws Exception {
        MockHttpSession session = login();
        // 작성 → 모든 관리자 화면 상단에 표시
        mvc.perform(post("/admin/notices").session(session).with(csrf())
                        .param("title", "10/15 22시 서버 점검").param("body", "글 저장이 잠시 안 됩니다").param("level", "WARN").param("active", "true"))
                .andExpect(status().is3xxRedirection());
        String posts = mvc.perform(get("/admin/posts").session(session)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(posts).contains("notice-band").contains("10/15 22시 서버 점검").contains("nl-warn");
        long noticeId = jdbc.queryForObject("SELECT id FROM notices WHERE title = '10/15 22시 서버 점검'", Long.class);

        // 닫기 → 나에게만 사라진다 · 수정하면 다시 보인다
        mvc.perform(post("/admin/notices/" + noticeId + "/dismiss").session(session).with(csrf()).param("back", "/admin/posts"))
                .andExpect(status().is3xxRedirection()).andExpect(redirectedUrl("/admin/posts"));
        assertThat(mvc.perform(get("/admin/posts").session(session)).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8))
                .doesNotContain("10/15 22시 서버 점검");
        mvc.perform(post("/admin/notices/" + noticeId).session(session).with(csrf())
                        .param("title", "10/15 22시 서버 점검 (변경)").param("level", "URGENT").param("active", "true"))
                .andExpect(status().is3xxRedirection());
        assertThat(mvc.perform(get("/admin/posts").session(session)).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("10/15 22시 서버 점검 (변경)").contains("nl-urgent");

        // 고정 공지는 닫아도 남는다 · 내리면 사라진다
        mvc.perform(post("/admin/notices").session(session).with(csrf())
                        .param("title", "항상 보이는 안내").param("pinned", "true").param("active", "true"))
                .andExpect(status().is3xxRedirection());
        long pinnedId = jdbc.queryForObject("SELECT id FROM notices WHERE title = '항상 보이는 안내'", Long.class);
        mvc.perform(post("/admin/notices/" + pinnedId + "/dismiss").session(session).with(csrf())).andExpect(status().is3xxRedirection());
        assertThat(mvc.perform(get("/admin").session(session)).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("항상 보이는 안내");
        mvc.perform(post("/admin/notices/" + pinnedId + "/toggle").session(session).with(csrf()).param("active", "false"))
                .andExpect(status().is3xxRedirection());
        assertThat(mvc.perform(get("/admin").session(session)).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8))
                .doesNotContain("항상 보이는 안내");
        mvc.perform(post("/admin/notices/" + noticeId + "/delete").session(session).with(csrf())).andExpect(status().is3xxRedirection());
        mvc.perform(post("/admin/notices/" + pinnedId + "/delete").session(session).with(csrf())).andExpect(status().is3xxRedirection());
    }

    @Test
    @Order(10)
    void assetsAcceptVideoAndPdfAndCanBeRenamed() throws Exception {
        MockHttpSession session = login();
        // 가짜 MP4(ftyp 시그니처) · PDF · 허용되지 않는 형식
        byte[] mp4 = new byte[64];
        mp4[4] = 'f'; mp4[5] = 't'; mp4[6] = 'y'; mp4[7] = 'p'; mp4[8] = 'i'; mp4[9] = 's'; mp4[10] = 'o'; mp4[11] = 'm';
        String video = mvc.perform(MockMvcRequestBuilders.multipart("/admin/images")
                        .file(new MockMultipartFile("file", "수료식.mp4", "video/mp4", mp4)).session(session).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kind").value("VIDEO"))
                .andExpect(jsonPath("$.url").value(org.hamcrest.Matchers.endsWith(".mp4")))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        long videoId = objectMapper.readTree(video).get("id").asLong();
        mvc.perform(MockMvcRequestBuilders.multipart("/admin/images")
                        .file(new MockMultipartFile("file", "안내.pdf", "application/pdf", "%PDF-1.4 fake".getBytes())).session(session).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.kind").value("DOC"));
        mvc.perform(MockMvcRequestBuilders.multipart("/admin/images")
                        .file(new MockMultipartFile("file", "x.exe", "application/octet-stream", "MZ...".getBytes())).session(session).with(csrf()))
                .andExpect(status().isBadRequest());

        // 에디터 보관함(recent)은 기본 이미지만 · kind=ALL 이면 동영상도
        mvc.perform(get("/admin/images/recent").session(session))
                .andExpect(jsonPath("$[?(@.kind == 'VIDEO')]").isEmpty());
        mvc.perform(get("/admin/images/recent").param("kind", "ALL").session(session))
                .andExpect(jsonPath("$[?(@.id == " + videoId + ")]").isNotEmpty());

        // 자산 관리 화면: 종류 탭·등록자, 표시 이름 변경(URL 은 그대로)
        String page = mvc.perform(get("/admin/media").param("kind", "VIDEO").session(session)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(page).contains("수료식.mp4").contains("media-kinds").contains("<video");
        mvc.perform(post("/admin/media/" + videoId + "/rename").session(session).with(csrf()).param("displayName", "7기 수료식 영상"))
                .andExpect(status().is3xxRedirection());
        mvc.perform(get("/admin/images/recent").param("kind", "VIDEO").session(session))
                .andExpect(jsonPath("$[0].name").value("7기 수료식 영상"))
                .andExpect(jsonPath("$[0].originalName").value("수료식.mp4"))
                .andExpect(jsonPath("$[0].url").value(org.hamcrest.Matchers.endsWith(".mp4")));
        mvc.perform(post("/admin/media/" + videoId + "/rename").session(session).with(csrf()).param("displayName", " "))
                .andExpect(status().is3xxRedirection());   // 빈 이름은 오류 토스트, 값 유지
        mvc.perform(get("/admin/images/recent").param("kind", "VIDEO").session(session))
                .andExpect(jsonPath("$[0].name").value("7기 수료식 영상"));
    }

    @Test
    @Order(7)
    void mediaLibraryUsesPostCategoriesForUploadMoveAndDelete() throws Exception {
        MockHttpSession session = login();
        byte[] png = java.util.Base64.getDecoder().decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");
        long review = jdbc.queryForObject("SELECT id FROM categories WHERE slug = 'review'", Long.class);
        long life = jdbc.queryForObject("SELECT id FROM categories WHERE slug = 'review-life'", Long.class);
        long cohort = jdbc.queryForObject("SELECT id FROM categories WHERE slug = 'cohort'", Long.class);
        long c7 = jdbc.queryForObject("SELECT id FROM categories WHERE slug = 'cohort-7'", Long.class);

        // 분류 트리는 게시물 카테고리와 같다(후기 › 생활… / 기수별 › 3~5기…)
        mvc.perform(get("/admin/images/categories").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.categories.length()").value(4))
                .andExpect(jsonPath("$.categories[0].name").value("후기"))
                .andExpect(jsonPath("$.categories[0].children[0].name").value("생활"))
                .andExpect(jsonPath("$.categories[3].children[2].name").value("7기"));

        // 후기 › 생활로 업로드 → 그 분류 목록에 나오고, 다른 분류·미분류에는 없다
        var real = new MockMultipartFile("file", "생활_사진.png", "image/png", png);
        String uploaded = mvc.perform(MockMvcRequestBuilders.multipart("/admin/images").file(real)
                        .param("categoryId", String.valueOf(review)).param("subCategoryId", String.valueOf(life)).session(session).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.categoryPath").value("후기 › 생활"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        long imageId = objectMapper.readTree(uploaded).get("id").asLong();
        mvc.perform(get("/admin/images/recent").param("categoryId", String.valueOf(review)).session(session))
                .andExpect(jsonPath("$[0].id").value(imageId));
        mvc.perform(get("/admin/images/recent").param("categoryId", String.valueOf(review)).param("subCategoryId", String.valueOf(life)).session(session))
                .andExpect(jsonPath("$[0].id").value(imageId));
        mvc.perform(get("/admin/images/recent").param("categoryId", String.valueOf(cohort)).session(session))
                .andExpect(jsonPath("$[?(@.id == " + imageId + ")]").isEmpty());
        mvc.perform(get("/admin/images/recent").param("unfiled", "true").session(session))
                .andExpect(jsonPath("$[?(@.id == " + imageId + ")]").isEmpty());
        // 어긋난 조합(후기 + 7기)은 세부가 비워진다 · 없는 카테고리는 404
        mvc.perform(MockMvcRequestBuilders.multipart("/admin/images").file(real)
                        .param("categoryId", String.valueOf(review)).param("subCategoryId", String.valueOf(c7)).session(session).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.subCategoryId").value(org.hamcrest.Matchers.nullValue()));
        mvc.perform(MockMvcRequestBuilders.multipart("/admin/images").file(real).param("categoryId", "99999").session(session).with(csrf()))
                .andExpect(status().isNotFound());

        // 관리 화면: 카테고리 탭·세부 탭·파일명
        String page = mvc.perform(get("/admin/media").param("cat", String.valueOf(review)).param("sub", String.valueOf(life)).session(session))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(page).contains("생활_사진.png").contains("media-subtabs").contains("기수별 모아보기").contains("취업 성공").contains("진로 고민");

        // 분류 이동(기수별 › 7기) → 미분류로 → 완전 삭제
        mvc.perform(post("/admin/media/" + imageId + "/move").session(session).with(csrf())
                        .param("categoryId", String.valueOf(cohort)).param("subCategoryId", String.valueOf(c7)))
                .andExpect(status().is3xxRedirection());
        mvc.perform(get("/admin/images/recent").param("subCategoryId", String.valueOf(c7)).param("categoryId", String.valueOf(cohort)).session(session))
                .andExpect(jsonPath("$[0].id").value(imageId)).andExpect(jsonPath("$[0].categoryPath").value("기수별 모아보기 › 7기"));
        mvc.perform(post("/admin/media/" + imageId + "/move").session(session).with(csrf()))
                .andExpect(status().is3xxRedirection());
        mvc.perform(get("/admin/images/recent").param("unfiled", "true").session(session))
                .andExpect(jsonPath("$[0].id").value(imageId));
        mvc.perform(post("/admin/media/" + imageId + "/delete").session(session).with(csrf()))
                .andExpect(status().is3xxRedirection());
        mvc.perform(get("/admin/images/recent").session(session))
                .andExpect(jsonPath("$[?(@.id == " + imageId + ")]").isEmpty());
    }

    @Test
    @Order(6)
    void superAdminManagesAccountsAndLastSuperAdminIsProtected() throws Exception {
        MockHttpSession session = login();
        mvc.perform(post("/admin/users").session(session).with(csrf())
                        .param("loginId", "Editor1@AICA-gj.kr").param("name", "편집자").param("role", "ADMIN")
                        .param("active", "true").param("password", "editor-pass-1"))
                .andExpect(status().is3xxRedirection());

        // 이메일 형식이 아니면 등록 거부, 저장은 소문자로 정규화
        assertThat(mvc.perform(post("/admin/users").session(session).with(csrf())
                        .param("loginId", "editor2").param("name", "x").param("role", "ADMIN").param("active", "true").param("password", "editor-pass-1"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8))
                .contains("이메일 주소 형식");
        assertThat(jdbc.queryForObject("SELECT login_id FROM admin_users WHERE name = '편집자'", String.class)).isEqualTo("editor1@aica-gj.kr");

        // 자기 자신(마지막 SUPER_ADMIN) 강등 시도 → 오류 메시지와 함께 폼 재표시
        String body = mvc.perform(post("/admin/users/1").session(session).with(csrf())
                        .param("loginId", "admin").param("name", "최초 관리자").param("role", "ADMIN").param("active", "true"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(body).contains("마지막 최상위 관리자");

        // 일반 관리자는 계정 관리 화면에 접근할 수 없다
        MvcResult editorLogin = mvc.perform(formLogin("/login").user("loginId", "editor1@aica-gj.kr").password("password", "editor-pass-1"))
                .andExpect(authenticated()).andReturn();
        MockHttpSession editor = (MockHttpSession) editorLogin.getRequest().getSession(false);
        mvc.perform(get("/admin/users").session(editor)).andExpect(status().isForbidden());
        mvc.perform(get("/admin/posts").session(editor)).andExpect(status().isOk());

        // SUPPORT 는 게시물 등록·수정만 가능: 삭제·상태 변경·카테고리 변경·통계는 403
        mvc.perform(post("/admin/users").session(session).with(csrf())
                        .param("loginId", "support1@aica-gj.kr").param("name", "서포터").param("role", "SUPPORT")
                        .param("active", "true").param("password", "support-pass-1"))
                .andExpect(status().is3xxRedirection());
        MockHttpSession support = (MockHttpSession) mvc.perform(
                        formLogin("/login").user("loginId", "support1@aica-gj.kr").password("password", "support-pass-1"))
                .andExpect(authenticated()).andReturn().getRequest().getSession(false);
        mvc.perform(get("/admin").session(support)).andExpect(redirectedUrl("/admin/posts"));
        MvcResult created = mvc.perform(post("/admin/posts").session(support).with(csrf())
                        .param("title", "서포터 글").param("status", "PENDING").param("thumbnailMode", "AUTO")
                        .param("blocksJson", "[{\"type\":\"paragraph\",\"align\":\"left\",\"html\":\"질문\"}]"))
                .andExpect(status().is3xxRedirection()).andReturn();
        String supportPostId = created.getResponse().getRedirectedUrl().replaceAll("\\D", "");
        mvc.perform(post("/admin/posts/" + supportPostId).session(support).with(csrf())
                        .param("title", "서포터 글 수정").param("status", "PENDING").param("thumbnailMode", "AUTO")
                        .param("blocksJson", "[{\"type\":\"paragraph\",\"align\":\"left\",\"html\":\"수정\"}]"))
                .andExpect(status().is3xxRedirection());
        mvc.perform(post("/admin/posts/" + supportPostId + "/delete").session(support).with(csrf()))
                .andExpect(status().isForbidden());
        mvc.perform(post("/admin/posts/" + supportPostId + "/status").session(support).with(csrf()).param("status", "PUBLISHED"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/admin/media/1/rename").session(support).with(csrf()).param("displayName", "x"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/admin/templates").session(support).with(csrf()).param("name", "x").param("blocksJson", "[]"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/admin/notices").session(support).with(csrf()).param("title", "x"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/admin/templates").session(support)).andExpect(status().isOk());
        mvc.perform(get("/admin/templates/api").session(support)).andExpect(status().isOk());
        mvc.perform(get("/admin/media").session(support)).andExpect(status().isOk());
        mvc.perform(get("/admin/stats").session(support)).andExpect(status().isForbidden());
        String list = mvc.perform(get("/admin/posts").session(support)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(list).contains("서포터 글 수정").contains("답변대기");
    }
}
