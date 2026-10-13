package egovframework.backoffice.template;

import egovframework.backoffice.account.CurrentAdmin;
import egovframework.backoffice.category.CategoryService;
import egovframework.backoffice.common.BusinessException;
import egovframework.backoffice.config.BackofficeProperties;
import egovframework.backoffice.editor.PostLayout;
import egovframework.backoffice.post.Post;
import egovframework.backoffice.post.PostService;
import egovframework.backoffice.post.PostStatus;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

/**
 * 템플릿 관리 화면. 글의 "레이아웃(화면 구성) + 본문 뼈대"를 템플릿으로 만들어 두면 글쓰기에서 불러와 바로 쓴다.
 *  GET  /admin/templates              목록(카드)
 *  GET  /admin/templates/new          새 템플릿 — 레이아웃 패널 + 본문 구성 편집기
 *  GET  /admin/templates/{id}/edit    수정
 *  POST /admin/templates              저장 / POST /admin/templates/{id}  수정 저장
 *  POST /admin/templates/{id}/delete  삭제
 *  GET  /admin/templates/{id}/preview 프론트 화면 미리보기(예시 글 데이터로 렌더링)
 *  POST /admin/templates/preview      저장 전 미리보기
 */
@Controller
@RequestMapping("/admin/templates")
public class PostTemplatePageController {

    public static final Map<String, String> PRESET_LABELS = Map.of(
            "basic", "기본 1단", "wide", "넓게 1단", "hero", "히어로", "magazine", "매거진",
            "side-left", "좌 사이드바", "side-right", "우 사이드바");

    private final PostTemplateService service;
    private final CategoryService categoryService;
    private final PostService postService;
    private final BackofficeProperties properties;

    public PostTemplatePageController(PostTemplateService service, CategoryService categoryService,
                                      PostService postService, BackofficeProperties properties) {
        this.service = service;
        this.categoryService = categoryService;
        this.postService = postService;
        this.properties = properties;
    }

    @ModelAttribute("menu")
    public String menu() {
        return "templates";
    }

    @GetMapping
    public String list(Model model) {
        List<Map<String, Object>> cards = new ArrayList<>();
        for (PostTemplate t : service.findAll()) {
            PostTemplateService.CardInfo info = service.cardInfo(t);
            PostLayout layout = service.layoutOf(t);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("t", t);
            m.put("blockCount", info.blockCount());
            m.put("preview", info.preview());
            m.put("thumbnailUrl", info.thumbnailUrl());
            m.put("preset", layout.getPreset());
            m.put("presetLabel", PRESET_LABELS.getOrDefault(layout.getPreset(), layout.getPreset()));
            m.put("widgetCount", layout.getSidebar().size() + layout.getFooter().size());
            cards.add(m);
        }
        model.addAttribute("cards", cards);
        model.addAttribute("max", PostTemplateService.MAX_TEMPLATES);
        return "template/list";
    }

    @GetMapping("/new")
    public String createForm(Model model) {
        PostTemplateForm form = new PostTemplateForm();
        form.setBlocksJson("[]");
        return editor(form, model);
    }

    @GetMapping("/{id}/edit")
    public String editForm(@PathVariable Long id, Model model) {
        return editor(PostTemplateForm.from(service.get(id)), model);
    }

    private String editor(PostTemplateForm form, Model model) {
        if (!model.containsAttribute("form")) {
            model.addAttribute("form", form);
        }
        model.addAttribute("categories", categoryService.tree());   // 1단 카테고리만
        return "template/editor";
    }

    @PostMapping
    public String create(@ModelAttribute("form") PostTemplateForm form, @AuthenticationPrincipal CurrentAdmin me,
                         Model model, RedirectAttributes redirect) {
        try {
            PostTemplate t = service.create(form.getName(), form.getTitleHint(), form.getCategoryId(),
                    form.getBlocksJson(), form.getLayoutJson(), me.getId());
            redirect.addFlashAttribute("toast", "템플릿 '" + t.getName() + "'을(를) 만들었습니다.");
            return "redirect:/admin/templates";
        } catch (BusinessException e) {
            model.addAttribute("error", e.getMessage());
            return editor(form, model);
        }
    }

    @PostMapping("/{id}")
    public String update(@PathVariable Long id, @ModelAttribute("form") PostTemplateForm form,
                         Model model, RedirectAttributes redirect) {
        form.setId(id);
        try {
            service.update(id, form.getName(), form.getTitleHint(), form.getCategoryId(), form.getBlocksJson(), form.getLayoutJson());
            redirect.addFlashAttribute("toast", "템플릿을 저장했습니다.");
            return "redirect:/admin/templates";
        } catch (BusinessException e) {
            model.addAttribute("error", e.getMessage());
            return editor(form, model);
        }
    }

    @PostMapping("/{id}/delete")
    public String delete(@PathVariable Long id, RedirectAttributes redirect) {
        service.delete(id);
        redirect.addFlashAttribute("toast", "템플릿을 삭제했습니다.");
        return "redirect:/admin/templates";
    }

    /** 저장된 템플릿을 예시 글 데이터로 프론트 화면처럼 렌더링 */
    @GetMapping("/{id}/preview")
    public String preview(@PathVariable Long id, @AuthenticationPrincipal CurrentAdmin me, Model model) {
        PostTemplate t = service.get(id);
        PostTemplateForm form = PostTemplateForm.from(t);
        return renderPreview(form, me, model);
    }

    /** 편집 중인 템플릿(폼 값)을 저장 없이 미리보기 (새 탭) */
    @PostMapping("/preview")
    public String previewDraft(@ModelAttribute("form") PostTemplateForm form, @AuthenticationPrincipal CurrentAdmin me, Model model) {
        return renderPreview(form, me, model);
    }

    private String renderPreview(PostTemplateForm form, CurrentAdmin me, Model model) {
        Post post = new Post();
        post.setTitle(form.getTitleHint() == null || form.getTitleHint().isBlank()
                ? "[" + (form.getName() == null || form.getName().isBlank() ? "템플릿" : form.getName()) + "] 예시 제목"
                : form.getTitleHint());
        post.setAuthorName(me.getName());
        post.setPublishedAt(LocalDateTime.now());
        post.setStatus(PostStatus.DRAFT);
        post.setThumbnailMode("AUTO");
        post.setBlocksJson(form.getBlocksJson() == null ? "[]" : form.getBlocksJson());
        post.setLayoutJson(form.getLayoutJson());
        if (form.getCategoryId() != null) {
            var c = categoryService.get(form.getCategoryId());
            post.setCategoryName(c.getName());
            post.setCategorySlug(c.getSlug());
        }
        post.setSummary("템플릿 미리보기입니다. 실제 글에서는 요약을 직접 쓰거나 본문 앞부분이 자동으로 들어갑니다.");
        var blocks = postService.blocksOf(post);
        model.addAttribute("post", post);
        model.addAttribute("blocks", blocks);
        model.addAttribute("layout", postService.layoutOf(post));
        model.addAttribute("toc", postService.tocOf(blocks));
        model.addAttribute("recentPosts", postService.recentPublished(null, 5));
        model.addAttribute("relatedPosts", postService.relatedPublished(post, 4));
        model.addAttribute("frontBaseUrl", properties.getFrontBaseUrl());
        model.addAttribute("previewMode", "template");
        return "front/post";
    }
}
