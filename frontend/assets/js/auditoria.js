/* =====================================================
   MÓDULO AUDITORÍA
   Manejo de logs, filtros y exportación
   ===================================================== */

const API_AUDIT = '/api/auditoria';
const API_USERS = '/api/usuarios';

// 1. FUNCIÓN DE INICIALIZACIÓN
function initAuditoria() {
    console.log("🛡️ Iniciando Módulo Auditoría...");
    
    // Cargar componentes
    loadResumenAudit();
    loadFiltrosAudit();
    loadTablaAuditoria(1); // Cargar página 1

    // Configurar listeners de botones
    const btnFiltrar = document.getElementById('btnFiltrarAudit');
    if(btnFiltrar) btnFiltrar.onclick = () => loadTablaAuditoria(1);

    const btnLimpiar = document.getElementById('btnLimpiarAudit');
    if(btnLimpiar) btnLimpiar.onclick = limpiarFiltrosAudit;
}

// 2. CARGAR TARJETAS DE RESUMEN
async function loadResumenAudit() {
    try {
        const res = await apiFetchAudit(`${API_AUDIT}/resumen`); 
        if(res.ok) {
            const data = await res.json();
            setText('totalEventos', new Intl.NumberFormat('es-BO').format(data.total_registros || 0));
            setText('iniciosSesion', new Intl.NumberFormat('es-BO').format(data.inicios_sesion || 0));
            setText('modificaciones', new Intl.NumberFormat('es-BO').format(data.modificaciones || 0));
            setText('usuariosAudit', data.usuarios_activos || 0);
        }
    } catch (e) {
        console.warn("No se pudo cargar resumen auditoría", e);
    }
}

function setText(id, val) {
    const el = document.getElementById(id);
    if(el) el.innerText = val;
}

// 3. CARGAR COMBOS DE FILTROS
async function loadFiltrosAudit() {
    try {
        // Cargar Usuarios
        const resU = await apiFetchAudit(`${API_USERS}?limit=1000`);
        if(resU.ok) {
            const data = await resU.json();
            const usuarios = data.usuarios || data.rows || data || [];
            const sel = document.getElementById('filtroUsuario');
            if(sel && usuarios.length > 0) {
                let html = '<option value="">Todos los usuarios</option>';
                usuarios.forEach(u => {
                    const id = u.id_usuario || u.ID_USUARIO;
                    const nombre = u.nombres || u.NOMBRES;
                    const ape = u.apellido_paterno || u.APELLIDO_PATERNO || '';
                    html += `<option value="${id}">${nombre} ${ape}</option>`;
                });
                sel.innerHTML = html;
            }
        }

        // Cargar Módulos dinámicamente si tienes la ruta (Opcional, sino dejamos el HTML)
        /*
        const resM = await apiFetchAudit(`${API_AUDIT}/modulos`);
        if(resM.ok) {
            const modulos = await resM.json();
            const selM = document.getElementById('filtroModulo');
            if(selM && modulos.length > 0) {
                let html = '<option value="">Todos los módulos</option>';
                modulos.forEach(m => html += `<option value="${m}">${m}</option>`);
                selM.innerHTML = html;
            }
        }
        */
    } catch(e) { console.error("Error cargando filtros", e); }
}

// 4. CARGAR TABLA PRINCIPAL
async function loadTablaAuditoria(page = 1) {
    const tbody = document.querySelector('#tablaAuditoria tbody');
    if(!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4"><div class="spinner-border text-primary"></div><br>Cargando bitácora...</td></tr>';

    try {
        // Obtener valores de filtros
        const params = new URLSearchParams({
            page: page,
            limit: 15,
            search: document.getElementById('filtroBusqueda')?.value || '',
            id_usuario: document.getElementById('filtroUsuario')?.value || '',
            modulo: document.getElementById('filtroModulo')?.value || '',
            fecha_inicio: document.getElementById('fechaInicio')?.value || '',
            fecha_fin: document.getElementById('fechaFin')?.value || ''
        });

        let url = `${API_AUDIT}?${params.toString()}`;
        
        // Fallback por si backend usa otra ruta
        const resCheck = await apiFetchAudit(url);
        if(resCheck.status === 404) {
            url = `/api/configuracion/logs?${params.toString()}`;
        }

        const res = await apiFetchAudit(url);
        if(!res.ok) throw new Error('Error recuperando logs');

        const data = await res.json();
        const logs = data.registros || data.rows || data;
        const totalPages = data.pagination?.totalPages || 1;

        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted p-4"><i class="fas fa-search fa-2x mb-2"></i><br>No se encontraron eventos registrados con esos filtros.</td></tr>';
            renderPaginacionAudit(0, 1);
            return;
        }

        // Renderizar Filas
        tbody.innerHTML = logs.map(log => {
            const fechaStr = log.FECHA_REGISTRO || log.fecha_registro;
            const fecha = fechaStr ? new Date(fechaStr).toLocaleString('es-BO') : '-';
            
            return `
                <tr>
                    <td><small class="text-muted">#${log.ID_BITACORA || log.id_bitacora}</small></td>
                    <td>${fecha}</td>
                    <td>
                        <span class="fw-bold">${log.usuario || log.USUARIO || 'Sistema'}</span>
                        <br><small class="text-muted">${log.nombre_usuario || log.NOMBRE_USUARIO || ''}</small>
                    </td>
                    <td><span class="badge ${getBadgeColor(log.ACCION || log.accion)}">${log.ACCION || log.accion}</span></td>
                    <td>${log.MODULO || log.modulo || 'GENERAL'}</td>
                    <td><small class="text-wrap">${log.DESCRIPCION || log.descripcion || ''}</small></td>
                    <td><small><code>${log.IP_ADDRESS || log.ip_address || '-'}</code></small></td>
                </tr>
            `;
        }).join('');

        renderPaginacionAudit(page, totalPages);

    } catch (error) {
        console.error(error);
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger p-4"><i class="fas fa-exclamation-circle fa-2x mb-2"></i><br>${error.message}</td></tr>`;
    }
}

