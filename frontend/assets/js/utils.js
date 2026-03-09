/* ==========================================================================
   UTILS.JS - NÚCLEO BLINDADO V9.0 (REGEX URL FIX)
   ========================================================================== */

const API_BASE = '/api';

// --- 0. CIERRE DE SESIÓN POR INACTIVIDAD ---
let lastActivityTime = Date.now();
let inactivityCheckInterval = null;
let warningCountdownInterval = null;
let warningModalShown = false;
const SEGUNDOS_AVISO = 15;

function getTimeoutMinutes() {
    const stored = localStorage.getItem('sys_timeout');
    const minutes = parseInt(stored, 10);
    return (isNaN(minutes) || minutes < 1) ? 30 : minutes;
}

function resetInactivityTimer() {
    lastActivityTime = Date.now();
    if (warningModalShown) ocultarModalInactividad();
}

function ocultarModalInactividad() {
    warningModalShown = false;
    if (warningCountdownInterval) clearInterval(warningCountdownInterval);
    warningCountdownInterval = null;
    const modal = document.getElementById('modalInactividad');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
        document.body.classList.remove('modal-inactividad-open');
    }
}

function mostrarModalInactividad(segundosRestantes) {
    let modal = document.getElementById('modalInactividad');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalInactividad';
        modal.className = 'modal-inactividad-overlay';
        modal.innerHTML = `
            <div class="modal-inactividad-content">
                <div class="modal-inactividad-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h3>Advertencia de inactividad</h3>
                <p>Su sesión se cerrará por seguridad en</p>
                <p class="modal-inactividad-countdown" id="inactividadCountdown">${segundosRestantes}</p>
                <p class="modal-inactividad-sub">segundos</p>
                <p class="modal-inactividad-hint">¿Desea permanecer conectado?</p>
                <button type="button" class="btn-modal-permanecer" id="btnPermanecerConectado">
                    <i class="fas fa-check-circle me-2"></i>Permanecer conectado
                </button>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('btnPermanecerConectado').addEventListener('click', () => {
            resetInactivityTimer();
        });
    }
    document.getElementById('inactividadCountdown').textContent = segundosRestantes;
    modal.style.display = 'flex';
    modal.classList.add('show');
    document.body.classList.add('modal-inactividad-open');
    warningModalShown = true;
}

function cerrarSesionPorInactividad() {
    ocultarModalInactividad();
    if (inactivityCheckInterval) clearInterval(inactivityCheckInterval);
    inactivityCheckInterval = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('token');
    localStorage.removeItem('user_data');
    localStorage.removeItem('user');
    localStorage.removeItem('usuario');
    window.location.href = '/login.html';
}

function initInactivityMonitor() {
    if (!localStorage.getItem('auth_token')) return;
    
    if (inactivityCheckInterval) clearInterval(inactivityCheckInterval);
    lastActivityTime = Date.now();
    ocultarModalInactividad();
    
    const eventos = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    eventos.forEach(ev => {
        document.addEventListener(ev, resetInactivityTimer, { passive: true });
    });
    
    inactivityCheckInterval = setInterval(() => {
        const timeoutMin = getTimeoutMinutes();
        const limiteMs = timeoutMin * 60 * 1000;
        const avisoMs = SEGUNDOS_AVISO * 1000;
        const inactivoMs = Date.now() - lastActivityTime;
        
        if (inactivoMs >= limiteMs) {
            cerrarSesionPorInactividad();
        } else if (inactivoMs >= limiteMs - avisoMs && !warningModalShown) {
            let segundos = Math.ceil((limiteMs - inactivoMs) / 1000);
            segundos = Math.min(segundos, SEGUNDOS_AVISO);
            mostrarModalInactividad(segundos);
            
            if (warningCountdownInterval) clearInterval(warningCountdownInterval);
            warningCountdownInterval = setInterval(() => {
                const tMin = getTimeoutMinutes();
                const lim = tMin * 60 * 1000;
                const inact = Date.now() - lastActivityTime;
                let sec = Math.ceil((lim - inact) / 1000);
                
                if (sec <= 0) {
                    cerrarSesionPorInactividad();
                } else {
                    const el = document.getElementById('inactividadCountdown');
                    if (el) el.textContent = sec;
                }
            }, 1000);
        }
    }, 5000);
}

async function cargarTimeoutDesdeServidor() {
    if (!localStorage.getItem('auth_token')) return;
    try {
        const res = await fetch(`/api/configuracion/sistema?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            const tiempo = data.tiempo_inactividad || 30;
            localStorage.setItem('sys_timeout', String(tiempo));
        }
    } catch (e) { /* usar valor por defecto */ }
}

