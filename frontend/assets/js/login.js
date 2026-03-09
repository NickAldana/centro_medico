document.addEventListener('DOMContentLoaded', () => {
    
    // Configuración
    const LOGIN_API_URL = '/api/auth/login';
    const DASHBOARD_URL = './pages/dashboard/dashboard.html';
    
    const form = document.getElementById('formLogin');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Referencias UI
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const alerta = document.getElementById('alertaError');
        const btn = form.querySelector('button');
        const originalBtnText = btn.innerHTML;

        // Limpiar estados previos
        alerta.classList.add('d-none');
        usernameInput.classList.remove('is-invalid'); // Asumiendo que uses bootstrap o similar para error
        
        // 1. Validar
        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        if (!username || !password) {
            mostrarError('Por favor complete todos los campos');
            return;
        }

        // 2. UI Loading
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Verificando...';

        try {
            // 3. Petición al Backend
            const response = await fetch(LOGIN_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok && (data.token || (data.tokens && data.tokens.accessToken))) {
                // 4. Login Exitoso
                const token = data.token || data.tokens.accessToken;
                const user = data.usuario || data.user;

                // Guardar Sesión (Múltiples keys para compatibilidad)
                localStorage.setItem('auth_token', token);
                localStorage.setItem('token', token);
                localStorage.setItem('user', JSON.stringify(user));
                localStorage.setItem('usuario', JSON.stringify(user));
                localStorage.setItem('user_data', JSON.stringify(user)); // Para compatibilidad con utils.js
                
                // ========================================================
                // 🔥 NUEVO: GUARDAR PERMISOS PARA EL CONTROL DE VISTAS
                // ========================================================
                if (user && user.permisos) {
                    localStorage.setItem('permisosUsuario', JSON.stringify(user.permisos));
                } else {
                    localStorage.setItem('permisosUsuario', '[]'); // Array vacío de seguridad
                }
                // ========================================================
                
                // Actualizar inmediatamente la UI si estamos en una página que la tenga
                if (typeof checkSession === 'function') {
                    setTimeout(() => checkSession(), 100);
                }

                // Feedback Visual Épico
                btn.style.backgroundColor = 'var(--success)';
                btn.innerHTML = '<i class="fas fa-check"></i> ¡Acceso Correcto!';
                
                setTimeout(() => {
                    window.location.href = DASHBOARD_URL;
                }, 800);

            } else {
                // 5. Error de Credenciales
                throw new Error(data.error || data.message || 'Usuario o contraseña incorrectos');
            }

        } catch (error) {
            console.error('Login Error:', error);
            mostrarError(error.message || 'No se pudo conectar con el servidor');
            btn.innerHTML = originalBtnText;
            btn.style.backgroundColor = ''; // Reset color
            btn.disabled = false;
        }

        function mostrarError(msg) {
            alerta.innerText = msg;
            alerta.classList.remove('d-none');
        }
    });
});