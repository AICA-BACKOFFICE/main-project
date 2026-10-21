package egovframework.backoffice.page;

import egovframework.backoffice.common.BusinessException;
import egovframework.backoffice.common.NotFoundException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 인사교 라이프 게시물 관리(2026-10-20, V29): 시설 사진 · 오늘 점심 · 바람 쐬러 가요 카드의 원본은 DB 표다.
 * <ul>
 *   <li>카드 하나를 완료(게시 PUBLISHED) · 임시저장(DRAFT)으로 저장하고, 순서를 바꾸고, 휴지통으로 보내고, 복원한다.</li>
 *   <li>게시중인 카드가 바뀌면 게시중인 것만으로 사이트 페이지(life/index.html)의 그 목록을 다시 쓴다({@link LifePhotoService} ·
 *       {@link LifeTipService} 의 쓰기 도구, 버전 기록 page_versions 에 남음). 표 바꾸기와 페이지 쓰기는 한 묶음이라 하나라도 안 되면 둘 다 안 된다.</li>
 *   <li>임시저장은 빈칸이 있어도 되고, 게시할 때 빈칸 · 사진을 확인한다. 공간 · 식당/카페 · 묶음마다 게시중인 카드가 한 장(곳)은 있어야 한다.</li>
 *   <li>처음 켤 때(표가 비어 있으면) 지금 페이지의 공간 · 사진 · 카드를 게시중으로 옮겨 담는다.</li>
 * </ul>
 * 층 · 공간 이름 · 안내 글 같은 페이지 글은 카테고리 페이지 관리에서 고친다(공간 이름은 화면을 열 때 페이지에서 읽어 맞춤).
 */
@Service
public class LifeBoardService {

    private static final Logger log = LoggerFactory.getLogger(LifeBoardService.class);

    /** 화면 탭 → 표: fac 시설 사진 · food 오늘 점심 · fun 바람 쐬러 가요 */
    static final Map<String, String> TABLES = Map.of("fac", "life_facility_photos", "food", "life_foods", "fun", "life_spots");
    /** 휴지통 · 임시저장 목록의 종류 칩(인사교 라이프)과 한 줄의 종류 이름 앞부분(life-fac · life-food · life-fun) */
    public static final String KIND = "life";
    public static final String KIND_PREFIX = "life-";
    /** 화면 탭 → 이름 */
    public static final Map<String, String> LABELS;

    static {
        Map<String, String> labels = new LinkedHashMap<>();
        labels.put("fac", "시설 사진");
        labels.put("food", "오늘 점심, 여기 어때요?");
        labels.put("fun", "수업 끝나고, 바람 쐬러 가요");
        LABELS = java.util.Collections.unmodifiableMap(labels);
    }

    private static final String NOTE = "인사교 라이프 게시물 관리";
    private static final String PUBLISHED = "PUBLISHED";
    private static final Set<String> SAVE_STATUSES = Set.of(PUBLISHED, "DRAFT");
    private static final Set<String> FOOD_KINDS = Set.of("food", "cafe");
    private static final Set<String> PARTIES = Set.of("solo", "group");
    private static final Set<String> FUN_KEYS = Set.of("walk", "near", "far");
    private static final Pattern IM_CLASS = Pattern.compile("im-[A-Za-z0-9_-]+");
    private static final Pattern SRC = Pattern.compile("assets/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_.-]+)*\\.(?:webp|png|jpe?g|gif|avif)", Pattern.CASE_INSENSITIVE);
    private static final Pattern ZOOM = Pattern.compile("(\\d{3})%");
    private static final String POS_WORD = "(?:\\d{1,3}%|left|right|center|top|bottom)";
    private static final Pattern POS = Pattern.compile(POS_WORD + "(?: " + POS_WORD + ")?");

    /**
     * 화면에서 받은 카드 하나. 탭마다 쓰는 칸만 채운다.
     * 시설 사진: space(공간) · cls 또는 src(사진) · bs(확대) · bp(보일 곳) · caption(사진 이름).
     * 오늘 점심: t(food · cafe) · g(solo · group) · w(걸어서 몇 분) · category · name · menu · review · src.
     * 바람 쐬러 가요: k(walk · near · far) · name · distance · fee · summary · cls 또는 src.
     * status: PUBLISHED 완료(게시) · DRAFT 임시저장
     */
    public record Input(String space, String t, String g, Integer w, String category, String name, String menu, String review,
                        String k, String distance, String fee, String summary, String cls, String src, String bs, String bp,
                        String caption, String status) { }

