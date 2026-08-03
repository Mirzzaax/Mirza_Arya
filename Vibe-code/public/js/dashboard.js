// Variable global untuk menyimpan ID tanggal kas yang akan dibayar pada Modal Confirm
let pendingKasDateId = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Cek Sesi Login User
    const userSessionStr = localStorage.getItem('kas_user');
    if (!userSessionStr) {
        window.location.href = '/index.html';
        return;
    }

    let user;
    try {
        user = JSON.parse(userSessionStr);
    } catch (e) {
        localStorage.removeItem('kas_user');
        window.location.href = '/index.html';
        return;
    }

    // 2. Render Data User ke UI Header & Profil
    if (document.getElementById('navUserName')) document.getElementById('navUserName').innerText = user.name || 'Siswa';
    if (document.getElementById('navUserEmail')) document.getElementById('navUserEmail').innerText = user.email || '';
    if (document.getElementById('studentName')) document.getElementById('studentName').innerText = user.name || 'Siswa';
    if (document.getElementById('studentEmail')) document.getElementById('studentEmail').innerText = user.email || '';
    if (document.getElementById('studentRole')) document.getElementById('studentRole').innerText = (user.role || 'student').toUpperCase();

    // 3. Set Default Filter Dropdown ke Bulan & Tahun Saat Ini
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const selectMonth = document.getElementById('selectMonth');
    const selectYear = document.getElementById('selectYear');

    if (selectMonth) selectMonth.value = currentMonth;
    if (selectYear) selectYear.value = currentYear;

    // 4. Muat Data Matriks Kas & Transaksi Pertama Kali
    await loadStudentData(user.id);

    // 5. Inisialisasi Realtime Live Logs SSE
    initLiveLogs(false);

    // 6. Polling Auto-Refresh (Setiap 5 detik) - Mempertahankan Bulan Pilihan User
    setInterval(async () => {
        await loadStudentDataSilent(user.id);
    }, 5000);

    // 7. Event Listener Tombol Batal & Ya pada Custom Modal Confirmation
    const btnCancel = document.getElementById('btnCancelConfirm');
    const btnAction = document.getElementById('btnActionConfirm');

    if (btnCancel) btnCancel.addEventListener('click', closeConfirmModal);

    if (btnAction) {
        btnAction.addEventListener('click', async () => {
            if (!pendingKasDateId) return;

            const kasDateId = pendingKasDateId;
            closeConfirmModal();

            try {
                const res = await fetch('/api/pay-kas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: user.id,
                        kasDateId: kasDateId
                    })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Gagal melakukan pembayaran.');

                // Reload data matriks dan saldo terbaru
                await loadStudentData(user.id);

            } catch (err) {
                alert('❌ Error: ' + err.message);
            }
        });
    }
});

// ===================================================
// GETTER PARAMETER BULAN & TAHUN AKTIF DARI DROPDOWN
// ===================================================
function getSelectedMonthYear() {
    const monthEl = document.getElementById('selectMonth');
    const yearEl = document.getElementById('selectYear');

    const currentMonth = monthEl && monthEl.value ? monthEl.value : (new Date().getMonth() + 1);
    const currentYear = yearEl && yearEl.value ? yearEl.value : new Date().getFullYear();

    return { month: currentMonth, year: currentYear };
}

// Handler ketika dropdown bulan / tahun diubah oleh user
async function onMonthYearChange() {
    const userSessionStr = localStorage.getItem('kas_user');
    if (!userSessionStr) return;
    const user = JSON.parse(userSessionStr);

    await loadStudentData(user.id);
}

// ===================================================
// FETCH DATA SISWA & MATRIKS KAS
// ===================================================
async function loadStudentData(userId) {
    try {
        const { month, year } = getSelectedMonthYear();
        const res = await fetch(`/api/user-matrix/${userId}?month=${month}&year=${year}`);
        if (!res.ok) throw new Error('Gagal mengambil data dari server');

        const data = await res.json();

        // Update Saldo Realtime
        const balanceFormatted = parseFloat(data.balance || 0).toLocaleString('id-ID');
        const balEl = document.getElementById('studentBalance');
        if (balEl) balEl.innerText = `Rp ${balanceFormatted}`;

        // Render Matriks Grid
        renderMatrixGrid(data.matrix || []);

        // Fetch Riwayat Transaksi Deposit
        await loadTransactions(userId);

    } catch (err) {
        console.error('Error loadStudentData:', err);
        const gridContainer = document.getElementById('kasMatrixGrid');
        if (gridContainer) {
            gridContainer.innerHTML = `<div class="col-span-full text-center py-6 text-red-400 font-semibold">❌ Gagal memuat data matriks. Silakan refresh halaman.</div>`;
        }
    }
}

