import { db } from "./db";
import { players } from "@shared/schema";
import { eq, isNull } from "drizzle-orm";

const EXPANDED_PLAYERS = [
  // ============ PREMIUM DEFENDERS ============
  { name: "Nasiah Wanganeen-Milera", team: "St Kilda", position: "DEF", price: 622300, avgScore: 102.5, last3Avg: 108.0, last5Avg: 105.2, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 54, formTrend: "up", nextOpponent: "Hawthorn", byeRound: 12, venue: "Marvel Stadium", gameTime: "Thursday 7:30pm", projectedScore: 105, breakEven: 95, ceilingScore: 142, priceChange: 0 },
  { name: "Lachie Whitfield", team: "GWS Giants", position: "DEF", price: 555000, avgScore: 98.5, last3Avg: 102.0, last5Avg: 100.2, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 18, formTrend: "stable", nextOpponent: "Melbourne", byeRound: 13, venue: "TIO Traeger Park", gameTime: "Sunday 3:15pm", projectedScore: 100, breakEven: 92, ceilingScore: 135, priceChange: 0 },
  { name: "Nic Newman", team: "Carlton", position: "DEF", price: 439300, avgScore: 88.0, last3Avg: 92.0, last5Avg: 90.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 11, formTrend: "stable", nextOpponent: "Geelong", byeRound: 13, venue: "MCG", gameTime: "Friday 7:40pm", projectedScore: 90, breakEven: 85, ceilingScore: 125, priceChange: 0 },
  { name: "Miles Bergman", team: "Port Adelaide", position: "DEF", price: 447400, avgScore: 89.5, last3Avg: 93.0, last5Avg: 91.2, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 12, formTrend: "up", nextOpponent: "West Coast", byeRound: 12, venue: "Optus Stadium", gameTime: "Saturday 7:35pm", projectedScore: 92, breakEven: 82, ceilingScore: 128, priceChange: 0 },
  { name: "Josh Daicos", team: "Collingwood", position: "DEF", price: 480000, avgScore: 95.0, last3Avg: 100.0, last5Avg: 97.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 25, formTrend: "up", nextOpponent: "Western Bulldogs", byeRound: 13, venue: "Marvel Stadium", gameTime: "Saturday 7:35pm", projectedScore: 98, breakEven: 88, ceilingScore: 135, priceChange: 0 },
  { name: "Colby McKercher", team: "North Melbourne", position: "DEF", price: 449600, avgScore: 90.0, last3Avg: 98.0, last5Avg: 94.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 42, formTrend: "up", nextOpponent: "Fremantle", byeRound: 12, venue: "Hands Oval", gameTime: "Saturday 4:15pm", projectedScore: 95, breakEven: 80, ceilingScore: 130, priceChange: 0 },
  { name: "Bailey Dale", team: "Western Bulldogs", position: "DEF", price: 420000, avgScore: 85.0, last3Avg: 88.0, last5Avg: 86.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 8, formTrend: "stable", nextOpponent: "Collingwood", byeRound: 14, venue: "Marvel Stadium", gameTime: "Saturday 7:35pm", projectedScore: 86, breakEven: 82, ceilingScore: 120, priceChange: 0 },
  { name: "Jordan Clark", team: "Fremantle", position: "DEF", price: 410000, avgScore: 83.0, last3Avg: 86.0, last5Avg: 84.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 7, formTrend: "stable", nextOpponent: "North Melbourne", byeRound: 15, venue: "Optus Stadium", gameTime: "Thursday 7:30pm", projectedScore: 84, breakEven: 80, ceilingScore: 118, priceChange: 0 },
  { name: "Caleb Daniel", team: "North Melbourne", position: "DEF", price: 380000, avgScore: 78.0, last3Avg: 82.0, last5Avg: 80.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 5, formTrend: "stable", nextOpponent: "Fremantle", byeRound: 12, venue: "Hands Oval", gameTime: "Saturday 4:15pm", projectedScore: 80, breakEven: 75, ceilingScore: 115, priceChange: 0 },
  { name: "Harry Sheezel", team: "North Melbourne", position: "MID", dualPosition: "FWD", price: 580400, avgScore: 107.0, last3Avg: 112.0, last5Avg: 109.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 70, formTrend: "up", nextOpponent: "Fremantle", byeRound: 12, venue: "Hands Oval", gameTime: "Saturday 4:15pm", projectedScore: 110, breakEven: 95, ceilingScore: 155, priceChange: 0 },

  // ============ VALUE/ROOKIE DEFENDERS ============
  { name: "Connor Rozee", team: "Port Adelaide", position: "DEF", dualPosition: "MID", price: 568500, avgScore: 100.0, last3Avg: 105.0, last5Avg: 102.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 57, formTrend: "up", nextOpponent: "West Coast", byeRound: 12, venue: "Optus Stadium", gameTime: "Saturday 7:35pm", projectedScore: 103, breakEven: 90, ceilingScore: 145, priceChange: 0 },
  { name: "Zeke Uwland", team: "Gold Coast", position: "DEF", dualPosition: "MID", price: 199000, avgScore: 65.0, last3Avg: 70.0, last5Avg: 67.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 61, formTrend: "up", nextOpponent: "Brisbane Lions", byeRound: 12, venue: "People First Stadium", gameTime: "Saturday 1:15pm", projectedScore: 68, breakEven: 22, ceilingScore: 95, priceChange: 0 },
  { name: "Jai Serong", team: "West Coast", position: "DEF", price: 119900, avgScore: 55.0, last3Avg: 60.0, last5Avg: 57.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 52, formTrend: "up", nextOpponent: "Essendon", byeRound: 15, venue: "Optus Stadium", gameTime: "Sunday 7:20pm", projectedScore: 58, breakEven: 12, ceilingScore: 85, priceChange: 0 },
  { name: "Josh Lindsay", team: "West Coast", position: "DEF", price: 122500, avgScore: 56.0, last3Avg: 62.0, last5Avg: 59.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 50, formTrend: "up", nextOpponent: "Essendon", byeRound: 15, venue: "Optus Stadium", gameTime: "Sunday 7:20pm", projectedScore: 60, breakEven: 14, ceilingScore: 88, priceChange: 0 },
  { name: "Keidean Coleman", team: "Brisbane Lions", position: "DEF", price: 233800, avgScore: 72.0, last3Avg: 80.0, last5Avg: 76.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 49, formTrend: "up", nextOpponent: "Fremantle", byeRound: 15, venue: "The Gabba", gameTime: "Saturday 4:15pm", projectedScore: 78, breakEven: 28, ceilingScore: 105, priceChange: 0 },
  { name: "Josh Gibcus", team: "Richmond", position: "DEF", price: 139600, avgScore: 58.0, last3Avg: 65.0, last5Avg: 61.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 36, formTrend: "up", nextOpponent: "Brisbane Lions", byeRound: 13, venue: "Ninja Stadium", gameTime: "Sunday 1:10pm", projectedScore: 63, breakEven: 15, ceilingScore: 90, priceChange: 0 },
  { name: "Sam Grlj", team: "Fremantle", position: "DEF", dualPosition: "MID", price: 172000, avgScore: 60.0, last3Avg: 67.0, last5Avg: 63.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 42, formTrend: "up", nextOpponent: "North Melbourne", byeRound: 15, venue: "Optus Stadium", gameTime: "Thursday 7:30pm", projectedScore: 65, breakEven: 18, ceilingScore: 92, priceChange: 0 },
  { name: "Harry Dean", team: "Essendon", position: "DEF", price: 194500, avgScore: 64.0, last3Avg: 70.0, last5Avg: 67.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 12, formTrend: "up", nextOpponent: "West Coast", byeRound: 13, venue: "Optus Stadium", gameTime: "Sunday 7:20pm", projectedScore: 68, breakEven: 20, ceilingScore: 95, priceChange: 0 },
  { name: "Xavier Taylor", team: "Western Bulldogs", position: "DEF", price: 158500, avgScore: 58.0, last3Avg: 64.0, last5Avg: 61.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 12, formTrend: "up", nextOpponent: "Collingwood", byeRound: 14, venue: "Marvel Stadium", gameTime: "Saturday 7:35pm", projectedScore: 62, breakEven: 16, ceilingScore: 88, priceChange: 0 },

  // ============ PREMIUM MIDFIELDERS ============
  { name: "Zach Merrett", team: "Essendon", position: "MID", price: 640000, avgScore: 110.0, last3Avg: 115.0, last5Avg: 112.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 45, formTrend: "up", nextOpponent: "West Coast", byeRound: 13, venue: "Optus Stadium", gameTime: "Sunday 7:20pm", projectedScore: 112, breakEven: 102, ceilingScore: 158, priceChange: 0 },
  { name: "Chad Warner", team: "Sydney", position: "MID", price: 580000, avgScore: 105.0, last3Avg: 110.0, last5Avg: 107.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 38, formTrend: "up", nextOpponent: "Richmond", byeRound: 15, venue: "SCG", gameTime: "Saturday 1:15pm", projectedScore: 108, breakEven: 95, ceilingScore: 150, priceChange: 0 },
  { name: "Matt Rowell", team: "Gold Coast", position: "MID", price: 490000, avgScore: 94.0, last3Avg: 100.0, last5Avg: 97.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 20, formTrend: "up", nextOpponent: "Brisbane Lions", byeRound: 12, venue: "People First Stadium", gameTime: "Saturday 1:15pm", projectedScore: 97, breakEven: 85, ceilingScore: 135, priceChange: 0 },
  { name: "Noah Anderson", team: "Gold Coast", position: "MID", price: 510000, avgScore: 96.0, last3Avg: 100.0, last5Avg: 98.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 15, formTrend: "stable", nextOpponent: "Brisbane Lions", byeRound: 12, venue: "People First Stadium", gameTime: "Saturday 1:15pm", projectedScore: 98, breakEven: 90, ceilingScore: 138, priceChange: 0 },
  { name: "Hugh McCluggage", team: "Brisbane Lions", position: "MID", price: 520000, avgScore: 97.5, last3Avg: 102.0, last5Avg: 99.7, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 18, formTrend: "up", nextOpponent: "Fremantle", byeRound: 15, venue: "The Gabba", gameTime: "Saturday 4:15pm", projectedScore: 100, breakEven: 88, ceilingScore: 140, priceChange: 0 },
  { name: "Jack Macrae", team: "Western Bulldogs", position: "MID", price: 480000, avgScore: 92.0, last3Avg: 88.0, last5Avg: 90.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 10, formTrend: "down", nextOpponent: "Collingwood", byeRound: 14, venue: "Marvel Stadium", gameTime: "Saturday 7:35pm", projectedScore: 90, breakEven: 95, ceilingScore: 130, priceChange: -3000 },
  { name: "Jason Horne-Francis", team: "North Melbourne", position: "MID", price: 530000, avgScore: 100.0, last3Avg: 106.0, last5Avg: 103.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 30, formTrend: "up", nextOpponent: "Fremantle", byeRound: 12, venue: "Hands Oval", gameTime: "Saturday 4:15pm", projectedScore: 104, breakEven: 88, ceilingScore: 145, priceChange: 0 },
  { name: "Max Holmes", team: "Geelong", position: "MID", price: 450000, avgScore: 88.0, last3Avg: 92.0, last5Avg: 90.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 12, formTrend: "up", nextOpponent: "Adelaide", byeRound: 14, venue: "Adelaide Oval", gameTime: "Thursday 7:30pm", projectedScore: 90, breakEven: 82, ceilingScore: 128, priceChange: 0 },
  { name: "Harley Reid", team: "West Coast", position: "MID", price: 470000, avgScore: 90.0, last3Avg: 95.0, last5Avg: 92.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 25, formTrend: "up", nextOpponent: "Essendon", byeRound: 15, venue: "Optus Stadium", gameTime: "Sunday 7:20pm", projectedScore: 93, breakEven: 80, ceilingScore: 135, priceChange: 0 },
  { name: "Nick Daicos Jr", team: "Collingwood", position: "MID", price: 560000, avgScore: 103.0, last3Avg: 108.0, last5Avg: 105.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 35, formTrend: "up", nextOpponent: "Western Bulldogs", byeRound: 13, venue: "Marvel Stadium", gameTime: "Saturday 7:35pm", projectedScore: 106, breakEven: 92, ceilingScore: 148, priceChange: 0 },
  { name: "Jordan De Goey", team: "Collingwood", position: "MID", dualPosition: "FWD", price: 321100, avgScore: 78.0, last3Avg: 82.0, last5Avg: 80.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 12, formTrend: "stable", nextOpponent: "Western Bulldogs", byeRound: 13, venue: "Marvel Stadium", gameTime: "Saturday 7:35pm", projectedScore: 80, breakEven: 70, ceilingScore: 125, priceChange: 0, injuryStatus: "Bone bruise - Test" },
  { name: "Scott Pendlebury", team: "Collingwood", position: "MID", price: 400000, avgScore: 82.0, last3Avg: 78.0, last5Avg: 80.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 5, formTrend: "down", nextOpponent: "Western Bulldogs", byeRound: 13, venue: "Marvel Stadium", gameTime: "Saturday 7:35pm", projectedScore: 80, breakEven: 85, ceilingScore: 115, priceChange: -2000 },
  { name: "Tom Mitchell", team: "Collingwood", position: "MID", price: 380000, avgScore: 79.0, last3Avg: 82.0, last5Avg: 80.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 4, formTrend: "stable", nextOpponent: "Western Bulldogs", byeRound: 13, venue: "Marvel Stadium", gameTime: "Saturday 7:35pm", projectedScore: 80, breakEven: 78, ceilingScore: 118, priceChange: 0 },

  // ============ ROOKIE/VALUE MIDFIELDERS ============
  { name: "Jagga Smith", team: "Carlton", position: "MID", price: 119900, avgScore: 55.0, last3Avg: 62.0, last5Avg: 58.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 75, formTrend: "up", nextOpponent: "Geelong", byeRound: 13, venue: "MCG", gameTime: "Friday 7:40pm", projectedScore: 60, breakEven: 12, ceilingScore: 90, priceChange: 0 },
  { name: "Dyson Sharp", team: "Essendon", position: "MID", price: 149500, avgScore: 58.0, last3Avg: 65.0, last5Avg: 61.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 63, formTrend: "up", nextOpponent: "West Coast", byeRound: 13, venue: "Optus Stadium", gameTime: "Sunday 7:20pm", projectedScore: 63, breakEven: 15, ceilingScore: 92, priceChange: 0 },
  { name: "Hayden Young", team: "Fremantle", position: "MID", price: 389000, avgScore: 82.0, last3Avg: 88.0, last5Avg: 85.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 22, formTrend: "up", nextOpponent: "North Melbourne", byeRound: 15, venue: "Optus Stadium", gameTime: "Thursday 7:30pm", projectedScore: 86, breakEven: 72, ceilingScore: 122, priceChange: 0 },

  // ============ PREMIUM RUCKS ============
  { name: "Tristan Xerri", team: "North Melbourne", position: "RUC", price: 687300, avgScore: 115.0, last3Avg: 118.0, last5Avg: 116.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 52, formTrend: "up", nextOpponent: "Fremantle", byeRound: 12, venue: "Hands Oval", gameTime: "Saturday 4:15pm", projectedScore: 116, breakEven: 105, ceilingScore: 155, priceChange: 0 },
  { name: "Darcy Cameron", team: "Collingwood", position: "RUC", price: 602300, avgScore: 100.0, last3Avg: 105.0, last5Avg: 102.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 4, formTrend: "up", nextOpponent: "Western Bulldogs", byeRound: 13, venue: "Marvel Stadium", gameTime: "Saturday 7:35pm", projectedScore: 103, breakEven: 92, ceilingScore: 138, priceChange: 0 },
  { name: "Luke Jackson", team: "Fremantle", position: "RUC", price: 611200, avgScore: 102.0, last3Avg: 98.0, last5Avg: 100.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 25, formTrend: "stable", nextOpponent: "North Melbourne", byeRound: 15, venue: "Optus Stadium", gameTime: "Thursday 7:30pm", projectedScore: 100, breakEven: 98, ceilingScore: 140, priceChange: 0 },
  { name: "Tom De Koning", team: "Carlton", position: "RUC", price: 524300, avgScore: 95.0, last3Avg: 100.0, last5Avg: 97.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 10, formTrend: "up", nextOpponent: "Geelong", byeRound: 13, venue: "MCG", gameTime: "Friday 7:40pm", projectedScore: 98, breakEven: 85, ceilingScore: 132, priceChange: 0 },

  // ============ VALUE/DPP RUCKS ============
  { name: "Sam Draper", team: "Brisbane Lions", position: "RUC", dualPosition: "FWD", price: 396600, avgScore: 80.0, last3Avg: 85.0, last5Avg: 82.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 18, formTrend: "up", nextOpponent: "Fremantle", byeRound: 15, venue: "The Gabba", gameTime: "Saturday 4:15pm", projectedScore: 83, breakEven: 65, ceilingScore: 118, priceChange: 0 },
  { name: "Liam Reidy", team: "Carlton", position: "RUC", dualPosition: "FWD", price: 119900, avgScore: 50.0, last3Avg: 58.0, last5Avg: 54.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 66, formTrend: "up", nextOpponent: "Geelong", byeRound: 13, venue: "MCG", gameTime: "Friday 7:40pm", projectedScore: 55, breakEven: 10, ceilingScore: 82, priceChange: 0 },
  { name: "Cooper Duff-Tytler", team: "West Coast", position: "RUC", dualPosition: "FWD", price: 190000, avgScore: 60.0, last3Avg: 68.0, last5Avg: 64.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 17, formTrend: "up", nextOpponent: "Essendon", byeRound: 15, venue: "Optus Stadium", gameTime: "Sunday 7:20pm", projectedScore: 65, breakEven: 18, ceilingScore: 92, priceChange: 0 },
  { name: "Nick Bryan", team: "Essendon", position: "RUC", price: 257600, avgScore: 70.0, last3Avg: 75.0, last5Avg: 72.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 4, formTrend: "up", nextOpponent: "West Coast", byeRound: 13, venue: "Optus Stadium", gameTime: "Sunday 7:20pm", projectedScore: 73, breakEven: 30, ceilingScore: 105, priceChange: 0, injuryStatus: "ACL - Returning" },
  { name: "Rowan Marshall", team: "St Kilda", position: "RUC", price: 650000, avgScore: 108.0, last3Avg: 105.0, last5Avg: 106.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 15, formTrend: "stable", nextOpponent: "Hawthorn", byeRound: 12, venue: "Marvel Stadium", gameTime: "Thursday 7:30pm", projectedScore: 106, breakEven: 100, ceilingScore: 145, priceChange: 0 },
  { name: "Lloyd Meek", team: "Hawthorn", position: "RUC", price: 550000, avgScore: 95.0, last3Avg: 90.0, last5Avg: 92.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 2, formTrend: "down", nextOpponent: "St Kilda", byeRound: 14, venue: "Marvel Stadium", gameTime: "Thursday 7:30pm", projectedScore: 92, breakEven: 95, ceilingScore: 130, priceChange: -3000 },

  // ============ PREMIUM FORWARDS ============
  { name: "Sam Flanders", team: "St Kilda", position: "FWD", price: 396600, avgScore: 85.0, last3Avg: 92.0, last5Avg: 88.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 64, formTrend: "up", nextOpponent: "Hawthorn", byeRound: 12, venue: "Marvel Stadium", gameTime: "Thursday 7:30pm", projectedScore: 90, breakEven: 65, ceilingScore: 128, priceChange: 0 },
  { name: "Christian Petracca", team: "Gold Coast", position: "MID", dualPosition: "FWD", price: 522300, avgScore: 98.0, last3Avg: 103.0, last5Avg: 100.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 40, formTrend: "up", nextOpponent: "Brisbane Lions", byeRound: 12, venue: "People First Stadium", gameTime: "Saturday 1:15pm", projectedScore: 100, breakEven: 85, ceilingScore: 148, priceChange: 0 },
  { name: "Adam Treloar", team: "Western Bulldogs", position: "MID", dualPosition: "FWD", price: 311700, avgScore: 75.0, last3Avg: 72.0, last5Avg: 73.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 28, formTrend: "down", nextOpponent: "Collingwood", byeRound: 14, venue: "Marvel Stadium", gameTime: "Saturday 7:35pm", projectedScore: 74, breakEven: 72, ceilingScore: 118, priceChange: -2000, injuryStatus: "Calf - Test" },
  { name: "Izak Rankine", team: "Adelaide", position: "MID", dualPosition: "FWD", price: 495000, avgScore: 93.0, last3Avg: 90.0, last5Avg: 91.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 8, formTrend: "down", nextOpponent: "Geelong", byeRound: 12, venue: "Adelaide Oval", gameTime: "Thursday 7:30pm", projectedScore: 90, breakEven: 92, ceilingScore: 140, priceChange: -3000, injuryStatus: "Suspended" },
  { name: "Kysaiah Pickett", team: "Melbourne", position: "MID", dualPosition: "FWD", price: 380000, avgScore: 78.0, last3Avg: 84.0, last5Avg: 81.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 8, formTrend: "up", nextOpponent: "GWS Giants", byeRound: 13, venue: "TIO Traeger Park", gameTime: "Sunday 3:15pm", projectedScore: 82, breakEven: 68, ceilingScore: 120, priceChange: 0 },
  { name: "Josh Rachele", team: "Adelaide", position: "FWD", price: 260000, avgScore: 68.0, last3Avg: 75.0, last5Avg: 71.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 15, formTrend: "up", nextOpponent: "Geelong", byeRound: 12, venue: "Adelaide Oval", gameTime: "Thursday 7:30pm", projectedScore: 73, breakEven: 35, ceilingScore: 110, priceChange: 0 },
  { name: "Riley Thilthorpe", team: "Adelaide", position: "FWD", price: 350000, avgScore: 75.0, last3Avg: 80.0, last5Avg: 77.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 10, formTrend: "up", nextOpponent: "Geelong", byeRound: 12, venue: "Adelaide Oval", gameTime: "Thursday 7:30pm", projectedScore: 78, breakEven: 55, ceilingScore: 115, priceChange: 0 },
  { name: "Sam Darcy", team: "Western Bulldogs", position: "FWD", price: 340000, avgScore: 73.0, last3Avg: 78.0, last5Avg: 75.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 8, formTrend: "up", nextOpponent: "Collingwood", byeRound: 14, venue: "Marvel Stadium", gameTime: "Saturday 7:35pm", projectedScore: 76, breakEven: 50, ceilingScore: 112, priceChange: 0 },
  { name: "Brent Daniels", team: "GWS Giants", position: "FWD", price: 330000, avgScore: 72.0, last3Avg: 76.0, last5Avg: 74.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 6, formTrend: "up", nextOpponent: "Melbourne", byeRound: 13, venue: "TIO Traeger Park", gameTime: "Sunday 3:15pm", projectedScore: 74, breakEven: 48, ceilingScore: 110, priceChange: 0 },
  { name: "Dylan Moore", team: "Hawthorn", position: "FWD", price: 480000, avgScore: 92.0, last3Avg: 95.0, last5Avg: 93.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 22, formTrend: "up", nextOpponent: "St Kilda", byeRound: 14, venue: "Marvel Stadium", gameTime: "Thursday 7:30pm", projectedScore: 94, breakEven: 85, ceilingScore: 135, priceChange: 0 },

  // ============ ROOKIE FORWARDS ============
  { name: "Sam Lalor", team: "Richmond", position: "FWD", price: 119900, avgScore: 50.0, last3Avg: 58.0, last5Avg: 54.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 30, formTrend: "up", nextOpponent: "Brisbane Lions", byeRound: 13, venue: "Ninja Stadium", gameTime: "Sunday 1:10pm", projectedScore: 55, breakEven: 10, ceilingScore: 80, priceChange: 0 },

  // ============ ADDITIONAL TEAM COVERAGE ============
  // Adelaide
  { name: "Matt Crouch", team: "Adelaide", position: "MID", price: 350000, avgScore: 75.0, last3Avg: 72.0, last5Avg: 73.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 3, formTrend: "down", nextOpponent: "Geelong", byeRound: 12, venue: "Adelaide Oval", gameTime: "Thursday 7:30pm", projectedScore: 73, breakEven: 72, ceilingScore: 110, priceChange: -1000 },
  { name: "Ben Keays", team: "Adelaide", position: "MID", price: 460000, avgScore: 90.0, last3Avg: 94.0, last5Avg: 92.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 10, formTrend: "up", nextOpponent: "Geelong", byeRound: 12, venue: "Adelaide Oval", gameTime: "Thursday 7:30pm", projectedScore: 92, breakEven: 82, ceilingScore: 128, priceChange: 0 },
  { name: "Taylor Walker", team: "Adelaide", position: "FWD", price: 400000, avgScore: 82.0, last3Avg: 78.0, last5Avg: 80.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 5, formTrend: "down", nextOpponent: "Geelong", byeRound: 12, venue: "Adelaide Oval", gameTime: "Thursday 7:30pm", projectedScore: 80, breakEven: 82, ceilingScore: 120, priceChange: -2000 },

  // Brisbane Lions
  { name: "Cam Rayner", team: "Brisbane Lions", position: "FWD", price: 380000, avgScore: 78.0, last3Avg: 82.0, last5Avg: 80.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 5, formTrend: "up", nextOpponent: "Fremantle", byeRound: 15, venue: "The Gabba", gameTime: "Saturday 4:15pm", projectedScore: 80, breakEven: 68, ceilingScore: 118, priceChange: 0 },
  { name: "Joe Daniher", team: "Brisbane Lions", position: "FWD", price: 420000, avgScore: 83.0, last3Avg: 80.0, last5Avg: 81.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 6, formTrend: "down", nextOpponent: "Fremantle", byeRound: 15, venue: "The Gabba", gameTime: "Saturday 4:15pm", projectedScore: 81, breakEven: 85, ceilingScore: 125, priceChange: -3000 },
  { name: "Jarrod Berry", team: "Brisbane Lions", position: "MID", price: 430000, avgScore: 85.0, last3Avg: 88.0, last5Avg: 86.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 5, formTrend: "stable", nextOpponent: "Fremantle", byeRound: 15, venue: "The Gabba", gameTime: "Saturday 4:15pm", projectedScore: 86, breakEven: 80, ceilingScore: 120, priceChange: 0 },

  // Carlton
  { name: "George Hewett", team: "Carlton", position: "MID", price: 420000, avgScore: 84.0, last3Avg: 87.0, last5Avg: 85.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 4, formTrend: "stable", nextOpponent: "Geelong", byeRound: 13, venue: "MCG", gameTime: "Friday 7:40pm", projectedScore: 85, breakEven: 80, ceilingScore: 118, priceChange: 0 },
  { name: "Jacob Weitering", team: "Carlton", position: "DEF", price: 370000, avgScore: 72.0, last3Avg: 75.0, last5Avg: 73.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 3, formTrend: "stable", nextOpponent: "Geelong", byeRound: 13, venue: "MCG", gameTime: "Friday 7:40pm", projectedScore: 73, breakEven: 68, ceilingScore: 105, priceChange: 0 },

  // Essendon
  { name: "Jye Caldwell", team: "Essendon", position: "MID", price: 460000, avgScore: 88.0, last3Avg: 92.0, last5Avg: 90.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 8, formTrend: "up", nextOpponent: "West Coast", byeRound: 13, venue: "Optus Stadium", gameTime: "Sunday 7:20pm", projectedScore: 90, breakEven: 82, ceilingScore: 128, priceChange: 0 },
  { name: "Jake Stringer", team: "Essendon", position: "FWD", price: 380000, avgScore: 78.0, last3Avg: 82.0, last5Avg: 80.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 5, formTrend: "up", nextOpponent: "West Coast", byeRound: 13, venue: "Optus Stadium", gameTime: "Sunday 7:20pm", projectedScore: 80, breakEven: 70, ceilingScore: 118, priceChange: 0 },
  { name: "Peter Wright", team: "Essendon", position: "FWD", price: 340000, avgScore: 72.0, last3Avg: 68.0, last5Avg: 70.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 3, formTrend: "down", nextOpponent: "West Coast", byeRound: 13, venue: "Optus Stadium", gameTime: "Sunday 7:20pm", projectedScore: 70, breakEven: 72, ceilingScore: 108, priceChange: -2000 },

  // Fremantle
  { name: "Nat Fyfe", team: "Fremantle", position: "MID", price: 420000, avgScore: 84.0, last3Avg: 80.0, last5Avg: 82.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 5, formTrend: "down", nextOpponent: "North Melbourne", byeRound: 15, venue: "Optus Stadium", gameTime: "Thursday 7:30pm", projectedScore: 82, breakEven: 85, ceilingScore: 122, priceChange: -2000 },
  { name: "Luke Ryan", team: "Fremantle", position: "DEF", price: 430000, avgScore: 85.0, last3Avg: 88.0, last5Avg: 86.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 5, formTrend: "stable", nextOpponent: "North Melbourne", byeRound: 15, venue: "Optus Stadium", gameTime: "Thursday 7:30pm", projectedScore: 86, breakEven: 80, ceilingScore: 120, priceChange: 0 },
  { name: "Michael Walters", team: "Fremantle", position: "FWD", price: 360000, avgScore: 75.0, last3Avg: 72.0, last5Avg: 73.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 3, formTrend: "down", nextOpponent: "North Melbourne", byeRound: 15, venue: "Optus Stadium", gameTime: "Thursday 7:30pm", projectedScore: 73, breakEven: 75, ceilingScore: 112, priceChange: -2000 },

  // Geelong
  { name: "Patrick Dangerfield", team: "Geelong", position: "MID", price: 480000, avgScore: 92.0, last3Avg: 88.0, last5Avg: 90.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 8, formTrend: "down", nextOpponent: "Adelaide", byeRound: 14, venue: "Adelaide Oval", gameTime: "Thursday 7:30pm", projectedScore: 90, breakEven: 92, ceilingScore: 135, priceChange: -3000 },
  { name: "Tyson Stengle", team: "Geelong", position: "FWD", price: 440000, avgScore: 86.0, last3Avg: 90.0, last5Avg: 88.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 10, formTrend: "up", nextOpponent: "Adelaide", byeRound: 14, venue: "Adelaide Oval", gameTime: "Thursday 7:30pm", projectedScore: 88, breakEven: 78, ceilingScore: 125, priceChange: 0 },
  { name: "Gryan Miers", team: "Geelong", position: "FWD", price: 350000, avgScore: 74.0, last3Avg: 78.0, last5Avg: 76.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 4, formTrend: "up", nextOpponent: "Adelaide", byeRound: 14, venue: "Adelaide Oval", gameTime: "Thursday 7:30pm", projectedScore: 76, breakEven: 58, ceilingScore: 110, priceChange: 0 },

  // Gold Coast
  { name: "Sam Day", team: "Gold Coast", position: "FWD", price: 320000, avgScore: 68.0, last3Avg: 65.0, last5Avg: 66.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 2, formTrend: "down", nextOpponent: "Brisbane Lions", byeRound: 12, venue: "People First Stadium", gameTime: "Saturday 1:15pm", projectedScore: 66, breakEven: 68, ceilingScore: 100, priceChange: -1000 },
  { name: "Ben King", team: "Gold Coast", position: "FWD", price: 450000, avgScore: 87.0, last3Avg: 92.0, last5Avg: 89.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 12, formTrend: "up", nextOpponent: "Brisbane Lions", byeRound: 12, venue: "People First Stadium", gameTime: "Saturday 1:15pm", projectedScore: 90, breakEven: 78, ceilingScore: 130, priceChange: 0 },
  { name: "Wil Powell", team: "Gold Coast", position: "DEF", price: 380000, avgScore: 78.0, last3Avg: 82.0, last5Avg: 80.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 5, formTrend: "up", nextOpponent: "Brisbane Lions", byeRound: 12, venue: "People First Stadium", gameTime: "Saturday 1:15pm", projectedScore: 80, breakEven: 68, ceilingScore: 115, priceChange: 0 },

  // GWS Giants
  { name: "Stephen Coniglio", team: "GWS Giants", position: "MID", price: 420000, avgScore: 84.0, last3Avg: 80.0, last5Avg: 82.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 4, formTrend: "down", nextOpponent: "Melbourne", byeRound: 13, venue: "TIO Traeger Park", gameTime: "Sunday 3:15pm", projectedScore: 82, breakEven: 85, ceilingScore: 120, priceChange: -2000 },
  { name: "Toby Greene", team: "GWS Giants", position: "FWD", price: 460000, avgScore: 88.0, last3Avg: 92.0, last5Avg: 90.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 12, formTrend: "up", nextOpponent: "Melbourne", byeRound: 13, venue: "TIO Traeger Park", gameTime: "Sunday 3:15pm", projectedScore: 90, breakEven: 82, ceilingScore: 130, priceChange: 0 },

  // Hawthorn
  { name: "James Worpel", team: "Hawthorn", position: "MID", price: 450000, avgScore: 88.0, last3Avg: 92.0, last5Avg: 90.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 10, formTrend: "up", nextOpponent: "St Kilda", byeRound: 14, venue: "Marvel Stadium", gameTime: "Thursday 7:30pm", projectedScore: 90, breakEven: 82, ceilingScore: 128, priceChange: 0 },
  { name: "Jack Gunston", team: "Hawthorn", position: "FWD", price: 360000, avgScore: 74.0, last3Avg: 70.0, last5Avg: 72.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 3, formTrend: "down", nextOpponent: "St Kilda", byeRound: 14, venue: "Marvel Stadium", gameTime: "Thursday 7:30pm", projectedScore: 72, breakEven: 75, ceilingScore: 108, priceChange: -2000 },
  { name: "Will Day", team: "Hawthorn", position: "DEF", price: 440000, avgScore: 86.0, last3Avg: 90.0, last5Avg: 88.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 12, formTrend: "up", nextOpponent: "St Kilda", byeRound: 14, venue: "Marvel Stadium", gameTime: "Thursday 7:30pm", projectedScore: 88, breakEven: 78, ceilingScore: 125, priceChange: 0 },

  // Melbourne
  { name: "Jack Viney", team: "Melbourne", position: "MID", price: 430000, avgScore: 85.0, last3Avg: 80.0, last5Avg: 82.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 4, formTrend: "down", nextOpponent: "GWS Giants", byeRound: 13, venue: "TIO Traeger Park", gameTime: "Sunday 3:15pm", projectedScore: 82, breakEven: 85, ceilingScore: 118, priceChange: -2000 },
  { name: "Angus Brayshaw", team: "Melbourne", position: "DEF", price: 350000, avgScore: 72.0, last3Avg: 68.0, last5Avg: 70.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 3, formTrend: "down", nextOpponent: "GWS Giants", byeRound: 13, venue: "TIO Traeger Park", gameTime: "Sunday 3:15pm", projectedScore: 70, breakEven: 72, ceilingScore: 105, priceChange: -2000 },
  { name: "Bayley Fritsch", team: "Melbourne", position: "FWD", price: 400000, avgScore: 80.0, last3Avg: 84.0, last5Avg: 82.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 5, formTrend: "up", nextOpponent: "GWS Giants", byeRound: 13, venue: "TIO Traeger Park", gameTime: "Sunday 3:15pm", projectedScore: 82, breakEven: 72, ceilingScore: 120, priceChange: 0 },

  // North Melbourne
  { name: "Luke Davies-Uniacke", team: "North Melbourne", position: "MID", price: 500000, avgScore: 95.0, last3Avg: 100.0, last5Avg: 97.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 20, formTrend: "up", nextOpponent: "Fremantle", byeRound: 12, venue: "Hands Oval", gameTime: "Saturday 4:15pm", projectedScore: 98, breakEven: 85, ceilingScore: 138, priceChange: 0 },
  { name: "Jy Simpkin", team: "North Melbourne", position: "MID", price: 470000, avgScore: 90.0, last3Avg: 93.0, last5Avg: 91.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 10, formTrend: "up", nextOpponent: "Fremantle", byeRound: 12, venue: "Hands Oval", gameTime: "Saturday 4:15pm", projectedScore: 92, breakEven: 82, ceilingScore: 128, priceChange: 0 },
  { name: "Cameron Zurhaar", team: "North Melbourne", position: "FWD", price: 380000, avgScore: 77.0, last3Avg: 82.0, last5Avg: 79.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 5, formTrend: "up", nextOpponent: "Fremantle", byeRound: 12, venue: "Hands Oval", gameTime: "Saturday 4:15pm", projectedScore: 80, breakEven: 65, ceilingScore: 115, priceChange: 0 },

  // Port Adelaide
  { name: "Travis Boak", team: "Port Adelaide", position: "MID", price: 420000, avgScore: 84.0, last3Avg: 80.0, last5Avg: 82.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 4, formTrend: "down", nextOpponent: "West Coast", byeRound: 12, venue: "Optus Stadium", gameTime: "Saturday 7:35pm", projectedScore: 82, breakEven: 85, ceilingScore: 118, priceChange: -2000 },
  { name: "Ollie Wines", team: "Port Adelaide", position: "MID", price: 490000, avgScore: 93.0, last3Avg: 97.0, last5Avg: 95.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 12, formTrend: "up", nextOpponent: "West Coast", byeRound: 12, venue: "Optus Stadium", gameTime: "Saturday 7:35pm", projectedScore: 95, breakEven: 85, ceilingScore: 135, priceChange: 0 },
  { name: "Todd Marshall", team: "Port Adelaide", position: "FWD", price: 380000, avgScore: 78.0, last3Avg: 82.0, last5Avg: 80.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 5, formTrend: "up", nextOpponent: "West Coast", byeRound: 12, venue: "Optus Stadium", gameTime: "Saturday 7:35pm", projectedScore: 80, breakEven: 68, ceilingScore: 115, priceChange: 0 },

  // Richmond
  { name: "Shai Bolton", team: "Richmond", position: "MID", price: 460000, avgScore: 88.0, last3Avg: 92.0, last5Avg: 90.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 10, formTrend: "up", nextOpponent: "Brisbane Lions", byeRound: 13, venue: "Ninja Stadium", gameTime: "Sunday 1:10pm", projectedScore: 90, breakEven: 82, ceilingScore: 130, priceChange: 0 },
  { name: "Dustin Martin", team: "Richmond", position: "FWD", price: 380000, avgScore: 76.0, last3Avg: 72.0, last5Avg: 74.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 4, formTrend: "down", nextOpponent: "Brisbane Lions", byeRound: 13, venue: "Ninja Stadium", gameTime: "Sunday 1:10pm", projectedScore: 74, breakEven: 78, ceilingScore: 115, priceChange: -3000 },
  { name: "Tim Taranto", team: "Richmond", position: "MID", price: 440000, avgScore: 86.0, last3Avg: 82.0, last5Avg: 84.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 5, formTrend: "down", nextOpponent: "Brisbane Lions", byeRound: 13, venue: "Ninja Stadium", gameTime: "Sunday 1:10pm", projectedScore: 84, breakEven: 88, ceilingScore: 125, priceChange: -3000 },
  { name: "Daniel Rioli", team: "Richmond", position: "DEF", price: 400000, avgScore: 80.0, last3Avg: 84.0, last5Avg: 82.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 6, formTrend: "up", nextOpponent: "Brisbane Lions", byeRound: 13, venue: "Ninja Stadium", gameTime: "Sunday 1:10pm", projectedScore: 82, breakEven: 72, ceilingScore: 118, priceChange: 0 },

  // St Kilda
  { name: "Brad Crouch", team: "St Kilda", position: "MID", price: 430000, avgScore: 85.0, last3Avg: 82.0, last5Avg: 83.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 4, formTrend: "down", nextOpponent: "Hawthorn", byeRound: 12, venue: "Marvel Stadium", gameTime: "Thursday 7:30pm", projectedScore: 83, breakEven: 85, ceilingScore: 120, priceChange: -2000 },
  { name: "Max King", team: "St Kilda", position: "FWD", price: 420000, avgScore: 83.0, last3Avg: 88.0, last5Avg: 85.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 8, formTrend: "up", nextOpponent: "Hawthorn", byeRound: 12, venue: "Marvel Stadium", gameTime: "Thursday 7:30pm", projectedScore: 86, breakEven: 75, ceilingScore: 125, priceChange: 0 },
  { name: "Jade Gresham", team: "St Kilda", position: "FWD", price: 360000, avgScore: 74.0, last3Avg: 78.0, last5Avg: 76.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 3, formTrend: "up", nextOpponent: "Hawthorn", byeRound: 12, venue: "Marvel Stadium", gameTime: "Thursday 7:30pm", projectedScore: 76, breakEven: 60, ceilingScore: 112, priceChange: 0 },

  // Sydney
  { name: "Isaac Heeney", team: "Sydney", position: "FWD", dualPosition: "MID", price: 540000, avgScore: 100.0, last3Avg: 105.0, last5Avg: 102.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 30, formTrend: "up", nextOpponent: "Richmond", byeRound: 15, venue: "SCG", gameTime: "Saturday 1:15pm", projectedScore: 103, breakEven: 88, ceilingScore: 148, priceChange: 0 },
  { name: "Tom Papley", team: "Sydney", position: "FWD", price: 420000, avgScore: 82.0, last3Avg: 86.0, last5Avg: 84.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 6, formTrend: "up", nextOpponent: "Richmond", byeRound: 15, venue: "SCG", gameTime: "Saturday 1:15pm", projectedScore: 84, breakEven: 75, ceilingScore: 120, priceChange: 0 },
  { name: "Callum Mills", team: "Sydney", position: "DEF", price: 450000, avgScore: 88.0, last3Avg: 85.0, last5Avg: 86.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 5, formTrend: "down", nextOpponent: "Richmond", byeRound: 15, venue: "SCG", gameTime: "Saturday 1:15pm", projectedScore: 86, breakEven: 88, ceilingScore: 125, priceChange: -2000 },

  // West Coast
  { name: "Tim Kelly", team: "West Coast", position: "MID", price: 430000, avgScore: 85.0, last3Avg: 88.0, last5Avg: 86.5, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 5, formTrend: "up", nextOpponent: "Essendon", byeRound: 15, venue: "Optus Stadium", gameTime: "Sunday 7:20pm", projectedScore: 87, breakEven: 80, ceilingScore: 122, priceChange: 0 },
  { name: "Andrew Gaff", team: "West Coast", position: "MID", price: 390000, avgScore: 80.0, last3Avg: 76.0, last5Avg: 78.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 2, formTrend: "down", nextOpponent: "Essendon", byeRound: 15, venue: "Optus Stadium", gameTime: "Sunday 7:20pm", projectedScore: 78, breakEven: 82, ceilingScore: 115, priceChange: -2000 },
  { name: "Oscar Allen", team: "West Coast", position: "FWD", price: 410000, avgScore: 82.0, last3Avg: 86.0, last5Avg: 84.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 5, formTrend: "up", nextOpponent: "Essendon", byeRound: 15, venue: "Optus Stadium", gameTime: "Sunday 7:20pm", projectedScore: 84, breakEven: 75, ceilingScore: 122, priceChange: 0 },
  { name: "Jake Waterman", team: "West Coast", position: "FWD", price: 440000, avgScore: 86.0, last3Avg: 90.0, last5Avg: 88.0, seasonTotal: 0, gamesPlayed: 0, ownedByPercent: 8, formTrend: "up", nextOpponent: "Essendon", byeRound: 15, venue: "Optus Stadium", gameTime: "Sunday 7:20pm", projectedScore: 88, breakEven: 78, ceilingScore: 128, priceChange: 0 },
];

