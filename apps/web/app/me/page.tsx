import Link from "next/link";
import { SettingsZ, type Profile } from "@tp/shared";
import { SettingsPanel, VoiceLink, WatchSettings } from "@/components/ProfileControls";
import { ProfileList } from "@/components/ProfileList";
import { apiSafe } from "@/lib/server";

export const metadata = { title: "Your profile" };
export const dynamic = "force-dynamic";

export default async function Me() {
  const { profile } = await apiSafe<{ profile: Profile | null }>("/v1/profile", { profile: null });
  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="font-display text-4xl font-bold uppercase">Your profile</h1>
        <p className="text-sm text-dim">Guest profile, kept on this device by a cookie. No account needed.</p>
      </header>

      <section aria-labelledby="taste-h" className="space-y-2">
        <h2 id="taste-h" className="font-display text-2xl font-semibold uppercase">
          Your taste
        </h2>
        {profile?.tasteTags.length ? (
          <p className="text-lg">{profile.tasteTags.map((t) => t.name.toLowerCase()).join(" · ")}</p>
        ) : (
          <p className="text-sm text-dim">Like at least two titles and we&apos;ll show the Qloo tags they share.</p>
        )}
      </section>

      <section aria-labelledby="watch-h" className="surface space-y-3 rounded-2xl p-5">
        <h2 id="watch-h" className="font-display text-2xl font-semibold uppercase">
          What you can watch
        </h2>
        <WatchSettings initial={profile?.settings ?? SettingsZ.parse({})} />
      </section>

      <div className="space-y-3">
        <ProfileList title="Liked" items={profile?.liked ?? []} empty="Thumbs up a title you enjoyed." />
        <ProfileList title="Want to watch" items={profile?.wantToWatch ?? []} empty="Tap “Want to watch” on any title." />
        <ProfileList title="Seen" items={profile?.seen ?? []} empty="Nothing marked as seen yet." />
        <ProfileList title="Didn't like" items={profile?.disliked ?? []} empty="No thumbs down yet." />
      </div>

      <section aria-labelledby="voice-h" className="surface space-y-2 rounded-2xl p-5">
        <h2 id="voice-h" className="font-display text-2xl font-semibold uppercase">
          Ask by voice
        </h2>
        <p className="text-sm text-dim">
          Link this profile to Alexa+ with a one-time code. No names, emails or account IDs pass through. Or try the <Link href="/alexa" className="text-accent underline">voice demo</Link> in your browser.
        </p>
        <VoiceLink />
      </section>

      <section aria-labelledby="settings-h" className="surface space-y-3 rounded-2xl p-5">
        <h2 id="settings-h" className="font-display text-2xl font-semibold uppercase">
          Settings
        </h2>
        <SettingsPanel includeSeen={profile?.settings.includeSeen ?? false} />
      </section>
    </div>
  );
}
