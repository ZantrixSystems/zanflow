import { neon } from '@neondatabase/serverless';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '../migrations');

// Load .dev.vars manually — never commit this file
function loadDevVars() {
  const devVarsPath = join(__dirname, '../.dev.vars');
  try {
    const contents = readFileSync(devVarsPath, 'utf8');
    for (const line of contents.split('\n')) {
      const [key, ...rest] = line.split('=');
      if (key && rest.length) {
        process.env[key.trim()] = rest.join('=').trim();
      }
    }
  } catch {
    console.error('ERROR: .dev.vars file not found.');
    console.error('Create .dev.vars in the project root and add NEON_DATABASE_URL=your-connection-string');
    process.exit(1);
  }
}

loadDevVars();

const connectionString = process.env.NEON_DATABASE_URL;
if (!connectionString || connectionString === 'PASTE_YOUR_NEON_CONNECTION_STRING_HERE') {
  console.error('ERROR: NEON_DATABASE_URL is not set in .dev.vars');
  process.exit(1);
}

const sql = neon(connectionString);

async function run() {
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         SERIAL PRIMARY KEY,
      filename   TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const applied = await sql`SELECT filename FROM _migrations`;
  const appliedSet = new Set(applied.map((r) => r.filename));

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`  skip  ${file}`);
      continue;
    }

    const statements = readFileSync(join(migrationsDir, file), 'utf8')
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    console.log(`  apply ${file}`);
    for (const statement of statements) {
      await sql.unsafe(statement);
    }
    await sql`INSERT INTO _migrations (filename) VALUES (${file})`;
    ran++;
  }

  console.log(ran === 0 ? 'Nothing to migrate.' : `Done. ${ran} migration(s) applied.`);
}

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
