package egovframework.backoffice.post;

import egovframework.backoffice.page.LifeTipService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import java.util.List;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

/** 휴지통 화면과 이동·복원·완전 삭제. (URL 은 /admin/posts 아래에 그대로 둔다 — SecurityConfig 규칙과 일치) */
@Controller
@RequestMapping("/admin/posts")
public class PostTrashController {

    private final PostTrashService trash;
    private final LifeTipService lifeTips;

    public PostTrashController(PostTrashService trash, LifeTipService lifeTips) {
        this.trash = trash;
        this.lifeTips = lifeTips;
    }

    /** 휴지통: tab = posts 선배들의 이야기 게시물(기본) · life 인사교 라이프 카드 */
    @GetMapping("/trash")
    public String trash(@ModelAttribute("search") PostSearch search, @RequestParam(defaultValue = "posts") String tab,
                        Model model, HttpServletRequest request) {
        if (search.getSize() < 1 || search.getSize() > 100) {
            search.setSize(20);
        }
        model.addAttribute("menu", "trash");
        model.addAttribute("tab", "life".equals(tab) ? "life" : "posts");
        model.addAttribute("result", trash.search(search));
        var overview = trash.overview();
        model.addAttribute("trashTotal", overview.count());
        model.addAttribute("trashSnapshot", overview.token());
        model.addAttribute("lifeTrash", lifeTips.trash(request.getContextPath()));
        return "post/trash";
    }

    @PostMapping("/trash/bulk")
    public String bulk(@RequestParam(required = false) List<Long> ids, @RequestParam String action,
                       @RequestParam(defaultValue = "") String keyword, RedirectAttributes redirect) {
        int count = trash.bulk(ids, action);
        redirect.addFlashAttribute("toast", count + "개 게시물을 " + ("restore".equals(action) ? "복원했습니다." : "완전히 삭제했습니다."));
        return "redirect:/admin/posts/trash" + (keyword.isBlank() ? "" : "?keyword=" + URLEncoder.encode(keyword, StandardCharsets.UTF_8));
    }

    @PostMapping("/trash/empty")
    public String empty(@RequestParam String snapshot, RedirectAttributes redirect) {
        int count = trash.empty(snapshot);
        redirect.addFlashAttribute("toast", "휴지통의 " + count + "개 게시물을 완전히 삭제했습니다.");
        return "redirect:/admin/posts/trash";
    }

    /** 휴지통으로 이동 (soft delete) */
    @PostMapping("/{id}/delete")
    public String delete(@PathVariable Long id, RedirectAttributes redirect) {
        trash.moveToTrash(id);
        redirect.addFlashAttribute("toast", "게시물을 휴지통으로 이동했습니다. 상태는 '미게시'로 바뀌어 프론트(사이트)에서 내려갑니다.");
        return "redirect:/admin/posts";
    }

    @PostMapping("/{id}/restore")
    public String restore(@PathVariable Long id, RedirectAttributes redirect) {
        var before = trash.restore(id);
        PostStatus restored = before.getStatusBeforeTrash() == null ? before.getStatus() : before.getStatusBeforeTrash();
        redirect.addFlashAttribute("toast", "게시물을 '" + restored.getLabel() + "' 상태로 복원했습니다."
                + (restored == PostStatus.PUBLISHED ? " 프론트(사이트)에도 다시 올라갑니다." : ""));
        return "redirect:/admin/posts";
    }

    @PostMapping("/{id}/purge")
    public String purge(@PathVariable Long id, RedirectAttributes redirect) {
        trash.purge(id);
        redirect.addFlashAttribute("toast", "게시물을 완전히 삭제했습니다.");
        return "redirect:/admin/posts/trash";
    }
}
