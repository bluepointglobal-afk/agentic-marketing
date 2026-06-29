import sharp from "sharp";
import { loadAssetBuffer } from "@pipeline/shared/assets";
import type { LogoPosition } from "@pipeline/shared";
import type { Logger } from "../logger.js";

/**
 * Composite a brand logo/wordmark onto a generated image (the Node/sharp
 * equivalent of marketing-team's Pillow `_composite_wordmark.py`).
 * Returns a PNG buffer; falls back to the original on any failure.
 */

const GRAVITY: Record<LogoPosition, string> = {
  "bottom-right": "southeast",
  "bottom-center": "south",
  "top-left": "northwest",
};

export async function compositeLogo(
  baseBuffer: Buffer,
  logoUrl: string,
  position: LogoPosition,
  log: Logger,
): Promise<Buffer> {
  const logoBuf = await loadAssetBuffer(logoUrl);
  if (!logoBuf) {
    log.warn({ logoUrl }, "logo not found; skipping composite");
    return baseBuffer;
  }

  try {
    const base = sharp(baseBuffer);
    const meta = await base.metadata();
    const width = meta.width ?? 1024;

    // Logo at ~20% width with a transparent margin so it sits inset from the edge.
    const logoWidth = Math.round(width * 0.2);
    const margin = Math.round(width * 0.03);
    const logo = await sharp(logoBuf)
      .resize({ width: logoWidth, withoutEnlargement: true })
      .extend({
        top: margin,
        bottom: margin,
        left: margin,
        right: margin,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    return await base
      .composite([{ input: logo, gravity: GRAVITY[position] ?? "southeast" }])
      .png()
      .toBuffer();
  } catch (err) {
    log.error({ err }, "logo compositing failed; using base image");
    return baseBuffer;
  }
}
