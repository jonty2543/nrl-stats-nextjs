import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { Analytics } from "@vercel/analytics/next";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function publicSupabaseOrigin(): string | null {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : null;
  } catch {
    return null;
  }
}

export const metadata: Metadata = {
  title: "Short Side NRL",
  description: "NRL player and team statistics dashboard",
  openGraph: {
    title: "Short Side NRL",
    description: "NRL player and team statistics dashboard",
    url: "https://shortsidenrl.com",
    siteName: "Short Side NRL",
  },
  twitter: {
    card: "summary",
    title: "Short Side NRL",
    description: "NRL player and team statistics dashboard",
  },
  icons: {
    icon: "/app-icon.svg",
    shortcut: "/app-icon.svg",
    apple: [
      {
        url: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabaseOrigin = publicSupabaseOrigin();

  return (
    <ClerkProvider appearance={{ baseTheme: dark }}>
      <html lang="en" data-theme="dark" suppressHydrationWarning>
        {supabaseOrigin ? (
          <head>
            <link rel="dns-prefetch" href={supabaseOrigin} />
            <link rel="preconnect" href={supabaseOrigin} />
          </head>
        ) : null}
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <Providers>{children}</Providers>
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
