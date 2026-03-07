export interface AFLTeamColors {
  primary: string;
  secondary: string;
  text: string;
  abbr: string;
}

export const AFL_TEAM_COLORS: Record<string, AFLTeamColors> = {
  "Adelaide": { primary: "#002B5C", secondary: "#E21937", text: "#FFD200", abbr: "ADE" },
  "Brisbane Lions": { primary: "#69003B", secondary: "#0055A3", text: "#FBCE07", abbr: "BRL" },
  "Carlton": { primary: "#0E1E2D", secondary: "#0E1E2D", text: "#FFFFFF", abbr: "CAR" },
  "Collingwood": { primary: "#000000", secondary: "#FFFFFF", text: "#FFFFFF", abbr: "COL" },
  "Essendon": { primary: "#CC2031", secondary: "#000000", text: "#FFFFFF", abbr: "ESS" },
  "Fremantle": { primary: "#2A0D45", secondary: "#FFFFFF", text: "#FFFFFF", abbr: "FRE" },
  "Geelong": { primary: "#001F3D", secondary: "#FFFFFF", text: "#FFFFFF", abbr: "GEE" },
  "Gold Coast": { primary: "#DA291C", secondary: "#003DA5", text: "#FFD100", abbr: "GCS" },
  "GWS Giants": { primary: "#F15A24", secondary: "#4A4F55", text: "#FFFFFF", abbr: "GWS" },
  "Hawthorn": { primary: "#4D2004", secondary: "#FBBF13", text: "#FBBF13", abbr: "HAW" },
  "Melbourne": { primary: "#0F1131", secondary: "#CC2031", text: "#FFFFFF", abbr: "MEL" },
  "North Melbourne": { primary: "#003591", secondary: "#FFFFFF", text: "#FFFFFF", abbr: "NTH" },
  "Port Adelaide": { primary: "#008AAB", secondary: "#000000", text: "#FFFFFF", abbr: "PTA" },
  "Richmond": { primary: "#000000", secondary: "#FED102", text: "#FED102", abbr: "RIC" },
  "St Kilda": { primary: "#ED0F05", secondary: "#000000", text: "#FFFFFF", abbr: "STK" },
  "Sydney": { primary: "#ED171F", secondary: "#FFFFFF", text: "#FFFFFF", abbr: "SYD" },
  "West Coast": { primary: "#002B79", secondary: "#F2A900", text: "#F2A900", abbr: "WCE" },
  "Western Bulldogs": { primary: "#014896", secondary: "#CE1126", text: "#FFFFFF", abbr: "WBD" },
};

export function getTeamColors(team: string): AFLTeamColors {
  if (!team) return { primary: "#6B7280", secondary: "#374151", text: "#FFFFFF", abbr: "???" };
  return AFL_TEAM_COLORS[team] || { primary: "#6B7280", secondary: "#374151", text: "#FFFFFF", abbr: team.slice(0, 3).toUpperCase() };
}

export function getTeamAbbr(team: string): string {
  if (!team) return "???";
  return AFL_TEAM_COLORS[team]?.abbr || team.slice(0, 3).toUpperCase();
}
