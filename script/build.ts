import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import { execSync } from "child_process";
import pg from "pg";

async function migrateDatabase() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'users' AND table_schema = 'public' 
      AND column_name IN ('username', 'password')
    `);
    if (colCheck.rows.length > 0) {
      console.log("Detected old users table with username/password columns, rebuilding...");
      await client.query("DROP TABLE IF EXISTS feedback CASCADE");
      await client.query("DROP TABLE IF EXISTS sessions CASCADE");
      await client.query("DROP TABLE IF EXISTS users CASCADE");

      await client.query(`
        CREATE TABLE users (
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

      await client.query(`
        CREATE TABLE sessions (
          sid varchar PRIMARY KEY,
          sess jsonb NOT NULL,
          expire timestamp NOT NULL
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire)`);

      await client.query(`
        CREATE TABLE feedback (
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

      console.log("Tables rebuilt with correct schema");
    } else {
      console.log("Users table schema is correct, no migration needed");
    }
  } catch (err) {
    console.error("Migration error (non-fatal):", err);
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
