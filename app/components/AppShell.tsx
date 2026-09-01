"use client";
/* eslint-disable @next/next/no-img-element -- the brand mark is a local static asset */

import { useEffect, useState, type ReactNode } from "react";

export type Section =
  | "overview"
  | "rankings"
  | "standings"
  | "matchup"
  | "whatif"
  | "all137"
  | "stats"
  | "visualize"
  | "playerstats"
  | "schedule"
  | "teams"
  | "players"
  | "depth"
  | "methodology";

type RefreshState = "idle" | "running" | "done" | "error";
type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "harper-plus-theme";
const THEME_COLORS: Record<ThemeMode, string> = {
  light: "#eeeae0",
  dark: "#0b0c0a",
};

type NavItem = {
  id: Section;
  label: string;
  shortLabel: string;
  mark: string;
  group: "Home" | "Game Day" | "Rankings" | "Research";
  description: string;
};

export const navigation: NavItem[] = [
  { id:"overview",label:"Home",shortLabel:"Home",mark:"H+",group:"Home",description:"Every Harper+ tool in one place" },
  { id:"schedule",label:"Scores",shortLabel:"Scores",mark:"14",group:"Game Day",description:"Finals, lines, and Season Sim ranks" },
  { id:"matchup",label:"Matchup Lab",shortLabel:"Matchup",mark:"VS",group:"Game Day",description:"Compare teams and game plans" },
  { id:"whatif",label:"What If",shortLabel:"What If",mark:"?",group:"Game Day",description:"Season Sim and alternate season paths" },
  { id:"rankings",label:"Rankings",shortLabel:"Rankings",mark:"25",group:"Rankings",description:"Results-only order entering each week" },
  { id:"standings",label:"Standings",shortLabel:"Standings",mark:"W/L",group:"Rankings",description:"Conference tables and official tiebreak order" },
  { id:"all137",label:"All137",shortLabel:"All137",mark:"137",group:"Rankings",description:"Every FBS team and era" },
  { id:"stats",label:"Stats",shortLabel:"Stats",mark:"ST",group:"Research",description:"Team and player leaderboards" },
  { id:"visualize",label:"Visualize",shortLabel:"Plots",mark:"XY",group:"Research",description:"Build team and player scatterplots" },
  { id:"teams",label:"Team Pages",shortLabel:"Teams",mark:"TM",group:"Research",description:"Schedules, stats, and depth charts" },
  { id:"players",label:"Player Ratings",shortLabel:"Players",mark:"99",group:"Research",description:"Production grades by player" },
  { id:"methodology",label:"Accuracy History",shortLabel:"Accuracy",mark:"%",group:"Research",description:"ATS, total, and winner results by season" },
];

const primaryMobileSections: Section[] = ["schedule", "rankings", "stats"];

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`app-brand ${compact ? "compact" : ""}`}>
      <span className="app-brand-mark" aria-hidden="true"><img src="/harper-football.svg" alt="" /></span>
      <span className="app-brand-copy"><strong>HARPER+</strong><small>COLLEGE FOOTBALL MODEL</small></span>
    </span>
  );
}

function ThemeToggle({ theme, onToggle }: { theme: ThemeMode; onToggle: () => void }) {
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className="app-theme-toggle"
      data-theme-mode={theme}
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      onClick={onToggle}
    >
      <span className="app-theme-toggle-track" aria-hidden="true">
        <span className="app-theme-toggle-thumb" />
        <svg className="app-theme-icon app-theme-icon-light" viewBox="0 0 24 24" focusable="false">
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
        </svg>
        <svg className="app-theme-icon app-theme-icon-dark" viewBox="0 0 24 24" focusable="false">
          <path d="M20 15.1A8.2 8.2 0 0 1 8.9 4a8.3 8.3 0 1 0 11.1 11.1Z" />
        </svg>
      </span>
      <span className="app-theme-toggle-label">{nextTheme}</span>
    </button>
  );
}

function NavigationButton({
  item,
  active,
  onNavigate,
  compact = false,
  top = false,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: (section: Section) => void;
  compact?: boolean;
  top?: boolean;
}) {
  return (
    <button
      type="button"
      className={`${active ? "active" : ""}${compact ? " app-mobile-primary-button" : ""}${top ? " app-top-navigation-button" : ""}`.trim()}
      aria-current={active ? "page" : undefined}
      onClick={() => onNavigate(item.id)}
    >
      {!compact && !top ? <span className="app-nav-mark" aria-hidden="true">{item.mark}</span> : null}
      <span>
        <strong>{compact || top ? item.shortLabel : item.label}</strong>
        {!compact && !top ? <small>{item.description}</small> : null}
      </span>
    </button>
  );
}

