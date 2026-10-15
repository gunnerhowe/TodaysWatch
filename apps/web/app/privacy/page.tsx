export const metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <article className="mx-auto max-w-2xl space-y-4 leading-relaxed">
      <h1 className="font-display text-4xl font-bold uppercase">Privacy</h1>
      <p>
        You don&apos;t need an account. On your first visit we set one httpOnly cookie that identifies your guest profile. We store a hash of it, your ratings (thumbs, seen, want to watch), your settings, and your chats with the picker.
      </p>
      <p>We send Qloo only movie and TV titles and taste tags. We never send names, emails or other personal data to Qloo or to the language model.</p>
      <p>
        Opinions we score are public comments collected through official APIs. We keep excerpts of at most 280 characters with a link to the source, never the author&apos;s handle (only a one-way hash, so we can count one opinion per person). YouTube comment text is deleted within 30 days; the derived counts stay.
      </p>
      <p>Voice: linking Alexa+ uses a one-time 6-digit code. No names, emails or account IDs pass through.</p>
      <p>
        You can export or delete everything from your <a href="/me" className="text-accent underline">profile page</a> at any time.
      </p>
    </article>
  );
}
