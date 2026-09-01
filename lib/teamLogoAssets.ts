export type TeamLogoVariant = "primary" | "helmet";

type TeamLogoAssets = {
  primary: string;
  helmet?: string;
};

/**
 * User-supplied team artwork from the connected CFB Logos Drive folder and
 * uploaded additions. Paths are keyed to the visible school mark because a
 * few legacy Drive filenames arrived in swapped or shifted groups.
 */
export const teamLogoAssets: Readonly<Record<string, TeamLogoAssets>> = {
  "Air Force": {
    "primary": "/team-logos/air-force.webp",
    "helmet": "/team-logos/air-force-helmet.webp"
  },
  "Akron": {
    "primary": "/team-logos/akron.webp",
    "helmet": "/team-logos/akron-helmet.webp"
  },
  "Alabama": {
    "primary": "/team-logos/alabama.webp",
    "helmet": "/team-logos/alabama-helmet.webp"
  },
  "App State": {
    "primary": "/team-logos/app-state.webp",
    "helmet": "/team-logos/app-state-helmet.webp"
  },
  "Arizona": {
    "primary": "/team-logos/arizona.webp",
    "helmet": "/team-logos/oklahoma-state-helmet.webp"
  },
  "Arizona State": {
    "primary": "/team-logos/iowa-state.webp",
    "helmet": "/team-logos/arizona-state-helmet.webp"
  },
  "Arkansas": {
    "primary": "/team-logos/arkansas.webp",
    "helmet": "/team-logos/arkansas-helmet.webp"
  },
  "Arkansas State": {
    "primary": "/team-logos/arkansas-state.webp",
    "helmet": "/team-logos/arkansas-state-helmet.webp"
  },
  "Army": {
    "primary": "/team-logos/army.webp",
    "helmet": "/team-logos/army-helmet.webp"
  },
  "Auburn": {
    "primary": "/team-logos/auburn.webp",
    "helmet": "/team-logos/auburn-helmet.webp"
  },
  "Ball State": {
    "primary": "/team-logos/ball-state.webp",
    "helmet": "/team-logos/ball-state-helmet.webp"
  },
  "Baylor": {
    "primary": "/team-logos/baylor.webp",
    "helmet": "/team-logos/baylor-helmet.webp"
  },
  "Boise State": {
    "primary": "/team-logos/boise-state.webp",
    "helmet": "/team-logos/boise-state-helmet.webp"
  },
  "Boston College": {
    "primary": "/team-logos/boston-college.webp",
    "helmet": "/team-logos/boston-college-helmet.webp"
  },
  "Bowling Green": {
    "primary": "/team-logos/bowling-green.webp",
    "helmet": "/team-logos/bowling-green-helmet.webp"
  },
  "Buffalo": {
    "primary": "/team-logos/buffalo.webp",
    "helmet": "/team-logos/buffalo-helmet.webp"
  },
  "BYU": {
    "primary": "/team-logos/byu.webp",
    "helmet": "/team-logos/byu-helmet.webp"
  },
  "California": {
    "primary": "/team-logos/california.webp",
    "helmet": "/team-logos/california-helmet.webp"
  },
  "Central Michigan": {
    "primary": "/team-logos/central-michigan.webp",
    "helmet": "/team-logos/central-michigan-helmet.webp"
  },
  "Charlotte": {
    "primary": "/team-logos/charlotte.webp",
    "helmet": "/team-logos/charlotte-helmet.webp"
  },
  "Cincinnati": {
    "primary": "/team-logos/tcu.webp",
    "helmet": "/team-logos/cincinnati-helmet.webp"
  },
  "Clemson": {
    "primary": "/team-logos/clemson.webp",
    "helmet": "/team-logos/clemson-helmet.webp"
  },
  "Coastal Carolina": {
    "primary": "/team-logos/coastal-carolina.webp",
    "helmet": "/team-logos/coastal-carolina-helmet.webp"
  },
  "Colorado": {
    "primary": "/team-logos/cincinnati.webp",
    "helmet": "/team-logos/colorado-helmet.webp"
  },
  "Colorado State": {
    "primary": "/team-logos/colorado-state.webp",
    "helmet": "/team-logos/colorado-state-helmet.webp"
  },
  "Delaware": {
    "primary": "/team-logos/delaware.webp",
    "helmet": "/team-logos/delaware-helmet.webp"
  },
  "Duke": {
    "primary": "/team-logos/duke.webp",
    "helmet": "/team-logos/duke-helmet.webp"
  },
  "East Carolina": {
    "primary": "/team-logos/east-carolina.webp",
    "helmet": "/team-logos/east-carolina-helmet.webp"
  },
  "Eastern Michigan": {
    "primary": "/team-logos/eastern-michigan.webp",
    "helmet": "/team-logos/eastern-michigan-helmet.webp"
  },
  "Florida": {
    "primary": "/team-logos/florida.webp",
    "helmet": "/team-logos/florida-helmet.webp"
  },
  "Florida Atlantic": {
    "primary": "/team-logos/florida-atlantic.webp",
    "helmet": "/team-logos/florida-atlantic-helmet.webp"
  },
  "Florida International": {
    "primary": "/team-logos/florida-international.webp",
    "helmet": "/team-logos/florida-international-helmet.webp"
  },
  "Florida State": {
    "primary": "/team-logos/florida-state.webp",
    "helmet": "/team-logos/florida-state-helmet.webp"
  },
  "Fresno State": {
    "primary": "/team-logos/fresno-state.webp",
    "helmet": "/team-logos/fresno-state-helmet.webp"
  },
  "Georgia": {
    "primary": "/team-logos/georgia.webp",
    "helmet": "/team-logos/georgia-helmet.webp"
  },
  "Georgia Southern": {
    "primary": "/team-logos/georgia-southern.webp",
    "helmet": "/team-logos/georgia-southern-helmet.webp"
  },
  "Georgia State": {
    "primary": "/team-logos/georgia-state.webp",
    "helmet": "/team-logos/georgia-state-helmet.webp"
  },
  "Georgia Tech": {
    "primary": "/team-logos/georgia-tech.webp",
    "helmet": "/team-logos/georgia-tech-helmet.webp"
  },
  "Hawai'i": {
    "primary": "/team-logos/hawai-i.webp",
    "helmet": "/team-logos/hawai-i-helmet.webp"
  },
  "Houston": {
    "primary": "/team-logos/colorado.webp",
    "helmet": "/team-logos/houston-helmet.webp"
  },
  "Illinois": {
    "primary": "/team-logos/illinois.webp",
    "helmet": "/team-logos/illinois-helmet.webp"
  },
  "Indiana": {
    "primary": "/team-logos/indiana.webp",
    "helmet": "/team-logos/indiana-helmet.webp"
  },
  "Iowa": {
    // The supplied primary files for Iowa and Michigan arrived with their
    // filenames reversed. Keep the manifest tied to the visible school mark.
    "primary": "/team-logos/michigan.webp",
    "helmet": "/team-logos/iowa-helmet.webp"
  },
  "Iowa State": {
    "primary": "/team-logos/houston.webp",
    "helmet": "/team-logos/iowa-state-helmet.webp"
  },
  "Jacksonville State": {
    "primary": "/team-logos/jacksonville-state.webp",
    "helmet": "/team-logos/jacksonville-state-helmet.webp"
  },
  "James Madison": {
    "primary": "/team-logos/james-madison.webp",
    "helmet": "/team-logos/james-madison-helmet.webp"
  },
  "Kansas": {
    "primary": "/team-logos/kansas.webp",
    "helmet": "/team-logos/kansas-helmet.webp"
  },
  "Kansas State": {
    "primary": "/team-logos/texas-tech.webp",
    "helmet": "/team-logos/kansas-state-helmet.webp"
  },
  "Kennesaw State": {
    "primary": "/team-logos/kennesaw-state.webp",
    "helmet": "/team-logos/kennesaw-state-helmet.webp"
  },
  "Kent State": {
    "primary": "/team-logos/kent-state.webp",
    "helmet": "/team-logos/kent-state-helmet.webp"
  },
  "Kentucky": {
    "primary": "/team-logos/kentucky.webp",
    "helmet": "/team-logos/kentucky-helmet.webp"
  },
  "Liberty": {
    "primary": "/team-logos/liberty.webp",
    "helmet": "/team-logos/liberty-helmet.webp"
  },
  "Louisiana": {
    "primary": "/team-logos/louisiana.webp",
    "helmet": "/team-logos/louisiana-helmet.webp"
  },
  "Louisiana Tech": {
    "primary": "/team-logos/louisiana-tech.webp",
    "helmet": "/team-logos/louisiana-tech-helmet.webp"
  },
  "Louisville": {
    "primary": "/team-logos/louisville.webp",
    "helmet": "/team-logos/louisville-helmet.webp"
  },
  "LSU": {
    "primary": "/team-logos/lsu.webp",
    "helmet": "/team-logos/lsu-helmet.webp"
  },
  "Marshall": {
    "primary": "/team-logos/marshall.webp",
    "helmet": "/team-logos/marshall-helmet.webp"
  },
  "Maryland": {
    "primary": "/team-logos/maryland.webp",
    "helmet": "/team-logos/maryland-helmet.webp"
  },
  "Massachusetts": {
    "primary": "/team-logos/massachusetts.webp",
    "helmet": "/team-logos/massachusetts-helmet.webp"
  },
  "Memphis": {
    "primary": "/team-logos/memphis.webp",
    "helmet": "/team-logos/memphis-helmet.webp"
  },
  "Miami": {
    "primary": "/team-logos/miami.webp",
    "helmet": "/team-logos/miami-helmet.webp"
  },
  "Miami (OH)": {
    "primary": "/team-logos/miami-oh.webp",
    "helmet": "/team-logos/miami-oh-helmet.webp"
  },
  "Michigan": {
    "primary": "/team-logos/iowa.webp",
    "helmet": "/team-logos/michigan-helmet.webp"
  },
  "Michigan State": {
    "primary": "/team-logos/michigan-state.webp",
    "helmet": "/team-logos/michigan-state-helmet.webp"
  },
  "Middle Tennessee": {
    "primary": "/team-logos/middle-tennessee.webp",
    "helmet": "/team-logos/middle-tennessee-helmet.webp"
  },
  "Minnesota": {
    "primary": "/team-logos/minnesota.webp",
    "helmet": "/team-logos/minnesota-helmet.webp"
  },
  "Mississippi State": {
    "primary": "/team-logos/mississippi-state.webp",
    "helmet": "/team-logos/mississippi-state-helmet.webp"
  },
  "Missouri": {
    "primary": "/team-logos/missouri.webp",
    "helmet": "/team-logos/missouri-helmet.webp"
  },
  "Missouri State": {
    "primary": "/team-logos/missouri-state.webp"
  },
  "Navy": {
    "primary": "/team-logos/navy.webp",
    "helmet": "/team-logos/navy-helmet.webp"
  },
  "NC State": {
    "primary": "/team-logos/nc-state.webp",
    "helmet": "/team-logos/nc-state-helmet.webp"
  },
  "Nebraska": {
    "primary": "/team-logos/nebraska.webp",
    "helmet": "/team-logos/nebraska-helmet.webp"
  },
  "Nevada": {
    "primary": "/team-logos/nevada.webp",
    "helmet": "/team-logos/nevada-helmet.webp"
  },
  "New Mexico": {
    "primary": "/team-logos/new-mexico.webp",
    "helmet": "/team-logos/new-mexico-helmet.webp"
  },
  "New Mexico State": {
    "primary": "/team-logos/new-mexico-state.webp",
    "helmet": "/team-logos/new-mexico-state-helmet.webp"
  },
  "North Carolina": {
    "primary": "/team-logos/north-carolina.webp",
    "helmet": "/team-logos/north-carolina-helmet.webp"
  },
  "North Dakota State": {
    "primary": "/team-logos/north-dakota-state.webp"
  },
  "North Texas": {
    "primary": "/team-logos/north-texas.webp",
    "helmet": "/team-logos/north-texas-helmet.webp"
  },
  "Northern Illinois": {
    "primary": "/team-logos/northern-illinois.webp",
    "helmet": "/team-logos/northern-illinois-helmet.webp"
  },
  "Northwestern": {
    "primary": "/team-logos/northwestern.webp",
    "helmet": "/team-logos/northwestern-helmet.webp"
  },
  "Notre Dame": {
    "primary": "/team-logos/notre-dame.webp",
    "helmet": "/team-logos/notre-dame-helmet.webp"
  },
  "Ohio": {
    "primary": "/team-logos/ohio.webp",
    "helmet": "/team-logos/ohio-helmet.webp"
  },
  "Ohio State": {
    "primary": "/team-logos/ohio-state.webp",
    "helmet": "/team-logos/ohio-state-helmet.webp"
  },
  "Oklahoma": {
    "primary": "/team-logos/oklahoma.webp",
    "helmet": "/team-logos/oklahoma-helmet.webp"
  },
  "Oklahoma State": {
    "primary": "/team-logos/oklahoma-state.webp",
    "helmet": "/team-logos/ucf-helmet.webp"
  },
  "Old Dominion": {
    "primary": "/team-logos/old-dominion.webp",
    "helmet": "/team-logos/old-dominion-helmet.webp"
  },
  "Ole Miss": {
    "primary": "/team-logos/ole-miss.webp",
    "helmet": "/team-logos/ole-miss-helmet.webp"
  },
  "Oregon": {
    "primary": "/team-logos/oregon.webp",
    "helmet": "/team-logos/oregon-helmet.webp"
  },
  "Oregon State": {
    "primary": "/team-logos/oregon-state.webp",
    "helmet": "/team-logos/oregon-state-helmet.webp"
  },
  "Penn State": {
    "primary": "/team-logos/penn-state.webp",
    "helmet": "/team-logos/penn-state-helmet.webp"
  },
  "Pittsburgh": {
    "primary": "/team-logos/pittsburgh.webp",
    "helmet": "/team-logos/pittsburgh-helmet.webp"
  },
  "Purdue": {
    "primary": "/team-logos/purdue.webp",
    "helmet": "/team-logos/purdue-helmet.webp"
  },
  "Rice": {
    "primary": "/team-logos/rice.webp",
    "helmet": "/team-logos/rice-helmet.webp"
  },
  "Rutgers": {
    "primary": "/team-logos/rutgers.webp",
    "helmet": "/team-logos/rutgers-helmet.webp"
  },
  "Sacramento State": {
    "primary": "/team-logos/sacramento-state.webp"
  },
  "Sam Houston": {
    "primary": "/team-logos/sam-houston.webp",
    "helmet": "/team-logos/sam-houston-helmet.webp"
  },
  "San Diego State": {
    "primary": "/team-logos/san-diego-state.webp",
    "helmet": "/team-logos/san-diego-state-helmet.webp"
  },
  "San José State": {
    "primary": "/team-logos/san-jose-state.webp"
  },
  "SMU": {
    "primary": "/team-logos/smu.webp",
    "helmet": "/team-logos/smu-helmet.webp"
  },
  "South Alabama": {
    "primary": "/team-logos/south-alabama.webp",
    "helmet": "/team-logos/south-alabama-helmet.webp"
  },
  "South Carolina": {
    "primary": "/team-logos/south-carolina.webp",
    "helmet": "/team-logos/south-carolina-helmet.webp"
  },
  "South Florida": {
    "primary": "/team-logos/south-florida.webp",
    "helmet": "/team-logos/south-florida-helmet.webp"
  },
  "Southern Miss": {
    "primary": "/team-logos/southern-miss.webp"
  },
  "Stanford": {
    "primary": "/team-logos/stanford.webp",
    "helmet": "/team-logos/stanford-helmet.webp"
  },
  "Syracuse": {
    "primary": "/team-logos/syracuse.webp",
    "helmet": "/team-logos/syracuse-helmet.webp"
  },
  "TCU": {
    "primary": "/team-logos/kansas-state.webp",
    "helmet": "/team-logos/tcu-helmet.webp"
  },
  "Temple": {
    "primary": "/team-logos/temple.webp",
    "helmet": "/team-logos/temple-helmet.webp"
  },
  "Tennessee": {
    "primary": "/team-logos/tennessee.webp",
    "helmet": "/team-logos/tennessee-helmet.webp"
  },
  "Texas": {
    "primary": "/team-logos/texas.webp",
    "helmet": "/team-logos/texas-helmet.webp"
  },
  "Texas A&M": {
    "primary": "/team-logos/texas-aandm.webp",
    "helmet": "/team-logos/texas-aandm-helmet.webp"
  },
  "Texas State": {
    "primary": "/team-logos/texas-state.webp",
    "helmet": "/team-logos/texas-state-helmet.webp"
  },
  "Texas Tech": {
    "primary": "/team-logos/utah.webp",
    "helmet": "/team-logos/texas-tech-helmet.webp"
  },
  "Toledo": {
    "primary": "/team-logos/toledo.webp",
    "helmet": "/team-logos/toledo-helmet.webp"
  },
  "Troy": {
    "primary": "/team-logos/troy.webp",
    "helmet": "/team-logos/troy-helmet.webp"
  },
  "Tulane": {
    "primary": "/team-logos/tulane.webp",
    "helmet": "/team-logos/tulane-helmet.webp"
  },
  "Tulsa": {
    "primary": "/team-logos/tulsa.webp",
    "helmet": "/team-logos/tulsa-helmet.webp"
  },
  "UAB": {
    "primary": "/team-logos/uab.webp",
    "helmet": "/team-logos/uab-helmet.webp"
  },
  "UCF": {
    "primary": "/team-logos/ucf.webp",
    "helmet": "/team-logos/arizona-helmet.webp"
  },
  "UCLA": {
    "primary": "/team-logos/ucla.webp",
    "helmet": "/team-logos/ucla-helmet.webp"
  },
  "UConn": {
    "primary": "/team-logos/uconn.webp",
    "helmet": "/team-logos/uconn-helmet.webp"
  },
  "UL Monroe": {
    "primary": "/team-logos/ul-monroe.webp",
    "helmet": "/team-logos/ul-monroe-helmet.webp"
  },
  "UNLV": {
    "primary": "/team-logos/unlv.webp",
    "helmet": "/team-logos/unlv-helmet.webp"
  },
  "USC": {
    "primary": "/team-logos/usc.webp",
    "helmet": "/team-logos/usc-helmet.webp"
  },
  "Utah": {
    "primary": "/team-logos/arizona-state.webp",
    "helmet": "/team-logos/utah-helmet.webp"
  },
  "Utah State": {
    "primary": "/team-logos/utah-state.webp",
    "helmet": "/team-logos/utah-state-helmet.webp"
  },
  "UTEP": {
    "primary": "/team-logos/utep.webp",
    "helmet": "/team-logos/utep-helmet.webp"
  },
  "UTSA": {
    "primary": "/team-logos/utsa.webp"
  },
  "Vanderbilt": {
    "primary": "/team-logos/vanderbilt.webp",
    "helmet": "/team-logos/vanderbilt-helmet.webp"
  },
  "Virginia": {
    "primary": "/team-logos/virginia.webp",
    "helmet": "/team-logos/virginia-helmet.webp"
  },
  "Virginia Tech": {
    "primary": "/team-logos/virginia-tech.webp",
    "helmet": "/team-logos/virginia-tech-helmet.webp"
  },
  "Wake Forest": {
    "primary": "/team-logos/wake-forest.webp",
    "helmet": "/team-logos/wake-forest-helmet.webp"
  },
  "Washington": {
    "primary": "/team-logos/washington.webp",
    "helmet": "/team-logos/washington-helmet.webp"
  },
  "Washington State": {
    "primary": "/team-logos/washington-state.webp",
    "helmet": "/team-logos/washington-state-helmet.webp"
  },
  "West Virginia": {
    "primary": "/team-logos/west-virginia.webp",
    "helmet": "/team-logos/west-virginia-helmet.webp"
  },
  "Western Kentucky": {
    "primary": "/team-logos/western-kentucky.webp",
    "helmet": "/team-logos/western-kentucky-helmet.webp"
  },
  "Western Michigan": {
    "primary": "/team-logos/western-michigan.webp",
    "helmet": "/team-logos/western-michigan-helmet.webp"
  },
  "Wisconsin": {
    "primary": "/team-logos/wisconsin.webp",
    "helmet": "/team-logos/wisconsin-helmet.webp"
  },
  "Wyoming": {
    "primary": "/team-logos/wyoming.webp",
    "helmet": "/team-logos/wyoming-helmet.webp"
  }
};

