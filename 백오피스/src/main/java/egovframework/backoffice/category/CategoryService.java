package egovframework.backoffice.category;

import egovframework.backoffice.common.NotFoundException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 카테고리 조회 전용(2단 구조). 관리 화면은 없고 값은 Flyway(V7)로 심는다 — 바꿀 일이 있으면 DB categories 테이블에서 직접.
 *   1단: 후기 · 인터뷰 · 프로젝트 · 기수별 모아보기
 *   2단: 후기 → 생활·수업·프로젝트·취업·진로 / 기수별 모아보기 → 3~5기·6기·7기
 */
@Service
@Transactional(readOnly = true)
public class CategoryService {

    private final CategoryMapper mapper;

    public CategoryService(CategoryMapper mapper) {
        this.mapper = mapper;
    }

    /** 전체(비활성 포함) 평면 목록 */
    public List<Category> findAll() {
        return mapper.findAll();
    }

    /** 활성 평면 목록 */
    public List<Category> findActive() {
        return mapper.findActive();
    }

    /** 활성 트리: 1단 카테고리 목록, 각 항목의 children 에 세부 카테고리 */
    public List<Category> tree() {
        return toTree(mapper.findActive());
    }

    /** 전체(비활성 포함) 트리 — 관리 화면 필터용 */
    public List<Category> treeAll() {
        return toTree(mapper.findAll());
    }

    public List<Category> childrenOf(Long parentId) {
        return mapper.findActiveChildren(parentId);
    }

    public Category get(Long id) {
        Category c = mapper.findById(id);
        if (c == null) {
            throw new NotFoundException("카테고리를 찾을 수 없습니다.");
        }
        return c;
    }

    public Category findBySlug(String slug) {
        return slug == null || slug.isBlank() ? null : mapper.findBySlug(slug);
    }

    /** 세부 카테고리가 지정한 카테고리의 하위가 맞는지 — 아니면 null 로 정리 */
    public Long validSubCategory(Long categoryId, Long subCategoryId) {
        if (categoryId == null || subCategoryId == null) {
            return null;
        }
        Category sub = mapper.findById(subCategoryId);
        return sub != null && categoryId.equals(sub.getParentId()) ? subCategoryId : null;
    }

    private static List<Category> toTree(List<Category> flat) {
        Map<Long, Category> tops = flat.stream().filter(Category::isTop)
                .collect(Collectors.toMap(Category::getId, c -> c, (a, b) -> a, java.util.LinkedHashMap::new));
        List<Category> orphans = new ArrayList<>();
        for (Category c : flat) {
            if (!c.isTop()) {
                Category parent = tops.get(c.getParentId());
                if (parent != null) {
                    parent.getChildren().add(c);
                } else {
                    orphans.add(c);
                }
            }
        }
        List<Category> out = new ArrayList<>(tops.values());
        out.addAll(orphans);
        return out;
    }
}
