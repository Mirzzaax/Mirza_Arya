document.addEventListener('DOMContentLoaded', async () => {
    const userSessionStr = localStorage.getItem('kas_user');
    if (!userSessionStr) return window.location.href = '/index.html';

    const user = JSON.parse(userSessionStr);
    if (user.role !== 'admin') {
        alert('Akses ditolak! Halaman ini khusus Admin.');
        return window.location.href = '/dashboard.html';
    }

    await loadAdminDashboard(user.id);

// INISIALISASI LIVE LOGS UNTUK ADMIN (Pastikan parameter ini terisi)
    initLiveLogs(true, user.id);
});

async function loadAdminDashboard(adminId) {
    const headers = { 'x-admin-id': adminId, 'Content-Type': 'application/json' };

    // Fetch Stats
    const resStats = await fetch('/api/admin/stats', { headers });
    const stats = await resStats.json();
    document.getElementById('statStudents').innerText = `${stats.total_students} Orang`;
    document.getElementById('statIncome').innerText = `Rp ${stats.total_income.toLocaleString('id-ID')}`;
    document.getElementById('statExpense').innerText = `Rp ${stats.total_expense.toLocaleString('id-ID')}`;
    document.getElementById('statNet').innerText = `Rp ${stats.net_balance.toLocaleString('id-ID')}`;

    // Fetch Students List
    const resStudents = await fetch('/api/admin/students', { headers });
    const students = await resStudents.json();
    renderStudentTable(students, adminId);
    populateStudentSelect(students);
async function loadAdminDashboard(adminId) {
    const headers = { 'x-admin-id': adminId, 'Content-Type': 'application/json' };

    // Fetch Stats
    const resStats = await fetch('/api/admin/stats', { headers });
    const stats = await resStats.json();
    document.getElementById('statStudents').innerText = `${stats.total_students} Orang`;
    document.getElementById('statIncome').innerText = `Rp ${stats.total_income.toLocaleString('id-ID')}`;
    document.getElementById('statExpense').innerText = `Rp ${stats.total_expense.toLocaleString('id-ID')}`;
    document.getElementById('statNet').innerText = `Rp ${stats.net_balance.toLocaleString('id-ID')}`;

    // Fetch Students List
    const resStudents = await fetch('/api/admin/students', { headers });
    const students = await resStudents.json();
    renderStudentTable(students, adminId);
    populateStudentSelect(students);

    // Fetch Kas Dates List
    await loadKasDatesTable(adminId);
}
}

function renderStudentTable(students, adminId) {
    const tbody = document.getElementById('adminStudentTable');
    tbody.innerHTML = '';

    students.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="py-3 px-4 font-mono">${s.id}</td>
            <td class="py-3 px-4 font-semibold text-white">${s.name}</td>
            <td class="py-3 px-4">${s.email}</td>
            <td class="py-3 px-4 text-emerald-400 font-semibold">Rp ${parseFloat(s.balance).toLocaleString('id-ID')}</td>
            <td class="py-3 px-4">
                <button onclick="deleteStudent(${s.id}, '${s.name}')" class="px-2.5 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20">Hapus</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function populateStudentSelect(students) {
    const select = document.getElementById('depositStudentSelect');
    select.innerHTML = '<option value="">-- Pilih Siswa --</option>';
    students.forEach(s => {
        select.innerHTML += `<option value="${s.id}">${s.name} (ID: ${s.id})</option>`;
    });
}

// Modal Handlers
function openAddStudentModal() { document.getElementById('modalAddStudent').classList.remove('hidden'); }
function closeAddStudentModal() { document.getElementById('modalAddStudent').classList.add('hidden'); }

// Submit Handlers
document.getElementById('formDepositCash')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const admin = JSON.parse(localStorage.getItem('kas_user'));
    const userId = document.getElementById('depositStudentSelect').value;
    const amount = parseFloat(document.getElementById('depositCashAmount').value);

    const res = await fetch('/api/admin/deposit-cash', {
        method: 'POST',
        headers: { 'x-admin-id': admin.id, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount })
    });
    if (res.ok) {
        alert('✅ Setor tunai berhasil!');
        loadAdminDashboard(admin.id);
    }
});

