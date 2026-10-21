package egovframework.backoffice.post;

import egovframework.backoffice.category.Category;
import egovframework.backoffice.category.CategoryService;
import egovframework.backoffice.common.NotFoundException;
import egovframework.backoffice.editor.BlockContent;
import egovframework.backoffice.editor.PostLayout;
import egovframework.backoffice.post.story.StoryContent;
import egovframework.backoffice.post.story.StoryKind;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Component;

/** 폼 입력 → 게시물 반영 규칙(정화·요약 자동 생성·대표 이미지). 저장·미리보기·버전 복원이 함께 쓴다. */
@Component
public class PostAssembler {

    private final BlockContent blocks;
    private final CategoryService categories;
    private final StoryContent stories;

    public PostAssembler(BlockContent blocks, CategoryService categories, StoryContent stories) {
        this.blocks = blocks;
        this.categories = categories;
        this.stories = stories;
    }

    public Post apply(Post post, PostForm form) {
        List<Map<String, Object>> parsed = blocks.sanitize(blocks.parse(form.getBlocksJson()));
        post.setTitle(form.getTitle().trim());
        post.setCategoryId(form.getCategoryId());
        // 세부 카테고리는 선택한 카테고리의 하위일 때만 저장(카테고리를 바꾸면 자동으로 비워진다)
        post.setSubCategoryId(categories.validSubCategory(form.getCategoryId(), form.getSubCategoryId()));
        post.setStatus(form.getStatus());
        post.setBlocksJson(blocks.serialize(parsed));
        post.setLayoutJson(PostLayout.normalize(form.getLayoutJson()));

        String summary = form.getSummary() == null ? "" : form.getSummary().trim();
        post.setSummary(summary.isEmpty() ? blocks.plainText(parsed, 160) : summary);

        boolean manual = "MANUAL".equals(form.getThumbnailMode())
                && form.getThumbnailUrl() != null && !form.getThumbnailUrl().isBlank();
        post.setThumbnailMode(manual ? "MANUAL" : "AUTO");
        post.setThumbnailUrl(manual ? form.getThumbnailUrl().trim() : blocks.firstImageUrl(parsed));
        applyStory(post, form);
        return post;
    }

    /**
     * 선배들의 이야기(후기·인터뷰·프로젝트·기수별 모아보기) 고정 양식: 양식 값을 정리해 저장하고,
     * 요약·대표 이미지·세부 카테고리(후기 분야 · 기수)와 관리자 화면용 본문 블록을 양식 값으로 채운다. 다른 카테고리는 양식 값을 비운다.
     */
    private void applyStory(Post post, PostForm form) {
        StoryKind kind = storyKindOf(form.getCategoryId());
        String raw = form.getStoryJson();
        if (kind == null || raw == null || raw.isBlank()) {
            post.setStoryJson(null);
            return;
        }
        Map<String, Object> story = stories.normalize(kind, raw, form.getStatus() == PostStatus.PUBLISHED);
        post.setStoryJson(stories.serialize(story));
        post.setBlocksJson(blocks.serialize(blocks.sanitize(stories.toBlocks(kind, story))));
        String summary = stories.summaryOf(story);
        post.setSummary(summary.length() > 500 ? summary.substring(0, 499) + "…" : summary);
        post.setThumbnailMode("AUTO");
        post.setThumbnailUrl(stories.thumbnail(story));
        String subSlug = stories.subCategorySlug(kind, story);
        Category sub = subSlug == null ? null : categories.findBySlug(subSlug);
        post.setSubCategoryId(sub != null && Objects.equals(sub.getParentId(), form.getCategoryId()) ? sub.getId() : null);
    }

    /** 선배들의 이야기 고정 양식을 쓰는 카테고리면 그 종류, 아니면 null */
    public StoryKind storyKindOf(Long categoryId) {
        if (categoryId == null) {
            return null;
        }
        try {
            return StoryKind.ofSlug(categories.get(categoryId).getSlug());
        } catch (NotFoundException e) {
            return null;
        }
    }

    /** 저장된 레이아웃 JSON → 레이아웃 객체(없으면 기본값) */
    public PostLayout layoutOf(String layoutJson) {
        return PostLayout.parse(layoutJson);
    }

    /**
     * 목차(사이드바 toc 위젯용): 본문의 제목 블록을 순서대로 {index, level, text}. index 는 blocks.html 이 제목에 붙이는 id(h-{index})와 같다.
     */
    public List<Map<String, Object>> toc(List<Map<String, Object>> parsed) {
        List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (int i = 0; i < parsed.size(); i++) {
            Map<String, Object> b = parsed.get(i);
            if (!"heading".equals(b.get("type"))) {
                continue;
            }
            String text = org.jsoup.Jsoup.parse(String.valueOf(b.getOrDefault("html", ""))).text().trim();
            if (text.isEmpty()) {
                continue;
            }
            Object lv = b.get("level");
            Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("index", i);
            m.put("level", lv instanceof Number num ? num.intValue() : 2);
            m.put("text", text.length() > 60 ? text.substring(0, 60) + "…" : text);
            out.add(m);
        }
        return out;
    }

    /** 저장된 JSON → 블록 목록 (미리보기·이력 응답용) */
    public List<Map<String, Object>> blocksOf(String blocksJson) {
        return blocks.parse(blocksJson);
    }
}
