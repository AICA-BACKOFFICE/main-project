package egovframework.backoffice.post.story;

import static java.nio.charset.StandardCharsets.UTF_8;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import egovframework.backoffice.account.AdminRole;
import egovframework.backoffice.account.AdminUser;
import egovframework.backoffice.account.AdminUserMapper;
import egovframework.backoffice.category.Category;
import egovframework.backoffice.category.CategoryService;
import egovframework.backoffice.config.BackofficeProperties;
import egovframework.backoffice.page.CategoryPageService;
import egovframework.backoffice.post.Post;
import egovframework.backoffice.post.PostAssembler;
import egovframework.backoffice.post.PostForm;
import egovframework.backoffice.post.PostStatus;
import egovframework.backoffice.post.PostStore;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.FileSystemException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.UnaryOperator;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.core.annotation.Order;
import org.springframework.context.event.EventListener;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 선배들의 이야기 사이트 반영. 게시중인 글(후기 · 인터뷰 · 프로젝트 표)을 DB에서 최신 게시 순으로 모은다. 기수별 모아보기는 사이트 HTML(2026-10-20부터).
 * 사이트(stories-render.js)는 공개 API({@link #publishedScript()}, /api/public/stories.js)로 이 내용을 받아 목록 · 글 창 · 한눈에 보기를 그린다.
 * 백오피스가 꺼져 있어도 보이도록 같은 내용을 사이트 폴더의 stories/js/stories-data.js 사본으로도 쓴다.
 * <ul>
 *   <li>게시물이 바뀌면(저장 · 게시 · 미게시 · 휴지통 · 복원 · 완전 삭제) 커밋 뒤 바로 사본을 다시 쓴다. 내용이 같으면 쓰지 않는다.</li>
 *   <li>관리자가 올린 사진(/uploads/…)은 사이트의 stories/assets/uploads/post-… 로 복사해 사이트만으로도 보이게 한다.</li>
 *   <li>DB에 글이 하나도 없을 때(새 컴퓨터 · 새 서버) 켜면 사이트 사본의 글을 게시물로 가져온다. DB에 글이 있으면 DB가 기준이다.</li>
 *   <li>미리보기: 사이트 화면 그대로, 데이터 파일만 '이 글을 넣은 내용'으로 바꿔 보여 준다(사이트 파일은 건드리지 않음).</li>
 * </ul>
 */
@Service
public class StorySiteService {

    private static final Logger log = LoggerFactory.getLogger(StorySiteService.class);

    static final String DATA_FILE = "stories/js/stories-data.js";
    static final String STORIES_PAGE = "stories/index.html";
    /** 글 종류마다 그 글이 보이는 페이지(2026-10-14 사이트 새 시안: 한눈에 보기 + 종류별 페이지) */
    static final Map<StoryKind, String> KIND_PAGES = Map.of(StoryKind.REVIEW, "stories/reviews.html", StoryKind.INTERVIEW, "stories/interviews.html",
            StoryKind.PROJECT, "stories/projects.html");
    static final String UPLOAD_DIR = "stories/assets/uploads";
    static final String COPY_PREFIX = "post-";
    private static final String HEADER = "/* 선배들의 이야기 글 사본: 사이트는 백오피스 공개 API(/api/public/stories.js)로 DB의 글을 받아 그려요. "
            + "이 파일은 백오피스가 꺼져 있을 때 쓰는 사본이라 게시물 관리가 게시·미게시·휴지통·복원할 때마다 다시 써요. 직접 고치지 마세요. */\n";
    private static final String API_HEADER = "/* 선배들의 이야기 글: 백오피스 DB에서 지금 게시중인 글(게시물 관리) */\n";
    /** 공개 API 주소(사이트 기준). 사이트 페이지는 ../api/public/stories.js 로 부른다 */
    public static final String API_SCRIPT = "api/public/stories.js";
    private static final long PREVIEW_TTL_MS = 3 * 60 * 60 * 1000L;
    private static final int PREVIEW_MAX = 100;
    private static final Map<String, String> TYPES = Map.ofEntries(
            Map.entry("html", "text/html;charset=UTF-8"), Map.entry("css", "text/css;charset=UTF-8"),
            Map.entry("js", "text/javascript;charset=UTF-8"), Map.entry("json", "application/json;charset=UTF-8"),
            Map.entry("svg", "image/svg+xml"), Map.entry("png", "image/png"), Map.entry("jpg", "image/jpeg"),
            Map.entry("jpeg", "image/jpeg"), Map.entry("webp", "image/webp"), Map.entry("gif", "image/gif"),
            Map.entry("avif", "image/avif"), Map.entry("ico", "image/x-icon"), Map.entry("woff2", "font/woff2"),
            Map.entry("woff", "font/woff"), Map.entry("ttf", "font/ttf"), Map.entry("otf", "font/otf"),
            Map.entry("mp4", "video/mp4"), Map.entry("webm", "video/webm"));

    /** 미리보기 한 번: 데이터 파일 내용과 열 주소(#…) */
    record Preview(String js, String hash, String note, long createdAt) { }

    private final PostStore posts;
    private final PostAssembler assembler;
    private final StoryContent stories;
    private final CategoryService categories;
    private final CategoryPageService pages;
    private final AdminUserMapper admins;
    private final ObjectMapper json;
    private final TransactionTemplate tx;
    private final Path uploadRoot;
    private final Map<String, Preview> previews = new ConcurrentHashMap<>();

    public StorySiteService(PostStore posts, PostAssembler assembler, StoryContent stories,
                            CategoryService categories, CategoryPageService pages, AdminUserMapper admins, ObjectMapper json,
                            TransactionTemplate tx, BackofficeProperties properties) {
        this.posts = posts;
        this.assembler = assembler;
        this.stories = stories;
        this.categories = categories;
        this.pages = pages;
        this.admins = admins;
        this.json = json;
        this.tx = tx;
        this.uploadRoot = Paths.get(properties.getUploadDir()).toAbsolutePath().normalize();
    }

    /** 사이트 폴더에 선배들의 이야기 페이지가 있을 때만 동작한다(테스트 · 사이트 없이 켠 경우는 조용히 건너뜀) */
    public boolean enabled() {
        return Files.isRegularFile(pages.siteRoot().resolve(STORIES_PAGE));
    }

    // ── 사이트 반영 ──

    @TransactionalEventListener(fallbackExecution = true)
    public void onStoriesChanged(StoryChangedEvent event) {
        try {
            regenerate();
        } catch (RuntimeException e) {
            log.warn("선배들의 이야기 사이트 데이터를 쓰지 못했습니다(게시물 {}).", event.postId(), e);
        }
    }

    /** 게시중인 글로 사이트 데이터를 다시 쓴다. 썼거나 이미 같으면 true */
    public boolean regenerate() {
        return regenerate(false);
    }

    /** DB의 게시중인 글로 사본을 다시 쓴다(DB가 기준. 사본을 손으로 고친 내용은 DB가 비어 있을 때만 가져온다) */
    private synchronized boolean regenerate(boolean imported) {
        if (!enabled()) {
            return false;
        }
        Path file = pages.siteRoot().resolve(DATA_FILE);
        Set<String> copies = new HashSet<>();
        Map<String, Object> data = build(posts.findPublishedStories(), null, src -> publishImage(src, copies));
        String js = toJs(HEADER, data);
        String old = Files.isRegularFile(file) ? read(file) : null;
        if (!js.equals(old)) {
            writeAtomic(file, js.getBytes(UTF_8));
            log.info("선배들의 이야기 사이트 데이터를 다시 썼습니다: {}", file);
        }
        pruneCopies(copies);
        return true;
    }

    // ── 공개 API ──

    /** 지금 게시중인 글(DB). 사진은 사이트 폴더에 복사해 둔 사본 주소로(사본이 없으면 지금 복사) */
    public synchronized Map<String, Object> publishedData() {
        Map<String, Object> data = build(posts.findPublishedStories(), null, src -> publishImage(src, new HashSet<>()));
        data.put("source", "backoffice-api");
        return data;
    }

    /** 사이트 페이지가 &lt;script&gt;로 바로 쓰는 모양: window.STORIES_DATA = {…} */
    public String publishedScript() {
        return toJs(API_HEADER, publishedData());
    }

    /** 사이트 데이터 내용(목록 3개: reviews · interviews · projects). extra 가 있으면 그 글을 미리보기용으로 끼워 넣는다 */
    private Map<String, Object> build(List<Post> published, Post extra, UnaryOperator<String> images) {
        List<Post> list = new ArrayList<>(published);
        if (extra != null) {
            int at = -1;
            for (int i = 0; i < list.size(); i++) {
                // 글 번호는 표마다 1번부터라 종류까지 같아야 같은 글
                if (extra.getId() != null && extra.getId().equals(list.get(i).getId())
                        && java.util.Objects.equals(extra.getCategorySlug(), list.get(i).getCategorySlug())) {
                    at = i;
                }
            }
            if (at >= 0) {
                list.set(at, extra);   // 게시중인 글이면 원래 자리에서
            } else {
                list.add(0, extra);    // 새 글 · 게시 전 글은 가장 최근 글 자리에서
            }
        }
        Map<StoryKind, List<Map<String, Object>>> groups = new LinkedHashMap<>();
        for (StoryKind k : StoryKind.values()) {
            groups.put(k, new ArrayList<>());
        }
        for (Post p : list) {
            StoryKind kind = StoryKind.ofSlug(p.getCategorySlug());
            if (kind == null || p.getStoryJson() == null) {
                continue;
            }
            try {
                groups.get(kind).add(item(kind, p, images));
            } catch (RuntimeException e) {
                log.warn("게시물 {} 의 글 양식을 읽지 못해 사이트 데이터에서 뺐습니다.", p.getId(), e);
            }
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("version", 1);
        data.put("source", "backoffice");
        for (var e : groups.entrySet()) {
            data.put(e.getKey().key(), e.getValue());
        }
        return data;
    }

    /** 프로젝트 칸 중 사이트에는 합쳐서(팀 · 전공 · 기수 · 반) 보내는 칸 */
    private static final Set<String> PROJECT_PARTS = Set.of("cohort", "className", "major", "teamName", "teamSize");

    /** 게시물 하나 → 사이트 글 하나: 글 번호 · 주소(#r-p12) · 제목 + 양식 값(사진 주소는 사이트 기준으로) */
    private Map<String, Object> item(StoryKind kind, Post p, UnaryOperator<String> images) {
        Map<String, Object> story = stories.parse(p.getStoryJson());
        String key = p.getId() == null ? "new" : String.valueOf(p.getId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", p.getId() == null ? "new" : p.getId());
        out.put("anchor", kind.anchorFor(key));
        out.put("title", p.getTitle());
        if (kind == StoryKind.PROJECT) {
            StoryContent.projectMeta(story).forEach((k, v) -> {
                if (!v.isEmpty()) {
                    out.put(k, v);
                }
            });
        }
        for (var e : story.entrySet()) {
            String k = e.getKey();
            if (k.equals("anchor") || k.equals("id") || k.equals("title") || k.equals("cover")
                    || (kind == StoryKind.PROJECT && PROJECT_PARTS.contains(k))) {
                continue;
            }
            Object value = e.getValue();
            if (k.equals("img") || k.equals("imgLarge") || k.equals("heroImg")) {
                value = siteImage(value, images);
            } else if (k.equals("photos")) {
                // 사진 여러 장: 글을 열면 넘겨 보는 사진들(파일을 찾지 못한 사진은 빼고)
                List<Map<String, Object>> list = new ArrayList<>();
                if (value instanceof List<?> photos) {
                    for (Object o : photos) {
                        Map<String, Object> img = siteImage(o, images);
                        if (img != null) {
                            list.add(img);
                        }
                    }
                }
                value = list.isEmpty() ? null : list;
            }
            if (value != null) {
                out.put(k, value);
            }
        }
        return out;
    }

    /** 사진 하나의 주소를 사이트 기준으로. 사진이 아니거나 파일이 없으면 null */
    private static Map<String, Object> siteImage(Object value, UnaryOperator<String> images) {
        if (!(value instanceof Map<?, ?> m) || !(m.get("src") instanceof String src)) {
            return null;
        }
        String mapped = images.apply(src);
        if (mapped == null) {
            return null;
        }
        Map<String, Object> img = new LinkedHashMap<>();
        m.forEach((k, v) -> img.put(String.valueOf(k), v));
        img.put("src", mapped);
        return img;
    }

    /** 업로드 사진을 사이트로 복사하고 사이트 기준 주소를 돌려준다. 원본이 없으면 null(그림 없이) */
    private String publishImage(String src, Set<String> copies) {
        if (!src.startsWith("/uploads/")) {
            return src;
        }
        Path from = uploadRoot.resolve(src.substring("/uploads/".length())).normalize();
        if (!from.startsWith(uploadRoot) || !Files.isRegularFile(from)) {
            log.warn("사진 파일을 찾지 못해 사이트에서 뺐습니다: {}", src);
            return null;
        }
        String name = COPY_PREFIX + from.getFileName().toString();
        Path to = pages.siteRoot().resolve(UPLOAD_DIR).resolve(name);
        try {
            if (!Files.isRegularFile(to) || Files.size(to) != Files.size(from)) {
                Files.createDirectories(to.getParent());
                Files.copy(from, to, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            log.warn("사진을 사이트로 복사하지 못했습니다: {}", src, e);
            return null;
        }
        copies.add(name);
        return "assets/uploads/" + name;
    }

    /** 더는 쓰지 않는 복사본(post-…)을 지운다. 페이지 편집기가 올린 다른 그림은 건드리지 않는다 */
    private void pruneCopies(Set<String> keep) {
        Path dir = pages.siteRoot().resolve(UPLOAD_DIR);
        if (!Files.isDirectory(dir)) {
            return;
        }
        try (Stream<Path> files = Files.list(dir)) {
            for (Path f : files.toList()) {
                String name = f.getFileName().toString();
                if (name.startsWith(COPY_PREFIX) && !keep.contains(name) && Files.isRegularFile(f)) {
                    Files.deleteIfExists(f);
                }
            }
        } catch (IOException e) {
            log.warn("쓰지 않는 사진 복사본을 지우지 못했습니다: {}", dir, e);
        }
    }

    private String toJs(String header, Map<String, Object> data) {
        try {
            return header + "window.STORIES_DATA = " + json.writerWithDefaultPrettyPrinter().writeValueAsString(data).replace("\r\n", "\n") + ";\n";
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    // ── 사이트에 있던 글 가져오기 ──

    @EventListener(ContextRefreshedEvent.class)
    @Order(2)
    public void onReady() {
        try {
            int n = importSiteStories();
            if (n > 0) {
                log.info("선배들의 이야기 사이트에 있던 글 {}개를 게시물로 가져왔습니다.", n);
            } else {
                // 사이트 파일을 새로 받았거나(새 시안 등) 꺼져 있는 동안 바뀐 게 있어도 켤 때 게시중인 글과 맞춤(같으면 그대로)
                regenerate();
            }
        } catch (RuntimeException e) {
            log.warn("선배들의 이야기 사이트 글을 가져오지 못했습니다.", e);
        }
    }

    /**
     * DB에 글이 하나도 없을 때(새 컴퓨터 · 새 서버) 사이트 사본(stories-data.js)의 글을 모두 게시중 게시물로 만든다.
     * 순서(최신 순)는 게시 시각으로 지키고, 번호는 표마다 오래된 글부터 1번. 다 가져오면 새 번호로 사본을 다시 쓴다.
     * DB에 글이 있으면 DB가 기준이라 가져오지 않는다(사본의 번호가 DB와 달라도 글이 두 번 생기지 않게 — 2026-10-20).
     */
    public synchronized int importSiteStories() {
        if (!enabled() || !posts.isEmpty()) {
            return 0;
        }
        Map<String, Object> data = readData(pages.siteRoot().resolve(DATA_FILE));
        if (data == null) {
            return 0;
        }
        List<Map.Entry<StoryKind, List<Map<String, Object>>>> todo = items(data);
        if (todo.isEmpty()) {
            return 0;
        }
        Long authorId = admins.findAll().stream().filter(a -> a.getRole() == AdminRole.SUPER_ADMIN)
                .map(AdminUser::getId).min(Long::compare).orElse(null);
        if (authorId == null) {
            log.warn("최상위 관리자 계정이 없어 사이트 글을 가져오지 못했습니다.");
            return 0;
        }
        Integer count = tx.execute(status -> {
            int n = 0;
            LocalDateTime base = LocalDateTime.now();
            for (var entry : todo) {
                Category category = categories.findBySlug(entry.getKey().slug());
                if (category == null) {
                    continue;
                }
                List<Map<String, Object>> items = entry.getValue();
                for (int i = items.size() - 1; i >= 0; i--) {   // 오래된 글부터 넣어 번호가 1번부터 오래된 순
                    createImported(entry.getKey(), category, items.get(i), base.minusMinutes(i), authorId);
                    n++;
                }
            }
            return n;
        });
        regenerate(true);
        return count == null ? 0 : count;
    }

    private void createImported(StoryKind kind, Category category, Map<String, Object> item, LocalDateTime publishedAt, Long authorId) {
        Map<String, Object> story = new LinkedHashMap<>(item);
        story.remove("id");
        story.remove("title");
        String title = StoryContent.text(item.get("title"), 200);
        PostForm form = new PostForm();
        form.setTitle(title.isEmpty() ? "(제목 없음)" : title);
        form.setCategoryId(category.getId());
        form.setStatus(PostStatus.HIDDEN);     // 가져온 글은 칸 확인 없이 그대로 담는다
        form.setBlocksJson("[]");
        form.setStoryJson(stories.serialize(story));
        Post post = new Post();
        post.setAuthorId(authorId);
        assembler.apply(post, form);
        post.setStatus(PostStatus.PUBLISHED);
        post.setPublishedAt(publishedAt);
        posts.insert(post);
    }

    /** 사본의 글 목록(종류마다, 사본 순서 = 최신 순) */
    private static List<Map.Entry<StoryKind, List<Map<String, Object>>>> items(Map<String, Object> data) {
        List<Map.Entry<StoryKind, List<Map<String, Object>>>> out = new ArrayList<>();
        for (StoryKind kind : StoryKind.values()) {
            List<Map<String, Object>> items = new ArrayList<>();
            if (data.get(kind.key()) instanceof List<?> list) {
                for (Object o : list) {
                    if (o instanceof Map<?, ?> m) {
                        Map<String, Object> copy = new LinkedHashMap<>();
                        m.forEach((k, v) -> copy.put(String.valueOf(k), v));
                        items.add(copy);
                    }
                }
            }
            if (!items.isEmpty()) {
                out.add(Map.entry(kind, items));
            }
        }
        return out;
    }

    /** stories-data.js → 내용. 파일이 없거나 읽지 못하면 null */
    private Map<String, Object> readData(Path file) {
        if (!Files.isRegularFile(file)) {
            return null;
        }
        String js = read(file);
        int start = js.indexOf('{'), end = js.lastIndexOf('}');
        if (start < 0 || end < start) {
            return null;
        }
        try {
            return json.readValue(js.substring(start, end + 1), new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception e) {
            log.warn("사이트 데이터 파일을 읽지 못했습니다: {}", file, e);
            return null;
        }
    }

    // ── 미리보기 ──

    /** 고정 양식 글이면 사이트 화면 미리보기 주소(서버 안 주소, 앞에 컨텍스트 경로 없음). 아니면 null */
    public String previewPath(Post post, boolean saved) {
        StoryKind kind = StoryKind.ofSlug(post.getCategorySlug());
        if (kind == null || post.getStoryJson() == null || !enabled()) {
            return null;
        }
        Map<String, Object> data = build(posts.findPublishedStories(), post, src -> src);
        Map<String, Object> mine = null;
        if (data.get(kind.key()) instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof Map<?, ?> m && String.valueOf(m.get("id")).equals(post.getId() == null ? "new" : String.valueOf(post.getId()))) {
                    mine = new LinkedHashMap<>();
                    for (var e : m.entrySet()) {
                        mine.put(String.valueOf(e.getKey()), e.getValue());
                    }
                }
            }
        }
        String hash = mine == null ? "#" + kind.key() : "#" + mine.get("anchor");
        String note = saved && post.getStatus() == PostStatus.PUBLISHED
                ? "미리보기 · 지금 사이트에 게시중인 내용이에요"
                : "미리보기 · 아직 사이트에 올라가지 않았어요. 발행하면 이렇게 보여요";
        long now = System.currentTimeMillis();
        previews.values().removeIf(p -> now - p.createdAt() > PREVIEW_TTL_MS);
        if (previews.size() >= PREVIEW_MAX) {
            previews.entrySet().stream().min(Comparator.comparingLong(e -> e.getValue().createdAt()))
                    .ifPresent(e -> previews.remove(e.getKey()));
        }
        String token = UUID.randomUUID().toString().replace("-", "");
        previews.put(token, new Preview(toJs(HEADER, data), hash, note, now));
        // 그 종류의 페이지가 있으면 그 페이지로(예전 한 페이지 사이트면 한 페이지로)
        String target = Files.isRegularFile(pages.siteRoot().resolve(KIND_PAGES.get(kind))) ? KIND_PAGES.get(kind) : STORIES_PAGE;
        return "/admin/posts/story-preview/" + token + "/" + target + hash;
    }

    /** 미리보기 화면의 파일: 데이터(사본 · 공개 API)는 미리보기 내용으로, 선배들의 이야기 페이지에는 안내 띠를 붙이고, 나머지는 사이트 파일 그대로 */
    public ResponseEntity<byte[]> previewFile(String token, String relative) {
        Preview preview = token == null ? null : previews.get(token);
        if (preview == null || System.currentTimeMillis() - preview.createdAt() > PREVIEW_TTL_MS) {
            String msg = "<!doctype html><meta charset=\"utf-8\"><title>미리보기</title><p style=\"font:16px/1.6 sans-serif;padding:40px\">"
                    + "미리보기 시간이 지났어요. 글쓰기 화면에서 <b>미리보기</b>를 다시 눌러 주세요.</p>";
            return ResponseEntity.status(HttpStatus.NOT_FOUND).contentType(MediaType.parseMediaType("text/html;charset=UTF-8")).body(msg.getBytes(UTF_8));
        }
        String path = relative == null ? "" : relative.replace('\\', '/').replaceAll("^/+", "");
        if (path.isEmpty() || path.equals("stories") || path.equals("stories/")) {
            path = STORIES_PAGE;
        }
        // 사본 · 공개 API 둘 다 '이 글을 넣은 내용'으로(페이지는 사본 다음에 API를 불러 덮어씀)
        if (path.equals(DATA_FILE) || path.equals(API_SCRIPT)) {
            return file(preview.js().getBytes(UTF_8), "js");
        }
        Optional<Path> file = pages.siteFile(path);
        if (file.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        Path f = file.get();
        String name = f.getFileName().toString();
        String ext = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : "";
        try {
            byte[] bytes = Files.readAllBytes(f);
            // 이야기 페이지(한눈에 보기 · 후기 · 인터뷰 · 프로젝트 · 기수별 모아보기)에는 미리보기 안내 띠
            if (f.getParent().equals(pages.siteRoot().resolve(STORIES_PAGE).normalize().getParent()) && "html".equals(ext)) {
                bytes = withBanner(new String(bytes, UTF_8), preview.note()).getBytes(UTF_8);
            }
            return file(bytes, ext);
        } catch (IOException e) {
            log.warn("미리보기 파일을 읽지 못했습니다: {}", f, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    private static ResponseEntity<byte[]> file(byte[] bytes, String ext) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .contentType(MediaType.parseMediaType(TYPES.getOrDefault(ext, "application/octet-stream"))).body(bytes);
    }

    private static String withBanner(String html, String note) {
        String banner = "<div data-story-preview role=\"status\" style=\"position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;"
                + "max-width:calc(100% - 32px);box-sizing:border-box;background:#10203D;color:#fff;padding:10px 18px;border-radius:999px;"
                + "font:600 14px/1.45 Pretendard,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);text-align:center;pointer-events:none\">"
                + org.springframework.web.util.HtmlUtils.htmlEscape(note) + "</div>";
        var m = java.util.regex.Pattern.compile("<body[^>]*>", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(html);
        return m.find() ? html.substring(0, m.end()) + banner + html.substring(m.end()) : banner + html;
    }

    // ── 파일 ──

    private static String read(Path file) {
        try {
            return Files.readString(file, UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("파일을 읽지 못했습니다: " + file, e);
        }
    }

    /** 같은 폴더의 임시 파일에 쓴 뒤 이름을 바꿔, 사이트가 반쯤 쓴 파일을 읽는 일이 없게 한다. 다른 프로그램이 잠깐 잡고 있으면 다시 시도 */
    private static void writeAtomic(Path target, byte[] bytes) {
        try {
            Files.createDirectories(target.getParent());
            Path temp = target.resolveSibling(target.getFileName() + "." + ProcessHandle.current().pid() + "." + System.nanoTime() + ".tmp");
            Files.write(temp, bytes);
            for (int attempt = 1; ; attempt++) {
                try {
                    try {
                        Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
                    } catch (AtomicMoveNotSupportedException e) {
                        Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
                    }
                    return;
                } catch (FileSystemException e) {
                    if (e instanceof NoSuchFileException) {
                        Files.deleteIfExists(temp);
                        throw e;
                    }
                    if (attempt >= 6) {
                        overwriteInPlace(target, bytes, temp, e);
                        return;
                    }
                    try {
                        Thread.sleep(attempt * 100L);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                }
            }
        } catch (IOException e) {
            throw new IllegalStateException("사이트 데이터 파일을 쓰지 못했습니다: " + target, e);
        }
    }

    /** 이름 바꾸기가 끝내 막히면(다른 프로그램이 파일을 열어 둔 채 놓지 않을 때) 그 자리에 덮어쓴다. 그것도 안 되면 처음 오류를 그대로 */
    private static void overwriteInPlace(Path target, byte[] bytes, Path temp, FileSystemException cause) throws IOException {
        try {
            Files.write(target, bytes);
        } catch (IOException e) {
            cause.addSuppressed(e);
            Files.deleteIfExists(temp);
            throw cause;
        }
        Files.deleteIfExists(temp);
        log.warn("{} 파일을 다른 프로그램이 잡고 있어 그 자리에 덮어썼습니다({}).", target.getFileName(), cause.getClass().getSimpleName());
    }
}
