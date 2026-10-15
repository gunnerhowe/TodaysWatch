"use client";

import { useEffect, useState } from "react";

/** A timestamp in the visitor's own time zone ("7:01 PM"), with "today"/"tomorrow" when helpful. */
export function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const d = new Date(iso);
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 86_400_000);
    const day = d.toDateString() === today.toDateString() ? "today" : d.toDateString() === tomorrow.toDateString() ? "tomorrow" : d.toLocaleDateString();
    setText(`${time} ${day}`);
  }, [iso]);
  // server render: a neutral fallback until the browser formats it in local time
  return <time dateTime={iso}>{text ?? "later today"}</time>;
}
