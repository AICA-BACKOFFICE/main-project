package egovframework.backoffice.account;

import java.util.Collection;
import java.util.List;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

/** 세션에 저장되는 로그인 관리자 정보. */
public class CurrentAdmin implements UserDetails {
    private final Long id;
    private final String loginId;
    private final String name;
    private final String passwordHash;
    private final AdminRole role;
    private final boolean active;
    private final boolean mustChangePw;

    public CurrentAdmin(AdminUser user) {
        this.id = user.getId();
        this.loginId = user.getLoginId();
        this.name = user.getName();
        this.passwordHash = user.getPasswordHash();
        this.role = user.getRole();
        this.active = user.isActive();
        this.mustChangePw = user.isMustChangePw();
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public AdminRole getRole() {
        return role;
    }

    public boolean isMustChangePw() {
        return mustChangePw;
    }

    public boolean isSuperAdmin() {
        return role == AdminRole.SUPER_ADMIN;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority(role.authority()));
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public String getUsername() {
        return loginId;
    }

    @Override
    public boolean isEnabled() {
        return active;
    }

    @Override
    public boolean isAccountNonLocked() {
        return active;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }
}
