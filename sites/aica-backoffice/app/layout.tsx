import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AICA 백오피스",
  description: "인공지능사관학교 사이트와 콘텐츠 관리",
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
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
