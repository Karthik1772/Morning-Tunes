"use client";

import dynamic from "next/dynamic";

const MorningTunes = dynamic(() => import("@/components/MorningTunes"), {
  ssr: false,
  loading: () => <main className="shell"><p className="muted">Loading MorningTunes…</p></main>,
});

export default function MorningTunesLoader() {
  return <MorningTunes />;
}