// 5. UTILIDADES INTERNAS
function getBadgeColor(accion) {
    if(!accion) return 'bg-secondary';
    const acc = accion.toUpperCase();
    if(acc.includes('LOGIN') || acc.includes('INGRESO') || acc.includes('ABRIR')) return 'bg-success';
    if(acc.includes('ERROR') || acc.includes('FALLIDO') || acc.includes('CERRAR')) return 'bg-danger';
    if(acc.includes('CREAR') || acc.includes('INSERT') || acc.includes('GENERAR')) return 'bg-primary';
    if(acc.includes('EDITAR') || acc.includes('UPDATE')) return 'bg-warning text-dark';
    if(acc.includes('ELIMINAR') || acc.includes('DELETE') || acc.includes('ANULAR')) return 'bg-danger';
    return 'bg-secondary';
}

function limpiarFiltrosAudit() {
    ['filtroBusqueda', 'filtroUsuario', 'filtroModulo', 'fechaInicio', 'fechaFin'].forEach(id => {
        if(document.getElementById(id)) document.getElementById(id).value = '';
    });
    loadTablaAuditoria(1);
}

function renderPaginacionAudit(current, total) {
    const container = document.getElementById('auditoriaPaginacion');
    if(!container) return;

    if(total <= 1) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <nav aria-label="Navegación">
            <ul class="pagination justify-content-end mb-0">
                <li class="page-item ${current === 1 ? 'disabled' : ''}">
                    <button class="page-link" onclick="loadTablaAuditoria(${current - 1})">Anterior</button>
                </li>
                <li class="page-item disabled"><span class="page-link">Página ${current} de ${total}</span></li>
                <li class="page-item ${current === total ? 'disabled' : ''}">
                    <button class="page-link" onclick="loadTablaAuditoria(${current + 1})">Siguiente</button>
                </li>
            </ul>
        </nav>
    `;
}

// HU008: Copia de seguridad (Backup) bajo demanda
window.realizarBackupAuditoria = async function() {
    if (!confirm('¿Generar copia de seguridad (Backup) de la base de datos? Se descargará un archivo SQL.')) return;
    try {
        const res = await apiFetchAudit('/api/configuracion/backup');
        const data = await res.json();
        if (res.ok && data.file_url) {
            const a = document.createElement('a');
            a.href = data.file_url;
            a.download = '';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            alert('✅ Backup generado y descargado correctamente.');
        } else {
            alert('❌ Error: ' + (data.error || 'No se pudo generar el backup'));
        }
    } catch (e) {
        console.error(e);
        alert('Error de conexión al generar backup.');
    }
};

// 6. EXPORTACIÓN EXCEL VINCULADA AL BACKEND
function exportarExcelAudit() {
    // 1. Recolectar exactamente los mismos filtros que el usuario tiene activos
    const params = new URLSearchParams({
        search: document.getElementById('filtroBusqueda')?.value || '',
        id_usuario: document.getElementById('filtroUsuario')?.value || '',
        modulo: document.getElementById('filtroModulo')?.value || '',
        fecha_inicio: document.getElementById('fechaInicio')?.value || '',
        fecha_fin: document.getElementById('fechaFin')?.value || ''
    });

    // 2. Abrir la ruta del backend de exportación en una pestaña nueva
    // (El navegador detectará el header de Excel y lo descargará)
    window.open(`${API_AUDIT}/exportar/excel?${params.toString()}`, '_blank');
}

// Helper Fetch local
async function apiFetchAudit(endpoint) {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    let url = endpoint;
    if (!url.startsWith('/api') && !url.startsWith('http')) {
        url = `/api${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    }

    return await fetch(url, { headers });
}

// EXPOSICIÓN GLOBAL
window.initAuditoria = initAuditoria;
window.loadTablaAuditoria = loadTablaAuditoria;
window.limpiarFiltrosAudit = limpiarFiltrosAudit;
window.exportarExcelAudit = exportarExcelAudit;