package egovframework.backoffice.page;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 인사교 라이프 표(V29): 시설 공간 · 시설 사진 · 오늘 점심 · 바람 쐬러 가요. 휴지통은 게시글과 같은 규칙(status DELETED · status_before_trash · deleted_at).
 * table 인자는 {@link LifeBoardService#TABLES} 의 값(life_facility_photos · life_foods · life_spots)만 넣는다.
 */
@Mapper
public interface LifeMapper {

    long countAll();

    // ── 공간 ──
    List<LifeSpace> findSpaces();

    int insertSpace(LifeSpace space);

    int updateSpace(LifeSpace space);

    // ── 카드(휴지통 아닌 것, 순서대로) ──
    List<LifeItem> findPhotos();

    List<LifeItem> findFoods();

    List<LifeItem> findSpots();

    /** 카드 하나(휴지통 포함) */
    LifeItem findPhoto(@Param("id") Long id);

    LifeItem findFood(@Param("id") Long id);

    LifeItem findSpot(@Param("id") Long id);

    int insertPhoto(LifeItem item);

    int insertFood(LifeItem item);

    int insertSpot(LifeItem item);

    int updatePhoto(LifeItem item);

    int updateFood(LifeItem item);

    int updateSpot(LifeItem item);

    /** 그 묶음(공간 · 식당/카페 · 바람 쐬러 가요 묶음)의 다음 순서 번호 */
    int nextPhotoOrder(@Param("spaceId") String spaceId);

    int nextFoodOrder(@Param("kind") String kind);

    int nextSpotOrder(@Param("groupKey") String groupKey);

    // ── 표마다 같은 일 ──
    int updateOrder(@Param("table") String table, @Param("id") Long id, @Param("sortOrder") int sortOrder);

    /** 휴지통으로: 옮기기 전 상태를 남기고 삭제됨으로 */
    int softDelete(@Param("table") String table, @Param("id") Long id);

    /** 복원: 휴지통으로 옮기기 전 상태로(적힌 상태가 없으면 임시저장) */
    int restore(@Param("table") String table, @Param("id") Long id);

    int hardDelete(@Param("table") String table, @Param("id") Long id);

    List<LifeItem> lockDeleted(@Param("table") String table, @Param("ids") List<Long> ids);

    List<LifeItem> lockAllDeleted(@Param("table") String table);
}
