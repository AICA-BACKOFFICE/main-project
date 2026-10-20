package egovframework.backoffice;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.authenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import egovframework.backoffice.post.PostTrashService;
import egovframework.testsupport.CmsMockMvcConfig;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringJUnitWebConfig({BackofficeApplication.class, CmsMockMvcConfig.class})
@TestPropertySource(properties = {
    "datasource.url=jdbc:h2:mem:role-permissions-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
    "backoffice.pages.site-root=${java.io.tmpdir}/aica-role-permissions/site",
    "backoffice.pages.data-dir=${java.io.tmpdir}/aica-role-permissions/pages",
    "backoffice.upload-dir=${java.io.tmpdir}/aica-role-permissions/uploads",
    "backoffice.initial-admin.password=role-test-owner-password"
})
@Transactional
class RolePermissionsWebTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired PostTrashService trash;
    @Autowired org.apache.ibatis.session.SqlSessionFactory sqlSessionFactory;
    MockHttpSession owner, admin, support;
    long adminId, supportId;

    private void clearMapperCache() {
        var session = org.mybatis.spring.SqlSessionUtils.getSqlSession(sqlSessionFactory);
        try { session.clearCache(); }
        finally { org.mybatis.spring.SqlSessionUtils.closeSqlSession(session, sqlSessionFactory); }
    }

    private MockHttpSession login(String email, String password) throws Exception {
        return (MockHttpSession) mvc.perform(formLogin("/login").user("loginId", email).password("password", password))
                .andExpect(authenticated()).andReturn().getRequest().getSession(false);
    }

    @BeforeEach void createAndSignInTestAccounts() throws Exception {
        owner = login("admin", "role-test-owner-password");
        for (String role : new String[]{"ADMIN", "SUPPORT"}) {
            mvc.perform(post("/admin/users").session(owner).with(csrf()).param("loginId", role.toLowerCase() + "@roles.example.test")
                    .param("name", "권한 검증 " + role).param("role", role).param("active", "true").param("password", "role-test-account-password"))
                    .andExpect(status().is3xxRedirection());
        }
        admin = login("admin@roles.example.test", "role-test-account-password");
        support = login("support@roles.example.test", "role-test-account-password");
        adminId = jdbc.queryForObject("SELECT id FROM admin_users WHERE login_id='admin@roles.example.test'", Long.class);
        supportId = jdbc.queryForObject("SELECT id FROM admin_users WHERE login_id='support@roles.example.test'", Long.class);
    }

    /** 후기 표에 글 한 줄(분야 생활) */
    private void postRow(long id, long author, boolean deleted) {
        jdbc.update("INSERT INTO reviews(id,category,title,author_id,status,deleted_at,status_before_trash) VALUES(?,'생활',?,?," + (deleted ? "'DELETED',CURRENT_TIMESTAMP,'DRAFT'" : "'DRAFT',NULL,NULL") + ")", id, "권한 검증 글 " + id, author);
    }

    private static final String DRAFT_STORY = "{\"cat\":\"life\",\"author\":\"권한\"}";
    private static final String FULL_STORY = "{\"cat\":\"life\",\"cohort\":6,\"author\":\"권한\",\"summary\":\"요약\",\"body\":[\"본문\"]}";

    @Test void supporterCanOnlyEditOwnPostsIncludingAlreadyPublishedContent() throws Exception {
        postRow(91001, supportId, false); postRow(91002, adminId, false);
        mvc.perform(get("/admin/posts/review/91001/edit").session(support)).andExpect(status().isOk());
        mvc.perform(get("/admin/posts/review/91002/edit").session(support)).andExpect(status().isForbidden());
        mvc.perform(post("/admin/posts/review/91002").session(support).with(csrf()).param("title", "forbidden").param("categoryId", "1").param("status", "DRAFT")
                        .param("blocksJson", "[]").param("storyJson", DRAFT_STORY))
                .andExpect(status().isForbidden());
        mvc.perform(post("/admin/posts/review/91002").session(support).with(csrf()).param("title", ""))
                .andExpect(status().isForbidden());
        jdbc.update("UPDATE reviews SET status='PUBLISHED' WHERE id=91001");
        clearMapperCache();
        mvc.perform(post("/admin/posts/review/91001").session(support).with(csrf()).param("title", "본인 게시글 수정").param("categoryId", "1").param("status", "PUBLISHED")
                        .param("blocksJson", "[]").param("storyJson", FULL_STORY))
                .andExpect(status().is3xxRedirection());
        assertThat(jdbc.queryForObject("SELECT title FROM reviews WHERE id=91001", String.class)).isEqualTo("본인 게시글 수정");
        mvc.perform(post("/admin/posts/review/91001").session(support).with(csrf()).param("title", "state change").param("categoryId", "1").param("status", "HIDDEN")
                        .param("blocksJson", "[]").param("storyJson", FULL_STORY))
                .andExpect(status().isForbidden());
        mvc.perform(post("/admin/posts").session(support).with(csrf()).param("title", "신규 초안").param("categoryId", "1").param("status", "DRAFT")
                        .param("blocksJson", "[]").param("storyJson", DRAFT_STORY))
                .andExpect(status().is3xxRedirection());
        mvc.perform(post("/admin/posts/review/91002").session(admin).with(csrf()).param("title", "관리자 수정").param("categoryId", "1").param("status", "DRAFT")
                        .param("blocksJson", "[]").param("storyJson", DRAFT_STORY))
                .andExpect(status().is3xxRedirection());
    }

    @Test void purgeIsHighestAdminOnlyWhileAdminCanTrashAndRestore() throws Exception {
        postRow(91011, supportId, false); postRow(91012, supportId, true);
        mvc.perform(post("/admin/posts/review/91011/delete").session(support).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(post("/admin/posts/review/91011/delete").session(admin).with(csrf())).andExpect(status().is3xxRedirection());
        mvc.perform(post("/admin/posts/review/91011/restore").session(admin).with(csrf())).andExpect(status().is3xxRedirection());
        mvc.perform(post("/admin/posts/review/91012/purge").session(admin).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(post("/admin/posts/trash/bulk").session(admin).with(csrf()).param("action", "purge").param("ids", "review-91012"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/admin/posts/trash/empty").session(admin).with(csrf()).param("snapshot", trash.overview().token()))
                .andExpect(status().isForbidden());
        String page = mvc.perform(get("/admin/posts/trash").session(admin)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(page).contains("선택 복원").doesNotContain("id=\"trash-empty-form\"", "data-trash-action=\"purge\"", "/91012/purge");
        mvc.perform(post("/admin/posts/review/91012/purge").session(owner).with(csrf())).andExpect(status().is3xxRedirection());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM reviews WHERE id=91012", Long.class)).isZero();
    }

    @Test void dashboardIsSharedAndSiteAndAccountAdministrationRemainRestricted() throws Exception {
        for (MockHttpSession session : new MockHttpSession[]{owner, admin, support}) {
            mvc.perform(get("/admin").session(session)).andExpect(status().isOk());
        }
        for (MockHttpSession session : new MockHttpSession[]{owner, admin}) {
            mvc.perform(get("/admin/pages/about/edit").session(session)).andExpect(status().isOk());
            mvc.perform(get("/admin/faq").session(session)).andExpect(status().isOk());
        }
        for (String path : new String[]{"/admin/pages/about/edit", "/admin/faq", "/admin/pages/life-photos", "/admin/pages/api/state?page=about", "/admin/users"}) {
            mvc.perform(get(path).session(support)).andExpect(status().isForbidden());
        }
        mvc.perform(get("/admin/users").session(admin)).andExpect(status().isForbidden());
        for (MockHttpSession session : new MockHttpSession[]{admin, support}) {
            mvc.perform(post("/admin/users").session(session).with(csrf()).param("loginId", "denied@example.test")).andExpect(status().isForbidden());
        }
    }

    @Test void allRolesCanUploadPhotosForTheirPosts() throws Exception {
        byte[] png = {(byte)137,80,78,71,13,10,26,10,0,0,0,13};
        for (MockHttpSession session : new MockHttpSession[]{owner, admin, support}) {
            mvc.perform(multipart("/admin/images").file(new MockMultipartFile("file", "role-test.png", "image/png", png)).session(session).with(csrf()))
                    .andExpect(status().isOk());
            // 미디어 관리 화면은 없어졌다(사진은 글에 올린 파일로만)
            mvc.perform(get("/admin/media").session(session)).andExpect(status().isNotFound());
        }
    }

    @Test void roleChangesAndDeactivationTakeEffectForExistingSessions() throws Exception {
        jdbc.update("UPDATE admin_users SET role='SUPPORT' WHERE id=?", adminId);
        clearMapperCache();
        mvc.perform(get("/admin/posts/trash").session(admin)).andExpect(status().isForbidden());
        mvc.perform(get("/admin").session(admin)).andExpect(status().isOk());
        jdbc.update("UPDATE admin_users SET active=false WHERE id=?", supportId);
        clearMapperCache();
        mvc.perform(get("/admin").session(support)).andExpect(status().is3xxRedirection());
    }
}
