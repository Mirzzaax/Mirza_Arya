const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME
});

pool.connect()
    .then(() => console.log('✅ Berhasil terhubung ke database PostgreSQL!'))
    .catch((err) => console.error('❌ Gagal terhubung ke database:', err.message));

module.exports = pool;