// --- 1. INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 1000);
    checkSession();

    if (localStorage.getItem('auth_token')) {
        cargarTimeoutDesdeServidor().then(() => initInactivityMonitor());
    }

    const btnLogout = document.getElementById('btnLogout');
    if(btnLogout) {
        btnLogout.addEventListener('click', (e) => {
            e.preventDefault();
            if(confirm('¿Está seguro de cerrar sesión?')) {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('user_data');
                window.location.href = '/index.html';
            }
        });
    }

    const module = window.location.hash.replace('#', '') || 'dashboard';
    loadModule(module);

    // Iniciar polling de notificaciones para el usuario actual
    startNotificationsPolling();
});

// --- 1.1 NOTIFICACIONES EN TIEMPO CASI REAL ---
let notificationsInterval = null;
let lastNotificationIds = new Set();
let notifAudio = null;

function getCurrentUserId() {
    let userJson = localStorage.getItem('user_data') || localStorage.getItem('user') || localStorage.getItem('usuario');
    if (!userJson) return null;
    try {
        const user = JSON.parse(userJson);
        return user.id_usuario || user.ID_USUARIO || user.id || null;
    } catch (e) {
        console.error('Error leyendo usuario actual para notificaciones:', e);
        return null;
    }
}

function initNotificationsUI() {
    const btn = document.getElementById('btnNotifications');
    const dropdown = document.getElementById('notifDropdown');
    if (!btn || !dropdown) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('show');
        dropdown.classList.toggle('d-none');
    });

    document.addEventListener('click', (e) => {
        if (!dropdown.classList.contains('show')) return;
        if (e.target.closest('.notifications-container')) return;
        dropdown.classList.remove('show');
        if (!dropdown.classList.contains('d-none')) {
            dropdown.classList.add('d-none');
        }
    });
}

function initNotificationSound() {
    try {
        if (!notifAudio) {
            // El archivo debe existir en /assets/sounds/notification.mp3
            notifAudio = new Audio('/assets/sounds/notification.mp3');
            notifAudio.volume = 0.35;
        }
    } catch (e) {
        notifAudio = null;
    }
}

function playNotificationSound() {
    if (!notifAudio) return;
    try {
        notifAudio.currentTime = 0;
        notifAudio.play().catch(() => {});
    } catch (_) {}
}

function getToastContainer() {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

function showNotificationToast(title, message) {
    const container = getToastContainer();
    const toast = document.createElement('div');
    toast.className = 'toast-item';
    toast.innerHTML = `
        <div class="toast-icon"><i class="fas fa-bell"></i></div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" type="button">&times;</button>
    `;

    container.appendChild(toast);

    const close = () => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 200);
    };

    toast.querySelector('.toast-close').addEventListener('click', close);
    setTimeout(close, 6000);
}

async function renderNotificaciones(lista) {
    const badge = document.getElementById('notifBadge');
    const list = document.getElementById('notifList');
    if (!badge || !list) return;

    const count = Array.isArray(lista) ? lista.length : 0;

    if (!count) {
        badge.classList.add('d-none');
        list.innerHTML = '<div class="notif-empty">Sin notificaciones nuevas</div>';
        return;
    }

    badge.textContent = count > 9 ? '9+' : String(count);
    badge.classList.remove('d-none');

    list.innerHTML = lista.map(n => {
        const id = n.id_notificacion || n.ID_NOTIFICACION;
        const idRef = n.id_referencia || n.ID_REFERENCIA;
        const titulo = n.titulo || n.TITULO || 'Notificación';
        const mensaje = n.mensaje || n.MENSAJE || '';
        const fecha = n.fecha_creacion || n.FECHA_CREACION || null;
        let fechaTexto = '';
        try {
            if (fecha) {
                const d = new Date(fecha);
                if (!isNaN(d.getTime())) {
                    fechaTexto = d.toLocaleString('es-BO', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                    });
                }
            }
        } catch (_) {}

        return `
            <div class="notif-item" data-id="${id || ''}" data-ref="${idRef || ''}">
                <div class="notif-title">${titulo}</div>
                <div class="notif-message">${mensaje}</div>
                <div class="notif-time">${fechaTexto}</div>
            </div>
        `;
    }).join('');

    // Detectar nuevas notificaciones para toasts/sonido
    const currentIds = new Set();
    lista.forEach(n => {
        const id = n.id_notificacion || n.ID_NOTIFICACION;
        if (id != null) currentIds.add(String(id));
    });

    const firstRun = lastNotificationIds.size === 0;
    if (!firstRun && currentIds.size > 0) {
        lista.forEach(n => {
            const id = n.id_notificacion || n.ID_NOTIFICACION;
            const idStr = id != null ? String(id) : null;
            if (!idStr || lastNotificationIds.has(idStr)) return;

            const titulo = n.titulo || n.TITULO || 'Notificación';
            const mensaje = n.mensaje || n.MENSAJE || '';
            showNotificationToast(titulo, mensaje);
            playNotificationSound();
        });
    }

    lastNotificationIds = currentIds;

    // Manejar clic para marcar como leída
    list.querySelectorAll('.notif-item').forEach(item => {
        item.addEventListener('click', async () => {
            const id = item.getAttribute('data-id');
            const ref = item.getAttribute('data-ref');
            if (id) {
                try {
                    await window.apiFetch(`notificaciones/leida/${id}`, { method: 'PUT' });
                } catch (e) {
                    console.error('Error marcando notificación como leída:', e);
                }
            }

            item.remove();
            const restantes = list.querySelectorAll('.notif-item').length;
            if (!restantes) {
                badge.classList.add('d-none');
                list.innerHTML = '<div class="notif-empty">Sin notificaciones nuevas</div>';
            } else {
                badge.textContent = restantes > 9 ? '9+' : String(restantes);
            }

            // Si la notificación tiene referencia a cita, navegar al módulo Citas y abrirla
            if (ref) {
                window.pendingCitaId = parseInt(ref);
                if (typeof window.navigate === 'function') {
                    window.navigate('citas');
                } else {
                    window.location.hash = 'citas';
                }
            }
        });
    });
}