export function AppShell({
  section,
  season,
  week,
  gamesTracked,
  refreshState,
  refreshMessage,
  onNavigate,
  onRefresh,
  archiveStatus,
  children,
}: {
  section: Section;
  season: number;
  week: number;
  gamesTracked: number | null;
  refreshState: RefreshState;
  refreshMessage: string;
  onNavigate: (section: Section) => void;
  onRefresh: () => void;
  archiveStatus: ReactNode;
  children: ReactNode;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const activeItem = navigation.find((item) => item.id === section) ?? navigation[0];
  const secondaryMobileNavigation = navigation.filter((item) => !primaryMobileSections.includes(item.id));
  const moreActive = secondaryMobileNavigation.some((item) => item.id === section);

  useEffect(() => {
    if (!moreOpen) return;
    const previousOverflow = document.body.style.overflow;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", close);
    };
  }, [moreOpen]);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: light)");

    const applyTheme = (nextTheme: ThemeMode) => {
      root.dataset.theme = nextTheme;
      root.style.colorScheme = nextTheme;
      setTheme(nextTheme);
      document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[nextTheme]);
    };

    const initialTheme = root.dataset.theme === "light" ? "light" : "dark";
    applyTheme(initialTheme);

    const followSystemTheme = (event: MediaQueryListEvent) => {
      try {
        if (window.localStorage.getItem(THEME_STORAGE_KEY)) return;
      } catch {
        // Storage can be unavailable in privacy-restricted browsers; system preference remains usable.
      }
      applyTheme(event.matches ? "light" : "dark");
    };

    media.addEventListener("change", followSystemTheme);
    return () => media.removeEventListener("change", followSystemTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[nextTheme]);
    setTheme(nextTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The active page still changes theme even when storage is unavailable.
    }
  };

  const navigate = (nextSection: Section) => {
    setMoreOpen(false);
    onNavigate(nextSection);
  };

  return (
    <div className={`app-frame ${section === "overview" ? "home-active" : ""}`}>
      <header className="main-header app-desktop-header">
        <button className="app-desktop-brand" type="button" onClick={() => navigate("overview")} aria-label="Harper Plus home">
          <Brand />
        </button>

        <nav id="primary-navigation" aria-label="Main navigation">
          {navigation.map((item) => (
            <NavigationButton key={item.id} item={item} active={section === item.id} onNavigate={navigate} top />
          ))}
        </nav>

        <section className="app-desktop-status" aria-label="Model status">
          <span><small>{season}</small><b>W{week}</b></span>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button type="button" className={refreshState} onClick={onRefresh} disabled={refreshState === "running"}>
            <span aria-hidden="true">↻</span><span className="app-desktop-refresh-label">{refreshState === "running" ? "Checking…" : "Refresh"}</span>
          </button>
        </section>
      </header>

      <header className="app-mobile-header">
        <button type="button" onClick={() => navigate("overview")} aria-label="Harper Plus home"><Brand compact /></button>
        <div>
          <small>{activeItem.group}</small>
          <strong>{activeItem.label}</strong>
        </div>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <span className="app-vintage-chip"><small>{season}</small><b>W{week}</b></span>
      </header>

      <div className="app-workspace">
        {section !== "overview" ? <section className="app-context-bar" aria-label="Current model context">
          <div><span className={`status-light ${refreshState}`} /><strong>{refreshMessage}</strong></div>
          <span>{season} WEEK {week}</span>
          <span>{gamesTracked === null ? "…" : gamesTracked.toLocaleString()} GAMES</span>
          <button type="button" onClick={onRefresh} disabled={refreshState === "running"}>
            {refreshState === "running" ? "CHECKING" : "CHECK DATA"}
          </button>
        </section> : null}
        {section !== "overview" ? <div className="app-background-maintenance" aria-hidden="true">{archiveStatus}</div> : null}
        <div className="app-page-slot">{children}</div>
      </div>

      <nav className="app-mobile-tabs" aria-label="Primary mobile navigation">
        {primaryMobileSections.map((id) => {
          const item = navigation.find((candidate) => candidate.id === id)!;
          return <NavigationButton key={id} item={item} active={section === id} onNavigate={navigate} compact />;
        })}
        <button
          type="button"
          className={moreOpen || moreActive ? "active" : ""}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-menu"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <span className="app-nav-mark" aria-hidden="true">•••</span>
          <span><strong>More</strong></span>
        </button>
      </nav>

      {moreOpen ? (
        <div className="app-more-layer">
          <button className="app-more-scrim" type="button" onClick={() => setMoreOpen(false)} aria-label="Close navigation" />
          <section id="mobile-more-menu" className="app-more-sheet" role="dialog" aria-modal="true" aria-label="More Harper Plus tools">
            <header>
              <div><small>HARPER+ TOOLS</small><strong>Explore the model</strong></div>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close navigation">×</button>
            </header>
            <nav>
              {secondaryMobileNavigation.map((item) => (
                <NavigationButton key={item.id} item={item} active={section === item.id} onNavigate={navigate} />
              ))}
            </nav>
            <footer>
              <div><span className={`status-light ${refreshState}`} /><span><strong>{season} · WEEK {week}</strong><small>{refreshMessage}</small></span></div>
              <button type="button" onClick={onRefresh} disabled={refreshState === "running"}>
                {refreshState === "running" ? "Checking…" : "Check data"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
