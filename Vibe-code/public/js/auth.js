document.addEventListener('DOMContentLoaded', () => {
    // Cek jika user sudah login sebelumnya
    const userSession = localStorage.getItem('kas_user');
    if (userSession && window.location.pathname.endsWith('index.html')) {
        const user = JSON.parse(userSession);
        if (user.role === 'admin') {
            window.location.href = '/admin.html';
        } else {
            window.location.href = '/dashboard.html';
        }
        return;
    }

    const loginForm = document.getElementById('loginForm');
    const alertBox = document.getElementById('alertBox');
    const btnSubmit = document.getElementById('btnSubmit');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value.trim();

            btnSubmit.disabled = true;
            btnSubmit.innerHTML = `<span class="inline-block animate-spin mr-2">🔄</span> Memproses...`;
            hideAlert();

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Gagal login, periksa email & password.');
                }

                // Simpan data user di localStorage
                localStorage.setItem('kas_user', JSON.stringify(data.user));

                showAlert('success', 'Login berhasil! Mengalihkan...');

                setTimeout(() => {
                    if (data.user.role === 'admin') {
                        window.location.href = '/admin.html';
                    } else {
                        window.location.href = '/dashboard.html';
                    }
                }, 1000);

            } catch (err) {
                showAlert('error', err.message);
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = `<span>Masuk Ke Dashboard</span>`;
            }
        });
    }

    function showAlert(type, message) {
        if (!alertBox) return;
        alertBox.classList.remove('hidden', 'bg-red-500/10', 'text-red-400', 'border-red-500/20', 'bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20');
        alertBox.classList.add('border');

        if (type === 'error') {
            alertBox.classList.add('bg-red-500/10', 'text-red-400', 'border-red-500/20');
        } else {
            alertBox.classList.add('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/20');
        }

        alertBox.innerText = message;
    }

    function hideAlert() {
        if (alertBox) alertBox.classList.add('hidden');
    }
});

// Fungsi Logout Global
function logout() {
    localStorage.removeItem('kas_user');
    window.location.href = '/index.html';
}
