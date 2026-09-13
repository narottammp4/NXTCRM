import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NxtCall | Real Estate CRM",
  description: "Manage real-estate leads, calls, follow-ups and site visits.",
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
