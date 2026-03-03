import { db } from "./db";
import { players, myTeamPlayers, leagueSettings } from "@shared/schema";
import { eq } from "drizzle-orm";

const AFL_PLAYERS = [
  { name: "Lachie Neale", team: "Brisbane Lions", position: "MID", price: 620000, avgScore: 112.5, last3Avg: 125.0, last5Avg: 118.3, seasonTotal: 1575, gamesPlayed: 14, ownedByPercent: 62, formTrend: "up", nextOpponent: "Melbourne", byeRound: 13, venue: "The Gabba", gameTime: "Saturday 4:35pm", projectedScore: 118, breakEven: 105, ceilingScore: 162, priceChange: 12000 },
  { name: "Marcus Bontempelli", team: "Western Bulldogs", position: "MID", price: 615000, avgScore: 110.8, last3Avg: 105.2, last5Avg: 108.1, seasonTotal: 1551, gamesPlayed: 14, ownedByPercent: 58, formTrend: "stable", nextOpponent: "Carlton", byeRound: 14, venue: "Marvel Stadium", gameTime: "Friday 7:50pm", projectedScore: 108, breakEven: 110, ceilingScore: 155, priceChange: -3000, dualPosition: "FWD" },
  { name: "Clayton Oliver", team: "Melbourne", position: "MID", price: 580000, avgScore: 108.3, last3Avg: 98.7, last5Avg: 102.5, seasonTotal: 1516, gamesPlayed: 14, ownedByPercent: 45, formTrend: "down", nextOpponent: "Brisbane Lions", byeRound: 13, venue: "The Gabba", gameTime: "Saturday 4:35pm", projectedScore: 100, breakEven: 118, ceilingScore: 148, priceChange: -15000 },
  { name: "Christian Petracca", team: "Melbourne", position: "MID", price: 595000, avgScore: 107.1, last3Avg: 115.3, last5Avg: 112.0, seasonTotal: 1499, gamesPlayed: 14, ownedByPercent: 52, formTrend: "up", nextOpponent: "Brisbane Lions", byeRound: 13, venue: "The Gabba", gameTime: "Saturday 4:35pm", projectedScore: 112, breakEven: 100, ceilingScore: 158, priceChange: 8000 },
  { name: "Zak Butters", team: "Port Adelaide", position: "MID", price: 545000, avgScore: 105.2, last3Avg: 118.7, last5Avg: 112.4, seasonTotal: 1473, gamesPlayed: 14, ownedByPercent: 48, formTrend: "up", nextOpponent: "Geelong", byeRound: 12, venue: "Adelaide Oval", gameTime: "Saturday 7:25pm", projectedScore: 115, breakEven: 90, ceilingScore: 152, priceChange: 18000, dualPosition: "FWD" },
  { name: "Tom Green", team: "GWS Giants", position: "MID", price: 530000, avgScore: 103.8, last3Avg: 110.0, last5Avg: 106.5, seasonTotal: 1453, gamesPlayed: 14, ownedByPercent: 35, formTrend: "up", nextOpponent: "Hawthorn", byeRound: 14, venue: "GIANTS Stadium", gameTime: "Sunday 1:10pm", projectedScore: 108, breakEven: 95, ceilingScore: 145, priceChange: 10000 },
  { name: "Andrew Brayshaw", team: "Fremantle", position: "MID", price: 560000, avgScore: 102.4, last3Avg: 95.3, last5Avg: 98.8, seasonTotal: 1434, gamesPlayed: 14, ownedByPercent: 40, formTrend: "down", nextOpponent: "West Coast", byeRound: 12, venue: "Optus Stadium", gameTime: "Sunday 3:20pm", projectedScore: 100, breakEven: 115, ceilingScore: 140, priceChange: -8000 },
  { name: "Errol Gulden", team: "Sydney", position: "MID", price: 520000, avgScore: 101.5, last3Avg: 112.3, last5Avg: 108.7, seasonTotal: 1421, gamesPlayed: 14, ownedByPercent: 42, formTrend: "up", nextOpponent: "Collingwood", byeRound: 13, venue: "SCG", gameTime: "Saturday 1:45pm", projectedScore: 110, breakEven: 88, ceilingScore: 148, priceChange: 14000 },

  { name: "Nick Daicos", team: "Collingwood", position: "DEF", dualPosition: "MID", price: 600000, avgScore: 115.2, last3Avg: 120.5, last5Avg: 118.0, seasonTotal: 1613, gamesPlayed: 14, ownedByPercent: 72, formTrend: "up", nextOpponent: "Sydney", byeRound: 14, venue: "SCG", gameTime: "Saturday 1:45pm", projectedScore: 118, breakEven: 108, ceilingScore: 168, priceChange: 10000 },
  { name: "Jordan Dawson", team: "Adelaide", position: "DEF", dualPosition: "MID", price: 510000, avgScore: 98.7, last3Avg: 105.3, last5Avg: 102.1, seasonTotal: 1382, gamesPlayed: 14, ownedByPercent: 38, formTrend: "up", nextOpponent: "Richmond", byeRound: 12, venue: "Adelaide Oval", gameTime: "Saturday 1:45pm", projectedScore: 104, breakEven: 90, ceilingScore: 138, priceChange: 7000 },
  { name: "Sam Docherty", team: "Carlton", position: "DEF", price: 485000, avgScore: 95.4, last3Avg: 88.0, last5Avg: 91.2, seasonTotal: 1336, gamesPlayed: 14, ownedByPercent: 28, formTrend: "down", nextOpponent: "Western Bulldogs", byeRound: 14, venue: "Marvel Stadium", gameTime: "Friday 7:50pm", projectedScore: 90, breakEven: 108, ceilingScore: 130, priceChange: -6000, injuryStatus: "Managed" },
  { name: "Isaac Heeney", team: "Sydney", position: "FWD", dualPosition: "MID", price: 555000, avgScore: 104.6, last3Avg: 115.7, last5Avg: 110.2, seasonTotal: 1464, gamesPlayed: 14, ownedByPercent: 55, formTrend: "up", nextOpponent: "Collingwood", byeRound: 13, venue: "SCG", gameTime: "Saturday 1:45pm", projectedScore: 112, breakEven: 92, ceilingScore: 155, priceChange: 12000 },
  { name: "James Sicily", team: "Hawthorn", position: "DEF", price: 490000, avgScore: 96.8, last3Avg: 102.5, last5Avg: 99.3, seasonTotal: 1355, gamesPlayed: 14, ownedByPercent: 32, formTrend: "up", nextOpponent: "GWS Giants", byeRound: 12, venue: "GIANTS Stadium", gameTime: "Sunday 1:10pm", projectedScore: 100, breakEven: 92, ceilingScore: 135, priceChange: 5000 },
  { name: "Dayne Zorko", team: "Brisbane Lions", position: "DEF", dualPosition: "FWD", price: 460000, avgScore: 92.1, last3Avg: 85.3, last5Avg: 88.7, seasonTotal: 1289, gamesPlayed: 14, ownedByPercent: 22, formTrend: "down", nextOpponent: "Melbourne", byeRound: 13, venue: "The Gabba", gameTime: "Saturday 4:35pm", projectedScore: 88, breakEven: 100, ceilingScore: 125, priceChange: -5000 },

  { name: "Tim English", team: "Western Bulldogs", position: "RUC", dualPosition: "FWD", price: 535000, avgScore: 100.5, last3Avg: 108.3, last5Avg: 104.7, seasonTotal: 1407, gamesPlayed: 14, ownedByPercent: 45, formTrend: "up", nextOpponent: "Carlton", byeRound: 14, venue: "Marvel Stadium", gameTime: "Friday 7:50pm", projectedScore: 106, breakEven: 92, ceilingScore: 140, priceChange: 8000 },
  { name: "Max Gawn", team: "Melbourne", position: "RUC", price: 520000, avgScore: 98.2, last3Avg: 92.7, last5Avg: 95.1, seasonTotal: 1375, gamesPlayed: 14, ownedByPercent: 40, formTrend: "down", nextOpponent: "Brisbane Lions", byeRound: 13, venue: "The Gabba", gameTime: "Saturday 4:35pm", projectedScore: 94, breakEven: 108, ceilingScore: 135, priceChange: -6000 },
  { name: "Brodie Grundy", team: "Sydney", position: "RUC", price: 495000, avgScore: 95.6, last3Avg: 100.3, last5Avg: 98.0, seasonTotal: 1338, gamesPlayed: 14, ownedByPercent: 35, formTrend: "stable", nextOpponent: "Collingwood", byeRound: 13, venue: "SCG", gameTime: "Saturday 1:45pm", projectedScore: 97, breakEven: 95, ceilingScore: 130, priceChange: 2000 },
  { name: "Sean Darcy", team: "Fremantle", position: "RUC", price: 470000, avgScore: 90.3, last3Avg: 95.7, last5Avg: 93.0, seasonTotal: 1264, gamesPlayed: 14, ownedByPercent: 25, formTrend: "up", nextOpponent: "West Coast", byeRound: 12, venue: "Optus Stadium", gameTime: "Sunday 3:20pm", projectedScore: 94, breakEven: 85, ceilingScore: 128, priceChange: 6000 },

  { name: "Jeremy Cameron", team: "Geelong", position: "FWD", price: 500000, avgScore: 97.3, last3Avg: 105.0, last5Avg: 101.2, seasonTotal: 1362, gamesPlayed: 14, ownedByPercent: 42, formTrend: "up", nextOpponent: "Port Adelaide", byeRound: 14, venue: "Adelaide Oval", gameTime: "Saturday 7:25pm", projectedScore: 103, breakEven: 90, ceilingScore: 142, priceChange: 7000 },
  { name: "Charlie Curnow", team: "Carlton", position: "FWD", price: 480000, avgScore: 93.5, last3Avg: 88.3, last5Avg: 90.8, seasonTotal: 1309, gamesPlayed: 14, ownedByPercent: 35, formTrend: "down", nextOpponent: "Western Bulldogs", byeRound: 14, venue: "Marvel Stadium", gameTime: "Friday 7:50pm", projectedScore: 90, breakEven: 102, ceilingScore: 135, priceChange: -4000 },
  { name: "Tom Lynch", team: "Richmond", position: "FWD", price: 445000, avgScore: 88.2, last3Avg: 82.0, last5Avg: 85.1, seasonTotal: 1235, gamesPlayed: 14, ownedByPercent: 20, formTrend: "down", nextOpponent: "Adelaide", byeRound: 12, venue: "Adelaide Oval", gameTime: "Saturday 1:45pm", projectedScore: 84, breakEven: 95, ceilingScore: 120, priceChange: -5000 },
  { name: "Harry McKay", team: "Carlton", position: "FWD", price: 435000, avgScore: 85.7, last3Avg: 92.3, last5Avg: 89.0, seasonTotal: 1200, gamesPlayed: 14, ownedByPercent: 18, formTrend: "up", nextOpponent: "Western Bulldogs", byeRound: 14, venue: "Marvel Stadium", gameTime: "Friday 7:50pm", projectedScore: 91, breakEven: 78, ceilingScore: 125, priceChange: 5000 },
  { name: "Aaron Naughton", team: "Western Bulldogs", position: "FWD", price: 420000, avgScore: 82.4, last3Avg: 78.0, last5Avg: 80.2, seasonTotal: 1154, gamesPlayed: 14, ownedByPercent: 15, formTrend: "stable", nextOpponent: "Carlton", byeRound: 14, venue: "Marvel Stadium", gameTime: "Friday 7:50pm", projectedScore: 80, breakEven: 85, ceilingScore: 118, priceChange: -2000 },
  { name: "Jesse Hogan", team: "GWS Giants", position: "FWD", price: 430000, avgScore: 84.1, last3Avg: 95.7, last5Avg: 90.3, seasonTotal: 1177, gamesPlayed: 14, ownedByPercent: 22, formTrend: "up", nextOpponent: "Hawthorn", byeRound: 14, venue: "GIANTS Stadium", gameTime: "Sunday 1:10pm", projectedScore: 93, breakEven: 72, ceilingScore: 130, priceChange: 8000 },

  { name: "Patrick Cripps", team: "Carlton", position: "MID", price: 590000, avgScore: 106.5, last3Avg: 112.7, last5Avg: 109.8, seasonTotal: 1491, gamesPlayed: 14, ownedByPercent: 50, formTrend: "up", nextOpponent: "Western Bulldogs", byeRound: 14, venue: "Marvel Stadium", gameTime: "Friday 7:50pm", projectedScore: 110, breakEven: 100, ceilingScore: 152, priceChange: 7000 },
  { name: "Touk Miller", team: "Gold Coast", position: "MID", dualPosition: "DEF", price: 540000, avgScore: 101.2, last3Avg: 96.0, last5Avg: 98.5, seasonTotal: 1417, gamesPlayed: 14, ownedByPercent: 30, formTrend: "down", nextOpponent: "Essendon", byeRound: 12, venue: "People First Stadium", gameTime: "Saturday 4:35pm", projectedScore: 98, breakEven: 108, ceilingScore: 138, priceChange: -5000 },
  { name: "Josh Dunkley", team: "Brisbane Lions", position: "MID", price: 525000, avgScore: 99.8, last3Avg: 108.3, last5Avg: 104.0, seasonTotal: 1397, gamesPlayed: 14, ownedByPercent: 33, formTrend: "up", nextOpponent: "Melbourne", byeRound: 13, venue: "The Gabba", gameTime: "Saturday 4:35pm", projectedScore: 106, breakEven: 88, ceilingScore: 140, priceChange: 9000 },
  { name: "Caleb Serong", team: "Fremantle", position: "MID", price: 510000, avgScore: 97.5, last3Avg: 105.0, last5Avg: 101.2, seasonTotal: 1365, gamesPlayed: 14, ownedByPercent: 28, formTrend: "up", nextOpponent: "West Coast", byeRound: 12, venue: "Optus Stadium", gameTime: "Sunday 3:20pm", projectedScore: 104, breakEven: 88, ceilingScore: 138, priceChange: 8000 },
  { name: "Sam Walsh", team: "Carlton", position: "MID", price: 505000, avgScore: 96.3, last3Avg: 90.0, last5Avg: 93.1, seasonTotal: 1348, gamesPlayed: 14, ownedByPercent: 25, formTrend: "down", nextOpponent: "Western Bulldogs", byeRound: 14, venue: "Marvel Stadium", gameTime: "Friday 7:50pm", projectedScore: 92, breakEven: 105, ceilingScore: 132, priceChange: -4000 },

  { name: "Jack Steele", team: "St Kilda", position: "MID", dualPosition: "FWD", price: 480000, avgScore: 93.8, last3Avg: 100.7, last5Avg: 97.2, seasonTotal: 1313, gamesPlayed: 14, ownedByPercent: 22, formTrend: "up", nextOpponent: "Essendon", byeRound: 12, venue: "Marvel Stadium", gameTime: "Saturday 7:25pm", projectedScore: 99, breakEven: 85, ceilingScore: 135, priceChange: 6000 },
  { name: "Rory Laird", team: "Adelaide", position: "DEF", dualPosition: "MID", price: 495000, avgScore: 96.1, last3Avg: 91.3, last5Avg: 93.7, seasonTotal: 1345, gamesPlayed: 14, ownedByPercent: 30, formTrend: "stable", nextOpponent: "Richmond", byeRound: 12, venue: "Adelaide Oval", gameTime: "Saturday 1:45pm", projectedScore: 95, breakEven: 98, ceilingScore: 132, priceChange: -1000 },
  { name: "Jake Lloyd", team: "Sydney", position: "DEF", price: 465000, avgScore: 91.5, last3Avg: 87.0, last5Avg: 89.2, seasonTotal: 1281, gamesPlayed: 14, ownedByPercent: 18, formTrend: "down", nextOpponent: "Collingwood", byeRound: 13, venue: "SCG", gameTime: "Saturday 1:45pm", projectedScore: 88, breakEven: 98, ceilingScore: 125, priceChange: -3000 },
  { name: "Adam Treloar", team: "Western Bulldogs", position: "MID", price: 475000, avgScore: 92.8, last3Avg: 86.3, last5Avg: 89.5, seasonTotal: 1299, gamesPlayed: 14, ownedByPercent: 20, formTrend: "down", nextOpponent: "Carlton", byeRound: 14, venue: "Marvel Stadium", gameTime: "Friday 7:50pm", projectedScore: 88, breakEven: 102, ceilingScore: 128, priceChange: -5000 },
  { name: "Connor Rozee", team: "Port Adelaide", position: "MID", dualPosition: "FWD", price: 500000, avgScore: 96.0, last3Avg: 103.0, last5Avg: 99.5, seasonTotal: 1344, gamesPlayed: 14, ownedByPercent: 27, formTrend: "up", nextOpponent: "Geelong", byeRound: 12, venue: "Adelaide Oval", gameTime: "Saturday 7:25pm", projectedScore: 101, breakEven: 88, ceilingScore: 140, priceChange: 6000 },
  { name: "Jai Newcombe", team: "Hawthorn", position: "MID", price: 488000, avgScore: 94.2, last3Avg: 100.5, last5Avg: 97.3, seasonTotal: 1319, gamesPlayed: 14, ownedByPercent: 24, formTrend: "up", nextOpponent: "GWS Giants", byeRound: 12, venue: "GIANTS Stadium", gameTime: "Sunday 1:10pm", projectedScore: 99, breakEven: 86, ceilingScore: 132, priceChange: 6000 },
  { name: "Dyson Heppell", team: "Essendon", position: "DEF", price: 410000, avgScore: 80.5, last3Avg: 75.0, last5Avg: 77.8, seasonTotal: 1127, gamesPlayed: 14, ownedByPercent: 12, formTrend: "down", nextOpponent: "Gold Coast", byeRound: 13, venue: "People First Stadium", gameTime: "Saturday 4:35pm", projectedScore: 77, breakEven: 88, ceilingScore: 112, priceChange: -4000 },
  { name: "Darcy Parish", team: "Essendon", position: "MID", price: 455000, avgScore: 89.3, last3Avg: 96.7, last5Avg: 93.0, seasonTotal: 1250, gamesPlayed: 14, ownedByPercent: 20, formTrend: "up", nextOpponent: "Gold Coast", byeRound: 13, venue: "People First Stadium", gameTime: "Saturday 4:35pm", projectedScore: 95, breakEven: 80, ceilingScore: 128, priceChange: 6000 },
  { name: "Jack Viney", team: "Melbourne", position: "MID", price: 440000, avgScore: 86.5, last3Avg: 80.0, last5Avg: 83.2, seasonTotal: 1211, gamesPlayed: 14, ownedByPercent: 14, formTrend: "down", nextOpponent: "Brisbane Lions", byeRound: 13, venue: "The Gabba", gameTime: "Saturday 4:35pm", projectedScore: 82, breakEven: 95, ceilingScore: 118, priceChange: -4000 },
  { name: "Tom Stewart", team: "Geelong", position: "DEF", price: 488000, avgScore: 94.5, last3Avg: 98.7, last5Avg: 96.6, seasonTotal: 1323, gamesPlayed: 14, ownedByPercent: 30, formTrend: "stable", nextOpponent: "Port Adelaide", byeRound: 14, venue: "Adelaide Oval", gameTime: "Saturday 7:25pm", projectedScore: 96, breakEven: 93, ceilingScore: 130, priceChange: 2000 },

  { name: "Hayden Young", team: "Fremantle", position: "DEF", price: 450000, avgScore: 87.8, last3Avg: 94.3, last5Avg: 91.0, seasonTotal: 1229, gamesPlayed: 14, ownedByPercent: 20, formTrend: "up", nextOpponent: "West Coast", byeRound: 12, venue: "Optus Stadium", gameTime: "Sunday 3:20pm", projectedScore: 93, breakEven: 78, ceilingScore: 125, priceChange: 6000 },
  { name: "Jack Sinclair", team: "St Kilda", position: "DEF", dualPosition: "MID", price: 470000, avgScore: 91.0, last3Avg: 95.0, last5Avg: 93.0, seasonTotal: 1274, gamesPlayed: 14, ownedByPercent: 22, formTrend: "up", nextOpponent: "Essendon", byeRound: 12, venue: "Marvel Stadium", gameTime: "Saturday 7:25pm", projectedScore: 94, breakEven: 85, ceilingScore: 128, priceChange: 5000 },

  { name: "Mitch Duncan", team: "Geelong", position: "MID", price: 430000, avgScore: 84.3, last3Avg: 78.0, last5Avg: 81.1, seasonTotal: 1180, gamesPlayed: 14, ownedByPercent: 12, formTrend: "down", nextOpponent: "Port Adelaide", byeRound: 14, venue: "Adelaide Oval", gameTime: "Saturday 7:25pm", projectedScore: 80, breakEven: 92, ceilingScore: 118, priceChange: -3000, injuryStatus: "Hamstring" },
  { name: "Liam Baker", team: "Richmond", position: "DEF", dualPosition: "FWD", price: 425000, avgScore: 83.5, last3Avg: 90.0, last5Avg: 86.7, seasonTotal: 1169, gamesPlayed: 14, ownedByPercent: 15, formTrend: "up", nextOpponent: "Adelaide", byeRound: 12, venue: "Adelaide Oval", gameTime: "Saturday 1:45pm", projectedScore: 89, breakEven: 76, ceilingScore: 120, priceChange: 5000 },
];

