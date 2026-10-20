package egovframework.backoffice.page;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface LifeVersionMapper {
    int insert(LifeVersion version);

    /** 최근 것부터(내용 data 빼고) */
    List<LifeVersion> findBySection(@Param("section") String section);

    LifeVersion findById(@Param("id") Long id);

    int prune(@Param("section") String section, @Param("keep") int keep);
}
