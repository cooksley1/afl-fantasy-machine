import { storage } from "./storage";
import { db } from "./db";
import { myTeamPlayers, players, intelReports, playerAlerts } from "@shared/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";

interface TeamPlayerInfo {
  playerId: number;
  playerName: string;
  team: string | null;
}

async function getUserTeamPlayers(userId: string): Promise<TeamPlayerInfo[]> {
  const rows = await db
    .select({
      playerId: myTeamPlayers.playerId,
      playerName: players.name,
      team: players.team,
    })
    .from(myTeamPlayers)
    .innerJoin(players, eq(myTeamPlayers.playerId, players.id))
    .where(eq(myTeamPlayers.userId, userId));
  return rows;
}

function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

function playerMentioned(playerName: string, text: string): boolean {
  const normText = normalise(text);
  const normFull = normalise(playerName);
  if (normText.includes(normFull)) return true;

  const parts = playerName.split(/\s+/);
  if (parts.length >= 2) {
    const surname = normalise(parts[parts.length - 1]);
    if (surname.length >= 4 && normText.includes(surname)) return true;
  }
  return false;
}

function classifyAlert(title: string, content: string): { alertType: string; priority: string } {
  const combined = (title + " " + content).toLowerCase();

  if (/injur|hamstring|calf|concuss|knee|acl|mcl|shoulder|broken|fracture|out for|sidelined|ruled out/i.test(combined)) {
    return { alertType: "injury", priority: "high" };
  }
  if (/late change|omit|dropped|managed|rested|omission|swap|emergency/i.test(combined)) {
    return { alertType: "late_change", priority: "high" };
  }
  if (/select|named|debut|recalled|inclusion|added to squad|team sheet/i.test(combined)) {
    return { alertType: "selection", priority: "medium" };
  }
  if (/tag|role change|move|position|forward|back|midfield|ruck|vest/i.test(combined)) {
    return { alertType: "role_change", priority: "medium" };
  }
  return { alertType: "news", priority: "low" };
}

function parsePlayerNames(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw as string);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return (raw as string).split(",").map((s) => s.trim()).filter(Boolean);
}

export async function generatePlayerAlerts(userId: string): Promise<number> {
  const teamPlayers = await getUserTeamPlayers(userId);
  if (teamPlayers.length === 0) return 0;

  const existingAlerts = await db
    .select({ sourceReportId: playerAlerts.sourceReportId, playerId: playerAlerts.playerId })
    .from(playerAlerts)
    .where(eq(playerAlerts.userId, userId));
  const processedKeys = new Set(
    existingAlerts.map((a) => `${a.sourceReportId}:${a.playerId}`).filter((k) => !k.startsWith("null"))
  );

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const recentReports = await storage.getIntelReportsSince(since);

  let generated = 0;

  for (const report of recentReports) {
    const mentionedPlayers: TeamPlayerInfo[] = [];

    const reportNames = parsePlayerNames(report.playerNames);
    if (reportNames.length > 0) {
      for (const tp of teamPlayers) {
        for (const pn of reportNames) {
          if (playerMentioned(tp.playerName, pn) || playerMentioned(pn, tp.playerName)) {
            mentionedPlayers.push(tp);
            break;
          }
        }
      }
    }

    if (mentionedPlayers.length === 0) {
      const fullText = (report.title || "") + " " + (report.content || "");
      for (const tp of teamPlayers) {
        if (playerMentioned(tp.playerName, fullText)) {
          mentionedPlayers.push(tp);
        }
      }
    }

    for (const mp of mentionedPlayers) {
      const dedupKey = `${report.id}:${mp.playerId}`;
      if (processedKeys.has(dedupKey)) continue;
      processedKeys.add(dedupKey);

      const { alertType, priority } = classifyAlert(report.title || "", report.content || "");

      await storage.createPlayerAlert({
        userId,
        playerId: mp.playerId,
        playerName: mp.playerName,
        alertType,
        title: report.title || "Player Update",
        message: report.content || "",
        priority,
        isRead: false,
        sourceReportId: report.id,
      });
      generated++;
    }
  }

  return generated;
}

export async function generateAlertsForAllUsers(): Promise<number> {
  const distinctUsers = await db
    .selectDistinct({ userId: myTeamPlayers.userId })
    .from(myTeamPlayers);

  let total = 0;
  for (const row of distinctUsers) {
    if (!row.userId) continue;
    try {
      const count = await generatePlayerAlerts(row.userId);
      total += count;
    } catch (e) {
      console.error(`[AlertGen] Error for user ${row.userId}:`, (e as Error).message);
    }
  }
  if (total > 0) {
    console.log(`[AlertGen] Generated ${total} alerts across ${distinctUsers.length} users`);
  }
  return total;
}
