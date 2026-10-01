package ru.wafflevisuals.cosmetics;

import com.google.gson.Gson;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * API косметики (GET /api/cosmetics/player/{uuid}).
 * Правила: снапшот-паттерн (сеть ТОЛЬКО в фоне), память+диск кэш, TTL 60с,
 * не чаще одного запроса на uuid без инвалидации. Рендер кэш не трогает.
 */
public class CosmeticApi {
    public static class Snapshot {
        public boolean premium, visible;
        public String badge;
        public Map<String, Object> cosmetics;
        public long fetchedAt;
    }

    private static final Gson GSON = new Gson();
    private static final long TTL_MS = 60_000;
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private static final ExecutorService POOL = Executors.newFixedThreadPool(1, (r) -> {
        Thread t = new Thread(r, "WaffleCosmetics-API"); t.setDaemon(true); return t;
    });

    private final Map<UUID, Snapshot> memory = new ConcurrentHashMap<>();
    private final java.util.Set<UUID> pending = ConcurrentHashMap.newKeySet();
    private final Map<UUID, Long> retryAfter = new ConcurrentHashMap<>();
    private final Path cacheDir;
    private final String apiUrl;

    public CosmeticApi(String apiUrl, Path gameDir) {
        this.apiUrl = apiUrl;
        this.cacheDir = gameDir.resolve("waffle-cosmetics").resolve("cache");
        try { Files.createDirectories(cacheDir); } catch (Exception ignored) {}
    }

    /** Мгновенно из кэша (вызывается в рендере). */
    public Snapshot get(UUID uuid) { return uuid == null ? null : memory.get(uuid); }

    /** Запросить в фоне при необходимости (вызывается из тика). */
    public void request(UUID uuid) {
        if (uuid == null) return;
        long now = System.currentTimeMillis();
        Snapshot cached = memory.get(uuid);
        if (cached != null && now - cached.fetchedAt < TTL_MS) return;
        if (retryAfter.getOrDefault(uuid, 0L) > now || pending.size() >= 64 || !pending.add(uuid)) return;
        POOL.execute(() -> {
            try {
                Snapshot disk = cached == null ? readDisk(uuid) : null;
                if (disk != null && System.currentTimeMillis() - disk.fetchedAt < TTL_MS) memory.put(uuid, disk);
                else fetch(uuid);
            } finally { pending.remove(uuid); }
        });
    }

    public void invalidate(UUID uuid) { memory.remove(uuid); }

    private void fetch(UUID uuid) {
        try {
            HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl + "/api/cosmetics/player/" + uuid))
                .timeout(Duration.ofSeconds(5))
                .GET().build();
            HttpResponse<String> resp = HTTP.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() == 200) {
                Snapshot s = GSON.fromJson(resp.body(), Snapshot.class);
                s.fetchedAt = System.currentTimeMillis();
                memory.put(uuid, s);
                Files.write(diskFile(uuid), GSON.toJson(s).getBytes(StandardCharsets.UTF_8));
            } else {
                // 404 — косметики нет/скрыта: кэшируем «пусто», чтобы не спамить API
                Snapshot s = new Snapshot();
                s.fetchedAt = System.currentTimeMillis();
                memory.put(uuid, s);
            }
        } catch (Exception ignored) {
            retryAfter.put(uuid, System.currentTimeMillis() + 30_000);
        }
    }

    private Path diskFile(UUID uuid) { return cacheDir.resolve("cos-" + uuid + ".json"); }
    private Snapshot readDisk(UUID uuid) {
        try {
            Path f = diskFile(uuid);
            if (!Files.exists(f)) return null;
            return GSON.fromJson(new String(Files.readAllBytes(f), StandardCharsets.UTF_8), Snapshot.class);
        } catch (Exception e) { return null; }
    }

    public static String slot(Snapshot s, String key) {
        if (s == null || !s.visible || s.cosmetics == null) return null;
        Object v = s.cosmetics.get(key);
        return v == null ? null : String.valueOf(v);
    }
}
