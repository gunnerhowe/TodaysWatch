import type { Baseline } from "@tp/shared";
import { apiSafe } from "@/lib/server";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "How it works" };

const MIN_GENRE = 15;

export default async function HowItWorks() {
  const { baselines } = await apiSafe<{ baselines: Baseline[] }>("/v1/genres/baselines", { baselines: [] });
  const shown = baselines.filter((b) => b.n >= MIN_GENRE).sort((a, b) => b.medianLiked - a.medianLiked);
  const max = Math.max(100, ...shown.map((b) => b.medianLiked));
  return (
    <article className="mx-auto max-w-2xl space-y-8 leading-relaxed">
      <h1 className="font-display text-4xl font-bold uppercase">How it works</h1>

      <Section title="The idea">
        <p>
          Critics and star ratings tell you what reviewers think. {BRAND.name} reads what ordinary viewers already said online, adjusts for genre, and pairs it with Qloo&apos;s taste graph so the pick is both good and yours.
        </p>
      </Section>

      <Section title="Where opinions come from">
        <p>Only official APIs, with our own keys, within their terms. No scraping, no automated personal accounts.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>YouTube</b>: comments on post-release review and reaction videos (YouTube Data API).</li>
          <li><b>Bluesky</b>: public posts that mention the title, read-only search (AT Protocol).</li>
          <li><b>TMDB reviews</b> and <b>Trakt</b> comments from people who logged watching it.</li>
          <li><b>Reddit</b> official discussion threads, only if Reddit approves our API access.</li>
        </ul>
        <p className="text-sm text-dim">Not used: X (paid API), TikTok, Facebook and Instagram (closed), Letterboxd (no public API), IMDb and Rotten Tomatoes (no scraping).</p>
      </Section>

      <Section title="Filtering">
        <p>
          We drop anything posted before release (that removes trailer hype), items under 4 words, link-only posts, bots and non-English text, exact and near-duplicates, and keep only one opinion per person per title (the longest). Up to 1,000 items per title, sampled proportionally across sources. Author handles are hashed and never stored.
        </p>
      </Section>

      <Section title="Classifying">
        <p>
          Each comment is labelled once by NVIDIA Nemotron 3 Nano (on Nebius Token Factory): is it about this title, did the writer watch it, and did they like it, feel mixed, or dislike it. Questions, jokes, plot talk and hype count as no verdict. A comment counts only if it&apos;s about the title, firsthand, has a verdict, and the model is at least 60% confident.
        </p>
        <p className="text-sm text-dim">
          If the model is unavailable or over its daily budget, a smaller sentiment model (Cardiff RoBERTa) is used instead, and the score says &quot;basic classifier&quot;. The classifier&apos;s agreement with human labels is published in the project README.
        </p>
      </Section>

      <Section title="The score">
        <p>
          The headline is the share of counted opinions that liked it. Liked, mixed and disliked always add to 100. The margin is the 95% Wilson interval. With 150+ counted opinions we show the full score; 50 to 149 is an &quot;Early read&quot;; under 50, &quot;Not enough talk yet&quot; and no number.
        </p>
        <p>
          For ranking, we use the lower bound of that interval, so 90% from 60 opinions doesn&apos;t outrank 85% from 900. Each title is also placed against every title we&apos;ve scored in its genre (&quot;Beats 82% of horror we&apos;ve scored&quot;), shown only once a genre has {MIN_GENRE}+ titles.
        </p>
      </Section>

      <Section title="Median Liked % by genre (our data)">
        {shown.length === 0 ? (
          <p className="text-sm text-dim">No genre has {MIN_GENRE} scored titles yet, so there&apos;s nothing to compare.</p>
        ) : (
          <figure>
            <ul className="space-y-1.5" aria-label="Median liked percentage by genre">
              {shown.map((b) => (
                <li key={b.genre} className="grid grid-cols-[110px_1fr_70px] items-center gap-2 text-sm">
                  <span className="truncate">{b.genre}</span>
                  <span className="h-3 rounded-full bg-[var(--bg-3)]">
                    <span className="pat-liked block h-3 rounded-full" style={{ width: `${(b.medianLiked / max) * 100}%` }} />
                  </span>
                  <span className="tabular text-right text-dim">
                    {Math.round(b.medianLiked)}% <span className="text-faint">({b.n})</span>
                  </span>
                </li>
              ))}
            </ul>
            <figcaption className="mt-2 text-xs text-faint">Median Liked % among titles with a full score, per TMDB genre; count of titles in brackets. Computed nightly from our database.</figcaption>
          </figure>
        )}
      </Section>

      <Section title="What Qloo does">
        <p>
          Qloo knows taste, not reception. The agent uses it to turn vibe words into tags, find taste-matched candidates, rank a shortlist against your likes, explain fit with shared tags, spot what&apos;s rising, and for two people, compare both tastes. We then rank those candidates by how real viewers felt. Every pick must come from a tool result, and the server rejects any answer that doesn&apos;t, or that includes a title you&apos;ve seen.
        </p>
        <p className="text-sm text-dim">We send Qloo only titles and tags, never names, emails or anything personal.</p>
      </Section>

      <Section title="Limits">
        <ul className="list-disc space-y-1 pl-5">
          <li>People who comment online aren&apos;t a random sample of viewers.</li>
          <li>Titles can be review-bombed; one-opinion-per-person and post-release filtering help but don&apos;t prevent it.</li>
          <li>English only.</li>
          <li>Some big sources aren&apos;t available to us (see above), so some titles have little talk.</li>
          <li>Qloo affinities describe groups of people, not you personally.</li>
        </ul>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-2xl font-semibold uppercase text-accent">{title}</h2>
      {children}
    </section>
  );
}
