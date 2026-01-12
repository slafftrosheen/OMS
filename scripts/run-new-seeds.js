import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
  try {
    await client.query(sql);
    console.log(`✅ ${path.basename(filePath)} applied`);
    return true;
  } catch (err) {
    console.log(`⚠️  ${path.basename(filePath)}: ${err.message.split('\n')[0]}`);
    return false;
  }
}

async function main() {
  console.log("Running new seed files...");
  
  let client;
  try {
    client = await pool.connect();
    console.log("✅ Database connection successful");

    // Run only the new seed files (011+)
    const seedsDir = path.join(projectRoot, 'src/lib/server/db/seeds');
    const files = fs.readdirSync(seedsDir).sort().filter(f => 
      f.endsWith('.sql') && parseInt(f.split('_')[0]) >= 11
    );
    
    console.log(`Found ${files.length} new seed files`);
    
    for (const file of files) {
      await runSqlFile(client, path.join(seedsDir, file));
    }

    console.log("\n✅ New seeds applied!");
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main();
