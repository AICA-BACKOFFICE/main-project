package egovframework.backoffice.post;

import egovframework.backoffice.post.story.StoryContent;
import egovframework.backoffice.post.story.StoryKind;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 글 양식 값(글쓰기 화면 · 사이트가 쓰는 JSON 모양) ↔ 표 칸. 양식 값은 {@link StoryContent#normalize} 로 정리된 것을 받는다.
 * <pre>
 * 후기     cat → category(한글 분야) · author → senior_name · body[] → body(문단 사이 빈 줄) · tags[번호] → tags(#글자) · hub → show_on_hub
 *          (반 · 직군 track 과 흐르는 한마디 ticker 는 2026-10-20 V17부터 후기 표에 없음 — 들어와도 버린다)
 * 인터뷰   author → senior_name · qa[] → qa(JSON) · video{yt,dur} → video_url · video_length
 * 프로젝트 sections[문제 정의 · 주요 기능 · 기술 설명] → problem · features · tech · tags[] → tags(#글자) · links[] → links(JSON)
 *          글 제목 → service_name(서비스 이름) · headline → project_subject(프로젝트 주제, 카드 큰 제목) · summary → summary(한 줄 요약)
 * 기수별 이모저모 cohort → cohort · date(2026-08-20) → event_date · body[] → body(문단 사이 빈 줄) · video{yt,dur} → video_url · video_length
 *          (요약 · 태그 칸은 없음, V27)
 * 공통     photos · cover · img(+ 사이트에서 가져온 그림 heroImg · imgLarge · art · heroArt) → photos(JSON)
 * </pre>
 */
final class StoryColumns {

    /** 후기 분야: 양식 값 ↔ 표에 들어가는 한글 이름 */
    static final Map<String, String> REVIEW_CATEGORY = Map.of("life", "생활", "class", "수업", "proj", "프로젝트", "job", "취업 성공", "path", "진로 고민");
    static final List<String> SECTIONS = List.of("문제 정의", "주요 기능", "기술 설명");
    private static final List<String> PHOTO_KEYS = List.of("photos", "cover", "img", "heroImg", "imgLarge", "art", "heroArt");

    private StoryColumns() {
    }

    /** 양식 값 → 표 칸(제목 · 상태 같은 공통 칸은 {@link PostStore} 가 채운다) */
    static void toRow(StoryKind kind, Map<String, Object> s, StoryRow row, StoryContent json) {
        row.setSummary(str(s.get("summary")));
        row.setPhotos(photos(s, json));
        switch (kind) {
            case REVIEW -> {
                String cat = str(s.get("cat"));
                row.setCategory(cat == null ? null : REVIEW_CATEGORY.get(cat));
                row.setCohort(num(s.get("cohort")));
                row.setSeniorName(str(s.get("author")));
                List<String> body = new ArrayList<>();
                list(s.get("body")).forEach(p -> body.add(String.valueOf(p)));
                row.setBody(body.isEmpty() ? null : String.join("\n\n", body));
                List<String> tags = new ArrayList<>();
                for (Object o : list(s.get("tags"))) {
                    if (o instanceof Number n && n.intValue() >= 0 && n.intValue() < StoryContent.REVIEW_TAGS.size()) {
                        tags.add(StoryContent.REVIEW_TAGS.get(n.intValue()));
                    }
                }
                row.setTags(tags.isEmpty() ? null : String.join(" ", tags));
                row.setShowOnHub(Boolean.TRUE.equals(s.get("hub")));
            }
            case INTERVIEW -> {
                row.setCohort(num(s.get("cohort")));
                row.setSeniorName(str(s.get("author")));
                row.setTrack(str(s.get("track")));
                row.setQa(list(s.get("qa")).isEmpty() ? null : json.serialize(s.get("qa")));
                if (s.get("video") instanceof Map<?, ?> v && v.get("yt") != null) {
                    row.setVideoUrl("https://www.youtube.com/watch?v=" + v.get("yt"));
                    row.setVideoLength(str(v.get("dur")));
                }
            }
            case PROJECT -> {
                row.setCohort(num(s.get("cohort")));
                row.setClassName(str(s.get("className")));
                row.setMajor(str(s.get("major")));
                row.setTeamName(str(s.get("teamName")));
                row.setTeamSize(num(s.get("teamSize")));
                row.setHeadline(str(s.get("headline")));
                List<?> secs = list(s.get("sections"));
                String[] p = new String[3];
                for (int i = 0; i < secs.size() && i < 3; i++) {
                    if (secs.get(i) instanceof Map<?, ?> m) {
                        p[i] = str(m.get("p"));
                    }
                }
                row.setProblem(p[0]);
                row.setFeatures(p[1]);
                row.setTech(p[2]);
                List<String> tags = new ArrayList<>();
                list(s.get("tags")).forEach(t -> tags.add(String.valueOf(t)));
                row.setTags(tags.isEmpty() ? null : String.join(" ", tags));
                row.setLinks(list(s.get("links")).isEmpty() ? null : json.serialize(s.get("links")));
            }
            case COHORT -> {
                row.setCohort(num(s.get("cohort")));
                List<String> body = new ArrayList<>();
                list(s.get("body")).forEach(p -> body.add(String.valueOf(p)));
                row.setBody(body.isEmpty() ? null : String.join("\n\n", body));
                row.setEventDate(date(s.get("date")));
                if (s.get("video") instanceof Map<?, ?> v && v.get("yt") != null) {
                    row.setVideoUrl("https://www.youtube.com/watch?v=" + v.get("yt"));
                    row.setVideoLength(str(v.get("dur")));
                }
            }
        }
    }

    /** 표 칸 → 양식 값(글쓰기 화면 · 사이트 · 미리보기가 읽는 모양) */
    static Map<String, Object> toStory(StoryKind kind, StoryRow r, StoryContent json) {
        Map<String, Object> s = new LinkedHashMap<>();
        switch (kind) {
            case REVIEW -> {
                REVIEW_CATEGORY.forEach((key, name) -> {
                    if (name.equals(r.getCategory())) {
                        s.put("cat", key);
                    }
                });
                put(s, "summary", r.getSummary());
                if (r.getBody() != null && !r.getBody().isBlank()) {
                    List<String> body = new ArrayList<>();
                    for (String para : r.getBody().split("\\n\\s*\\n")) {
                        if (!para.isBlank()) {
                            body.add(para.trim());
                        }
                    }
                    s.put("body", body);
                }
                put(s, "cohort", r.getCohort());
                put(s, "author", r.getSeniorName());
                List<Integer> tags = new ArrayList<>();
                for (String t : words(r.getTags())) {
                    int i = StoryContent.REVIEW_TAGS.indexOf(t.startsWith("#") ? t : "#" + t);
                    if (i >= 0 && !tags.contains(i)) {
                        tags.add(i);
                    }
                }
                put(s, "tags", tags);
                if (Boolean.TRUE.equals(r.getShowOnHub())) {
                    s.put("hub", true);
                }
                photos(s, r, json);
            }
            case INTERVIEW -> {
                put(s, "summary", r.getSummary());
                put(s, "cohort", r.getCohort());
                put(s, "author", r.getSeniorName());
                put(s, "track", r.getTrack());
                photos(s, r, json);
                if (r.getVideoUrl() != null && !r.getVideoUrl().isBlank()) {
                    Map<String, Object> video = new LinkedHashMap<>();
                    video.put("yt", StoryContent.youtubeId(r.getVideoUrl()));
                    put(video, "dur", r.getVideoLength());
                    if (video.get("yt") != null) {
                        s.put("video", video);
                    }
                }
                put(s, "qa", parseList(r.getQa(), json));
            }
            case PROJECT -> {
                put(s, "tags", words(r.getTags()));
                put(s, "summary", r.getSummary());
                put(s, "headline", r.getHeadline());
                put(s, "cohort", r.getCohort());
                put(s, "className", r.getClassName());
                put(s, "major", r.getMajor());
                put(s, "teamName", r.getTeamName());
                put(s, "teamSize", r.getTeamSize());
                photos(s, r, json);
                String[] p = {r.getProblem(), r.getFeatures(), r.getTech()};
                if (p[0] != null || p[1] != null || p[2] != null) {
                    List<Map<String, Object>> secs = new ArrayList<>();
                    for (int i = 0; i < 3; i++) {
                        Map<String, Object> sec = new LinkedHashMap<>();
                        sec.put("h", SECTIONS.get(i));
                        sec.put("p", p[i] == null ? "" : p[i]);
                        secs.add(sec);
                    }
                    s.put("sections", secs);
                }
                put(s, "links", parseList(r.getLinks(), json));
            }
            case COHORT -> {
                put(s, "cohort", r.getCohort());
                if (r.getEventDate() != null) {
                    s.put("date", r.getEventDate().toString());   // 2026-08-20(글쓰기 화면 날짜 칸 모양)
                }
                put(s, "body", paragraphs(r.getBody()));
                photos(s, r, json);
                if (r.getVideoUrl() != null && !r.getVideoUrl().isBlank()) {
                    Map<String, Object> video = new LinkedHashMap<>();
                    video.put("yt", StoryContent.youtubeId(r.getVideoUrl()));
                    put(video, "dur", r.getVideoLength());
                    if (video.get("yt") != null) {
                        s.put("video", video);
                    }
                }
            }
        }
        return s;
    }

    /** 문단 사이 빈 줄로 나뉜 글 → 문단 목록 */
    private static List<String> paragraphs(String text) {
        List<String> out = new ArrayList<>();
        if (text != null) {
            for (String para : text.split("\\n\\s*\\n")) {
                if (!para.isBlank()) {
                    out.add(para.trim());
                }
            }
        }
        return out;
    }

    /** 양식의 날짜(2026-08-20) → 날짜. 모양이 맞지 않으면 null */
    private static java.time.LocalDate date(Object v) {
        String s = str(v);
        if (s == null) {
            return null;
        }
        try {
            return java.time.LocalDate.parse(s);
        } catch (java.time.format.DateTimeParseException e) {
            return null;
        }
    }

    /** 목록의 대표 사진 칸(img)만 */
    static Map<String, Object> photoMap(String photos, StoryContent json) {
        return photos == null || photos.isBlank() ? Map.of() : json.parse(photos);
    }

    private static String photos(Map<String, Object> s, StoryContent json) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (String k : PHOTO_KEYS) {
            if (s.get(k) != null) {
                out.put(k, s.get(k));
            }
        }
        return out.isEmpty() ? null : json.serialize(out);
    }

    private static void photos(Map<String, Object> s, StoryRow r, StoryContent json) {
        photoMap(r.getPhotos(), json).forEach((k, v) -> {
            if (PHOTO_KEYS.contains(k) && v != null) {
                s.put(k, v);
            }
        });
    }

    private static List<?> parseList(String raw, StoryContent json) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        return json.parseList(raw);
    }

    private static List<?> list(Object v) {
        return v instanceof List<?> l ? l : List.of();
    }

    private static List<String> words(String s) {
        List<String> out = new ArrayList<>();
        if (s != null) {
            for (String w : s.trim().split("\\s+")) {
                if (!w.isEmpty()) {
                    out.add(w);
                }
            }
        }
        return out;
    }

    private static String str(Object v) {
        if (v == null || v instanceof Map || v instanceof List) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static Integer num(Object v) {
        return v instanceof Number n ? Integer.valueOf(n.intValue()) : null;
    }

    private static void put(Map<String, Object> s, String key, Object value) {
        if (value == null || (value instanceof String t && t.isBlank()) || (value instanceof List<?> l && l.isEmpty())) {
            return;
        }
        s.put(key, value);
    }
}