export async function expandPlayerDatabase(): Promise<number> {
  const existingPlayers = await db.select().from(players);
  const existingNames = new Set(existingPlayers.map(p => p.name));

  const newPlayers = EXPANDED_PLAYERS.filter(p => !existingNames.has(p.name));

  if (newPlayers.length === 0) {
    return 0;
  }

  let added = 0;
  for (const p of newPlayers) {
    await db.insert(players).values({
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
    });
    added++;
  }

  return added;
}

function generateRecentScores(avg: number, stdDev: number, count: number = 6): number[] {
  const scores: number[] = [];
  for (let i = 0; i < count; i++) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const normal = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    const score = Math.round(avg + normal * stdDev);
    scores.push(Math.max(20, Math.min(180, score)));
  }
  return scores;
}

function calcConsistencyRating(scores: number[], avg: number): number {
  if (scores.length === 0 || avg <= 0) return 0;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  const cvInverse = 1 - (stdDev / avg);
  const avgFactor = Math.min(avg / 110, 1.0);
  const raw = (cvInverse * 0.6 + avgFactor * 0.4) * 10;
  return Math.round(Math.max(1, Math.min(10, raw)) * 10) / 10;
}

function normalCDF(z: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

function calcCaptainProbability(projectedScore: number, volatility: number, threshold: number = 120): number {
  if (volatility <= 0) return projectedScore >= threshold ? 1.0 : 0.0;
  const z = (threshold - projectedScore) / volatility;
  return Math.round((1 - normalCDF(z)) * 1000) / 1000;
}

function calcVolatilityScore(stdDev: number, avg: number): number {
  if (avg <= 0) return 10;
  const cv = stdDev / avg;
  const raw = cv * 40;
  return Math.round(Math.max(0, Math.min(10, raw)) * 10) / 10;
}

function calcProjectedFloor(projectedScore: number, volatility: number): number {
  return Math.round(Math.max(10, projectedScore - (1.0 * volatility)));
}

function calcProjectedCeiling(projectedScore: number, volatility: number): number {
  return Math.round(projectedScore + (1.3 * volatility));
}

function bayesianAdjustedAvg(last3Avg: number, last5Avg: number, avgScore: number): number {
  const last2Estimate = last3Avg * 1.5 - last5Avg * 0.5;
  const prev3Estimate = (last5Avg * 5 - last3Avg * 3) / 2;
  return last2Estimate * 0.6 + prev3Estimate * 0.4;
}

function calcTradeEV(projIn: number, projOut: number, volIn: number, volOut: number, cashGenValue: number): number {
  const projDiff = projIn - projOut;
  const volatilityPenalty = (volIn - volOut) * 0.5;
  const ev = (projDiff * 3) - volatilityPenalty + (cashGenValue * 0.2);
  return Math.round(ev * 10) / 10;
}

function generateAge(price: number, avgScore: number): number {
  if (price <= 150000) return 18 + Math.floor(Math.random() * 2);
  if (price <= 250000) return 19 + Math.floor(Math.random() * 3);
  if (price <= 400000) return 21 + Math.floor(Math.random() * 6);
  if (avgScore >= 100) return 24 + Math.floor(Math.random() * 6);
  return 22 + Math.floor(Math.random() * 8);
}

function generateYearsExperience(age: number): number {
  return Math.max(0, age - 18 - Math.floor(Math.random() * 2));
}

function generateDurabilityScore(age: number, injuryStatus: string | null): number {
  let base = 0.7 + Math.random() * 0.3;
  if (age >= 30) base -= 0.1;
  if (age >= 33) base -= 0.1;
  if (injuryStatus) base -= 0.15 + Math.random() * 0.15;
  return Math.round(Math.max(0.1, Math.min(1.0, base)) * 100) / 100;
}

function generateInjuryRiskScore(durability: number, age: number, injuryStatus: string | null): number {
  let risk = 1 - durability;
  if (age >= 30) risk += 0.1;
  if (injuryStatus) risk += 0.2;
  risk += (Math.random() * 0.1 - 0.05);
  return Math.round(Math.max(0, Math.min(1.0, risk)) * 100) / 100;
}

export async function populateConsistencyData(): Promise<number> {
  const allPlayers = await db.select().from(players);
  const needsUpdate = allPlayers.filter(p => p.consistencyRating === null);

  const needsDebutReeval = allPlayers.filter(p => 
    p.consistencyRating !== null && !p.isDebutant && p.price <= 250000
  );
  for (const p of needsDebutReeval) {
    const isBasePrice = p.price <= 150000;
    const isRookie = p.price <= 250000;
    const debutChance = isBasePrice ? 0.7 : isRookie ? 0.4 : 0;
    const isDebutant = debutChance > 0 && Math.random() < debutChance;
    if (isDebutant) {
      const debutRound = Math.floor(Math.random() * 10) + 1;
      let cashGenPotential: string | null = null;
      const avg = p.avgScore || 0;
      if (p.price <= 300000 && avg > 0) {
        const be = p.breakEven || 0;
        const scoringAboveBE = avg - be;
        if (scoringAboveBE > 30) cashGenPotential = "elite";
        else if (scoringAboveBE > 20) cashGenPotential = "high";
        else if (scoringAboveBE > 10) cashGenPotential = "medium";
        else if (scoringAboveBE > 0) cashGenPotential = "low";
      }
      await db.update(players)
        .set({ isDebutant: true, debutRound, cashGenPotential })
        .where(eq(players.id, p.id));
    }
  }

  const needsAdvancedUpdate = allPlayers.filter(p => p.volatilityScore === null || p.captainProbability === null);
  for (const p of needsAdvancedUpdate) {
    const avg = p.avgScore || 50;
    const stdDev = p.scoreStdDev || 15;
    const proj = p.projectedScore || avg;
    const bayesianProj = bayesianAdjustedAvg(p.last3Avg || avg, p.last5Avg || avg, avg);
    const adjustedProj = Math.round((proj * 0.5 + bayesianProj * 0.5) * 10) / 10;
    const volatility = calcVolatilityScore(stdDev, avg);
    const floor = calcProjectedFloor(adjustedProj, stdDev);
    const ceiling = calcProjectedCeiling(adjustedProj, stdDev);
    const captainProb = calcCaptainProbability(adjustedProj, stdDev);

    const age = p.age || generateAge(p.price, avg);
    const yearsExperience = p.yearsExperience || generateYearsExperience(age);
    const durabilityScore = p.durabilityScore || generateDurabilityScore(age, p.injuryStatus);
    const injuryRiskScore = p.injuryRiskScore || generateInjuryRiskScore(durabilityScore, age, p.injuryStatus);
    const startingPrice = p.startingPrice || p.price;

    await db.update(players)
      .set({
        projectedScore: adjustedProj,
        projectedFloor: floor,
        ceilingScore: ceiling,
        volatilityScore: volatility,
        captainProbability: captainProb,
        age,
        yearsExperience,
        durabilityScore,
        injuryRiskScore,
        startingPrice,
      })
      .where(eq(players.id, p.id));
  }

  if (needsUpdate.length === 0) {
    if (needsAdvancedUpdate.length > 0) {
      console.log(`[ExpandPlayers] Updated advanced metrics for ${needsAdvancedUpdate.length} players`);
    }
    return needsDebutReeval.length > 0 ? needsDebutReeval.length : needsAdvancedUpdate.length;
  }

  let updated = 0;
  for (const p of needsUpdate) {
    const avg = p.avgScore || 50;
    const price = p.price;

    let baseStdDev: number;
    if (avg >= 100) {
      baseStdDev = 8 + Math.random() * 18;
    } else if (avg >= 80) {
      baseStdDev = 10 + Math.random() * 20;
    } else if (avg >= 60) {
      baseStdDev = 12 + Math.random() * 22;
    } else {
      baseStdDev = 15 + Math.random() * 25;
    }

    if (Math.random() < 0.15) baseStdDev *= 0.5;
    if (Math.random() < 0.1) baseStdDev *= 1.6;

    const scores = generateRecentScores(avg, baseStdDev);
    const consistencyRating = calcConsistencyRating(scores, avg);
    const actualStdDev = Math.round(Math.sqrt(scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length) * 10) / 10;

    const isRookie = price <= 250000;
    const isBasePrice = price <= 150000;
    const debutChance = isBasePrice ? 0.7 : isRookie ? 0.4 : 0;
    const isDebutant = debutChance > 0 && Math.random() < debutChance;
    const debutRound = isDebutant ? Math.floor(Math.random() * 10) + 1 : null;

    let cashGenPotential: string | null = null;
    if (price <= 300000 && avg > 0) {
      const be = p.breakEven || 0;
      const scoringAboveBE = avg - be;
      if (scoringAboveBE > 30) cashGenPotential = "elite";
      else if (scoringAboveBE > 20) cashGenPotential = "high";
      else if (scoringAboveBE > 10) cashGenPotential = "medium";
      else if (scoringAboveBE > 0) cashGenPotential = "low";
    }

    const proj = p.projectedScore || avg;
    const bayesianProj = bayesianAdjustedAvg(p.last3Avg || avg, p.last5Avg || avg, avg);
    const adjustedProj = Math.round((proj * 0.5 + bayesianProj * 0.5) * 10) / 10;
    const volatility = calcVolatilityScore(actualStdDev, avg);
    const floor = calcProjectedFloor(adjustedProj, actualStdDev);
    const ceiling = calcProjectedCeiling(adjustedProj, actualStdDev);
    const captainProb = calcCaptainProbability(adjustedProj, actualStdDev);

    const age = generateAge(price, avg);
    const yearsExperience = generateYearsExperience(age);
    const durabilityScore = generateDurabilityScore(age, p.injuryStatus);
    const injuryRiskScore = generateInjuryRiskScore(durabilityScore, age, p.injuryStatus);

    await db.update(players)
      .set({
        consistencyRating,
        scoreStdDev: actualStdDev,
        recentScores: scores.join(','),
        isDebutant,
        debutRound,
        cashGenPotential,
        projectedScore: adjustedProj,
        projectedFloor: floor,
        ceilingScore: ceiling,
        volatilityScore: volatility,
        captainProbability: captainProb,
        age,
        yearsExperience,
        durabilityScore,
        injuryRiskScore,
        startingPrice: price,
      })
      .where(eq(players.id, p.id));
    updated++;
  }

  console.log(`[ExpandPlayers] Populated consistency + advanced data for ${updated} players`);
  return updated;
}

const AFL_TEAMS = [
  "Adelaide", "Brisbane Lions", "Carlton", "Collingwood", "Essendon",
  "Fremantle", "Geelong", "Gold Coast", "GWS Giants", "Hawthorn",
  "Melbourne", "North Melbourne", "Port Adelaide", "Richmond",
  "St Kilda", "Sydney", "West Coast", "Western Bulldogs"
];
const POSITIONS = ["DEF", "MID", "RUC", "FWD"];

export async function populateBaselineData(): Promise<void> {
  const { positionConcessions, teamContext } = await import("@shared/schema");

  const existingPC = await db.select().from(positionConcessions);
  if (existingPC.length === 0) {
    for (const team of AFL_TEAMS) {
      for (const pos of POSITIONS) {
        const base = pos === "MID" ? 85 : pos === "DEF" ? 78 : pos === "RUC" ? 90 : 75;
        const avgConceded = base + (Math.random() * 20 - 10);
        const stdDev = 12 + Math.random() * 10;
        await db.insert(positionConcessions).values({
          team,
          position: pos,
          avgPointsConceded: Math.round(avgConceded * 10) / 10,
          stdDevConceded: Math.round(stdDev * 10) / 10,
        });
      }
    }
    console.log(`[ExpandPlayers] Populated position concessions for ${AFL_TEAMS.length} teams`);
  }

  const existingTC = await db.select().from(teamContext);
  if (existingTC.length === 0) {
    for (const team of AFL_TEAMS) {
      const disposals = 350 + Math.floor(Math.random() * 80);
      const clearances = 30 + Math.floor(Math.random() * 15);
      const contestedRate = 0.3 + Math.random() * 0.15;
      const pace = 0.85 + Math.random() * 0.3;
      const scored = 1400 + Math.floor(Math.random() * 400);
      const conceded = 1400 + Math.floor(Math.random() * 400);
      await db.insert(teamContext).values({
        team,
        round: 1,
        disposalCount: disposals,
        clearanceCount: clearances,
        contestedPossessionRate: Math.round(contestedRate * 100) / 100,
        paceFactor: Math.round(pace * 100) / 100,
        fantasyPointsScored: scored,
        fantasyPointsConceded: conceded,
      });
    }
    console.log(`[ExpandPlayers] Populated team context for ${AFL_TEAMS.length} teams`);
  }
}

export { calcTradeEV, calcCaptainProbability, bayesianAdjustedAvg, calcVolatilityScore };