function startNotificationsPolling() {
    const userId = getCurrentUserId();
    if (!userId) return;

    initNotificationsUI();
    initNotificationSound();

    if (notificationsInterval) {
        clearInterval(notificationsInterval);
        notificationsInterval = null;
    }

    const cargar = async () => {
        try {
            const res = await window.apiFetch(`notificaciones/${userId}?t=${Date.now()}`);
            if (!res) return;
            const data = await res.json();
            await renderNotificaciones(data || []);
        } catch (e) {
            console.error('Error obteniendo notificaciones:', e);
        }
    };

    // Primera carga inmediata
    cargar();
    // Luego cada 10 segundos
    notificationsInterval = setInterval(cargar, 10000);
}

// --- 2. API FETCH GLOBAL (LÓGICA CON REGEX) ---
window.apiFetch = async function(endpoint, options = {}) {
    const token = localStorage.getItem('auth_token');
    let url = endpoint;

    // LIMPIEZA MAESTRA DE URL
    if (!url.startsWith('http')) {
        // 1. Quitar cualquier barra inicial
        url = url.replace(/^\/+/, '');
        
        // 2. Si empieza con 'api/', quitarlo también para normalizar
        if (url.startsWith('api/')) {
            url = url.substring(4);
        }
        
        // 3. Quitar barras otra vez por si quedó 'api//usuarios'
        url = url.replace(/^\/+/, '');

        // 4. Construir URL final limpia
        url = `/api/${url}`;
    }

    // console.log(`📡 URL Final: ${url}`); // Descomenta para verificar

    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers
    };

    try {
        const res = await fetch(url, { ...options, headers });
        
        // Validar que no sea HTML (error 404/500 disfrazado)
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("text/html")) {
            console.error(`❌ Error Crítico: Respuesta HTML en ruta JSON: ${url}`);
            throw new Error(`Ruta API no encontrada: ${url}`);
        }

        if (res.status === 401) {
            localStorage.clear();
            window.location.href = '/index.html';
            return;
        }
        return res;
    } catch (error) {
        console.error("API Error:", error);
        throw error;
    }
};

// --- 3. NAVEGACIÓN ---
window.navigate = function(moduleName, element) {
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');
    else {
        const link = document.querySelector(`a[href="#${moduleName}"]`);
        if(link) link.classList.add('active');
    }
    window.location.hash = moduleName;
    loadModule(moduleName);
};

