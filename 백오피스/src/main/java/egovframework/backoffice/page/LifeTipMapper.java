package egovframework.backoffice.page;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface LifeTipMapper {
    /** 목록에 있는 카드(휴지통 빼고). 사이트 순서: 식당 → 카페, 각각 sort_order 순 */
    List<LifeFood> findFoods();

    /** 휴지통 포함 전부 */
    List<LifeFood> findAllFoods();

    /** 휴지통(최근에 옮긴 순, 옮긴 관리자 이름 포함) */
    List<LifeFood> findTrashedFoods();

    int insertFood(LifeFood food);

    int updateFood(LifeFood food);

    int trashFood(@Param("id") Long id, @Param("by") Long by);

    int restoreFood(@Param("id") Long id, @Param("sortOrder") int sortOrder);

    int purgeFood(@Param("id") Long id);

    /** 목록에 있는 장소(휴지통 빼고). 사이트 순서: walk → near → far, 각각 sort_order 순 */
    List<LifeSpot> findSpots();

    List<LifeSpot> findAllSpots();

    List<LifeSpot> findTrashedSpots();

    int insertSpot(LifeSpot spot);

    int updateSpot(LifeSpot spot);

    int trashSpot(@Param("id") Long id, @Param("by") Long by);

    int restoreSpot(@Param("id") Long id, @Param("sortOrder") int sortOrder);

    int purgeSpot(@Param("id") Long id);
}
