import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'reclame_oms',
  user: process.env.DB_USER || 'reclame_admin',
  password: process.env.DB_PASSWORD,
});

async function main() {
  const client = await pool.connect();
  try {
    // Count by category
    const { rows } = await client.query(`
      SELECT category, COUNT(*) as count 
      FROM materials 
      GROUP BY category 
      ORDER BY count DESC
    `);
    
    console.log("Materials by category:");
    console.log("=".repeat(40));
    let total = 0;
    for (const row of rows) {
      console.log(`${row.category}: ${row.count}`);
      total += parseInt(row.count);
    }
    console.log("=".repeat(40));
    console.log(`TOTAL: ${total} materials`);
    
    // Count suppliers
    const { rows: suppliers } = await client.query(`SELECT COUNT(*) as count FROM suppliers`);
    console.log(`\nSuppliers: ${suppliers[0].count}`);
    
  } finally {
    client.release();
    await pool.end();
  }
}

main();