document.getElementById('formAddExpense')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const admin = JSON.parse(localStorage.getItem('kas_user'));
    const title = document.getElementById('expenseTitle').value;
    const amount = parseFloat(document.getElementById('expenseAmount').value);

    const res = await fetch('/api/admin/add-expense', {
        method: 'POST',
        headers: { 'x-admin-id': admin.id, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, amount })
    });
    if (res.ok) {
        alert('✅ Pengeluaran berhasil dicatat!');
        loadAdminDashboard(admin.id);
    }
});

document.getElementById('formAddStudent')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const admin = JSON.parse(localStorage.getItem('kas_user'));
    const name = document.getElementById('newStudentName').value;
    const email = document.getElementById('newStudentEmail').value;
    const password = document.getElementById('newStudentPassword').value;

    const res = await fetch('/api/admin/add-student', {
        method: 'POST',
        headers: { 'x-admin-id': admin.id, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
    });
    if (res.ok) {
        alert('✅ Siswa berhasil ditambahkan!');
        closeAddStudentModal();
        loadAdminDashboard(admin.id);
    }
});

async function deleteStudent(studentId, name) {
    if (!confirm(`Hapus siswa ${name}?`)) return;
    const admin = JSON.parse(localStorage.getItem('kas_user'));
    const res = await fetch(`/api/admin/student/${studentId}`, {
        method: 'DELETE',
        headers: { 'x-admin-id': admin.id }
    });
    if (res.ok) {
        alert('✅ Siswa berhasil dihapus.');
        loadAdminDashboard(admin.id);
    }
}

document.getElementById('formAddKasDates')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const admin = JSON.parse(localStorage.getItem('kas_user'));
    
    const startDate = document.getElementById('kasStartDate').value;
    const endDate = document.getElementById('kasEndDate').value;
    const feeAmount = document.getElementById('kasFeeAmount').value;

    try {
        const res = await fetch('/api/admin/add-kas-dates', {
            method: 'POST',
            headers: { 'x-admin-id': admin.id, 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate, endDate, feeAmount })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal menambahkan tanggal kas.');

        alert(`✅ ${data.message}`);
        document.getElementById('formAddKasDates').reset();

    } catch (err) {
        alert('❌ Error: ' + err.message);
    }
});

