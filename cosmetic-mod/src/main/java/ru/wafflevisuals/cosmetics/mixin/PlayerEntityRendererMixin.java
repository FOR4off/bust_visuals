package ru.wafflevisuals.cosmetics.mixin;

import net.minecraft.client.render.entity.PlayerEntityRenderer;
import net.minecraft.client.render.entity.feature.FeatureRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import ru.wafflevisuals.cosmetics.CosmeticFeatureRenderer;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/** Регистрирует cosmetic-слой на рендерерах игроков (однократно на каждый renderer). */
@Mixin(PlayerEntityRenderer.class)
public class PlayerEntityRendererMixin {

    private static final Set<PlayerEntityRenderer> WAFFLE_PATCHED = ConcurrentHashMap.newKeySet();

    @Inject(method = "<init>", at = @At("RETURN"))
    private void wafflecosmetics$addLayer(CallbackInfo ci) {
        PlayerEntityRenderer self = (PlayerEntityRenderer) (Object) this;
        if (!WAFFLE_PATCHED.add(self)) return;
        ru.wafflevisuals.cosmetics.mixin.LivingEntityRendererAccessor acc =
            (ru.wafflevisuals.cosmetics.mixin.LivingEntityRendererAccessor) self;
        @SuppressWarnings({"unchecked", "rawtypes"})
        FeatureRenderer feature = (FeatureRenderer) new CosmeticFeatureRenderer(self);
        acc.waffle$addFeature(feature);
    }
}
