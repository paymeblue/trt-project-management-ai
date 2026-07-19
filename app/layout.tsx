import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import TabSessionProvider from "@/app/_components/tab-session-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TRT Arredo — Project Management",
  description: "Industrial precision in architectural logistics.",
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
      className={`${inter.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <head>
        {/* Apply the saved theme before hydration to avoid a flash. Uses
            next/script so React 19 doesn't flag a raw inline <script>. */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
        {/* Per-tab session pre-paint bounce (Phase 20.1). A native navigation
            (hard refresh, typed URL) can never carry this tab's Authorization
            header, so the server just rendered the SHARED cookie's user. If
            this tab holds a per-tab token, bounce to the identity-agnostic
            restore route BEFORE first paint — inline in the document so it is
            always current and immune to hydration failures (e.g. from
            DOM-mutating browser extensions), stale client bundles, and React
            timing. TabSessionProvider keeps an effect-time fallback. */}
        <Script
          id="tab-session-prepaint-bounce"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(!sessionStorage.getItem('tabAccessToken'))return;if(location.pathname==='/tab-session/restore')return;location.replace('/tab-session/restore?to='+encodeURIComponent(location.pathname+location.search))}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full">
        {/* React 19 hoists this stylesheet link into <head> */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
        {/* Reveal icons (replacing the skeleton) once the Material Symbols font
            is loaded. Timeout fallback so icons never stay hidden. */}
        <Script id="fonts-ready" strategy="afterInteractive">
          {`(function(){var d=document.documentElement;function r(){d.classList.add('fonts-ready')}try{if(document.fonts&&document.fonts.load){var t=setTimeout(r,3000);document.fonts.load('1em "Material Symbols Outlined"').then(function(){clearTimeout(t);r()}).catch(function(){clearTimeout(t);r()})}else{r()}}catch(e){r()}})()`}
        </Script>
        <TabSessionProvider>{children}</TabSessionProvider>
      </body>
    </html>
  );
}
