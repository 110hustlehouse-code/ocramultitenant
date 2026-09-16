// Attende che Postgres accetti connessioni (usato dal devcontainer).
import "dotenv/config";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL mancante: copia .env.example in .env");
  process.exit(1);
}

for (let attempt = 1; attempt <= 30; attempt++) {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    await client.query("select 1");
    await client.end();
    console.log("Database pronto.");
    process.exit(0);
  } catch {
    await client.end().catch(() => {});
    console.log(`Database non ancora pronto (${attempt}/30)…`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}
console.error("Database non raggiungibile.");
process.exit(1);
