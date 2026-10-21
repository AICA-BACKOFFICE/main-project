package egovframework.backoffice.media;

import egovframework.backoffice.account.CurrentAdmin;
import egovframework.backoffice.common.BusinessException;
import egovframework.backoffice.common.NotFoundException;
import egovframework.backoffice.common.PageResult;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * 미디어 관리(2026-10-20, 표 media V25): 관리자 · 서포터즈가 올린 사진 · 동영상을 모두 함께 쓴다.
 * 파일은 저장소({@link ImageStorageService})에, 표에는 이름 · 종류 · 저장소 안 위치(storage_key) · 크기 · 올린 사람만 적는다.
 * <ul>
 *   <li>올리기 · 고르기(글쓰기 화면의 '미디어에서 고르기'): 로그인한 모든 사람. 글쓰기 화면에서 올린 사진 · 동영상도 여기에 남는다</li>
 *   <li>이름 바꾸기 · 삭제: 관리자 이상은 모두, 서포터즈는 자기가 올린 미디어만. 이름을 바꿔도 파일 · 주소는 그대로</li>
 *   <li>삭제는 휴지통으로(복원 · 완전 삭제는 휴지통 화면, PostTrashService). 완전 삭제하면 저장소의 파일도 지운다</li>
 * </ul>
 */
@Service
public class MediaService {

    private static final Logger log = LoggerFactory.getLogger(MediaService.class);
    public static final int MAX_NAME = 200;
    public static final int MAX_FILES = 20;

    private final MediaMapper mapper;
    private final ImageStorageService storage;

    public MediaService(MediaMapper mapper, ImageStorageService storage) {
        this.mapper = mapper;
        this.storage = storage;
    }

    // ── 목록 ──

    /** type: IMAGE · VIDEO · null(전체) */
    @Transactional(readOnly = true)
    public PageResult<MediaItem> list(String type, String keyword, int page, int size, CurrentAdmin me) {
        String t = type(type);
        String q = keyword == null ? null : keyword.trim();
        int p = Math.max(page, 1);
        List<MediaItem> items = mapper.findLive(t, q, (p - 1) * size, size);
        items.forEach(item -> decorate(item, me, true));
        return new PageResult<>(items, p, size, mapper.countLive(t, q));
    }

    private static String type(String type) {
        return "IMAGE".equals(type) || "VIDEO".equals(type) ? type : null;
    }

    private void decorate(MediaItem item, CurrentAdmin me, boolean withUsage) {
        item.setUrl(storage.url(item.getStorageKey()));
        item.setPostSrc(ImageStorageService.UPLOAD_PREFIX + item.getStorageKey());
        item.setEditable(canEdit(item, me));
        if (withUsage) {
            item.setUsage(usage(item.getStorageKey()));
        }
    }

    /** 이 파일을 쓰는 게시글 수 */
    public long usage(String key) {
        return mapper.usage("%" + key + "%");
    }

    /** 관리자 이상은 모든 미디어, 서포터즈는 자기가 올린 미디어만 */
    public static boolean canEdit(MediaItem item, CurrentAdmin me) {
        return me != null && (me.getRole().canManageContent() || Objects.equals(item.getUploadedBy(), me.getId()));
    }

    private MediaItem editable(Long id, CurrentAdmin me) {
        MediaItem item = mapper.findLiveById(id);
        if (item == null) {
            throw new NotFoundException("미디어를 찾을 수 없습니다.");
        }
        if (!canEdit(item, me)) {
            throw new AccessDeniedException("서포터즈는 자기가 올린 미디어만 이름을 바꾸거나 삭제할 수 있어요.");
        }
        return item;
    }

    // ── 올리기 · 고치기 · 삭제 ──

    /** 미디어 관리에서 여러 개 올리기(사진 · 동영상만) → 올린 미디어 */
    @Transactional
    public List<MediaItem> upload(List<MultipartFile> files, CurrentAdmin me) {
        List<MultipartFile> list = files == null ? List.of() : files.stream().filter(f -> f != null && !f.isEmpty()).toList();
        if (list.isEmpty()) {
            throw new BusinessException("올릴 사진이나 동영상을 골라 주세요.");
        }
        if (list.size() > MAX_FILES) {
            throw new BusinessException("한 번에 " + MAX_FILES + "개까지 올릴 수 있어요.");
        }
        List<MediaItem> out = new ArrayList<>();
        for (MultipartFile file : list) {
            out.add(record(storage.storeMedia(file), me));
        }
        return out;
    }