    /** 휴지통의 카드 하나: kind(life-fac · life-food · life-fun) + 번호 */
    public record Key(String section, Long id) {
        public String kind() {
            return KIND_PREFIX + section;
        }

        /** "life-food-3" → food · 3. 아니면 null */
        public static Key parse(String value) {
            if (value == null || !value.startsWith(KIND_PREFIX)) {
                return null;
            }
            int dash = value.lastIndexOf('-');
            String section = dash > KIND_PREFIX.length() ? value.substring(KIND_PREFIX.length(), dash) : "";
            try {
                long id = Long.parseLong(value.substring(dash + 1));
                return TABLES.containsKey(section) && id > 0 ? new Key(section, id) : null;
            } catch (NumberFormatException e) {
                return null;
            }
        }
    }

    /** 잠근 휴지통 카드(종류 · 번호 · 지운 시각) — 휴지통 비우기의 지문 비교용 */
    public record Locked(String kind, Long id, LocalDateTime deletedAt) { }

    private final CategoryPageService pages;
    private final LifePhotoService photos;
    private final LifeTipService tips;
    private final LifeMapper mapper;
    private final TransactionTemplate tx;

    public LifeBoardService(CategoryPageService pages, LifePhotoService photos, LifeTipService tips, LifeMapper mapper, TransactionTemplate tx) {
        this.pages = pages;
        this.photos = photos;
        this.tips = tips;
        this.mapper = mapper;
        this.tx = tx;
    }

    private CategoryPage page() {
        return pages.page(LifePhotoService.PAGE_ID);
    }

    // ── 화면 ──

    /** 화면: 층 · 공간(이름은 페이지에서) › 사진(DB) · 먹거리(DB) · 바람 쐬러 가요 묶음(제목은 페이지에서) › 카드(DB). 휴지통 것은 빼고, 임시저장도 보여 준다 */
    public Map<String, Object> model(String contextPath) {
        ensureImported();
        CategoryPage page = page();
        Map<String, Object> read = photos.readPage(contextPath);
        syncSpaces(read);
        Map<String, String> known = photos.knownImages(contextPath);
        Map<String, LifeSpace> spaces = spaces();
        Map<String, List<LifeItem>> bySpace = group(mapper.findPhotos(), LifeItem::getSpaceId);
        List<Map<String, Object>> floors = new ArrayList<>();
        for (Map<String, Object> f : maps(read.get("floors"))) {
            Map<String, Object> floor = new LinkedHashMap<>();
            floor.put("g", f.get("g"));
            floor.put("floor", f.get("floor"));
            floor.put("name", f.get("name"));
            List<Map<String, Object>> list = new ArrayList<>();
            for (Map<String, Object> s : maps(f.get("spaces"))) {
                String id = String.valueOf(s.get("id"));
                Map<String, Object> space = new LinkedHashMap<>();
                space.put("id", id);
                space.put("name", s.get("name"));
                space.put("badge", spaces.containsKey(id) ? spaces.get(id).getBadge() : s.get("badge"));
                space.put("photos", bySpace.getOrDefault(id, List.of()).stream().map(p -> photoJson(p, known, contextPath)).toList());
                list.add(space);
            }
            floor.put("spaces", list);
            floors.add(floor);
        }
        Map<String, List<LifeItem>> byGroup = group(mapper.findSpots(), LifeItem::getGroupKey);
        List<Map<String, Object>> fun = new ArrayList<>();
        for (Map<String, Object> g : maps(read.get("fun"))) {
            Map<String, Object> group = new LinkedHashMap<>();
            String k = String.valueOf(g.get("k"));
            group.put("k", k);
            group.put("title", g.get("title"));
            group.put("sub", g.get("sub"));
            group.put("cards", byGroup.getOrDefault(k, List.of()).stream().map(c -> spotJson(c, known, contextPath)).toList());
            fun.add(group);
        }
        Map<String, Object> model = new LinkedHashMap<>();
        model.put("hasDraft", pages.hasDraft(page));
        model.put("draft", pages.draftSummary(page));   // 페이지 편집기의 임시저장이 있으면 무엇이 바뀌었는지(안내에 보여 줌)
        model.put("defaultFloor", read.get("defaultFloor"));
        model.put("floors", floors);
        model.put("food", mapper.findFoods().stream().map(f -> foodJson(f, contextPath)).toList());
        model.put("fun", fun);
        model.put("maxPhotos", LifePhotoService.MAX_PHOTOS);
        model.put("maxFood", LifeTipService.MAX_FOOD);
        model.put("maxFun", LifeTipService.MAX_FUN);
        return model;
    }

