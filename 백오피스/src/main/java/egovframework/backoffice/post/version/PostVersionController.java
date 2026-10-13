package egovframework.backoffice.post.version;

import egovframework.backoffice.account.CurrentAdmin;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

/** 버전 이력 — 편집기(static/js/post/history.js)가 fetch 로 목록·상세를 읽고, 복원은 폼 POST. */
@Controller
@RequestMapping("/admin/posts/{id}/versions")
public class PostVersionController {

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final PostVersionService versions;

    public PostVersionController(PostVersionService versions) {
        this.versions = versions;
    }

    @GetMapping
    @ResponseBody
    public List<Map<String, Object>> list(@PathVariable Long id) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (PostVersion v : versions.versionsOf(id)) {
            out.add(summary(v));
        }
        return out;
    }

    @GetMapping("/{versionId}")
    @ResponseBody
    public Map<String, Object> detail(@PathVariable Long id, @PathVariable Long versionId) {
        PostVersion v = versions.version(id, versionId);
        Map<String, Object> m = summary(v);
        m.put("summary", v.getSummary());
        m.put("categoryId", v.getCategoryId());
        m.put("categoryName", v.getCategoryName());
        m.put("thumbnailUrl", v.getThumbnailUrl());
        m.put("thumbnailMode", v.getThumbnailMode());
        m.put("blocks", versions.blocksOf(v));
        return m;
    }

    @PostMapping("/{versionId}/restore")
    public String restore(@PathVariable Long id, @PathVariable Long versionId,
                          @AuthenticationPrincipal CurrentAdmin me, RedirectAttributes redirect) {
        versions.restore(id, versionId, me.getId());
        redirect.addFlashAttribute("toast", "선택한 버전으로 복원했습니다. 복원 전 내용은 이력에 '복원 전 백업'으로 남아 있습니다.");
        return "redirect:/admin/posts/" + id + "/edit";
    }

    private static Map<String, Object> summary(PostVersion v) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", v.getId());
        m.put("reason", v.getReason());
        m.put("reasonLabel", v.getReasonLabel());
        m.put("title", v.getTitle());
        m.put("status", v.getStatus() == null ? null : v.getStatus().name());
        m.put("statusLabel", v.getStatus() == null ? "" : v.getStatus().getLabel());
        m.put("creatorName", v.getCreatorName());
        m.put("createdAt", v.getCreatedAt() == null ? null : v.getCreatedAt().format(TIME));
        return m;
    }
}
