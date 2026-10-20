package egovframework.backoffice.page;

import static java.nio.charset.StandardCharsets.UTF_8;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import egovframework.backoffice.common.BusinessException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.springframework.stereotype.Service;

/**
 * 게시물 관리 › 인사교 라이프 게시물 관리 화면의 서버 쪽: 시설 사진({@link LifeFacilityService}) · 오늘 점심 · 바람 쐬러 가요({@link LifeTipService})를
 * 한 화면에 보여 주고 저장한다. 셋 다 DB에 있고(사이트는 공개 API로 받아 그림), 바꾸기 바로 전 모습은 버전 기록({@link LifeVersionService})에,
 * 목록에서 뺀 카드는 휴지통에 남는다. 층 · 공간 이름과 안내 글은 페이지 파일(카테고리 페이지 관리)에서 읽기만 한다.
 */
@Service
public class LifePhotoService {

    static final String PAGE_ID = "life";

    private static final Pattern CSS_IM = Pattern.compile("\\.im-([A-Za-z0-9_-]+)\\{background-image:url\\([\"']?\\.\\./assets/([^\"')]+)[\"']?\\)");

    /**
     * baseHash: 화면을 열 때의 내용(그사이 다른 곳에서 바뀌었으면 저장하지 않음).
     * spaces 시설 사진 · food 오늘 점심 카드 · fun 바람 쐬러 가요 묶음 — 바꾼 것만 보낸다.
     */
    public record SaveRequest(String baseHash, List<LifeFacilityService.SpaceEdit> spaces, List<LifeTipService.Food> food, List<LifeTipService.FunGroup> fun) { }

    private final CategoryPageService pages;
    private final LifeTipService tips;
    private final LifeFacilityService facility;
    private final LifeVersionService versions;
    private final ObjectMapper json;

    public LifePhotoService(CategoryPageService pages, LifeTipService tips, LifeFacilityService facility, LifeVersionService versions, ObjectMapper json) {
        this.pages = pages;
        this.tips = tips;
        this.facility = facility;
        this.versions = versions;
        this.json = json;
    }

    // ── 읽기 ──

