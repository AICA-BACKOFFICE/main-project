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
 * 휴지통은 {@link PostTrashController}, 미리보기는 {@link PostPreviewController}. 글은 종류별 표에 있다({@link PostStore}).
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
    public String list(@ModelAttribute("search") PostSearch search, @RequestParam(required = false) String kind, Model model,
                       jakarta.servlet.http.HttpServletRequest request) {
        // 왼쪽 메뉴의 세부 카테고리(선배 후기 · 선배 인터뷰 · 프로젝트)는 카테고리 slug(kind)로 연다
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
        // 목록 위 '미게시 n건'(지금 고른 카테고리 · 검색어 · 작성자 안에서). 누르면 미게시만
        model.addAttribute("hiddenCount", postService.countWithStatus(search, PostStatus.HIDDEN));
        // 게시 · 미게시를 누른 뒤 보던 목록(종류 · 거르기 · 쪽) 그대로 돌아오게
        model.addAttribute("listUrl", "/admin/posts" + (request.getQueryString() == null ? "" : "?" + request.getQueryString()));
        model.addAttribute("categoryTree", tree);
        model.addAttribute("statuses", PostStatus.CHOOSABLE);
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
                         @AuthenticationPrincipal CurrentAdmin me, @RequestParam(name = "after", required = false) String after,
                         Model model, RedirectAttributes redirect) {
        if (binding.hasErrors()) {
            addFormOptions(model);
            return "post/editor";
        }
        try {
            Post saved = postService.create(form, me.getId());
            redirect.addFlashAttribute("toast", "등록이 완료되었습니다.");
            // 새 글을 '저장(발행)'으로 등록하면 그 종류의 게시물 관리 목록으로(2026-10-21). 임시저장은 이어서 쓰도록 글 수정 화면으로
            if ("list".equals(after)) {
                return "redirect:/admin/posts?kind=" + saved.getKind();
            }
            return "redirect:/admin/posts/" + saved.getKind() + "/" + saved.getId() + "/edit";
        } catch (IllegalArgumentException e) {
            binding.reject("blocks", e.getMessage());
            addFormOptions(model);
            return "post/editor";
        }
    }

    /** 글 번호는 표마다 1번부터라 주소에 글 종류가 같이 들어간다: /admin/posts/project/1/edit */
    @GetMapping("/{kind:review|interview|project|cohort}/{id:[0-9]+}/edit")
    public String editForm(@PathVariable String kind, @PathVariable Long id, @AuthenticationPrincipal CurrentAdmin me, Model model) {
        Post post = postService.getForEditing(PostKey.kind(kind), id, me.getId());
        model.addAttribute("post", post);
        model.addAttribute("form", PostForm.from(post));
        addFormOptions(model);
        return "post/editor";
    }

    /** 왼쪽 메뉴에서 표시할 선배들의 이야기 세부 카테고리(review · interview · project). 그 밖의 카테고리는 null */
    private static String storyKind(String categorySlug) {
        StoryKind kind = StoryKind.ofSlug(categorySlug);
        return kind == null ? null : kind.slug();
    }

    @PostMapping("/{kind:review|interview|project|cohort}/{id:[0-9]+}")
    public String update(@PathVariable String kind, @PathVariable Long id, @Valid @ModelAttribute("form") PostForm form,
                         BindingResult binding, @AuthenticationPrincipal CurrentAdmin me,
                         Model model, RedirectAttributes redirect) {
        StoryKind from = PostKey.kind(kind);
        postService.getForEditing(from, id, me.getId());
        form.setId(id);
        if (binding.hasErrors()) {
            model.addAttribute("post", postService.get(from, id));
            addFormOptions(model);
            return "post/editor";
        }
        try {
            // 글 종류를 바꾸면 새 종류의 표로 옮겨 번호도 바뀌므로 저장된 글의 주소로 연다
            Post saved = postService.update(from, id, form, me.getId());
            redirect.addFlashAttribute("toast", "수정이 완료되었습니다.");
            return "redirect:/admin/posts/" + saved.getKind() + "/" + saved.getId() + "/edit";
        } catch (IllegalArgumentException e) {
            binding.reject("blocks", e.getMessage());
            model.addAttribute("post", postService.get(from, id));
            addFormOptions(model);
            return "post/editor";
        }
    }

    @PostMapping("/{kind:review|interview|project|cohort}/{id:[0-9]+}/status")
    public String changeStatus(@PathVariable String kind, @PathVariable Long id, @RequestParam PostStatus status,
                               @RequestParam(required = false) String back, RedirectAttributes redirect) {
        postService.changeStatus(PostKey.kind(kind), id, status);
        redirect.addFlashAttribute("toast", "게시물 상태를 '" + status.getLabel() + "'(으)로 변경했습니다.");
        return "redirect:" + egovframework.backoffice.common.BackPath.or(back, "/admin/posts");
    }

    private void addFormOptions(Model model) {
        model.addAttribute("categoryTree", categoryService.tree());
        model.addAttribute("statuses", PostStatus.CHOOSABLE);
    }
}