// Background Auto-Refresh tanpa mengganggu/mereset bulan pilihan user
async function loadStudentDataSilent(userId) {
    try {
        const { month, year } = getSelectedMonthYear();
        const res = await fetch(`/api/user-matrix/${userId}?month=${month}&year=${year}`);
        if (!res.ok) return;

        const data = await res.json();

        const balanceFormatted = parseFloat(data.balance || 0).toLocaleString('id-ID');
        const balEl = document.getElementById('studentBalance');
        if (balEl) balEl.innerText = `Rp ${balanceFormatted}`;

        renderMatrixGrid(data.matrix || []);
        await loadTransactions(userId);
    } catch (err) {
        // Silent catch untuk background polling
    }
}

// ===================================================
// RENDER GRID MATRIKS KAS HARIAN (URUTAN WAJIB)
// ===================================================
function renderMatrixGrid(matrix) {
    const gridContainer = document.getElementById('kasMatrixGrid');
    if (!gridContainer) return;

    gridContainer.innerHTML = '';

    if (!matrix || matrix.length === 0) {
        gridContainer.innerHTML = `<div class="col-span-full text-center py-6 text-slate-500">Belum ada tanggal kas yang dibuat oleh Admin pada bulan ini.</div>`;
        return;
    }

    // Penanda untuk menemukan tanggal PERTAMA yang BELUM DIBAYAR
    let foundFirstUnpaid = false;

    matrix.forEach(item => {
        const card = document.createElement('div');
        card.className = `p-2.5 sm:p-3 rounded-xl border text-center flex flex-col justify-between transition `;

        // Format tanggal aman dari timezone shift
        const dateRaw = typeof item.date === 'string' ? item.date.split('T')[0] : new Date(item.date).toISOString().split('T')[0];
        const [year, month, day] = dateRaw.split('-');
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
        const dateStr = `${parseInt(day)} ${monthNames[parseInt(month) - 1]}`;

        if (item.is_free) {
            // Hari Libur Kas (Free Kas)
            card.classList.add('bg-slate-800', 'border-slate-700', 'text-slate-400');
            card.innerHTML = `
                <span class="text-[10px] font-semibold text-slate-500 block uppercase">Libur</span>
                <span class="text-xs sm:text-sm font-bold my-1 text-slate-300">${dateStr}</span>
                <span class="text-[10px] bg-slate-700 text-slate-300 rounded px-1 py-0.5">FREE</span>
            `;
        } else if (item.is_paid) {
            // Sudah Bayar (PAID)
            card.classList.add('bg-emerald-500/10', 'border-emerald-500/30', 'text-emerald-400');
            card.innerHTML = `
                <span class="text-[10px] font-semibold block uppercase">Kas</span>
                <span class="text-xs sm:text-sm font-bold my-1 text-emerald-300">${dateStr}</span>
                <span class="text-[10px] bg-emerald-500/20 text-emerald-300 rounded px-1 py-0.5 font-medium">✓ PAID</span>
            `;
        } else {
            // Belum Bayar
            if (!foundFirstUnpaid) {
                // TANGGAL PERTAMA YANG GILIRAN DIBAYAR SEKARANG
                foundFirstUnpaid = true;
                card.classList.add('bg-red-500/15', 'border-red-500/50', 'text-red-400', 'ring-2', 'ring-red-500/30');
                card.innerHTML = `
                    <span class="text-[10px] font-semibold block uppercase text-red-400">Kas (Bayar Ini)</span>
                    <span class="text-xs sm:text-sm font-bold my-1 text-red-200">${dateStr}</span>
                    <button onclick="payKasManual(${item.kas_date_id}, '${dateStr}', ${parseInt(item.fee_amount)})" class="mt-1 w-full py-1 bg-red-600 hover:bg-red-500 text-white font-semibold rounded text-[10px] transition shadow-lg">
                        Bayar Rp ${parseInt(item.fee_amount).toLocaleString('id-ID')}
                    </button>
                `;
            } else {
                // TANGGAL BERIKUTNYA (DILOCK AGAR PEMBAYARAN URUT)
                card.classList.add('bg-slate-900/60', 'border-slate-800', 'text-slate-600', 'opacity-60');
                card.innerHTML = `
                    <span class="text-[10px] font-semibold block uppercase text-slate-600">Kas</span>
                    <span class="text-xs sm:text-sm font-bold my-1 text-slate-500">${dateStr}</span>
                    <button onclick="payKasManual(${item.kas_date_id}, '${dateStr}', ${parseInt(item.fee_amount)})" class="mt-1 w-full py-1 bg-slate-800 text-slate-500 font-semibold rounded text-[10px] cursor-not-allowed">
                        Bayar Rp ${parseInt(item.fee_amount).toLocaleString('id-ID')}
                    </button>
                `;
            }
        }

        gridContainer.appendChild(card);
    });
}

