import OpenAI from "openai";
import { db } from "./db";
import { intelSources, intelReports, players } from "@shared/schema";
import { storage } from "./storage";
import { eq, desc, sql } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const UA = "AFL-Fantasy-Machine/1.0 (replit.app; afl-fantasy-advisor)";

interface FetchedItem {
  sourceType: string;
  sourceUrl: string | null;
  title: string;
  rawContent: string;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSquiggleGames(round?: number): Promise<FetchedItem[]> {
  const items: FetchedItem[] = [];
  try {
    const year = new Date().getFullYear();
    let url = `https://api.squiggle.com.au/?q=games;year=${year}`;
    if (round != null) url += `;round=${round}`;
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return items;
    const data = await res.json();
    const games = data.games || [];
    if (games.length > 0) {
      const gamesSummary = games.map((g: any) =>
        `${g.hteam} vs ${g.ateam} @ ${g.venue} | ${g.date} | ` +
        (g.complete === 100 ? `Final: ${g.hscore}-${g.ascore} (Winner: ${g.winner})` : 'Upcoming')
      ).join('\n');
      items.push({
        sourceType: "squiggle_fixtures",
        sourceUrl: url,
        title: `AFL ${year} Round ${round || 'All'} Fixtures & Results`,
        rawContent: gamesSummary,
      });
    }
  } catch (e: any) {
    console.error("Squiggle games fetch error:", e.message);
  }
  return items;
}

async function fetchSquiggleTips(round?: number): Promise<FetchedItem[]> {
  const items: FetchedItem[] = [];
  try {
    const year = new Date().getFullYear();
    let url = `https://api.squiggle.com.au/?q=tips;year=${year}`;
    if (round != null) url += `;round=${round}`;
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return items;
    const data = await res.json();
    const tips = (data.tips || []).filter((t: any) => !t.error);
    if (tips.length > 0) {
      const tipsSummary = tips.map((t: any) =>
        `${t.source}: ${t.hteam} vs ${t.ateam} - Tip: ${t.tip} (${typeof t.confidence === 'number' ? t.confidence.toFixed(0) : t.confidence || 'N/A'}% conf) | Margin: ${typeof t.margin === 'number' ? t.margin.toFixed(1) : t.margin || 'N/A'}`
      ).join('\n');
      items.push({
        sourceType: "squiggle_tips",
        sourceUrl: url,
        title: `Model Predictions Round ${round || 'Current'}`,
        rawContent: tipsSummary,
      });
    }
  } catch (e: any) {
    console.error("Squiggle tips fetch error:", e.message);
  }
  return items;
}

async function fetchSquiggleLadder(): Promise<FetchedItem[]> {
  const items: FetchedItem[] = [];
  try {
    const year = new Date().getFullYear();
    const url = `https://api.squiggle.com.au/?q=standings;year=${year}`;
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return items;
    const data = await res.json();
    const standings = data.standings || [];
    if (standings.length > 0) {
      const sorted = standings.sort((a: any, b: any) => (a.rank || 0) - (b.rank || 0));
      const ladderSummary = sorted.map((s: any) =>
        `${s.rank}. ${s.name} | W${s.wins}-L${s.losses}-D${s.draws || 0} | ${s.percentage?.toFixed(1)}% | Pts: ${s.pts}`
      ).join('\n');
      items.push({
        sourceType: "squiggle_ladder",
        sourceUrl: url,
        title: `AFL ${year} Ladder`,
        rawContent: ladderSummary,
      });
    }
  } catch (e: any) {
    console.error("Squiggle ladder fetch error:", e.message);
  }
  return items;
}

const FANTASY_KEYWORDS = [
  'fantasy', 'supercoach', 'injury', 'injur', 'medical', 'hamstring', 'concuss',
  'trade', 'selection', 'team selection', 'ins and outs', 'named', 'omit',
  'debut', 'return', 'suspend', 'tribunal', 'captain', 'breakout',
  'form', 'role', 'tag', 'tagger', 'position', 'midfield', 'forward',
  'defender', 'ruck', 'late change', 'withdraw', 'rest', 'manage',
  'predicted', 'line up', 'lineup', 'bye', 'vest', 'draft', 'price',
  'score', 'average', 'breakeven', 'cash cow', 'premium', 'mid-pricer',
  'rookie', 'emerging', 'rising star', 'contract', 'sign', 'delist',
  'train', 'training', 'match committee', 'dropped', 'recalled',
  'season over', 'acl', 'surgery', 'scan', 'soreness',
];

const AFL_CLUB_FEEDS: { team: string; shortName: string; query: string; rssUrl?: string }[] = [
  { team: "Adelaide Crows", shortName: "ADE", query: "Adelaide+Crows+AFL" },
  { team: "Brisbane Lions", shortName: "BRL", query: "Brisbane+Lions+AFL" },
  { team: "Carlton", shortName: "CAR", query: "Carlton+Blues+AFL" },
  { team: "Collingwood", shortName: "COL", query: "Collingwood+Magpies+AFL" },
  { team: "Essendon", shortName: "ESS", query: "Essendon+Bombers+AFL" },
  { team: "Fremantle", shortName: "FRE", query: "Fremantle+Dockers+AFL" },
  { team: "Geelong Cats", shortName: "GEE", query: "Geelong+Cats+AFL" },
  { team: "Gold Coast Suns", shortName: "GCS", query: "Gold+Coast+Suns+AFL" },
  { team: "GWS Giants", shortName: "GWS", query: "GWS+Giants+AFL" },
  { team: "Hawthorn", shortName: "HAW", query: "Hawthorn+Hawks+AFL" },
  { team: "Melbourne", shortName: "MEL", query: "Melbourne+Demons+AFL", rssUrl: "https://www.melbournefc.com.au/rss" },
  { team: "North Melbourne", shortName: "NTH", query: "North+Melbourne+Kangaroos+AFL" },
  { team: "Port Adelaide", shortName: "PTA", query: "Port+Adelaide+Power+AFL" },
  { team: "Richmond", shortName: "RIC", query: "Richmond+Tigers+AFL" },
  { team: "St Kilda", shortName: "STK", query: "St+Kilda+Saints+AFL" },
  { team: "Sydney Swans", shortName: "SYD", query: "Sydney+Swans+AFL" },
  { team: "West Coast Eagles", shortName: "WCE", query: "West+Coast+Eagles+AFL" },
  { team: "Western Bulldogs", shortName: "WBD", query: "Western+Bulldogs+AFL" },
];

function parseRSSItems(xml: string): { title: string; link: string; desc: string; pubDate: string; source?: string }[] {
  const rssItems = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return rssItems.map(item => {
    const titleCdata = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1];
    const titlePlain = item.match(/<title>(.*?)<\/title>/)?.[1];
    const title = titleCdata || titlePlain || '';
    const link = item.match(/<link>(.*?)<\/link>/)?.[1] || '';
    const descCdata = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1];
    const descPlain = item.match(/<description>(.*?)<\/description>/)?.[1];
    const desc = descCdata || descPlain || '';
    const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
    const source = item.match(/<source[^>]*>(.*?)<\/source>/)?.[1] || '';
    return { title, link, desc: desc.replace(/<[^>]*>/g, '').trim(), pubDate, source };
  });
}

