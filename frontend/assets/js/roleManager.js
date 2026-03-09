/**
 * GESTOR DE ROLES Y PERMISOS FRONTEND
 * 1. Limpia el DOM de elementos no autorizados
 * 2. Bloquea la navegación manual por URL (Route Guard)
 */
const RoleManager = (() => {
    
    // 🔥 MAPA DE RUTAS: Qué permisos se necesitan para cada URL (hash)
    const routePermissions = {
        '#dashboard': ['ver_dashboard'],
        '#citas': ['agendar_cita', 'ver_historia_clinica'],
        '#pacientes': ['ver_paciente', 'crear_paciente', 'ver_historia_clinica'],
        '#usuarios': ['gestion_usuarios', 'gestion_roles'],
        '#inventario': ['gestion_stock'],
        '#facturacion': ['facturar_servicio', 'cierre_caja'],
        '#reportes': ['reportes_gerencia'],
        '#configuracion': ['gestion_usuarios'],
        '#auditoria': ['gestion_usuarios']
    };

    let permisosUsuario = [];

    const init = () => {
        const currentUrl = window.location.pathname;

        // Evitar validación en la página de login
        if (currentUrl.includes('login.html')) return;

        // Obtener datos de la sesión
        const permisosRaw = localStorage.getItem('permisosUsuario');

        if (!permisosRaw) {
            cerrarSesion();
            return;
        }
        
        try {
            permisosUsuario = JSON.parse(permisosRaw);
            if (!Array.isArray(permisosUsuario)) throw new Error("Formato inválido");
        } catch (error) {
            cerrarSesion();
            return;
        }

        // 1. Limpiar el menú visual (Ocultar botones de la barra lateral)
        aplicarPermisosVisuales();

        // 2. Proteger la ruta actual al cargar la página (Ej: si entran directo a #usuarios)
        verificarRuta(window.location.hash || '#dashboard');

        // 3. Escuchar si el usuario cambia manualmente la URL arriba en el navegador
        window.addEventListener('hashchange', () => {
            verificarRuta(window.location.hash);
        });
    };

    const aplicarPermisosVisuales = () => {
        const elementosProtegidos = document.querySelectorAll('[data-permiso]');
        elementosProtegidos.forEach(elemento => {
            const permisoRequeridoRaw = elemento.getAttribute('data-permiso');
            if (!permisoRequeridoRaw) return;

            // Soporta múltiples permisos separados por comas
            const permisosRequeridos = permisoRequeridoRaw.split(',').map(p => p.trim());
            
            // Verifica si tiene AL MENOS UNO
            const tienePermiso = permisosRequeridos.some(p => permisosUsuario.includes(p));

            if (!tienePermiso) {
                elemento.remove(); // Elimina el botón de la barra lateral
            }
        });
    };

    // 🔥 FUNCIÓN MAESTRA: Validador de rutas (Bloquea acceso)
    const verificarRuta = (hash) => {
        // Si no hay hash, asumimos dashboard
        if (!hash || hash === '') hash = '#dashboard';
        
        // Verificamos si esa ruta está protegida en nuestro mapa
        if (routePermissions[hash]) {
            const permisosRequeridos = routePermissions[hash];
            
            // Verificamos si el usuario tiene al menos uno de los permisos requeridos
            const tienePermiso = permisosRequeridos.some(p => permisosUsuario.includes(p));
            
            if (!tienePermiso) {
                console.warn(`🔒 Intento de intrusión detectado en la ruta: ${hash}`);
                
                // 1. Alerta al usuario
                alert('🚫 ACCESO DENEGADO: No tienes permisos para ingresar a este módulo.');
                
                // 2. Lo pateamos de vuelta al dashboard (o ruta segura)
                window.location.hash = '#dashboard';
                
                // 3. Forzamos una recarga limpia
                setTimeout(() => {
                    window.location.reload();
                }, 50);
                
                return false; // Retornamos false para que dashboard.html sepa que debe abortar
            }
        }
        return true; // Retornamos true si todo está bien
    };

    const cerrarSesion = () => {
        localStorage.clear();
        sessionStorage.clear();
        if (window.location.pathname.includes('/pages/')) {
            window.location.href = '../../login.html';
        } else {
            window.location.href = './login.html';
        }
    };

    // Exponemos las funciones para que otros scripts (como dashboard.html) puedan usarlas
    return {
        init,
        logout: cerrarSesion,
        hasAccess: verificarRuta // <-- ¡ESTO ES CLAVE PARA BLOQUEAR EL AJAX!
    };
})();

// Iniciar protección cuando cargue la página
document.addEventListener('DOMContentLoaded', RoleManager.init);