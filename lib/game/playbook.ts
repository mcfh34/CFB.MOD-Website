import type {
  DefensePlayId,
  OffensePlayId,
  PlayDefinition,
} from "./types";

export const OFFENSE_PLAYS: ReadonlyArray<PlayDefinition<OffensePlayId>> = [
  {
    id: "run",
    code: "RUN",
    name: "RUN",
    description: "Ground Game",
    family: "run",
    risk: "low",
  },
  {
    id: "stick",
    code: "STK",
    name: "STICK",
    description: "Quick Game",
    family: "pass",
    risk: "low",
  },
  {
    id: "mesh",
    code: "MSH",
    name: "MESH",
    description: "Intermediate",
    family: "pass",
    risk: "medium",
  },
  {
    id: "four-verts",
    code: "4V",
    name: "FOUR VERTS",
    description: "Vertical",
    family: "pass",
    risk: "high",
  },
];

/** Kept only to migrate rooms created before the four-concept arcade playbook. */
const LEGACY_OFFENSE_PLAYS: ReadonlyArray<PlayDefinition<OffensePlayId>> = [
  { id: "inside-zone", code: "IZ", name: "Inside Zone", description: "Legacy run call.", family: "run", risk: "low" },
  { id: "power", code: "PWR", name: "Power", description: "Legacy run call.", family: "run", risk: "low" },
  { id: "outside-zone", code: "OZ", name: "Outside Zone", description: "Legacy run call.", family: "run", risk: "medium" },
  { id: "counter", code: "CTR", name: "Counter", description: "Legacy run call.", family: "run", risk: "medium" },
  {
    id: "rpo",
    code: "RPO",
    name: "Run-Pass Option",
    description: "Read the box after the snap; modest upside both ways.",
    family: "option",
    risk: "medium",
  },
  {
    id: "quick-pass",
    code: "QK",
    name: "Quick Game",
    description: "Short rhythm throw designed to beat soft coverage.",
    family: "pass",
    risk: "low",
  },
  {
    id: "dropback",
    code: "DB",
    name: "Dropback Pass",
    description: "Full-field progression with greater sack and turnover risk.",
    family: "pass",
    risk: "high",
  },
  {
    id: "play-action",
    code: "PA",
    name: "Play Action",
    description: "Attack behind defenders who are fitting the run.",
    family: "pass",
    risk: "high",
  },
  {
    id: "screen",
    code: "SCR",
    name: "Screen",
    description: "Invite pressure, then release blockers into space.",
    family: "pass",
    risk: "medium",
  },
];

export const SPECIAL_OFFENSE_PLAYS: ReadonlyArray<
  PlayDefinition<OffensePlayId>
> = [
  {
    id: "punt",
    code: "PUNT",
    name: "Punt",
    description: "Trade possession for field position.",
    family: "special",
    risk: "low",
  },
  {
    id: "field-goal",
    code: "FG",
    name: "Field Goal",
    description: "Attempt three points from the current spot.",
    family: "special",
    risk: "medium",
  },
  {
    id: "kneel",
    code: "KNEEL",
    name: "Victory Kneel",
    description: "Protect the lead and keep the clock moving late in a half.",
    family: "special",
    risk: "low",
  },
  {
    id: "spike",
    code: "SPIKE",
    name: "Clock Spike",
    description: "Sacrifice a down to stop the clock in a late scoring drive.",
    family: "special",
    risk: "low",
  },
];

export const CONVERSION_OFFENSE_PLAYS: ReadonlyArray<PlayDefinition<OffensePlayId>> = [
  {
    id: "extra-point",
    code: "XP",
    name: "Extra Point",
    description: "Kick from the 3-yard line for one point.",
    family: "special",
    risk: "low",
  },
  {
    id: "two-point",
    code: "2PT",
    name: "Go for Two",
    description: "Run an offensive play from the 3-yard line for two points.",
    family: "special",
    risk: "high",
  },
];