async function loadModule(moduleName) {
    const contentArea = document.getElementById('contentArea');
    const pageTitle = document.getElementById('pageTitle');
    
    const titles = {
        'dashboard': 'Resumen General',
        'citas': 'Gestión de Citas',
        'pacientes': 'Pacientes',
        'usuarios': 'Usuarios',
        'inventario': 'Inventario',
        'facturacion': 'Facturación',
        'auditoria': 'Auditoría',
        'reportes': 'Reportes',
        'configuracion': 'Configuración'
    };

    if(pageTitle) pageTitle.textContent = titles[moduleName] || 'Sistema Médico';

    try {
        contentArea.innerHTML = `
            <div class="d-flex justify-content-center align-items-center" style="height: 400px;">
                <div class="spinner-border text-primary" role="status"></div>
                <span class="ms-2">Cargando ${moduleName}...</span>
            </div>`;
        
        // Carga HTML
        const response = await fetch(`/pages/${moduleName}/${moduleName}.html?v=${Date.now()}`);
        if(!response.ok) throw new Error(`Módulo no encontrado: ${moduleName}`);
        const html = await response.text();
        
        // Para el dashboard, extraer solo el contenido dentro de #dashboardView para evitar duplicar el sidebar
        if (moduleName === 'dashboard') {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            // Buscar el contenido del dashboard dentro de #dashboardView
            let dashboardContent = tempDiv.querySelector('#dashboardView');
            
            // Si no se encuentra, buscar dentro de content-wrapper
            if (!dashboardContent) {
                const contentWrapper = tempDiv.querySelector('.content-wrapper');
                if (contentWrapper) {
                    dashboardContent = contentWrapper.querySelector('#dashboardView');
                }
            }
            
            // Si aún no se encuentra, buscar dentro de main
            if (!dashboardContent) {
                const mainContent = tempDiv.querySelector('main');
                if (mainContent) {
                    dashboardContent = mainContent.querySelector('#dashboardView');
                }
            }
            
            if (dashboardContent) {
                // Extraer solo el contenido del dashboard sin el sidebar
                contentArea.innerHTML = dashboardContent.outerHTML;
            } else {
                // Fallback: usar regex para eliminar sidebar y mantener solo el contenido
                const cleanHtml = html
                    .replace(/<aside[^>]*class="sidebar"[^>]*>[\s\S]*?<\/aside>/gi, '')
                    .replace(/<main[^>]*class="main-content"[^>]*>/gi, '<div>')
                    .replace(/<\/main>/gi, '</div>')
                    .replace(/<div[^>]*class="app-container"[^>]*>/gi, '')
                    .replace(/<\/div>\s*<\/div>\s*<\/body>/gi, '</body>')
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ''); // Eliminar scripts duplicados
                
                const tempDiv2 = document.createElement('div');
                tempDiv2.innerHTML = cleanHtml;
                const dashboardView = tempDiv2.querySelector('#dashboardView');
                if (dashboardView) {
                    contentArea.innerHTML = dashboardView.outerHTML;
                } else {
                    // Último recurso: insertar solo el contenido dentro de content-wrapper
                    const wrapperMatch = html.match(/<div[^>]*class="content-wrapper"[^>]*>([\s\S]*?)<\/div>\s*<\/main>/i);
                    if (wrapperMatch && wrapperMatch[1]) {
                        contentArea.innerHTML = wrapperMatch[1];
                    } else {
                        contentArea.innerHTML = html;
                    }
                }
            }
        } else {
            contentArea.innerHTML = html;
        }

        // Actualizar información del usuario después de cargar el HTML
        setTimeout(() => checkSession(), 100);

        // Carga JS
        const scriptPath = `/assets/js/${moduleName}.js?v=${Date.now()}`;
        loadScript(scriptPath, () => {
            const possibleNames = [
                `init${capitalize(moduleName)}`,
                `init${capitalize(moduleName)}Module`,
                `load${capitalize(moduleName)}`,
                `initDashboard`
            ];

            let started = false;
            for (const name of possibleNames) {
                if (typeof window[name] === 'function') {
                    window[name]();
                    started = true;
                    break;
                }
            }
            if (!started) {
                setTimeout(() => {
                    for (const name of possibleNames) {
                        if (typeof window[name] === 'function') {
                            window[name]();
                            return;
                        }
                    }
                }, 200);
            }
            
            // Asegurar que la información del usuario se actualice después de inicializar el módulo
            setTimeout(() => checkSession(), 300);
        });

    } catch (e) {
        console.error(e);
        contentArea.innerHTML = `<div class="alert alert-danger m-4">Error cargando <b>${moduleName}</b>.<br>${e.message}</div>`;
    }
}

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function loadScript(src, callback) {
    const baseName = src.split('?')[0].split('/').pop();
    const oldScripts = document.querySelectorAll(`script[src*="${baseName}"]`);
    oldScripts.forEach(s => s.remove());

    const script = document.createElement('script');
    script.src = src;
    script.onload = callback;
    script.onerror = () => console.error(`Error cargando script: ${src}`);
    document.body.appendChild(script);
}

