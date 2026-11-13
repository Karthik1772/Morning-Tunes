import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "MorningTunes — Wake up to your music",
  description: "Your personal YouTube music alarm.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
