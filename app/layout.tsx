import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.fxafitness.app"),

  title: {
    default: "FXA FITNESS",
    template: "%s | FXA FITNESS",
  },

  description:
    "FXA FITNESS client, trainer, and session management platform for private fitness coaching.",

  applicationName: "FXA FITNESS",

  keywords: [
    "FXA FITNESS",
    "fitness management",
    "gym session tracking",
    "personal training",
    "trainer dashboard",
    "client management",
    "QR session scanner",
  ],

  authors: [{ name: "FXA FITNESS" }],
  creator: "FXA FITNESS",
  publisher: "FXA FITNESS",

  icons: {
    icon: [
      {
        url: "/icon.png",
        type: "image/png",
        sizes: "512x512",
      },
      {
        url: "/favicon.ico",
        sizes: "any",
      },
    ],
    shortcut: "/icon.png",
    apple: [
      {
        url: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },

  manifest: "/manifest.webmanifest",

  appleWebApp: {
    capable: true,
    title: "FXA FITNESS",
    statusBarStyle: "black-translucent",
  },

  openGraph: {
    title: "FXA FITNESS",
    description:
      "A professional platform for managing fitness clients, trainers, QR session scans, memberships, and progress.",
    url: "https://www.fxafitness.app",
    siteName: "FXA FITNESS",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "FXA FITNESS",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "FXA FITNESS",
    description:
      "Client, trainer, and session management platform for FXA FITNESS.",
    images: ["/og-image.png"],
  },

  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#facc15",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full scroll-smooth antialiased`}
    >
      <body
        suppressHydrationWarning
        className="min-h-full bg-black text-white selection:bg-yellow-400 selection:text-black"
      >
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(250,204,21,0.16),_transparent_32%),linear-gradient(180deg,_#050505_0%,_#000000_45%,_#050505_100%)]">
          <div className="min-h-screen bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:48px_48px]">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}