"use client";
import type { AnchorHTMLAttributes } from "react";

export function teamPageHref(team: string) {
  const params=new URLSearchParams(typeof window!=="undefined"?window.location.hash.split("?")[1]??"":"");
  params.set("team",team);for(const key of ["a","b","site","compare","awaySeason","awayWeek"])params.delete(key);
  return `#teams?${params}`;
}

export function TeamLink({ team, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { team: string }) {
  return <a {...props} href={teamPageHref(team)} aria-label={`Open ${team} team page`} data-team-link={team}
    onClick={(event) => {
      event.stopPropagation();
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      window.history.pushState(null, "", teamPageHref(team));
      window.dispatchEvent(new PopStateEvent("popstate"));
      window.scrollTo({ top: 0, behavior: "auto" });
    }}
    onKeyDown={(event) => event.stopPropagation()}>{children}</a>;
}
