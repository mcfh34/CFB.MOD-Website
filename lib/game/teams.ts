import { resolveTeamLogoAsset } from "../teamLogoAssets";
import type { TeamInput } from "./types";

export interface TeamDefinition {
  id: string;
  name: string;
  mascot: string;
  abbreviation: string;
  conference: string;
  primaryColor: string;
  secondaryColor: string;
  rating: number;
  logo: string;
}

const TEAM_IDENTITIES = [
  {
    "id": "1",
    "name": "Air Force",
    "mascot": "Falcons",
    "abbreviation": "AFA",
    "conference": "Mountain West",
    "primaryColor": "#004A7B",
    "secondaryColor": "#FFFFFF",
    "rating": 81
  },
  {
    "id": "2",
    "name": "Akron",
    "mascot": "Zips",
    "abbreviation": "AKR",
    "conference": "Mid-American",
    "primaryColor": "#00285E",
    "secondaryColor": "#84754E",
    "rating": 77
  },
  {
    "id": "3",
    "name": "Alabama",
    "mascot": "Crimson Tide",
    "abbreviation": "ALA",
    "conference": "SEC",
    "primaryColor": "#9E1632",
    "secondaryColor": "#FFFFFF",
    "rating": 86
  },
  {
    "id": "4",
    "name": "App State",
    "mascot": "Mountaineers",
    "abbreviation": "APP",
    "conference": "Sun Belt",
    "primaryColor": "#FFCC00",
    "secondaryColor": "#222222",
    "rating": 78
  },
  {
    "id": "5",
    "name": "Arizona",
    "mascot": "Wildcats",
    "abbreviation": "ARIZ",
    "conference": "Big 12",
    "primaryColor": "#0C234B",
    "secondaryColor": "#AB0520",
    "rating": 85
  },
  {
    "id": "6",
    "name": "Arizona State",
    "mascot": "Sun Devils",
    "abbreviation": "ASU",
    "conference": "Big 12",
    "primaryColor": "#8E0C3A",
    "secondaryColor": "#FFC72C",
    "rating": 85
  },
  {
    "id": "7",
    "name": "Arkansas",
    "mascot": "Razorbacks",
    "abbreviation": "ARK",
    "conference": "SEC",
    "primaryColor": "#A41F35",
    "secondaryColor": "#FFFFFF",
    "rating": 86
  },
  {
    "id": "8",
    "name": "Arkansas State",
    "mascot": "Red Wolves",
    "abbreviation": "ARST",
    "conference": "Sun Belt",
    "primaryColor": "#E81018",
    "secondaryColor": "#000000",
    "rating": 78
  },
  {
    "id": "9",
    "name": "Army",
    "mascot": "Black Knights",
    "abbreviation": "ARMY",
    "conference": "American Athletic",
    "primaryColor": "#CE9C00",
    "secondaryColor": "#231F20",
    "rating": 81
  },
  {
    "id": "10",
    "name": "Auburn",
    "mascot": "Tigers",
    "abbreviation": "AUB",
    "conference": "SEC",
    "primaryColor": "#002B5C",
    "secondaryColor": "#F26522",
    "rating": 86
  },
  {
    "id": "11",
    "name": "Ball State",
    "mascot": "Cardinals",
    "abbreviation": "BALL",
    "conference": "Mid-American",
    "primaryColor": "#DA0000",
    "secondaryColor": "#FFFFFF",
    "rating": 75
  },
  {
    "id": "12",
    "name": "Baylor",
    "mascot": "Bears",
    "abbreviation": "BAY",
    "conference": "Big 12",
    "primaryColor": "#154734",
    "secondaryColor": "#FFB81C",
    "rating": 83
  },
  {
    "id": "13",
    "name": "Boise State",
    "mascot": "Broncos",
    "abbreviation": "BOIS",
    "conference": "Mountain West",
    "primaryColor": "#0033A0",
    "secondaryColor": "#FA4616",
    "rating": 86
  },
  {
    "id": "14",
    "name": "Boston College",
    "mascot": "Eagles",
    "abbreviation": "BC",
    "conference": "ACC",
    "primaryColor": "#8C2232",
    "secondaryColor": "#DBCCA6",
    "rating": 77
  },
  {
    "id": "15",
    "name": "Bowling Green",
    "mascot": "Falcons",
    "abbreviation": "BGSU",
    "conference": "Mid-American",
    "primaryColor": "#2B1000",
    "secondaryColor": "#492000",
    "rating": 79
  },
  {
    "id": "16",
    "name": "Buffalo",
    "mascot": "Bulls",
    "abbreviation": "BUF",
    "conference": "Mid-American",
    "primaryColor": "#041A9B",
    "secondaryColor": "#EBEBEB",
    "rating": 78
  },
  {
    "id": "17",
    "name": "BYU",
    "mascot": "Cougars",
    "abbreviation": "BYU",
    "conference": "Big 12",
    "primaryColor": "#003DA5",
    "secondaryColor": "#FFFFFF",
    "rating": 85
  },
  {
    "id": "18",
    "name": "California",
    "mascot": "Golden Bears",
    "abbreviation": "CAL",
    "conference": "ACC",
    "primaryColor": "#031522",
    "secondaryColor": "#FFC423",
    "rating": 77
  },
  {
    "id": "19",
    "name": "Central Michigan",
    "mascot": "Chippewas",
    "abbreviation": "CMU",
    "conference": "Mid-American",
    "primaryColor": "#6A0032",
    "secondaryColor": "#FFC82E",
    "rating": 80
  },
  {
    "id": "20",
    "name": "Charlotte",
    "mascot": "49ers",
    "abbreviation": "CLT",
    "conference": "American Athletic",
    "primaryColor": "#046A38",
    "secondaryColor": "#B9975B",
    "rating": 73
  },
  {
    "id": "21",
    "name": "Cincinnati",
    "mascot": "Bearcats",
    "abbreviation": "CIN",
    "conference": "Big 12",
    "primaryColor": "#E00122",
    "secondaryColor": "#000000",
    "rating": 82
  },
  {
    "id": "22",
    "name": "Clemson",
    "mascot": "Tigers",
    "abbreviation": "CLEM",
    "conference": "ACC",
    "primaryColor": "#F56600",
    "secondaryColor": "#522D80",
    "rating": 83
  },
  {
    "id": "23",
    "name": "Coastal Carolina",
    "mascot": "Chanticleers",
    "abbreviation": "CCU",
    "conference": "Sun Belt",
    "primaryColor": "#007073",
    "secondaryColor": "#876447",
    "rating": 75
  },
  {
    "id": "24",
    "name": "Colorado",
    "mascot": "Buffaloes",
    "abbreviation": "COLO",
    "conference": "Big 12",
    "primaryColor": "#CFB87C",
    "secondaryColor": "#000000",
    "rating": 79
  },
  {
    "id": "25",
    "name": "Colorado State",
    "mascot": "Rams",
    "abbreviation": "CSU",
    "conference": "Mountain West",
    "primaryColor": "#1E4D2B",
    "secondaryColor": "#C8C372",
    "rating": 77
  },
  {
    "id": "137",
    "name": "Delaware",
    "mascot": "Fightin' Blue Hens",
    "abbreviation": "DEL",
    "conference": "Conference USA",
    "primaryColor": "#00539F",
    "secondaryColor": "#FFD200",
    "rating": 79
  },
  {
    "id": "27",
    "name": "Duke",
    "mascot": "Blue Devils",
    "abbreviation": "DUKE",
    "conference": "ACC",
    "primaryColor": "#013088",
    "secondaryColor": "#FFFFFF",
    "rating": 82
  },
  {
    "id": "28",
    "name": "East Carolina",
    "mascot": "Pirates",
    "abbreviation": "ECU",
    "conference": "American Athletic",
    "primaryColor": "#4B1869",
    "secondaryColor": "#F0907B",
    "rating": 84
  },
  {
    "id": "29",
    "name": "Eastern Michigan",
    "mascot": "Eagles",
    "abbreviation": "EMU",
    "conference": "Mid-American",
    "primaryColor": "#00331B",
    "secondaryColor": "#F0F0F0",
    "rating": 79
  },
  {
    "id": "30",
    "name": "Florida",
    "mascot": "Gators",
    "abbreviation": "FLA",
    "conference": "SEC",
    "primaryColor": "#0021A5",
    "secondaryColor": "#FA4616",
    "rating": 82
  },
  {
    "id": "31",
    "name": "Florida Atlantic",
    "mascot": "Owls",
    "abbreviation": "FAU",
    "conference": "American Athletic",
    "primaryColor": "#00447C",
    "secondaryColor": "#D31245",
    "rating": 81
  },
  {
    "id": "32",
    "name": "Florida International",
    "mascot": "Panthers",
    "abbreviation": "FIU",
    "conference": "Conference USA",
    "primaryColor": "#001538",
    "secondaryColor": "#C5960C",
    "rating": 80
  },
  {
    "id": "33",
    "name": "Florida State",
    "mascot": "Seminoles",
    "abbreviation": "FSU",
    "conference": "ACC",
    "primaryColor": "#782F40",
    "secondaryColor": "#CEB888",
    "rating": 88
  },
  {
    "id": "34",
    "name": "Fresno State",
    "mascot": "Bulldogs",
    "abbreviation": "FRES",
    "conference": "Mountain West",
    "primaryColor": "#DB0032",
    "secondaryColor": "#002E6D",
    "rating": 81
  },
  {
    "id": "35",
    "name": "Georgia",
    "mascot": "Bulldogs",
    "abbreviation": "UGA",
    "conference": "SEC",
    "primaryColor": "#BA0C2F",
    "secondaryColor": "#FFFFFF",
    "rating": 88
  },
  {
    "id": "36",
    "name": "Georgia Southern",
    "mascot": "Eagles",
    "abbreviation": "GASO",
    "conference": "Sun Belt",
    "primaryColor": "#003775",
    "secondaryColor": "#F0F0F0",
    "rating": 78
  },
  {
    "id": "37",
    "name": "Georgia State",
    "mascot": "Panthers",
    "abbreviation": "GAST",
    "conference": "Sun Belt",
    "primaryColor": "#1E539A",
    "secondaryColor": "#EBEBEB",
    "rating": 78
  },
  {
    "id": "38",
    "name": "Georgia Tech",
    "mascot": "Yellow Jackets",
    "abbreviation": "GT",
    "conference": "ACC",
    "primaryColor": "#003057",
    "secondaryColor": "#B3A369",
    "rating": 82
  },
  {
    "id": "39",
    "name": "Hawai'i",
    "mascot": "Rainbow Warriors",
    "abbreviation": "HAW",
    "conference": "Mountain West",
    "primaryColor": "#003420",
    "secondaryColor": "#FFFFFF",
    "rating": 81
  },
  {
    "id": "40",
    "name": "Houston",
    "mascot": "Cougars",
    "abbreviation": "HOU",
    "conference": "Big 12",
    "primaryColor": "#C92A39",
    "secondaryColor": "#FFFFFF",
    "rating": 83
  },
  {
    "id": "41",
    "name": "Illinois",
    "mascot": "Fighting Illini",
    "abbreviation": "ILL",
    "conference": "Big Ten",
    "primaryColor": "#FF5F05",
    "secondaryColor": "#13294B",
    "rating": 83
  },
  {
    "id": "42",
    "name": "Indiana",
    "mascot": "Hoosiers",
    "abbreviation": "IU",
    "conference": "Big Ten",
    "primaryColor": "#990000",
    "secondaryColor": "#EDEBEB",
    "rating": 92
  },
  {
    "id": "43",
    "name": "Iowa",
    "mascot": "Hawkeyes",
    "abbreviation": "IOWA",
    "conference": "Big Ten",
    "primaryColor": "#000000",
    "secondaryColor": "#FFCD00",
    "rating": 85
  },
  {
    "id": "44",
    "name": "Iowa State",
    "mascot": "Cyclones",
    "abbreviation": "ISU",
    "conference": "Big 12",
    "primaryColor": "#822433",
    "secondaryColor": "#FDCA2F",
    "rating": 83
  },
  {
    "id": "45",
    "name": "Jacksonville State",
    "mascot": "Gamecocks",
    "abbreviation": "JVST",
    "conference": "Conference USA",
    "primaryColor": "#B50500",
    "secondaryColor": "#B5B7BA",
    "rating": 82
  },
  {
    "id": "46",
    "name": "James Madison",
    "mascot": "Dukes",
    "abbreviation": "JMU",
    "conference": "Sun Belt",
    "primaryColor": "#450084",
    "secondaryColor": "#B5A068",
    "rating": 90
  },
  {
    "id": "47",
    "name": "Kansas",
    "mascot": "Jayhawks",
    "abbreviation": "KU",
    "conference": "Big 12",
    "primaryColor": "#0051BA",
    "secondaryColor": "#E8000D",
    "rating": 82
  },
  {
    "id": "48",
    "name": "Kansas State",
    "mascot": "Wildcats",
    "abbreviation": "KSU",
    "conference": "Big 12",
    "primaryColor": "#3C0969",
    "secondaryColor": "#E2E3E4",
    "rating": 82
  },
  {
    "id": "49",
    "name": "Kennesaw State",
    "mascot": "Owls",
    "abbreviation": "KENN",
    "conference": "Conference USA",
    "primaryColor": "#FDBB30",
    "secondaryColor": "#000000",
    "rating": 82
  },
  {
    "id": "50",
    "name": "Kent State",
    "mascot": "Golden Flashes",
    "abbreviation": "KENT",
    "conference": "Mid-American",
    "primaryColor": "#003976",
    "secondaryColor": "#EFAB00",
    "rating": 77
  },
  {
    "id": "51",
    "name": "Kentucky",
    "mascot": "Wildcats",
    "abbreviation": "UK",
    "conference": "SEC",
    "primaryColor": "#0033A0",
    "secondaryColor": "#FFFFFF",
    "rating": 82
  },
  {
    "id": "52",
    "name": "Liberty",
    "mascot": "Flames",
    "abbreviation": "LIB",
    "conference": "Conference USA",
    "primaryColor": "#071740",
    "secondaryColor": "#A61F21",
    "rating": 84
  },
  {
    "id": "53",
    "name": "Louisiana",
    "mascot": "Ragin' Cajuns",
    "abbreviation": "UL",
    "conference": "Sun Belt",
    "primaryColor": "#CE181E",
    "secondaryColor": "#FFFFFF",
    "rating": 79
  },
  {
    "id": "54",
    "name": "Louisiana Tech",
    "mascot": "Bulldogs",
    "abbreviation": "LT",
    "conference": "Conference USA",
    "primaryColor": "#002D65",
    "secondaryColor": "#D3313A",
    "rating": 80
  },
  {
    "id": "55",
    "name": "Louisville",
    "mascot": "Cardinals",
    "abbreviation": "LOU",
    "conference": "ACC",
    "primaryColor": "#C9001F",
    "secondaryColor": "#000000",
    "rating": 86
  },
  {
    "id": "56",
    "name": "LSU",
    "mascot": "Tigers",
    "abbreviation": "LSU",
    "conference": "SEC",
    "primaryColor": "#461D7C",
    "secondaryColor": "#FDD023",
    "rating": 83
  },
  {
    "id": "57",
    "name": "Marshall",
    "mascot": "Thundering Herd",
    "abbreviation": "MRSH",
    "conference": "Sun Belt",
    "primaryColor": "#00AE42",
    "secondaryColor": "#BE854C",
    "rating": 82
  },
  {
    "id": "58",
    "name": "Maryland",
    "mascot": "Terrapins",
    "abbreviation": "MD",
    "conference": "Big Ten",
    "primaryColor": "#D5002B",
    "secondaryColor": "#FFCD00",
    "rating": 79
  },
  {
    "id": "59",
    "name": "Massachusetts",
    "mascot": "Minutemen",
    "abbreviation": "MASS",
    "conference": "FBS Independents",
    "primaryColor": "#971B2F",
    "secondaryColor": "#B1B3B3",
    "rating": 71
  },
  {
    "id": "60",
    "name": "Memphis",
    "mascot": "Tigers",
    "abbreviation": "MEM",
    "conference": "American Athletic",
    "primaryColor": "#004991",
    "secondaryColor": "#8E908F",
    "rating": 84
  },
  {
    "id": "61",
    "name": "Miami",
    "mascot": "Hurricanes",
    "abbreviation": "MIA",
    "conference": "ACC",
    "primaryColor": "#005030",
    "secondaryColor": "#F47321",
    "rating": 89
  },
  {
    "id": "62",
    "name": "Miami (OH)",
    "mascot": "RedHawks",
    "abbreviation": "M-OH",
    "conference": "Mid-American",
    "primaryColor": "#A4000C",
    "secondaryColor": "#F0F0F0",
    "rating": 81
  },
  {
    "id": "63",
    "name": "Michigan",
    "mascot": "Wolverines",
    "abbreviation": "MICH",
    "conference": "Big Ten",
    "primaryColor": "#00274C",
    "secondaryColor": "#FFCB05",
    "rating": 88
  },
  {
    "id": "64",
    "name": "Michigan State",
    "mascot": "Spartans",
    "abbreviation": "MSU",
    "conference": "Big Ten",
    "primaryColor": "#18453B",
    "secondaryColor": "#FFFFFF",
    "rating": 81
  },
  {
    "id": "65",
    "name": "Middle Tennessee",
    "mascot": "Blue Raiders",
    "abbreviation": "MTSU",
    "conference": "Conference USA",
    "primaryColor": "#006DB6",
    "secondaryColor": "#FFFFFF",
    "rating": 78
  },
  {
    "id": "66",
    "name": "Minnesota",
    "mascot": "Golden Gophers",
    "abbreviation": "MINN",
    "conference": "Big Ten",
    "primaryColor": "#5E0A2F",
    "secondaryColor": "#FAB41C",
    "rating": 78
  },
  {
    "id": "67",
    "name": "Mississippi State",
    "mascot": "Bulldogs",
    "abbreviation": "MSST",
    "conference": "SEC",
    "primaryColor": "#5D1725",
    "secondaryColor": "#C1C6C8",
    "rating": 82
  },
  {
    "id": "68",
    "name": "Missouri",
    "mascot": "Tigers",
    "abbreviation": "MIZ",
    "conference": "SEC",
    "primaryColor": "#F1B82D",
    "secondaryColor": "#000000",
    "rating": 89
  },
  {
    "id": "138",
    "name": "Missouri State",
    "mascot": "Bears",
    "abbreviation": "MOST",
    "conference": "Conference USA",
    "primaryColor": "#5E0009",
    "secondaryColor": "#FFFFFF",
    "rating": 81
  },
  {
    "id": "70",
    "name": "Navy",
    "mascot": "Midshipmen",
    "abbreviation": "NAVY",
    "conference": "American Athletic",
    "primaryColor": "#00225B",
    "secondaryColor": "#B5A67C",
    "rating": 84
  },
  {
    "id": "71",
    "name": "NC State",
    "mascot": "Wolfpack",
    "abbreviation": "NCSU",
    "conference": "ACC",
    "primaryColor": "#CC0000",
    "secondaryColor": "#FFFFFF",
    "rating": 83
  },
  {
    "id": "72",
    "name": "Nebraska",
    "mascot": "Cornhuskers",
    "abbreviation": "NEB",
    "conference": "Big Ten",
    "primaryColor": "#D00000",
    "secondaryColor": "#FFFFFF",
    "rating": 82
  },
  {
    "id": "73",
    "name": "Nevada",
    "mascot": "Wolf Pack",
    "abbreviation": "NEV",
    "conference": "Mountain West",
    "primaryColor": "#002D62",
    "secondaryColor": "#FFFFFF",
    "rating": 79
  },
  {
    "id": "74",
    "name": "New Mexico",
    "mascot": "Lobos",
    "abbreviation": "UNM",
    "conference": "Mountain West",
    "primaryColor": "#BA0C2F",
    "secondaryColor": "#A7A8AA",
    "rating": 83
  },
  {
    "id": "75",
    "name": "New Mexico State",
    "mascot": "Aggies",
    "abbreviation": "NMSU",
    "conference": "Conference USA",
    "primaryColor": "#891216",
    "secondaryColor": "#000000",
    "rating": 77
  },
  {
    "id": "76",
    "name": "North Carolina",
    "mascot": "Tar Heels",
    "abbreviation": "UNC",
    "conference": "ACC",
    "primaryColor": "#7BAFD4",
    "secondaryColor": "#13294B",
    "rating": 79
  },
  {
    "id": "77",
    "name": "North Texas",
    "mascot": "Mean Green",
    "abbreviation": "UNT",
    "conference": "American Athletic",
    "primaryColor": "#00853E",
    "secondaryColor": "#000000",
    "rating": 86
  },
  {
    "id": "78",
    "name": "Northern Illinois",
    "mascot": "Huskies",
    "abbreviation": "NIU",
    "conference": "Mid-American",
    "primaryColor": "#F1122C",
    "secondaryColor": "#CC0000",
    "rating": 77
  },
  {
    "id": "79",
    "name": "Northwestern",
    "mascot": "Wildcats",
    "abbreviation": "NU",
    "conference": "Big Ten",
    "primaryColor": "#582C83",
    "secondaryColor": "#FFFFFF",
    "rating": 82
  },
  {
    "id": "80",
    "name": "Notre Dame",
    "mascot": "Fighting Irish",
    "abbreviation": "ND",
    "conference": "FBS Independents",
    "primaryColor": "#0C2340",
    "secondaryColor": "#C99700",
    "rating": 90
  },
  {
    "id": "81",
    "name": "Ohio",
    "mascot": "Bobcats",
    "abbreviation": "OHIO",
    "conference": "Mid-American",
    "primaryColor": "#295A29",
    "secondaryColor": "#E4BB85",
    "rating": 81
  },
  {
    "id": "82",
    "name": "Ohio State",
    "mascot": "Buckeyes",
    "abbreviation": "OSU",
    "conference": "Big Ten",
    "primaryColor": "#CE1141",
    "secondaryColor": "#505056",
    "rating": 91
  },
  {
    "id": "83",
    "name": "Oklahoma",
    "mascot": "Sooners",
    "abbreviation": "OU",
    "conference": "SEC",
    "primaryColor": "#A32036",
    "secondaryColor": "#FFFFFF",
    "rating": 86
  },
  {
    "id": "84",
    "name": "Oklahoma State",
    "mascot": "Cowboys",
    "abbreviation": "OKST",
    "conference": "Big 12",
    "primaryColor": "#FF7300",
    "secondaryColor": "#000000",
    "rating": 78
  },
  {
    "id": "85",
    "name": "Old Dominion",
    "mascot": "Monarchs",
    "abbreviation": "ODU",
    "conference": "Sun Belt",
    "primaryColor": "#00507D",
    "secondaryColor": "#A1D2F1",
    "rating": 87
  },
  {
    "id": "86",
    "name": "Ole Miss",
    "mascot": "Rebels",
    "abbreviation": "MISS",
    "conference": "SEC",
    "primaryColor": "#13294B",
    "secondaryColor": "#C8102E",
    "rating": 87
  },
  {
    "id": "87",
    "name": "Oregon",
    "mascot": "Ducks",
    "abbreviation": "ORE",
    "conference": "Big Ten",
    "primaryColor": "#007030",
    "secondaryColor": "#FEE11A",
    "rating": 91
  },
  {
    "id": "88",
    "name": "Oregon State",
    "mascot": "Beavers",
    "abbreviation": "ORST",
    "conference": "Pac-12",
    "primaryColor": "#231F20",
    "secondaryColor": "#D73F09",
    "rating": 79
  },
  {
    "id": "89",
    "name": "Penn State",
    "mascot": "Nittany Lions",
    "abbreviation": "PSU",
    "conference": "Big Ten",
    "primaryColor": "#041E42",
    "secondaryColor": "#FFFFFF",
    "rating": 84
  },
  {
    "id": "90",
    "name": "Pittsburgh",
    "mascot": "Panthers",
    "abbreviation": "PITT",
    "conference": "ACC",
    "primaryColor": "#003263",
    "secondaryColor": "#231F20",
    "rating": 84
  },
  {
    "id": "91",
    "name": "Purdue",
    "mascot": "Boilermakers",
    "abbreviation": "PUR",
    "conference": "Big Ten",
    "primaryColor": "#000000",
    "secondaryColor": "#CEB888",
    "rating": 80
  },
  {
    "id": "92",
    "name": "Rice",
    "mascot": "Owls",
    "abbreviation": "RICE",
    "conference": "American Athletic",
    "primaryColor": "#D1D5D8",
    "secondaryColor": "#003D7D",
    "rating": 77
  },
  {
    "id": "93",
    "name": "Rutgers",
    "mascot": "Scarlet Knights",
    "abbreviation": "RUTG",
    "conference": "Big Ten",
    "primaryColor": "#D21034",
    "secondaryColor": "#FFFFFF",
    "rating": 78
  },
  {
    "id": "94",
    "name": "Sam Houston",
    "mascot": "Bearkats",
    "abbreviation": "SHSU",
    "conference": "Conference USA",
    "primaryColor": "#FE5000",
    "secondaryColor": "#000000",
    "rating": 73
  },
  {
    "id": "95",
    "name": "San Diego State",
    "mascot": "Aztecs",
    "abbreviation": "SDSU",
    "conference": "Mountain West",
    "primaryColor": "#C41230",
    "secondaryColor": "#000000",
    "rating": 84
  },
  {
    "id": "96",
    "name": "San José State",
    "mascot": "Spartans",
    "abbreviation": "SJSU",
    "conference": "Mountain West",
    "primaryColor": "#005893",
    "secondaryColor": "#FDBA31",
    "rating": 81
  },
  {
    "id": "97",
    "name": "SMU",
    "mascot": "Mustangs",
    "abbreviation": "SMU",
    "conference": "ACC",
    "primaryColor": "#354CA1",
    "secondaryColor": "#CC0035",
    "rating": 84
  },
  {
    "id": "98",
    "name": "South Alabama",
    "mascot": "Jaguars",
    "abbreviation": "USA",
    "conference": "Sun Belt",
    "primaryColor": "#00205B",
    "secondaryColor": "#BF0D3E",
    "rating": 80
  },
  {
    "id": "99",
    "name": "South Carolina",
    "mascot": "Gamecocks",
    "abbreviation": "SC",
    "conference": "SEC",
    "primaryColor": "#73000A",
    "secondaryColor": "#FFFFFF",
    "rating": 83
  },
  {
    "id": "100",
    "name": "South Florida",
    "mascot": "Bulls",
    "abbreviation": "USF",
    "conference": "American Athletic",
    "primaryColor": "#004A36",
    "secondaryColor": "#231F20",
    "rating": 86
  },
  {
    "id": "101",
    "name": "Southern Miss",
    "mascot": "Golden Eagles",
    "abbreviation": "USM",
    "conference": "Sun Belt",
    "primaryColor": "#FFAA3C",
    "secondaryColor": "#FFC423",
    "rating": 80
  },
  {
    "id": "102",
    "name": "Stanford",
    "mascot": "Cardinal",
    "abbreviation": "STAN",
    "conference": "ACC",
    "primaryColor": "#8C1515",
    "secondaryColor": "#FFFFFF",
    "rating": 79
  },
  {
    "id": "103",
    "name": "Syracuse",
    "mascot": "Orange",
    "abbreviation": "SYR",
    "conference": "ACC",
    "primaryColor": "#FF6500",
    "secondaryColor": "#000E54",
    "rating": 77
  },
  {
    "id": "104",
    "name": "TCU",
    "mascot": "Horned Frogs",
    "abbreviation": "TCU",
    "conference": "Big 12",
    "primaryColor": "#4D1979",
    "secondaryColor": "#F1F2F3",
    "rating": 84
  },
  {
    "id": "105",
    "name": "Temple",
    "mascot": "Owls",
    "abbreviation": "TEM",
    "conference": "American Athletic",
    "primaryColor": "#A80532",
    "secondaryColor": "#A7A9AC",
    "rating": 76
  },
  {
    "id": "106",
    "name": "Tennessee",
    "mascot": "Volunteers",
    "abbreviation": "TENN",
    "conference": "SEC",
    "primaryColor": "#FF8200",
    "secondaryColor": "#58595B",
    "rating": 84
  },
  {
    "id": "107",
    "name": "Texas",
    "mascot": "Longhorns",
    "abbreviation": "TEX",
    "conference": "SEC",
    "primaryColor": "#C15D26",
    "secondaryColor": "#FFFFFF",
    "rating": 85
  },
  {
    "id": "108",
    "name": "Texas A&M",
    "mascot": "Aggies",
    "abbreviation": "TA&M",
    "conference": "SEC",
    "primaryColor": "#500000",
    "secondaryColor": "#FFFFFF",
    "rating": 89
  },
  {
    "id": "109",
    "name": "Texas State",
    "mascot": "Bobcats",
    "abbreviation": "TXST",
    "conference": "Sun Belt",
    "primaryColor": "#4E1719",
    "secondaryColor": "#B4975A",
    "rating": 85
  },
  {
    "id": "110",
    "name": "Texas Tech",
    "mascot": "Red Raiders",
    "abbreviation": "TTU",
    "conference": "Big 12",
    "primaryColor": "#CC0000",
    "secondaryColor": "#000000",
    "rating": 90
  },
  {
    "id": "111",
    "name": "Toledo",
    "mascot": "Rockets",
    "abbreviation": "TOL",
    "conference": "Mid-American",
    "primaryColor": "#0A2240",
    "secondaryColor": "#FFCD00",
    "rating": 86
  },
  {
    "id": "112",
    "name": "Troy",
    "mascot": "Trojans",
    "abbreviation": "TROY",
    "conference": "Sun Belt",
    "primaryColor": "#AE0210",
    "secondaryColor": "#88898C",
    "rating": 78
  },
  {
    "id": "113",
    "name": "Tulane",
    "mascot": "Green Wave",
    "abbreviation": "TULN",
    "conference": "American Athletic",
    "primaryColor": "#006547",
    "secondaryColor": "#468AC9",
    "rating": 84
  },
  {
    "id": "114",
    "name": "Tulsa",
    "mascot": "Golden Hurricane",
    "abbreviation": "TLSA",
    "conference": "American Athletic",
    "primaryColor": "#003595",
    "secondaryColor": "#D0B787",
    "rating": 80
  },
  {
    "id": "115",
    "name": "UAB",
    "mascot": "Blazers",
    "abbreviation": "UAB",
    "conference": "American Athletic",
    "primaryColor": "#003B28",
    "secondaryColor": "#FFC845",
    "rating": 80
  },
  {
    "id": "116",
    "name": "UCF",
    "mascot": "Knights",
    "abbreviation": "UCF",
    "conference": "Big 12",
    "primaryColor": "#BA9B37",
    "secondaryColor": "#000000",
    "rating": 82
  },
  {
    "id": "117",
    "name": "UCLA",
    "mascot": "Bruins",
    "abbreviation": "UCLA",
    "conference": "Big Ten",
    "primaryColor": "#2774AE",
    "secondaryColor": "#F2A900",
    "rating": 81
  },
  {
    "id": "118",
    "name": "UConn",
    "mascot": "Huskies",
    "abbreviation": "CONN",
    "conference": "FBS Independents",
    "primaryColor": "#0C2340",
    "secondaryColor": "#F1F2F3",
    "rating": 79
  },
  {
    "id": "119",
    "name": "UL Monroe",
    "mascot": "Warhawks",
    "abbreviation": "ULM",
    "conference": "Sun Belt",
    "primaryColor": "#231F20",
    "secondaryColor": "#B18445",
    "rating": 77
  },
  {
    "id": "120",
    "name": "UNLV",
    "mascot": "Rebels",
    "abbreviation": "UNLV",
    "conference": "Mountain West",
    "primaryColor": "#B10202",
    "secondaryColor": "#FFFFFF",
    "rating": 82
  },
  {
    "id": "121",
    "name": "USC",
    "mascot": "Trojans",
    "abbreviation": "USC",
    "conference": "Big Ten",
    "primaryColor": "#9E2237",
    "secondaryColor": "#FFCC00",
    "rating": 88
  },
  {
    "id": "122",
    "name": "Utah",
    "mascot": "Utes",
    "abbreviation": "UTAH",
    "conference": "Big 12",
    "primaryColor": "#EA002A",
    "secondaryColor": "#FFFFFF",
    "rating": 86
  },
  {
    "id": "123",
    "name": "Utah State",
    "mascot": "Aggies",
    "abbreviation": "USU",
    "conference": "Mountain West",
    "primaryColor": "#00263A",
    "secondaryColor": "#949CA1",
    "rating": 82
  },
  {
    "id": "124",
    "name": "UTEP",
    "mascot": "Miners",
    "abbreviation": "UTEP",
    "conference": "Conference USA",
    "primaryColor": "#FF8200",
    "secondaryColor": "#041E42",
    "rating": 77
  },
  {
    "id": "125",
    "name": "UTSA",
    "mascot": "Roadrunners",
    "abbreviation": "UTSA",
    "conference": "American Athletic",
    "primaryColor": "#002A5C",
    "secondaryColor": "#F47321",
    "rating": 83
  },
  {
    "id": "126",
    "name": "Vanderbilt",
    "mascot": "Commodores",
    "abbreviation": "VAN",
    "conference": "SEC",
    "primaryColor": "#866D4B",
    "secondaryColor": "#000000",
    "rating": 88
  },
  {
    "id": "127",
    "name": "Virginia",
    "mascot": "Cavaliers",
    "abbreviation": "UVA",
    "conference": "ACC",
    "primaryColor": "#232D4B",
    "secondaryColor": "#F84C1E",
    "rating": 85
  },
  {
    "id": "128",
    "name": "Virginia Tech",
    "mascot": "Hokies",
    "abbreviation": "VT",
    "conference": "ACC",
    "primaryColor": "#630031",
    "secondaryColor": "#CF4520",
    "rating": 83
  },
  {
    "id": "129",
    "name": "Wake Forest",
    "mascot": "Demon Deacons",
    "abbreviation": "WAKE",
    "conference": "ACC",
    "primaryColor": "#9E7E38",
    "secondaryColor": "#000000",
    "rating": 84
  },
  {
    "id": "130",
    "name": "Washington",
    "mascot": "Huskies",
    "abbreviation": "WASH",
    "conference": "Big Ten",
    "primaryColor": "#33006F",
    "secondaryColor": "#E8D3A2",
    "rating": 86
  },
  {
    "id": "131",
    "name": "Washington State",
    "mascot": "Cougars",
    "abbreviation": "WSU",
    "conference": "Pac-12",
    "primaryColor": "#981E32",
    "secondaryColor": "#FFFFFF",
    "rating": 84
  },
  {
    "id": "132",
    "name": "West Virginia",
    "mascot": "Mountaineers",
    "abbreviation": "WVU",
    "conference": "Big 12",
    "primaryColor": "#002855",
    "secondaryColor": "#EAAA00",
    "rating": 79
  },
  {
    "id": "133",
    "name": "Western Kentucky",
    "mascot": "Hilltoppers",
    "abbreviation": "WKU",
    "conference": "Conference USA",
    "primaryColor": "#F32026",
    "secondaryColor": "#B3B5B8",
    "rating": 79
  },
  {
    "id": "134",
    "name": "Western Michigan",
    "mascot": "Broncos",
    "abbreviation": "WMU",
    "conference": "Mid-American",
    "primaryColor": "#532E1F",
    "secondaryColor": "#8B7F79",
    "rating": 82
  },
  {
    "id": "135",
    "name": "Wisconsin",
    "mascot": "Badgers",
    "abbreviation": "WIS",
    "conference": "Big Ten",
    "primaryColor": "#C4012F",
    "secondaryColor": "#FFFFFF",
    "rating": 82
  },
  {
    "id": "136",
    "name": "Wyoming",
    "mascot": "Cowboys",
    "abbreviation": "WYO",
    "conference": "Mountain West",
    "primaryColor": "#492F24",
    "secondaryColor": "#FFC425",
    "rating": 79
  }
] as const;

export const TEAM_CATALOG: ReadonlyArray<TeamDefinition> = TEAM_IDENTITIES.map((team) => ({
  ...team,
  logo: resolveTeamLogoAsset(team.name) ?? "",
}));

export const TEAM_BY_ID = new Map(TEAM_CATALOG.map((team) => [team.id, team]));
export const TEAM_BY_NAME = new Map(TEAM_CATALOG.map((team) => [team.name, team]));

export function teamInputFromDefinition(
  team: TeamDefinition,
  rating = team.rating,
): TeamInput {
  return {
    teamId: team.id,
    name: team.name,
    mascot: team.mascot,
    abbreviation: team.abbreviation,
    conference: team.conference,
    primaryColor: team.primaryColor,
    secondaryColor: team.secondaryColor,
    logo: team.logo,
    rating,
  };
}
