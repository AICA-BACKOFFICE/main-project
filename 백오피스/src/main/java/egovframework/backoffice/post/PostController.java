package egovframework.backoffice.post;

import egovframework.backoffice.account.CurrentAdmin;
import egovframework.backoffice.category.CategoryService;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

/**
 * 게시물 목록·등록·수정·상태 변경.
 * 휴지통은 {@link PostTrashController}, 미리보기는 {@link PostPreviewController},
 * 버전 이력은 {@link egovframework.backoffice.post.version.PostVersionController}.
 */
@Controller
@RequestMapping("/admin/posts")
public class PostController {

    private final PostService postService;
    private final CategoryService categoryService;

    public PostController(PostService postService, CategoryService categoryService) {
        this.postService = postService;
        this.categoryService = categoryService;
    }

    @ModelAttribute("menu")
    public String menu() {
        return "posts";
    }

    @GetMapping
    public String list(@ModelAttribute("search") PostSearch search, Model model) {
        if (search.getSize() < 1 || search.getSize() > 100) {
            search.setSize(20);
        }
        model.addAttribute("result", postService.search(search));
        model.addAttribute("categoryTree", categoryService.treeAll());
        model.addAttribute("statuses", PostStatus.values());
        return "post/list";
    }

    @GetMapping("/new")
    public String createForm(Model model) {
        model.addAttribute("form", new PostForm());
        addFormOptions(model);
        return "post/editor";
    }

    @PostMapping
    public String create(@Valid @ModelAttribute("form") PostForm form, BindingResult binding,
                         @AuthenticationPrincipal CurrentAdmin me, Model model, RedirectAttributes redirect) {
        if (binding.hasErrors()) {
            addFormOptions(model);
            return "post/editor";
        }
        try {
            Post saved = postService.create(form, me.getId());
            redirect.addFlashAttribute("toast", "게시물을 등록했습니다.");
            return "redirect:/admin/posts/" + saved.getId() + "/edit";
        } catch (IllegalArgumentException e) {
            binding.reject("blocks", e.getMessage());
            addFormOptions(model);
            return "post/editor";
        }
    }

    @GetMapping("/{id}/edit")
    public String editForm(@PathVariable Long id, Model model) {
        Post post = postService.get(id);
        model.addAttribute("post", post);
        model.addAttribute("form", PostForm.from(post));
        addFormOptions(model);
        return "post/editor";
    }

    @PostMapping("/{id}")
    public String update(@PathVariable Long id, @Valid @ModelAttribute("form") PostForm form,
                         BindingResult binding, @AuthenticationPrincipal CurrentAdmin me,
                         Model model, RedirectAttributes redirect) {
        form.setId(id);
        if (binding.hasErrors()) {
            model.addAttribute("post", postService.get(id));
            addFormOptions(model);
            return "post/editor";
        }
        try {
            postService.update(id, form, me.getId());
            redirect.addFlashAttribute("toast", "게시물을 저장했습니다.");
            return "redirect:/admin/posts/" + id + "/edit";
        } catch (IllegalArgumentException e) {
            binding.reject("blocks", e.getMessage());
            model.addAttribute("post", postService.get(id));
            addFormOptions(model);
            return "post/editor";
        }
    }

    @PostMapping("/{id}/status")
    public String changeStatus(@PathVariable Long id, @RequestParam PostStatus status,
                               @RequestParam(required = false) String back, RedirectAttributes redirect) {
        postService.changeStatus(id, status);
        redirect.addFlashAttribute("toast", "게시물 상태를 '" + status.getLabel() + "'(으)로 변경했습니다.");
        return "redirect:" + (back != null && back.startsWith("/admin/") ? back : "/admin/posts");
    }

    private void addFormOptions(Model model) {
        model.addAttribute("categoryTree", categoryService.tree());
        model.addAttribute("statuses", PostStatus.values());
    }
}
