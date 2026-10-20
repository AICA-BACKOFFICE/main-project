package egovframework.backoffice.page;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import egovframework.backoffice.common.BusinessException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 인사교 라이프 › 시설 둘러보기 사진(DB: life_facility_photos · life_facility_spaces).
 * <p>
 * 층 · 공간 이름과 안내 글은 사이트 페이지(life/index.html, 카테고리 페이지 관리에서 고침)에 그대로 두고, 공간(bx9s-층-번호)마다의
 * 사진 넘김 · 작은 사진 · 첫 사진 설명과 'N장' · 공간 탭 아이콘 · '사진 예시' 표시는 DB의 사진으로 사이트(life/js/life-render.js)가 그린다.
 * 사진 하나는 사이트에 원래 있던 그림(class im-이름, life.css) 또는 올린 사진(assets/uploads/…) 중 하나이고, 확대(zoom) · 보일 곳(pos)을 고른다.
 * 처음 켤 때 DB가 비어 있으면 페이지에 적혀 있던 사진을, 그것도 없으면 사본(life/js/life-data.js 의 fac)을 옮겨 온다.
 */
@Service
public class LifeFacilityService {

    private static final Logger log = LoggerFactory.getLogger(LifeFacilityService.class);

    static final String PAGE_ID = "life";
    static final int MAX_PHOTOS = 12;
    static final int MAX_CAPTION = 60;
    static final Set<String> BADGES = Set.of("", "ex", "tmp");

    private static final Pattern IM_CLASS = Pattern.compile("im-[A-Za-z0-9_-]+");
    private static final Pattern UPLOAD_SRC = Pattern.compile("assets/uploads/[A-Za-z0-9_.-]+\\.(?:webp|png|jpe?g|gif|avif)", Pattern.CASE_INSENSITIVE);
    private static final Pattern SIZE = Pattern.compile("(\\d{3})%");
    private static final String POS_WORD = "(?:\\d{1,3}%|left|right|center|top|bottom)";
    private static final Pattern POS = Pattern.compile(POS_WORD + "(?: " + POS_WORD + ")?");
    private static final Pattern BG_URL = Pattern.compile("url\\(\\s*[\"']?([^\"')]+)[\"']?\\s*\\)");

    /** 사진 하나: cls(원래 그림) 또는 src(올린 그림) 중 하나 · bs 확대 · bp 보이는 위치 · caption 설명 */
    public record Photo(String cls, String src, String bs, String bp, String caption) { }

    /** 공간 하나: badge = "" 표시 안 함 · "ex" 사진 예시 · "tmp" 임시 사진 */
    public record SpaceEdit(String id, String badge, List<Photo> photos) { }

    private final CategoryPageService pages;
    private final LifeFacilityMapper mapper;
    private final LifeVersionService versions;
    private final ObjectMapper json;
    private final TransactionTemplate tx;

    public LifeFacilityService(CategoryPageService pages, LifeFacilityMapper mapper, LifeVersionService versions, ObjectMapper json, TransactionTemplate tx) {
        this.pages = pages;
        this.mapper = mapper;
        this.versions = versions;
        this.json = json;
        this.tx = tx;
    }

    // ── 읽기 ──

    /** 페이지의 층 · 공간(이름 포함). 사진은 빈 목록(관리 화면이 DB 사진을 채움) */
    public List<Map<String, Object>> floors(Document doc) {
        Element root = doc.selectFirst("#pg-facility .bx9");
        if (root == null) {
            throw new BusinessException("인사교 라이프 페이지에서 시설 둘러보기(건물 · 사진)를 찾지 못했어요.");
        }
        List<Map<String, Object>> floors = new ArrayList<>();
        for (Element g : root.select(".bx9-g")) {
            Map<String, Object> floor = new LinkedHashMap<>();
            floor.put("g", g.attr("data-g"));
            Element fb = g.selectFirst(".bx9-fb");
            Element h3 = g.selectFirst(".bx9-head h3");
            floor.put("floor", fb == null ? "" : fb.text());
            floor.put("name", h3 == null ? g.attr("aria-label") : h3.text());
            List<Map<String, Object>> spaces = new ArrayList<>();
            for (Element s : g.select(".bx9-s")) {
                Map<String, Object> space = new LinkedHashMap<>();
                space.put("id", s.id());
                space.put("name", spaceName(doc, s));
                spaces.add(space);
            }
            floor.put("spaces", spaces);
            floors.add(floor);
        }
        return floors;
    }

