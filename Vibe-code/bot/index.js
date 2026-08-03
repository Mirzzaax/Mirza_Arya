const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    Events,
    MessageFlags,
    AttachmentBuilder,
    EmbedBuilder
} = require('discord.js');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const pool = require('../config/db');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

const TARGET_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

// ===================================================
// LOG KONEKSI BOT
// ===================================================
client.on(Events.ClientReady, (readyClient) => {
    console.log('--------------------------------------------------');
    console.log(`🤖 DISCORD BOT CONTROL CENTER: ONLINE`);
    console.log(`👤 Logged in as : ${readyClient.user.tag}`);
    console.log(`📌 Target Ch ID : ${TARGET_CHANNEL_ID || 'Semua Channel'}`);
    console.log('--------------------------------------------------');
});

// ===================================================
// COMMAND UTAMA PEMICU PANEL (!setup-kas / !dashboard)
// ===================================================
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (TARGET_CHANNEL_ID && message.channel.id !== TARGET_CHANNEL_ID) return;

    const cmd = message.content.toLowerCase();
    if (cmd === '!setup-kas' || cmd === '!dashboard') {
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_add_student')
                .setLabel('Tambah Siswa')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('👤'),
            new ButtonBuilder()
                .setCustomId('btn_list_students')
                .setLabel('Daftar Semua Siswa')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📋'),
            new ButtonBuilder()
                .setCustomId('btn_delete_student')
                .setLabel('Hapus Siswa (Email)')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️'),
            new ButtonBuilder()
                .setCustomId('btn_add_kas')
                .setLabel('Setor Kas Tunai')
                .setStyle(ButtonStyle.Success)
                .setEmoji('💵')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_add_expense')
                .setLabel('Catat Pengeluaran')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📝'),
            new ButtonBuilder()
                .setCustomId('btn_set_free_kas')
                .setLabel('Set Hari Libur Kas')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📅'),
            new ButtonBuilder()
                .setCustomId('btn_export_excel')
                .setLabel('Export Excel')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📊')
        );

        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_overview')
                .setLabel('Ringkasan Keuangan')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📈'),
            new ButtonBuilder()
                .setCustomId('btn_tagih')
                .setLabel('Daftar Penunggak')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('📢')
        );

        await message.channel.send({
            content: '📌 **DASHBOARD UTAMA MANAJEMEN KAS KELAS**\nPilih fitur yang ingin kamu kelola melalui tombol di bawah:',
            components: [row1, row2, row3]
        });
    }
});

