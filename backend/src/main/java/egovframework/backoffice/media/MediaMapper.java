package egovframework.backoffice.media;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** 미디어 표(media, V25). 휴지통은 다른 게시글 표와 같은 규칙(status DELETED · status_before_trash · deleted_at) */
@Mapper
public interface MediaMapper {

    int insert(MediaItem item);

    /** 휴지통이 아닌 미디어, 최근 올린 순. type: IMAGE · VIDEO(없으면 전체), keyword: 이름 · 처음 파일 이름 */
    List<MediaItem> findLive(@Param("type") String type, @Param("keyword") String keyword,
                             @Param("offset") int offset, @Param("size") int size);

    long countLive(@Param("type") String type, @Param("keyword") String keyword);

    /** 휴지통이 아닌 미디어 하나 */
    MediaItem findLiveById(@Param("id") Long id);

    /** 저장소 위치로(휴지통 포함) — 이미 등록된 파일인지 */
    long countByKey(@Param("key") String key);

    int rename(@Param("id") Long id, @Param("name") String name);

    /** 이 저장소 위치의 파일을 쓰는 게시글 수(후기 · 인터뷰 · 프로젝트의 사진 칸, 휴지통 글 포함) */
    long usage(@Param("pattern") String pattern);

    int softDelete(@Param("id") Long id);

    MediaItem findDeleted(@Param("id") Long id);

    int restore(@Param("id") Long id);

    int hardDelete(@Param("id") Long id);

    /** 휴지통의 이 미디어들을 잠근다. 번호 · 저장소 위치 · 지운 시각 */
    List<MediaItem> lockDeleted(@Param("ids") List<Long> ids);

    List<MediaItem> lockAllDeleted();
}