    private static Map<String, Object> photoJson(LifeItem p, Map<String, String> known, String contextPath) {
        Map<String, Object> m = base(p);
        m.put("cls", nz(p.getPhotoClass()));
        m.put("src", nz(p.getPhoto()));
        m.put("bs", nz(p.getZoom()));
        m.put("bp", nz(p.getPos()));
        m.put("caption", nz(p.getCaption()));
        m.put("url", url(p, known, contextPath));
        return m;
    }

    private static Map<String, Object> foodJson(LifeItem f, String contextPath) {
        Map<String, Object> m = base(f);
        m.put("t", f.getKind());
        m.put("g", f.getParty());
        m.put("w", f.getWalkMin());
        m.put("category", nz(f.getCategory()));
        m.put("name", nz(f.getName()));
        m.put("menu", nz(f.getMenu()));
        m.put("review", nz(f.getReview()));
        m.put("example", Boolean.TRUE.equals(f.getExample()));
        m.put("src", nz(f.getPhoto()));
        m.put("url", f.getPhoto() == null ? "" : contextPath + "/admin/pages/site/life/" + f.getPhoto());
        return m;
    }

    private static Map<String, Object> spotJson(LifeItem c, Map<String, String> known, String contextPath) {
        Map<String, Object> m = base(c);
        m.put("name", nz(c.getName()));
        m.put("distance", nz(c.getDistance()));
        m.put("fee", nz(c.getFee()));
        m.put("summary", nz(c.getSummary()));
        m.put("cls", nz(c.getPhotoClass()));
        m.put("src", nz(c.getPhoto()));
        m.put("url", url(c, known, contextPath));
        return m;
    }

