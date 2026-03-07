import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import { execSync } from "child_process";
import pg from "pg";

async function migrateDatabase() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const tableCheck = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'users' AND table_schema = 'public'
    `);
    if (tableCheck.rows.length > 0) {
      const colCheck = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name IN ('username', 'password')
      `);
      if (colCheck.rows.length > 0) {
        console.log("Detected old users table with username/password columns, dropping dependents...");
        await client.query("DROP TABLE IF EXISTS sessions CASCADE");
        await client.query("DROP TABLE IF EXISTS feedback CASCADE");
        await client.query("DROP TABLE IF EXISTS users CASCADE");
        console.log("Old tables dropped successfully");
      }
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT,
        first_name TEXT,
        last_name TEXT,
        profile_image_url TEXT,
        is_admin BOOLEAN NOT NULL DEFAULT FALSE,
        is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid VARCHAR NOT NULL PRIMARY KEY,
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'general',
        status TEXT NOT NULL DEFAULT 'new',
        admin_response TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log("Auth tables verified/created");
  } finally {
    await client.end();
  }
}

const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  console.log("migrating database...");
  await migrateDatabase();
  execSync("npx drizzle-kit push --force", { stdio: "inherit" });

  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
