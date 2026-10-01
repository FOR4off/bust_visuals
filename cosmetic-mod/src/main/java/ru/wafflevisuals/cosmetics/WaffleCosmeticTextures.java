package ru.wafflevisuals.cosmetics;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.util.Identifier;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Текстуры косметики: диск-кэш + динамическая регистрация Identifier (вне render-потока). */
public final class WaffleCosmeticTextures {
    public static final Identifier WHITE = new Identifier("textures/misc/white.png");
    private static final Map<String, Identifier> CACHE = new ConcurrentHashMap<>();
    private static Path cacheDir;
    private static String apiUrl;

    private WaffleCosmeticTextures() {}

    public static void init(String api, Path gameDir) {
        apiUrl = api;
        cacheDir = gameDir.resolve("waffle-cosmetics").resolve("assets");
        try { Files.createDirectories(cacheDir); } catch (Exception ignored) {}
    }

    public static Identifier cape() { return texture("waffle_cape"); }
    public static Identifier wings() { return texture("wings_default"); }
    public static Identifier badge() { return texture("starter_badge"); }
    public static Identifier byId(String cosmeticId) { return texture(cosmeticId); }

    private static Identifier texture(String key) {
        return CACHE.computeIfAbsent(key, WaffleCosmeticTextures::download);
    }

    private static Identifier download(String key) {
        try {
            Path f = cacheDir.resolve(key.replaceAll("[^\\w\\-]", "_") + ".png");
            if (!Files.exists(f)) {
                HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(apiUrl + "/cosmetics-assets/" + key + ".png")).GET().build();
                HttpResponse<byte[]> resp = java.net.http.HttpClient.newHttpClient()
                    .send(req, HttpResponse.BodyHandlers.ofByteArray());
                if (resp.statusCode() == 200) Files.write(f, resp.body());
            }
            if (Files.exists(f)) {
                try (InputStream in = Files.newInputStream(f)) {
                    NativeImage img = NativeImage.read(in);
                    Identifier id = new Identifier("wafflecosmetics", key.replaceAll("[^\\w\\-]", "_"));
                    MinecraftClient.getInstance().getTextureManager().registerTexture(id, new NativeImageBackedTexture(img));
                    return id;
                }
            }
        } catch (Exception ignored) {}
        return WHITE;
    }
}
