package egovframework.backoffice.category;

import egovframework.backoffice.common.NotFoundException;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * 카테고리(2단 구조). 2026-10-20부터 DB 표 없이 여기 정해 둔 값을 쓴다(글은 종류별 표 reviews · interviews · projects · cohort_stories 에 들어가고,
 * 후기 분야는 reviews.category 칸). 번호 · 이름 · 주소 이름(slug)은 예전 categories 표와 같아서 화면 · 주소가 그대로다.
 *   1단: 후기 · 인터뷰 · 프로젝트 · 기수별 이모저모(예전 '기수별 모아보기'와 같은 4번)
 *   2단: 후기 → 생활 · 수업 · 프로젝트 · 취업 성공 · 진로 고민
 */
@Service
public class CategoryService {

    public static final Long REVIEW_ID = 1L;
    public static final Long INTERVIEW_ID = 2L;
    public static final Long PROJECT_ID = 3L;
    public static final Long COHORT_ID = 4L;

    /** [번호, 이름, slug, 설명, 위 카테고리 번호(1단은 null)] — 순서가 화면 순서 */
    private static final Object[][] ALL = {
            {REVIEW_ID, "후기", "review", "겪어 본 사람이 직접 써요", null},
            {5L, "생활", "review-life", null, REVIEW_ID},
            {6L, "수업", "review-class", null, REVIEW_ID},
            {7L, "프로젝트", "review-project", null, REVIEW_ID},
            {33L, "취업 성공", "review-job", null, REVIEW_ID},
            {34L, "진로 고민", "review-path", null, REVIEW_ID},
            {INTERVIEW_ID, "인터뷰", "interview", "선배·교수진 인터뷰", null},
            {PROJECT_ID, "프로젝트", "project", "교육 과정에서 진행한 프로젝트", null},
            {COHORT_ID, "기수별 이모저모", "cohort", "입교식부터 수료식까지 기수마다 있었던 일", null},
    };

    private static Category make(Object[] row, int order) {
        Category c = new Category();
        c.setId((Long) row[0]);
        c.setName((String) row[1]);
        c.setSlug((String) row[2]);
        c.setDescription((String) row[3]);
        c.setParentId((Long) row[4]);
        c.setSortOrder(order);
        c.setActive(true);
        return c;
    }

    /** 평면 목록(매번 새 객체 — 화면이 children 을 채워도 서로 섞이지 않게) */
    public List<Category> findAll() {
        List<Category> out = new ArrayList<>();
        for (int i = 0; i < ALL.length; i++) {
            out.add(make(ALL[i], i + 1));
        }
        return out;
    }

    public List<Category> findActive() {
        return findAll();
    }

    /** 트리: 1단 카테고리 목록, 각 항목의 children 에 세부 카테고리 */
    public List<Category> tree() {
        List<Category> flat = findAll();
        List<Category> tops = new ArrayList<>();
        for (Category c : flat) {
            if (c.isTop()) {
                tops.add(c);
            }
        }
        for (Category c : flat) {
            if (!c.isTop()) {
                tops.stream().filter(t -> t.getId().equals(c.getParentId())).findFirst().ifPresent(t -> t.getChildren().add(c));
            }
        }
        return tops;
    }

    /** 관리 화면 필터용 트리(지금은 tree 와 같음) */
    public List<Category> treeAll() {
        return tree();
    }

    public List<Category> childrenOf(Long parentId) {
        return findAll().stream().filter(c -> parentId != null && parentId.equals(c.getParentId())).toList();
    }

    public Category get(Long id) {
        return findAll().stream().filter(c -> c.getId().equals(id)).findFirst()
                .orElseThrow(() -> new NotFoundException("카테고리를 찾을 수 없습니다."));
    }

    public Category findBySlug(String slug) {
        return slug == null || slug.isBlank() ? null : findAll().stream().filter(c -> c.getSlug().equals(slug)).findFirst().orElse(null);
    }

    /** 세부 카테고리가 지정한 카테고리의 하위가 맞는지 — 아니면 null 로 정리 */
    public Long validSubCategory(Long categoryId, Long subCategoryId) {
        if (categoryId == null || subCategoryId == null) {
            return null;
        }
        return findAll().stream().anyMatch(c -> c.getId().equals(subCategoryId) && categoryId.equals(c.getParentId())) ? subCategoryId : null;
    }
}
