import { ImageResponse } from "next/og";

/**
 * iOS home-screen icon. Raster-only (iOS doesn't honor SVG apple-touch-
 * icons), so we rasterize via ImageResponse at the standard 180×180 size.
 *
 * Why this is hand-rolled instead of matching icon.svg directly:
 * ImageResponse runs on Satori, which has spotty SVG gradient support —
 * `<linearGradient>` + `stroke="url(#id)"` often renders with no stroke
 * color at all, producing a near-invisible mark on the dark background.
 * That's likely what made iOS tab icons look like a blank/default tile.
 *
 * Satori DOES reliably handle div backgrounds, border-radius, and solid
 * text colors — which is what we lean on here. Single bold lowercase
 * "s" on our dark-purple rounded tile, with the brand's purple accent
 * color for high contrast at thumbnail sizes.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #0f0a1f 0%, #1a0a2e 50%, #2a1540 100%)",
          borderRadius: "40px",
          fontSize: 140,
          fontWeight: 900,
          color: "#c084fc",
          letterSpacing: "-0.04em",
          // Slight baseline lift so the "s" sits visually centered — iOS
          // tiles show the icon at very small sizes and optical centering
          // matters more than mathematical centering.
          paddingBottom: 8,
          fontFamily: "sans-serif",
        }}
      >
        s
      </div>
    ),
    {
      ...size,
    },
  );
}
