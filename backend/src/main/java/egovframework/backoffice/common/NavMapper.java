package egovframework.backoffice.common;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;

/** 왼쪽 메뉴 NEW 표시용: 표마다 마지막으로 글이 생기거나 고쳐진 시각(휴지통 제외) [{kind, at}] */
@Mapper
public interface NavMapper {
    List<Map<String, Object>> lastChanges();
}