function isFantasyRelevant(text: string): boolean {
  const lower = text.toLowerCase();
  return FANTASY_KEYWORDS.some(kw => lower.includes(kw));
}

async function fetchAFLRSS(): Promise<FetchedItem[]> {
  const items: FetchedItem[] = [];
  try {
    const res = await fetchWithTimeout("https://www.afl.com.au/rss", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AFL-Fantasy-Machine/1.0)" }
    });
    if (!res.ok) return items;
    const xml = await res.text();
    const parsed = parseRSSItems(xml);

    for (const entry of parsed.slice(0, 20)) {
      const combined = `${entry.title} ${entry.desc}`;
      if (isFantasyRelevant(combined)) {
        items.push({
          sourceType: "afl_news",
          sourceUrl: entry.link,
          title: entry.title,
          rawContent: `${entry.title}\n${entry.desc}\nPublished: ${entry.pubDate}`,
        });
      }
    }
  } catch (e: any) {
    console.error("AFL RSS fetch error:", e.message);
  }
  return items;
}

async function fetchClubOfficialRSS(club: typeof AFL_CLUB_FEEDS[0]): Promise<FetchedItem[]> {
  if (!club.rssUrl) return [];
  const items: FetchedItem[] = [];
  try {
    const res = await fetchWithTimeout(club.rssUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AFL-Fantasy-Machine/1.0)" }
    });
    if (!res.ok) return items;
    const xml = await res.text();
    if (!xml.includes('<rss') && !xml.includes('<?xml')) return items;
    const parsed = parseRSSItems(xml);

    for (const entry of parsed.slice(0, 10)) {
      items.push({
        sourceType: "club_official",
        sourceUrl: entry.link,
        title: `[${club.shortName}] ${entry.title}`,
        rawContent: `Team: ${club.team}\n${entry.title}\n${entry.desc}\nPublished: ${entry.pubDate}`,
      });
    }
    console.log(`[DataGatherer] ${club.team} official RSS: ${items.length} items`);
  } catch (e: any) {
    console.error(`[DataGatherer] ${club.team} RSS error:`, e.message);
  }
  return items;
}

