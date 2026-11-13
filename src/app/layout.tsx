import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "MorningTunes — Wake up to your music", description: "Your personal YouTube music alarm." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
