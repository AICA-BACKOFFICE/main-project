package egovframework.backoffice.page;

import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** 카테고리 페이지 버전 기록 표(page_versions, V28). 사이트에 반영할 때마다 페이지 HTML 전체를 한 줄로 */
@Mapper
public interface PageVersionMapper {

    /** createdAt 이 있으면 그 시각으로(예전 백업 파일 옮기기), 없으면 지금 */
    int insert(PageVersion version);

    /** 이 페이지의 가장 최근 기록 지문. 없으면 null */
    String latestHash(@Param("pageId") String pageId);

    /** 이 페이지의 기록(최신 순, HTML 빼고) */
    List<PageVersion> findByPage(@Param("pageId") String pageId);

    /** 기록 하나의 HTML. 이 페이지 것이 아니면 null */
    String findHtml(@Param("pageId") String pageId, @Param("id") Long id);

    /** 이 페이지를 마지막으로 기록한 시각(왼쪽 메뉴 NEW) */
    LocalDateTime lastSaved(@Param("pageId") String pageId);

    /** 최근 keep 개보다 오래된 기록 번호 */
    List<Long> idsBeyond(@Param("pageId") String pageId, @Param("keep") int keep);

    int deleteIds(@Param("ids") List<Long> ids);

    long countAll();
}
