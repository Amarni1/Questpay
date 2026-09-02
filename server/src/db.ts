import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'questpay.sqlite');

const SQL = await initSqlJs();
let sqlite: SqlJsDatabase;

if (fs.existsSync(DB_PATH)) {
  try {
    const filebuffer = fs.readFileSync(DB_PATH);
    sqlite = new SQL.Database(filebuffer);
  } catch (err) {
    sqlite = new SQL.Database();
  }
} else {
  sqlite = new SQL.Database();
}

function persist() {
  try {
    const data = sqlite.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('Failed to persist SQLite database:', err);
  }
}

// Wrapper providing synchronous SQLite API
export const db = {
  pragma: (str: string) => {
    try { sqlite.run(`PRAGMA ${str}`); } catch {}
  },

  exec: (sql: string) => {
    sqlite.exec(sql);
    persist();
  },

  prepare: (query: string) => {
    return {
      all: (...params: any[]) => {
        let normalizedParams: any = params;
        if (params.length === 1 && typeof params[0] === 'object' && params[0] !== null && !Array.isArray(params[0])) {
          normalizedParams = params[0];
        }

        const stmt = sqlite.prepare(query);
        try {
          stmt.bind(normalizedParams);
          const results: any[] = [];
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          return results;
        } finally {
          stmt.free();
        }
      },

      get: (...params: any[]) => {
        let normalizedParams: any = params;
        if (params.length === 1 && typeof params[0] === 'object' && params[0] !== null && !Array.isArray(params[0])) {
          normalizedParams = params[0];
        }

        const stmt = sqlite.prepare(query);
        try {
          stmt.bind(normalizedParams);
          if (stmt.step()) {
            return stmt.getAsObject();
          }
          return undefined;
        } finally {
          stmt.free();
        }
      },

      run: (...params: any[]) => {
        let normalizedParams: any = params;
        if (params.length === 1 && typeof params[0] === 'object' && params[0] !== null && !Array.isArray(params[0])) {
          normalizedParams = params[0];
        }

        try {
          sqlite.run(query, normalizedParams);
          persist();
          return { changes: 1, lastInsertRowid: 1 };
        } catch (err: any) {
          const stmt = sqlite.prepare(query);
          try {
            stmt.bind(normalizedParams);
            stmt.step();
            persist();
            return { changes: 1, lastInsertRowid: 1 };
          } finally {
            stmt.free();
          }
        }
      }
    };
  }
};

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS bounties (
    id TEXT PRIMARY KEY,
    employer_wallet TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    reward_raw TEXT NOT NULL DEFAULT '0',
    reward_usdm REAL NOT NULL,
    usdm_token_type TEXT NOT NULL DEFAULT '003bacd9a361ba0d425e408776020e40271375e8b8de42d73eec046a44947d73',
    proof_type TEXT NOT NULL,
    duration_days INTEGER NOT NULL DEFAULT 5,
    deadline TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    contract_quest_id TEXT,
    chain_tx_hash TEXT,
    funding_tx_hash TEXT,
    funding_tx_status TEXT NOT NULL DEFAULT 'PENDING',
    payout_tx_hash TEXT,
    payout_tx_status TEXT NOT NULL DEFAULT 'PENDING',
    created_onchain INTEGER NOT NULL DEFAULT 0,
    funded_onchain INTEGER NOT NULL DEFAULT 0,
    paid_onchain INTEGER NOT NULL DEFAULT 0,
    submission_requirements TEXT,
    secret_commitment TEXT,
    release_mode TEXT NOT NULL DEFAULT 'manual',
    approval_tx_hash TEXT,
    rejection_reason TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    bounty_id TEXT NOT NULL,
    quester_wallet TEXT NOT NULL,
    proof_type TEXT NOT NULL,
    encrypted_payload TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    proof_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    file_name TEXT,
    mime_type TEXT,
    file_size INTEGER,
    external_url TEXT,
    notes TEXT,
    links_json TEXT DEFAULT '[]',
    created_at TEXT NOT NULL,
    reviewed_at TEXT,
    rejection_reason TEXT,
    FOREIGN KEY(bounty_id) REFERENCES bounties(id)
  );

  CREATE TABLE IF NOT EXISTS auth_challenges (
    id TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    nonce TEXT NOT NULL,
    message TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    token TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    bounty_id TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reputation (
    wallet_address TEXT PRIMARY KEY,
    completed_count INTEGER NOT NULL DEFAULT 0,
    successful_count INTEGER NOT NULL DEFAULT 0,
    total_earned_usdm REAL NOT NULL DEFAULT 0,
    reputation_score INTEGER NOT NULL DEFAULT 70,
    tier TEXT NOT NULL DEFAULT 'Novice Quester'
  );

  CREATE TABLE IF NOT EXISTS wallet_escrow_ledger (
    wallet_address TEXT PRIMARY KEY,
    total_locked REAL NOT NULL DEFAULT 0,
    total_earned REAL NOT NULL DEFAULT 0,
    total_refunded REAL NOT NULL DEFAULT 0
  );
`);

// Migration to ensure all financial and state-machine columns exist
try {
  const tableInfo = db.prepare("PRAGMA table_info(bounties)").all();
  const colNames = tableInfo.map((c: any) => c.name);

  if (!colNames.includes('reward_raw')) {
    db.exec("ALTER TABLE bounties ADD COLUMN reward_raw TEXT NOT NULL DEFAULT '0';");
    db.exec("UPDATE bounties SET reward_raw = CAST(ROUND(reward_usdm * 1000000) AS TEXT) WHERE reward_raw = '0';");
  }
  if (!colNames.includes('usdm_token_type')) {
    db.exec("ALTER TABLE bounties ADD COLUMN usdm_token_type TEXT NOT NULL DEFAULT '003bacd9a361ba0d425e408776020e40271375e8b8de42d73eec046a44947d73';");
  }
  if (!colNames.includes('funding_tx_hash')) {
    db.exec("ALTER TABLE bounties ADD COLUMN funding_tx_hash TEXT;");
    db.exec("UPDATE bounties SET funding_tx_hash = chain_tx_hash WHERE funding_tx_hash IS NULL;");
  }
  if (!colNames.includes('funding_tx_status')) {
    db.exec("ALTER TABLE bounties ADD COLUMN funding_tx_status TEXT NOT NULL DEFAULT 'FINALIZED';");
  }
  if (!colNames.includes('payout_tx_hash')) {
    db.exec("ALTER TABLE bounties ADD COLUMN payout_tx_hash TEXT;");
    db.exec("UPDATE bounties SET payout_tx_hash = approval_tx_hash WHERE payout_tx_hash IS NULL;");
  }
  if (!colNames.includes('payout_tx_status')) {
    db.exec("ALTER TABLE bounties ADD COLUMN payout_tx_status TEXT NOT NULL DEFAULT 'PENDING';");
  }
  if (!colNames.includes('created_onchain')) {
    db.exec("ALTER TABLE bounties ADD COLUMN created_onchain INTEGER NOT NULL DEFAULT 1;");
  }
  if (!colNames.includes('funded_onchain')) {
    db.exec("ALTER TABLE bounties ADD COLUMN funded_onchain INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE bounties SET funded_onchain = 1 WHERE chain_tx_hash IS NOT NULL AND status IN ('Open', 'OPEN', 'Paid', 'PAID', 'ProofSubmitted', 'ACCEPTED');");
  }
  if (!colNames.includes('paid_onchain')) {
    db.exec("ALTER TABLE bounties ADD COLUMN paid_onchain INTEGER NOT NULL DEFAULT 0;");
    db.exec("UPDATE bounties SET paid_onchain = 1 WHERE status IN ('Paid', 'PAID');");
  }
  if (!colNames.includes('duration_days')) {
    db.exec("ALTER TABLE bounties ADD COLUMN duration_days INTEGER NOT NULL DEFAULT 5;");
  }
  if (!colNames.includes('expires_at')) {
    db.exec("ALTER TABLE bounties ADD COLUMN expires_at TEXT;");
    db.exec("UPDATE bounties SET expires_at = deadline WHERE expires_at IS NULL;");
  }

  const subInfo = db.prepare("PRAGMA table_info(submissions)").all();
  const subCols = subInfo.map((c: any) => c.name);
  if (!subCols.includes('external_url')) {
    db.exec("ALTER TABLE submissions ADD COLUMN external_url TEXT;");
  }

  const authInfo = db.prepare("PRAGMA table_info(auth_challenges)").all();
  const authCols = authInfo.map((c: any) => c.name);
  if (!authCols.includes('used')) {
    db.exec("ALTER TABLE auth_challenges ADD COLUMN used INTEGER NOT NULL DEFAULT 0;");
  }
  if (!authCols.includes('id')) {
    db.exec("ALTER TABLE auth_challenges ADD COLUMN id TEXT;");
  }
} catch (e) {
  console.warn('Migration step warning:', e);
}

// Ensure indices and relationship backfill
try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_bounties_employer ON bounties(employer_wallet);
    CREATE INDEX IF NOT EXISTS idx_bounties_contract_quest_id ON bounties(contract_quest_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_bounty_id ON submissions(bounty_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_quester ON submissions(quester_wallet);
  `);

  // Backfill any legacy submissions where bounty_id was set to contract_quest_id instead of bounty.id
  db.exec(`
    UPDATE submissions
    SET bounty_id = (
      SELECT b.id FROM bounties b
      WHERE b.contract_quest_id = submissions.bounty_id
      LIMIT 1
    )
    WHERE EXISTS (
      SELECT 1 FROM bounties b
      WHERE b.contract_quest_id = submissions.bounty_id
    );
  `);
} catch (e) {
  console.warn('Index and backfill migration warning:', e);
}

