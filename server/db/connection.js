const { Pool } = require('pg');

let pool = null;

function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });

        pool.on('error', (err) => {
            console.error('[DB] Error inesperado en pool:', err.message);
        });
    }
    return pool;
}

async function query(text, params) {
    const client = await getPool().connect();
    try {
        const result = await client.query(text, params);
        return result;
    } finally {
        client.release();
    }
}

async function testConnection() {
    try {
        const result = await query('SELECT NOW() as time');
        console.log('[DB] Conexión exitosa:', result.rows[0].time);
        return true;
    } catch (error) {
        console.error('[DB] Error de conexión:', error.message);
        return false;
    }
}

async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
        console.log('[DB] Pool cerrado.');
    }
}

module.exports = { query, testConnection, closePool, getPool };
