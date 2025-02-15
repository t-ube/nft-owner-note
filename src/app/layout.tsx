import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/app/providers";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Owner Note",
  description: "Owner Note is a specialized management tool for XRPL (XRP Ledger) NFTs that enables users to link wallet addresses with owner names, track ownership statistics through rankings, and monitor NFT sales data with advanced filtering and sorting capabilities.",
  openGraph: {
    title: 'Owner Note',
    description: 'Owner Note is a specialized management tool for XRPL (XRP Ledger) NFTs that enables users to link wallet addresses with owner names, track ownership statistics through rankings, and monitor NFT sales data with advanced filtering and sorting capabilities.',
    images: [
      {
        url: 'https://owner-note.shirome.net/images/ogp.png',
        width: 1200,
        height: 630,
        alt: 'Owner Note Logo',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Owner Note',
    description: 'Owner Note is a specialized management tool for XRPL (XRP Ledger) NFTs that enables users to link wallet addresses with owner names, track ownership statistics through rankings, and monitor NFT sales data with advanced filtering and sorting capabilities.',
    images: ['https://owner-note.shirome.net/images/ogp.png'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
