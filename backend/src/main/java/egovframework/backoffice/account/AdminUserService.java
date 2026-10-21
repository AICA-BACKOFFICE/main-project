package egovframework.backoffice.account;

import egovframework.backoffice.common.BusinessException;
import egovframework.backoffice.common.NotFoundException;
import java.util.List;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class AdminUserService {

    private final AdminUserMapper mapper;
    private final PasswordEncoder passwordEncoder;

    public AdminUserService(AdminUserMapper mapper, PasswordEncoder passwordEncoder) {
        this.mapper = mapper;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional(readOnly = true)
    public List<AdminUser> findAll() {
        return mapper.findAll();
    }

    @Transactional(readOnly = true)
    public AdminUser get(Long id) {
        AdminUser user = mapper.findById(id);
        if (user == null) {
            throw new NotFoundException("관리자를 찾을 수 없습니다.");
        }
        return user;
    }

    private static final java.util.regex.Pattern EMAIL = java.util.regex.Pattern.compile("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$");

    /** 이메일 정규화(공백 제거·소문자) */
    public static String normalizeEmail(String s) {
        return s == null ? "" : s.trim().toLowerCase(java.util.Locale.ROOT);
    }

    public AdminUser create(AdminUserForm form) {
        String email = normalizeEmail(form.getLoginId());
        if (!EMAIL.matcher(email).matches()) {
            throw new BusinessException("로그인 ID는 이메일 주소 형식이어야 합니다 (예: hong@aica-gj.kr).");
        }
        form.setLoginId(email);
        if (mapper.findByLoginId(email) != null) {
            throw new BusinessException("이미 등록된 이메일입니다.");
        }
        if (form.getPassword() == null || form.getPassword().length() < 8) {
            throw new BusinessException("초기 비밀번호는 8자 이상이어야 합니다.");
        }
        AdminUser user = new AdminUser();
        user.setLoginId(form.getLoginId());
        user.setName(form.getName());
        user.setRole(form.getRole());
        user.setActive(form.isActive());
        user.setMustChangePw(true);
        user.setPasswordHash(passwordEncoder.encode(form.getPassword()));
        mapper.insert(user);
        return user;
    }

    public void update(Long id, AdminUserForm form, Long actorId) {
        AdminUser user = get(id);
        boolean demotingOrDeactivating = user.getRole() == AdminRole.SUPER_ADMIN
                && (form.getRole() != AdminRole.SUPER_ADMIN || !form.isActive());
        if (demotingOrDeactivating && mapper.countActiveByRole(AdminRole.SUPER_ADMIN) <= 1) {
            throw new BusinessException("마지막 최상위 관리자는 비활성화하거나 역할을 변경할 수 없습니다.");
        }
        if (id.equals(actorId) && (form.getRole() != user.getRole() || !form.isActive())) {
            throw new BusinessException("자기 자신의 역할·활성 상태는 변경할 수 없습니다.");
        }
        user.setName(form.getName());
        user.setRole(form.getRole());
        user.setActive(form.isActive());
        mapper.updateProfile(user);

        if (form.getPassword() != null && !form.getPassword().isBlank()) {
            if (form.getPassword().length() < 8) {
                throw new BusinessException("비밀번호는 8자 이상이어야 합니다.");
            }
            mapper.updatePassword(id, passwordEncoder.encode(form.getPassword()), true);
        }
    }

    /** 내 정보 수정: 본인 이름 바꾸기(50자까지). 바뀐 이름 */
    public String changeOwnName(Long id, String name) {
        get(id);
        String clean = name == null ? "" : name.replaceAll("\\s+", " ").trim();
        if (clean.isEmpty()) {
            throw new BusinessException("이름을 입력하세요.");
        }
        if (clean.length() > 50) {
            throw new BusinessException("이름은 50자까지예요.");
        }
        mapper.updateName(id, clean);
        return clean;
    }

    /**
     * 내 정보 수정: 본인 아이디(로그인 이메일) 바꾸기. 현재 비밀번호를 확인하고, 이메일 형식이며 다른 계정이 쓰지 않는 아이디만.
     * admin_users 의 같은 줄에서 login_id 칸 값만 바뀐다. 바뀐 아이디
     */
    public String changeOwnLoginId(Long id, String newLoginId, String currentPassword) {
        AdminUser user = get(id);
        if (currentPassword == null || !passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new BusinessException("현재 비밀번호가 일치하지 않습니다.");
        }
        String email = normalizeEmail(newLoginId);
        if (!EMAIL.matcher(email).matches() || email.length() > 120) {
            throw new BusinessException("아이디는 이메일 주소 형식이어야 합니다 (예: hong@aica-gj.kr).");
        }
        if (email.equalsIgnoreCase(user.getLoginId())) {
            throw new BusinessException("지금 아이디와 같아요.");
        }
        AdminUser other = mapper.findByLoginId(email);
        if (other != null && !other.getId().equals(id)) {
            throw new BusinessException("이미 다른 계정이 쓰는 아이디(이메일)예요.");
        }
        mapper.updateLoginId(id, email);
        return email;
    }

    /** 본인 비밀번호 변경 */
    public void changeOwnPassword(Long id, String currentPassword, String newPassword) {
        AdminUser user = get(id);
        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new BusinessException("현재 비밀번호가 일치하지 않습니다.");
        }
        if (newPassword == null || newPassword.length() < 8) {
            throw new BusinessException("새 비밀번호는 8자 이상이어야 합니다.");
        }
        if (passwordEncoder.matches(newPassword, user.getPasswordHash())) {
            throw new BusinessException("현재 비밀번호와 다른 비밀번호를 입력하세요.");
        }
        mapper.updatePassword(id, passwordEncoder.encode(newPassword), false);
    }

    /** 최초 기동 시 관리자 계정이 하나도 없으면 최상위 관리자를 생성한다. */
    public boolean createInitialSuperAdminIfEmpty(String loginId, String name, String rawPassword) {
        if (mapper.count() > 0) {
            return false;
        }
        AdminUser user = new AdminUser();
        user.setLoginId(loginId);
        user.setName(name);
        user.setRole(AdminRole.SUPER_ADMIN);
        user.setActive(true);
        user.setMustChangePw(true);
        user.setPasswordHash(passwordEncoder.encode(rawPassword));
        mapper.insert(user);
        return true;
    }
}
