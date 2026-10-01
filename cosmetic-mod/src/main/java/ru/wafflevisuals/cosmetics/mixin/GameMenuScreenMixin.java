package ru.wafflevisuals.cosmetics.mixin;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.GameMenuScreen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.LiteralText;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import ru.wafflevisuals.cosmetics.CosmeticMenuScreen;

/** Adds a discoverable entry point alongside the Right Shift shortcut. */
@Mixin(GameMenuScreen.class)
public abstract class GameMenuScreenMixin {
    @Shadow protected int width;
    @Shadow protected int height;
    @Shadow protected abstract <T extends net.minecraft.client.gui.widget.AbstractButtonWidget> T addButton(T button);

    @Inject(method = "init", at = @At("RETURN"))
    private void bustvisuals$addButton(CallbackInfo ci) {
        this.addButton(new ButtonWidget(this.width / 2 - 100, this.height / 2 + 65, 200, 20,
            new LiteralText("Bust Visual"), button -> MinecraftClient.getInstance().openScreen(new CosmeticMenuScreen())));
    }
}