    /** 공간 이름: 공간 탭의 글자. 공간이 하나뿐인 층(8F 구내식당)은 탭이 없어 안내 카드 제목 · 층 이름으로 */
    static String spaceName(Document doc, Element space) {
        String tabId = space.attr("aria-labelledby");
        Element tab = tabId.isEmpty() ? null : doc.getElementById(tabId);
        Element b = tab == null ? null : tab.selectFirst("b");
        if (b != null) {
            return b.text();
        }
        Element h4 = space.selectFirst(".bx9-info h4");
        if (h4 != null && !h4.text().isBlank()) {
            return h4.text();
        }
        Element g = space.closest(".bx9-g");
        Element h3 = g == null ? null : g.selectFirst(".bx9-head h3");
        return h3 != null ? h3.text() : space.id();
    }

    /** 지금 DB의 공간별 사진 · 표시(공간 순서는 이름순) */
    public Map<String, SpaceEdit> spaces() {
        Map<String, List<Photo>> photos = new LinkedHashMap<>();
        for (LifeFacilityPhoto p : mapper.findPhotos()) {
            photos.computeIfAbsent(p.getSpaceId(), k -> new ArrayList<>())
                    .add(new Photo(p.getPhotoClass(), p.getPhoto(), p.getZoom(), p.getPos(), p.getCaption()));
        }
        Map<String, String> badges = new HashMap<>();
        for (Map<String, Object> b : mapper.findBadges()) {
            badges.put(String.valueOf(b.get("spaceId")), b.get("badge") == null ? "" : String.valueOf(b.get("badge")));
        }
        Map<String, SpaceEdit> out = new LinkedHashMap<>();
        Set<String> ids = new java.util.TreeSet<>(photos.keySet());
        ids.addAll(badges.keySet());
        for (String id : ids) {
            out.put(id, new SpaceEdit(id, badges.getOrDefault(id, ""), photos.getOrDefault(id, List.of())));
        }
        return out;
    }

    /** 버전 기록 · 되돌리기에 쓰는 지금 모습(공간 전부) */
    public List<SpaceEdit> snapshot() {
        return new ArrayList<>(spaces().values());
    }

    static String summary(List<SpaceEdit> spaces) {
        int n = spaces.stream().mapToInt(s -> s.photos() == null ? 0 : s.photos().size()).sum();
        return "사진 " + n + "장 (공간 " + spaces.size() + "곳)";
    }

    /** 사이트에 보이는 내용: {공간 → {badge, photos:[{cls, src, bs, bp, caption}]}} */
    public Map<String, Object> publicData() {
        Map<String, Object> out = new LinkedHashMap<>();
        for (SpaceEdit s : spaces().values()) {
            Map<String, Object> space = new LinkedHashMap<>();
            space.put("badge", s.badge());
            List<Map<String, Object>> list = new ArrayList<>();
            for (Photo p : s.photos()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("cls", p.cls());
                m.put("src", p.src());
                m.put("bs", p.bs());
                m.put("bp", p.bp());
                m.put("caption", p.caption());
                list.add(m);
            }
            space.put("photos", list);
            out.put(s.id(), space);
        }
        return out;
    }

    // ── 저장 ──

    /**
     * 공간마다 사진을 통째로 다시 쓴다(보낸 공간만). 바뀌었으면 바로 전 모습을 버전 기록에 남기고 true.
     * spaceIds: 페이지에 있는 공간 · known: 사이트에 원래 있던 그림 이름(life.css)
     */
    public synchronized boolean save(List<SpaceEdit> edits, CategoryPage page, Set<String> spaceIds, Map<String, String> known, Long by, String reason) {
        if (edits == null || edits.isEmpty()) {
            return false;
        }
        Set<String> classesInUse = new HashSet<>();
        mapper.findPhotos().forEach(p -> classesInUse.add(p.getPhotoClass()));
        Map<String, SpaceEdit> clean = new LinkedHashMap<>();
        for (SpaceEdit edit : edits) {
            if (edit == null || edit.id() == null || !spaceIds.contains(edit.id())) {
                throw new BusinessException("알 수 없는 공간이에요. 화면을 새로 고쳐 주세요.");
            }
            String badge = edit.badge() == null ? "" : edit.badge();
            if (!BADGES.contains(badge)) {
                throw new BusinessException("알 수 없는 사진 표시예요.");
            }
            clean.put(edit.id(), new SpaceEdit(edit.id(), badge, cleanPhotos(edit, page, known, classesInUse)));
        }
        List<SpaceEdit> before = snapshot();
        Map<String, SpaceEdit> now = spaces();
        boolean changed = clean.values().stream().anyMatch(s -> !s.equals(normal(now.get(s.id()))));
        if (!changed) {
            return false;
        }
        tx.executeWithoutResult(status -> {
            for (SpaceEdit s : clean.values()) {
                mapper.deletePhotos(s.id());
                int order = 0;
                for (Photo p : s.photos()) {
                    LifeFacilityPhoto row = new LifeFacilityPhoto();
                    row.setSpaceId(s.id());
                    row.setPhotoClass(p.cls());
                    row.setPhoto(p.src());
                    row.setZoom(p.bs());
                    row.setPos(p.bp());
                    row.setCaption(p.caption());
                    row.setSortOrder(++order);
                    mapper.insertPhoto(row);
                }
                mapper.deleteBadge(s.id());
                mapper.insertBadge(s.id(), s.badge());
            }
            versions.record("fac", reason, before, summary(before), by);
        });
        return true;
    }

