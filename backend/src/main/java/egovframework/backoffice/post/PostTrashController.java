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

    /**
     * 휴지통: 후기 · 인터뷰 · 프로젝트 표에서 휴지통으로 옮긴 글, FAQ 관리에서 지운 자주 묻는 질문, 미디어 관리에서 지운 미디어.
     * kind(review · interview · project · faq · media)를 고르면 그 종류만 보이고, 비우기도 그 종류만
     */
    @GetMapping("/trash")
    public String trash(@ModelAttribute("search") PostSearch search, @RequestParam(required = false) String kind, Model model) {
        if (search.getSize() < 1 || search.getSize() > 100) {
            search.setSize(20);
        }
        String k = PostTrashService.kind(kind);
        model.addAttribute("menu", "trash");
        model.addAttribute("trashKind", k);
        model.addAttribute("trashKinds", PostTrashService.KINDS);
        model.addAttribute("trashCounts", trash.counts());
        model.addAttribute("result", trash.search(search, k));
        var overview = trash.overview(k);
        model.addAttribute("trashTotal", overview.count());
        model.addAttribute("trashSnapshot", overview.token());
        return "post/trash";
    }

    /** 휴지통으로 돌아가는 주소(보던 종류 · 검색어 그대로) */
    private static String back(String kind, String keyword) {
        String k = PostTrashService.kind(kind);
        StringBuilder url = new StringBuilder("redirect:/admin/posts/trash");
        String sep = "?";
        if (k != null) {
            url.append(sep).append("kind=").append(k);
            sep = "&";
        }
        if (keyword != null && !keyword.isBlank()) {
            url.append(sep).append("keyword=").append(URLEncoder.encode(keyword, StandardCharsets.UTF_8));
        }
        return url.toString();
    }

    @PostMapping("/trash/bulk")
    public String bulk(@RequestParam(required = false) List<String> ids, @RequestParam String action,
                       @RequestParam(defaultValue = "") String keyword, @RequestParam(required = false) String kind,
                       RedirectAttributes redirect) {
        int count = trash.bulk(ids, action);
        redirect.addFlashAttribute("toast", count + "개를 " + ("restore".equals(action) ? "복원했습니다." : "완전히 삭제했습니다."));
        return back(kind, keyword);
    }

    @PostMapping("/trash/empty")
    public String empty(@RequestParam String snapshot, @RequestParam(required = false) String kind, RedirectAttributes redirect) {
        String k = PostTrashService.kind(kind);
        int count = trash.empty(snapshot, k);
        redirect.addFlashAttribute("toast", (k == null ? "휴지통의 " : PostTrashService.KINDS.get(k) + " 휴지통의 ") + count + "개를 완전히 삭제했습니다.");
        return back(k, null);
    }

    /** 휴지통으로 이동 (soft delete) */
    @PostMapping("/{kind:review|interview|project|cohort}/{id:[0-9]+}/delete")
    public String delete(@PathVariable String kind, @PathVariable Long id, @RequestParam(name = "back", required = false) String back,
                         RedirectAttributes redirect) {
        trash.moveToTrash(PostKey.kind(kind), id);
        redirect.addFlashAttribute("toast", "게시물을 휴지통으로 이동했습니다. 상태는 '삭제됨'으로 바뀌어 프론트(사이트)에서 내려갑니다.");
        // 임시저장 목록에서 지웠으면 그 목록으로(back), 아니면 게시물 관리로
        return "redirect:" + egovframework.backoffice.common.BackPath.or(back, "/admin/posts");
    }

    @PostMapping("/{kind:review|interview|project|cohort}/{id:[0-9]+}/restore")
    public String restore(@PathVariable String kind, @PathVariable Long id, RedirectAttributes redirect) {
        var before = trash.restore(PostKey.kind(kind), id);
        // 옮기기 전 상태가 없으면(예전 글) 미게시로 — StoryTableMapper.restore 와 같은 규칙
        PostStatus restored = before.getStatusBeforeTrash() == null ? PostStatus.HIDDEN : before.getStatusBeforeTrash();
        redirect.addFlashAttribute("toast", "게시물을 '" + restored.getLabel() + "' 상태로 복원했습니다."
                + (restored == PostStatus.PUBLISHED ? " 프론트(사이트)에도 다시 올라갑니다." : ""));
        return "redirect:/admin/posts";
    }

    /** 자주 묻는 질문 복원: 지우기 전 상태로 FAQ 관리 목록의 원래 자리에 돌아온다 */
    @PostMapping("/faq/{id:[0-9]+}/restore")
    public String restoreFaq(@PathVariable Long id, RedirectAttributes redirect) {
        var before = trash.restoreFaq(id);
        PostStatus restored = before.getStatusBeforeTrash() == null ? PostStatus.HIDDEN : before.getStatusBeforeTrash();
        redirect.addFlashAttribute("toast", "질문을 '" + restored.getLabel() + "' 상태로 FAQ 관리에 복원했습니다."
                + (restored == PostStatus.PUBLISHED ? " 사이트의 자주 묻는 질문에도 다시 올라갑니다." : ""));
        return "redirect:/admin/faq";
    }

    @PostMapping("/faq/{id:[0-9]+}/purge")
    public String purgeFaq(@PathVariable Long id, @RequestParam(name = "back", required = false) String kind, RedirectAttributes redirect) {
        trash.purgeFaq(id);
        redirect.addFlashAttribute("toast", "질문을 완전히 삭제했습니다.");
        return back(kind, null);
    }

    /** 미디어 복원: 미디어 관리 목록에 다시 */
    @PostMapping("/media/{id:[0-9]+}/restore")
    public String restoreMedia(@PathVariable Long id, RedirectAttributes redirect) {
        var before = trash.restoreMedia(id);
        redirect.addFlashAttribute("toast", "‘" + before.getName() + "’ 미디어를 복원했습니다.");
        return "redirect:/admin/media";
    }

    @PostMapping("/media/{id:[0-9]+}/purge")
    public String purgeMedia(@PathVariable Long id, @RequestParam(name = "back", required = false) String kind, RedirectAttributes redirect) {
        trash.purgeMedia(id);
        redirect.addFlashAttribute("toast", "미디어를 완전히 삭제했습니다(파일도 지웠어요).");
        return back(kind, null);
    }

    /** 인사교 라이프 카드 복원: 옮기기 전 상태로 원래 자리에(게시중이었으면 사이트 페이지에도 다시) → 인사교 라이프 게시물 관리의 그 탭으로 */
    @PostMapping("/{kind:life-fac|life-food|life-fun}/{id:[0-9]+}/restore")
    public String restoreLife(@PathVariable String kind, @PathVariable Long id, RedirectAttributes redirect) {
        String section = kind.substring(egovframework.backoffice.page.LifeBoardService.KIND_PREFIX.length());
        try {
            var before = trash.restoreLife(section, id);
            boolean published = "PUBLISHED".equals(before.getStatusBeforeTrash());
            redirect.addFlashAttribute("toast", "카드를 '" + (published ? "게시" : "임시저장") + "' 상태로 인사교 라이프에 복원했습니다."
                    + (published ? " 사이트의 인사교 라이프에도 다시 올라갑니다." : ""));
            return "redirect:/admin/pages/life-photos?section=" + section;
        } catch (egovframework.backoffice.common.BusinessException e) {
            redirect.addFlashAttribute("toast", e.getMessage());
            return back(egovframework.backoffice.page.LifeBoardService.KIND, null);
        }
    }

    @PostMapping("/{kind:life-fac|life-food|life-fun}/{id:[0-9]+}/purge")
    public String purgeLife(@PathVariable String kind, @PathVariable Long id, @RequestParam(name = "back", required = false) String backKind,
                            RedirectAttributes redirect) {
        trash.purgeLife(kind.substring(egovframework.backoffice.page.LifeBoardService.KIND_PREFIX.length()), id);
        redirect.addFlashAttribute("toast", "카드를 완전히 삭제했습니다.");
        return back(backKind, null);
    }

    @PostMapping("/{kind:review|interview|project|cohort}/{id:[0-9]+}/purge")
    public String purge(@PathVariable String kind, @PathVariable Long id, @RequestParam(name = "back", required = false) String backKind,
                        RedirectAttributes redirect) {
        trash.purge(PostKey.kind(kind), id);
        redirect.addFlashAttribute("toast", "게시물을 완전히 삭제했습니다.");
        return back(backKind, null);
    }
}
