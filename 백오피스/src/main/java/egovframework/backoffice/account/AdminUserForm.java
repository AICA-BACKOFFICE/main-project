package egovframework.backoffice.account;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class AdminUserForm {
    private Long id;

    /** 로그인 ID = 이메일 주소 (형식 검증은 등록 시 서비스에서 — 기존 'admin' 같은 계정은 수정 시 그대로 둔다) */
    @NotBlank(message = "이메일을 입력하세요.")
    @Size(max = 120, message = "이메일은 120자 이내입니다.")
    private String loginId;

    @NotBlank(message = "이름을 입력하세요.")
    @Size(max = 50)
    private String name;

    @NotNull(message = "역할을 선택하세요.")
    private AdminRole role = AdminRole.ADMIN;

    private boolean active = true;

    /** 신규 등록 시 필수, 수정 시 비우면 유지 */
    private String password;

    public static AdminUserForm from(AdminUser user) {
        AdminUserForm f = new AdminUserForm();
        f.setId(user.getId());
        f.setLoginId(user.getLoginId());
        f.setName(user.getName());
        f.setRole(user.getRole());
        f.setActive(user.isActive());
        return f;
    }
}
