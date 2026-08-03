const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// ===================================================
// SYSTEM LIVE LOG ENGINE & SSE BROADCASTER
// ===================================================
let sseClients = [];

async function createLog(userId, actionType, message, ipAddress = null, isPrivate = false) {
    try {
        const res = await pool.query(
            `INSERT INTO system_logs (user_id, action_type, message, ip_address, is_private)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [userId, actionType, message, ipAddress, isPrivate]
        );
        const logData = res.rows[0];

        // Broadcast otomatis ke semua browser/client yang terhubung secara realtime
        sseClients.forEach(client => {
            if (logData.is_private && !client.isAdmin) return;
            client.res.write(`data: ${JSON.stringify(logData)}\n\n`);
        });
    } catch (err) {
        console.error('Error createLog:', err);
    }
}

// Endpoint Stream SSE
router.get('/logs/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const isAdmin = req.query.isAdmin === 'true';
    const clientId = Date.now();

    const newClient = { id: clientId, res, isAdmin };
    sseClients.push(newClient);

    req.on('close', () => {
        sseClients = sseClients.filter(c => c.id !== clientId);
    });
});

// Endpoint Ambil 50 Log Terakhir
router.get('/logs/recent', async (req, res) => {
    try {
        const adminId = req.headers['x-admin-id'];
        let isAdmin = false;

        if (adminId) {
            const check = await pool.query('SELECT role FROM users WHERE id = $1', [adminId]);
            if (check.rows.length > 0 && check.rows[0].role === 'admin') isAdmin = true;
        }

        const query = isAdmin
            ? 'SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 50'
            : 'SELECT id, action_type, message, created_at FROM system_logs WHERE is_private = FALSE ORDER BY created_at DESC LIMIT 50';

        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================================================
// MIDDLEWARE VERIFIKASI ADMIN
// ===================================================
const verifyAdmin = async (req, res, next) => {
    const adminId = req.headers['x-admin-id'];
    if (!adminId) return res.status(401).json({ error: 'Akses ditolak.' });

    const check = await pool.query('SELECT role FROM users WHERE id = $1', [adminId]);
    if (check.rows.length === 0 || check.rows[0].role !== 'admin') {
        return res.status(403).json({ error: 'Akses khusus Admin.' });
    }
    next();
};

// ===================================================
// AUTH: LOGIN USER
// ===================================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        
        if (result.rows.length === 0) return res.status(401).json({ error: 'Email atau password salah.' });

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.status(401).json({ error: 'Email atau password salah.' });

        // LOG PRIVAT (Menyimpan IP Address untuk Admin)
        const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        await createLog(user.id, 'LOGIN', `User ${user.name} (${user.role.toUpperCase()}) masuk ke sistem.`, userIp, true);

        res.json({
            message: 'Login berhasil!',
            user: { id: user.id, name: user.name, email: user.email, role: user.role, balance: user.balance }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ===================================================
// SISWA: AMBIL MATRIKS KAS BERDASARKAN BULAN & TAHUN
// ===================================================
router.get('/user-matrix/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const month = req.query.month ? parseInt(req.query.month) : new Date().getMonth() + 1;
        const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();

        const userRes = await pool.query('SELECT balance FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: 'User tidak ditemukan.' });

        // Query hanya tanggal kas pada BULAN dan TAHUN yang dipilih
        const datesRes = await pool.query(
            `SELECT * FROM kas_dates 
             WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2 
             ORDER BY date ASC`,
            [month, year]
        );

        const paymentsRes = await pool.query('SELECT kas_date_id FROM kas_payments WHERE user_id = $1', [userId]);
        const paidSet = new Set(paymentsRes.rows.map(p => p.kas_date_id));

        const matrix = datesRes.rows.map(d => ({
            kas_date_id: d.id,
            date: d.date,
            fee_amount: d.fee_amount,
            is_free: d.is_free_kas,
            is_paid: paidSet.has(d.id)
        }));

        res.json({ balance: userRes.rows[0].balance, matrix, month, year });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================================================
// SISWA: AMBIL DAFTAR TANGGAL MATRIKS
// ===================================================
router.get('/matrix-dates', async (req, res) => {
    try {
        const resDates = await pool.query('SELECT * FROM kas_dates ORDER BY date ASC');
        res.json(resDates.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================================================
// SISWA: DEPOSIT MANDIRI
// ===================================================
router.post('/deposit-web', async (req, res) => {
    try {
        const { userId, amount, type } = req.body;
        if (!userId || !amount || amount <= 0) return res.status(400).json({ error: 'Data deposit tidak valid.' });

        await pool.query(`INSERT INTO transactions (user_id, amount, type, status) VALUES ($1, $2, $3, 'success')`, [userId, amount, type || 'qris']);
        await pool.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [amount, userId]);

        const u = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
        const userName = u.rows[0]?.name || `ID ${userId}`;

        // LOG DEPOSIT (PUBLIK)
        await createLog(userId, 'DEPOSIT', `🟢 Deposit Masuk: ${userName} menambah saldo sebesar Rp ${parseFloat(amount).toLocaleString('id-ID')}.`);

        res.json({ message: 'Deposit berhasil ditambahkan!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================================================
// SISWA: BAYAR KAS MANUAL (WAJIB BERURUTAN / TIDAK BOLEH LOMPAT)
// ===================================================
router.post('/pay-kas', async (req, res) => {
    const client = await pool.connect();
    try {
        const { userId, kasDateId } = req.body;
        await client.query('BEGIN');

        // 1. Cek Detail Tanggal Kas yang Ingin Dibayar
        const dateRes = await client.query('SELECT id, date, fee_amount, is_free_kas FROM kas_dates WHERE id = $1', [kasDateId]);
        if (dateRes.rows.length === 0) throw new Error('Tanggal kas tidak ditemukan.');
        const targetKasDate = dateRes.rows[0];

        if (targetKasDate.is_free_kas) {
            throw new Error('Tanggal ini adalah Hari Libur Kas, tidak perlu dibayar.');
        }

        // 2. Cek Apakah Tanggal Ini Sudah Dibayar Sebelumnya
        const checkPaid = await client.query('SELECT id FROM kas_payments WHERE user_id = $1 AND kas_date_id = $2', [userId, kasDateId]);
        if (checkPaid.rows.length > 0) throw new Error('Tanggal ini sudah lunas.');

        // 3. LOGIKA CEK URUTAN: CARI TANGGAL KAS KELAS SEBELUMNYA YANG BELUM DIBAYAR
        const unpaitPriorQuery = `
            SELECT kd.id, kd.date 
            FROM kas_dates kd
            LEFT JOIN kas_payments kp ON kd.id = kp.kas_date_id AND kp.user_id = $1
            WHERE kd.date < $2 AND kd.is_free_kas = FALSE AND kp.id IS NULL
            ORDER BY kd.date ASC
            LIMIT 1
        `;
        const priorCheck = await client.query(unpaitPriorQuery, [userId, targetKasDate.date]);

        // Jika ditemukan tanggal sebelum target yang belum dibayar -> TOLAK
        if (priorCheck.rows.length > 0) {
            const missingDateRaw = typeof priorCheck.rows[0].date === 'string' 
                ? priorCheck.rows[0].date.split('T')[0] 
                : new Date(priorCheck.rows[0].date).toISOString().split('T')[0];
            
            const [y, m, d] = missingDateRaw.split('-');
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
            const formattedMissingDate = `${parseInt(d)} ${monthNames[parseInt(m) - 1]} ${y}`;

            throw new Error(`Harap bayar kas secara berurutan! Kamu masih memiliki tunggakan kas pada tanggal ${formattedMissingDate}.`);
        }

        // 4. Cek Saldo User
        const userRes = await client.query('SELECT name, balance FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) throw new Error('User tidak ditemukan.');

        const user = userRes.rows[0];
        const userBalance = parseFloat(user.balance);
        const fee = parseFloat(targetKasDate.fee_amount);

        if (userBalance < fee) {
            throw new Error(`Saldo tidak cukup! Saldo kamu Rp ${userBalance.toLocaleString('id-ID')}, iuran kas Rp ${fee.toLocaleString('id-ID')}.`);
        }

        // 5. Potong Saldo & Simpan Pembayaran
        await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [fee, userId]);
        await client.query('INSERT INTO kas_payments (user_id, kas_date_id) VALUES ($1, $2)', [userId, kasDateId]);

        await client.query('COMMIT');

        const dateFormatted = new Date(targetKasDate.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

        // LOG PEMBAYARAN KAS (PUBLIK)
        await createLog(userId, 'PAY_KAS', `🔵 Pembayaran Kas: ${user.name} membayar iuran kas tanggal ${dateFormatted} sebesar Rp ${fee.toLocaleString('id-ID')}.`);

        res.json({ message: 'Pembayaran kas berhasil!' });

    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

// ===================================================
// ADMIN API: STATISTIK & REKAP KAS
// ===================================================
router.get('/admin/stats', verifyAdmin, async (req, res) => {
    try {
        const totalIncome = await pool.query("SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE status = 'success'");
        const totalExpense = await pool.query("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses");
        const totalStudents = await pool.query("SELECT COUNT(*) AS total FROM users WHERE role = 'student'");

        const income = parseFloat(totalIncome.rows[0].total);
        const expense = parseFloat(totalExpense.rows[0].total);

        res.json({
            total_students: parseInt(totalStudents.rows[0].total),
            total_income: income,
            total_expense: expense,
            net_balance: income - expense
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================================================
// ADMIN API: KELOLA SISWA
// ===================================================
router.get('/admin/students', verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, email, balance, created_at FROM users WHERE role = $1 ORDER BY id ASC', ['student']);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/admin/add-student', verifyAdmin, async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        const newUser = await pool.query(
            `INSERT INTO users (name, email, password_hash, role, balance) VALUES ($1, $2, $3, 'student', 0) RETURNING id, name`,
            [name, email, hash]
        );

        await createLog(req.headers['x-admin-id'], 'SYSTEM', `👤 Siswa Baru Ditambahkan: ${name} (${email}).`);
        res.json({ message: 'Siswa berhasil ditambahkan!', user: newUser.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/admin/student/:id', verifyAdmin, async (req, res) => {
    try {
        const u = await pool.query('SELECT name FROM users WHERE id = $1', [req.params.id]);
        await pool.query('DELETE FROM users WHERE id = $1 AND role = $2', [req.params.id, 'student']);
        
        await createLog(req.headers['x-admin-id'], 'SYSTEM', `🗑️ Akun Siswa Dihapus: ${u.rows[0]?.name || req.params.id}.`);
        res.json({ message: 'Siswa berhasil dihapus.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================================================
// ADMIN API: SETOR TUNAI (FIX BUG LIVE LOG)
// ===================================================
router.post('/admin/deposit-cash', verifyAdmin, async (req, res) => {
    try {
        const { userId, amount } = req.body;
        const depositAmount = parseFloat(amount);

        if (!userId || isNaN(depositAmount) || depositAmount <= 0) {
            return res.status(400).json({ error: 'Data deposit tidak valid.' });
        }

        // 1. Catat Transaksi Deposit
        await pool.query(
            `INSERT INTO transactions (user_id, amount, type, status) VALUES ($1, $2, 'cash_admin', 'success')`, 
            [userId, depositAmount]
        );

        // 2. Tambah Saldo User
        await pool.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [depositAmount, userId]);

        // 3. Ambil Nama Siswa
        const u = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
        const userName = u.rows[0]?.name || `ID ${userId}`;

        // 4. GENERATE LIVE LOG (PASTI TERCATAT)
        await createLog(
            userId, 
            'DEPOSIT', 
            `💵 Setor Tunai (Admin): ${userName} menerima setoran kas sebesar Rp ${depositAmount.toLocaleString('id-ID')}.`
        );

        res.json({ message: 'Setor tunai berhasil!' });
    } catch (err) {
        console.error('Error deposit cash:', err);
        res.status(500).json({ error: err.message });
    }
});

// ===================================================
// ADMIN API: PENGELUARAN KAS
// ===================================================
router.post('/admin/add-expense', verifyAdmin, async (req, res) => {
    try {
        const { title, amount } = req.body;
        await pool.query('INSERT INTO expenses (title, amount) VALUES ($1, $2)', [title, amount]);

        // LOG PENGELUARAN KAS (PUBLIK)
        await createLog(null, 'EXPENSE', `🔴 Pengeluaran Kas: "${title}" sebesar Rp ${parseFloat(amount).toLocaleString('id-ID')}.`);

        res.json({ message: 'Pengeluaran dicatat!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===================================================
// ADMIN API: SET TANGGAL KAS & LIBUR
// ===================================================
router.post('/admin/set-free-kas', verifyAdmin, async (req, res) => {
    try {
        const { date, note } = req.body;
        await pool.query(
            `INSERT INTO kas_dates (date, is_free_kas, fee_amount, note) 
             VALUES ($1, TRUE, 0, $2)
             ON CONFLICT (date) DO UPDATE SET is_free_kas = TRUE, fee_amount = 0, note = $2`,
            [date, note || 'Hari Libur Kas']
        );

        await createLog(null, 'REKAP', `📅 Libur Kas: Tanggal ${date} ditetapkan sebagai Hari Libur Kas (${note || 'Free Kas'}).`);
        res.json({ message: 'Tanggal libur kas ditetapkan!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/admin/add-kas-dates', verifyAdmin, async (req, res) => {
    try {
        const { startDate, endDate, feeAmount, note } = req.body;
        const fee = parseFloat(feeAmount);
        let curr = new Date(startDate);
        const end = new Date(endDate);
        let count = 0;

        while (curr <= end) {
            const dateStr = curr.toISOString().split('T')[0];
            await pool.query(
                `INSERT INTO kas_dates (date, is_free_kas, fee_amount, note)
                 VALUES ($1, FALSE, $2, $3) ON CONFLICT (date) DO UPDATE SET fee_amount = $2, note = $3`,
                [dateStr, fee, note || 'Iuran Kas Harian']
            );
            count++;
            curr.setDate(curr.getDate() + 1);
        }

        await createLog(null, 'REKAP', `🗓️ Tanggal Kas Dibuat: Admin menambahkan ${count} hari kas baru (iuran Rp ${fee.toLocaleString('id-ID')}/hari).`);
        res.json({ message: `Berhasil menambahkan ${count} tanggal kas baru!` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/admin/delete-kas-range', verifyAdmin, async (req, res) => {
    try {
        const { startDate, endDate } = req.body;
        const datesRes = await pool.query('SELECT id FROM kas_dates WHERE date >= $1 AND date <= $2', [startDate, endDate]);
        if (datesRes.rows.length === 0) return res.status(404).json({ error: 'Tidak ada tanggal kas di rentang ini.' });

        const ids = datesRes.rows.map(r => r.id);
        await pool.query('DELETE FROM kas_payments WHERE kas_date_id = ANY($1::int[])', [ids]);
        await pool.query('DELETE FROM kas_dates WHERE id = ANY($1::int[])', [ids]);

        await createLog(null, 'REKAP', `🗑️ Tanggal Kas Dihapus: ${ids.length} hari kas dari ${startDate} s/d ${endDate} dihapus.`);
        res.json({ message: `Berhasil menghapus ${ids.length} tanggal kas!` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/admin/delete-kas-date/:id', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM kas_payments WHERE kas_date_id = $1', [id]);
        await pool.query('DELETE FROM kas_dates WHERE id = $1', [id]);

        await createLog(null, 'REKAP', `🗑️ Tanggal Kas ID ${id} dihapus dari sistem.`);
        res.json({ message: 'Tanggal kas berhasil dihapus!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint Riwayat Transaksi Deposit Siswa
router.get('/transactions/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query(
            `SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