// ===================================================
// CUSTOM MODAL CONFIRMATION HANDLER
// ===================================================
function payKasManual(kasDateId, dateStr, feeAmount) {
    showConfirmModal(kasDateId, dateStr, feeAmount);
}

function showConfirmModal(kasDateId, dateStr, feeAmount) {
    pendingKasDateId = kasDateId;
    const modal = document.getElementById('confirmModal');
    const modalText = document.getElementById('confirmModalText');

    if (modalText) {
        modalText.innerHTML = `Kamu akan membayar iuran kas tanggal <b class="text-white">${dateStr}</b> sebesar <b class="text-emerald-400">Rp ${feeAmount.toLocaleString('id-ID')}</b>.`;
    }

    if (modal) modal.classList.remove('hidden');
}

function closeConfirmModal() {
    pendingKasDateId = null;
    const modal = document.getElementById('confirmModal');
    if (modal) modal.classList.add('hidden');
}

// ===================================================
// FETCH RIWAYAT TRANSAKSI DEPOSIT
// ===================================================
async function loadTransactions(userId) {
    try {
        const res = await fetch(`/api/transactions/${userId}`);
        if (!res.ok) return;

        const txs = await res.json();
        const tbody = document.getElementById('transactionHistoryTable');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (!txs || txs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-slate-500">Belum ada riwayat deposit.</td></tr>`;
            return;
        }

        txs.forEach(t => {
            const dateStr = new Date(t.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="py-3 px-4 text-slate-400 font-mono">${dateStr}</td>
                <td class="py-3 px-4 font-bold text-indigo-400 uppercase">${t.type}</td>
                <td class="py-3 px-4 font-bold text-emerald-400">+Rp ${parseFloat(t.amount).toLocaleString('id-ID')}</td>
                <td class="py-3 px-4"><span class="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold rounded">SUCCESS</span></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('Error loadTransactions:', err);
    }
}

// ===================================================
// SYSTEM LOGS REALTIME STREAMER (LIVE LOGS)
// ===================================================
function initLiveLogs(isAdmin = false, adminId = null) {
    const logContainer = document.getElementById('liveLogContainer');
    if (!logContainer) return;

    const headers = isAdmin ? { 'x-admin-id': adminId } : {};

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
            logContainer.innerHTML = `<div class="text-slate-500 italic text-center py-2">Gagal memuat log.</div>`;
        });

    try {
        const eventSource = new EventSource(`/api/logs/stream?isAdmin=${isAdmin}`);
        eventSource.onmessage = (event) => {
            const log = JSON.parse(event.data);
            appendLogMessage(log, logContainer);
            logContainer.scrollTop = logContainer.scrollHeight;
        };
    } catch (err) {
        console.error('SSE connection error:', err);
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

    const ipText = log.ip_address ? `<span class="text-[10px] bg-amber-500/20 text-amber-400 font-mono px-1 py-0.5 rounded ml-1">[IP: ${log.ip_address}]</span>` : '';

    logRow.innerHTML = `
        <span class="text-slate-500 text-[10px] font-mono whitespace-nowrap mt-0.5">[${time}]</span>
        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase whitespace-nowrap ${badgeColor}">${badgeText}</span>
        <span class="flex-1 text-[11px] leading-relaxed">${log.message} ${ipText}</span>
    `;

    container.appendChild(logRow);
}