const teamLogoAliases: Readonly<Record<string, string>> = {
  "Appalachian State": "App State",
  Cal: "California",
  FIU: "Florida International",
  "Florida Intl": "Florida International",
  Hawaii: "Hawai'i",
  "Louisiana-Lafayette": "Louisiana",
  "Louisiana Monroe": "UL Monroe",
  "Louisiana-Monroe": "UL Monroe",
  "Miami Ohio": "Miami (OH)",
  "Missouri St": "Missouri State",
  "Missouri St.": "Missouri State",
  NDSU: "North Dakota State",
  "North Dakota St": "North Dakota State",
  "North Dakota St.": "North Dakota State",
  Pitt: "Pittsburgh",
  "Sacramento St": "Sacramento State",
  "Sacramento St.": "Sacramento State",
  "San Jose State": "San José State",
  "Southern Mississippi": "Southern Miss",
  UMass: "Massachusetts",
  ULM: "UL Monroe",
};

export function resolveTeamLogoAsset(name: string, variant: TeamLogoVariant = "primary") {
  const withoutSeason = name.replace(/^\d{4}\s+/, "").trim();
  const canonical = teamLogoAliases[withoutSeason] ?? withoutSeason;
  const assets = teamLogoAssets[canonical];
  if (!assets) return undefined;
  return variant === "helmet" ? assets.helmet ?? assets.primary : assets.primary;
}

export const driveLogoCoverage = {
  missingPrimary: [],
  missingHelmet: ["Missouri State", "North Dakota State", "Sacramento State", "San José State", "Southern Miss", "UTSA"],
} as const;
