import { db } from "../db";
import { players, intelReports } from "@shared/schema";
import { eq, and, ilike } from "drizzle-orm";

const AFL_INJURY_URL = "https://www.afl.com.au/matches/injury-list";

const TEAM_ABBR_MAP: Record<string, string> = {
  ADEL: "Adelaide",
  BRIS: "Brisbane Lions",
  CARL: "Carlton",
  COLL: "Collingwood",
  ESS: "Essendon",
  FREM: "Fremantle",
  FRE: "Fremantle",
  GEEL: "Geelong",
  GCFC: "Gold Coast",
  GCS: "Gold Coast",
  GWS: "GWS Giants",
  HAW: "Hawthorn",
  MELB: "Melbourne",
  NMFC: "North Melbourne",
  NM: "North Melbourne",
  PORT: "Port Adelaide",
  PA: "Port Adelaide",
  RICH: "Richmond",
  STK: "St Kilda",
  SYD: "Sydney",
  WB: "Western Bulldogs",
  WCE: "West Coast",
};

interface InjuryEntry {
  playerName: string;
  team: string;
  injury: string;
  estimatedReturn: string;
}

interface InTheMixEntry {
  team: string;
  content: string;
}

export interface AflInjuryData {
  injuries: InjuryEntry[];
  inTheMix: InTheMixEntry[];
  lastUpdated: string;
}

function parseInjuryTable(tableHtml: string): { playerName: string; injury: string; estimatedReturn: string }[] {
  const rows: { playerName: string; injury: string; estimatedReturn: string }[] = [];
  const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
  let match;

  while ((match = rowRegex.exec(tableHtml))) {
    const row = match[0];
    if (row.includes("<th")) continue;
    if (row.includes('colspan="3"') || row.includes("colspan=\"3\"")) continue;

    const cells: string[] = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(row))) {
      const text = cellMatch[1].replace(/<[^>]*>/g, "").trim();
      cells.push(text);
    }

    if (cells.length >= 3 && cells[0] && cells[1]) {
      rows.push({
        playerName: cells[0],
        injury: cells[1],
        estimatedReturn: cells[2] || "TBC",
      });
    }
  }

  return rows;
}

function extractTeamAbbr(sectionHtml: string): string | null {
  const logoMatch = sectionHtml.match(/Straps-Badge-Refresh_([A-Z]+)_/);
  if (logoMatch) return logoMatch[1];
  const logoMatch2 = sectionHtml.match(/Strap[^"]*?_([A-Z]{2,5})_/);
  if (logoMatch2) return logoMatch2[1];
  return null;
}

function extractInTheMix(sectionHtml: string): string {
  const paragraphs = sectionHtml.match(/<p>([\s\S]*?)<\/p>/g) || [];
  const mixTexts = paragraphs
    .map((p) => p.replace(/<[^>]*>/g, "").trim())
    .filter((t) => t.length > 40);
  return mixTexts.join(" ").trim();
}

export async function scrapeAflInjuryList(): Promise<AflInjuryData> {
  console.log("[AflInjury] Fetching AFL injury list...");

  const response = await fetch(AFL_INJURY_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; AFLFantasyMachine/1.0)",
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    throw new Error(`AFL injury list returned ${response.status}`);
  }

  const html = await response.text();
  const sections = html.split(/<div class="articleWidget full-width">/);

  const injuries: InjuryEntry[] = [];
  const inTheMix: InTheMixEntry[] = [];
  let lastUpdated = "";

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];

    const teamAbbr = extractTeamAbbr(section);
    const teamName = teamAbbr ? TEAM_ABBR_MAP[teamAbbr] || teamAbbr : `Team ${i}`;

    const tableMatch = section.match(/<table[^>]*>[\s\S]*?<\/table>/);
    if (tableMatch) {
      const rows = parseInjuryTable(tableMatch[0]);
      for (const row of rows) {
        injuries.push({ ...row, team: teamName });
      }

      const dateMatch = tableMatch[0].match(/Updated:\s*([^<]+)/i);
      if (dateMatch && !lastUpdated) {
        lastUpdated = dateMatch[1].trim();
      }
    }

    const mixContent = extractInTheMix(section);
    if (mixContent) {
      inTheMix.push({ team: teamName, content: mixContent });
    }
  }

  console.log(
    `[AflInjury] Parsed ${injuries.length} injuries across ${inTheMix.length} teams, last updated: ${lastUpdated}`
  );

  return { injuries, inTheMix, lastUpdated };
}

