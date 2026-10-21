package egovframework.backoffice.account;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.authenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import egovframework.backoffice.BackofficeApplication;
import egovframework.testsupport.CmsMockMvcConfig;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 내 정보 수정(/account/profile): 로그인한 사람이 자기 이름과 비밀번호를 바꾼다. 이름은 바로 화면 위 프로필에도 바뀐다.
 * 프로필 메뉴 · 왼쪽 메뉴 관리에는 '계정 관리'(최상위 관리자) · '내 정보 수정'이 있고 '비밀번호 변경' · '관리자 계정'은 없다.
 */
@TestPropertySource(properties = {
        "datasource.url=jdbc:h2:mem:backoffice-profile-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "backoffice.pages.site-root=${java.io.tmpdir}/aica-profile-test/site",
        "backoffice.pages.data-dir=${java.io.tmpdir}/aica-profile-test/data",
        "backoffice.upload-dir=${java.io.tmpdir}/aica-profile-test/uploads",
        "backoffice.initial-admin.password=test-pass-1234"
})
@SpringJUnitWebConfig({BackofficeApplication.class, CmsMockMvcConfig.class})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class ProfileWebTest {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    private MockHttpSession login(String id, String password) throws Exception {
        return (MockHttpSession) mvc.perform(formLogin("/login").user("loginId", id).password("password", password))
                .andExpect(authenticated()).andReturn().getRequest().getSession(false);
    }

    private String page(MockHttpSession session, String url) throws Exception {
        return mvc.perform(get(url).session(session)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8);
    }

    @Test
    @Order(1)
    void everyoneChangesTheirOwnNameAndPasswordOnMyInfo() throws Exception {
        MockHttpSession admin = login("admin", "test-pass-1234");

        // 메뉴: 프로필 메뉴와 왼쪽 관리 메뉴에 '내 정보 수정' · '계정 관리', '비밀번호 변경' · '관리자 계정'은 없음
        String home = page(admin, "/admin");
        assertThat(home).contains("href=\"/account/profile\"").contains("내 정보 수정").contains("계정 관리")
                .doesNotContain("비밀번호 변경</a>").doesNotContain("관리자 계정</a>").doesNotContain("href=\"/account/password\"");
        // 예전 비밀번호 변경 주소는 내 정보 수정으로
        mvc.perform(get("/account/password").session(admin)).andExpect(redirectedUrl("/account/profile#password"));

        String profile = page(admin, "/account/profile");
        assertThat(profile).contains("내 정보 수정").contains("아이디(이메일)").contains("admin").contains("name=\"name\"")
                .contains("현재 비밀번호").contains("변경 후 다시 로그인");
        // 배치: 내 정보 · 아이디 변경이 위 줄, 비밀번호 변경이 아래 줄(두 칸 격자)
        assertThat(profile).contains("class=\"profile-grid\"").contains("class=\"card wide-card\" id=\"password\"");
        assertThat(profile.indexOf("<b>아이디 변경</b>")).isBetween(profile.indexOf("<b>내 정보</b>"), profile.indexOf("<b>비밀번호 변경</b>"));

        // 이름 바꾸기 → DB · 화면 위 프로필 바로
        mvc.perform(post("/account/profile/name").session(admin).with(csrf()).param("name", "  홍길동   관리자 "))
                .andExpect(redirectedUrl("/account/profile"));
        assertThat(jdbc.queryForObject("SELECT name FROM admin_users WHERE login_id = 'admin'", String.class)).isEqualTo("홍길동 관리자");
        assertThat(page(admin, "/admin")).contains("<b>홍길동 관리자</b>");
        // 빈 이름은 안 받음
        assertThat(mvc.perform(post("/account/profile/name").session(admin).with(csrf()).param("name", "   "))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8)).contains("이름을 입력하세요.");
        assertThat(jdbc.queryForObject("SELECT name FROM admin_users WHERE login_id = 'admin'", String.class)).isEqualTo("홍길동 관리자");

        // 서포터즈도 자기 이름을 바꾸고(계정 관리 메뉴는 없음)
        mvc.perform(post("/admin/users").session(admin).with(csrf()).param("loginId", "support@profile.example.test")
                .param("name", "서포터즈").param("role", "SUPPORT").param("active", "true").param("password", "profile-support-pass-1"))
                .andExpect(status().is3xxRedirection());
        MockHttpSession support = login("support@profile.example.test", "profile-support-pass-1");
        assertThat(page(support, "/admin")).contains("내 정보 수정").doesNotContain("계정 관리");
        mvc.perform(post("/account/profile/name").session(support).with(csrf()).param("name", "새 서포터즈"))
                .andExpect(redirectedUrl("/account/profile"));
        assertThat(jdbc.queryForObject("SELECT name FROM admin_users WHERE login_id = 'support@profile.example.test'", String.class)).isEqualTo("새 서포터즈");

        // 비밀번호: 현재 비밀번호가 틀리면 같은 화면에 안내, 맞으면 다시 로그인
        assertThat(mvc.perform(post("/account/password").session(admin).with(csrf()).param("currentPassword", "wrong-pass-0000")
                        .param("newPassword", "new-pass-5678").param("newPasswordConfirm", "new-pass-5678"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8)).contains("현재 비밀번호가 일치하지 않습니다.").contains("내 정보 수정");
        mvc.perform(post("/account/password").session(admin).with(csrf()).param("currentPassword", "test-pass-1234")
                        .param("newPassword", "new-pass-5678").param("newPasswordConfirm", "new-pass-5678"))
                .andExpect(redirectedUrl("/login"));
        login("admin", "new-pass-5678");
    }

    @Test
    @Order(2)
    void theLoginIdChangesInTheSameRowAfterCheckingThePassword() throws Exception {
        MockHttpSession admin = login("admin", "new-pass-5678");
        mvc.perform(post("/admin/users").session(admin).with(csrf()).param("loginId", "taken@profile.example.test")
                .param("name", "다른 계정").param("role", "SUPPORT").param("active", "true").param("password", "profile-taken-pass-1"))
                .andExpect(status().is3xxRedirection());
        MockHttpSession support = login("support@profile.example.test", "profile-support-pass-1");
        long id = jdbc.queryForObject("SELECT id FROM admin_users WHERE login_id = 'support@profile.example.test'", Long.class);
        assertThat(page(support, "/account/profile")).contains("아이디 변경").contains("새 아이디(이메일)");

        // 현재 비밀번호 확인 · 이메일 형식 · 다른 계정이 쓰는 아이디는 안 됨(같은 화면에 안내)
        assertThat(mvc.perform(post("/account/profile/login-id").session(support).with(csrf())
                        .param("loginId", "new-support@profile.example.test").param("currentPassword", "wrong-pass-0000"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8)).contains("현재 비밀번호가 일치하지 않습니다.");
        assertThat(mvc.perform(post("/account/profile/login-id").session(support).with(csrf())
                        .param("loginId", "support2").param("currentPassword", "profile-support-pass-1"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8)).contains("이메일 주소 형식");
        assertThat(mvc.perform(post("/account/profile/login-id").session(support).with(csrf())
                        .param("loginId", "Taken@Profile.Example.Test").param("currentPassword", "profile-support-pass-1"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8)).contains("이미 다른 계정이 쓰는 아이디");

        // 바꾸면 같은 줄(같은 번호)의 login_id 값만 바뀌고 새 아이디로 다시 로그인
        mvc.perform(post("/account/profile/login-id").session(support).with(csrf())
                        .param("loginId", "  New-Support@Profile.Example.Test ").param("currentPassword", "profile-support-pass-1"))
                .andExpect(redirectedUrl("/login"));
        assertThat(jdbc.queryForObject("SELECT login_id FROM admin_users WHERE id = ?", String.class, id)).isEqualTo("new-support@profile.example.test");
        assertThat(jdbc.queryForObject("SELECT name FROM admin_users WHERE id = ?", String.class, id)).isEqualTo("새 서포터즈");
        login("new-support@profile.example.test", "profile-support-pass-1");
        mvc.perform(formLogin("/login").user("loginId", "support@profile.example.test").password("password", "profile-support-pass-1"))
                .andExpect(redirectedUrl("/login?error"));
    }
}
