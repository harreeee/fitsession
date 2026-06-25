import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
    default: "FXA FITNESS",
    template: "%s | FXA FITNESS",
  },
  description: "FXA FITNESS gym session management system.",
  applicationName: "FXA FITNESS",
  appleWebApp: {
    capable: true,
    title: "FXA FITNESS",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#facc15",
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
  className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
>
  <body
    suppressHydrationWarning
    className="min-h-full bg-black text-white"
  >
    {children}
  </body>
</html>
  );
}