export const CONVERSION_DEFENSE_PLAYS: ReadonlyArray<PlayDefinition<DefensePlayId>> = [
  {
    id: "kick-block",
    code: "BLK",
    name: "Kick Block",
    description: "Pressure the kick; vulnerable if the offense goes for two.",
    family: "pressure",
    risk: "high",
  },
  {
    id: "goal-line-defense",
    code: "GL",
    name: "Goal-Line Defense",
    description: "Defend a two-point try; concede a clean extra-point kick.",
    family: "coverage",
    risk: "medium",
  },
];

export const KICK_RETURN_PLAYS: ReadonlyArray<PlayDefinition<OffensePlayId>> = [
  {
    id: "kick-return-left",
    code: "KRL",
    name: "Return Left",
    description: "Build the return toward the left sideline.",
    family: "special",
    risk: "medium",
  },
  {
    id: "kick-return-middle",
    code: "KRM",
    name: "Return Middle",
    description: "Hit the return crease straight ahead.",
    family: "special",
    risk: "medium",
  },
  {
    id: "kick-return-right",
    code: "KRR",
    name: "Return Right",
    description: "Build the return toward the right sideline.",
    family: "special",
    risk: "medium",
  },
  {
    id: "touchback",
    code: "TB",
    name: "Take Touchback",
    description: "Take the safe 25 when the kick reaches the end zone.",
    family: "special",
    risk: "low",
  },
  {
    id: "hands-team",
    code: "HANDS",
    name: "Hands Team",
    description: "Protect against an onside kick at the cost of a weaker deep return setup.",
    family: "special",
    risk: "low",
  },
];

export const DEFENSE_PLAYS: ReadonlyArray<PlayDefinition<DefensePlayId>> = [
  {
    id: "bear-front",
    code: "BEAR",
    name: "BEAR FRONT",
    description: "Stop Run",
    family: "pressure",
    risk: "medium",
  },
  {
    id: "cover-2",
    code: "C2",
    name: "COVER 2",
    description: "Underneath",
    family: "coverage",
    risk: "low",
  },
  {
    id: "cover-4",
    code: "C4",
    name: "COVER 4",
    description: "Protect Deep",
    family: "coverage",
    risk: "low",
  },
  {
    id: "cover-0",
    code: "C0",
    name: "COVER 0",
    description: "Pressure",
    family: "pressure",
    risk: "high",
  },
];

/** Kept only to migrate rooms created before the four-concept arcade playbook. */
const LEGACY_DEFENSE_PLAYS: ReadonlyArray<PlayDefinition<DefensePlayId>> = [
  { id: "cover-1", code: "C1", name: "Cover 1", description: "Legacy coverage call.", family: "coverage", risk: "medium" },
  { id: "cover-3", code: "C3", name: "Cover 3", description: "Legacy coverage call.", family: "coverage", risk: "low" },
  { id: "quarters", code: "C4", name: "Quarters", description: "Legacy deep coverage call.", family: "coverage", risk: "low" },
  { id: "man-blitz", code: "MB", name: "Man Blitz", description: "Legacy pressure call.", family: "pressure", risk: "high" },
  {
    id: "zone-blitz",
    code: "ZB",
    name: "Zone Blitz",
    description: "Disguise pressure while protecting hot throwing lanes.",
    family: "pressure",
    risk: "medium",
  },
  {
    id: "run-commit",
    code: "RC",
    name: "Run Commit",
    description: "Overload the box. Dominant against runs, exposed to passes.",
    family: "pressure",
    risk: "high",
  },
  {
    id: "contain",
    code: "CON",
    name: "Contain",
    description: "Disciplined rush and underneath leverage against options.",
    family: "coverage",
    risk: "medium",
  },
  {
    id: "drop-8",
    code: "D8",
    name: "Drop 8",
    description: "Flood passing lanes with eight defenders; concede numbers in the run box.",
    family: "coverage",
    risk: "medium",
  },
];

export const PUNT_RETURN_PLAYS: ReadonlyArray<PlayDefinition<DefensePlayId>> = [
  {
    id: "punt-return-middle",
    code: "RET",
    name: "Punt Return",
    description: "Keep blockers in the return scheme for substantially better return yardage.",
    family: "special",
    risk: "medium",
  },
  {
    id: "punt-block",
    code: "BLK",
    name: "Punt Block",
    description: "Sell out for a much stronger block chance and sacrifice the return setup.",
    family: "pressure",
    risk: "high",
  },
];

