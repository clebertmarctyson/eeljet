import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/layout/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "EelJet - Deploy at Jet Speed",
    template: "%s | EelJet",
  },
  description:
    "Deploy your apps to custom subdomains in seconds. Connect your GitHub repo, pick a name, and go live with HTTPS.",
  keywords: [
    "deployment platform",
    "subdomain manager",
    "subdomain hosting",
    "app deployment",
    "CI/CD",
    "GitHub Actions",
    "HTTPS",
  ],
  authors: [{ name: "Marc Tyson Clebert" }],
  creator: "Marc Tyson Clebert",
  publisher: "EelJet",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://eeljet.com",
    siteName: "EelJet",
    title: "EelJet - Deploy at Jet Speed",
    description:
      "Deploy your apps to custom subdomains in seconds. Connect your GitHub repo, pick a name, and go live with HTTPS.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "EelJet - Deploy your projects, not your patience",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "EelJet - Deploy at Jet Speed",
    description:
      "Deploy your apps to custom subdomains in seconds. HTTPS included.",
    images: ["/twitter-image.png"],
    creator: "@marctysonclebert",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/site.webmanifest",
  metadataBase: new URL("https://eeljet.com"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
