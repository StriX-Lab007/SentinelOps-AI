import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SentinelOps AI — Autonomous Incident Intelligence",
  description: "Raycast-inspired autonomous incident investigation and operational reasoning system.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="h-full overflow-hidden bg-[#0B0B0C] text-[#E5E2E1] selection:bg-[rgba(168,162,255,0.25)] selection:text-[#A8A2FF]">
        {children}
      </body>
    </html>
  );
}
