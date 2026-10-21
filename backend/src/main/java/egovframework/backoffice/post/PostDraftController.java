package egovframework.backoffice.post;

import egovframework.backoffice.account.CurrentAdmin;
import egovframework.backoffice.common.PageResult;
import egovframework.backoffice.post.story.StoryKind;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * 임시저장 목록(2026-10-20): 아직 게시하지 않은 임시저장 글(후기 · 인터뷰 · 프로젝트 표)과 임시저장 자주 묻는 질문(faqs 표)을
 * 휴지통처럼 한 화면에 모아 종류별(kind)로 골라 본다. 최근에 고친 순.
 * 관리자 이상은 모두의 임시저장을, 서포터즈는 자기가 쓴 글만 본다(자주 묻는 질문은 관리자 이상만 다루므로 서포터즈에게는 없음).
 */
@Controller
@RequestMapping("/admin/posts")
public class PostDraftController {

    private final PostStore posts;

    public PostDraftController(PostStore posts) {
        this.posts = posts;
    }

    /** 고를 수 있는 종류(화면 칩 순서) → 이름. FAQ 는 관리자 이상만 */
    static Map<String, String> kinds(boolean withFaq) {
        Map<String, String> kinds = new LinkedHashMap<>();
        kinds.put(StoryKind.REVIEW.slug(), "후기");
        kinds.put(StoryKind.INTERVIEW.slug(), "인터뷰");
        kinds.put(StoryKind.PROJECT.slug(), "프로젝트");
        kinds.put(StoryKind.COHORT.slug(), "기수별 이모저모");
        if (withFaq) {
            kinds.put(PostStore.FAQ_KIND, "FAQ");
            kinds.put(egovframework.backoffice.page.LifeBoardService.KIND, "인사교 라이프");   // 시설 사진 · 오늘 점심 · 바람 쐬러 가요 카드
        }
        return Collections.unmodifiableMap(kinds);
    }

    @GetMapping("/drafts")
    public String drafts(@ModelAttribute("search") PostSearch search, @RequestParam(required = false) String kind,
                         @AuthenticationPrincipal CurrentAdmin me, Model model) {
        if (search.getSize() < 1 || search.getSize() > 100) {
            search.setSize(20);
        }
        boolean manager = me != null && me.getRole().canManageContent();
        Map<String, String> kinds = kinds(manager);
        String k = kind != null && kinds.containsKey(kind) ? kind : null;
        Long authorId = manager || me == null ? null : me.getId();
        List<Post> items = posts.findDrafts(search, k, authorId, manager);
        long total = posts.countDrafts(search, k, authorId, manager);
        Map<String, Long> found = posts.draftCounts(authorId, manager);
        Map<String, Long> counts = new LinkedHashMap<>();
        kinds.keySet().forEach(key -> counts.put(key, found.getOrDefault(key, 0L)));
        model.addAttribute("menu", "drafts");
        model.addAttribute("draftKind", k);
        model.addAttribute("draftKinds", kinds);
        model.addAttribute("draftCounts", counts);
        model.addAttribute("draftAll", counts.values().stream().mapToLong(Long::longValue).sum());
        model.addAttribute("mineOnly", !manager);
        model.addAttribute("result", new PageResult<>(items, search.getPage(), search.getSize(), total));
        return "post/drafts";
    }
}
