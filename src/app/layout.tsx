import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NutriAdvisor — AI Помощник по питанию",
  description:
    "Персональный AI-ассистент для коррекции питания. Анализ еды по фото, рекомендации по целям, трекинг питания. Все данные хранятся локально.",
  keywords: [
    "NutriAdvisor", "питание", "диета", "AI", "нутрициолог",
    "здоровое питание", "похудение", "набор массы", "трекинг питания",
  ],
  authors: [{ name: "NutriAdvisor" }],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "NutriAdvisor — AI Помощник по питанию",
    description: "Персональный AI-ассистент для коррекции питания",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
 themeColor: "#059669",
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('nutri-theme')||'system',d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme:dark)').matches),r=document.documentElement;if(d)r.classList.add('dark');var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute('content',d?'#171717':'#059669')}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
