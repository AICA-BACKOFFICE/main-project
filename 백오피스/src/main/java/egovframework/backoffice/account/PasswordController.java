package egovframework.backoffice.account;

import egovframework.backoffice.common.BusinessException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

/** 로그인한 관리자의 본인 비밀번호 변경. 변경 후 세션을 종료하고 다시 로그인하게 한다. */
@Controller
public class PasswordController {

    private final AdminUserService service;

    public PasswordController(AdminUserService service) {
        this.service = service;
    }

    @ModelAttribute("menu")
    public String menu() {
        return "password";
    }

    @GetMapping("/account/password")
    public String form() {
        return "account/password";
    }

    @PostMapping("/account/password")
    public String change(@AuthenticationPrincipal CurrentAdmin me,
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
            model.addAttribute("error", e.getMessage());
            return "account/password";
        }
        new SecurityContextLogoutHandler().logout(request, response,
                SecurityContextHolder.getContext().getAuthentication());
        redirect.addFlashAttribute("toast", "비밀번호를 변경했습니다. 새 비밀번호로 다시 로그인하세요.");
        return "redirect:/login";
    }
}
