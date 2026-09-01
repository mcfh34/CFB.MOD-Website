export const POWER_4_FILTER = "POWER_4";
export const POWER_4_LABEL = "Power 4";
export const POWER_4_CONFERENCES = ["ACC", "Big 12", "Big Ten", "SEC"] as const;

const powerFourConferenceSet = new Set<string>(POWER_4_CONFERENCES);

export function isPowerFourConference(conference:string|null|undefined) {
  return Boolean(conference && powerFourConferenceSet.has(conference));
}

export function matchesConferenceFilter(
  conference:string|null|undefined,
  filter:string|null|undefined,
  allValues:readonly string[]=["", "ALL"],
) {
  if (!filter || allValues.includes(filter)) return true;
  return filter === POWER_4_FILTER ? isPowerFourConference(conference) : conference === filter;
}

export function conferenceFilterSqlValues(filter:string) {
  return filter === POWER_4_FILTER ? [...POWER_4_CONFERENCES] : filter ? [filter] : [];
}

export function conferenceFilterDisplay(filter:string, allLabel="All conferences") {
  if (!filter || filter === "ALL") return allLabel;
  return filter === POWER_4_FILTER ? POWER_4_LABEL : filter;
}
