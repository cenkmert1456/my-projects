/**
 * DROP — mobile asset generator.
 *
 * Renders the DROP brand mark (from public/drop-icon.svg) into the source
 * PNGs that `@capacitor/assets` needs to stamp out every Android/iOS icon
 * and splash size, plus the Android notification small icon.
 *
 *   bun run mobile:assets
 *
 * Sources written to assets/
 *   - icon-only.png   1024×1024  transparent bg, drop mark only (adaptive fg)
 *   - splash.png      2732×2732  dark brand bg + centered drop mark
 *   - ic_stat_drop.png  96×96    white drop mark (Android notification icon)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "assets");
await mkdir(out, { recursive: true });

// The drop mark from public/drop-icon.svg (512×512 viewBox).
const DROP_PATH =
  "M256 88c68 84 136 147 136 227a136 136 0 0 1-272 0c0-80 68-143 136-227z";

function markSvg({ size, mark, circle, background, padRatio = 0.25 }) {
  // padRatio leaves breathing room around the mark (important for the
  // Android adaptive-icon safe zone, which is the inner ~61%).
  const s = size * (1 - padRatio * 2);
  const x = (size - s) / 2;
  const y = (size - s) / 2;
  const r = s * 0.2; // circle hole radius, scaled from 52/256
  const cx = x + s * 0.5;
  const cy = y + s * 0.5 + s * 0.11; // circle sits lower, like the logo
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
${background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : ""}
<g transform="translate(${x} ${y})">
  <path d="${DROP_PATH}" transform="scale(${s / 512})" fill="${mark}"/>
  <circle cx="${(cx - x) * (512 / s)}" cy="${(cy - y) * (512 / s)}" r="${r * (512 / s)}" fill="${circle}"/>
</g>
</svg>`;
}

async function render(svg, file) {
  const path = resolve(out, file);
  await sharp(Buffer.from(svg)).png().toFile(path);
  console.log("✓", file);
}

// 1. Adaptive-icon foreground: mark only on transparent background.
await render(
  markSvg({ size: 1024, mark: "#ffffff", circle: "#e84c1f", padRatio: 0.25 }),
  "icon-only.png",
);

// 2. Splash: dark brand background + centered mark (matches SplashScreen
//    backgroundColor #15130f and StatusBar config).
await render(
  markSvg({ size: 2732, mark: "#ffffff", circle: "#e84c1f", background: "#15130f", padRatio: 0.68 }),
  "splash.png",
);

// 3. Android notification small icon: flat white mark (Android tints it).
await render(
  markSvg({ size: 96, mark: "#ffffff", circle: "#ffffff", padRatio: 0.15 }),
  "ic_stat_drop.png",
);

console.log("done →", out);
