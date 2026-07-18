import type { Metadata } from "next";
import { Outfit, Geist_Mono } from "next/font/google";
import { PreviewPlayerProvider } from "@/components/PreviewPlayer";
import { Sidebar } from "@/components/Sidebar";
import { TrackMenuProvider } from "@/components/TrackMenu";
import { VersionUpdateBanner } from "@/components/VersionUpdateBanner";
import "./globals.css";

// Outfit — geometric, rounded sans in the same family as Spotify's Circular.
// Single font family across the UI; heavier weights cover the headings.
const outfit = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Audioseerr",
  description: "Discovery-first request manager for Lidarr.",
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
      className={`${outfit.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex font-sans">
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("audioseerr.sidebar.collapsed")==="true")document.documentElement.classList.add("sidebar-collapsed")}catch(e){}`,
          }}
        />
        <PreviewPlayerProvider>
          <TrackMenuProvider>
            <Sidebar />
            <div
              className="flex min-h-screen flex-1 flex-col transition-[padding-bottom] duration-200"
              style={{
                paddingBottom: "var(--preview-player-bottom-offset, 0px)",
              }}
            >
              <VersionUpdateBanner />
              {children}
            </div>
          </TrackMenuProvider>
        </PreviewPlayerProvider>
      </body>
    </html>
  );
}