export async function seedDatabase() {
  const existingPlayers = await db.select().from(players);
  if (existingPlayers.length > 0) {
    return;
  }

  console.log("Seeding database with AFL player data...");

  const createdPlayers = [];
  for (const p of AFL_PLAYERS) {
    const [created] = await db.insert(players).values({
      name: p.name,
      team: p.team,
      position: p.position,
      dualPosition: p.dualPosition || null,
      price: p.price,
      avgScore: p.avgScore,
      last3Avg: p.last3Avg,
      last5Avg: p.last5Avg,
      seasonTotal: p.seasonTotal,
      gamesPlayed: p.gamesPlayed,
      ownedByPercent: p.ownedByPercent,
      formTrend: p.formTrend,
      injuryStatus: p.injuryStatus || null,
      nextOpponent: p.nextOpponent,
      byeRound: p.byeRound,
      venue: p.venue || null,
      gameTime: p.gameTime || null,
      projectedScore: p.projectedScore || null,
      priceChange: p.priceChange || 0,
      breakEven: p.breakEven || null,
      ceilingScore: p.ceilingScore || null,
    }).returning();
    createdPlayers.push(created);
  }

  const fp = (name: string) => {
    const p = createdPlayers.find(cp => cp.name === name);
    if (!p) return null;
    return p.id;
  };

  const rozeeId = fp("Connor Rozee");
  const sinclairId = fp("Jack Sinclair");
  const dawsonId = fp("Jordan Dawson");
  const buttersId = fp("Zak Butters");
  const parishId = fp("Darcy Parish");
  const grundyId = fp("Brodie Grundy");
  const petracId = fp("Christian Petracca");

  const seedTeamEntries = [
    rozeeId && { playerId: rozeeId, isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "DEF" },
    sinclairId && { playerId: sinclairId, isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "DEF" },
    dawsonId && { playerId: dawsonId, isOnField: true, isCaptain: true, isViceCaptain: false, fieldPosition: "MID" },
    buttersId && { playerId: buttersId, isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
    parishId && { playerId: parishId, isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
    grundyId && { playerId: grundyId, isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "RUC" },
    petracId && { playerId: petracId, isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "FWD" },
  ].filter(Boolean);

  for (const entry of seedTeamEntries) {
    if (entry) await db.insert(myTeamPlayers).values(entry);
  }

  await db.insert(leagueSettings).values({
    teamName: "The Lizards Gulch",
    salaryCap: 18300000,
    currentRound: 1,
    tradesRemaining: 30,
    totalTradesUsed: 0,
  });

  console.log("Database seeded successfully with", createdPlayers.length, "players and a starting team.");
}
