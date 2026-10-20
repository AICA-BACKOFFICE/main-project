package egovframework.backoffice.page;

import static java.nio.charset.StandardCharsets.UTF_8;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import egovframework.backoffice.common.BusinessException;
import egovframework.backoffice.common.NotFoundException;
import egovframework.backoffice.config.BackofficeProperties;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.file.AccessDeniedException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.FileSystemException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.attribute.FileTime;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.stereotype.Service;

/**
 * 카테고리 페이지(공유용 사이트의 정적 페이지) 파일 관리.
 * <ul>
 *   <li>편집 중인 내용은 임시저장 폴더(backoffice.pages.data-dir)에 두고, '사이트에 반영'하면 반영 전 파일을 백업한 뒤 사이트 파일을 덮어쓴다.</li>
 *   <li>편집 화면(iframe)에는 실제 페이지에 편집기 스크립트(static/js/page/canvas.js)를 붙여 보낸다.</li>
 *   <li>편집기가 원본 표기·줄바꿈을 그대로 지켜 보내므로, 서버는 받은 글을 손대지 않고 그대로 쓴다(고친 곳만 파일에서 바뀜).</li>
 * </ul>
 */
@Service
public class CategoryPageService {

    private static final Logger log = LoggerFactory.getLogger(CategoryPageService.class);