// Render Tabel Daftar Tanggal Kas
async function loadKasDatesTable(adminId) {
    try {
        const res = await fetch('/api/matrix-dates'); // Endpoint publik mengambil tanggal kas
        const dates = await res.json();
        
        const tbody = document.getElementById('adminKasDatesTable');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (dates.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-slate-500">Belum ada tanggal kas.</td></tr>`;
            return;
        }

        dates.forEach(d => {
            const dateStr = typeof d.date === 'string' ? d.date.split('T')[0] : new Date(d.date).toISOString().split('T')[0];
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="py-2.5 px-4 font-mono text-slate-400">${d.id}</td>
                <td class="py-2.5 px-4 font-bold text-white">${dateStr}</td>
                <td class="py-2.5 px-4">
                    ${d.is_free_kas 
                        ? '<span class="px-2 py-0.5 bg-slate-700 text-slate-300 rounded text-[10px]">LIBUR</span>' 
                        : '<span class="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[10px]">KAS</span>'}
                </td>
                <td class="py-2.5 px-4">Rp ${parseFloat(d.fee_amount).toLocaleString('id-ID')}</td>
                <td class="py-2.5 px-4 text-slate-400">${d.note || '-'}</td>
                <td class="py-2.5 px-4">
                    <button onclick="deleteSingleKasDate(${d.id}, '${dateStr}')" class="px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded hover:bg-red-500/20 transition">Hapus</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('Error load kas dates:', err);
    }
}

// Handler Hapus 1 Tanggal Kas
async function deleteSingleKasDate(id, dateStr) {
    if (!confirm(`Apakah kamu yakin ingin menghapus tanggal kas ${dateStr}?`)) return;

    const admin = JSON.parse(localStorage.getItem('kas_user'));
    try {
        const res = await fetch(`/api/admin/delete-kas-date/${id}`, {
            method: 'DELETE',
            headers: { 'x-admin-id': admin.id }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal menghapus tanggal.');

        alert(`✅ ${data.message}`);
        loadAdminDashboard(admin.id);
    } catch (err) {
        alert('❌ Error: ' + err.message);
    }
}

// Handler Form Hapus Rentang Tanggal / Bulan
document.getElementById('formDeleteKasRange')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const admin = JSON.parse(localStorage.getItem('kas_user'));

    const startDate = document.getElementById('deleteStartDate').value;
    const endDate = document.getElementById('deleteEndDate').value;

    if (!confirm(`YAKIN HAPUS? Semua tanggal kas dari ${startDate} sampai ${endDate} akan dihapus permanen!`)) return;

    try {
        const res = await fetch('/api/admin/delete-kas-range', {
            method: 'POST',
            headers: { 'x-admin-id': admin.id, 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate, endDate })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal menghapus rentang tanggal.');

        alert(`✅ ${data.message}`);
        document.getElementById('formDeleteKasRange').reset();
        loadAdminDashboard(admin.id);

    } catch (err) {
        alert('❌ Error: ' + err.message);
    }
});

// ===================================================
// SYSTEM LOGS REALTIME STREAMER (COLOR CODED)
// ===================================================
function initLiveLogs(isAdmin = false, adminId = null) {
    const logContainer = document.getElementById('liveLogContainer');
    if (!logContainer) return;

    const headers = isAdmin ? { 'x-admin-id': adminId } : {};

    // 1. Fetch Log Terakhir saat Pertama Buka
    fetch('/api/logs/recent', { headers })
        .then(res => res.json())
        .then(logs => {
            logContainer.innerHTML = '';
            if (logs.length === 0) {
                logContainer.innerHTML = `<div class="text-slate-500 italic text-center py-2">Belum ada aktivitas tercatat.</div>`;
                return;
            }
            logs.reverse().forEach(log => appendLogMessage(log, logContainer));
            logContainer.scrollTop = logContainer.scrollHeight;
        });

    // 2. Hubungkan SSE Stream untuk Realtime Update
    const eventSource = new EventSource(`/api/logs/stream?isAdmin=${isAdmin}`);
    eventSource.onmessage = (event) => {
        const log = JSON.parse(event.data);
        appendLogMessage(log, logContainer);
        logContainer.scrollTop = logContainer.scrollHeight;
    };
}

function appendLogMessage(log, container) {
    const logRow = document.createElement('div');
    logRow.className = 'py-1.5 px-3 rounded-lg flex items-start space-x-2 transition border-l-4 ';

    const time = new Date(log.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let badgeColor = '';
    let badgeText = log.action_type;

    // SKEMA WARNA DIBEDAKAN BERDASARKAN KATEGORI
    switch (log.action_type) {
        case 'DEPOSIT':
            logRow.classList.add('bg-emerald-500/10', 'border-emerald-500', 'text-emerald-300');
            badgeColor = 'bg-emerald-500/20 text-emerald-400';
            break;
        case 'PAY_KAS':
            logRow.classList.add('bg-indigo-500/10', 'border-indigo-500', 'text-indigo-300');
            badgeColor = 'bg-indigo-500/20 text-indigo-400';
            break;
        case 'EXPENSE':
            logRow.classList.add('bg-red-500/10', 'border-red-500', 'text-red-300');
            badgeColor = 'bg-red-500/20 text-red-400';
            break;
        case 'REKAP':
            logRow.classList.add('bg-cyan-500/10', 'border-cyan-500', 'text-cyan-300');
            badgeColor = 'bg-cyan-500/20 text-cyan-400';
            break;
        case 'SYSTEM':
            logRow.classList.add('bg-purple-500/10', 'border-purple-500', 'text-purple-300');
            badgeColor = 'bg-purple-500/20 text-purple-400';
            break;
        case 'LOGIN':
            logRow.classList.add('bg-amber-500/10', 'border-amber-500', 'text-amber-300');
            badgeColor = 'bg-amber-500/20 text-amber-400';
            break;
        default:
            logRow.classList.add('bg-slate-800', 'border-slate-600', 'text-slate-300');
            badgeColor = 'bg-slate-700 text-slate-300';
    }

    const ipText = log.ip_address ? `<span class="text-[10px] bg-amber-500/20 text-amber-400 font-mono px-1 py-0.5 rounded ml-1">[IP: ${log.ip_address}]</span>` : '';

    logRow.innerHTML = `
        <span class="text-slate-500 text-[10px] font-mono whitespace-nowrap mt-0.5">[${time}]</span>
        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase whitespace-nowrap ${badgeColor}">${badgeText}</span>
        <span class="flex-1 text-[11px] leading-relaxed">${log.message} ${ipText}</span>
    `;

    container.appendChild(logRow);
}

// ===================================================
// SYSTEM LOGS REALTIME STREAMER (ADMIN VERSION)
// ===================================================
function initLiveLogs(isAdmin = true, adminId = null) {
    const logContainer = document.getElementById('liveLogContainer');
    if (!logContainer) return;

    // Header khusus Admin untuk mengambil log privat (termasuk IP Address)
    const headers = { 'x-admin-id': adminId };

    // 1. Fetch 50 Log Terakhir
    fetch('/api/logs/recent', { headers })
        .then(res => res.json())
        .then(logs => {
            logContainer.innerHTML = '';
            if (!Array.isArray(logs) || logs.length === 0) {
                logContainer.innerHTML = `<div class="text-slate-500 italic text-center py-2">Belum ada aktivitas tercatat.</div>`;
                return;
            }
            logs.reverse().forEach(log => appendLogMessage(log, logContainer));
            logContainer.scrollTop = logContainer.scrollHeight;
        })
        .catch(err => {
            console.error('Error load recent logs:', err);
            logContainer.innerHTML = `<div class="text-slate-500 italic text-center py-2">Gagal memuat log.</div>`;
        });

    // 2. Stream Live Log SSE
    try {
        const eventSource = new EventSource(`/api/logs/stream?isAdmin=true`);
        eventSource.onmessage = (event) => {
            const log = JSON.parse(event.data);
            appendLogMessage(log, logContainer);
            logContainer.scrollTop = logContainer.scrollHeight;
        };
    } catch (err) {
        console.error('SSE Error:', err);
    }
}

function appendLogMessage(log, container) {
    const logRow = document.createElement('div');
    logRow.className = 'py-1.5 px-3 rounded-lg flex items-start space-x-2 transition border-l-4 ';

    const time = new Date(log.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let badgeColor = '';
    let badgeText = log.action_type;

    switch (log.action_type) {
        case 'DEPOSIT':
            logRow.classList.add('bg-emerald-500/10', 'border-emerald-500', 'text-emerald-300');
            badgeColor = 'bg-emerald-500/20 text-emerald-400';
            break;
        case 'PAY_KAS':
            logRow.classList.add('bg-indigo-500/10', 'border-indigo-500', 'text-indigo-300');
            badgeColor = 'bg-indigo-500/20 text-indigo-400';
            break;
        case 'EXPENSE':
            logRow.classList.add('bg-red-500/10', 'border-red-500', 'text-red-300');
            badgeColor = 'bg-red-500/20 text-red-400';
            break;
        case 'REKAP':
            logRow.classList.add('bg-cyan-500/10', 'border-cyan-500', 'text-cyan-300');
            badgeColor = 'bg-cyan-500/20 text-cyan-400';
            break;
        case 'SYSTEM':
            logRow.classList.add('bg-purple-500/10', 'border-purple-500', 'text-purple-300');
            badgeColor = 'bg-purple-500/20 text-purple-400';
            break;
        case 'LOGIN':
            logRow.classList.add('bg-amber-500/10', 'border-amber-500', 'text-amber-300');
            badgeColor = 'bg-amber-500/20 text-amber-400';
            break;
        default:
            logRow.classList.add('bg-slate-800', 'border-slate-600', 'text-slate-300');
            badgeColor = 'bg-slate-700 text-slate-300';
    }

    // IP Address hanya ditampilkan jika ada
    const ipText = log.ip_address ? `<span class="text-[10px] bg-amber-500/20 text-amber-400 font-mono px-1 py-0.5 rounded ml-1">[IP: ${log.ip_address}]</span>` : '';

    logRow.innerHTML = `
        <span class="text-slate-500 text-[10px] font-mono whitespace-nowrap mt-0.5">[${time}]</span>
        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase whitespace-nowrap ${badgeColor}">${badgeText}</span>
        <span class="flex-1 text-[11px] leading-relaxed">${log.message} ${ipText}</span>
    `;

    container.appendChild(logRow);
}