function buildInjuryStatusText(injury: string, estimatedReturn: string): string {
  const returnPart = estimatedReturn.toLowerCase();
  if (returnPart === "test" || returnPart === "tbc") {
    return `${injury} (${estimatedReturn})`;
  }
  if (returnPart === "season" || returnPart.includes("season")) {
    return `${injury} (season-ending)`;
  }
  return `${injury} (${estimatedReturn})`;
}

function normaliseTeamName(team: string): string {
  const map: Record<string, string> = {
    Adelaide: "Adelaide",
    "Brisbane Lions": "Brisbane Lions",
    Carlton: "Carlton",
    Collingwood: "Collingwood",
    Essendon: "Essendon",
    Fremantle: "Fremantle",
    Geelong: "Geelong",
    "Gold Coast": "Gold Coast",
    "GWS Giants": "GWS Giants",
    Hawthorn: "Hawthorn",
    Melbourne: "Melbourne",
    "North Melbourne": "North Melbourne",
    "Port Adelaide": "Port Adelaide",
    Richmond: "Richmond",
    "St Kilda": "St Kilda",
    Sydney: "Sydney",
    "Western Bulldogs": "Western Bulldogs",
    "West Coast": "West Coast",
  };
  return map[team] || team;
}

async function findPlayer(
  name: string,
  team: string
): Promise<{ id: number; name: string; injuryStatus: string | null } | null> {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const surname = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(" ");
  const normTeam = normaliseTeamName(team);

  const results = await db
    .select({ id: players.id, name: players.name, injuryStatus: players.injuryStatus, team: players.team })
    .from(players)
    .where(
      and(
        ilike(players.name, `%${surname}%`),
        eq(players.team, normTeam)
      )
    )
    .limit(10);

  if (results.length === 0) return null;

  const exact = results.find((r) => {
    const rParts = r.name.toLowerCase().split(/\s+/);
    const fParts = firstName.toLowerCase().split(/\s+/);
    return rParts.some((p) => fParts.some((f) => p.startsWith(f))) && r.name.toLowerCase().includes(surname.toLowerCase());
  });

  if (exact) return exact;

  if (results.length === 1) return results[0];

  return null;
}

export async function syncAflInjuryList(): Promise<{ matched: number; updated: number; unmatched: string[] }> {
  const data = await scrapeAflInjuryList();

  let matched = 0;
  let updated = 0;
  const unmatched: string[] = [];

  for (const entry of data.injuries) {
    if (entry.injury.toLowerCase() === "suspension") continue;

    const player = await findPlayer(entry.playerName, entry.team);
    if (!player) {
      unmatched.push(`${entry.playerName} (${entry.team})`);
      continue;
    }

    matched++;

    const newInjuryStatus = buildInjuryStatusText(entry.injury, entry.estimatedReturn);

    if (player.injuryStatus !== newInjuryStatus) {
      await db
        .update(players)
        .set({
          injuryStatus: newInjuryStatus,
          selectionStatus: "injured",
          isNamedTeam: false,
        })
        .where(eq(players.id, player.id));
      updated++;
    }
  }

  for (const mix of data.inTheMix) {
    const normTeam = normaliseTeamName(mix.team);
    const existingReport = await db
      .select({ id: intelReports.id })
      .from(intelReports)
      .where(
        and(
          eq(intelReports.category, "in-the-mix"),
          eq(intelReports.source, `afl-injury-list-${normTeam}`)
        )
      )
      .limit(1);

    if (existingReport.length > 0) {
      await db
        .update(intelReports)
        .set({
          content: mix.content,
          createdAt: new Date(),
        })
        .where(eq(intelReports.id, existingReport[0].id));
    } else {
      await db.insert(intelReports).values({
        category: "in-the-mix",
        title: `${normTeam} — In the Mix`,
        content: mix.content,
        priority: "medium",
        source: `afl-injury-list-${normTeam}`,
        sourceUrl: AFL_INJURY_URL,
        actionable: true,
      });
    }
  }

  console.log(
    `[AflInjury] Matched ${matched}/${data.injuries.length} players, updated ${updated}, unmatched ${unmatched.length}`
  );
  if (unmatched.length > 0) {
    console.log(`[AflInjury] Unmatched: ${unmatched.join(", ")}`);
  }

  return { matched, updated, unmatched };
}
