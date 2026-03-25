import { db } from "../db";
import { intelReports, intelSources } from "@shared/schema";
import { desc, gte } from "drizzle-orm";

export interface NewsWarning {
  playerName: string;
  headline: string;
  summary: string;
  severity: "high" | "medium" | "low";
  category: string;
  sourceUrl: string | null;
  reportedAt: string;
}

const HIGH_KEYWORDS = ["ruled out", "acl", "concuss", "suspended", "unavailable", "late withdrawal", "season-ending", "out indefinitely", "torn"];
const MED_KEYWORDS = ["hamstring", "injur", "omitted", "dropped", "axed", "late change", "not named", "corked", "calf", "groin", "fracture"];
const LOW_KEYWORDS = ["managed", "rested", "soreness", "tagging", "tag role", "vest", "role change", "limited minutes", "restricted"];

function normalizeForMatch(name: string): string {
  return name.toLowerCase().replace(/[''`\-]/g, "").replace(/\s+/g, " ").trim();
}

function findPlayerMentionIndex(text: string, playerName: string): number {
  const normalized = normalizeForMatch(text);
  const normalizedPlayer = normalizeForMatch(playerName);

  const fullNameRegex = new RegExp(`\\b${escapeRegex(normalizedPlayer)}\\b`);
  const fullMatch = fullNameRegex.exec(normalized);
  if (fullMatch) return fullMatch.index;

  return -1;
}

function isPlayerInStructuredField(fieldText: string | null, playerName: string): boolean {
  if (!fieldText) return false;
  const normalized = normalizeForMatch(fieldText);
  const normalizedPlayer = normalizeForMatch(playerName);
  const fullNameRegex = new RegExp(`\\b${escapeRegex(normalizedPlayer)}\\b`);
  if (fullNameRegex.test(normalized)) return true;

  const parts = normalizedPlayer.split(" ");
  if (parts.length >= 2) {
    const surname = parts[parts.length - 1];
    if (surname.length >= 5) {
      const surnameRegex = new RegExp(`\\b${escapeRegex(surname)}\\b`);
      if (surnameRegex.test(normalized)) return true;
    }
  }
  return false;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractLocalWindow(text: string, mentionIndex: number, windowSize: number = 300): string {
  const start = Math.max(0, mentionIndex - windowSize);
  const end = Math.min(text.length, mentionIndex + windowSize);
  return text.slice(start, end).toLowerCase();
}

function extractConcernFromWindow(window: string): { severity: "high" | "medium" | "low"; keyword: string } | null {
  for (const kw of HIGH_KEYWORDS) {
    if (window.includes(kw)) return { severity: "high", keyword: kw };
  }
  for (const kw of MED_KEYWORDS) {
    if (window.includes(kw)) return { severity: "medium", keyword: kw };
  }
  for (const kw of LOW_KEYWORDS) {
    if (window.includes(kw)) return { severity: "low", keyword: kw };
  }
  return null;
}

export async function checkPlayersAgainstNews(
  playerNames: string[],
): Promise<Map<string, NewsWarning[]>> {
  const warnings = new Map<string, NewsWarning[]>();
  if (playerNames.length === 0) return warnings;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  const [reports, sources] = await Promise.all([
    db.select().from(intelReports)
      .where(gte(intelReports.createdAt, cutoff))
      .orderBy(desc(intelReports.createdAt))
      .limit(200),
    db.select({
      title: intelSources.title,
      rawContent: intelSources.rawContent,
      sourceUrl: intelSources.sourceUrl,
      fetchedAt: intelSources.fetchedAt,
      processedInsights: intelSources.processedInsights,
      relevantPlayerNames: intelSources.relevantPlayerNames,
    }).from(intelSources)
      .where(gte(intelSources.fetchedAt, cutoff))
      .orderBy(desc(intelSources.fetchedAt))
      .limit(300),
  ]);

  for (const playerName of playerNames) {
    const playerWarnings: NewsWarning[] = [];
    const seenHeadlines = new Set<string>();

    for (const report of reports) {
      if (seenHeadlines.has(report.title)) continue;

      const inStructuredField = isPlayerInStructuredField(report.playerNames, playerName);
      const fullText = `${report.title} ${report.content}`;
      const mentionIdx = findPlayerMentionIndex(fullText, playerName);

      if (!inStructuredField && mentionIdx < 0) continue;

      let concern: { severity: "high" | "medium" | "low"; keyword: string } | null = null;

      if (inStructuredField) {
        concern = extractConcernFromWindow(fullText.toLowerCase());
      } else if (mentionIdx >= 0) {
        const window = extractLocalWindow(fullText, mentionIdx);
        concern = extractConcernFromWindow(window);
      }

      if (!concern) continue;

      seenHeadlines.add(report.title);
      playerWarnings.push({
        playerName,
        headline: report.title,
        summary: report.content.length > 200 ? report.content.slice(0, 200) + "…" : report.content,
        severity: concern.severity,
        category: report.category,
        sourceUrl: report.sourceUrl || null,
        reportedAt: report.createdAt?.toISOString() || new Date().toISOString(),
      });
    }

    for (const source of sources) {
      if (seenHeadlines.has(source.title)) continue;

      const inStructuredField = isPlayerInStructuredField(source.relevantPlayerNames, playerName);
      const fullText = `${source.title} ${source.rawContent}`;
      const mentionIdx = findPlayerMentionIndex(fullText, playerName);

      if (!inStructuredField && mentionIdx < 0) continue;

      let concern: { severity: "high" | "medium" | "low"; keyword: string } | null = null;

      if (inStructuredField) {
        const checkText = `${fullText} ${source.processedInsights || ""}`.toLowerCase();
        concern = extractConcernFromWindow(checkText);
      } else if (mentionIdx >= 0) {
        const window = extractLocalWindow(fullText, mentionIdx);
        concern = extractConcernFromWindow(window);
      }

      if (!concern) continue;

      seenHeadlines.add(source.title);
      playerWarnings.push({
        playerName,
        headline: source.title,
        summary: source.rawContent.length > 200 ? source.rawContent.slice(0, 200) + "…" : source.rawContent,
        severity: concern.severity,
        category: "news",
        sourceUrl: source.sourceUrl || null,
        reportedAt: source.fetchedAt?.toISOString() || new Date().toISOString(),
      });
    }

    playerWarnings.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    if (playerWarnings.length > 0) {
      warnings.set(playerName, playerWarnings.slice(0, 3));
    }
  }

  return warnings;
}

export function formatNewsWarningForReason(warning: NewsWarning): string {
  const prefix = warning.severity === "high" ? "⚠️ NEWS ALERT:" :
                 warning.severity === "medium" ? "⚠️ NEWS:" : "📰 NOTE:";
  const link = warning.sourceUrl ? ` [Source: ${warning.sourceUrl}]` : "";
  return `${prefix} ${warning.headline}${link}`;
}
