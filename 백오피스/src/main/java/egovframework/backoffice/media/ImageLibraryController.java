package egovframework.backoffice.media;

import egovframework.backoffice.account.CurrentAdmin;
import egovframework.backoffice.category.Category;
import egovframework.backoffice.common.BusinessException;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

/**
 * 미디어 관리 화면(/admin/media): 게시물과 같은 카테고리(2단)로 이미지·동영상·문서를 분류해 두고 글쓰기 보관함에서 꺼내 쓴다.
 *  GET  /admin/media?cat=all|unfiled|{categoryId}&sub={subCategoryId}&kind=ALL|IMAGE|VIDEO|DOC&keyword=&page=
 *  POST /admin/media/upload                 여러 개 업로드(분류 지정) — JS 없이 제출될 때의 대비용
 *  POST /admin/media/{id}/rename            표시 이름 변경
 *  POST /admin/media/{id}/move              분류 이동
 *  POST /admin/media/{id}/delete            완전 삭제
 */
@Controller
@RequestMapping("/admin/media")
public class ImageLibraryController {

    private static final int PAGE_SIZE = 40;

    private final ImageStorageService storage;

    public ImageLibraryController(ImageStorageService storage) {
        this.storage = storage;
    }

    @ModelAttribute("menu")
    public String menu() {
        return "media";
    }

    @GetMapping
    public String list(@RequestParam(defaultValue = "all") String cat,
                       @RequestParam(required = false) Long sub,
                       @RequestParam(defaultValue = "ALL") String kind,
                       @RequestParam(required = false) String keyword,
                       @RequestParam(defaultValue = "1") int page,
                       Model model) {
        List<Category> tree = storage.categoryTreeWithCounts();
        Long categoryId = null;
        boolean unfiled = false;
        Category current = null;
        if ("unfiled".equals(cat)) {
            unfiled = true;
        } else if (!"all".equals(cat)) {
            try {
                categoryId = Long.valueOf(cat);
            } catch (NumberFormatException e) {
                cat = "all";
            }
            for (Category c : tree) {
                if (c.getId().equals(categoryId)) {
                    current = c;
                }
            }
            if (current == null) {
                cat = "all";
                categoryId = null;
            }
        }
        Long subId = null;
        if (current != null && sub != null) {
            for (Category s : current.getChildren()) {
                if (s.getId().equals(sub)) {
                    subId = sub;
                }
            }
        }
        String k = List.of("IMAGE", "VIDEO", "DOC").contains(kind) ? kind : "ALL";
        model.addAttribute("tree", tree);
        model.addAttribute("cat", cat);
        model.addAttribute("current", current);
        model.addAttribute("sub", subId);
        model.addAttribute("kind", k);
        model.addAttribute("keyword", keyword);
        model.addAttribute("totalAll", storage.countAll());
        model.addAttribute("totalUnfiled", storage.countUnfiled());
        model.addAttribute("countImage", storage.countByKind("IMAGE"));
        model.addAttribute("countVideo", storage.countByKind("VIDEO"));
        model.addAttribute("countDoc", storage.countByKind("DOC"));
        model.addAttribute("totalBytes", storage.totalBytes());
        model.addAttribute("result", storage.search(MediaQuery.of(categoryId, subId, unfiled, k, keyword), Math.max(page, 1), PAGE_SIZE));
        return "media/library";
    }

    @PostMapping("/upload")
    public String upload(@RequestParam("files") List<MultipartFile> files,
                         @RequestParam(required = false) Long categoryId,
                         @RequestParam(required = false) Long subCategoryId,
                         @AuthenticationPrincipal CurrentAdmin me,
                         RedirectAttributes redirect) {
        int ok = 0;
        String firstError = null;
        for (MultipartFile f : files) {
            if (f == null || f.isEmpty()) {
                continue;
            }
            try {
                storage.store(f, me.getId(), categoryId, subCategoryId);
                ok++;
            } catch (BusinessException e) {
                if (firstError == null) {
                    firstError = f.getOriginalFilename() + ": " + e.getMessage();
                }
            }
        }
        if (ok > 0) {
            redirect.addFlashAttribute("toast", ok + "개 파일을 업로드했습니다." + (firstError != null ? " (일부 실패)" : ""));
        }
        if (firstError != null) {
            redirect.addFlashAttribute("toastError", firstError);
        } else if (ok == 0) {
            redirect.addFlashAttribute("toastError", "업로드할 파일을 선택하세요.");
        }
        return redirectTo(categoryId == null ? "unfiled" : String.valueOf(categoryId), subCategoryId, "ALL");
    }

    /** 표시 이름 변경(저장 파일명·URL 불변) */
    @PostMapping("/{id}/rename")
    public String rename(@PathVariable Long id, @RequestParam String displayName,
                         @RequestParam(defaultValue = "all") String back, @RequestParam(required = false) Long backSub,
                         @RequestParam(defaultValue = "ALL") String kind, RedirectAttributes redirect) {
        try {
            storage.rename(id, displayName);
            redirect.addFlashAttribute("toast", "표시 이름을 바꿨습니다.");
        } catch (BusinessException e) {
            redirect.addFlashAttribute("toastError", e.getMessage());
        }
        return redirectTo(back, backSub, kind);
    }

    /** 분류 이동 — categoryId 가 비면 미분류 */
    @PostMapping("/{id}/move")
    public String move(@PathVariable Long id, @RequestParam(required = false) Long categoryId,
                       @RequestParam(required = false) Long subCategoryId,
                       @RequestParam(defaultValue = "all") String back, @RequestParam(required = false) Long backSub,
                       @RequestParam(defaultValue = "ALL") String kind, RedirectAttributes redirect) {
        try {
            storage.move(id, categoryId, subCategoryId);
            redirect.addFlashAttribute("toast", categoryId == null ? "미분류로 옮겼습니다." : "분류를 옮겼습니다.");
        } catch (BusinessException e) {
            redirect.addFlashAttribute("toastError", e.getMessage());
        }
        return redirectTo(back, backSub, kind);
    }

    @PostMapping("/{id}/delete")
    public String delete(@PathVariable Long id, @RequestParam(defaultValue = "all") String back,
                         @RequestParam(required = false) Long backSub, @RequestParam(defaultValue = "ALL") String kind,
                         RedirectAttributes redirect) {
        storage.delete(id);
        redirect.addFlashAttribute("toast", "파일을 삭제했습니다.");
        return redirectTo(back, backSub, kind);
    }

    private static String redirectTo(String cat, Long sub, String kind) {
        return "redirect:/admin/media?cat=" + cat + (sub != null ? "&sub=" + sub : "") + "&kind=" + (kind == null ? "ALL" : kind);
    }
}
