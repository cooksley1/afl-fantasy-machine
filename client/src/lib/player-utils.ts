export function formatPrice(price: number): string {
  if (price >= 1000000) return `$${(price / 1000000).toFixed(3)}M`;
  return `$${(price / 1000).toFixed(0)}k`;
}

export function formatPriceChange(change: number): string {
  const prefix = change >= 0 ? "+" : "";
  if (Math.abs(change) >= 1000) return `${prefix}$${(change / 1000).toFixed(0)}k`;
  return `${prefix}$${change}`;
}

const TEAM_COLOURS: Record<string, string> = {
  ADE: "#002B5C", BRL: "#7B2436", CAR: "#001B2D", COL: "#000000",
  ESS: "#CC2031", FRE: "#2A0D45", GEE: "#001F3D", GCS: "#D63239",
  GWS: "#F26522", HAW: "#4D2004", MEL: "#021A3A", NOR: "#003C71",
  POR: "#008AAB", RIC: "#FFC72C", STK: "#E21937", SYD: "#E31937",
  WCE: "#002D62", WBD: "#014896",
};

export function getTeamColour(teamCode: string): string {
  return TEAM_COLOURS[teamCode] ?? "#666666";
}
