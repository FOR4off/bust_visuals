package ru.wafflevisuals.cosmetics;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.math.MathHelper;

/**
 * Feature-рендер косметики (cape/wings/halo/aura/badge) — БЕСПЛАТНЫЙ мод.
 * Читает только готовые снапшоты; настройки фильтруют категории; дистанция — culling.
 */
public class CosmeticFeatureRenderer
        extends net.minecraft.client.render.entity.feature.FeatureRenderer<AbstractClientPlayerEntity, net.minecraft.client.render.entity.model.PlayerEntityModel<AbstractClientPlayerEntity>> {

    public CosmeticFeatureRenderer(net.minecraft.client.render.entity.feature.FeatureRendererContext<AbstractClientPlayerEntity, net.minecraft.client.render.entity.model.PlayerEntityModel<AbstractClientPlayerEntity>> ctx) {
        super(ctx);
    }

    @Override
    public void render(MatrixStack matrices, VertexConsumerProvider vcp, int light,
                       AbstractClientPlayerEntity player, float limbAngle, float limbDistance,
                       float tickDelta, float headYaw, float headPitch, float limbSwing) {
        CosmeticMod mod = CosmeticMod.get();
        CosmeticApi.Snapshot snap = mod.api.get(player.getUuid());
        if (snap == null || !snap.visible || mod.config.hideAll) return;
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.player != null && player.squaredDistanceTo(mc.player) > renderDistSq()) return;

        String cape = CosmeticApi.slot(snap, "cape");
        String wings = CosmeticApi.slot(snap, "wings");
        String badge = CosmeticApi.slot(snap, "badge");
        String aura = CosmeticApi.slot(snap, "aura");

        if (cape != null && mod.config.visible("cape")) {
            matrices.push();
            matrices.translate(0, 0, 0.125);
            float bodyYaw = MathHelper.lerpAngleDegrees(tickDelta, player.prevBodyYaw, player.bodyYaw);
            matrices.multiply(new net.minecraft.util.math.Quaternion(0f, -bodyYaw + 180f, 0f, true));
            net.minecraft.client.render.VertexConsumer vc =
                vcp.getBuffer(net.minecraft.client.render.RenderLayer.getEntityTranslucent(WaffleCosmeticTextures.byId(cape)));
            CosmeticGeometry.quad(vc, matrices, 10, 16, light);
            matrices.pop();
        }
        if (wings != null && mod.config.visible("wings")) {
            float flap = (float) (Math.sin((player.age + tickDelta) * 0.22) * 35f);
            for (int side = -1; side <= 1; side += 2) {
                matrices.push();
                matrices.translate(side * 0.12, 0.25, -0.12);
                matrices.multiply(new net.minecraft.util.math.Quaternion(0f, side * (155f + flap * 1.2f), 0f, true));
                net.minecraft.client.render.VertexConsumer vc =
                    vcp.getBuffer(net.minecraft.client.render.RenderLayer.getEntityTranslucent(WaffleCosmeticTextures.wings()));
                CosmeticGeometry.quad(vc, matrices, 18, 10, light);
                matrices.pop();
            }
        }
        if (aura != null && mod.config.visible("aura")) {
            matrices.push();
            matrices.translate(0, 0.03, 0);
            net.minecraft.client.render.VertexConsumer vc =
                vcp.getBuffer(net.minecraft.client.render.RenderLayer.getEntityTranslucent(WaffleCosmeticTextures.byId(aura)));
            CosmeticGeometry.ring(vc, matrices, 10, light);
            matrices.pop();
        }
        if (badge != null && mod.config.visible("badge")) {
            matrices.push();
            matrices.translate(0, player.getHeight() + 0.32, 0);
            float bodyYaw = MathHelper.lerpAngleDegrees(tickDelta, player.prevBodyYaw, player.bodyYaw);
            matrices.multiply(new net.minecraft.util.math.Quaternion(0f, -bodyYaw, 0f, true));
            net.minecraft.client.render.VertexConsumer vc =
                vcp.getBuffer(net.minecraft.client.render.RenderLayer.getEntityTranslucent(WaffleCosmeticTextures.byId(badge)));
            CosmeticGeometry.quad(vc, matrices, 9, 9, 0xF000F0);
            matrices.pop();
        }
    }

    private double renderDistSq() {
        try { return Math.pow(Double.parseDouble(CosmeticMod.get().config.renderDistance), 2); }
        catch (Exception e) { return 1024; }
    }
}