    private static SpaceEdit normal(SpaceEdit s) {
        return s == null ? null : new SpaceEdit(s.id(), s.badge() == null ? "" : s.badge(), s.photos());
    }

    /** 받은 사진 값 확인 · 정리 */
    private List<Photo> cleanPhotos(SpaceEdit edit, CategoryPage page, Map<String, String> known, Set<String> classesInUse) {
        List<Photo> in = edit.photos() == null ? List.of() : edit.photos();
        if (in.isEmpty()) {
            throw new BusinessException("공간마다 사진이 한 장은 있어야 해요.");
        }
        if (in.size() > MAX_PHOTOS) {
            throw new BusinessException("공간 하나에 사진은 " + MAX_PHOTOS + "장까지 둘 수 있어요.");
        }
        List<Photo> out = new ArrayList<>();
        for (Photo p : in) {
            if (p == null) {
                throw new BusinessException("사진 정보가 올바르지 않아요. 화면을 새로 고쳐 주세요.");
            }
            String cls = trim(p.cls()), src = trim(p.src()), bs = trim(p.bs()), bp = trim(p.bp());
            String caption = trim(p.caption()).replaceAll("\\s+", " ");
            if (cls.isEmpty() == src.isEmpty()) {
                throw new BusinessException("사진 정보가 올바르지 않아요. 화면을 새로 고쳐 주세요.");
            }
            if (!cls.isEmpty() && (!IM_CLASS.matcher(cls).matches() || !(known.containsKey(cls) || classesInUse.contains(cls)))) {
                throw new BusinessException("사이트에 없는 그림이에요: " + cls);
            }
            if (!src.isEmpty()) {
                Path file = page.dir().resolve(src).normalize();
                if (!UPLOAD_SRC.matcher(src).matches() || !file.startsWith(page.dir()) || !Files.isRegularFile(file)) {
                    throw new BusinessException("올린 사진 파일을 찾지 못했어요. 사진을 다시 올려 주세요.");
                }
            }
            Matcher size = SIZE.matcher(bs);
            if (!bs.isEmpty() && (!size.matches() || Integer.parseInt(size.group(1)) < 100 || Integer.parseInt(size.group(1)) > 400)) {
                throw new BusinessException("확대 값이 올바르지 않아요.");
            }
            if (!bp.isEmpty() && !POS.matcher(bp).matches()) {
                throw new BusinessException("사진 위치 값이 올바르지 않아요.");
            }
            if (caption.isEmpty()) {
                throw new BusinessException("사진마다 설명을 적어 주세요(사진 아래와 화면 낭독기에 쓰여요).");
            }
            if (caption.length() > MAX_CAPTION) {
                throw new BusinessException("사진 설명은 " + MAX_CAPTION + "자까지 써 주세요: " + caption.substring(0, 20) + "…");
            }
            out.add(new Photo(cls, src, bs, bp, caption));
        }
        return out;
    }

    // ── 처음 켤 때 ──

    /** 생활 꿀팁 사본을 쓰기(@Order 3) 전에 사진을 준비해요 */
    @EventListener(ContextRefreshedEvent.class)
    @Order(2)
    public void onReady() {
        try {
            int n = importFromPage();
            if (n > 0) {
                log.info("인사교 라이프 페이지에 있던 시설 사진 {}장을 DB로 옮겼습니다.", n);
            } else if ((n = importFromCopy()) > 0) {
                log.info("생활 꿀팁 사본(life/js/life-data.js)의 시설 사진 {}장을 DB로 옮겼습니다.", n);
            }
        } catch (RuntimeException e) {
            log.warn("인사교 라이프 시설 사진을 준비하지 못했습니다.", e);
        }
    }