    private static Map<String, Object> base(LifeItem item) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", item.getId());
        m.put("status", item.getStatus());
        return m;
    }

    private static String url(LifeItem item, Map<String, String> known, String contextPath) {
        if (item.getPhoto() != null) {
            return contextPath + "/admin/pages/site/life/" + item.getPhoto();
        }
        return item.getPhotoClass() == null ? "" : known.getOrDefault(item.getPhotoClass(), "");
    }

    // ── 저장 · 순서 · 휴지통 ──

    /** 카드 하나 저장: id 가 없으면 새 카드(그 묶음 맨 뒤). 완료(PUBLISHED)면 빈칸 · 사진을 확인하고 사이트에도 반영. 저장한 카드 번호 */
    public Long save(String section, Long id, Input in) {
        String table = table(section);
        String status = in == null ? null : in.status();
        if (!SAVE_STATUSES.contains(status)) {
            throw new BusinessException("완료(게시) 또는 임시저장으로 저장해 주세요.");
        }
        ensureImported();
        CategoryPage page = page();
        return tx.execute(st -> {
            LifeItem item;
            boolean wasPublished = false;
            if (id == null) {
                item = new LifeItem();
                item.setAuthorId(currentAdminId());
            } else {
                item = find(section, id);
                if (item == null || item.getDeletedAt() != null) {
                    throw new NotFoundException("카드를 찾을 수 없어요. 화면을 새로 고쳐 주세요.");
                }
                wasPublished = PUBLISHED.equals(item.getStatus());
            }
            fill(section, item, in, id == null, page);
            item.setStatus(status);
            if (PUBLISHED.equals(status)) {
                requireComplete(section, item);
            }
            if (id == null) {
                item.setSortOrder(nextOrder(section, item));
                switch (section) {
                    case "fac" -> mapper.insertPhoto(item);
                    case "food" -> mapper.insertFood(item);
                    default -> mapper.insertSpot(item);
                }
            } else {
                switch (section) {
                    case "fac" -> mapper.updatePhoto(item);
                    case "food" -> mapper.updateFood(item);
                    default -> mapper.updateSpot(item);
                }
            }
            if (PUBLISHED.equals(status) || wasPublished) {
                render(section, List.of(scope(section, item)));
            }
            log.debug("인사교 라이프 카드 저장: {} {} ({})", table, item.getId(), status);
            return item.getId();
        });
    }

    /** 순서 바꾸기: dir -1 앞으로 · 1 뒤로(같은 공간 · 식당/카페 · 묶음 안에서). 게시중인 카드가 움직이면 사이트에도 */
    public void move(String section, Long id, int dir) {
        table(section);
        ensureImported();
        tx.executeWithoutResult(st -> {
            LifeItem item = find(section, id);
            if (item == null || item.getDeletedAt() != null) {
                throw new NotFoundException("카드를 찾을 수 없어요. 화면을 새로 고쳐 주세요.");
            }
            List<LifeItem> same = new ArrayList<>(siblings(section, item));
            int at = indexOf(same, item.getId()), to = at + (dir < 0 ? -1 : 1);
            if (at < 0 || to < 0 || to >= same.size()) {
                return;
            }
            LifeItem other = same.get(to);
            same.set(to, same.get(at));
            same.set(at, other);
            for (int i = 0; i < same.size(); i++) {
                mapper.updateOrder(TABLES.get(section), same.get(i).getId(), i + 1);
            }
            if (PUBLISHED.equals(item.getStatus()) && PUBLISHED.equals(other.getStatus())) {
                render(section, List.of(scope(section, item)));
            }
        });
    }

    /** 휴지통으로: 게시중이던 카드면 사이트에서도 바로 내려간다(그 묶음에 게시중인 카드가 하나도 안 남으면 안 됨) */
    public LifeItem moveToTrash(String section, Long id) {
        String table = table(section);
        ensureImported();
        return tx.execute(st -> {
            LifeItem item = find(section, id);
            if (item == null || item.getDeletedAt() != null) {
                throw new NotFoundException("카드를 찾을 수 없어요. 화면을 새로 고쳐 주세요.");
            }
            mapper.softDelete(table, id);
            if (PUBLISHED.equals(item.getStatus())) {
                render(section, List.of(scope(section, item)));
            }
            return item;
        });
    }

    /** 휴지통에서 복원: 옮기기 전 상태로 원래 자리(순서)에. 게시중이었으면 사이트에도 다시. 복원 전 모습 */
    public LifeItem restore(String section, Long id) {
        table(section);
        return tx.execute(st -> {
            LifeItem item = find(section, id);
            if (item == null || item.getDeletedAt() == null) {
                throw new NotFoundException("휴지통에서 카드를 찾을 수 없어요.");
            }
            restoreAll(List.of(new Key(section, id)));
            return item;
        });
    }

    /** 여러 카드 복원(휴지통 일괄): 복원한 뒤 게시중으로 돌아온 카드의 묶음만 사이트에 한 번씩 다시 쓴다 */
    public void restoreAll(List<Key> keys) {
        tx.executeWithoutResult(st -> {
            Map<String, Set<String>> scopes = new LinkedHashMap<>();
            for (Key key : keys) {
                String table = table(key.section());
                if (mapper.restore(table, key.id()) == 0) {
                    continue;
                }
                LifeItem item = find(key.section(), key.id());
                if (item != null && PUBLISHED.equals(item.getStatus())) {
                    scopes.computeIfAbsent(key.section(), s -> new LinkedHashSet<>()).add(scope(key.section(), item));
                }
            }
            scopes.forEach(this::render);
        });
    }

    /** 완전 삭제(휴지통 카드만, 되돌릴 수 없음). 올린 사진 파일은 사이트 폴더에 그대로 */
    public void purge(String section, Long id) {
        String table = table(section);
        LifeItem item = find(section, id);
        if (item == null || item.getDeletedAt() == null) {
            throw new NotFoundException("휴지통에서 카드를 찾을 수 없어요.");
        }
        mapper.hardDelete(table, id);
    }

    public void purgeLocked(Key key) {
        mapper.hardDelete(table(key.section()), key.id());
    }

    /** 휴지통의 이 카드들을 잠근다(같이 복원 · 삭제하는 동안). 휴지통에 없는 카드는 빠진다 */
    public List<Locked> lockDeleted(List<Key> keys) {
        List<Locked> out = new ArrayList<>();
        for (String section : TABLES.keySet().stream().sorted().toList()) {
            List<Long> ids = keys.stream().filter(k -> k.section().equals(section)).map(Key::id).toList();
            if (!ids.isEmpty()) {
                mapper.lockDeleted(TABLES.get(section), ids).forEach(r -> out.add(new Locked(KIND_PREFIX + section, r.getId(), r.getDeletedAt())));
            }
        }
        return out;
    }

    /** 휴지통의 인사교 라이프 카드 전부를 잠근다(휴지통 비우기) */
    public List<Locked> lockAllDeleted() {
        List<Locked> out = new ArrayList<>();
        for (String section : TABLES.keySet().stream().sorted().toList()) {
            mapper.lockAllDeleted(TABLES.get(section)).forEach(r -> out.add(new Locked(KIND_PREFIX + section, r.getId(), r.getDeletedAt())));
        }
        return out;
    }

    // ── 칸 정리 ──

    private void fill(String section, LifeItem item, Input in, boolean isNew, CategoryPage page) {
        switch (section) {
            case "fac" -> {
                if (isNew) {
                    String space = trim(in.space());
                    if (!spaces().containsKey(space)) {
                        throw new BusinessException("알 수 없는 공간이에요. 화면을 새로 고쳐 주세요.");
                    }
                    item.setSpaceId(space);
                }
                item.setCaption(text(in.caption(), LifePhotoService.MAX_CAPTION, "사진 이름(설명)"));
                photo(item, in, page);
                String zoom = trim(in.bs()), pos = trim(in.bp());
                java.util.regex.Matcher z = ZOOM.matcher(zoom);
                if (!zoom.isEmpty() && (!z.matches() || Integer.parseInt(z.group(1)) < 100 || Integer.parseInt(z.group(1)) > 400)) {
                    throw new BusinessException("확대 값이 올바르지 않아요.");
                }
                if (!pos.isEmpty() && !POS.matcher(pos).matches()) {
                    throw new BusinessException("사진 위치 값이 올바르지 않아요.");
                }
                item.setZoom(zoom.isEmpty() ? null : zoom);
                item.setPos(pos.isEmpty() ? null : pos);
            }
            case "food" -> {
                if (isNew) {
                    String kind = trim(in.t());
                    if (!FOOD_KINDS.contains(kind)) {
                        throw new BusinessException("식당 · 카페 중 하나를 골라 주세요.");
                    }
                    item.setKind(kind);
                    item.setExample(false);
                }
                String party = trim(in.g()).isEmpty() ? "solo" : trim(in.g());
                if (!PARTIES.contains(party)) {
                    throw new BusinessException("혼밥 · 여럿이 값이 올바르지 않아요.");
                }
                item.setParty(party);
                if (in.w() != null && (in.w() < 1 || in.w() > 120)) {
                    throw new BusinessException("걸어서 걸리는 시간(분)은 1~120 사이로 적어 주세요.");
                }
                item.setWalkMin(in.w());
                item.setCategory(text(in.category(), 12, "분류"));
                item.setName(text(in.name(), 40, "가게 이름"));
                String menu = text(in.menu(), 80, "메뉴 · 위치");
                item.setMenu(menu == null ? null : menu.replaceAll("\\s*·\\s*", " · "));
                String review = text(in.review(), 200, "선배 후기");
                if (!isNew && !Objects.equals(nz(review), nz(item.getReview()))) {
                    item.setExample(false);   // 후기를 고치면 '예시' 표시를 뗀다
                }
                item.setReview(review);
                item.setPhoto(src(in.src(), page));
            }
            default -> {
                if (isNew) {
                    String k = trim(in.k());
                    if (!FUN_KEYS.contains(k)) {
                        throw new BusinessException("알 수 없는 바람 쐬러 가요 묶음이에요.");
                    }
                    item.setGroupKey(k);
                }
                item.setName(text(in.name(), 40, "장소 이름"));
                item.setDistance(text(in.distance(), 40, "거리"));
                item.setFee(text(in.fee(), 30, "요금"));
                item.setSummary(text(in.summary(), 200, "설명"));
                photo(item, in, page);
            }
        }
    }

    /** 사진: 올린 사진(src) 또는 사이트에 원래 있던 그림(cls) 중 하나 */
    private void photo(LifeItem item, Input in, CategoryPage page) {
        String src = src(in.src(), page), cls = trim(in.cls());
        if (src != null) {
            item.setPhoto(src);
            item.setPhotoClass(null);
        } else if (!cls.isEmpty()) {
            if (!IM_CLASS.matcher(cls).matches()) {
                throw new BusinessException("사이트에 없는 그림이에요: " + cls);
            }
            item.setPhoto(null);
            item.setPhotoClass(cls);
        } else {
            item.setPhoto(null);
            item.setPhotoClass(null);
        }
    }

    /** 올린 사진 주소(life/ 기준). 파일이 실제로 있어야 한다. 비었으면 null */
    private static String src(String raw, CategoryPage page) {
        String src = trim(raw);
        if (src.isEmpty()) {
            return null;
        }
        Path file = page.dir().resolve(src).normalize();
        if (!SRC.matcher(src).matches() || src.contains("..") || !file.startsWith(page.dir()) || !Files.isRegularFile(file)) {
            throw new BusinessException("올린 사진 파일을 찾지 못했어요. 사진을 다시 올려 주세요.");
        }
        return src;
    }

    /** 게시할 때 꼭 있어야 하는 칸(사이트 카드 모양) */
    private static void requireComplete(String section, LifeItem item) {
        List<String> need = new ArrayList<>();
        boolean hasPhoto = item.getPhoto() != null || item.getPhotoClass() != null;
        switch (section) {
            case "fac" -> {
                if (!hasPhoto) need.add("사진");
                if (item.getCaption() == null) need.add("사진 이름(설명)");
            }
            case "food" -> {
                if (item.getName() == null) need.add("가게 이름");
                if (item.getCategory() == null) need.add("분류");
                if (item.getWalkMin() == null) need.add("걸어서 몇 분");
                if (item.getMenu() == null) need.add("메뉴 · 위치");
            }
            default -> {
                if (!hasPhoto) need.add("사진");
                if (item.getName() == null) need.add("장소 이름");
                if (item.getDistance() == null) need.add("거리");
                if (item.getFee() == null) need.add("요금");
                if (item.getSummary() == null) need.add("설명");
            }
        }
        if (!need.isEmpty()) {
            throw new BusinessException("게시하려면 " + String.join(" · ", need) + " 칸을 채워 주세요. 다 못 채웠으면 임시저장해 두세요.");
        }
    }

    private static String text(String v, int max, String label) {
        String s = trim(v).replaceAll("\\s+", " ");
        if (s.length() > max) {
            throw new BusinessException(label + "은(는) " + max + "자까지 써 주세요.");
        }
        return s.isEmpty() ? null : s;
    }

    // ── 사이트 페이지에 쓰기 ──

    /** 게시중인 카드만으로 그 묶음(공간 · 먹거리 전체 · 바람 쐬러 가요 묶음)을 다시 써서 사이트에 반영 */
    private void render(String section, Collection<String> scopes) {
        CategoryPage page = page();
        if (pages.hasDraft(page)) {
            throw new BusinessException("인사교 라이프에 아직 사이트에 반영하지 않은 페이지 편집(임시저장)이 있어요. "
                    + "카테고리 페이지 관리 › 인사교 라이프에서 먼저 반영하거나 편집을 취소한 뒤 해 주세요.");
        }
        String html = pages.published(page);
        Document doc = Jsoup.parse(html);
        Map<String, String> known = photos.knownImages("");
        String out = html;
        switch (section) {
            case "fac" -> {
                Map<String, LifeSpace> spaces = spaces();
                Map<String, List<LifeItem>> bySpace = group(published(mapper.findPhotos()), LifeItem::getSpaceId);
                List<LifePhotoService.SpaceEdit> edits = new ArrayList<>();
                for (String spaceId : scopes) {
                    List<LifePhotoService.Photo> list = bySpace.getOrDefault(spaceId, List.of()).stream()
                            .map(p -> new LifePhotoService.Photo(nz(p.getPhotoClass()), nz(p.getPhoto()), nz(p.getZoom()), nz(p.getPos()), nz(p.getCaption())))
                            .toList();
                    LifeSpace space = spaces.get(spaceId);
                    LifePhotoService.SpaceEdit edit = new LifePhotoService.SpaceEdit(spaceId, space == null ? "" : nz(space.getBadge()), list);
                    out = photos.writeSpace(out, doc, edit, page, known, html);
                    edits.add(edit);
                }
                LifePhotoService.verify(out, edits);
            }
            case "food" -> {
                List<LifeTipService.Food> list = published(mapper.findFoods()).stream()
                        .map(f -> new LifeTipService.Food(f.getKind(), f.getParty(), f.getWalkMin(), f.getCategory(), f.getName(), f.getMenu(),
                                f.getReview(), Boolean.TRUE.equals(f.getExample()), nz(f.getPhoto())))
                        .toList();
                out = tips.applyFood(out, doc, list, page);
                tips.verify(Jsoup.parse(out), list, null);
            }
            default -> {
                Map<String, List<LifeItem>> byGroup = group(published(mapper.findSpots()), LifeItem::getGroupKey);
                List<LifeTipService.FunGroup> groups = new ArrayList<>();
                for (String k : scopes) {
                    groups.add(new LifeTipService.FunGroup(k, byGroup.getOrDefault(k, List.of()).stream()
                            .map(c -> new LifeTipService.Fun(c.getName(), c.getDistance(), c.getFee(), c.getSummary(), nz(c.getPhotoClass()), nz(c.getPhoto())))
                            .toList()));
                }
                out = tips.applyFun(out, groups, page, known);
                tips.verify(Jsoup.parse(out), null, groups);
            }
        }
        if (!out.equals(html)) {
            pages.publish(page, out, NOTE);
        }
    }

    // ── 처음: 페이지 → 표 ──

    @EventListener(ContextRefreshedEvent.class)
    public void onReady() {
        try {
            int n = ensureImported();
            if (n > 0) {
                log.info("인사교 라이프 페이지의 사진 · 카드 {}개를 DB 표(life_facility_photos · life_foods · life_spots)로 옮겼습니다.", n);
            }
        } catch (RuntimeException e) {
            log.warn("인사교 라이프 페이지의 사진 · 카드를 DB로 옮기지 못했습니다.", e);
        }
    }

    /** 표가 비어 있고 사이트에 인사교 라이프 페이지가 있으면 지금 페이지의 공간 · 사진 · 카드를 게시중으로 옮겨 담는다. 옮긴 카드 수 */
    public synchronized int ensureImported() {
        CategoryPage page = page();
        if (!pages.exists(page) || mapper.countAll() > 0) {
            return 0;
        }
        Map<String, Object> read = photos.readPage("");
        Integer n = tx.execute(st -> {
            int count = 0, order = 1;
            for (Map<String, Object> f : maps(read.get("floors"))) {
                for (Map<String, Object> s : maps(f.get("spaces"))) {
                    count += insertSpaceWithPhotos(f, s, order++);
                }
            }
            Map<String, Integer> foodOrder = new LinkedHashMap<>();
            for (Map<String, Object> m : maps(read.get("food"))) {
                LifeItem f = new LifeItem();
                f.setKind(str(m.get("t")));
                f.setParty(PARTIES.contains(str(m.get("g"))) ? str(m.get("g")) : "solo");
                f.setWalkMin(m.get("w") instanceof Number w && w.intValue() >= 1 && w.intValue() <= 120 ? w.intValue() : null);
                f.setCategory(blank(m.get("category")));
                f.setName(blank(m.get("name")));
                f.setMenu(blank(m.get("menu")));
                f.setReview(blank(m.get("review")));
                f.setExample(Boolean.TRUE.equals(m.get("example")));
                f.setPhoto(blank(m.get("src")));
                f.setSortOrder(foodOrder.merge(f.getKind(), 1, Integer::sum));
                f.setStatus(PUBLISHED);
                if (FOOD_KINDS.contains(f.getKind())) {
                    mapper.insertFood(f);
                    count++;
                }
            }
            for (Map<String, Object> g : maps(read.get("fun"))) {
                int i = 1;
                for (Map<String, Object> c : maps(g.get("cards"))) {
                    LifeItem spot = new LifeItem();
                    spot.setGroupKey(str(g.get("k")));
                    spot.setName(blank(c.get("name")));
                    spot.setDistance(blank(c.get("distance")));
                    spot.setFee(blank(c.get("fee")));
                    spot.setSummary(blank(c.get("summary")));
                    spot.setPhoto(blank(c.get("src")));
                    spot.setPhotoClass(spot.getPhoto() == null ? blank(c.get("cls")) : null);
                    spot.setSortOrder(i++);
                    spot.setStatus(PUBLISHED);
                    if (FUN_KEYS.contains(spot.getGroupKey())) {
                        mapper.insertSpot(spot);
                        count++;
                    }
                }
            }
            return count;
        });
        return n == null ? 0 : n;
    }

    /** 페이지의 공간이 표에 없으면(디자이너가 새로 넣은 공간) 그 공간과 사진을 담고, 이름 · 층 · 순서는 페이지에 맞춘다 */
    private void syncSpaces(Map<String, Object> read) {
        Map<String, LifeSpace> known = spaces();
        tx.executeWithoutResult(st -> {
            int order = 1;
            for (Map<String, Object> f : maps(read.get("floors"))) {
                for (Map<String, Object> s : maps(f.get("spaces"))) {
                    LifeSpace space = known.get(String.valueOf(s.get("id")));
                    if (space == null) {
                        insertSpaceWithPhotos(f, s, order);
                    } else if (!Objects.equals(space.getName(), name(s)) || !Objects.equals(space.getFloorKey(), str(f.get("g")))
                            || !Objects.equals(space.getSortOrder(), order)) {
                        space.setName(name(s));
                        space.setFloorKey(str(f.get("g")));
                        space.setSortOrder(order);
                        mapper.updateSpace(space);
                    }
                    order++;
                }
            }
        });
    }

    private int insertSpaceWithPhotos(Map<String, Object> floor, Map<String, Object> s, int order) {
        LifeSpace space = new LifeSpace();
        space.setSpaceId(str(s.get("id")));
        space.setFloorKey(str(floor.get("g")));
        space.setName(name(s));
        String badge = str(s.get("badge"));
        space.setBadge(Set.of("ex", "tmp").contains(badge) ? badge : "");
        space.setSortOrder(order);
        mapper.insertSpace(space);
        int i = 1;
        for (Map<String, Object> p : maps(s.get("photos"))) {
            LifeItem photo = new LifeItem();
            photo.setSpaceId(space.getSpaceId());
            photo.setPhoto(blank(p.get("src")));
            photo.setPhotoClass(photo.getPhoto() == null ? blank(p.get("cls")) : null);
            photo.setZoom(blank(p.get("bs")));
            photo.setPos(blank(p.get("bp")));
            photo.setCaption(blank(p.get("caption")));
            photo.setSortOrder(i++);
            photo.setStatus(PUBLISHED);
            mapper.insertPhoto(photo);
        }
        return i - 1;
    }

    private static String name(Map<String, Object> space) {
        String name = str(space.get("name"));
        return name.length() > 40 ? name.substring(0, 40) : name;
    }

    // ── 도움 ──

    private static String table(String section) {
        String table = section == null ? null : TABLES.get(section);
        if (table == null) {
            throw new NotFoundException("알 수 없는 인사교 라이프 목록이에요.");
        }
        return table;
    }

    private LifeItem find(String section, Long id) {
        if (id == null) {
            return null;
        }
        return switch (section) {
            case "fac" -> mapper.findPhoto(id);
            case "food" -> mapper.findFood(id);
            default -> mapper.findSpot(id);
        };
    }

    /** 카드가 속한 묶음: 시설 사진은 공간, 먹거리는 전체(식당 · 카페 수를 같이 셈), 바람 쐬러 가요는 묶음 */
    private static String scope(String section, LifeItem item) {
        return switch (section) {
            case "fac" -> item.getSpaceId();
            case "food" -> "food";
            default -> item.getGroupKey();
        };
    }

    /** 같은 공간 · 식당/카페 · 묶음의 카드(휴지통 제외, 순서대로) */
    private List<LifeItem> siblings(String section, LifeItem item) {
        return switch (section) {
            case "fac" -> mapper.findPhotos().stream().filter(p -> Objects.equals(p.getSpaceId(), item.getSpaceId())).toList();
            case "food" -> mapper.findFoods().stream().filter(f -> Objects.equals(f.getKind(), item.getKind())).toList();
            default -> mapper.findSpots().stream().filter(c -> Objects.equals(c.getGroupKey(), item.getGroupKey())).toList();
        };
    }

    private int nextOrder(String section, LifeItem item) {
        return switch (section) {
            case "fac" -> mapper.nextPhotoOrder(item.getSpaceId());
            case "food" -> mapper.nextFoodOrder(item.getKind());
            default -> mapper.nextSpotOrder(item.getGroupKey());
        };
    }

    private Map<String, LifeSpace> spaces() {
        return mapper.findSpaces().stream().collect(Collectors.toMap(LifeSpace::getSpaceId, s -> s, (a, b) -> a, LinkedHashMap::new));
    }

    private static List<LifeItem> published(List<LifeItem> items) {
        return items.stream().filter(i -> PUBLISHED.equals(i.getStatus()))
                .sorted(Comparator.comparing((LifeItem i) -> i.getSortOrder() == null ? 0 : i.getSortOrder()).thenComparing(LifeItem::getId))
                .toList();
    }

    private static <K> Map<K, List<LifeItem>> group(List<LifeItem> items, Function<LifeItem, K> key) {
        Map<K, List<LifeItem>> out = new LinkedHashMap<>();
        for (LifeItem item : items) {
            out.computeIfAbsent(key.apply(item), k -> new ArrayList<>()).add(item);
        }
        return out;
    }

    private static int indexOf(List<LifeItem> list, Long id) {
        for (int i = 0; i < list.size(); i++) {
            if (Objects.equals(list.get(i).getId(), id)) {
                return i;
            }
        }
        return -1;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> maps(Object v) {
        return v instanceof List<?> l ? (List<Map<String, Object>>) l : List.of();
    }

    /** 지금 로그인한 관리자 번호(쓴 사람). 화면 밖(시작할 때 등)이면 null */
    private static Long currentAdminId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getPrincipal() instanceof egovframework.backoffice.account.CurrentAdmin me ? me.getId() : null;
    }

    private static String str(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    private static String blank(Object v) {
        String s = str(v);
        return s.isEmpty() ? null : s;
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }
}