    /** 저장한 파일을 미디어 표에 남긴다(글쓰기 화면에서 올린 사진 · 동영상도). 문서(PDF)는 남기지 않음 → null */
    @Transactional
    public MediaItem record(ImageStorageService.Stored stored, CurrentAdmin me) {
        if (!"IMAGE".equals(stored.kind()) && !"VIDEO".equals(stored.kind())) {
            return null;
        }
        MediaItem item = new MediaItem();
        item.setMediaType(stored.kind());
        item.setName(defaultName(stored.name()));
        item.setOriginalName(stored.name());
        item.setStorageKey(stored.key());
        item.setContentType(stored.contentType());
        item.setFileSize(stored.size());
        item.setUploadedBy(me == null ? null : me.getId());
        mapper.insert(item);
        decorate(item, me, false);
        return item;
    }

    /** 처음 이름: 파일 이름에서 확장자를 뺀 것 */
    private static String defaultName(String fileName) {
        String name = fileName == null ? "" : fileName.trim();
        int dot = name.lastIndexOf('.');
        if (dot > 0) {
            name = name.substring(0, dot);
        }
        name = name.isBlank() ? "이름 없음" : name;
        return name.length() > MAX_NAME ? name.substring(0, MAX_NAME) : name;
    }

    @Transactional
    public MediaItem rename(Long id, String name, CurrentAdmin me) {
        editable(id, me);
        String clean = name == null ? "" : name.replaceAll("\\s+", " ").trim();
        if (clean.isEmpty()) {
            throw new BusinessException("미디어 이름을 써 주세요.");
        }
        if (clean.length() > MAX_NAME) {
            throw new BusinessException("미디어 이름은 " + MAX_NAME + "자까지예요.");
        }
        mapper.rename(id, clean);
        MediaItem item = mapper.findLiveById(id);
        decorate(item, me, false);
        return item;
    }

    /** 휴지통으로(파일은 그대로 — 완전 삭제할 때 지움). 지운 미디어 */
    @Transactional
    public MediaItem moveToTrash(Long id, CurrentAdmin me) {
        MediaItem item = editable(id, me);
        mapper.softDelete(id);
        return item;
    }

    // ── 휴지통(PostTrashService 가 휴지통 화면에서 부름 · 같은 트랜잭션) ──

    public MediaItem getDeleted(Long id) {
        MediaItem item = mapper.findDeleted(id);
        if (item == null) {
            throw new NotFoundException("휴지통에서 미디어를 찾을 수 없습니다.");
        }
        return item;
    }

    public MediaItem restore(Long id) {
        MediaItem before = getDeleted(id);
        mapper.restore(id);
        return before;
    }

    public void purge(Long id) {
        purgeLocked(getDeleted(id));
    }

    public List<MediaItem> lockDeleted(List<Long> ids) {
        return ids.isEmpty() ? List.of() : mapper.lockDeleted(ids);
    }

    public List<MediaItem> lockAllDeleted() {
        return mapper.lockAllDeleted();
    }

    public void restoreLocked(Long id) {
        mapper.restore(id);
    }

    /** 완전 삭제: 표에서 지우고 저장소의 파일도 지운다 */
    public void purgeLocked(MediaItem item) {
        if (mapper.hardDelete(item.getId()) > 0) {
            storage.delete(item.getStorageKey());
        }
    }

    // ── 처음 켤 때 ──

    /** 업로드 폴더에 이미 있는 사진 · 동영상(미디어 표가 생기기 전에 글쓰기 화면에서 올린 것)을 미디어로 등록한다. 등록한 수 */
    @Transactional
    public int importExisting() {
        int n = 0;
        for (ImageStorageService.Existing file : storage.existing()) {
            if (mapper.countByKey(file.key()) > 0) {
                continue;
            }
            String fileName = file.key().substring(file.key().lastIndexOf('/') + 1);
            MediaItem item = new MediaItem();
            item.setMediaType(ImageStorageService.kindOf(file.contentType()));
            item.setName(defaultName(fileName));
            item.setOriginalName(fileName);
            item.setStorageKey(file.key());
            item.setContentType(file.contentType());
            item.setFileSize(file.size());
            mapper.insert(item);
            n++;
        }
        return n;
    }

    @EventListener(ContextRefreshedEvent.class)
    public void onReady() {
        try {
            int n = importExisting();
            if (n > 0) {
                log.info("업로드 폴더에 있던 사진 · 동영상 {}개를 미디어로 등록했습니다.", n);
            }
        } catch (RuntimeException e) {
            log.warn("업로드 폴더의 파일을 미디어로 등록하지 못했습니다.", e);
        }
    }
}