async function fetchClubGoogleNews(club: typeof AFL_CLUB_FEEDS[0]): Promise<FetchedItem[]> {
  const items: FetchedItem[] = [];
  try {
    const url = `https://news.google.com/rss/search?q=${club.query}&hl=en-AU&gl=AU&ceid=AU:en`;
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
    }, 12000);
    if (!res.ok) return items;
    const xml = await res.text();
    const parsed = parseRSSItems(xml);

    for (const entry of parsed.slice(0, 5)) {
      const cleanTitle = entry.title.replace(/ - [^-]+$/, '').trim();
      const sourceName = entry.source || entry.title.match(/ - ([^-]+)$/)?.[1]?.trim() || '';
      items.push({
        sourceType: "club_news",
        sourceUrl: entry.link,
        title: `[${club.shortName}] ${cleanTitle}`,
        rawContent: `Team: ${club.team}\nSource: ${sourceName}\n${cleanTitle}\n${entry.desc}\nPublished: ${entry.pubDate}`,
      });
    }
  } catch (e: any) {
    console.error(`[DataGatherer] ${club.team} Google News error:`, e.message);
  }
  return items;
}

async function fetchAllClubFeeds(): Promise<FetchedItem[]> {
  const allItems: FetchedItem[] = [];
  const BATCH_SIZE = 4;

  for (let i = 0; i < AFL_CLUB_FEEDS.length; i += BATCH_SIZE) {
    const batch = AFL_CLUB_FEEDS.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.flatMap(club => [
        fetchClubGoogleNews(club),
        fetchClubOfficialRSS(club),
      ])
    );
    for (const result of results) {
      allItems.push(...result);
    }
    if (i + BATCH_SIZE < AFL_CLUB_FEEDS.length) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  console.log(`[DataGatherer] Fetched ${allItems.length} items from all 18 AFL club feeds`);
  return allItems;
}

const EXTERNAL_RSS_FEEDS: { name: string; url: string; sourceType: string }[] = [
  { name: "Aussie Rules Training", url: "https://aussierulestraining.com/feed/", sourceType: "training_intel" },
  { name: "BigFooty", url: "https://www.bigfooty.com/feed/", sourceType: "community_intel" },
];

async function fetchExternalFeeds(): Promise<FetchedItem[]> {
  const items: FetchedItem[] = [];

  for (const feed of EXTERNAL_RSS_FEEDS) {
    try {
      const res = await fetchWithTimeout(feed.url, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
      }, 12000);
      if (!res.ok) continue;
      const xml = await res.text();
      const parsed = parseRSSItems(xml);

      for (const entry of parsed.slice(0, 8)) {
        const cleanTitle = entry.title.replace(/ - [^-]+$/, '').trim();
        const isRelevant = FANTASY_KEYWORDS.some(kw => cleanTitle.toLowerCase().includes(kw)) ||
          cleanTitle.toLowerCase().includes("afl") ||
          cleanTitle.toLowerCase().includes("fantasy") ||
          cleanTitle.toLowerCase().includes("supercoach");
        if (!isRelevant) continue;

        items.push({
          sourceType: feed.sourceType,
          sourceUrl: entry.link,
          title: cleanTitle,
          rawContent: `Source: ${feed.name}\n${cleanTitle}\n${entry.desc}\nPublished: ${entry.pubDate}`,
        });
      }
      console.log(`[DataGatherer] ${feed.name} RSS: ${parsed.length} items, ${items.length} relevant`);
    } catch (e: any) {
      console.error(`[DataGatherer] ${feed.name} RSS error:`, e.message);
    }
  }
  return items;
}

