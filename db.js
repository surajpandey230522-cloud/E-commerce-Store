require('dotenv').config();
const { Pool } = require('pg');
// NOTE: sqlite3 and sqlite are intentionally NOT required here at the top.
// They are lazily required inside setupSQLite() only when PostgreSQL is
// unavailable. This prevents the GLIBC native-binding crash on Render when
// a DATABASE_URL is provided and SQLite is never needed.

// ─────────────────────────────────────────────
//  Placeholder converter: SQLite's ?  →  PG's $1, $2, ...
// ─────────────────────────────────────────────
function toPgPlaceholders(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
}

// ─────────────────────────────────────────────
//  Schema SQL (shared logical schema)
//  SQLite and PostgreSQL both support this syntax.
// ─────────────────────────────────────────────
const SCHEMA_SQLITE = `
    CREATE TABLE IF NOT EXISTS users (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email    TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        description TEXT NOT NULL,
        price       REAL NOT NULL,
        image       TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        date    TEXT    NOT NULL,
        items   TEXT    NOT NULL,
        total   REAL    NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
`;

const SCHEMA_PG = `
    CREATE TABLE IF NOT EXISTS users (
        id       SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email    TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
        id          SERIAL PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT NOT NULL,
        price       NUMERIC(10,2) NOT NULL,
        image       TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
        id      SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        date    TEXT    NOT NULL,
        items   TEXT    NOT NULL,
        total   NUMERIC(10,2) NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
`;

// ─────────────────────────────────────────────
//  Seed data
// ─────────────────────────────────────────────
const SEED_PRODUCTS = [
    ["Premium Wireless Headphones", "Experience pure sound with these noise-cancelling wireless headphones. Perfect for audiophiles and commuters alike.", 299.99, "/images/headphones.jpg"],
    ["Mechanical Keyboard",         "Tactile, responsive, and incredibly durable. This mechanical keyboard features customizable RGB lighting.",          149.50, "/images/keyboard.jpg"],
    ["Ergonomic Office Chair",      "Say goodbye to back pain with our top-tier ergonomic chair, designed for long hours of comfortable work.",            499.00, "/images/chair.jpg"],
    ["Smart Watch Series 8",        "Track your fitness, receive notifications, and stay connected on the go with this sleek smartwatch.",                 399.99, "/images/watch.jpg"]
];

// ─────────────────────────────────────────────
//  PostgreSQL Adapter
// ─────────────────────────────────────────────
async function setupPostgres(connectionString) {
    console.log("→ Trying PostgreSQL connection...");
    const pool = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000  // fail fast if unreachable
    });

    // Test connection — throws if unreachable
    await pool.query('SELECT 1');
    console.log("✓ PostgreSQL connected.");

    // Create tables
    await pool.query(SCHEMA_PG);

    // Seed products if empty
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM products');
    if (parseInt(rows[0].count) === 0) {
        for (const p of SEED_PRODUCTS) {
            await pool.query(
                'INSERT INTO products (name, description, price, image) VALUES ($1, $2, $3, $4)',
                p
            );
        }
        console.log("✓ PostgreSQL seeded with initial products.");
    }

    // PostgreSQL returns NUMERIC columns as strings. This converts them back
    // to JS numbers so .toFixed() and arithmetic work correctly everywhere.
    const NUMERIC_FIELDS = ['price', 'total'];
    function parseRow(row) {
        if (!row) return null;
        const out = { ...row };
        for (const field of NUMERIC_FIELDS) {
            if (out[field] !== undefined) out[field] = parseFloat(out[field]);
        }
        return out;
    }

    // Build a unified adapter object with SQLite-compatible API
    return {
        type: 'postgres',
        pool,
        async get(sql, params = []) {
            const { rows } = await pool.query(toPgPlaceholders(sql), params);
            return parseRow(rows[0]) || null;
        },
        async all(sql, params = []) {
            const { rows } = await pool.query(toPgPlaceholders(sql), params);
            return rows.map(parseRow);
        },
        async run(sql, params = []) {
            // Append RETURNING id so we can expose lastID
            const pgSql = toPgPlaceholders(sql);
            const returning = pgSql.toUpperCase().startsWith('INSERT')
                ? pgSql + ' RETURNING id'
                : pgSql;
            const { rows } = await pool.query(returning, params);
            return { lastID: rows[0]?.id ?? null };
        }
    };
}


// ─────────────────────────────────────────────
//  SQLite Adapter
// ─────────────────────────────────────────────
async function setupSQLite() {
    console.log("→ Using SQLite (fallback)...");
    // Lazy-load: only imported if PostgreSQL is not available
    const sqlite3 = require('sqlite3').verbose();
    const { open } = require('sqlite');
    const sqliteDb = await open({
        filename: process.env.DB_PATH || './database.sqlite',
        driver: sqlite3.Database
    });

    await sqliteDb.exec(SCHEMA_SQLITE);

    const count = await sqliteDb.get('SELECT COUNT(*) as count FROM products');
    if (count.count === 0) {
        const stmt = await sqliteDb.prepare(
            'INSERT INTO products (name, description, price, image) VALUES (?, ?, ?, ?)'
        );
        for (const p of SEED_PRODUCTS) await stmt.run(p);
        await stmt.finalize();
        console.log("✓ SQLite seeded with initial products.");
    }

    // Wrap so the API matches the PG adapter
    return {
        type: 'sqlite',
        get:  (sql, params = []) => sqliteDb.get(sql, params),
        all:  (sql, params = []) => sqliteDb.all(sql, params),
        run:  async (sql, params = []) => {
            const result = await sqliteDb.run(sql, params);
            return { lastID: result.lastID };
        }
    };
}

// ─────────────────────────────────────────────
//  Main export: tries PG first, falls back to SQLite
// ─────────────────────────────────────────────
async function setupDatabase() {
    const databaseUrl = process.env.DATABASE_URL;

    if (databaseUrl) {
        try {
            return await setupPostgres(databaseUrl);
        } catch (err) {
            console.warn(`⚠ PostgreSQL unavailable (${err.message}). Falling back to SQLite...`);
        }
    }

    return await setupSQLite();
}

module.exports = { setupDatabase };
