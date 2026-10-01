package ru.wafflevisuals.cosmetics;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.options.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.entity.player.PlayerEntity;
import org.lwjgl.glfw.GLFW;

import java.nio.file.Path;

/**
 * WAFFLE VISUALS COSMETIC MOD — бесплатный мод просмотра косметики.
 * Никакого HUD/visuals — только чужие косметики, лёгкий рендер, кэш.
 */
public final class CosmeticMod implements ClientModInitializer {
    private static CosmeticMod instance;
    public CosmeticApi api;
    public CosmeticConfig config = new CosmeticConfig();
    public BustHud hud;
    private KeyBinding menuKey;

    public static CosmeticMod get() { return instance; }
    @Override
    public void onInitializeClient() {
        instance = this;
        String apiUrl = System.getProperty("waffle.api.url", "http://localhost:4000");
        MinecraftClient mc = MinecraftClient.getInstance();
        Path gameDir = mc.runDirectory.toPath();
        config.load(gameDir.resolve("config"));
        api = new CosmeticApi(apiUrl, gameDir);
        WaffleCosmeticTextures.init(apiUrl, gameDir);
        hud = BustHud.install();
        menuKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "key.bustvisuals.menu", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_RIGHT_SHIFT, "category.bustvisuals"));

        ClientTickEvents.END_CLIENT_TICK.register((client) -> {
            while (menuKey.wasPressed()) {
                if (client.currentScreen instanceof CosmeticMenuScreen) client.openScreen(null);
                else if (client.currentScreen == null) client.openScreen(new CosmeticMenuScreen());
            }
            if (client.world == null) return;
            for (PlayerEntity p : client.world.getPlayers()) {
                api.request(p.getUuid());
            }
        });

        System.out.println("[WAFFLE COSMETICS] Cosmetic Mod 1.0.0 loaded — бесплатные косметики видны!");
    }
}