    /** DB에 사진이 하나도 없을 때만: 페이지(예전처럼 HTML에 적혀 있던 사진 넘김)를 읽어 DB에 넣는다. 넣은 사진 수 */
    public synchronized int importFromPage() {
        CategoryPage page = pages.page(PAGE_ID);
        if (!mapper.findPhotos().isEmpty() || !pages.exists(page)) {
            return 0;
        }
        Document doc = Jsoup.parse(pages.published(page));
        List<SpaceEdit> spaces = new ArrayList<>();
        for (Element s : doc.select("#pg-facility .bx9-s")) {
            List<Photo> photos = new ArrayList<>();
            for (Element sl : s.select(".bx9-tr > .bx9-sl")) {
                photos.add(photoOf(sl));
            }
            if (!photos.isEmpty()) {
                Element ex = s.selectFirst(".bx9-ph .bx-ex");
                spaces.add(new SpaceEdit(s.id(), ex == null ? "" : ex.hasClass("tmp") ? "tmp" : "ex", photos));
            }
        }
        return insertAll(spaces);
    }

    /** DB도 페이지도 비어 있을 때(사진을 페이지에서 뺀 뒤 새 컴퓨터에서 처음 켤 때): 사본의 fac 을 DB에 넣는다. 넣은 사진 수 */
    public synchronized int importFromCopy() {
        if (!mapper.findPhotos().isEmpty()) {
            return 0;
        }
        List<SpaceEdit> spaces = new ArrayList<>();
        pages.siteDataJson(LifeTipService.DATA_FILE).ifPresent(text -> {
            try {
                JsonNode fac = json.readTree(text).path("fac");
                fac.fieldNames().forEachRemaining(id -> {
                    JsonNode s = fac.get(id);
                    List<Photo> photos = new ArrayList<>();
                    for (JsonNode p : s.path("photos")) {
                        photos.add(new Photo(p.path("cls").asText(""), p.path("src").asText(""), p.path("bs").asText(""), p.path("bp").asText(""), p.path("caption").asText("")));
                    }
                    if (!photos.isEmpty()) {
                        spaces.add(new SpaceEdit(id, s.path("badge").asText(""), photos));
                    }
                });
            } catch (JsonProcessingException e) {
                log.warn("생활 꿀팁 사본의 시설 사진을 읽지 못했습니다.", e);
            }
        });
        return insertAll(spaces);
    }

    private int insertAll(List<SpaceEdit> spaces) {
        if (spaces.isEmpty()) {
            return 0;
        }
        tx.executeWithoutResult(status -> {
            for (SpaceEdit s : spaces) {
                int order = 0;
                for (Photo p : s.photos()) {
                    LifeFacilityPhoto row = new LifeFacilityPhoto();
                    row.setSpaceId(s.id());
                    row.setPhotoClass(p.cls());
                    row.setPhoto(p.src());
                    row.setZoom(p.bs());
                    row.setPos(p.bp());
                    row.setCaption(p.caption());
                    row.setSortOrder(++order);
                    mapper.insertPhoto(row);
                }
                mapper.insertBadge(s.id(), s.badge());
            }
        });
        return spaces.stream().mapToInt(s -> s.photos().size()).sum();
    }

    /** 페이지의 사진 한 장(.bx9-sl): 원래 그림 class 또는 배경 그림 · --bs · --bp · 설명(aria-label) */
    private static Photo photoOf(Element sl) {
        String cls = sl.classNames().stream().filter(c -> IM_CLASS.matcher(c).matches()).findFirst().orElse("");
        Map<String, String> style = new LinkedHashMap<>();
        for (String part : sl.attr("style").split(";")) {
            int colon = part.indexOf(':');
            if (colon > 0) {
                style.put(part.substring(0, colon).trim().toLowerCase(), part.substring(colon + 1).trim());
            }
        }
        String src = "";
        Matcher url = BG_URL.matcher(style.getOrDefault("background-image", ""));
        if (url.find()) {
            src = url.group(1).trim();
        }
        return new Photo(cls, src, style.getOrDefault("--bs", ""), style.getOrDefault("--bp", ""), sl.attr("aria-label"));
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }
}
