import { ImageResponse } from "next/og";
import type { Title } from "@tp/shared";
import { api } from "@/lib/server";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Real People Score";

/** Share image: "74% of real viewers liked Dune: Part Two". Text only (no poster art). */
export default async function OG({ params }: { params: Promise<{ type: string; tmdbId: string }> }) {
  const p = await params;
  let title: Title | null = null;
  try {
    title = (await api<{ title: Title }>(`/v1/titles/${p.type}/${Number(p.tmdbId)}`, { token: null })).title;
  } catch {
    title = null;
  }
  const s = title?.score;
  const scored = s && (s.state === "FULL" || s.state === "EARLY") && s.likedPct !== null;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0b0a09", color: "#f3ede2", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ fontSize: 34, color: "#f2b544", letterSpacing: 2, textTransform: "uppercase", fontWeight: 700 }}>Tonight&apos;s Pick</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {scored ? (
            <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05 }}>
              {`${s!.likedPct}% of real viewers liked ${title!.name}`}
            </div>
          ) : (
            <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05 }}>{title ? `What real viewers think of ${title.name}` : "What should we watch tonight?"}</div>
          )}
          {scored && <div style={{ fontSize: 30, color: "#b9b0a1", marginTop: 20 }}>{`Based on ${s!.countedN} opinions from people who watched it`}</div>}
        </div>
        <div style={{ display: "flex", height: 18, borderRadius: 9, overflow: "hidden", background: "#1d1a16" }}>
          {scored && (
            <>
              <div style={{ width: `${s!.likedPct}%`, background: "#2bb3a3" }} />
              <div style={{ width: `${s!.mixedPct ?? 0}%`, background: "#e3a43a" }} />
              <div style={{ width: `${s!.dislikedPct ?? 0}%`, background: "#ec6a55" }} />
            </>
          )}
        </div>
      </div>
    ),
    size,
  );
}
