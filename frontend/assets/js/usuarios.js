/* =====================================================
   MÓDULO USUARIOS - VERSIÓN FINAL
   ===================================================== */
// CORREGIR ESTO AL PRINCIPIO DEL ARCHIVO:
const API_USERS = 'usuarios'; // Solo el nombre, sin /api
let currentPageUsers = 1;
let currentLimitUsers = 10;
let modalUsuarioInstance = null;

// 1. INIT
function initUsuariosModule() {
    console.log('--- Módulo Usuarios: Init ---');
    
    // Inicializar Modal
    const modalEl = document.getElementById('modalUsuario');
    if (modalEl && typeof bootstrap !== 'undefined') {
        modalUsuarioInstance = new bootstrap.Modal(modalEl, {backdrop: 'static', keyboard: false});
    }

    loadRoles();
    loadRolesFilter(); // Para filtro por rol en listado
    loadUsuarios();

    const searchInput = document.getElementById('userSearch');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') { 
                e.preventDefault(); 
                currentPageUsers = 1; 
                loadUsuarios(); 
            }
        });
    }

    // Interceptar Submit
    const form = document.getElementById('formUsuario');
    if (form) {
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        newForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            await guardarUsuario();
        });
    }
}

// 2. CARGAR ROLES (formulario y filtro)
async function loadRoles() {
    try {
        const res = await window.apiFetch(`${API_USERS}/roles`);
        if (res.ok) {
            const data = await res.json();
            const select = document.getElementById('id_rol');
            let opts = '<option value="">Seleccionar rol...</option>';
            (data.roles || []).forEach(r => {
                opts += `<option value="${r.id_rol}">${r.nombre_rol}</option>`;
            });
            if(select) select.innerHTML = opts;
        }
    } catch (e) { console.error('Error roles', e); }
}

async function loadRolesFilter() {
    try {
        const res = await window.apiFetch(`${API_USERS}/roles`);
        if (res.ok) {
            const data = await res.json();
            const select = document.getElementById('userRol');
            if (!select) return;
            let opts = '<option value="">Todos los roles</option>';
            (data.roles || []).forEach(r => {
                opts += `<option value="${r.id_rol}">${r.nombre_rol}</option>`;
            });
            select.innerHTML = opts;
        }
    } catch (e) { console.error('Error roles filter', e); }
}

