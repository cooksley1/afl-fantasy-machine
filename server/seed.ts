import { db } from "./db";
import { players, myTeamPlayers, leagueSettings } from "@shared/schema";
import { eq } from "drizzle-orm";

const AFL_PLAYERS = [
  { name: "Lachie Neale", team: "Brisbane Lions", position: "MID", price: 620000, avgScore: 112.5, last3Avg: 125.0, last5Avg: 118.3, seasonTotal: 1575, gamesPlayed: 14, ownedByPercent: 62, formTrend: "up", nextOpponent: "Melbourne", byeRound: 13 },
  { name: "Marcus Bontempelli", team: "Western Bulldogs", position: "MID", price: 615000, avgScore: 110.8, last3Avg: 105.2, last5Avg: 108.1, seasonTotal: 1551, gamesPlayed: 14, ownedByPercent: 58, formTrend: "stable", nextOpponent: "Carlton", byeRound: 14 },
  { name: "Clayton Oliver", team: "Melbourne", position: "MID", price: 580000, avgScore: 108.3, last3Avg: 98.7, last5Avg: 102.5, seasonTotal: 1516, gamesPlayed: 14, ownedByPercent: 45, formTrend: "down", nextOpponent: "Brisbane Lions", byeRound: 13 },
  { name: "Christian Petracca", team: "Melbourne", position: "MID", price: 595000, avgScore: 107.1, last3Avg: 115.3, last5Avg: 112.0, seasonTotal: 1499, gamesPlayed: 14, ownedByPercent: 52, formTrend: "up", nextOpponent: "Brisbane Lions", byeRound: 13 },
  { name: "Zak Butters", team: "Port Adelaide", position: "MID", price: 545000, avgScore: 105.2, last3Avg: 118.7, last5Avg: 112.4, seasonTotal: 1473, gamesPlayed: 14, ownedByPercent: 48, formTrend: "up", nextOpponent: "Geelong", byeRound: 12 },
  { name: "Tom Green", team: "GWS Giants", position: "MID", price: 530000, avgScore: 103.8, last3Avg: 110.0, last5Avg: 106.5, seasonTotal: 1453, gamesPlayed: 14, ownedByPercent: 35, formTrend: "up", nextOpponent: "Hawthorn", byeRound: 14 },
  { name: "Andrew Brayshaw", team: "Fremantle", position: "MID", price: 560000, avgScore: 102.4, last3Avg: 95.3, last5Avg: 98.8, seasonTotal: 1434, gamesPlayed: 14, ownedByPercent: 40, formTrend: "down", nextOpponent: "West Coast", byeRound: 12 },
  { name: "Errol Gulden", team: "Sydney", position: "MID", price: 520000, avgScore: 101.5, last3Avg: 112.3, last5Avg: 108.7, seasonTotal: 1421, gamesPlayed: 14, ownedByPercent: 42, formTrend: "up", nextOpponent: "Collingwood", byeRound: 13 },

  { name: "Nick Daicos", team: "Collingwood", position: "DEF", price: 600000, avgScore: 115.2, last3Avg: 120.5, last5Avg: 118.0, seasonTotal: 1613, gamesPlayed: 14, ownedByPercent: 72, formTrend: "up", nextOpponent: "Sydney", byeRound: 14 },
  { name: "Jordan Dawson", team: "Adelaide", position: "DEF", price: 510000, avgScore: 98.7, last3Avg: 105.3, last5Avg: 102.1, seasonTotal: 1382, gamesPlayed: 14, ownedByPercent: 38, formTrend: "up", nextOpponent: "Richmond", byeRound: 12 },
  { name: "Sam Docherty", team: "Carlton", position: "DEF", price: 485000, avgScore: 95.4, last3Avg: 88.0, last5Avg: 91.2, seasonTotal: 1336, gamesPlayed: 14, ownedByPercent: 28, formTrend: "down", nextOpponent: "Western Bulldogs", byeRound: 14 },
  { name: "Isaac Heeney", team: "Sydney", position: "FWD", price: 555000, avgScore: 104.6, last3Avg: 115.7, last5Avg: 110.2, seasonTotal: 1464, gamesPlayed: 14, ownedByPercent: 55, formTrend: "up", nextOpponent: "Collingwood", byeRound: 13 },
  { name: "James Sicily", team: "Hawthorn", position: "DEF", price: 490000, avgScore: 96.8, last3Avg: 102.5, last5Avg: 99.3, seasonTotal: 1355, gamesPlayed: 14, ownedByPercent: 32, formTrend: "up", nextOpponent: "GWS Giants", byeRound: 12 },
  { name: "Dayne Zorko", team: "Brisbane Lions", position: "DEF", price: 460000, avgScore: 92.1, last3Avg: 85.3, last5Avg: 88.7, seasonTotal: 1289, gamesPlayed: 14, ownedByPercent: 22, formTrend: "down", nextOpponent: "Melbourne", byeRound: 13 },

  { name: "Tim English", team: "Western Bulldogs", position: "RUC", price: 535000, avgScore: 100.5, last3Avg: 108.3, last5Avg: 104.7, seasonTotal: 1407, gamesPlayed: 14, ownedByPercent: 45, formTrend: "up", nextOpponent: "Carlton", byeRound: 14 },
  { name: "Max Gawn", team: "Melbourne", position: "RUC", price: 520000, avgScore: 98.2, last3Avg: 92.7, last5Avg: 95.1, seasonTotal: 1375, gamesPlayed: 14, ownedByPercent: 40, formTrend: "down", nextOpponent: "Brisbane Lions", byeRound: 13 },
  { name: "Brodie Grundy", team: "Sydney", position: "RUC", price: 495000, avgScore: 95.6, last3Avg: 100.3, last5Avg: 98.0, seasonTotal: 1338, gamesPlayed: 14, ownedByPercent: 35, formTrend: "stable", nextOpponent: "Collingwood", byeRound: 13 },
  { name: "Sean Darcy", team: "Fremantle", position: "RUC", price: 470000, avgScore: 90.3, last3Avg: 95.7, last5Avg: 93.0, seasonTotal: 1264, gamesPlayed: 14, ownedByPercent: 25, formTrend: "up", nextOpponent: "West Coast", byeRound: 12 },

  { name: "Jeremy Cameron", team: "Geelong", position: "FWD", price: 500000, avgScore: 97.3, last3Avg: 105.0, last5Avg: 101.2, seasonTotal: 1362, gamesPlayed: 14, ownedByPercent: 42, formTrend: "up", nextOpponent: "Port Adelaide", byeRound: 14 },
  { name: "Charlie Curnow", team: "Carlton", position: "FWD", price: 480000, avgScore: 93.5, last3Avg: 88.3, last5Avg: 90.8, seasonTotal: 1309, gamesPlayed: 14, ownedByPercent: 35, formTrend: "down", nextOpponent: "Western Bulldogs", byeRound: 14 },
  { name: "Tom Lynch", team: "Richmond", position: "FWD", price: 445000, avgScore: 88.2, last3Avg: 82.0, last5Avg: 85.1, seasonTotal: 1235, gamesPlayed: 14, ownedByPercent: 20, formTrend: "down", nextOpponent: "Adelaide", byeRound: 12 },
  { name: "Harry McKay", team: "Carlton", position: "FWD", price: 435000, avgScore: 85.7, last3Avg: 92.3, last5Avg: 89.0, seasonTotal: 1200, gamesPlayed: 14, ownedByPercent: 18, formTrend: "up", nextOpponent: "Western Bulldogs", byeRound: 14 },
  { name: "Aaron Naughton", team: "Western Bulldogs", position: "FWD", price: 420000, avgScore: 82.4, last3Avg: 78.0, last5Avg: 80.2, seasonTotal: 1154, gamesPlayed: 14, ownedByPercent: 15, formTrend: "stable", nextOpponent: "Carlton", byeRound: 14 },
  { name: "Jesse Hogan", team: "GWS Giants", position: "FWD", price: 430000, avgScore: 84.1, last3Avg: 95.7, last5Avg: 90.3, seasonTotal: 1177, gamesPlayed: 14, ownedByPercent: 22, formTrend: "up", nextOpponent: "Hawthorn", byeRound: 14 },

  { name: "Patrick Cripps", team: "Carlton", position: "MID", price: 590000, avgScore: 106.5, last3Avg: 112.7, last5Avg: 109.8, seasonTotal: 1491, gamesPlayed: 14, ownedByPercent: 50, formTrend: "up", nextOpponent: "Western Bulldogs", byeRound: 14 },
  { name: "Touk Miller", team: "Gold Coast", position: "MID", price: 540000, avgScore: 101.2, last3Avg: 96.0, last5Avg: 98.5, seasonTotal: 1417, gamesPlayed: 14, ownedByPercent: 30, formTrend: "down", nextOpponent: "Essendon", byeRound: 12 },
  { name: "Josh Dunkley", team: "Brisbane Lions", position: "MID", price: 525000, avgScore: 99.8, last3Avg: 108.3, last5Avg: 104.0, seasonTotal: 1397, gamesPlayed: 14, ownedByPercent: 33, formTrend: "up", nextOpponent: "Melbourne", byeRound: 13 },
  { name: "Caleb Serong", team: "Fremantle", position: "MID", price: 510000, avgScore: 97.5, last3Avg: 105.0, last5Avg: 101.2, seasonTotal: 1365, gamesPlayed: 14, ownedByPercent: 28, formTrend: "up", nextOpponent: "West Coast", byeRound: 12 },
  { name: "Sam Walsh", team: "Carlton", position: "MID", price: 505000, avgScore: 96.3, last3Avg: 90.0, last5Avg: 93.1, seasonTotal: 1348, gamesPlayed: 14, ownedByPercent: 25, formTrend: "down", nextOpponent: "Western Bulldogs", byeRound: 14 },

  { name: "Jack Steele", team: "St Kilda", position: "MID", price: 480000, avgScore: 93.8, last3Avg: 100.7, last5Avg: 97.2, seasonTotal: 1313, gamesPlayed: 14, ownedByPercent: 22, formTrend: "up", nextOpponent: "Essendon", byeRound: 12 },
  { name: "Rory Laird", team: "Adelaide", position: "DEF", price: 495000, avgScore: 96.1, last3Avg: 91.3, last5Avg: 93.7, seasonTotal: 1345, gamesPlayed: 14, ownedByPercent: 30, formTrend: "stable", nextOpponent: "Richmond", byeRound: 12 },
  { name: "Jake Lloyd", team: "Sydney", position: "DEF", price: 465000, avgScore: 91.5, last3Avg: 87.0, last5Avg: 89.2, seasonTotal: 1281, gamesPlayed: 14, ownedByPercent: 18, formTrend: "down", nextOpponent: "Collingwood", byeRound: 13 },
  { name: "Adam Treloar", team: "Western Bulldogs", position: "MID", price: 475000, avgScore: 92.8, last3Avg: 86.3, last5Avg: 89.5, seasonTotal: 1299, gamesPlayed: 14, ownedByPercent: 20, formTrend: "down", nextOpponent: "Carlton", byeRound: 14 },
  { name: "Connor Rozee", team: "Port Adelaide", position: "MID", price: 500000, avgScore: 96.0, last3Avg: 103.0, last5Avg: 99.5, seasonTotal: 1344, gamesPlayed: 14, ownedByPercent: 27, formTrend: "up", nextOpponent: "Geelong", byeRound: 12 },
  { name: "Jai Newcombe", team: "Hawthorn", position: "MID", price: 488000, avgScore: 94.2, last3Avg: 100.5, last5Avg: 97.3, seasonTotal: 1319, gamesPlayed: 14, ownedByPercent: 24, formTrend: "up", nextOpponent: "GWS Giants", byeRound: 12 },
  { name: "Dyson Heppell", team: "Essendon", position: "DEF", price: 410000, avgScore: 80.5, last3Avg: 75.0, last5Avg: 77.8, seasonTotal: 1127, gamesPlayed: 14, ownedByPercent: 12, formTrend: "down", nextOpponent: "Gold Coast", byeRound: 13 },
  { name: "Darcy Parish", team: "Essendon", position: "MID", price: 455000, avgScore: 89.3, last3Avg: 96.7, last5Avg: 93.0, seasonTotal: 1250, gamesPlayed: 14, ownedByPercent: 20, formTrend: "up", nextOpponent: "Gold Coast", byeRound: 13 },
  { name: "Jack Viney", team: "Melbourne", position: "MID", price: 440000, avgScore: 86.5, last3Avg: 80.0, last5Avg: 83.2, seasonTotal: 1211, gamesPlayed: 14, ownedByPercent: 14, formTrend: "down", nextOpponent: "Brisbane Lions", byeRound: 13 },
  { name: "Tom Stewart", team: "Geelong", position: "DEF", price: 488000, avgScore: 94.5, last3Avg: 98.7, last5Avg: 96.6, seasonTotal: 1323, gamesPlayed: 14, ownedByPercent: 30, formTrend: "stable", nextOpponent: "Port Adelaide", byeRound: 14 },

  { name: "Hayden Young", team: "Fremantle", position: "DEF", price: 450000, avgScore: 87.8, last3Avg: 94.3, last5Avg: 91.0, seasonTotal: 1229, gamesPlayed: 14, ownedByPercent: 20, formTrend: "up", nextOpponent: "West Coast", byeRound: 12 },
  { name: "Jack Sinclair", team: "St Kilda", position: "DEF", price: 470000, avgScore: 91.0, last3Avg: 95.0, last5Avg: 93.0, seasonTotal: 1274, gamesPlayed: 14, ownedByPercent: 22, formTrend: "up", nextOpponent: "Essendon", byeRound: 12 },

  { name: "Mitch Duncan", team: "Geelong", position: "MID", price: 430000, avgScore: 84.3, last3Avg: 78.0, last5Avg: 81.1, seasonTotal: 1180, gamesPlayed: 14, ownedByPercent: 12, formTrend: "down", nextOpponent: "Port Adelaide", byeRound: 14, injuryStatus: "Hamstring" },
  { name: "Liam Baker", team: "Richmond", position: "DEF", price: 425000, avgScore: 83.5, last3Avg: 90.0, last5Avg: 86.7, seasonTotal: 1169, gamesPlayed: 14, ownedByPercent: 15, formTrend: "up", nextOpponent: "Adelaide", byeRound: 12 },
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
    }).returning();
    createdPlayers.push(created);
  }

  const daicosId = createdPlayers.find(p => p.name === "Nick Daicos")?.id;
  const nealeId = createdPlayers.find(p => p.name === "Lachie Neale")?.id;
  const bontemId = createdPlayers.find(p => p.name === "Marcus Bontempelli")?.id;
  const heeneyId = createdPlayers.find(p => p.name === "Isaac Heeney")?.id;
  const englishId = createdPlayers.find(p => p.name === "Tim English")?.id;
  const dawsonId = createdPlayers.find(p => p.name === "Jordan Dawson")?.id;
  const cameronId = createdPlayers.find(p => p.name === "Jeremy Cameron")?.id;
  const oliverId = createdPlayers.find(p => p.name === "Clayton Oliver")?.id;
  const curnowId = createdPlayers.find(p => p.name === "Charlie Curnow")?.id;
  const gawnId = createdPlayers.find(p => p.name === "Max Gawn")?.id;
  const zorkoId = createdPlayers.find(p => p.name === "Dayne Zorko")?.id;
  const dochertyId = createdPlayers.find(p => p.name === "Sam Docherty")?.id;

  const teamEntries = [
    { playerId: daicosId!, isOnField: true, isCaptain: true, isViceCaptain: false, fieldPosition: "DEF" },
    { playerId: dawsonId!, isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "DEF" },
    { playerId: zorkoId!, isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "DEF" },
    { playerId: dochertyId!, isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "DEF" },
    { playerId: nealeId!, isOnField: true, isCaptain: false, isViceCaptain: true, fieldPosition: "MID" },
    { playerId: bontemId!, isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
    { playerId: oliverId!, isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "MID" },
    { playerId: englishId!, isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "RUC" },
    { playerId: gawnId!, isOnField: false, isCaptain: false, isViceCaptain: false, fieldPosition: "RUC" },
    { playerId: heeneyId!, isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "FWD" },
    { playerId: cameronId!, isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "FWD" },
    { playerId: curnowId!, isOnField: true, isCaptain: false, isViceCaptain: false, fieldPosition: "FWD" },
  ];

  for (const entry of teamEntries) {
    await db.insert(myTeamPlayers).values(entry);
  }

  await db.insert(leagueSettings).values({
    teamName: "Fantasy Demons",
    salaryCap: 10000000,
    currentRound: 15,
    tradesRemaining: 18,
    totalTradesUsed: 12,
  });

  console.log("Database seeded successfully with", createdPlayers.length, "players and a starting team.");
}
