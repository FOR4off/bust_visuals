package ru.wafflevisuals.cosmetics;

import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.text.LiteralText;

/** In-game BUST VISUALS menu opened with Right Shift. */
public final class CosmeticMenuScreen extends Screen {
    private int panelLeft;
    private int panelTop;

    public CosmeticMenuScreen() { super(new LiteralText("BUST VISUALS")); }

    @Override
    protected void init() {
        clearChildren();
        panelLeft = Math.max(16, this.width / 2 - 250);
        panelTop = Math.max(18, this.height / 2 - 120);
        addButton(new ButtonWidget(panelLeft, panelTop, 116, 22, new LiteralText("Visual"), b -> {}));
        addButton(new ButtonWidget(panelLeft + 122, panelTop, 116, 22, new LiteralText("World"), b -> {}));
        int y = panelTop + 34;
        addToggle(panelLeft, y, "Cape", () -> CosmeticMod.get().config.showCapes, () -> CosmeticMod.get().config.showCapes = !CosmeticMod.get().config.showCapes);
        addToggle(panelLeft, y + 28, "Wings", () -> CosmeticMod.get().config.showWings, () -> CosmeticMod.get().config.showWings = !CosmeticMod.get().config.showWings);
        addToggle(panelLeft, y + 56, "Hide all", () -> CosmeticMod.get().config.hideAll, () -> CosmeticMod.get().config.hideAll = !CosmeticMod.get().config.hideAll);
        addToggle(panelLeft + 122, y, "Particles", () -> CosmeticMod.get().config.showParticles, () -> CosmeticMod.get().config.showParticles = !CosmeticMod.get().config.showParticles);
        addToggle(panelLeft + 122, y + 28, "FPS Optimization", () -> CosmeticMod.get().config.fpsOptimization, () -> CosmeticMod.get().config.fpsOptimization = !CosmeticMod.get().config.fpsOptimization);
        addToggle(panelLeft + 122, y + 56, "Trails", () -> CosmeticMod.get().config.showTrails, () -> CosmeticMod.get().config.showTrails = !CosmeticMod.get().config.showTrails);
        addButton(new ButtonWidget(panelLeft, panelTop + 112, 238, 22, new LiteralText("Закрыть"), b -> closeMenu()));
    }

    private interface Flag { boolean get(); }
    private interface Flip { void run(); }
    private void addToggle(int x, int y, String name, Flag flag, Flip flip) {
        addButton(new ButtonWidget(x, y, 116, 22, new LiteralText(name + ": " + (flag.get() ? "ВКЛ" : "ВЫКЛ")), b -> {
            flip.run();
            CosmeticMod.get().config.save();
            init();
        }));
    }

    private void closeMenu() { if (client != null) client.openScreen(null); }

    @Override
    public void render(MatrixStack matrices, int mouseX, int mouseY, float delta) {
        renderBackground(matrices);
        RenderSystem.enableBlend();
        fill(matrices, panelLeft - 12, panelTop - 34, panelLeft + 250, panelTop + 148, 0xE811121B);
        drawCenteredText(matrices, this.textRenderer, new LiteralText("BUST VISUALS"), this.width / 2, panelTop - 23, 0xFFFFFFFF);
        drawCenteredText(matrices, this.textRenderer, new LiteralText("Right Shift · меню клиента"), this.width / 2, panelTop + 140, 0xFF8D91A8);
        super.render(matrices, mouseX, mouseY, delta);
    }

    @Override public boolean shouldPause() { return false; }
}