// ===================================================
// HANDLER TOMBOL & MODAL (ALL BUTTON INTERACTION)
// ===================================================
client.on(Events.InteractionCreate, async (interaction) => {
    try {
        if (TARGET_CHANNEL_ID && interaction.channelId !== TARGET_CHANNEL_ID) {
            if (interaction.isButton() || interaction.isModalSubmit()) {
                return interaction.reply({
                    content: '❌ Perintah ini hanya bisa digunakan di channel khusus admin!',
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        // ------------------------------------------------
        // 1. HANDLER AKSI TOMBOL
        // ------------------------------------------------
        if (interaction.isButton()) {
            
            // A. Tambah Siswa Baru
            if (interaction.customId === 'btn_add_student') {
                const modal = new ModalBuilder().setCustomId('modal_add_student').setTitle('Tambah Akun Siswa Baru');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('student_name').setLabel('Nama Lengkap').setStyle(TextInputStyle.Short).setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('student_email').setLabel('Email').setStyle(TextInputStyle.Short).setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('student_password').setLabel('Password Default').setStyle(TextInputStyle.Short).setRequired(true)
                    )
                );
                await interaction.showModal(modal);
            }

            // B. Daftar Semua Siswa
            if (interaction.customId === 'btn_list_students') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const usersRes = await pool.query(
                    'SELECT id, name, email, balance FROM users WHERE role = $1 ORDER BY id ASC', 
                    ['student']
                );

                if (usersRes.rows.length === 0) {
                    return interaction.editReply('📭 **Belum ada data siswa yang terdaftar di database.**');
                }

                let studentListText = '';
                usersRes.rows.forEach((u) => {
                    const balance = parseFloat(u.balance).toLocaleString('id-ID');
                    studentListText += `🆔 **ID:** \`${u.id}\` | **${u.name}**\n📧 Email: \`${u.email}\` | 💰 Saldo: Rp ${balance}\n-----------------------------------\n`;
                });

                const embed = new EmbedBuilder()
                    .setTitle('📋 DAFTAR SELURUH SISWA TERCATAT')
                    .setColor('#00ffab')
                    .setDescription(studentListText)
                    .setFooter({ text: `Total Siswa: ${usersRes.rows.length} orang` })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            }

            // C. Hapus Siswa via Email
            if (interaction.customId === 'btn_delete_student') {
                const modal = new ModalBuilder().setCustomId('modal_delete_student').setTitle('Hapus Siswa dari Sistem');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('student_email_delete')
                            .setLabel('Email Siswa yang Akan Dihapus')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('budi@gmail.com')
                            .setRequired(true)
                    )
                );
                await interaction.showModal(modal);
            }

            // D. Setor Kas Tunai
            if (interaction.customId === 'btn_add_kas') {
                const modal = new ModalBuilder().setCustomId('modal_add_kas').setTitle('Setor Kas Tunai (Admin)');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('kas_identifier').setLabel('ID atau Nama Siswa').setStyle(TextInputStyle.Short).setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('kas_amount').setLabel('Nominal (Rp)').setStyle(TextInputStyle.Short).setRequired(true)
                    )
                );
                await interaction.showModal(modal);
            }

            // E. Catat Pengeluaran Kas
            if (interaction.customId === 'btn_add_expense') {
                const modal = new ModalBuilder().setCustomId('modal_add_expense').setTitle('Catat Pengeluaran Kas Kelas');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('exp_title').setLabel('Keterangan Pengeluaran').setStyle(TextInputStyle.Short).setPlaceholder('Beli Spidol').setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('exp_amount').setLabel('Nominal (Rp)').setStyle(TextInputStyle.Short).setPlaceholder('15000').setRequired(true)
                    )
                );
                await interaction.showModal(modal);
            }

            // F. Set Hari Libur Kas (Free Kas)
            if (interaction.customId === 'btn_set_free_kas') {
                const modal = new ModalBuilder().setCustomId('modal_set_free_kas').setTitle('Set Tanggal Libur Kas');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('free_date').setLabel('Tanggal (YYYY-MM-DD)').setStyle(TextInputStyle.Short).setPlaceholder('2026-08-17').setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('free_note').setLabel('Keterangan (Opsional)').setStyle(TextInputStyle.Short).setPlaceholder('Libur 17 Agustus').setRequired(false)
                    )
                );
                await interaction.showModal(modal);
            }

            // G. Export File Excel (.xlsx)
                        // ===================================================
            // HANDLER EXPORT EXCEL PROFESIONAL (MATRIKS & REKAP)
            // ===================================================
            if (interaction.customId === 'btn_export_excel') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            
                const workbook = new ExcelJS.Workbook();

                // ----------------------------------------------------
                // TAB 1: MATRIKS IURAN KAS SISWA
                // ----------------------------------------------------
                const sheetMatrix = workbook.addWorksheet('Matriks Kas Siswa');
                sheetMatrix.views = [{ showGridLines: true }]; // Tampilkan garis grid Excel
            
                // Style Definitions
                const borderStyle = {
                    top: { style: 'thin', color: { argb: 'D3D3D3' } },
                    left: { style: 'thin', color: { argb: 'D3D3D3' } },
                    bottom: { style: 'thin', color: { argb: 'D3D3D3' } },
                    right: { style: 'thin', color: { argb: 'D3D3D3' } }
                };
            
                const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } }; // Dark Slate
                const headerFont = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
            
                const checkFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D1FAE5' } }; // Light Green
                const checkFont = { name: 'Arial', size: 11, bold: true, color: { argb: '065F46' } };
            
                const uncheckFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } }; // Light Red
                const uncheckFont = { name: 'Arial', size: 10, color: { argb: '991B1B' } };
            
                const freeFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } }; // Light Grey
            
                // Fetch Data dari DB
                const studentsRes = await pool.query("SELECT id, name, balance FROM users WHERE role = 'student' ORDER BY name ASC");
                const datesRes = await pool.query("SELECT * FROM kas_dates ORDER BY date ASC");
                const paymentsRes = await pool.query("SELECT user_id, kas_date_id FROM kas_payments");
            
                // Mapping Set untuk Cek Pembayaran Cepat
                const paidMap = new Set(paymentsRes.rows.map(p => `${p.user_id}_${p.kas_date_id}`));
            
                // Set Up Header Columns
                const columns = [
                    { header: 'No', key: 'no', width: 6 },
                    { header: 'Nama Siswa', key: 'name', width: 25 },
                    { header: 'Sisa Saldo', key: 'balance', width: 15 }
                ];
            
                // Tambah Kolom Tanggal Kas
                datesRes.rows.forEach(d => {
                    const dateRaw = typeof d.date === 'string' ? d.date.split('T')[0] : new Date(d.date).toISOString().split('T')[0];
                    const [y, m, day] = dateRaw.split('-');
                    const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
                    columns.push({ header: `${parseInt(day)} ${monthNames[parseInt(m) - 1]}`, key: `date_${d.id}`, width: 15 });
                });
            
                columns.push({ header: 'Total Bayar', key: 'total_paid', width: 16 });
                sheetMatrix.columns = columns;
            
                // Format Visual Header Row
                const headerRow = sheetMatrix.getRow(1);
                headerRow.height = 28;
                headerRow.eachCell((cell) => {
                    cell.fill = headerFill;
                    cell.font = headerFont;
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                    cell.border = borderStyle;
                });
            
                // Freeze Pane agar kolom Nama tetap terlihat saat scroll ke kanan
                sheetMatrix.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
            
                let totalKasPemasukanGlobal = 0;
                const dailyTotals = {}; // Menyimpan total harian
                datesRes.rows.forEach(d => dailyTotals[d.id] = 0);
            
                // Isi Data Baris Siswa
                studentsRes.rows.forEach((student, idx) => {
                    let totalPaidStudent = 0;
                    const rowData = {
                        no: idx + 1,
                        name: student.name,
                        balance: parseFloat(student.balance)
                    };
                
                    datesRes.rows.forEach(d => {
                        const isPaid = paidMap.has(`${student.id}_${d.id}`);
                        if (d.is_free_kas) {
                            rowData[`date_${d.id}`] = 'FREE';
                        } else if (isPaid) {
                            rowData[`date_${d.id}`] = '✓';
                            totalPaidStudent += parseFloat(d.fee_amount);
                            dailyTotals[d.id] += parseFloat(d.fee_amount);
                        } else {
                            rowData[`date_${d.id}`] = '-';
                        }
                    });
                
                    rowData['total_paid'] = totalPaidStudent;
                    totalKasPemasukanGlobal += totalPaidStudent;
                
                    const row = sheetMatrix.addRow(rowData);
                    row.height = 20;
                
                    // Styling Setiap Sel Baris
                    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                        cell.border = borderStyle;
                        cell.alignment = { vertical: 'middle', horizontal: 'center' };
                    
                        // Kolom Nama rata kiri
                        if (colNumber === 2) cell.alignment = { vertical: 'middle', horizontal: 'left' };

                        // Format Saldo & Total
                        if (colNumber === 3 || colNumber === columns.length) {
                            cell.numFmt = 'Rp #,##0';
                            cell.alignment = { vertical: 'middle', horizontal: 'right' };
                        }
                    
                        // Styling Centang (✓) / Uncheck (-) / FREE
                        if (cell.value === '✓') {
                            cell.fill = checkFill;
                            cell.font = checkFont;
                        } else if (cell.value === '-') {
                            cell.fill = uncheckFill;
                            cell.font = uncheckFont;
                        } else if (cell.value === 'FREE') {
                            cell.fill = freeFill;
                            cell.font = { name: 'Arial', size: 9, italic: true, color: { argb: '64748B' } };
                        }
                    });
                });
            
                // Baris Total Kas Harian
                const totalRowData = { no: '', name: 'TOTAL KAS HARIAN', balance: '' };
                datesRes.rows.forEach(d => {
                    totalRowData[`date_${d.id}`] = dailyTotals[d.id];
                });
                totalRowData['total_paid'] = totalKasPemasukanGlobal;
            
                const totalRow = sheetMatrix.addRow(totalRowData);
                totalRow.height = 24;
                totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                    cell.font = { name: 'Arial', size: 10, bold: true };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
                    cell.border = { top: { style: 'medium' }, bottom: { style: 'double' } };
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                
                    if (colNumber >= 4) {
                        cell.numFmt = 'Rp #,##0';
                        cell.alignment = { vertical: 'middle', horizontal: 'right' };
                    }
                });
            
                // ----------------------------------------------------
                // TAB 2: PENGELUARAN & REKAP AKHIR KAS
                // ----------------------------------------------------
                const sheetExpense = workbook.addWorksheet('Pengeluaran & Rekap Kas');
                sheetExpense.views = [{ showGridLines: true }];

                // Header Pengeluaran
                sheetExpense.columns = [
                    { header: 'No', key: 'no', width: 6 },
                    { header: 'Tanggal Pengeluaran', key: 'date', width: 22 },
                    { header: 'Keterangan / Keperluan', key: 'title', width: 35 },
                    { header: 'Nominal (Rp)', key: 'amount', width: 20 }
                ];
            
                const expHeader = sheetExpense.getRow(1);
                expHeader.height = 26;
                expHeader.eachCell((cell) => {
                    cell.fill = headerFill;
                    cell.font = headerFont;
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                    cell.border = borderStyle;
                });
            
                const expRes = await pool.query('SELECT * FROM expenses ORDER BY created_at ASC');
                let totalExpenseGlobal = 0;
            
                expRes.rows.forEach((e, idx) => {
                    const amount = parseFloat(e.amount);
                    totalExpenseGlobal += amount;
                
                    const dateFormatted = new Date(e.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
                    const row = sheetExpense.addRow({
                        no: idx + 1,
                        date: dateFormatted,
                        title: e.title,
                        amount: amount
                    });
                
                    row.eachCell((cell, colNumber) => {
                        cell.border = borderStyle;
                        cell.alignment = { vertical: 'middle', horizontal: 'left' };
                        if (colNumber === 1 || colNumber === 2) cell.alignment = { vertical: 'middle', horizontal: 'center' };
                        if (colNumber === 4) {
                            cell.numFmt = 'Rp #,##0';
                            cell.alignment = { vertical: 'middle', horizontal: 'right' };
                        }
                    });
                });
            
                // Total Pengeluaran
                const expTotalRow = sheetExpense.addRow({ no: '', date: '', title: 'TOTAL PENGELUARAN', amount: totalExpenseGlobal });
                expTotalRow.eachCell((cell, colNumber) => {
                    cell.font = { name: 'Arial', bold: true };
                    cell.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
                    if (colNumber === 4) {
                        cell.numFmt = 'Rp #,##0';
                        cell.alignment = { vertical: 'middle', horizontal: 'right' };
                    }
                });
            
                // KOTAK RINGKASAN AKHIR KAS (REKAP KAS BERSIH)
                sheetExpense.addRow([]);
                sheetExpense.addRow([]);
            
                const netKasBalance = totalKasPemasukanGlobal - totalExpenseGlobal;
            
                const summaryTitle = sheetExpense.addRow(['SUMMARY REKAPITULASI KAS KELAS']);
                summaryTitle.getCell(1).font = { name: 'Arial', size: 12, bold: true, color: { argb: '1E293B' } };
            
                const r1 = sheetExpense.addRow(['Total Kas Masuk (Pemasukan)', '', '', totalKasPemasukanGlobal]);
                r1.getCell(4).numFmt = 'Rp #,##0';
                r1.getCell(4).font = { bold: true, color: { argb: '047857' } };
            
                const r2 = sheetExpense.addRow(['Total Pengeluaran Kas', '', '', totalExpenseGlobal]);
                r2.getCell(4).numFmt = 'Rp #,##0';
                r2.getCell(4).font = { bold: true, color: { argb: 'B91C1C' } };
            
                const r3 = sheetExpense.addRow(['SISA SALDO KAS BERSIH', '', '', netKasBalance]);
                r3.getCell(1).font = { bold: true, size: 11 };
                r3.getCell(4).numFmt = 'Rp #,##0';
                r3.getCell(4).font = { bold: true, size: 11, color: { argb: '1D4ED8' } };
                r3.eachCell(cell => cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E0F2FE' } });

                // Auto-fit lebar kolom tanggal & total
                sheetMatrix.columns.forEach(column => {
                    let maxLen = 0;
                    column.eachCell({ includeEmpty: true }, cell => {
                        const val = cell.value ? cell.value.toString() : '';
                        // Beri perkiraan panjang jika berupa angka/rupiah
                        const len = typeof cell.value === 'number' ? 12 : val.length;
                        if (len > maxLen) maxLen = len;
                    });
                    column.width = Math.max(maxLen + 4, 12); // Minimal lebar 12
                });
            
                // Generate File & Send to Discord
                const buffer = await workbook.xlsx.writeBuffer();
                const attachment = new AttachmentBuilder(buffer, { name: `Laporan_Buku_Kas_Kelas_${Date.now()}.xlsx` });
            
                await interaction.editReply({
                    content: '📊 **Laporan Buku Kas Kelas Berhasil Di-export secara Rapi!**',
                    files: [attachment]
                });
            }

            // H. Ringkasan Keuangan (Financial Overview)
            if (interaction.customId === 'btn_overview') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const totalIncomeRes = await pool.query("SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE status = 'success'");
                const totalExpenseRes = await pool.query("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses");
                const totalStudentsRes = await pool.query("SELECT COUNT(*) AS total FROM users WHERE role = 'student'");

                const totalIncome = parseFloat(totalIncomeRes.rows[0].total);
                const totalExpense = parseFloat(totalExpenseRes.rows[0].total);
                const netBalance = totalIncome - totalExpense;

                const embed = new EmbedBuilder()
                    .setTitle('📈 Ringkasan Keuangan Kas Kelas')
                    .setColor('#0099ff')
                    .addFields(
                        { name: '👥 Total Siswa', value: `${totalStudentsRes.rows[0].total} Siswa`, inline: true },
                        { name: '💵 Total Pemasukan', value: `Rp ${totalIncome.toLocaleString('id-ID')}`, inline: true },
                        { name: '📝 Total Pengeluaran', value: `Rp ${totalExpense.toLocaleString('id-ID')}`, inline: true },
                        { name: '💰 Kas Bersih Kelas', value: `**Rp ${netBalance.toLocaleString('id-ID')}**`, inline: false }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            }

            // I. Tagih / Daftar Penunggak Kas
            if (interaction.customId === 'btn_tagih') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const unpaidQuery = `
                    SELECT u.name, COUNT(kd.id) AS total_tunggakan, SUM(kd.fee_amount) AS total_rp
                    FROM users u
                    CROSS JOIN kas_dates kd
                    LEFT JOIN kas_payments kp ON kd.id = kp.kas_date_id AND kp.user_id = u.id
                    WHERE u.role = 'student' AND kd.is_free_kas = FALSE AND kp.id IS NULL
                    GROUP BY u.id, u.name
                    HAVING COUNT(kd.id) > 0
                    ORDER BY total_tunggakan DESC
                    LIMIT 10
                `;
                const unpaidRes = await pool.query(unpaidQuery);

                if (unpaidRes.rows.length === 0) {
                    return interaction.editReply('🎉 **Luar biasa! Semua siswa sudah lunas kas.**');
                }

                let textList = '📢 **DAFTAR SISWA PENUNGGAK KAS TERBANYAK**\n\n';
                unpaidRes.rows.forEach((row, i) => {
                    textList += `${i + 1}. **${row.name}** — ${row.total_tunggakan} hari belum bayar (Rp ${parseFloat(row.total_rp).toLocaleString('id-ID')})\n`;
                });

                await interaction.editReply(textList);
            }
        }

        // ------------------------------------------------
        // 2. HANDLER SUBMIT MODAL OVERLAY
        // ------------------------------------------------
        if (interaction.isModalSubmit()) {

            // A. Submit Tambah Siswa
            if (interaction.customId === 'modal_add_student') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const name = interaction.fields.getTextInputValue('student_name');
                const email = interaction.fields.getTextInputValue('student_email');
                const rawPassword = interaction.fields.getTextInputValue('student_password');

                const checkEmail = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
                if (checkEmail.rows.length > 0) return interaction.editReply(`❌ Email \`${email}\` sudah terdaftar!`);

                const salt = await bcrypt.genSalt(10);
                const passwordHash = await bcrypt.hash(rawPassword, salt);

                const newUser = await pool.query(
                    `INSERT INTO users (name, email, password_hash, role, balance) VALUES ($1, $2, $3, 'student', 0) RETURNING id, name, email`,
                    [name, email, passwordHash]
                );

                await interaction.editReply(`✅ **Akun Siswa Dibuat!**\n🆔 ID: \`${newUser.rows[0].id}\` | 👤 Nama: ${name} | 📧 Email: ${email}`);
            }

            // B. Submit Hapus Siswa via Email
            if (interaction.customId === 'modal_delete_student') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const email = interaction.fields.getTextInputValue('student_email_delete');

                const userCheck = await pool.query('SELECT id, name FROM users WHERE email = $1', [email]);
                if (userCheck.rows.length === 0) return interaction.editReply(`❌ Siswa dengan email \`${email}\` tidak ditemukan!`);

                const targetUser = userCheck.rows[0];
                await pool.query('DELETE FROM users WHERE id = $1', [targetUser.id]);

                await interaction.editReply(`🗑️ **Siswa Berhasil Dihapus!**\n👤 Nama: ${targetUser.name} | 📧 Email: ${email}`);
            }

            // C. Submit Setor Kas Tunai (Admin) - CEGAH TIMEOUT DISCORD
            if (interaction.customId === 'modal_add_kas') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const identifier = interaction.fields.getTextInputValue('kas_identifier').trim();
                const amount = parseFloat(interaction.fields.getTextInputValue('kas_amount'));

                if (isNaN(amount) || amount <= 0) {
                    return interaction.editReply('❌ Nominal tidak valid! Harap masukkan angka saja.');
                }

                let userQuery = !isNaN(identifier) 
                    ? await pool.query('SELECT id, name, balance FROM users WHERE id = $1', [identifier])
                    : await pool.query('SELECT id, name, balance FROM users WHERE LOWER(name) LIKE LOWER($1)', [`%${identifier}%`]);

                if (userQuery.rows.length === 0) {
                    return interaction.editReply(`❌ Siswa dengan ID/Nama "${identifier}" tidak ditemukan!`);
                }

                const user = userQuery.rows[0];

                await pool.query(
                    `INSERT INTO transactions (user_id, amount, type, status) VALUES ($1, $2, 'discord', 'success')`, 
                    [user.id, amount]
                );
                
                const updateRes = await pool.query(
                    'UPDATE users SET balance = balance + $1 WHERE id = $2 RETURNING balance', 
                    [amount, user.id]
                );

                const newBalance = parseFloat(updateRes.rows[0].balance).toLocaleString('id-ID');

                await interaction.editReply(
                    `✅ **Setor Kas Berhasil!**\n` +
                    `👤 **Siswa:** ${user.name} (ID: ${user.id})\n` +
                    `💵 **Setoran:** Rp ${amount.toLocaleString('id-ID')}\n` +
                    `💰 **Saldo Deposit Sekarang:** Rp ${newBalance}`
                );
            }

            // D. Submit Pengeluaran
            if (interaction.customId === 'modal_add_expense') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const title = interaction.fields.getTextInputValue('exp_title');
                const amount = parseFloat(interaction.fields.getTextInputValue('exp_amount'));

                if (isNaN(amount) || amount <= 0) return interaction.editReply('❌ Nominal tidak valid!');

                await pool.query('INSERT INTO expenses (title, amount) VALUES ($1, $2)', [title, amount]);
                await interaction.editReply(`📝 **Pengeluaran Dicatat!**\n📌 Keterangan: ${title}\n💵 Nominal: Rp ${amount.toLocaleString('id-ID')}`);
            }

            // E. Submit Set Hari Libur Kas
            if (interaction.customId === 'modal_set_free_kas') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const freeDate = interaction.fields.getTextInputValue('free_date');
                const freeNote = interaction.fields.getTextInputValue('free_note') || 'Hari Libur / Free Kas';

                await pool.query(
                    `INSERT INTO kas_dates (date, is_free_kas, fee_amount, note) 
                     VALUES ($1, TRUE, 0, $2)
                     ON CONFLICT (date) DO UPDATE SET is_free_kas = TRUE, fee_amount = 0, note = $2`,
                    [freeDate, freeNote]
                );

                await interaction.editReply(`📅 **Tanggal Libur Kas Ditetapkan!**\n📆 Tanggal: \`${freeDate}\`\n📌 Catatan: ${freeNote}`);
            }
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply('❌ Terjadi kesalahan sistem saat memproses data.');
        }
    }
});

// ===================================================
// LOGIN DISCORD
// ===================================================
if (process.env.DISCORD_TOKEN) {
    client.login(process.env.DISCORD_TOKEN).catch(err => console.error('❌ Gagal Login Bot:', err.message));
} else {
    console.log('⚠️ DISCORD_TOKEN belum diisi di .env');
}
