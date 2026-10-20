package egovframework.backoffice.page;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface FaqMapper {
    /** 사이트 순서(sort_order) */
    List<FaqItem> findAll();

    int insert(FaqItem item);

    int update(FaqItem item);

    int delete(@Param("id") Long id);
}
