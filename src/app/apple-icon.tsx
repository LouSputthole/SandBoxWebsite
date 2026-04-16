import { ImageResponse } from "next/og";

// iOS home-screen icon. Raster-only (iOS doesn't honor SVG apple-touch-icons),
// so we rasterize via ImageResponse at the standard 180×180 size. Visual
// matches icon.svg — brand gradient gamepad on the dark rounded bg — but
// scaled up so the stroke reads cleanly at home-screen size.
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
            "linear-gradient(135deg, #0f0a1f 0%, #1a0a2e 100%)",
          borderRadius: "40px",
        }}
      >
        {/* Gamepad2 from lucide, scaled to ~60% of canvas, brand gradient via SVG */}
        <svg
          width="120"
          height="120"
          viewBox="0 0 24 24"
          fill="none"
          stroke="url(#g)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#c084fc" />
              <stop offset="100%" stopColor="#60a5fa" />
            </linearGradient>
          </defs>
          <line x1="6" y1="12" x2="10" y2="12" />
          <line x1="8" y1="10" x2="8" y2="14" />
          <line x1="15" y1="13" x2="15.01" y2="13" />
          <line x1="18" y1="11" x2="18.01" y2="11" />
          <rect x="2" y="6" width="20" height="12" rx="6" ry="6" />
        </svg>
      </div>
    ),
    {
      ...size,
    },
  );
}
