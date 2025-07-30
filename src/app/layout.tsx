import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/app/providers";
import { Tracker } from "@/app/components/Tracker";

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
  description: "A management tool for XRPL NFTs - Easily track owners, monitor sales, and view statistics for XRP Ledger NFTs.",
  openGraph: {
    title: 'Owner Note',
    description: 'A management tool for XRPL NFTs - Easily track owners, monitor sales, and view statistics for XRP Ledger NFTs.',
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
    description: 'A management tool for XRPL NFTs - Easily track owners, monitor sales, and view statistics for XRP Ledger NFTs.',
    images: ['https://owner-note.shirome.net/images/ogp.png'],
  },
  icons: {
    icon: [
      { url: '/images/favicon/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/images/favicon/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/images/favicon/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/images/favicon/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [
      { url: '/images/favicon/apple-touch-icon.png' },
    ],
    shortcut: [{ url: "/images/favicon/favicon.ico" }],
  }
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
        <Tracker />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
