package egovframework.backoffice.account;

import org.springframework.context.event.EventListener;
import org.springframework.security.authentication.event.AuthenticationSuccessEvent;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class AdminUserDetailsService implements UserDetailsService {

    private final AdminUserMapper adminUserMapper;

    public AdminUserDetailsService(AdminUserMapper adminUserMapper) {
        this.adminUserMapper = adminUserMapper;
    }

    @Override
    public UserDetails loadUserByUsername(String loginId) throws UsernameNotFoundException {
        AdminUser user = adminUserMapper.findByLoginId(loginId);
        if (user == null) {
            throw new UsernameNotFoundException("관리자 계정을 찾을 수 없습니다.");
        }
        return new CurrentAdmin(user);
    }

    @EventListener
    public void onLoginSuccess(AuthenticationSuccessEvent event) {
        if (event.getAuthentication().getPrincipal() instanceof CurrentAdmin admin) {
            adminUserMapper.updateLastLogin(admin.getId());
        }
    }
}
