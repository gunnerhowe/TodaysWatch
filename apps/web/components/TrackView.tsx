"use client";

import { useEffect } from "react";
import { track, trackVisit, type EventType } from "@/lib/track";

/** Sends one view event after the page loads, plus the return-visit check. Renders nothing. */
export function TrackView({ type, groupCode }: { type: EventType; groupCode?: string }) {
  useEffect(() => {
    trackVisit();
    track(type, groupCode ? { groupCode } : {});
  }, [type, groupCode]);
  return null;
}
