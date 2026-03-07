export interface SimPlayer {
  id: number;
  name: string;
  team: string;
  position: string;
  projectedScore: number;
  avgScore: number;
  scoreStdDev: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  isOnField: boolean;
}

export interface SimulationResult {
  expectedTotal: number;
  medianTotal: number;
  floor: number;
  ceiling: number;
  stdDev: number;
  histogram: { bucket: string; count: number }[];
  playerRiskContributions: { name: string; team: string; variance: number; stdDev: number }[];
  percentiles: { p25: number; p75: number; p90: number; p95: number };
  iterations: number;
}

function normalRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function simulateRound(players: SimPlayer[], iterations: number = 10000): SimulationResult {
  const onField = players.filter(p => p.isOnField);
  if (onField.length === 0) {
    return {
      expectedTotal: 0, medianTotal: 0, floor: 0, ceiling: 0, stdDev: 0,
      histogram: [], playerRiskContributions: [], percentiles: { p25: 0, p75: 0, p90: 0, p95: 0 },
      iterations: 0,
    };
  }

  const totals: number[] = new Array(iterations);
  const playerVariances: Map<number, number[]> = new Map();

  for (const p of onField) {
    playerVariances.set(p.id, []);
  }

  for (let i = 0; i < iterations; i++) {
    let roundTotal = 0;

    for (const p of onField) {
      const mean = p.projectedScore || p.avgScore || 50;
      const std = p.scoreStdDev || 15;
      let score = mean + normalRandom() * std;
      score = Math.max(0, Math.round(score));

      if (p.isCaptain) {
        score *= 2;
      }

      roundTotal += score;
      playerVariances.get(p.id)!.push(score);
    }

    totals[i] = roundTotal;
  }

  totals.sort((a, b) => a - b);

  const sum = totals.reduce((a, b) => a + b, 0);
  const expectedTotal = Math.round(sum / iterations);
  const medianTotal = Math.round(totals[Math.floor(iterations / 2)]);
  const floor = Math.round(totals[Math.floor(iterations * 0.1)]);
  const ceiling = Math.round(totals[Math.floor(iterations * 0.9)]);

  const p25 = Math.round(totals[Math.floor(iterations * 0.25)]);
  const p75 = Math.round(totals[Math.floor(iterations * 0.75)]);
  const p90 = Math.round(totals[Math.floor(iterations * 0.90)]);
  const p95 = Math.round(totals[Math.floor(iterations * 0.95)]);

  const variance = totals.reduce((acc, t) => acc + (t - expectedTotal) ** 2, 0) / iterations;
  const stdDev = Math.round(Math.sqrt(variance));

  const minTotal = totals[0];
  const maxTotal = totals[iterations - 1];
  const bucketSize = Math.max(25, Math.round((maxTotal - minTotal) / 20));
  const bucketStart = Math.floor(minTotal / bucketSize) * bucketSize;
  const histogram: { bucket: string; count: number }[] = [];
  const bucketCounts = new Map<number, number>();

  for (const t of totals) {
    const bucketKey = Math.floor(t / bucketSize) * bucketSize;
    bucketCounts.set(bucketKey, (bucketCounts.get(bucketKey) || 0) + 1);
  }

  const sortedBuckets = Array.from(bucketCounts.entries()).sort((a, b) => a[0] - b[0]);
  for (const [key, count] of sortedBuckets) {
    histogram.push({
      bucket: `${key}`,
      count,
    });
  }

  const riskContributions = onField.map(p => {
    const scores = playerVariances.get(p.id)!;
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const v = scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / scores.length;
    return {
      name: p.name,
      team: p.team,
      variance: Math.round(v),
      stdDev: Math.round(Math.sqrt(v)),
    };
  });

  riskContributions.sort((a, b) => b.variance - a.variance);

  return {
    expectedTotal,
    medianTotal,
    floor,
    ceiling,
    stdDev,
    histogram,
    playerRiskContributions: riskContributions.slice(0, 5),
    percentiles: { p25, p75, p90, p95 },
    iterations,
  };
}
