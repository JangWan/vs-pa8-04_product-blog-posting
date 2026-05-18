import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@/lib/providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "IndiePost AI — AI 블로그 콘텐츠 자동 작성",
  description:
    "주제만 입력하면 브랜드 지침 + SEO 최적화된 마크다운 초안을 스트리밍으로 생성합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ClerkProvider taskUrls={{ "choose-organization": "/select-org" }}>
          <Providers>{children}</Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
