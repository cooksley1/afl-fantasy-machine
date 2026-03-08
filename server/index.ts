import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const { pool } = await import("./db");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      email varchar UNIQUE,
      first_name varchar,
      last_name varchar,
      profile_image_url varchar,
      is_admin boolean DEFAULT false,
      is_blocked boolean DEFAULT false,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS feedback (
      id serial PRIMARY KEY,
      user_id varchar NOT NULL,
      user_email varchar,
      user_name varchar,
      subject text NOT NULL,
      message text NOT NULL,
      status text NOT NULL DEFAULT 'unread',
      admin_response text,
      responded_at timestamp,
      is_archived boolean DEFAULT false,
      created_at timestamp DEFAULT now()
    )
  `);
  await pool.query(`
    UPDATE users SET is_admin = true WHERE id = '52064690' OR email = 'cooksley@gmail.com'
  `);
  log("Auth tables ensured");

  const { setupAuth, registerAuthRoutes } = await import("./replit_integrations/auth");
  await setupAuth(app);
  registerAuthRoutes(app);

  const { seedDatabase } = await import("./seed");
  await seedDatabase();

  const { expandPlayerDatabase, populateConsistencyData, populateBaselineData, seedModelWeights, syncAflFantasyIds, repairPlayerData, recalculatePlayerAverages } = await import("./expand-players");
  await seedModelWeights();
  const added = await expandPlayerDatabase();
  if (added > 0) {
    log(`Expanded player database with ${added} new players`);
  }
  const consistencyUpdated = await populateConsistencyData();
  if (consistencyUpdated > 0) {
    log(`Populated consistency data for ${consistencyUpdated} players`);
  }
  await populateBaselineData();
  await repairPlayerData();
  await recalculatePlayerAverages();
  syncAflFantasyIds().catch(err => console.log(`[AflFantasySync] Background sync error: ${err.message}`));

  import("./services/dtlive-scraper").then(({ fetchDTLiveData }) =>
    fetchDTLiveData().then(() =>
      recalculatePlayerAverages()
    )
  ).catch(err => console.log(`[DTLive] Background sync error: ${err.message}`));

  import("./services/live-scores").then(({ fetchScoresForCompletedRounds }) =>
    fetchScoresForCompletedRounds().then(result => {
      if (result.roundsProcessed > 0) {
        return recalculatePlayerAverages();
      }
    })
  ).catch(err => console.log(`[LiveScores] Background score fetch error: ${err.message}`));

  const { fetchAndStoreFixtures } = await import("./services/fixture-service");
  fetchAndStoreFixtures().catch(err => console.log(`[Fixtures] Background fetch error: ${err.message}`));

  const { seedTagData } = await import("./services/tag-intelligence");
  await seedTagData();

  await registerRoutes(httpServer, app);

  const { startScheduler } = await import("./scheduler");
  startScheduler();

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
