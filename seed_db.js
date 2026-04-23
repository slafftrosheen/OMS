import postgres from 'postgres';
const sql = postgres('postgresql://postgres:postgres@100.98.202.69:54322/postgres');

async function seed() {
    try {
        await sql.unsafe(`
            INSERT INTO company_knowledge (category, content)
            VALUES 
            ('capabilities', 'Réclame Fabriek specializes exclusively in physical signage production. Core capabilities include: custom lightbox fabrication, profile 7 frontlit channel letters, CNC routing of acrylics and aluminum, large format printing, and structural steel welding for pylons.'),
            ('past projects', 'Past projects include large-scale illuminated roof signs, architectural wayfinding systems, and bespoke retail fascia signs using Oracal 8500 translucent films and IP68 LED modules.');
        `);
        console.log("Successfully seeded knowledge base");
    } catch(e) {
        console.error("Error:", e);
    } finally {
        await sql.end();
    }
}
seed();
