"use client";

import { createContext, useContext } from "react";

const Ctx = createContext(false);

export function DemoProvider({ demo, children }: { demo: boolean; children: React.ReactNode }) {
  return <Ctx.Provider value={demo}>{children}</Ctx.Provider>;
}

/** Demo mode swaps posters and trailers for plain title cards (for videos and screenshots). */
export const useDemo = () => useContext(Ctx);
