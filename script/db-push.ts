import { execSync } from "child_process";
import pg from "pg";

async function migrateAuthTables() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'users' AND table_schema = 'public' 
      AND column_name IN ('username', 'password')
    `);
    if (colCheck.rows.length > 0) {
      console.log("[db-push] Old users table detected, dropping...");
      await client.query("DROP TABLE IF EXISTS feedback CASCADE");
      await client.query("DROP TABLE IF EXISTS sessions CASCADE");
      await client.query("DROP TABLE IF EXISTS users CASCADE");
    }

    await client.query(`
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

    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid varchar PRIMARY KEY,
        sess jsonb NOT NULL,
        expire timestamp NOT NULL
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire)`);

    await client.query(`
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

    console.log("[db-push] Auth tables ready");
  } finally {
    await client.end();
  }
}

async function run() {
  await migrateAuthTables();
  execSync("npx drizzle-kit push --force", { stdio: "inherit" });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
