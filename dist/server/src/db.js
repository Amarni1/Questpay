import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
const DB_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}
const DB_PATH = path.join(DB_DIR, 'questpay.sqlite');
const SQL = await initSqlJs();
let sqlite;
if (fs.existsSync(DB_PATH)) {
    try {
        const filebuffer = fs.readFileSync(DB_PATH);
        sqlite = new SQL.Database(filebuffer);
    }
    catch (err) {
        sqlite = new SQL.Database();
    }
}
else {
    sqlite = new SQL.Database();
}
function persist() {
    try {
        const data = sqlite.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    }
    catch (err) {
        console.error('Failed to persist SQLite database:', err);
    }
}
// Wrapper providing synchronous SQLite API
export const db = {
    pragma: (str) => {
        try {
            sqlite.run(`PRAGMA ${str}`);
        }
        catch { }
    },
    exec: (sql) => {
        sqlite.exec(sql);
        persist();
    },
    prepare: (query) => {
        return {
            all: (...params) => {
                let normalizedParams = params;
                if (params.length === 1 && typeof params[0] === 'object' && params[0] !== null && !Array.isArray(params[0])) {
                    normalizedParams = params[0];
                }
                const stmt = sqlite.prepare(query);
                try {
                    stmt.bind(normalizedParams);
                    const results = [];
                    while (stmt.step()) {
                        results.push(stmt.getAsObject());
                    }
                    return results;
                }
                finally {
                    stmt.free();
                }
            },
            get: (...params) => {
                let normalizedParams = params;
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
                }
                finally {
                    stmt.free();
                }
            },
            run: (...params) => {
                let normalizedParams = params;
                if (params.length === 1 && typeof params[0] === 'object' && params[0] !== null && !Array.isArray(params[0])) {
                    normalizedParams = params[0];
                }
                try {
                    sqlite.run(query, normalizedParams);
                    persist();
                    return { changes: 1, lastInsertRowid: 1 };
                }
                catch (err) {
                    const stmt = sqlite.prepare(query);
                    try {
                        stmt.bind(normalizedParams);
                        stmt.step();
                        persist();
                        return { changes: 1, lastInsertRowid: 1 };
                    }
                    finally {
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
    reward_usdm REAL NOT NULL,
    proof_type TEXT NOT NULL,
    duration_days INTEGER NOT NULL DEFAULT 5,
    deadline TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open',
    contract_quest_id TEXT,
    chain_tx_hash TEXT NOT NULL,
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
// Migration to ensure columns exist if already created
try {
    const tableInfo = db.prepare("PRAGMA table_info(bounties)").all();
    const colNames = tableInfo.map((c) => c.name);
    if (!colNames.includes('duration_days')) {
        db.exec("ALTER TABLE bounties ADD COLUMN duration_days INTEGER NOT NULL DEFAULT 5;");
    }
    if (!colNames.includes('expires_at')) {
        db.exec("ALTER TABLE bounties ADD COLUMN expires_at TEXT;");
        db.exec("UPDATE bounties SET expires_at = deadline WHERE expires_at IS NULL;");
    }
    const subInfo = db.prepare("PRAGMA table_info(submissions)").all();
    const subCols = subInfo.map((c) => c.name);
    if (!subCols.includes('external_url')) {
        db.exec("ALTER TABLE submissions ADD COLUMN external_url TEXT;");
    }
    const authInfo = db.prepare("PRAGMA table_info(auth_challenges)").all();
    const authCols = authInfo.map((c) => c.name);
    if (!authCols.includes('used')) {
        db.exec("ALTER TABLE auth_challenges ADD COLUMN used INTEGER NOT NULL DEFAULT 0;");
    }
    if (!authCols.includes('id')) {
        db.exec("ALTER TABLE auth_challenges ADD COLUMN id TEXT;");
    }
}
catch (e) {
    console.warn('Migration step warning:', e);
}
// Clean old mock/fake bounties without real transaction hashes
try {
    db.exec(`
    DELETE FROM bounties WHERE chain_tx_hash IS NULL OR trim(chain_tx_hash) = '' OR chain_tx_hash LIKE '%fake%' OR chain_tx_hash LIKE '%mock%';
  `);
}
catch (e) {
    console.warn('Cleanup check warning:', e);
}