    static final int MAX_HTML = 6 * 1024 * 1024;
    static final int MAX_UPLOAD = 30 * 1024 * 1024;
    private static final int BACKUP_LIMIT = 100;
    private static final Pattern ID = Pattern.compile("[a-z0-9_-]+", Pattern.CASE_INSENSITIVE);
    private static final Set<String> RESERVED_IDS = Set.of("site", "api");
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss");
    private static final Set<String> IMAGE_EXTENSIONS = Set.of("png", "jpg", "jpeg", "webp", "gif", "avif", "svg");
    private static final Set<String> SKIP_DIRS = Set.of("node_modules", "fonts");
    private static final Pattern DOCTYPE = Pattern.compile("^\\uFEFF?<!doctype[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern LOOKS_LIKE_PAGE_START = Pattern.compile("^\\uFEFF?\\s*<!doctype html", Pattern.CASE_INSENSITIVE);
    private static final Pattern LOOKS_LIKE_PAGE_END = Pattern.compile("</html>\\s*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern BODY_TAG = Pattern.compile("<body[\\s>]", Pattern.CASE_INSENSITIVE);
    private static final Pattern SVG_DANGER = Pattern.compile("<script|javascript:|\\son[a-z]+\\s*=", Pattern.CASE_INSENSITIVE);

    /** 임시저장 정보: 편집을 시작할 때의 사이트 파일(해시)과 마지막 저장 시각 */
    record DraftMeta(String baseHash, String savedAt) { }

    private final BackofficeProperties.Pages config;
    private final ObjectMapper json;
    private final Path siteRoot;
    private final Path dataRoot;
    private final Path backupRoot;
    private final List<CategoryPage> pages;
    private final Map<String, Object> locks = new ConcurrentHashMap<>();

    public CategoryPageService(BackofficeProperties properties, ObjectMapper json) {
        this.config = properties.getPages();
        this.json = json;
        this.siteRoot = Paths.get(config.getSiteRoot()).toAbsolutePath().normalize();
        this.dataRoot = Paths.get(config.getDataDir()).toAbsolutePath().normalize();
        this.backupRoot = dataRoot.resolve("backups");
        List<CategoryPage> list = new ArrayList<>();
        for (BackofficeProperties.Item item : config.getItems()) {
            String id = item.getId() == null ? "" : item.getId().trim();
            if (!ID.matcher(id).matches() || RESERVED_IDS.contains(id)) {
                throw new IllegalStateException("카테고리 페이지 id 는 영문·숫자·-·_ 로 쓰고 site·api 는 쓸 수 없습니다: " + item.getId());
            }
            String file = item.getFile() == null ? "" : item.getFile().replace('\\', '/').replaceAll("^/+", "");
            Path path = siteRoot.resolve(file).normalize();
            if (file.isEmpty() || !path.startsWith(siteRoot) || path.equals(siteRoot)) {
                throw new IllegalStateException("카테고리 페이지 파일이 사이트 폴더 밖에 있습니다: " + item.getFile());
            }
            String title = item.getTitle() == null || item.getTitle().isBlank() ? id : item.getTitle();
            list.add(new CategoryPage(id, title, file, path));
        }
        this.pages = List.copyOf(list);
    }

    // ── 페이지 ──

    public List<CategoryPage> pages() {
        return pages;
    }

    public Path siteRoot() {
        return siteRoot;
    }

    public CategoryPage page(String id) {
        return pages.stream().filter(page -> page.id().equals(id)).findFirst()
                .orElseThrow(() -> new NotFoundException("알 수 없는 페이지예요: " + id));
    }

    /** 사이트 폴더 기준 경로(about/index.html, about/, about)가 가리키는 카테고리 페이지 */
    public Optional<CategoryPage> pageForFile(String relative) {
        String clean = relative == null ? "" : relative.replace('\\', '/').replaceAll("^/+", "");
        String trimmed = clean.replaceAll("/+$", "");
        return pages.stream()
                .filter(page -> page.file().equals(clean) || page.file().equals(trimmed + "/index.html"))
                .findFirst();
    }

    public boolean exists(CategoryPage page) {
        return Files.isRegularFile(page.path());
    }

    public boolean hasDraft(CategoryPage page) {
        return Files.isRegularFile(draftHtml(page));
    }

    /**
     * 아직 반영하지 않은 임시저장본이 사이트 파일과 어디가 다른지(사람이 읽을 말로, 앞의 몇 곳만)와 임시저장한 때. 임시저장이 없으면 null.
     * FAQ 관리 · 인사교 라이프 게시물 관리가 '임시저장이 있어 저장할 수 없어요' 안내에 함께 보여 준다.
     */
    public Map<String, Object> draftSummary(CategoryPage page) {
        if (!hasDraft(page)) {
            return null;
        }
        DraftMeta meta = readMeta(page);
        List<Map<String, String>> all = DraftChanges.between(published(page), read(draftHtml(page)));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("savedAt", meta == null ? null : meta.savedAt());
        out.put("changes", all.size() > DraftChanges.MAX ? new ArrayList<>(all.subList(0, DraftChanges.MAX)) : all);
        out.put("more", Math.max(0, all.size() - DraftChanges.MAX));
        return out;
    }

    /** 사이트에 반영되어 있는 파일 */
    public String published(CategoryPage page) {
        if (!exists(page)) {
            throw new BusinessException("사이트 파일을 찾지 못했어요: " + page.file()
                    + " (사이트 폴더: " + siteRoot + " — application.yml 의 backoffice.pages.site-root 또는 환경변수 BACKOFFICE_SITE_ROOT 를 확인해 주세요)");
        }
        return read(page.path());
    }

    /** 편집 화면에 보여 줄 글: 임시저장본이 있으면 그것, 없으면 사이트 파일 */
    public String working(CategoryPage page) {
        Path draft = draftHtml(page);
        return Files.isRegularFile(draft) ? read(draft) : published(page);
    }

    public Map<String, Object> state(CategoryPage page) {
        String published = published(page);
        boolean hasDraft = hasDraft(page);
        DraftMeta meta = hasDraft ? readMeta(page) : null;
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("page", page.id());
        state.put("hasDraft", hasDraft);
        state.put("draftSavedAt", meta == null ? null : meta.savedAt());
        // 임시저장한 뒤에 사이트 파일이 다른 곳에서 바뀌었으면 알려 준다(반영하면 그 변경을 덮어쓰게 되므로)
        state.put("conflict", hasDraft && meta != null && !Objects.equals(meta.baseHash(), sha1(published)));
        // 편집기가 연 사이트 파일의 지문: 임시저장 · 반영할 때 '그사이 다른 곳(FAQ 관리 등)에서 바뀌었는지' 보는 기준
        state.put("publishedHash", sha1(published));
        state.put("publishedAt", lastModified(page.path()));
        return state;
    }

    // ── 임시저장 · 반영 ──

    public Map<String, Object> saveDraft(CategoryPage page, String html) {
        return saveDraft(page, html, null);
    }

    /** base: 편집기가 처음 연 사이트 파일의 지문. 첫 임시저장 전에 다른 곳에서 사이트 파일이 바뀌었으면 그 차이가 '바뀜'으로 남는다 */
    public Map<String, Object> saveDraft(CategoryPage page, String html, String base) {
        requirePage(html);
        synchronized (lock(page)) {
            String published = published(page);
            if (html.equals(published)) {
                removeDraft(page);
            } else {
                DraftMeta previous = hasDraft(page) ? readMeta(page) : null;
                String baseHash = previous != null && previous.baseHash() != null ? previous.baseHash()
                        : base != null && HASH.matcher(base).matches() ? base : sha1(published);
                writeAtomic(draftHtml(page), html.getBytes(UTF_8));
                writeAtomic(draftMeta(page), toJsonBytes(new DraftMeta(baseHash, Instant.now().toString())));
            }
            return state(page);
        }
    }

    public Map<String, Object> discardDraft(CategoryPage page) {
        synchronized (lock(page)) {
            removeDraft(page);
            return state(page);
        }
    }

    /**
     * 편집기의 '사이트에 반영': 편집기가 연 뒤 사이트 파일이 다른 곳(FAQ 관리 · 인사교 라이프 게시물 관리 등)에서 바뀌었으면
     * 그 변경을 몰래 덮어쓰지 않게 멈춘다(force 면 알고 덮어씀). 기준은 임시저장본의 기준, 없으면 편집기가 보낸 base.
     */
    public Map<String, Object> publishEdited(CategoryPage page, String html, String base, boolean force) {
        requirePage(html);
        synchronized (lock(page)) {
            String published = published(page);
            if (!force && !html.equals(published)) {
                DraftMeta meta = hasDraft(page) ? readMeta(page) : null;
                String from = meta != null && meta.baseHash() != null ? meta.baseHash() : base;
                if (from != null && HASH.matcher(from).matches() && !from.equals(sha1(published))) {
                    throw new PageConflictException("편집을 시작한 뒤에 사이트 파일이 다른 곳(FAQ 관리 · 인사교 라이프 게시물 관리 등)에서 바뀌었어요.");
                }
            }
            return publish(page, html);
        }
    }

    /** 사이트에 반영: 지금 사이트 파일을 백업하고 받은 글로 덮어쓴 뒤 임시저장본을 지운다. */
    public Map<String, Object> publish(CategoryPage page, String html) {
        requirePage(html);
        synchronized (lock(page)) {
            String backup = backupPublished(page);
            writeAtomic(page.path(), html.getBytes(UTF_8));
            removeDraft(page);
            log.info("카테고리 페이지를 사이트에 반영했습니다: {} ({}){}", page.title(), page.file(), backup == null ? "" : " · 이전 파일 백업: " + backup);
            Map<String, Object> state = state(page);
            state.put("backup", backup);
            return state;
        }
    }

    // ── 버전 기록(반영 전 백업) ──

    public List<Map<String, Object>> backups(CategoryPage page) {
        if (!Files.isDirectory(backupRoot)) {
            return List.of();
        }
        Pattern pattern = backupPattern(page);
        try (Stream<Path> files = Files.list(backupRoot)) {
            return files.filter(file -> pattern.matcher(file.getFileName().toString()).matches())
                    .map(file -> {
                        Map<String, Object> item = new LinkedHashMap<>();
                        item.put("name", file.getFileName().toString());
                        item.put("size", size(file));
                        item.put("savedAt", lastModified(file));
                        return item;
                    })
                    .sorted(Comparator.comparing((Map<String, Object> item) -> (String) item.get("savedAt"))
                            .thenComparing(item -> (String) item.get("name")).reversed())
                    .toList();
        } catch (IOException e) {
            throw storageError("버전 기록을 읽지 못했어요.", e);
        }
    }

    public String backup(CategoryPage page, String name) {
        if (name == null || !backupPattern(page).matcher(name).matches()) {
            throw new BusinessException("잘못된 백업 이름이에요.");
        }
        Path file = backupRoot.resolve(name);
        if (!Files.isRegularFile(file)) {
            throw new NotFoundException("백업을 찾을 수 없어요.");
        }
        return read(file);
    }

    // ── 그림 ──

    /** 사이트 안의 그림을 모아, 편집 중인 페이지에서 바로 쓸 수 있는 상대 경로로 돌려준다(새로 올린 것 → 이 페이지 것 → 나머지). */
    public List<Map<String, Object>> assets(CategoryPage page) {
        Path uploads = page.dir().resolve("assets").resolve("uploads");
        List<Map<String, Object>> found = new ArrayList<>();
        if (!Files.isDirectory(siteRoot)) {
            return found;
        }
        try {
            Files.walkFileTree(siteRoot, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                    if (dir.equals(siteRoot)) {
                        return FileVisitResult.CONTINUE;
                    }
                    String name = dir.getFileName().toString();
                    return name.startsWith(".") || SKIP_DIRS.contains(name) ? FileVisitResult.SKIP_SUBTREE : FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    if (IMAGE_EXTENSIONS.contains(extension(file.getFileName().toString()))) {
                        Map<String, Object> item = new LinkedHashMap<>();
                        item.put("path", page.dir().relativize(file).toString().replace('\\', '/'));
                        item.put("size", attrs.size());
                        item.put("modifiedAt", attrs.lastModifiedTime().toInstant().toString());
                        item.put("upload", file.startsWith(uploads));
                        item.put("own", file.startsWith(page.dir()));
                        found.add(item);
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFileFailed(Path file, IOException exc) {
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException e) {
            throw storageError("사이트의 그림 목록을 읽지 못했어요.", e);
        }
        found.sort((a, b) -> {
            boolean ua = (Boolean) a.get("upload");
            boolean ub = (Boolean) b.get("upload");
            if (ua != ub) {
                return ua ? -1 : 1;
            }
            if (ua) {
                return ((String) b.get("modifiedAt")).compareTo((String) a.get("modifiedAt"));
            }
            boolean oa = (Boolean) a.get("own");
            boolean ob = (Boolean) b.get("own");
            if (oa != ob) {
                return oa ? -1 : 1;
            }
            return ((String) a.get("path")).compareTo((String) b.get("path"));
        });
        return found;
    }

    /**
     * 미디어 관리의 그림을 이 페이지에서 쓰도록 페이지 폴더의 assets/uploads 에 복사한다(사이트는 사이트 폴더 안의 파일만 쓰므로).
     * 같은 그림을 이미 가져왔으면 그 파일을 그대로 쓴다.
     */
    public String importImage(CategoryPage page, String name, byte[] data) {
        Path dir = page.dir().resolve("assets").resolve("uploads");
        if (data != null && Files.isDirectory(dir)) {
            try (var files = Files.list(dir)) {
                for (Path file : files.filter(Files::isRegularFile).toList()) {
                    if (Files.size(file) == data.length && java.util.Arrays.equals(Files.readAllBytes(file), data)) {
                        return "assets/uploads/" + file.getFileName();
                    }
                }
            } catch (IOException e) {
                throw storageError("그림을 가져오지 못했어요.", e);
            }
        }
        return upload(page, name, data);
    }

    /** 올린 그림은 편집 중인 페이지 폴더의 assets/uploads 에 둔다(페이지에서 assets/uploads/… 로 바로 씀). */
    public String upload(CategoryPage page, String originalName, byte[] data) {
        String name = safeUploadName(originalName);
        if (name == null) {
            throw new BusinessException("PNG, JPG, WEBP, GIF, AVIF, SVG 이미지만 올릴 수 있어요.");
        }
        if (data == null || data.length == 0) {
            throw new BusinessException("빈 파일이에요.");
        }
        if (data.length > MAX_UPLOAD) {
            throw new BusinessException("30MB보다 작은 이미지를 올려 주세요.");
        }
        if (!matchesImage(extension(name), data)) {
            throw new BusinessException("파일 내용이 이미지 형식과 맞지 않아 올리지 않았어요.");
        }
        Path dir = page.dir().resolve("assets").resolve("uploads");
        try {
            Files.createDirectories(dir);
            Path target = dir.resolve(name);
            for (int i = 2; Files.exists(target); i++) {
                target = dir.resolve(name.replaceFirst("(\\.[a-z0-9]+)$", "-" + i + "$1"));
            }
            Files.write(target, data, StandardOpenOption.CREATE_NEW);
            return "assets/uploads/" + target.getFileName();
        } catch (IOException e) {
            throw storageError("그림을 저장하지 못했어요.", e);
        }
    }

    /**
     * 게시물 데이터 사본(life/js/life-data.js 등 — 백오피스가 꺼져 있을 때 사이트가 쓰는 파일)을 쓴다. 내용이 같으면 쓰지 않는다.
     * 그 페이지 폴더가 사이트에 없으면(테스트 · 사이트 없이 켠 경우) 건너뛴다. 썼거나 이미 같으면 true
     */
    public boolean writeSiteData(String relative, String content) {
        Path target = siteRoot.resolve(relative).normalize();
        Path pageDir = siteRoot.resolve(relative.split("/")[0]).normalize();
        if (!target.startsWith(siteRoot) || !Files.isDirectory(pageDir)) {
            return false;
        }
        byte[] bytes = content.getBytes(UTF_8);
        try {
            if (Files.isRegularFile(target) && java.util.Arrays.equals(Files.readAllBytes(target), bytes)) {
                return true;
            }
        } catch (IOException e) {
            log.debug("사이트 데이터 사본을 읽지 못해 다시 씁니다: {}", target, e);
        }
        writeAtomic(target, bytes);
        log.info("사이트 데이터 사본을 다시 썼습니다: {}", target);
        return true;
    }

    /**
     * 게시물 데이터 사본(window.X = {…};)의 {…} 부분. DB가 비어 있는 새 컴퓨터에서 처음 켤 때 사본의 내용을 DB로 옮기는 데 쓴다.
     * 사본이 없거나 읽지 못하면 비어 있음
     */
    public Optional<String> siteDataJson(String relative) {
        Path target = siteRoot.resolve(relative).normalize();
        if (!target.startsWith(siteRoot) || !Files.isRegularFile(target)) {
            return Optional.empty();
        }
        try {
            String js = Files.readString(target, UTF_8);
            int eq = js.indexOf("= {");
            int end = js.lastIndexOf('}');
            return eq < 0 || end < eq ? Optional.empty() : Optional.of(js.substring(eq + 2, end + 1));
        } catch (IOException e) {
            log.warn("사이트 데이터 사본을 읽지 못했습니다: {}", target, e);
            return Optional.empty();
        }
    }

    // ── 편집 화면 ──

    /** 사이트 폴더 안의 파일(편집 화면이 읽는 CSS·JS·그림 등). 사이트 폴더 밖이나 숨김 파일(.git 등)은 열지 않는다. */
    public Optional<Path> siteFile(String relative) {
        if (relative == null) {
            return Optional.empty();
        }
        String clean = relative.replace('\\', '/');
        if (clean.contains(":") || clean.contains("\0")) {
            return Optional.empty();
        }
        for (String segment : clean.split("/")) {
            if (segment.startsWith(".")) {
                return Optional.empty();
            }
        }
        Path target = siteRoot.resolve(clean.replaceAll("^/+", "")).normalize();
        if (!target.startsWith(siteRoot)) {
            return Optional.empty();
        }
        if (Files.isDirectory(target)) {
            target = target.resolve("index.html");
        }
        return Files.isRegularFile(target) ? Optional.of(target) : Optional.empty();
    }

    /** 편집 모드: 원본 HTML 끝에 편집기 스크립트를 붙인다. 공백을 더하지 않아 원래 구조가 그대로 남는다. */
    public String withEditor(CategoryPage page, String html, String contextPath) {
        String style = "<link rel=\"stylesheet\" href=\"" + contextPath + "/css/page/canvas.css\" data-bo-internal>";
        Map<String, Object> settings = new LinkedHashMap<>();
        settings.put("id", page.id());
        // 브라우저는 읽을 때 줄바꿈을 모두 LF로 바꾸므로, 원본의 줄바꿈(윈도우 CRLF 등)·첫 줄(<!doctype …>)·원본 글을 알려 주어 저장할 때 그대로 되살린다.
        settings.put("eol", lineEnding(html));
        Matcher doctype = DOCTYPE.matcher(html);
        settings.put("doctype", doctype.find() ? doctype.group() : null);
        settings.put("source", html);
        settings.put("locked", config.getLocked());
        settings.put("inert", config.getInert());
        settings.put("inertNotice", config.getInertNotice());
        settings.put("inertNotices", config.getInertNotices());
        settings.put("pageLevel", List.of());
        settings.put("controlText", List.of());
        settings.put("fonts", config.getFonts());
        settings.put("palette", config.getPalette());
        String script = "<script data-bo-internal>window.__BO_PAGE__=" + scriptJson(settings) + ";</script>"
                + "<script src=\"" + contextPath + "/js/page/canvas.js\" data-bo-internal></script>";
        int headEnd = indexOfIgnoreCase(html, "</head>", false);
        String result = headEnd >= 0 ? html.substring(0, headEnd) + style + html.substring(headEnd) : style + html;
        int bodyEnd = indexOfIgnoreCase(result, "</body>", true);
        return bodyEnd >= 0 ? result.substring(0, bodyEnd) + script + result.substring(bodyEnd) : result + script;
    }

    /** 편집 화면(templates/page/editor.html)의 설정 JSON — static/js/page/editor.js 가 읽는다. */
    public String editorConfig(CategoryPage current, String contextPath, CsrfToken csrf) {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("name", "카테고리 페이지 관리");
        config.put("apiBase", contextPath + "/admin/pages/api/");
        String frontUrl = this.config.getFrontUrl();
        config.put("frontUrl", frontUrl == null || frontUrl.isBlank() ? contextPath + "/admin/pages/site/" : frontUrl.trim());
        config.put("frontMode", "static");
        config.put("initialPage", current.id());
        config.put("pageUrl", contextPath + "/admin/pages/{id}/edit");
        // 이미지 바꾸기 창에서 미디어 관리의 그림도 고를 수 있게(올린 그림은 미디어 관리에도 함께 남아요)
        config.put("media", Map.of("label", "미디어 관리", "url", contextPath + "/admin/media"));
        if (csrf != null) {
            config.put("csrf", Map.of("header", csrf.getHeaderName(), "token", csrf.getToken()));
        }
        // 하위 페이지(선배들의 이야기 › 후기 등)는 parent 로 묶어, 편집기 목록에는 위 페이지 하나만 보여요(페이지 안 옆 메뉴로 오감)
        Map<String, String> parents = new LinkedHashMap<>();
        for (BackofficeProperties.Item item : this.config.getItems()) {
            if (item.getParent() != null && !item.getParent().isBlank()) {
                parents.put(item.getId(), item.getParent());
            }
        }
        List<Map<String, Object>> list = new ArrayList<>();
        for (CategoryPage page : pages) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", page.id());
            item.put("title", page.title());
            item.put("file", page.file());
            item.put("url", siteUrl(contextPath, page.file()));
            item.put("path", page.file());
            if (parents.containsKey(page.id())) {
                item.put("parent", parents.get(page.id()));
            }
            list.add(item);
        }
        config.put("pages", list);
        config.put("deployNote", this.config.getDeployNote());
        config.put("fonts", this.config.getFonts());
        config.put("palette", this.config.getPalette());
        config.put("messages", Map.of(
                "offline", "관리자 서버에 연결할 수 없어요. 서버가 켜져 있는지 확인해 주세요. 편집 내용은 이 화면에 보관 중이며, 다시 연결되면 자동으로 저장돼요.",
                "login", "로그인이 끝났어요. 새 탭에서 관리자 페이지에 다시 로그인하면 이 화면의 편집 내용이 자동으로 저장돼요."));
        return scriptJson(config);
    }

    public String siteUrl(String contextPath, String file) {
        StringBuilder url = new StringBuilder(contextPath).append("/admin/pages/site/");
        String[] segments = file.split("/");
        for (int i = 0; i < segments.length; i++) {
            if (i > 0) {
                url.append('/');
            }
            url.append(URLEncoder.encode(segments[i], UTF_8).replace("+", "%20"));
        }
        return url.toString();
    }

    // ── 내부 ──

    private Path draftHtml(CategoryPage page) {
        return dataRoot.resolve("draft-" + page.id() + ".html");
    }

    private Path draftMeta(CategoryPage page) {
        return dataRoot.resolve("draft-" + page.id() + ".json");
    }

    private DraftMeta readMeta(CategoryPage page) {
        try {
            return json.readValue(Files.readAllBytes(draftMeta(page)), DraftMeta.class);
        } catch (IOException e) {
            return null;
        }
    }

    private void removeDraft(CategoryPage page) {
        try {
            Files.deleteIfExists(draftHtml(page));
            Files.deleteIfExists(draftMeta(page));
        } catch (IOException e) {
            throw storageError("임시저장본을 지우지 못했어요.", e);
        }
    }

    private String backupPublished(CategoryPage page) {
        if (!exists(page)) {
            return null;
        }
        try {
            Files.createDirectories(backupRoot);
            String stamp = LocalDateTime.now().format(STAMP);
            String name = page.id() + "-" + stamp + ".html";
            for (int i = 2; Files.exists(backupRoot.resolve(name)); i++) {
                name = page.id() + "-" + stamp + "-" + i + ".html";
            }
            Path target = backupRoot.resolve(name);
            Files.copy(page.path(), target);
            // 복사본은 원본의 수정 시각을 이어받으므로, 목록에 백업한 시각이 보이게 맞춘다.
            Files.setLastModifiedTime(target, FileTime.from(Instant.now()));
            List<Map<String, Object>> all = backups(page);
            for (Map<String, Object> old : all.subList(Math.min(BACKUP_LIMIT, all.size()), all.size())) {
                Files.deleteIfExists(backupRoot.resolve((String) old.get("name")));
            }
            return name;
        } catch (IOException e) {
            throw storageError("반영 전 파일을 백업하지 못해 반영을 멈췄어요.", e);
        }
    }

    private Pattern backupPattern(CategoryPage page) {
        return Pattern.compile(Pattern.quote(page.id()) + "-\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}(?:-\\d+)?\\.html");
    }

    private Object lock(CategoryPage page) {
        return locks.computeIfAbsent(page.id(), key -> new Object());
    }

    private static void requirePage(String html) {
        if (html == null || html.length() > MAX_HTML || !LOOKS_LIKE_PAGE_START.matcher(html).find()
                || !LOOKS_LIKE_PAGE_END.matcher(html).find() || !BODY_TAG.matcher(html).find()) {
            throw new BusinessException("페이지 형식이 올바르지 않아요.");
        }
    }

    /** 쓰기 직전 같은 폴더의 임시 파일을 만든 뒤 이름을 바꿔 중간 상태가 남지 않게 한다. 윈도우에서 다른 프로그램이 잠깐 잡고 있으면 몇 번 다시 시도한다. */
    private void writeAtomic(Path target, byte[] bytes) {
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
                    sleep(attempt * 100L);
                }
            }
        } catch (IOException e) {
            throw storageError("파일을 저장하지 못했어요.", e);
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

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private PageStorageException storageError(String message, IOException e) {
        String file = e instanceof FileSystemException fse && fse.getFile() != null ? " (" + Paths.get(fse.getFile()).getFileName() + ")" : "";
        String detail = e instanceof AccessDeniedException || (e instanceof FileSystemException && !(e instanceof NoSuchFileException))
                ? " 다른 프로그램(편집기·동기화·백신 등)이 파일을 사용 중일 수 있어요. 잠시 뒤 다시 시도해 주세요."
                : "";
        log.warn("카테고리 페이지 파일 처리 실패: {}", message, e);
        return new PageStorageException(message + file + detail, e);
    }

    private static String read(Path file) {
        try {
            return new String(Files.readAllBytes(file), UTF_8);
        } catch (IOException e) {
            throw new PageStorageException("파일을 읽지 못했어요: " + file.getFileName(), e);
        }
    }

    private static long size(Path file) {
        try {
            return Files.size(file);
        } catch (IOException e) {
            return 0;
        }
    }

    private static String lastModified(Path file) {
        try {
            return Files.getLastModifiedTime(file).toInstant().toString();
        } catch (IOException e) {
            return null;
        }
    }

    private byte[] toJsonBytes(Object value) {
        try {
            return json.writeValueAsBytes(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    /** HTML 안 <script>에 JSON을 넣을 때 </script> 로 끊기지 않게 < 를 바꿔 쓴다. */
    private String scriptJson(Object value) {
        try {
            return json.writeValueAsString(value).replace("<", "\\u003c");
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static final Pattern HASH = Pattern.compile("[0-9a-f]{40}");

    static String sha1(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-1").digest(text.getBytes(UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    static String lineEnding(String html) {
        int crlf = 0;
        int lf = 0;
        for (int i = 0; i < html.length(); i++) {
            if (html.charAt(i) == '\n') {
                lf++;
                if (i > 0 && html.charAt(i - 1) == '\r') {
                    crlf++;
                }
            }
        }
        return crlf > 0 && crlf >= lf / 2.0 ? "\r\n" : "\n";
    }

    /** 대소문자를 가리지 않고 찾는다(last=true 면 마지막 위치). 글 전체를 소문자로 바꾸면 위치가 어긋날 수 있어 직접 비교한다. */
    static int indexOfIgnoreCase(String text, String needle, boolean last) {
        if (last) {
            for (int i = text.length() - needle.length(); i >= 0; i--) {
                if (text.regionMatches(true, i, needle, 0, needle.length())) {
                    return i;
                }
            }
        } else {
            for (int i = 0; i + needle.length() <= text.length(); i++) {
                if (text.regionMatches(true, i, needle, 0, needle.length())) {
                    return i;
                }
            }
        }
        return -1;
    }

    static String extension(String name) {
        int dot = name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    static String safeUploadName(String original) {
        if (original == null) {
            return null;
        }
        String base = original.replace('\\', '/').replaceAll(".*/", "");
        String ext = extension(base);
        if (!IMAGE_EXTENSIONS.contains(ext)) {
            return null;
        }
        String stem = base.substring(0, base.length() - ext.length() - 1);
        stem = Normalizer.normalize(stem, Normalizer.Form.NFKD).replaceAll("[^a-zA-Z0-9_-]+", "-").replaceAll("^-+|-+$", "");
        if (stem.length() > 40) {
            stem = stem.substring(0, 40);
        }
        stem = stem.toLowerCase(Locale.ROOT);
        if (stem.isEmpty()) {
            stem = "image";
        }
        String stamp = LocalDateTime.now().format(STAMP).replace('_', '-');
        return stamp + "-" + stem + "." + ("jpeg".equals(ext) ? "jpg" : ext);
    }

    /** 파일 앞부분(시그니처)으로 실제 그림인지 확인한다. SVG 는 스크립트·이벤트 속성이 없는 것만 받는다. */
    static boolean matchesImage(String ext, byte[] data) {
        return switch (ext) {
            case "png" -> startsWith(data, 0x89, 0x50, 0x4E, 0x47);
            case "jpg", "jpeg" -> startsWith(data, 0xFF, 0xD8, 0xFF);
            case "gif" -> startsWith(data, 'G', 'I', 'F', '8');
            case "webp" -> data.length > 12 && startsWith(data, 'R', 'I', 'F', 'F') && new String(data, 8, 4, UTF_8).equals("WEBP");
            case "avif" -> data.length > 12 && new String(data, 4, 8, UTF_8).matches("ftypavi[fs]");
            case "svg" -> {
                String text = new String(data, UTF_8);
                yield text.contains("<svg") && !SVG_DANGER.matcher(text).find();
            }
            default -> false;
        };
    }

    private static boolean startsWith(byte[] data, int... signature) {
        if (data.length < signature.length) {
            return false;
        }
        for (int i = 0; i < signature.length; i++) {
            if ((data[i] & 0xFF) != signature[i]) {
                return false;
            }
        }
        return true;
    }

    /** 파일 저장·읽기 실패(디스크·잠금 등). API 는 500 으로 메시지를 돌려준다. */
    /** 편집기가 연 뒤 사이트 파일이 바뀌어 반영을 멈춤(409) */
    public static class PageConflictException extends RuntimeException {
        public PageConflictException(String message) {
            super(message);
        }
    }

    public static class PageStorageException extends RuntimeException {
        public PageStorageException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
