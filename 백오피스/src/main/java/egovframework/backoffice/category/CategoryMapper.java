package egovframework.backoffice.category;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CategoryMapper {
    List<Category> findAll();

    List<Category> findActive();

    Category findById(@Param("id") Long id);

    Category findBySlug(@Param("slug") String slug);

    /** 특정 카테고리의 세부 카테고리(활성만) */
    List<Category> findActiveChildren(@Param("parentId") Long parentId);

    int insert(Category category);

    int update(Category category);

    int delete(@Param("id") Long id);

    int updateSortOrder(@Param("id") Long id, @Param("sortOrder") int sortOrder);

    long countPosts(@Param("id") Long id);
}
