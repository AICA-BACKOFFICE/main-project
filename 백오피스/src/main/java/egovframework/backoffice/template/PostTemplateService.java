package egovframework.backoffice.template;

import egovframework.backoffice.common.BusinessException;
import egovframework.backoffice.common.NotFoundException;
import egovframework.backoffice.editor.BlockContent;
import egovframework.backoffice.editor.PostLayout;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 글쓰기 템플릿 저장·조회·삭제 규칙 (이름 검증, 본문 정화, 개수 제한). */
@Service
@Transactional
public class PostTemplateService {

    public static final int MAX_TEMPLATES = 100;

    private final PostTemplateMapper mapper;
    private final BlockContent blocks;

    public PostTemplateService(PostTemplateMapper mapper, BlockContent blocks) {
        this.mapper = mapper;
        this.blocks = blocks;
    }

    @Transactional(readOnly = true)
    public List<PostTemplate> findAll() {
        return mapper.findAll(MAX_TEMPLATES);
    }

    @Transactional(readOnly = true)
    public PostTemplate get(Long id) {
        PostTemplate t = mapper.findById(id);
        if (t == null) {
            throw new NotFoundException("템플릿을 찾을 수 없습니다.");
        }
        return t;
    }

    public PostTemplate create(String name, String titleHint, Long categoryId, String blocksJson, String layoutJson, Long adminId) {
        if (mapper.count() >= MAX_TEMPLATES) {
            throw new BusinessException("템플릿은 최대 " + MAX_TEMPLATES + "개까지 저장할 수 있습니다. 사용하지 않는 템플릿을 삭제해 주세요.");
        }
        PostTemplate t = new PostTemplate();
        apply(t, name, titleHint, categoryId, blocksJson, layoutJson);
        t.setCreatedBy(adminId);
        mapper.insert(t);
        return get(t.getId());
    }

    public PostTemplate update(Long id, String name, String titleHint, Long categoryId, String blocksJson, String layoutJson) {
        PostTemplate t = get(id);
        apply(t, name, titleHint, categoryId, blocksJson, layoutJson);
        mapper.update(t);
        return get(id);
    }

    public void delete(Long id) {
        get(id);
        mapper.delete(id);
    }

    /** 저장된 JSON → 블록 목록 */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> blocksOf(PostTemplate t) {
        return blocks.parse(t.getBlocksJson());
    }

    /** 목록 카드용 요약: 블록 수·미리보기 텍스트·첫 이미지(없으면 null) */
    public record CardInfo(int blockCount, String preview, String thumbnailUrl) { }

    @Transactional(readOnly = true)
    public CardInfo cardInfo(PostTemplate t) {
        List<Map<String, Object>> parsed = blocks.parse(t.getBlocksJson());
        return new CardInfo(parsed.size(), blocks.plainText(parsed, 90), blocks.firstImageUrl(parsed));
    }

    /** 레이아웃 객체(없으면 기본값) */
    public PostLayout layoutOf(PostTemplate t) {
        return PostLayout.parse(t.getLayoutJson());
    }

    private void apply(PostTemplate t, String name, String titleHint, Long categoryId, String blocksJson, String layoutJson) {
        String n = name == null ? "" : name.trim();
        if (n.isEmpty()) {
            throw new BusinessException("템플릿 이름을 입력하세요.");
        }
        if (n.length() > 100) {
            throw new BusinessException("템플릿 이름은 100자 이내입니다.");
        }
        List<Map<String, Object>> parsed = blocks.sanitize(blocks.parse(blocksJson));
        if (parsed.isEmpty()) {
            throw new BusinessException("본문 구성이 비어 있습니다. 블록을 하나 이상 넣은 뒤 저장하세요.");
        }
        t.setName(n);
        String hint = titleHint == null ? "" : titleHint.trim();
        t.setTitleHint(hint.length() > 200 ? hint.substring(0, 200) : hint);
        t.setCategoryId(categoryId);
        t.setBlocksJson(blocks.serialize(parsed));
        t.setLayoutJson(PostLayout.normalize(layoutJson));
    }
}
