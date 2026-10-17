import { ImageResponse } from "next/og";
import type { ShareCard } from "@tp/shared";
import { apiSafe } from "@/lib/server";
import { shareHeadline } from "@/lib/share";
import { BRAND } from "@/lib/brand";

// The picture group chats and social apps show for a share link. Text only: no posters.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = BRAND.name;

const C = { bg: "#0b0a09", card: "#14120f", line: "#2a2621", fg: "#f3ede2", dim: "#b9b0a1", faint: "#8a8174", accent: "#f2b544", liked: "#2bb3a3", disliked: "#ec6a55" };

function Dot({ color, value, big }: { color: string; value: string; big?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: big ? 14 : 10 }}>
      <div style={{ width: big ? 26 : 18, height: big ? 26 : 18, borderRadius: 999, background: color }} />
      <div style={{ fontSize: big ? 52 : 34, fontWeight: 700, color: color === C.disliked ? C.dim : C.fg }}>{value}</div>
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { card } = await apiSafe<{ card: ShareCard | null }>(`/v1/share/${id.replace(/[^a-z0-9]/gi, "").slice(0, 20)}`, { card: null });
  const headline = card ? shareHeadline(card) : "What should we watch tonight?";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, color: C.fg, padding: "56px 64px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: 3, color: C.accent, textTransform: "uppercase" }}>{BRAND.name}</div>
        <div style={{ display: "flex", fontSize: card?.kind === "match" ? 58 : 46, fontWeight: 800, lineHeight: 1.1, marginTop: 14, maxWidth: 1060 }}>{headline}</div>

        {card?.kind === "match" && (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 26 }}>
            <div style={{ display: "flex", fontSize: 150, fontWeight: 800, color: C.accent, lineHeight: 1 }}>{card.pct}%</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 30 }}>
              {[...card.sharedTags, ...card.sharedGenres].slice(0, 4).map((t) => (
                <div key={t} style={{ display: "flex", fontSize: 30, padding: "10px 22px", borderRadius: 999, background: C.card, border: `2px solid ${C.line}`, color: C.dim }}>
                  {t}
                </div>
              ))}
            </div>
          </div>
        )}

        {card?.kind === "pick" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 26 }}>
            {card.picks.slice(0, 3).map((p, i) => (
              <div
                key={i}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: i === 0 ? "16px 28px" : "10px 28px", borderRadius: 24, background: i === 0 ? C.card : "transparent", border: `2px solid ${C.line}` }}
              >
                <div style={{ display: "flex", flexDirection: "column", maxWidth: 720 }}>
                  <div style={{ display: "flex", fontSize: i === 0 ? 40 : 30, fontWeight: 800, textTransform: "uppercase" }}>{p.name.length > 34 ? `${p.name.slice(0, 33)}…` : p.name}</div>
                  <div style={{ display: "flex", fontSize: 22, color: C.faint }}>{[p.year, p.type === "tv" ? "TV" : "Movie"].filter(Boolean).join(" · ")}</div>
                </div>
                {p.likedPct !== null ? (
                  <div style={{ display: "flex", gap: 26 }}>
                    <Dot color={C.liked} value={`${p.likedPct}%`} big={i === 0} />
                    <Dot color={C.disliked} value={`${p.dislikedPct ?? 0}%`} big={i === 0} />
                  </div>
                ) : (
                  <div style={{ display: "flex", fontSize: 26, color: C.faint }}>Not scored yet</div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", marginTop: "auto", paddingTop: 16, fontSize: 24, color: C.faint }}>
          {card?.kind === "match" ? "Find your movie match" : "Picks everyone will like, scored by real viewers"} · {BRAND.host}
        </div>
      </div>
    ),
    size,
  );
}
