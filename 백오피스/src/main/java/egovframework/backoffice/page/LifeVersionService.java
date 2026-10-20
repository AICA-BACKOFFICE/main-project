package egovframework.backoffice.page;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import egovframework.backoffice.common.NotFoundException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;

/**
 * 인사교 라이프 버전 기록: 오늘 점심(food) · 바람 쐬러 가요(fun) · 시설 사진(fac) 목록을 바꿀 때마다 바로 전 모습을 통째로 남긴다.
 * 묶음마다 최근 {@link #KEEP}개만 둔다. 되돌리기는 {@link LifePhotoService#restore} 가 그 모습을 저장하는 것과 같은 길로 한다.
 */
@Service
public class LifeVersionService {

    static final Set<String> SECTIONS = Set.of("food", "fun", "fac");
    static final int KEEP = 50;
    private static final Map<String, String> REASONS = Map.of(
            "SAVE", "저장 전", "RESTORE", "되돌리기 전", "TRASH_RESTORE", "휴지통에서 꺼내기 전");

    private final LifeVersionMapper mapper;
    private final ObjectMapper json;

    public LifeVersionService(LifeVersionMapper mapper, ObjectMapper json) {
        this.mapper = mapper;
        this.json = json;
    }

    /** 바꾸기 바로 전 모습(snapshot)을 남긴다 */
    public void record(String section, String reason, Object snapshot, String summary, Long by) {
        LifeVersion v = new LifeVersion();
        v.setSection(section);
        v.setReason(reason);
        v.setSummary(summary.length() > 200 ? summary.substring(0, 200) : summary);
        try {
            v.setData(json.writeValueAsString(snapshot));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
        v.setCreatedBy(by);
        mapper.insert(v);
        mapper.prune(section, KEEP);
    }

    /** 화면에 보일 목록(최근 것부터): 번호 · 시각 · 누가 · 무엇을 하기 전 · 요약 */
    public List<Map<String, Object>> list(String section) {
        if (!SECTIONS.contains(section)) {
            throw new NotFoundException("알 수 없는 묶음이에요.");
        }
        return mapper.findBySection(section).stream().map(v -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", v.getId());
            m.put("at", v.getCreatedAt() == null ? "" : v.getCreatedAt().toString().replace('T', ' ').replaceAll("\\.\\d+$", ""));
            m.put("by", v.getCreatedByName() == null ? "" : v.getCreatedByName());
            m.put("reason", REASONS.getOrDefault(v.getReason(), v.getReason()));
            m.put("summary", v.getSummary());
            return m;
        }).toList();
    }

    public LifeVersion get(Long id) {
        LifeVersion v = id == null ? null : mapper.findById(id);
        if (v == null) {
            throw new NotFoundException("버전 기록을 찾지 못했어요.");
        }
        return v;
    }
}
