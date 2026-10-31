import {DataProviders} from "./components/DataProviders";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./interface.css";
import "./mobile-layout.css";
import "./score-rushing.css";
import "./shell-refresh.css";
import "./weekly-newspaper.css";
import "./compact-surfaces.css";
import "./net-success-rate.css";
import "./site-typography.css";
import "./food-chain.css";
import "./team-density.css";
import "./stats-density.css";
import "./leaderboard-density.css";
import "./what-if-density.css";
import "./matchup-controls.css";
import "./matchup-hub.css";
import "./defensive-keys.css";
import "./efficiency.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Harper+ College Football Model",
  description: "Model-based college football rankings, matchup projections, weekly team profiles and historical analysis.",
  icons: {
    icon: [
      { url: "/harper-football.svg", type: "image/svg+xml" },
      { url: "/favicon.ico?v=23", sizes: "any" },
    ],
    shortcut: "/favicon.ico?v=23",
    apple: "/apple-touch-icon.png?v=23",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
};

const themeInitializer = `(() => {
  try {
    const saved = localStorage.getItem("harper-plus-theme");
    const theme = saved === "light" || saved === "dark"
      ? saved
      : matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#eeeae0" : "#0b0c0a");
  } catch {
    document.documentElement.dataset.theme = "dark";
  }
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0b0c0a" />
        <script id="theme-initializer" dangerouslySetInnerHTML={{ __html: themeInitializer }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <DataProviders>{children}</DataProviders>
      </body>
    </html>
  );
}
