package egovframework.backoffice.page;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface LifeFacilityMapper {
    /** 모든 공간의 사진(공간 · 순서대로) */
    List<LifeFacilityPhoto> findPhotos();

    int insertPhoto(LifeFacilityPhoto photo);

    /** 공간 하나의 사진 전부(저장할 때 그 공간을 통째로 다시 씀) */
    int deletePhotos(@Param("spaceId") String spaceId);

    /** [{spaceId, badge}] */
    List<Map<String, Object>> findBadges();

    int deleteBadge(@Param("spaceId") String spaceId);

    int insertBadge(@Param("spaceId") String spaceId, @Param("badge") String badge);
}
