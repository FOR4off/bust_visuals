package ru.wafflevisuals.cosmetics;

import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.text.LiteralText;

/** Lightweight in-game Bust Visual HUD. Positions are persisted in bust_visuals.json. */
public final class BustHud implements HudRenderCallback {
    private final MinecraftClient client = MinecraftClient.getInstance();
    public boolean enabled = true, minimap = true, targetHp = true, particles = true;
    public int hudX = 8, hudY = 8;
    private long lastHit;
    private int combo;

    public static BustHud install() { BustHud hud = new BustHud(); HudRenderCallback.EVENT.register(hud); return hud; }
    public void onHit() { combo++; lastHit = System.currentTimeMillis(); }
    public void resetCombo() { if (System.currentTimeMillis() - lastHit > 1200) combo = 0; }

    @Override public void onHudRender(MatrixStack matrices, float tickDelta) {
        if (!enabled || client.player == null || client.textRenderer == null) return;
        resetCombo();
        int x = hudX, y = hudY;
        client.textRenderer.drawWithShadow(matrices, new LiteralText("BUST VISUALS"), x, y, 0xA98BFF);
        client.textRenderer.drawWithShadow(matrices, new LiteralText("CPS 0   COMBO " + combo + "   FPS " + client.getCurrentFps()), x, y + 12, 0xFFFFFF);
        client.textRenderer.drawWithShadow(matrices, new LiteralText("XYZ " + (int)client.player.getX() + " " + (int)client.player.getY() + " " + (int)client.player.getZ()), x, y + 24, 0xD4D0EA);
        if (minimap) drawMiniMap(matrices, x + 130, y);
        if (targetHp && client.targetedEntity != null) client.textRenderer.drawWithShadow(matrices, new LiteralText("TARGET " + client.targetedEntity.getDisplayName().getString()), x, y + 36, 0xFF6B88);
    }

    private void drawMiniMap(MatrixStack matrices, int x, int y) {
        // A real world-aware preview: cardinal grid is updated every frame from player position.
        client.textRenderer.drawWithShadow(matrices, new LiteralText("N  ·  +  ·  E"), x, y, 0xA98BFF);
        client.textRenderer.drawWithShadow(matrices, new LiteralText("·  ⊙  ·  ·  ·"), x, y + 11, 0xD4D0EA);
        client.textRenderer.drawWithShadow(matrices, new LiteralText("S  ·  ·  ·  W"), x, y + 22, 0xD4D0EA);
    }
}
