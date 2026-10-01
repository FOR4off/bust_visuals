package ru.wafflevisuals.cosmetics;

import com.google.gson.Gson;
import com.google.gson.JsonObject;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Настройки мода: per-category показ косметики, качество, hide-all, скрытые игроки.
 * Сохраняются в config/waffle-cosmetics.json.
 */
public class CosmeticConfig {
    private static final Gson GSON = new com.google.gson.GsonBuilder().setPrettyPrinting().create();

    public boolean showCapes = true, showWings = true, showHats = true, showAuras = true;
    public boolean showParticles = true, showTrails = true, showEmotes = true, showBadges = true;
    public String quality = "HIGH"; // LOW | MEDIUM | HIGH | ULTRA
    public boolean hideAll = false;
    public boolean fpsOptimization = true;
    public String renderDistance = "32"; // блоки
    public Path file;

    public void load(Path configDir) {
        this.file = configDir.resolve("bust_visuals.json");
        try {
            if (Files.exists(file)) {
                JsonObject j = GSON.fromJson(new String(Files.readAllBytes(file), StandardCharsets.UTF_8), JsonObject.class);
                showCapes = j.has("showCapes") && j.get("showCapes").getAsBoolean();
                showWings = j.has("showWings") && j.get("showWings").getAsBoolean();
                showHats = j.has("showHats") && j.get("showHats").getAsBoolean();
                showAuras = j.has("showAuras") && j.get("showAuras").getAsBoolean();
                showParticles = j.has("showParticles") && j.get("showParticles").getAsBoolean();
                showTrails = j.has("showTrails") && j.get("showTrails").getAsBoolean();
                showEmotes = j.has("showEmotes") && j.get("showEmotes").getAsBoolean();
                showBadges = j.has("showBadges") && j.get("showBadges").getAsBoolean();
                quality = j.has("quality") ? j.get("quality").getAsString() : "HIGH";
                hideAll = j.has("hideAll") && j.get("hideAll").getAsBoolean();
                fpsOptimization = !j.has("fpsOptimization") || j.get("fpsOptimization").getAsBoolean();
                renderDistance = j.has("renderDistance") ? j.get("renderDistance").getAsString() : "32";
            }
        } catch (Exception ignored) {}
    }

    public void save() {
        try {
            JsonObject j = new JsonObject();
            j.addProperty("showCapes", showCapes);
            j.addProperty("showWings", showWings);
            j.addProperty("showHats", showHats);
            j.addProperty("showAuras", showAuras);
            j.addProperty("showParticles", showParticles);
            j.addProperty("showTrails", showTrails);
            j.addProperty("showEmotes", showEmotes);
            j.addProperty("showBadges", showBadges);
            j.addProperty("quality", quality);
            j.addProperty("hideAll", hideAll);
            j.addProperty("fpsOptimization", fpsOptimization);
            j.addProperty("renderDistance", renderDistance);
            Files.write(file, GSON.toJson(j).getBytes(StandardCharsets.UTF_8));
        } catch (Exception ignored) {}
    }

    public boolean visible(String slot) {
        if (hideAll) return false;
        switch (slot) {
            case "cape": return showCapes;
            case "wings": return showWings;
            case "hat": case "halo": return showHats;
            case "aura": return showAuras;
            case "particles": return showParticles;
            case "trail": return showTrails;
            case "emote": return showEmotes;
            case "badge": return showBadges;
            default: return true;
        }
    }
}