// --- 4. EXTRAS ---
function updateClock() {
    const display = document.getElementById('currentDateTimeDisplay');
    if (display) display.innerHTML = new Date().toLocaleString('es-BO', { dateStyle: 'full', timeStyle: 'medium' });
}

function checkSession() {
    // Intentar obtener datos de usuario de múltiples fuentes para compatibilidad
    let userJson = localStorage.getItem('user_data') || localStorage.getItem('user') || localStorage.getItem('usuario');
    
    if (userJson) {
        try {
            const user = JSON.parse(userJson);
            
            // Buscar todos los elementos (puede haber múltiples si se carga el dashboard dentro de otro)
            const elNames = document.querySelectorAll('#userName');
            const elRoles = document.querySelectorAll('#userRole');
            const elAvatars = document.querySelectorAll('#userAvatar');
            
            // Construir nombre completo: nombres + apellidos
            const nombres = (user.nombres || user.nombre || '').trim();
            const apellidos = (user.apellidos || user.apellido_paterno || '').trim();
            const nombreCompleto = nombres + (apellidos ? ' ' + apellidos : '') || 'Usuario';
            
            // Obtener rol
            const rol = user.rol || user.nombre_rol || user.cargo || 'Personal';
            
            // Actualizar todos los elementos de nombre
            elNames.forEach(el => {
                if (el) el.textContent = nombreCompleto;
            });
            
            // Actualizar todos los elementos de rol
            elRoles.forEach(el => {
                if (el) el.textContent = rol;
            });
            
            // Calcular iniciales del nombre completo
            let iniciales = '';
            if (nombres) {
                iniciales += nombres.charAt(0).toUpperCase();
            }
            if (apellidos) {
                // Tomar primera letra del primer apellido
                const primerApellido = apellidos.split(' ')[0];
                if (primerApellido) {
                    iniciales += primerApellido.charAt(0).toUpperCase();
                }
            }
            
            // Si no hay apellidos en el formato esperado, intentar con apellido_paterno
            if (!iniciales || iniciales.length < 2) {
                const apellidoPaterno = (user.apellido_paterno || '').trim();
                if (apellidoPaterno && nombres) {
                    iniciales = nombres.charAt(0).toUpperCase() + apellidoPaterno.charAt(0).toUpperCase();
                }
            }
            
            if (!iniciales) {
                iniciales = (user.nombre_usuario || user.username || 'U').charAt(0).toUpperCase();
            }
            
            // Actualizar todos los avatares
            elAvatars.forEach(el => {
                if (el) el.textContent = iniciales;
            });
            
            // Cargar logo de la empresa
            const sidebarHeaders = document.querySelectorAll('.sidebar-header');
            sidebarHeaders.forEach(header => {
                const logoImg = header.querySelector('img');
                if (logoImg) {
                    // Forzar recarga del logo
                    const originalSrc = logoImg.src;
                    if (!logoImg.complete || logoImg.naturalWidth === 0) {
                        logoImg.onload = function() {
                            this.style.display = 'block';
                        };
                        logoImg.onerror = function() {
                            this.style.display = 'none';
                            const span = this.nextElementSibling;
                            if (span) {
                                span.style.marginLeft = '0';
                            }
                        };
                        // Intentar recargar con timestamp para evitar caché
                        if (originalSrc && !originalSrc.includes('?t=')) {
                            logoImg.src = originalSrc + '?t=' + Date.now();
                        }
                    }
                }
            });
        } catch (e) {
            console.error("Error en checkSession:", e);
        }
    } else {
        // Si no hay datos de usuario, intentar obtenerlos del servidor
        const token = localStorage.getItem('auth_token');
        if (token) {
            // Intentar obtener datos del usuario desde el servidor
            fetch('/api/auth/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }).then(res => {
                if (res.ok) {
                    return res.json();
                }
            }).then(userData => {
                if (userData && userData.usuario) {
                    localStorage.setItem('user_data', JSON.stringify(userData.usuario));
                    checkSession(); // Recursivo para actualizar UI
                }
            }).catch(err => {
                console.error("Error obteniendo datos del usuario:", err);
            });
        }
        
        // Mostrar valores por defecto
        const elNames = document.querySelectorAll('#userName');
        const elRoles = document.querySelectorAll('#userRole');
        elNames.forEach(el => {
            if (el && el.textContent === 'Cargando...') {
                el.textContent = 'Usuario';
            }
        });
        elRoles.forEach(el => {
            if (el && el.textContent === '...') {
                el.textContent = 'Personal';
            }
        });
    }
}