package ru.wafflevisuals.cosmetics;

import net.minecraft.client.render.RenderLayer;
import net.minecraft.client.render.VertexConsumer;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.math.MathHelper;

/**
 * Геометрия косметики: квад (cape/wings/badge) и кольцо (aura/halo).
 * Оптимизировано: без аллокаций на кадр, минимум вершин.
 */
public final class CosmeticGeometry {
    private CosmeticGeometry() {}

    public static void quad(VertexConsumer vc, MatrixStack m, float w, float h, int light) {
        MatrixStack.Entry e = m.peek();
        vc.vertex(e.getModel(), -w / 2, h, 0).color(255, 255, 255, 255).texture(0, 1).overlay(0, 0).light(light).normal(e.getNormal(), 0, 0, 1).next();
        vc.vertex(e.getModel(), w / 2, h, 0).color(255, 255, 255, 255).texture(1, 1).overlay(0, 0).light(light).normal(e.getNormal(), 0, 0, 1).next();
        vc.vertex(e.getModel(), w / 2, 0, 0).color(255, 255, 255, 255).texture(1, 0).overlay(0, 0).light(light).normal(e.getNormal(), 0, 0, 1).next();
        vc.vertex(e.getModel(), -w / 2, 0, 0).color(255, 255, 255, 255).texture(0, 0).overlay(0, 0).light(light).normal(e.getNormal(), 0, 0, 1).next();
    }

    public static void ring(VertexConsumer vc, MatrixStack m, float r, int light) {
        MatrixStack.Entry e = m.peek();
        int seg = 24;
        for (int i = 0; i < seg; i++) {
            float a0 = (float) (i / (double) seg * Math.PI * 2);
            float a1 = (float) ((i + 1) / (double) seg * Math.PI * 2);
            vc.vertex(e.getModel(), MathHelper.cos(a0) * r, 0, MathHelper.sin(a0) * r).color(255, 200, 80, 220).texture(0, 0).overlay(0, 0).light(light).normal(e.getNormal(), 0, 1, 0).next();
            vc.vertex(e.getModel(), MathHelper.cos(a1) * r, 0, MathHelper.sin(a1) * r).color(255, 200, 80, 220).texture(1, 0).overlay(0, 0).light(light).normal(e.getNormal(), 0, 1, 0).next();
        }
    }

    public static RenderLayer layer() { return RenderLayer.getEntityTranslucent(WaffleCosmeticTextures.WHITE); }
}
