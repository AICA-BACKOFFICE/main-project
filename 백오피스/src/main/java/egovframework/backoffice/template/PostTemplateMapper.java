package egovframework.backoffice.template;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface PostTemplateMapper {
    /** 목록(본문 포함 — 미리보기 요약 생성용, 개수 제한) */
    List<PostTemplate> findAll(@Param("limit") int limit);

    PostTemplate findById(@Param("id") Long id);

    int insert(PostTemplate t);

    int update(PostTemplate t);

    int delete(@Param("id") Long id);

    long count();
}
