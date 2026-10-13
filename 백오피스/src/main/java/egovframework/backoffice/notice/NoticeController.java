package egovframework.backoffice.notice;

import egovframework.backoffice.account.CurrentAdmin;
import egovframework.backoffice.common.BusinessException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

/**
 * 운영진 공지.
 *  GET  /admin/notices                 목록(전원 열람) + 작성/수정 폼(최고관리자)
 *  POST /admin/notices                 작성 · POST /admin/notices/{id} 수정 · /{id}/toggle 켜기/끄기 · /{id}/delete 삭제  — 최고관리자
 *  POST /admin/notices/{id}/dismiss    상단 띠에서 닫기(개인별) — 전원
 */
@Controller
@RequestMapping("/admin/notices")
public class NoticeController {

    private final NoticeService service;

    public NoticeController(NoticeService service) {
        this.service = service;
    }

    @ModelAttribute("menu")
    public String menu() {
        return "notices";
    }

    @GetMapping
    public String list(@RequestParam(required = false) Long edit, Model model) {
        model.addAttribute("notices", service.findAll());
        if (!model.containsAttribute("form")) {
            model.addAttribute("form", edit == null ? new NoticeForm() : NoticeForm.from(service.get(edit)));
        }
        return "notice/list";
    }

    @PostMapping
    public String create(@ModelAttribute("form") NoticeForm form, @AuthenticationPrincipal CurrentAdmin me,
                         Model model, RedirectAttributes redirect) {
        try {
            service.create(form, me.getId());
            redirect.addFlashAttribute("toast", "공지를 등록했습니다. 운영진 전체 상단에 표시됩니다.");
            return "redirect:/admin/notices";
        } catch (BusinessException e) {
            model.addAttribute("error", e.getMessage());
            model.addAttribute("notices", service.findAll());
            return "notice/list";
        }
    }

    @PostMapping("/{id}")
    public String update(@PathVariable Long id, @ModelAttribute("form") NoticeForm form, Model model, RedirectAttributes redirect) {
        form.setId(id);
        try {
            service.update(id, form);
            redirect.addFlashAttribute("toast", "공지를 수정했습니다. 닫았던 사람에게도 다시 표시됩니다.");
            return "redirect:/admin/notices";
        } catch (BusinessException e) {
            model.addAttribute("error", e.getMessage());
            model.addAttribute("notices", service.findAll());
            return "notice/list";
        }
    }

    @PostMapping("/{id}/toggle")
    public String toggle(@PathVariable Long id, @RequestParam boolean active, RedirectAttributes redirect) {
        service.setActive(id, active);
        redirect.addFlashAttribute("toast", active ? "공지를 다시 표시합니다." : "공지를 내렸습니다.");
        return "redirect:/admin/notices";
    }

    @PostMapping("/{id}/delete")
    public String delete(@PathVariable Long id, RedirectAttributes redirect) {
        service.delete(id);
        redirect.addFlashAttribute("toast", "공지를 삭제했습니다.");
        return "redirect:/admin/notices";
    }

    @PostMapping("/{id}/dismiss")
    public String dismiss(@PathVariable Long id, @AuthenticationPrincipal CurrentAdmin me,
                          @RequestParam(defaultValue = "/admin") String back) {
        service.dismiss(id, me.getId());
        return "redirect:" + (back.startsWith("/admin") || back.startsWith("/account") ? back : "/admin");
    }
}
