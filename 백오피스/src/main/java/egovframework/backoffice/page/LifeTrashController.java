package egovframework.backoffice.page;

import egovframework.backoffice.account.CurrentAdmin;
import egovframework.backoffice.common.BusinessException;
import egovframework.backoffice.common.NotFoundException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

/**
 * 휴지통 › 인사교 라이프 탭의 꺼내기 · 완전 삭제(점심 카드 food · 바람 쐬러 가요 카드 spot).
 * 주소는 휴지통 아래(/admin/posts/trash/life)라 SecurityConfig 의 휴지통 규칙(관리자 이상, 완전 삭제는 최상위 관리자)을 따른다.
 */
@Controller
@RequestMapping("/admin/posts/trash/life")
public class LifeTrashController {

    private static final String BACK = "redirect:/admin/posts/trash?tab=life";

    private final LifeTipService tips;

    public LifeTrashController(LifeTipService tips) {
        this.tips = tips;
    }

    @PostMapping("/{type}/{id}/restore")
    public String restore(@PathVariable String type, @PathVariable Long id, @AuthenticationPrincipal CurrentAdmin me, RedirectAttributes redirect) {
        try {
            String name = tips.restore(type, id, me == null ? null : me.getId());
            redirect.addFlashAttribute("toast", "‘" + name + "’ 카드를 인사교 라이프 목록 맨 뒤로 꺼냈어요. 사이트에도 다시 보여요.");
        } catch (BusinessException | NotFoundException e) {
            redirect.addFlashAttribute("toastError", e.getMessage());
        }
        return BACK;
    }

    @PostMapping("/{type}/{id}/purge")
    public String purge(@PathVariable String type, @PathVariable Long id, RedirectAttributes redirect) {
        try {
            tips.purge(type, id);
            redirect.addFlashAttribute("toast", "카드를 완전히 삭제했어요.");
        } catch (NotFoundException e) {
            redirect.addFlashAttribute("toastError", e.getMessage());
        }
        return BACK;
    }
}
