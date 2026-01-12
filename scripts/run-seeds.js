
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

const { Pool } = pg;
const projectRoot = path.resolve(__dirname, '..');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'reclame_oms',
  user: process.env.DB_USER || 'reclame_admin',
  password: process.env.DB_PASSWORD,
});

async function runSqlFile(client, filePath) {
  console.log(`📄 Applying: ${path.basename(filePath)}`);
  const sql = fs.readFileSync(filePath, 'utf8');
  await client.query(sql);
  console.log(`✅ ${path.basename(filePath)} applied`);
}

async function main() {
  console.log("========================================");
  console.log("Reclame OMS Database Seeder");
  console.log("========================================");
  
  let client;
  try {
    client = await pool.connect();
    console.log("✅ Database connection successful");

    // Migrations
    const migrationsDir = path.join(projectRoot, 'src/lib/server/db/migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).sort();
      for (const file of files) {
        if (file.endsWith('.sql')) {
          await runSqlFile(client, path.join(migrationsDir, file));
        }
      }
    }

    // Seeds
    const seedsDir = path.join(projectRoot, 'src/lib/server/db/seeds');
    if (fs.existsSync(seedsDir)) {
      const files = fs.readdirSync(seedsDir).sort();
      for (const file of files) {
        if (file.endsWith('.sql')) {
          await runSqlFile(client, path.join(seedsDir, file));
        }
      }
    }

    console.log("\n✅ Database initialization complete!");
  } catch (err) {
    console.error("❌ Detailed Error:", err);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main();