// 3. CARGAR USUARIOS
async function loadUsuarios(page = 1) {
    currentPageUsers = page;
    const tbody = document.querySelector('#tablaUsuarios tbody');
    if(tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center"><div class="spinner-border spinner-border-sm me-2"></div> Cargando...</td></tr>';

    try {
        const search = document.getElementById('userSearch')?.value || '';
        const estado = document.getElementById('userEstado')?.value || '';
        const rol = document.getElementById('userRol')?.value || '';
        const estadoFilter = estado === 'TODOS' ? '' : estado;

        const params = new URLSearchParams({ 
            page: currentPageUsers, 
            limit: currentLimitUsers, 
            search, 
            estado: estadoFilter,
            t: Date.now() 
        });
        if (rol) params.set('rol', rol);

        const res = await window.apiFetch(`${API_USERS}?${params}`);
        if (!res.ok) throw new Error(`Error ${res.status}`);

        const data = await res.json();
        const usuarios = data.usuarios || [];
        const pagination = data.pagination || {};

        if (usuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted">No se encontraron usuarios.</td></tr>';
            renderPaginacion({});
            return;
        }

        tbody.innerHTML = usuarios.map(u => {
            const estadoBadge = u.estado === 'ACTIVO' ? 'bg-success' : 'bg-secondary';
            return `
                <tr>
                    <td>${u.id_usuario}</td>
                    <td>${u.nombre_completo}</td>
                    <td><strong>${u.nombre_usuario}</strong></td>
                    <td>${u.ci || '-'}</td>
                    <td>${u.email || '-'}</td>
                    <td>${u.cargo || '-'}</td>
                    <td>${u.especialidad || '-'}</td>
                    <td><span class="badge bg-info text-dark">${u.rol}</span></td>
                    <td class="text-center"><span class="badge ${estadoBadge}">${u.estado}</span></td>
                    <td class="text-center">
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-warning" onclick="editarUsuario(${u.id_usuario})"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-danger" onclick="eliminarUsuario(${u.id_usuario})"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        renderPaginacion(pagination);

    } catch (e) {
        console.error(e);
        if(tbody) tbody.innerHTML = `<tr><td colspan="11" class="text-center text-danger">Error conectando al servidor</td></tr>`;
    }
}

function renderPaginacion(pagination) {
    const container = document.getElementById('usuariosPaginacion');
    if (!container || !pagination.total) { container.innerHTML = ''; return; }

    const { page, totalPages, total } = pagination;
    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center w-100 small px-3">
            <span>Total: ${total} | Pág ${page}/${totalPages}</span>
            <div>
                <button class="btn btn-sm btn-light border" ${page<=1?'disabled':''} onclick="loadUsuarios(${page-1})">Anterior</button>
                <button class="btn btn-sm btn-light border" ${page>=totalPages?'disabled':''} onclick="loadUsuarios(${page+1})">Siguiente</button>
            </div>
        </div>
    `;
}

// 4. CRUD
function openNewUser() {
    const form = document.getElementById('formUsuario');
    form.reset();
    document.getElementById('id_usuario').value = '';
    
    document.getElementById('password').required = true;
    document.getElementById('passwordHelp').style.display = 'none';
    document.getElementById('estadoContainer').style.display = 'none';
    document.getElementById('nombre_usuario').disabled = false;

    document.getElementById('modalUsuarioLabel').innerText = 'Nuevo Usuario';
    if(modalUsuarioInstance) modalUsuarioInstance.show();
}

async function editarUsuario(id) {
    try {
        const res = await window.apiFetch(`${API_USERS}/${id}?t=${Date.now()}`);
        if(res.ok) {
            const u = await res.json();
            
            const set = (k, v) => { if(document.getElementById(k)) document.getElementById(k).value = v || ''; };

            set('id_usuario', u.id_usuario);
            set('nombres', u.nombres);
            set('apellido_paterno', u.apellido_paterno);
            set('apellido_materno', u.apellido_materno);
            set('ci', u.ci);
            set('email', u.email);
            set('telefono', u.telefono);
            set('direccion', u.direccion);
            set('cargo', u.cargo);
            set('especialidad', u.especialidad);
            set('id_rol', u.id_rol);
            set('nombre_usuario', u.nombre_usuario);
            set('estado', u.estado);
            
            let f = u.fecha_nacimiento;
            if(f && f.includes('T')) f = f.split('T')[0];
            set('fecha_nacimiento', f);
            set('genero', u.genero);

            // Pass opcional
            document.getElementById('password').required = false;
            document.getElementById('password').value = '';
            document.getElementById('password_confirm').value = '';
            document.getElementById('passwordHelp').style.display = 'block';
            document.getElementById('estadoContainer').style.display = 'block';
            document.getElementById('nombre_usuario').disabled = true;
            
            document.getElementById('modalUsuarioLabel').innerText = 'Editar Usuario';
            if(modalUsuarioInstance) modalUsuarioInstance.show();
        }
    } catch(e) { alert('Error obteniendo datos'); }
}

async function guardarUsuario() {
    const pass = document.getElementById('password').value;
    const conf = document.getElementById('password_confirm').value;
    if(pass && pass !== conf) { alert('Las contraseñas no coinciden'); return; }

    const form = document.getElementById('formUsuario');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    if(!data.nombre_usuario) data.nombre_usuario = document.getElementById('nombre_usuario').value;

    const id = data.id_usuario;
    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_USERS}/${id}` : API_USERS;

    const btn = document.getElementById('btnGuardarUsuario');
    btn.disabled = true;

    try {
        const res = await window.apiFetch(url, {
            method: method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        
        const result = await res.json();

        if(res.ok) {
            if(modalUsuarioInstance) modalUsuarioInstance.hide();
            alert('Usuario guardado exitosamente');
            // ESPERA 500ms
            setTimeout(() => loadUsuarios(currentPageUsers), 500);
        } else {
            alert('Error: ' + (result.error || 'Desconocido'));
        }
    } catch(e) { alert('Error de conexión'); }
    finally { btn.disabled = false; }
}

async function eliminarUsuario(id) {
    if(!confirm('¿Eliminar usuario?')) return;
    try {
        const res = await window.apiFetch(`${API_USERS}/${id}`, { method: 'DELETE' });
        if(res.ok) setTimeout(() => loadUsuarios(currentPageUsers), 500);
        else alert('Error al eliminar');
    } catch(e) { console.error(e); }
}

function limpiarFiltrosUsuarios() {
    const search = document.getElementById('userSearch');
    const estado = document.getElementById('userEstado');
    const rol = document.getElementById('userRol');
    if (search) search.value = '';
    if (estado) estado.value = 'TODOS';
    if (rol) rol.value = '';
    loadUsuarios(1);
}

// EXPORTAR
window.initUsuariosModule = initUsuariosModule;
window.loadUsuarios = loadUsuarios;
window.openNewUser = openNewUser;
window.editarUsuario = editarUsuario;
window.guardarUsuario = guardarUsuario;
window.eliminarUsuario = eliminarUsuario;
window.limpiarFiltrosUsuarios = limpiarFiltrosUsuarios;