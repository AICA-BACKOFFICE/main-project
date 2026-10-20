package egovframework.backoffice.post;

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

    public PostTrashController(PostTrashService trash) {
        this.trash = trash;
    }

    /** 휴지통: 후기 · 인터뷰 · 프로젝트 표에서 휴지통으로 옮긴 글 */
    @GetMapping("/trash")
    public String trash(@ModelAttribute("search") PostSearch search, Model model) {
        if (search.getSize() < 1 || search.getSize() > 100) {
            search.setSize(20);
        }
        model.addAttribute("menu", "trash");
        model.addAttribute("result", trash.search(search));
        var overview = trash.overview();
        model.addAttribute("trashTotal", overview.count());
        model.addAttribute("trashSnapshot", overview.token());
        return "post/trash";
    }

    @PostMapping("/trash/bulk")
    public String bulk(@RequestParam(required = false) List<String> ids, @RequestParam String action,
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
    @PostMapping("/{kind:review|interview|project}/{id:[0-9]+}/delete")
    public String delete(@PathVariable String kind, @PathVariable Long id, RedirectAttributes redirect) {
        trash.moveToTrash(PostKey.kind(kind), id);
        redirect.addFlashAttribute("toast", "게시물을 휴지통으로 이동했습니다. 상태는 '삭제됨'으로 바뀌어 프론트(사이트)에서 내려갑니다.");
        return "redirect:/admin/posts";
    }

    @PostMapping("/{kind:review|interview|project}/{id:[0-9]+}/restore")
    public String restore(@PathVariable String kind, @PathVariable Long id, RedirectAttributes redirect) {
        var before = trash.restore(PostKey.kind(kind), id);
        // 옮기기 전 상태가 없으면(예전 글) 미게시로 — StoryTableMapper.restore 와 같은 규칙
        PostStatus restored = before.getStatusBeforeTrash() == null ? PostStatus.HIDDEN : before.getStatusBeforeTrash();
        redirect.addFlashAttribute("toast", "게시물을 '" + restored.getLabel() + "' 상태로 복원했습니다."
                + (restored == PostStatus.PUBLISHED ? " 프론트(사이트)에도 다시 올라갑니다." : ""));
        return "redirect:/admin/posts";
    }

    @PostMapping("/{kind:review|interview|project}/{id:[0-9]+}/purge")
    public String purge(@PathVariable String kind, @PathVariable Long id, RedirectAttributes redirect) {
        trash.purge(PostKey.kind(kind), id);
        redirect.addFlashAttribute("toast", "게시물을 완전히 삭제했습니다.");
        return "redirect:/admin/posts/trash";
    }
}