    public Map<String, Object> model(String contextPath) {
        CategoryPage page = pages.page(PAGE_ID);
        String html = pages.published(page);
        Map<String, String> known = knownImages(contextPath);
        Document doc = Jsoup.parse(html);
        List<Map<String, Object>> floors = facility.floors(doc);
        Map<String, LifeFacilityService.SpaceEdit> saved = facility.spaces();
        for (Map<String, Object> floor : floors) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> spaces = (List<Map<String, Object>>) floor.get("spaces");
            for (Map<String, Object> space : spaces) {
                LifeFacilityService.SpaceEdit s = saved.get(String.valueOf(space.get("id")));
                space.put("badge", s == null ? "" : s.badge());
                List<Map<String, Object>> photos = new ArrayList<>();
                for (LifeFacilityService.Photo p : s == null ? List.<LifeFacilityService.Photo>of() : s.photos()) {
                    Map<String, Object> photo = new LinkedHashMap<>();
                    photo.put("cls", p.cls());
                    photo.put("src", p.src());
                    photo.put("bs", p.bs());
                    photo.put("bp", p.bp());
                    photo.put("caption", p.caption());
                    photo.put("url", !p.src().isEmpty() ? contextPath + "/admin/pages/site/life/" + p.src() : known.getOrDefault(p.cls(), ""));
                    photos.add(photo);
                }
                space.put("photos", photos);
            }
        }
        Map<String, Object> model = new LinkedHashMap<>();
        model.put("hash", stateHash(html));
        model.put("hasDraft", false);   // 셋 다 DB라 페이지 편집 임시저장과 겹치지 않아요
        model.put("defaultFloor", doc.selectFirst("#pg-facility .bx9") == null ? "" : doc.selectFirst("#pg-facility .bx9").attr("data-g"));
        model.put("floors", floors);
        model.put("maxPhotos", LifeFacilityService.MAX_PHOTOS);
        model.put("trashCount", tips.trashCount());
        model.putAll(tips.model(doc, known, contextPath));   // 생활 꿀팁(DB): food · fun
        return model;
    }

    /** 화면을 연 뒤 다른 곳에서 바뀌었는지: 공간 이름을 읽는 페이지 + DB의 사진 · 카드 */
    private String stateHash(String html) {
        return hash(html + "\n" + tips.fingerprint());
    }

    /** life.css 의 .im-이름{background-image:url(../assets/파일)} → 미리보기 주소 */
    private Map<String, String> knownImages(String contextPath) {
        Map<String, String> map = new LinkedHashMap<>();
        Optional<Path> css = pages.siteFile("life/css/life.css");
        if (css.isEmpty()) {
            return map;
        }
        try {
            Matcher m = CSS_IM.matcher(Files.readString(css.get(), UTF_8));
            while (m.find()) {
                map.putIfAbsent("im-" + m.group(1), contextPath + "/admin/pages/site/life/assets/" + m.group(2));
            }
        } catch (IOException e) {
            throw new BusinessException("인사교 라이프 스타일 파일(life.css)을 읽지 못했어요.");
        }
        return map;
    }

    private Set<String> spaceIds(Document doc) {
        Set<String> ids = new HashSet<>();
        doc.select("#pg-facility .bx9-s[id]").forEach(s -> ids.add(s.id()));
        return ids;
    }

    // ── 저장 ──

    public synchronized Map<String, Object> save(SaveRequest request, String contextPath, Long by) {
        CategoryPage page = pages.page(PAGE_ID);
        List<LifeFacilityService.SpaceEdit> spaces = request == null || request.spaces() == null ? List.of() : request.spaces();
        if (request == null || (spaces.isEmpty() && request.food() == null && request.fun() == null)) {
            throw new BusinessException("저장할 내용이 없어요.");
        }
        String html = pages.published(page);
        if (request.baseHash() == null || !request.baseHash().equals(stateHash(html))) {
            throw new BusinessException("화면을 연 뒤에 인사교 라이프 내용이 바뀌었어요. 화면을 새로 고친 뒤 다시 저장해 주세요(고친 내용은 다시 해 주셔야 해요).");
        }
        Map<String, String> known = knownImages(contextPath);
        Document doc = Jsoup.parse(html);
        boolean changed = facility.save(spaces, page, spaceIds(doc), known, by, "SAVE");
        changed |= tips.save(request.food(), request.fun(), page, known, by, "SAVE");
        if (changed) {
            tips.regenerate();   // 사이트 사본(life-data.js)도 새로
        }
        Map<String, Object> model = model(contextPath);
        model.put("saved", changed);
        return model;
    }

    // ── 버전 기록 ──

    public List<Map<String, Object>> versions(String section) {
        return versions.list(section);
    }

    /** 버전 기록의 모습으로 되돌리기(지금 모습은 버전 기록에 남음). 화면 모델에 restored = 그 묶음 */
    public synchronized Map<String, Object> restore(Long versionId, String contextPath, Long by) {
        LifeVersion v = versions.get(versionId);
        CategoryPage page = pages.page(PAGE_ID);
        Map<String, String> known = knownImages(contextPath);
        boolean changed;
        try {
            switch (v.getSection()) {
                case "food" -> changed = tips.save(json.readValue(v.getData(), new TypeReference<List<LifeTipService.Food>>() { }), null, page, known, by, "RESTORE");
                case "fun" -> changed = tips.save(null, json.readValue(v.getData(), new TypeReference<List<LifeTipService.FunGroup>>() { }), page, known, by, "RESTORE");
                case "fac" -> {
                    List<LifeFacilityService.SpaceEdit> spaces = json.readValue(v.getData(), new TypeReference<List<LifeFacilityService.SpaceEdit>>() { });
                    Set<String> ids = spaceIds(Jsoup.parse(pages.published(page)));
                    // 그사이 페이지에서 없어진 공간은 빼고 되돌려요
                    changed = facility.save(spaces.stream().filter(s -> ids.contains(s.id())).toList(), page, ids, known, by, "RESTORE");
                }
                default -> throw new BusinessException("알 수 없는 버전 기록이에요.");
            }
        } catch (JsonProcessingException e) {
            throw new BusinessException("버전 기록을 읽지 못했어요.");
        }
        if (changed) {
            tips.regenerate();
        }
        Map<String, Object> model = model(contextPath);
        model.put("saved", changed);
        model.put("restored", v.getSection());
        return model;
    }

    // ── 도움(다른 곳에서도 씀) ──

    /** start 의 여는 태그와 짝이 맞는 닫는 태그: {여는 태그 끝, 닫는 태그 시작, 닫는 태그 끝} */
    static int[] element(String s, int start) {
        Matcher name = Pattern.compile("<([a-zA-Z0-9]+)").matcher(s);
        if (start < 0 || !name.find(start) || name.start() != start) {
            throw new BusinessException("페이지 모양이 예상과 달라 저장하지 않았어요.");
        }
        Matcher tag = Pattern.compile("<(/?)" + name.group(1) + "\\b[^>]*>").matcher(s);
        int openEnd = s.indexOf('>', start) + 1, depth = 0, pos = start;
        while (tag.find(pos)) {
            depth += tag.group(1).isEmpty() ? 1 : -1;
            if (depth == 0) {
                return new int[] {openEnd, tag.start(), tag.end()};
            }
            pos = tag.end();
        }
        throw new BusinessException("페이지 모양이 예상과 달라 저장하지 않았어요(닫는 태그 없음).");
    }

    static String hash(String html) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(html.getBytes(UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
