package egovframework.backoffice.post;

import egovframework.backoffice.account.CurrentAdmin;
import egovframework.backoffice.category.Category;
import egovframework.backoffice.category.CategoryService;
import egovframework.backoffice.post.story.StoryKind;
import jakarta.validation.Valid;
import java.util.List;
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
    public String list(@ModelAttribute("search") PostSearch search, @RequestParam(required = false) String kind, Model model) {
        // 왼쪽 메뉴의 세부 카테고리(선배 후기 · 선배 인터뷰 · 프로젝트 · 기수별 모아보기)는 카테고리 slug(kind)로 연다
        Category kindCategory = categoryService.findBySlug(kind);
        if (kindCategory != null && kindCategory.isTop()) {
            search.setCategoryId(kindCategory.getId());
            search.setSubCategoryId(null);
        }
        if (search.getSize() < 1 || search.getSize() > 100) {
            search.setSize(20);
        }
        List<Category> tree = categoryService.treeAll();
        model.addAttribute("result", postService.search(search));
        model.addAttribute("categoryTree", tree);
        model.addAttribute("statuses", PostStatus.values());
        model.addAttribute("storyKind", storyKind(tree.stream().filter(c -> c.getId().equals(search.getCategoryId()))
                .map(Category::getSlug).findFirst().orElse(null)));
        return "post/list";
    }

    /** 새 글은 늘 글 종류(카테고리)가 정해진 채로 연다: 목록에서 고른 종류(kind), 없으면 후기 양식 */
    @GetMapping("/new")
    public String createForm(@RequestParam(required = false) String kind, Model model) {
        PostForm form = new PostForm();
        Category start = categoryService.findBySlug(StoryKind.ofSlug(kind) != null ? kind : StoryKind.REVIEW.slug());
        if (start != null && start.isTop() && start.isActive()) {
            form.setCategoryId(start.getId());
        }
        model.addAttribute("form", form);
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
            redirect.addFlashAttribute("toast", "등록이 완료되었습니다.");
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

    /** 왼쪽 메뉴에서 표시할 선배들의 이야기 세부 카테고리(review · interview · project · cohort). 그 밖의 카테고리는 null */
    private static String storyKind(String categorySlug) {
        StoryKind kind = StoryKind.ofSlug(categorySlug);
        return kind == null ? null : kind.slug();
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
            redirect.addFlashAttribute("toast", "수정이 완료되었습니다.");
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
