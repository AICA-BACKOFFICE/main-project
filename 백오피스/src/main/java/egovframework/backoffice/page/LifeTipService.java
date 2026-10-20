package egovframework.backoffice.page;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import egovframework.backoffice.common.BusinessException;
import egovframework.backoffice.common.NotFoundException;
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
 * 인사교 라이프 › 생활 꿀팁의 두 목록을 게시물처럼 DB(life_foods · life_spots)에 두고 쓰고 고치고 지운다.
 * <ul>
 *   <li>오늘 점심, 여기 어때요?(#tp-food): 식당 · 카페 카드 — 종류 · 혼밥/여럿이 · 걸어서 몇 분 · 분류 · 이름 · 메뉴 · 선배 후기 · 사진(없으면 '사진 준비 중')</li>
 *   <li>수업 끝나고, 바람 쐬러 가요(#tp-fun): 근처 산책길 · 가까운 문화 · 여가 시설 · 멀지만 한 번 가볼 만한 곳 카드 — 사진 · 이름 · 거리 · 요금 · 설명</li>
 * </ul>
 * 사이트(life/js/life-render.js)는 공개 API({@link #publicScript()}, /api/public/life.js)로 받아 디자이너 시안과 같은 모양으로 그린다.
 * 백오피스가 꺼져 있어도 보이도록 같은 내용을 사본(life/js/life-data.js)으로도 쓴다. 묶음 제목은 페이지의 글자(페이지 편집에서 고침).
 * 처음 켤 때 DB가 비어 있으면 사이트 페이지에 적혀 있던 카드를, 그것도 없으면 사본의 카드를 옮겨 온다.
 */
@Service
public class LifeTipService {

    private static final Logger log = LoggerFactory.getLogger(LifeTipService.class);

    static final String PAGE_ID = "life";
    static final String DATA_FILE = "life/js/life-data.js";
    static final int MAX_FOOD = 40;
    static final int MAX_FUN = 10;
    private static final List<String> KINDS = List.of("food", "cafe");
    private static final Set<String> GROUPS = Set.of("solo", "group");
    private static final List<String> FUN_KEYS = List.of("walk", "near", "far");
    private static final Map<String, String[]> FUN_TITLES = Map.of(
            "walk", new String[] {"근처 산책길", ""}, "near", new String[] {"가까운 문화 · 여가 시설", ""}, "far", new String[] {"멀지만 한 번 가볼 만한 곳", ""});
    private static final Pattern IM_CLASS = Pattern.compile("im-[A-Za-z0-9_-]+");
    private static final Pattern UPLOAD_SRC = Pattern.compile("assets/uploads/[A-Za-z0-9_.-]+\\.(?:webp|png|jpe?g|gif|avif)", Pattern.CASE_INSENSITIVE);
    /** 사이트에 원래 있던 먹거리 그림(assets/food/f01.webp 등)도 그대로 다시 쓸 수 있게 */
    private static final Pattern SITE_SRC = Pattern.compile("assets/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*/?[A-Za-z0-9_.-]+\\.(?:webp|png|jpe?g|gif|avif)", Pattern.CASE_INSENSITIVE);
    private static final Pattern BG_URL = Pattern.compile("background-image\\s*:\\s*url\\(\\s*[\"']?([^\"')]+)[\"']?\\s*\\)");
    private static final String HEADER = "/* 인사교 라이프 생활 꿀팁 사본: 사이트는 백오피스 공개 API(/api/public/life.js)로 DB의 카드를 받아 그려요. "
            + "이 파일은 백오피스가 꺼져 있을 때 쓰는 사본이라 인사교 라이프 게시물 관리에서 저장할 때마다 다시 써요. 직접 고치지 마세요. */\n";
    private static final String API_HEADER = "/* 인사교 라이프 생활 꿀팁: 백오피스 DB의 지금 카드(인사교 라이프 게시물 관리) */\n";

    /** 먹거리 카드: id(새 카드는 null) · t food·cafe · g solo·group · w 걸어서 몇 분 · example = '예시' 후기 표시(후기를 고치면 뗌) */
    public record Food(Long id, String t, String g, Integer w, String category, String name, String menu, String review, Boolean example, String src) { }

    /** 문화 · 여가 카드: 사진은 cls(사이트에 원래 있던 그림) 또는 src(올린 사진) */
    public record Fun(Long id, String name, String distance, String fee, String summary, String cls, String src) { }

    public record FunGroup(String k, List<Fun> cards) { }

    private final CategoryPageService pages;
    private final LifeTipMapper mapper;
    private final LifeFacilityService facility;
    private final LifeVersionService versions;
    private final ObjectMapper json;
    private final TransactionTemplate tx;

    public LifeTipService(CategoryPageService pages, LifeTipMapper mapper, LifeFacilityService facility, LifeVersionService versions,
                          ObjectMapper json, TransactionTemplate tx) {
        this.pages = pages;
        this.mapper = mapper;
        this.facility = facility;
        this.versions = versions;
        this.json = json;
        this.tx = tx;
    }

    // ── 읽기 ──

    /** 관리 화면의 두 목록(사진 미리보기 주소 포함). 묶음 제목은 페이지(doc)의 글자 */
    public Map<String, Object> model(Document doc, Map<String, String> known, String contextPath) {
        Map<String, Object> out = new LinkedHashMap<>();
        List<Map<String, Object>> foods = new ArrayList<>();
        for (LifeFood f : mapper.findFoods()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", f.getId());
            m.put("t", f.getKind());
            m.put("g", f.getParty());
            m.put("w", f.getWalkMin());
            m.put("category", f.getCategory());
            m.put("name", f.getName());
            m.put("menu", f.getMenu().replace('\u00a0', ' '));
            m.put("review", f.getReview());
            m.put("example", f.isExample());
            m.put("src", f.getPhoto());
            m.put("url", f.getPhoto().isEmpty() ? "" : contextPath + "/admin/pages/site/life/" + f.getPhoto());
            foods.add(m);
        }
        out.put("food", foods);
        Map<String, List<Map<String, Object>>> cards = new LinkedHashMap<>();
        FUN_KEYS.forEach(k -> cards.put(k, new ArrayList<>()));
        for (LifeSpot s : mapper.findSpots()) {
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("id", s.getId());
            c.put("name", s.getName());
            c.put("distance", s.getDistance());
            c.put("fee", s.getFee());
            c.put("summary", s.getSummary());
            c.put("cls", s.getPhotoClass());
            c.put("src", s.getPhoto());
            c.put("url", !s.getPhoto().isEmpty() ? contextPath + "/admin/pages/site/life/" + s.getPhoto() : known.getOrDefault(s.getPhotoClass(), ""));
            cards.computeIfAbsent(s.getGroupKey(), k -> new ArrayList<>()).add(c);
        }
        List<Map<String, Object>> groups = new ArrayList<>();
        for (String k : FUN_KEYS) {
            Element g = doc == null ? null : doc.selectFirst("#tp-fun .fsg[data-k=" + k + "]");
            Map<String, Object> group = new LinkedHashMap<>();
            group.put("k", k);
            group.put("title", g == null ? FUN_TITLES.get(k)[0] : text(g.selectFirst(".fsh h3")));
            group.put("sub", g == null ? FUN_TITLES.get(k)[1] : text(g.selectFirst(".fsh p")));
            group.put("cards", cards.get(k));
            groups.add(group);
        }
        out.put("fun", groups);
        out.put("maxFood", MAX_FOOD);
        out.put("maxFun", MAX_FUN);
        return out;
    }

    /** 사이트에 보이는 내용(공개 API · 사본): food 식당 → 카페 · fun 묶음마다 */
    public Map<String, Object> publicData() {
        List<Map<String, Object>> food = new ArrayList<>();
        for (LifeFood f : mapper.findFoods()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("t", f.getKind());
            m.put("g", f.getParty());
            m.put("w", f.getWalkMin());
            m.put("category", f.getCategory());
            m.put("name", f.getName());
            m.put("menu", f.getMenu());
            m.put("review", f.getReview());
            m.put("example", f.isExample());
            m.put("src", f.getPhoto());
            food.add(m);
        }
        Map<String, List<Map<String, Object>>> fun = new LinkedHashMap<>();
        FUN_KEYS.forEach(k -> fun.put(k, new ArrayList<>()));
        for (LifeSpot s : mapper.findSpots()) {
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("name", s.getName());
            c.put("distance", s.getDistance());
            c.put("fee", s.getFee());
            c.put("summary", s.getSummary());
            c.put("cls", s.getPhotoClass());
            c.put("src", s.getPhoto());
            fun.computeIfAbsent(s.getGroupKey(), k -> new ArrayList<>()).add(c);
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("version", 1);
        data.put("source", "backoffice");
        data.put("food", food);
        data.put("fun", fun);
        data.put("fac", facility.publicData());   // 시설 둘러보기 사진(공간마다)
        return data;
    }

    /** 사이트 페이지가 &lt;script&gt;로 바로 쓰는 모양: window.LIFE_DATA = {…} */
    public String publicScript() {
        Map<String, Object> data = publicData();
        data.put("source", "backoffice-api");
        return script(API_HEADER, data);
    }

    /** 화면을 연 뒤 다른 곳에서 바뀌었는지 보는 값 */
    public String fingerprint() {
        return CategoryPageService.sha1(script("", publicData()));
    }

    // ── 쓰기 ──

    /**
     * 바꾼 목록만 저장한다(null 이면 그 목록은 그대로). 받은 순서가 사이트 순서. 목록에서 빠진 카드는 휴지통으로.
     * 목록이 바뀌었으면 바로 전 모습을 버전 기록에 남기고 true(사본은 {@link #regenerate()} 로 따로 다시 씀).
     * known: 사이트에 원래 있던 그림 이름(life.css 의 im-이름) · by: 한 관리자 · reason: SAVE · RESTORE
     */
    public synchronized boolean save(List<Food> food, List<FunGroup> fun, CategoryPage page, Map<String, String> known, Long by, String reason) {
        if (food == null && fun == null) {
            return false;
        }
        List<LifeFood> foods = food == null ? null : cleanFoods(food, page);
        Map<String, List<LifeSpot>> spots = fun == null ? null : cleanSpots(fun, page, known);
        List<Food> foodBefore = snapshotFood();
        List<FunGroup> funBefore = snapshotFun();
        String foodPrint = print(foodBefore), funPrint = print(funBefore);
        tx.executeWithoutResult(status -> {
            if (foods != null) {
                Map<Long, LifeFood> all = new HashMap<>();
                mapper.findAllFoods().forEach(f -> all.put(f.getId(), f));
                Map<Long, LifeFood> live = new HashMap<>();
                mapper.findFoods().forEach(f -> live.put(f.getId(), f));
                for (LifeFood f : foods) {
                    LifeFood prev = f.getId() == null ? null : all.get(f.getId());
                    // '예시' 표시는 원래 예시였고 후기를 고치지 않았을 때만 남김(관리자가 쓴 후기는 진짜 후기)
                    f.setExample(f.isExample() && prev != null && prev.isExample() && prev.getReview().equals(f.getReview()));
                    if (prev == null) {
                        f.setId(null);
                        mapper.insertFood(f);
                    } else {
                        mapper.updateFood(f);   // 휴지통에 있던 카드면 목록으로 돌아와요(버전 되돌리기)
                        live.remove(f.getId());
                    }
                }
                live.keySet().forEach(id -> mapper.trashFood(id, by));
            }
            if (spots != null) {
                Map<Long, LifeSpot> all = new HashMap<>();
                mapper.findAllSpots().forEach(s -> all.put(s.getId(), s));
                Map<Long, LifeSpot> live = new HashMap<>();
                mapper.findSpots().stream().filter(s -> spots.containsKey(s.getGroupKey())).forEach(s -> live.put(s.getId(), s));
                for (List<LifeSpot> list : spots.values()) {
                    for (LifeSpot s : list) {
                        if (s.getId() != null && all.containsKey(s.getId())) {
                            mapper.updateSpot(s);
                            live.remove(s.getId());
                        } else {
                            s.setId(null);
                            mapper.insertSpot(s);
                        }
                    }
                }
                live.keySet().forEach(id -> mapper.trashSpot(id, by));
            }
            if (foods != null && !foodPrint.equals(print(snapshotFood()))) {
                versions.record("food", reason, foodBefore, foodSummary(foodBefore), by);
            }
            if (spots != null && !funPrint.equals(print(snapshotFun()))) {
                versions.record("fun", reason, funBefore, funSummary(funBefore), by);
            }
        });
        return !foodPrint.equals(print(snapshotFood())) || !funPrint.equals(print(snapshotFun()));
    }

    // ── 버전 기록에 남기는 모습 ──

    /** 지금 목록의 오늘 점심 카드(번호 포함 · 저장할 때 보내는 모양) */
    public List<Food> snapshotFood() {
        List<Food> out = new ArrayList<>();
        for (LifeFood f : mapper.findFoods()) {
            out.add(new Food(f.getId(), f.getKind(), f.getParty(), f.getWalkMin(), f.getCategory(), f.getName(), f.getMenu(), f.getReview(), f.isExample(), f.getPhoto()));
        }
        return out;
    }

    /** 지금 목록의 바람 쐬러 가요 카드(묶음 셋 다) */
    public List<FunGroup> snapshotFun() {
        Map<String, List<Fun>> cards = new LinkedHashMap<>();
        FUN_KEYS.forEach(k -> cards.put(k, new ArrayList<>()));
        for (LifeSpot s : mapper.findSpots()) {
            cards.computeIfAbsent(s.getGroupKey(), k -> new ArrayList<>())
                    .add(new Fun(s.getId(), s.getName(), s.getDistance(), s.getFee(), s.getSummary(), s.getPhotoClass(), s.getPhoto()));
        }
        List<FunGroup> out = new ArrayList<>();
        cards.forEach((k, list) -> out.add(new FunGroup(k, list)));
        return out;
    }

    static String foodSummary(List<Food> food) {
        long cafe = food.stream().filter(f -> "cafe".equals(f.t())).count();
        return "식당 " + (food.size() - cafe) + "곳 · 카페 " + cafe + "곳";
    }

    static String funSummary(List<FunGroup> fun) {
        Map<String, Integer> n = new HashMap<>();
        fun.forEach(g -> n.put(g.k(), g.cards() == null ? 0 : g.cards().size()));
        int all = n.values().stream().mapToInt(Integer::intValue).sum();
        return "장소 " + all + "곳 (산책길 " + n.getOrDefault("walk", 0) + " · 가까운 곳 " + n.getOrDefault("near", 0) + " · 먼 곳 " + n.getOrDefault("far", 0) + ")";
    }

    private String print(Object snapshot) {
        try {
            return json.writeValueAsString(snapshot);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    // ── 휴지통 ──

    /** 휴지통의 카드(최근에 옮긴 순): type food · spot */
    public List<Map<String, Object>> trash(String contextPath) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (LifeFood f : mapper.findTrashedFoods()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("type", "food");
            m.put("id", f.getId());
            m.put("where", "오늘 점심 › " + ("cafe".equals(f.getKind()) ? "카페" : "식당"));
            m.put("name", f.getName());
            m.put("detail", f.getMenu());
            m.put("url", f.getPhoto().isEmpty() ? "" : contextPath + "/admin/pages/site/life/" + f.getPhoto());
            m.put("deletedAt", f.getDeletedAt());
            m.put("deletedBy", f.getDeletedByName());
            out.add(m);
        }
        for (LifeSpot s : mapper.findTrashedSpots()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("type", "spot");
            m.put("id", s.getId());
            m.put("where", "바람 쐬러 가요 › " + FUN_TITLES.getOrDefault(s.getGroupKey(), new String[] {s.getGroupKey()})[0]);
            m.put("name", s.getName());
            m.put("detail", s.getDistance() + " · " + s.getFee());
            m.put("url", s.getPhoto().isEmpty() ? "" : contextPath + "/admin/pages/site/life/" + s.getPhoto());
            m.put("deletedAt", s.getDeletedAt());
            m.put("deletedBy", s.getDeletedByName());
            out.add(m);
        }
        out.sort((a, b) -> String.valueOf(b.get("deletedAt")).compareTo(String.valueOf(a.get("deletedAt"))));
        return out;
    }

    public int trashCount() {
        return mapper.findTrashedFoods().size() + mapper.findTrashedSpots().size();
    }

    /** 휴지통에서 꺼내기: 원래 묶음(식당 · 카페 / 산책길 등)의 맨 뒤로. 바로 전 목록은 버전 기록에 남김. 꺼낸 카드 이름 */
    public synchronized String restore(String type, Long id, Long by) {
        String name;
        if ("food".equals(type)) {
            LifeFood f = mapper.findTrashedFoods().stream().filter(x -> x.getId().equals(id)).findFirst()
                    .orElseThrow(() -> new NotFoundException("휴지통에서 그 카드를 찾지 못했어요."));
            List<LifeFood> same = mapper.findFoods().stream().filter(x -> x.getKind().equals(f.getKind())).toList();
            if (same.size() >= MAX_FOOD) {
                throw new BusinessException(("cafe".equals(f.getKind()) ? "카페" : "식당") + "는 " + MAX_FOOD + "곳까지 둘 수 있어요. 하나를 지운 뒤 꺼내 주세요.");
            }
            List<Food> before = snapshotFood();
            int order = same.stream().mapToInt(LifeFood::getSortOrder).max().orElse(0) + 1;
            tx.executeWithoutResult(status -> {
                mapper.restoreFood(id, order);
                versions.record("food", "TRASH_RESTORE", before, foodSummary(before), by);
            });
            name = f.getName();
        } else if ("spot".equals(type)) {
            LifeSpot s = mapper.findTrashedSpots().stream().filter(x -> x.getId().equals(id)).findFirst()
                    .orElseThrow(() -> new NotFoundException("휴지통에서 그 카드를 찾지 못했어요."));
            List<LifeSpot> same = mapper.findSpots().stream().filter(x -> x.getGroupKey().equals(s.getGroupKey())).toList();
            if (same.size() >= MAX_FUN) {
                throw new BusinessException("이 묶음에는 " + MAX_FUN + "곳까지 둘 수 있어요. 하나를 지운 뒤 꺼내 주세요.");
            }
            List<FunGroup> before = snapshotFun();
            int order = same.stream().mapToInt(LifeSpot::getSortOrder).max().orElse(0) + 1;
            tx.executeWithoutResult(status -> {
                mapper.restoreSpot(id, order);
                versions.record("fun", "TRASH_RESTORE", before, funSummary(before), by);
            });
            name = s.getName();
        } else {
            throw new NotFoundException("알 수 없는 카드예요.");
        }
        regenerate();
        return name;
    }

    /** 완전 삭제(휴지통에 있는 카드만). 사이트 목록은 그대로라 사본은 다시 쓰지 않아요 */
    public synchronized void purge(String type, Long id) {
        int n = "food".equals(type) ? mapper.purgeFood(id) : "spot".equals(type) ? mapper.purgeSpot(id) : 0;
        if (n == 0) {
            throw new NotFoundException("휴지통에서 그 카드를 찾지 못했어요.");
        }
    }

    private List<LifeFood> cleanFoods(List<Food> in, CategoryPage page) {
        if (in.size() > MAX_FOOD * 2) {
            throw new BusinessException("먹거리 카드가 너무 많아요.");
        }
        List<LifeFood> out = new ArrayList<>();
        Map<String, Integer> counts = new HashMap<>();
        // 사이트 순서: 식당 카드 → 카페 카드(카페는 처음에 숨김, 탭을 누르면 보임)
        for (String kind : KINDS) {
            for (Food f : in) {
                if (f != null && kind.equals(trim(f.t()))) {
                    LifeFood row = cleanFood(f, page);
                    row.setSortOrder(counts.merge(kind, 1, Integer::sum));
                    out.add(row);
                }
            }
        }
        for (Food f : in) {
            if (f == null || f.t() == null || !KINDS.contains(trim(f.t()))) {
                throw new BusinessException("먹거리 종류(식당 · 카페)가 올바르지 않아요.");
            }
        }
        int foodN = counts.getOrDefault("food", 0), cafeN = counts.getOrDefault("cafe", 0);
        if (foodN == 0 || cafeN == 0) {
            throw new BusinessException("식당과 카페는 한 곳 이상씩 있어야 해요.");
        }
        if (foodN > MAX_FOOD || cafeN > MAX_FOOD) {
            throw new BusinessException("식당 · 카페는 각각 " + MAX_FOOD + "곳까지 둘 수 있어요.");
        }
        return out;
    }

    private LifeFood cleanFood(Food f, CategoryPage page) {
        String t = trim(f.t()), g = trim(f.g());
        if (!KINDS.contains(t) || !GROUPS.contains(g)) {
            throw new BusinessException("먹거리 종류 · 혼밥/여럿이 값이 올바르지 않아요.");
        }
        int w = f.w() == null ? 0 : f.w();
        String name = one(f.name(), 40, "가게 이름");
        if (w < 1 || w > 120) {
            throw new BusinessException("'" + name + "'의 걸어서 걸리는 시간(분)을 1~120 사이로 적어 주세요.");
        }
        String category = one(f.category(), 12, "'" + name + "'의 분류(예: 한식)");
        String menu = trim(f.menu()).replace('\u00a0', ' ').replaceAll("\\s+", " ").replaceAll("\\s*·\\s*", " · ");
        if (menu.isEmpty()) {
            throw new BusinessException("'" + name + "'의 메뉴 · 위치를 적어 주세요(예: 국밥 · 동명동).");
        }
        if (menu.length() > 80) {
            throw new BusinessException("'" + name + "'의 메뉴 · 위치는 80자까지 써 주세요.");
        }
        String review = trim(f.review()).replaceAll("\\s+", " ");
        if (review.length() > 200) {
            throw new BusinessException("'" + name + "'의 선배 후기는 200자까지 써 주세요.");
        }
        LifeFood row = new LifeFood();
        row.setId(f.id());
        row.setKind(t);
        row.setParty(g);
        row.setWalkMin(w);
        row.setCategory(category);
        row.setName(name);
        row.setMenu(menu);
        row.setReview(review);
        row.setExample(Boolean.TRUE.equals(f.example()));
        row.setPhoto(photo(f.src(), page));
        return row;
    }

    private Map<String, List<LifeSpot>> cleanSpots(List<FunGroup> groups, CategoryPage page, Map<String, String> known) {
        Set<String> classesInUse = new HashSet<>();
        mapper.findAllSpots().forEach(s -> classesInUse.add(s.getPhotoClass()));   // 휴지통에서 되돌린 카드의 원래 그림도
        Map<String, List<LifeSpot>> out = new LinkedHashMap<>();
        for (FunGroup group : groups) {
            if (group == null || !FUN_KEYS.contains(group.k()) || out.containsKey(group.k())) {
                throw new BusinessException("알 수 없는 문화 · 여가 묶음이에요.");
            }
            List<LifeSpot> list = new ArrayList<>();
            for (Fun c : group.cards() == null ? List.<Fun>of() : group.cards()) {
                LifeSpot s = cleanFun(c, page, known, classesInUse);
                s.setGroupKey(group.k());
                s.setSortOrder(list.size() + 1);
                list.add(s);
            }
            if (list.isEmpty()) {
                throw new BusinessException("문화 · 여가 묶음마다 한 곳 이상 있어야 해요.");
            }
            if (list.size() > MAX_FUN) {
                throw new BusinessException("문화 · 여가 묶음 하나에 " + MAX_FUN + "곳까지 둘 수 있어요.");
            }
            out.put(group.k(), list);
        }
        return out;
    }

    private LifeSpot cleanFun(Fun c, CategoryPage page, Map<String, String> known, Set<String> classesInUse) {
        if (c == null) {
            throw new BusinessException("장소 정보가 올바르지 않아요. 화면을 새로 고쳐 주세요.");
        }
        String name = one(c.name(), 40, "장소 이름");
        String distance = one(c.distance(), 40, "'" + name + "'의 거리(예: 동쪽 · 약 1km)");
        String fee = one(c.fee(), 30, "'" + name + "'의 요금(예: 무료)");
        String summary = one(c.summary(), 200, "'" + name + "'의 설명");
        String cls = trim(c.cls()), src = photo(c.src(), page);
        if (src.isEmpty()) {
            if (cls.isEmpty() || !IM_CLASS.matcher(cls).matches() || !(known.containsKey(cls) || classesInUse.contains(cls))) {
                throw new BusinessException("'" + name + "'에 사진을 올려 주세요.");
            }
        } else {
            cls = "";
        }
        LifeSpot s = new LifeSpot();
        s.setId(c.id());
        s.setName(name);
        s.setDistance(distance);
        s.setFee(fee);
        s.setSummary(summary);
        s.setPhotoClass(cls);
        s.setPhoto(src);
        return s;
    }

    // ── 사본 · 처음 켤 때 ──

    /** 사본(life/js/life-data.js)을 DB 내용으로 다시 쓴다(같으면 그대로) */
    public void regenerate() {
        CategoryPage page = pages.page(PAGE_ID);
        if (pages.exists(page)) {
            pages.writeSiteData(DATA_FILE, script(HEADER, publicData()));
        }
    }

    @EventListener(ContextRefreshedEvent.class)
    @Order(3)
    public void onReady() {
        try {
            int n = importFromPage();
            if (n > 0) {
                log.info("인사교 라이프 페이지에 있던 생활 꿀팁 카드 {}개를 DB로 옮겼습니다.", n);
            } else if ((n = importFromCopy()) > 0) {
                log.info("생활 꿀팁 사본(life/js/life-data.js)의 카드 {}개를 DB로 옮겼습니다.", n);
            }
            regenerate();
        } catch (RuntimeException e) {
            log.warn("인사교 라이프 생활 꿀팁 카드를 준비하지 못했습니다.", e);
        }
    }

    /** DB에 카드가 하나도 없을 때만: 사이트 페이지(예전처럼 HTML에 적혀 있던 카드)를 읽어 DB에 넣는다. 넣은 카드 수 */
    public synchronized int importFromPage() {
        CategoryPage page = pages.page(PAGE_ID);
        if (!mapper.findFoods().isEmpty() || !mapper.findSpots().isEmpty() || !pages.exists(page)) {
            return 0;
        }
        Document doc = Jsoup.parse(pages.published(page));
        List<LifeFood> foods = new ArrayList<>();
        Map<String, Integer> order = new HashMap<>();
        for (Element li : doc.select("#fdList > li.fdc")) {
            LifeFood f = new LifeFood();
            f.setKind(li.attr("data-t"));
            f.setParty(li.attr("data-g"));
            Integer w = parseInt(li.attr("data-w"));
            f.setWalkMin(w == null ? 0 : w);
            f.setCategory(text(li.selectFirst(".fdc-cat")));
            f.setName(text(li.selectFirst(".fdc-b h3")));
            f.setMenu(text(li.selectFirst(".fdc-m")).replace('\u00a0', ' ').replaceAll("\\s+", " "));
            f.setReview(text(li.selectFirst(".fdc-r blockquote")));
            f.setExample(li.selectFirst(".fdc-r .bdg.ex") != null);
            Element ph = li.selectFirst(".fdc-ph");
            Element img = ph == null ? null : ph.selectFirst("> img");
            f.setPhoto(img != null ? img.attr("src") : ph == null ? "" : bgUrl(ph.attr("style")));
            f.setSortOrder(order.merge(f.getKind(), 1, Integer::sum));
            foods.add(f);
        }
        List<LifeSpot> spots = new ArrayList<>();
        for (Element g : doc.select("#tp-fun .fsg")) {
            int i = 0;
            for (Element li : g.select("ol.fsl > li.fsc")) {
                Element ph = li.selectFirst(".fsc-ph");
                LifeSpot s = new LifeSpot();
                s.setGroupKey(g.attr("data-k"));
                s.setName(text(li.selectFirst(".fsc-b > b")));
                s.setDistance(text(li.selectFirst(".fsc-b > small")));
                s.setFee(text(li.selectFirst(".fsc-t")));
                s.setSummary(text(li.selectFirst(".fsc-d")));
                s.setPhotoClass(ph == null ? "" : ph.classNames().stream().filter(x -> IM_CLASS.matcher(x).matches()).findFirst().orElse(""));
                s.setPhoto(ph == null ? "" : bgUrl(ph.attr("style")));
                s.setSortOrder(++i);
                spots.add(s);
            }
        }
        if (foods.isEmpty() && spots.isEmpty()) {
            return 0;
        }
        tx.executeWithoutResult(status -> {
            foods.forEach(mapper::insertFood);
            spots.forEach(mapper::insertSpot);
        });
        return foods.size() + spots.size();
    }

    /** DB도 페이지도 비어 있을 때(카드를 페이지에서 뺀 뒤 새 컴퓨터에서 처음 켤 때): 사본(life/js/life-data.js)의 카드를 DB에 넣는다. 넣은 카드 수 */
    public synchronized int importFromCopy() {
        if (!mapper.findFoods().isEmpty() || !mapper.findSpots().isEmpty()) {
            return 0;
        }
        List<LifeFood> foods = new ArrayList<>();
        List<LifeSpot> spots = new ArrayList<>();
        pages.siteDataJson(DATA_FILE).ifPresent(text -> {
            try {
                JsonNode data = json.readTree(text);
                Map<String, Integer> order = new HashMap<>();
                for (JsonNode it : data.path("food")) {
                    LifeFood f = new LifeFood();
                    f.setKind(it.path("t").asText(""));
                    f.setParty(it.path("g").asText(""));
                    f.setWalkMin(it.path("w").asInt(0));
                    f.setCategory(it.path("category").asText(""));
                    f.setName(it.path("name").asText(""));
                    f.setMenu(it.path("menu").asText(""));
                    f.setReview(it.path("review").asText(""));
                    f.setExample(it.path("example").asBoolean(false));
                    f.setPhoto(it.path("src").asText(""));
                    if (KINDS.contains(f.getKind()) && !f.getName().isBlank()) {
                        f.setSortOrder(order.merge(f.getKind(), 1, Integer::sum));
                        foods.add(f);
                    }
                }
                for (String k : FUN_KEYS) {
                    int i = 0;
                    for (JsonNode it : data.path("fun").path(k)) {
                        LifeSpot s = new LifeSpot();
                        s.setGroupKey(k);
                        s.setName(it.path("name").asText(""));
                        s.setDistance(it.path("distance").asText(""));
                        s.setFee(it.path("fee").asText(""));
                        s.setSummary(it.path("summary").asText(""));
                        s.setPhotoClass(it.path("cls").asText(""));
                        s.setPhoto(it.path("src").asText(""));
                        if (!s.getName().isBlank()) {
                            s.setSortOrder(++i);
                            spots.add(s);
                        }
                    }
                }
            } catch (JsonProcessingException e) {
                log.warn("생활 꿀팁 사본을 읽지 못했습니다.", e);
            }
        });
        if (foods.isEmpty() && spots.isEmpty()) {
            return 0;
        }
        tx.executeWithoutResult(status -> {
            foods.forEach(mapper::insertFood);
            spots.forEach(mapper::insertSpot);
        });
        return foods.size() + spots.size();
    }

    // ── 도움 ──

    private String script(String header, Map<String, Object> data) {
        try {
            return header + "window.LIFE_DATA = " + json.writerWithDefaultPrettyPrinter().writeValueAsString(data).replace("\r\n", "\n") + ";\n";
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String photo(String raw, CategoryPage page) {
        String src = trim(raw);
        if (src.isEmpty()) {
            return "";
        }
        Path file = page.dir().resolve(src).normalize();
        if (!(UPLOAD_SRC.matcher(src).matches() || SITE_SRC.matcher(src).matches()) || src.contains("..") || !file.startsWith(page.dir()) || !Files.isRegularFile(file)) {
            throw new BusinessException("올린 사진 파일을 찾지 못했어요. 사진을 다시 올려 주세요.");
        }
        return src;
    }

    private static String one(String v, int max, String label) {
        String s = trim(v).replaceAll("\\s+", " ");
        if (s.isEmpty()) {
            throw new BusinessException(label + "을(를) 적어 주세요.");
        }
        if (s.length() > max) {
            throw new BusinessException(label + "은(는) " + max + "자까지 써 주세요.");
        }
        return s;
    }

    private static String text(Element e) {
        return e == null ? "" : e.text();
    }

    private static String bgUrl(String style) {
        Matcher m = BG_URL.matcher(style == null ? "" : style);
        return m.find() ? m.group(1).trim() : "";
    }

    private static Integer parseInt(String s) {
        try {
            return Integer.valueOf(s.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }
}