export const FIELD_GOAL_DEFENSE_PLAYS: ReadonlyArray<PlayDefinition<DefensePlayId>> = [
  {
    id: "field-goal-safe",
    code: "FGS",
    name: "Field Goal Safe",
    description: "Protect against a fake while conceding a clean kick attempt.",
    family: "special",
    risk: "low",
  },
  {
    id: "field-goal-block",
    code: "FGB",
    name: "Field Goal Block",
    description: "Attack the protection for a much stronger block chance; vulnerable to a fake.",
    family: "pressure",
    risk: "high",
  },
];

const LEGACY_PUNT_DEFENSE_PLAYS: ReadonlyArray<PlayDefinition<DefensePlayId>> = [
  { id: "punt-safe", code: "SAFE", name: "Punt Safe", description: "Legacy punt-safe call.", family: "special", risk: "low" },
  { id: "punt-return-left", code: "PRL", name: "Punt Return Left", description: "Legacy left return.", family: "special", risk: "medium" },
  { id: "punt-return-right", code: "PRR", name: "Punt Return Right", description: "Legacy right return.", family: "special", risk: "medium" },
];

export const KICK_COVERAGE_PLAYS: ReadonlyArray<PlayDefinition<DefensePlayId>> = [
  {
    id: "kick-deep-left",
    code: "KDL",
    name: "Cover Left",
    description: "Kick deep and overload the left return lane.",
    family: "special",
    risk: "medium",
  },
  {
    id: "kick-deep-middle",
    code: "KDM",
    name: "Cover Middle",
    description: "Kick deep with balanced coverage through the middle.",
    family: "special",
    risk: "low",
  },
  {
    id: "kick-deep-right",
    code: "KDR",
    name: "Cover Right",
    description: "Kick deep and overload the right return lane.",
    family: "special",
    risk: "medium",
  },
  {
    id: "squib-kick",
    code: "SQB",
    name: "Squib Kick",
    description: "Prevent a clean deep return at the cost of field position.",
    family: "special",
    risk: "medium",
  },
  {
    id: "onside-kick",
    code: "ONSIDE",
    name: "Onside Kick",
    description: "Try to steal a possession with a low-probability recovery.",
    family: "special",
    risk: "high",
  },
];

export const offensePlayById = Object.fromEntries(
  [...OFFENSE_PLAYS, ...LEGACY_OFFENSE_PLAYS, ...SPECIAL_OFFENSE_PLAYS, ...KICK_RETURN_PLAYS, ...CONVERSION_OFFENSE_PLAYS].map((play) => [play.id, play]),
) as Record<OffensePlayId, PlayDefinition<OffensePlayId>>;

export const defensePlayById = Object.fromEntries(
  [...DEFENSE_PLAYS, ...LEGACY_DEFENSE_PLAYS, ...PUNT_RETURN_PLAYS, ...FIELD_GOAL_DEFENSE_PLAYS, ...LEGACY_PUNT_DEFENSE_PLAYS, ...KICK_COVERAGE_PLAYS, ...CONVERSION_DEFENSE_PLAYS].map((play) => [play.id, play]),
) as Record<DefensePlayId, PlayDefinition<DefensePlayId>>;

export const offensePlayIds = new Set<OffensePlayId>(
  [...OFFENSE_PLAYS, ...LEGACY_OFFENSE_PLAYS, ...SPECIAL_OFFENSE_PLAYS, ...KICK_RETURN_PLAYS, ...CONVERSION_OFFENSE_PLAYS].map((play) => play.id),
);

export const defensePlayIds = new Set<DefensePlayId>(
  [...DEFENSE_PLAYS, ...LEGACY_DEFENSE_PLAYS, ...PUNT_RETURN_PLAYS, ...FIELD_GOAL_DEFENSE_PLAYS, ...LEGACY_PUNT_DEFENSE_PLAYS, ...KICK_COVERAGE_PLAYS, ...CONVERSION_DEFENSE_PLAYS].map((play) => play.id),
);
