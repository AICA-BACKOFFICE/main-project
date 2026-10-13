package egovframework.backoffice.account;

import egovframework.backoffice.common.BusinessException;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

/** 관리자 계정 관리 (SUPER_ADMIN 전용, SecurityConfig 에서 경로 제한). */
@Controller
@RequestMapping("/admin/users")
public class AdminUserController {

    private final AdminUserService service;

    public AdminUserController(AdminUserService service) {
        this.service = service;
    }

    @ModelAttribute("menu")
    public String menu() {
        return "users";
    }

    @GetMapping
    public String list(Model model) {
        model.addAttribute("users", service.findAll());
        return "account/user-list";
    }

    @GetMapping("/new")
    public String createForm(Model model) {
        model.addAttribute("form", new AdminUserForm());
        model.addAttribute("roles", AdminRole.values());
        return "account/user-form";
    }

    @PostMapping
    public String create(@Valid @ModelAttribute("form") AdminUserForm form, BindingResult binding,
                         Model model, RedirectAttributes redirect) {
        if (!binding.hasErrors()) {
            try {
                service.create(form);
                redirect.addFlashAttribute("toast", "관리자 계정을 등록했습니다.");
                return "redirect:/admin/users";
            } catch (BusinessException e) {
                binding.reject("business", e.getMessage());
            }
        }
        model.addAttribute("roles", AdminRole.values());
        return "account/user-form";
    }

    @GetMapping("/{id}/edit")
    public String editForm(@PathVariable Long id, Model model) {
        model.addAttribute("form", AdminUserForm.from(service.get(id)));
        model.addAttribute("roles", AdminRole.values());
        return "account/user-form";
    }

    @PostMapping("/{id}")
    public String update(@PathVariable Long id, @Valid @ModelAttribute("form") AdminUserForm form,
                         BindingResult binding, @AuthenticationPrincipal CurrentAdmin me,
                         Model model, RedirectAttributes redirect) {
        form.setId(id);
        if (!binding.hasErrors()) {
            try {
                service.update(id, form, me.getId());
                redirect.addFlashAttribute("toast", "관리자 정보를 수정했습니다.");
                return "redirect:/admin/users";
            } catch (BusinessException e) {
                binding.reject("business", e.getMessage());
            }
        }
        model.addAttribute("roles", AdminRole.values());
        return "account/user-form";
    }
}