async function fetchFantasySpecificNews(): Promise<FetchedItem[]> {
  const items: FetchedItem[] = [];
  const queries = [
    "AFL+Fantasy+2026",
    "AFL+SuperCoach+2026",
    "AFL+injury+list+round",
    "AFL+team+selection+ins+outs",
  ];

  for (const query of queries) {
    try {
      const url = `https://news.google.com/rss/search?q=${query}&hl=en-AU&gl=AU&ceid=AU:en`;
      const res = await fetchWithTimeout(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
      }, 12000);
      if (!res.ok) continue;
      const xml = await res.text();
      const parsed = parseRSSItems(xml);

      for (const entry of parsed.slice(0, 5)) {
        const cleanTitle = entry.title.replace(/ - [^-]+$/, '').trim();
        const sourceName = entry.source || entry.title.match(/ - ([^-]+)$/)?.[1]?.trim() || '';
        items.push({
          sourceType: "fantasy_news",
          sourceUrl: entry.link,
          title: cleanTitle,
          rawContent: `Source: ${sourceName}\n${cleanTitle}\n${entry.desc}\nPublished: ${entry.pubDate}`,
        });
      }
    } catch (e: any) {
      console.error(`[DataGatherer] Fantasy news error (${query}):`, e.message);
    }
  }
  return items;
}

async function fetchAFLArticleContent(url: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AFL-Fantasy-Machine/1.0)" }
    });
    if (!res.ok) return "";
    const html = await res.text();
    const articleMatch = html.match(/<article[\s\S]*?<\/article>/i);
    if (!articleMatch) return "";
    const text = articleMatch[0]
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.substring(0, 5000);
  } catch {
    return "";
  }
}

async function isDuplicate(title: string): Promise<boolean> {
  const existing = await db.select({ id: intelSources.id })
    .from(intelSources)
    .where(eq(intelSources.title, title))
    .limit(1);
  return existing.length > 0;
}

export async function gatherIntelligence(userId?: string): Promise<{ fetched: number; processed: number }> {
  const settings = await storage.getSettings(userId || "__system__");
  const currentRound = settings.currentRound || 1;

  console.log(`[DataGatherer] Starting intelligence gathering for Round ${currentRound}...`);

  const allItems: FetchedItem[] = [];

  const [fixtures, tips, ladder, aflNews, clubFeeds, fantasyNews, externalFeeds] = await Promise.all([
    fetchSquiggleGames(currentRound),
    fetchSquiggleTips(currentRound),
    fetchSquiggleLadder(),
    fetchAFLRSS(),
    fetchAllClubFeeds(),
    fetchFantasySpecificNews(),
    fetchExternalFeeds(),
  ]);

  allItems.push(...fixtures, ...tips, ...ladder, ...aflNews, ...clubFeeds, ...fantasyNews, ...externalFeeds);

  let fetched = 0;
  for (const item of allItems) {
    if (await isDuplicate(item.title)) continue;

    if (item.sourceType === "afl_news" && item.sourceUrl) {
      const fullContent = await fetchAFLArticleContent(item.sourceUrl);
      if (fullContent) {
        item.rawContent = fullContent;
      }
    }

    await db.insert(intelSources).values({
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl,
      title: item.title,
      rawContent: item.rawContent,
      round: currentRound,
      isProcessed: false,
      isActionable: false,
    });
    fetched++;
  }

  console.log(`[DataGatherer] Fetched ${fetched} new items from ${allItems.length} total`);

  const processed = await processUnprocessedIntel(userId);
  return { fetched, processed };
}

