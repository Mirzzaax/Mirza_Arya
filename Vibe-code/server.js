const express = require('express');
const cors = require('cors');
require('dotenv').config();

const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Static Files (Frontend UI)
app.use(express.static('public'));

// Main Route API
app.use('/api', apiRoutes);

// Simple Health Check
app.get('/', (req, res) => {
    res.send('🚀 Server Web Kas Kelas Berjalan dengan Lancar!');
});

// ===================================================
// PANGGIL BOT DISCORD DI SINI
// ===================================================
require('./bot/index');

// Start Server
app.listen(PORT, () => {
    console.log(`🌐 Web API Kas Kelas running di http://localhost:${PORT}`);
});

// Start Server
app.listen(PORT, () => {
    console.log(`🌐 Web API Kas Kelas running di http://localhost:${PORT}`);
});

// Di server.js
const path = require('path');

app.get('/admin', (req, res) => {
    // Memberikan file admin.html hanya lewat endpoint /admin
    res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});
