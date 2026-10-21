package egovframework.backoffice.account;

import egovframework.backoffice.common.BusinessException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

/**
 * 내 정보 수정(2026-10-20): 로그인한 사람이 자기 이름과 비밀번호를 바꾼다. 오른쪽 위 프로필 메뉴 · 왼쪽 메뉴 관리 › 내 정보 수정.
 *  - GET  /account/profile        화면(아이디 · 권한은 보기만)
 *  - POST /account/profile/name   이름 바꾸기 → 화면 위 이름도 바로 바뀜
 *  - POST /account/profile/login-id  아이디(로그인 이메일) 바꾸기(현재 비밀번호 확인) → 새 아이디로 다시 로그인
 *  - POST /account/password       비밀번호 바꾸기 → 다시 로그인(예전 '비밀번호 변경' 화면 주소는 이 화면으로)
 */
@Controller
public class ProfileController {

    private final AdminUserService service;

    public ProfileController(AdminUserService service) {
        this.service = service;
    }

    private String view(CurrentAdmin me, Model model) {
        model.addAttribute("menu", "profile");
        model.addAttribute("account", service.get(me.getId()));
        return "account/profile";
    }

    @GetMapping("/account/profile")
    public String profile(@AuthenticationPrincipal CurrentAdmin me, Model model) {
        return view(me, model);
    }

    /** 예전 '비밀번호 변경' 주소 */
    @GetMapping("/account/password")
    public String passwordPage() {
        return "redirect:/account/profile#password";
    }

    @PostMapping("/account/profile/name")
    public String changeName(@AuthenticationPrincipal CurrentAdmin me, @RequestParam String name,
                             HttpServletRequest request, HttpServletResponse response, Model model, RedirectAttributes redirect) {
        try {
            String clean = service.changeOwnName(me.getId(), name);
            refreshLogin(me.getId(), request, response);
            redirect.addFlashAttribute("toast", "이름을 ‘" + clean + "’(으)로 바꿨어요.");
        } catch (BusinessException e) {
            model.addAttribute("nameError", e.getMessage());
            return view(me, model);
        }
        return "redirect:/account/profile";
    }

    /** 로그인 정보의 이름도 새 이름으로(화면 위 프로필 · 글 작성자 표시) */
    private void refreshLogin(Long id, HttpServletRequest request, HttpServletResponse response) {
        Authentication current = SecurityContextHolder.getContext().getAuthentication();
        CurrentAdmin refreshed = new CurrentAdmin(service.get(id));
        UsernamePasswordAuthenticationToken replacement = new UsernamePasswordAuthenticationToken(refreshed, null, refreshed.getAuthorities());
        replacement.setDetails(current == null ? null : current.getDetails());
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(replacement);
        SecurityContextHolder.setContext(context);
        new HttpSessionSecurityContextRepository().saveContext(context, request, response);
    }

    @PostMapping("/account/profile/login-id")
    public String changeLoginId(@AuthenticationPrincipal CurrentAdmin me, @RequestParam String loginId,
                                @RequestParam String currentPassword, HttpServletRequest request, HttpServletResponse response,
                                Model model, RedirectAttributes redirect) {
        String changed;
        try {
            changed = service.changeOwnLoginId(me.getId(), loginId, currentPassword);
        } catch (BusinessException e) {
            model.addAttribute("loginIdError", e.getMessage());
            model.addAttribute("loginIdValue", loginId);
            return view(me, model);
        }
        // 로그인 상태 유지 쿠키는 예전 아이디로 서명돼 있어 지우고, 새 아이디로 다시 로그인
        jakarta.servlet.http.Cookie remember = new jakarta.servlet.http.Cookie(egovframework.backoffice.config.SecurityConfig.REMEMBER_COOKIE, "");
        remember.setMaxAge(0);
        remember.setPath(request.getContextPath() == null || request.getContextPath().isEmpty() ? "/" : request.getContextPath());
        remember.setHttpOnly(true);
        response.addCookie(remember);
        new SecurityContextLogoutHandler().logout(request, response, SecurityContextHolder.getContext().getAuthentication());
        redirect.addFlashAttribute("toast", "아이디를 ‘" + changed + "’(으)로 바꿨어요. 새 아이디로 다시 로그인하세요.");
        return "redirect:/login";
    }

    @PostMapping("/account/password")
    public String changePassword(@AuthenticationPrincipal CurrentAdmin me,
                                 @RequestParam String currentPassword,
                                 @RequestParam String newPassword,
                                 @RequestParam String newPasswordConfirm,
                                 HttpServletRequest request,
                                 HttpServletResponse response,
                                 Model model,
                                 RedirectAttributes redirect) {
        try {
            if (!newPassword.equals(newPasswordConfirm)) {
                throw new BusinessException("새 비밀번호 확인이 일치하지 않습니다.");
            }
            service.changeOwnPassword(me.getId(), currentPassword, newPassword);
        } catch (BusinessException e) {
            model.addAttribute("passwordError", e.getMessage());
            return view(me, model);
        }
        new SecurityContextLogoutHandler().logout(request, response,
                SecurityContextHolder.getContext().getAuthentication());
        redirect.addFlashAttribute("toast", "비밀번호를 변경했습니다. 새 비밀번호로 다시 로그인하세요.");
        return "redirect:/login";
    }
}
