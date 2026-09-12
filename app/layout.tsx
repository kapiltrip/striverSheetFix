import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recall — DSA practice",
  description: "Focused problem solving, spaced revision, and GitHub study backups.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
