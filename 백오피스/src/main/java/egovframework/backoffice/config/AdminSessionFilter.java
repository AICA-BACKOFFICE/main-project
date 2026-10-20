package egovframework.backoffice.config;

import egovframework.backoffice.account.AdminUser;
import egovframework.backoffice.account.AdminUserMapper;
import egovframework.backoffice.account.CurrentAdmin;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.filter.OncePerRequestFilter;

/** Role changes and deactivation also apply to sessions that are already signed in. */
public class AdminSessionFilter extends OncePerRequestFilter {
    private final AdminUserMapper users;
    public AdminSessionFilter(AdminUserMapper users) { this.users = users; }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof CurrentAdmin principal) {
            AdminUser current = users.findById(principal.getId());
            if (current == null || !current.isActive()) {
                new SecurityContextLogoutHandler().logout(request, response, authentication);
            } else if (current.getRole() != principal.getRole()) {
                CurrentAdmin refreshed = new CurrentAdmin(current);
                var replacement = new UsernamePasswordAuthenticationToken(refreshed, null, refreshed.getAuthorities());
                replacement.setDetails(authentication.getDetails());
                var context = SecurityContextHolder.createEmptyContext(); context.setAuthentication(replacement);
                SecurityContextHolder.setContext(context);
                new HttpSessionSecurityContextRepository().saveContext(context, request, response);
            }
        }
        chain.doFilter(request, response);
    }
}
