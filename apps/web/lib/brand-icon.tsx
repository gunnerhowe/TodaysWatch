import { ImageResponse } from "next/og";
import { BRAND } from "./brand";

/** Placeholder text icon: the brand's initials on the accent color, until there's a real logo. */
export function brandIcon(px: number) {
  const initials = BRAND.name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f2b544", color: "#1a1306", fontSize: px * 0.48, fontWeight: 800, borderRadius: px * 0.2, letterSpacing: -px * 0.02 }}>
        {initials}
      </div>
    ),
    { width: px, height: px },
  );
}