async function processUnprocessedIntel(userId: string): Promise<number> {
  const unprocessed = await db.select()
    .from(intelSources)
    .where(eq(intelSources.isProcessed, false))
    .orderBy(desc(intelSources.fetchedAt))
    .limit(20);

  if (unprocessed.length === 0) return 0;

  const allPlayers = await storage.getAllPlayers();
  const myTeam = await storage.getMyTeam(userId);
  const settings = await storage.getSettings(userId);
  const playerNames = allPlayers.map(p => p.name);
  const myTeamNames = myTeam.map(p => p.name);

  const combinedContent = unprocessed.map(s =>
    `[${s.sourceType.toUpperCase()}] ${s.title}\n${s.rawContent}`
  ).join('\n\n---\n\n');

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an AFL Fantasy intelligence analyst. Process raw data sources and extract actionable fantasy insights.

MY TEAM PLAYERS: ${myTeamNames.join(', ')}
CURRENT ROUND: ${settings.currentRound}
KNOWN PLAYERS: ${playerNames.slice(0, 200).join(', ')}

For each source, determine:
1. Which specific AFL Fantasy players are affected
2. What the fantasy impact is (score projection change, price impact, role change, injury risk)
3. Whether it requires action (trade, captain change, bench move)
4. How urgent it is

Return ONLY valid JSON.`
        },
        {
          role: "user",
          content: `Process these intelligence sources and extract AFL Fantasy insights:

${combinedContent}

Return JSON:
{
  "insights": [
    {
      "sourceIndex": 0,
      "summary": "Brief insight summary",
      "playerNames": "comma-separated affected player names",
      "fantasyImpact": "How this affects fantasy scoring/strategy",
      "actionRequired": true/false,
      "urgency": "high" | "medium" | "low",
      "category": "injuries" | "team_selection" | "fixtures" | "form" | "trades" | "captaincy" | "bye_strategy" | "tactical"
    }
  ]
}`
        }
      ],
      temperature: 0.4,
      max_tokens: 6000,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return 0;

    let parsed;
    try { parsed = JSON.parse(content); } catch { return 0; }

    const insights = parsed.insights || [];
    let processedCount = 0;

    for (const insight of insights) {
      const idx = insight.sourceIndex;
      if (idx >= 0 && idx < unprocessed.length) {
        await db.update(intelSources)
          .set({
            isProcessed: true,
            isActionable: insight.actionRequired || false,
            processedInsights: insight.summary + '\n\n' + insight.fantasyImpact,
            relevantPlayerNames: insight.playerNames || null,
            processedAt: new Date(),
          })
          .where(eq(intelSources.id, unprocessed[idx].id));

        if (insight.actionRequired) {
          await storage.createIntelReport({
            category: insight.category || "tactical",
            title: `[Live Intel] ${insight.summary}`,
            content: `${insight.fantasyImpact}\n\nSource: ${unprocessed[idx].title}\nUrgency: ${insight.urgency}`,
            priority: insight.urgency || "medium",
            playerNames: insight.playerNames || null,
            source: unprocessed[idx].sourceType,
            sourceUrl: unprocessed[idx].sourceUrl || null,
            actionable: true,
          });
        }

        processedCount++;
      }
    }

    try {
      const { extractTagMentionsFromText, recordTagMatchup } = await import("./services/tag-intelligence");
      for (const item of unprocessed) {
        const fullText = `${item.title} ${item.rawContent}`;
        const tagMention = extractTagMentionsFromText(fullText);
        if (tagMention && tagMention.possibleTarget) {
          console.log(`[TagIntel] Detected tag mention: ${tagMention.possibleTagger} → ${tagMention.possibleTarget} from "${item.title}"`);
        }
      }
    } catch (tagErr) {
      console.log(`[TagIntel] Tag extraction error: ${(tagErr as Error).message}`);
    }

    for (const item of unprocessed) {
      await db.update(intelSources)
        .set({ isProcessed: true, processedAt: new Date() })
        .where(eq(intelSources.id, item.id));
    }

    console.log(`[DataGatherer] Processed ${processedCount} insights, ${insights.filter((i: any) => i.actionRequired).length} actionable`);

    try {
      const { generateAlertsForAllUsers } = await import("./alert-generator");
      await generateAlertsForAllUsers();
    } catch (alertErr) {
      console.error("[DataGatherer] Alert generation error:", (alertErr as Error).message);
    }

    return processedCount;
  } catch (e: any) {
    console.error("[DataGatherer] Processing error:", e.message);
    return 0;
  }
}

export async function generatePreGameAdvice(userId: string): Promise<{
  tradeDeadlineAdvice: string;
  captainRecommendation: string;
  lastMinuteChanges: string[];
  playerAlerts: { name: string; alert: string; action: string }[];
}> {
  const myTeam = await storage.getMyTeam(userId);
  const settings = await storage.getSettings(userId);

  if (myTeam.length === 0) {
    throw new Error("Add players to your team first");
  }

  const recentIntel = await db.select()
    .from(intelSources)
    .where(eq(intelSources.isProcessed, true))
    .orderBy(desc(intelSources.fetchedAt))
    .limit(20);

  const intelContext = recentIntel.map(s =>
    `[${s.sourceType}] ${s.title}: ${s.processedInsights || s.rawContent.substring(0, 300)}`
  ).join('\n');

  const teamSummary = myTeam.map(p => {
    const parts = [
      `${p.name} (${p.team}, ${p.position}${p.dualPosition ? '/' + p.dualPosition : ''})`,
      `Avg: ${p.avgScore?.toFixed(1)}, L3: ${p.last3Avg?.toFixed(1)}`,
      `BE: ${p.breakEven ?? 'N/A'}, Price: $${(p.price / 1000).toFixed(0)}K`,
      `Game: ${p.gameTime || 'TBA'} @ ${p.venue || 'TBA'} vs ${p.nextOpponent || 'TBA'}`,
    ];
    if (p.injuryStatus) parts.push(`INJURY: ${p.injuryStatus}`);
    if (p.isCaptain) parts.push('[C]');
    if (p.isViceCaptain) parts.push('[VC]');
    return parts.join(' | ');
  }).join('\n');

  const allPlayers = await storage.getAllPlayers();
  const teamIds = new Set(myTeam.map(p => p.id));
  const topAvail = allPlayers.filter(p => !teamIds.has(p.id))
    .sort((a, b) => (b.last3Avg || 0) - (a.last3Avg || 0))
    .slice(0, 30)
    .map(p => `${p.name} (${p.team}, ${p.position}${p.dualPosition ? '/' + p.dualPosition : ''}) Avg:${p.avgScore?.toFixed(1)} L3:${p.last3Avg?.toFixed(1)} BE:${p.breakEven ?? 'N/A'} $${(p.price/1000).toFixed(0)}K`)
    .join('\n');

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are an AFL Fantasy pre-game advisor. The first game of the round is approaching (within 3 hours). Provide FINAL advice before lockout. Be decisive and specific.`
      },
      {
        role: "user",
        content: `ROUND ${settings.currentRound} PRE-GAME ANALYSIS
TRADES REMAINING: ${settings.tradesRemaining}

MY TEAM:
${teamSummary}

LATEST INTELLIGENCE:
${intelContext}

TOP AVAILABLE PLAYERS:
${topAvail}

Return ONLY valid JSON:
{
  "tradeDeadlineAdvice": "Final trade recommendations before lockout - specific in/out with reasoning",
  "captainRecommendation": "Final VC/C recommendation with loophole strategy and decision tree",
  "lastMinuteChanges": ["Alert 1 about late change", "Alert 2"],
  "playerAlerts": [
    {"name": "Player Name", "alert": "What happened/changed", "action": "What to do right now"}
  ]
}`
      }
    ],
    temperature: 0.5,
    max_tokens: 6000,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI");

  const parsed = JSON.parse(content);
  return {
    tradeDeadlineAdvice: parsed.tradeDeadlineAdvice || "",
    captainRecommendation: parsed.captainRecommendation || "",
    lastMinuteChanges: Array.isArray(parsed.lastMinuteChanges) ? parsed.lastMinuteChanges : [],
    playerAlerts: Array.isArray(parsed.playerAlerts) ? parsed.playerAlerts : [],
  };
}

export async function getIntelSourceStats(): Promise<{
  totalSources: number;
  processedCount: number;
  actionableCount: number;
  lastFetched: string | null;
  sourceBreakdown: Record<string, number>;
}> {
  const all = await db.select().from(intelSources).orderBy(desc(intelSources.fetchedAt));
  const breakdown: Record<string, number> = {};
  let processed = 0;
  let actionable = 0;
  for (const s of all) {
    breakdown[s.sourceType] = (breakdown[s.sourceType] || 0) + 1;
    if (s.isProcessed) processed++;
    if (s.isActionable) actionable++;
  }
  return {
    totalSources: all.length,
    processedCount: processed,
    actionableCount: actionable,
    lastFetched: all.length > 0 ? all[0].fetchedAt?.toISOString() || null : null,
    sourceBreakdown: breakdown,
  };
}

export async function getRecentIntelSources(limit = 20): Promise<any[]> {
  return db.select()
    .from(intelSources)
    .orderBy(desc(intelSources.fetchedAt))
    .limit(limit);
}
