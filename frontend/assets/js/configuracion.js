// assets/js/configuracion.js
const API_CONFIG = '/api/configuracion';

function initConfiguracionModule() {
    console.log('--- Configuración Init ---');
    loadConfigSistema();
    loadRolesCombo();
    loadLogs();
}

// 1. GENERAL
async function loadConfigSistema() {
    try {
        // Timestamp + cache: no-store para forzar datos frescos desde el servidor
        const res = await window.apiFetch(`${API_CONFIG}/sistema?t=${Date.now()}`, {
            cache: 'no-store',
            headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' }
        });
        const data = await res.json();
        
        console.log("📥 Datos recibidos:", data);

        // Helper para asignar valores sin error si el input no existe
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if(el) el.value = val || '';
        };

        setVal('cfgNombre', data.nombre_empresa);
        setVal('cfgNIT', data.nit);
        setVal('cfgDireccion', data.direccion);
        setVal('cfgTelefono', data.telefono);
        setVal('cfgEmail', data.email);
        setVal('cfgHorario', data.horario_atencion);
        setVal('cfgIva', data.iva_porcentaje || 13);
        setVal('cfgInactividad', data.tiempo_inactividad || 30);
        setVal('cfgLogoUrl', data.logo_url || '');
        
        // Cargar preview del logo
        if(data.logo_url) {
            mostrarLogoPreview(data.logo_url);
        } else {
            ocultarLogoPreview();
        }
        
        // Sincronizar memoria local inmediatamente
        localStorage.setItem('sys_timeout', data.tiempo_inactividad || 30);

    } catch(e) { console.error("Error cargando config:", e); }
}

async function saveConfig() {
    console.log("💾 Intentando guardar...");
    
    // Validar existencia de elementos
    const elInactividad = document.getElementById('cfgInactividad');
    if (!elInactividad) {
        alert("Error crítico: No se encuentra el campo de 'Cierre Sesión' en el HTML.");
        return;
    }

    const tiempo = parseInt(elInactividad.value);
    if(isNaN(tiempo) || tiempo < 1) {
        alert('⚠️ El tiempo de cierre de sesión debe ser un número mayor a 0');
        return;
    }
    
    const logoUrl = document.getElementById('cfgLogoUrl')?.value?.trim() || null;
    
    const data = {
        nombre_empresa: document.getElementById('cfgNombre')?.value?.trim() || '',
        nit: document.getElementById('cfgNIT')?.value?.trim() || '',
        direccion: document.getElementById('cfgDireccion')?.value?.trim() || '',
        telefono: document.getElementById('cfgTelefono')?.value?.trim() || '',
        email: document.getElementById('cfgEmail')?.value?.trim() || '',
        horario_atencion: document.getElementById('cfgHorario')?.value?.trim() || '',
        iva_porcentaje: parseFloat(document.getElementById('cfgIva')?.value) || 13,
        tiempo_inactividad: tiempo,
        logo_url: logoUrl
    };
    
    console.log("📤 Enviando datos:", data);

    const btn = document.getElementById('btnGuardarConfig');
    if(btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    }

    try {
        const res = await window.apiFetch(`${API_CONFIG}/sistema`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });

        const jsonRes = await res.json();

        if(res.ok) {
            console.log("✅ Guardado OK. Nuevo tiempo:", jsonRes.tiempo_inactividad ?? tiempo);
            
            // Actualizar el valor en localstorage para que el Dashboard lo tome
            const tiempoGuardado = jsonRes.tiempo_inactividad ?? tiempo;
            localStorage.setItem('sys_timeout', String(tiempoGuardado));
            
            // Mostrar mensaje de éxito
            const alertDiv = document.createElement('div');
            alertDiv.className = 'alert alert-success alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3';
            alertDiv.style.zIndex = '9999';
            alertDiv.innerHTML = `
                <i class="fas fa-check-circle me-2"></i> <strong>Configuración guardada correctamente.</strong>
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            `;
            document.body.appendChild(alertDiv);
            
            // Recargar datos desde el servidor para confirmar y actualizar el formulario (sin recargar toda la página)
            setTimeout(() => {
                loadConfigSistema();
                if (alertDiv.parentNode) alertDiv.remove();
            }, 1500);
        } else {
            alert('❌ Error al guardar: ' + (jsonRes.error || 'No se pudo guardar la configuración'));
        }
    } catch(e) { 
        console.error(e);
        alert('Error de conexión al servidor.'); 
    } finally {
        if(btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save me-1"></i> Guardar Todo';
        }
    }
}

// 2. SEGURIDAD (MATRIZ PERMISOS)
async function loadRolesCombo() {
    try {
        const res = await window.apiFetch(`${API_CONFIG}/roles`);
        const data = await res.json();
        const sel = document.getElementById('selectRolPermisos');
        if(sel && data.roles) {
            sel.innerHTML = data.roles.map(r => `<option value="${r.ID_ROL}">${r.NOMBRE_ROL}</option>`).join('');
            if(data.roles.length) cargarPermisosRol();
        }
    } catch(e){}
}

async function cargarPermisosRol() {
    const sel = document.getElementById('selectRolPermisos');
    if(!sel) return;
    const idRol = sel.value;
    const cont = document.getElementById('permisosContainer');
    cont.innerHTML = '<div class="col-12 text-center"><div class="spinner-border"></div></div>';

    try {
        const res = await window.apiFetch(`${API_CONFIG}/roles/${idRol}/permisos`);
        const data = await res.json();
        
        const grupos = {};
        (data.permisos || []).forEach(p => {
            const mod = p.MODULO || 'General';
            if(!grupos[mod]) grupos[mod] = [];
            grupos[mod].push(p);
        });

        let html = '';
        for(const [mod, perms] of Object.entries(grupos)) {
            html += `
                <div class="col-md-4 mb-4">
                    <div class="card h-100">
                        <div class="card-header bg-light py-2 font-weight-bold text-uppercase small">${mod}</div>
                        <div class="card-body p-2">
                            ${perms.map(p => `
                                <div class="form-check form-switch mb-2">
                                    <input class="form-check-input perm-check" type="checkbox" value="${p.ID_PERMISO}" id="perm_${p.ID_PERMISO}" ${p.TIENE_PERMISO ? 'checked' : ''}>
                                    <label class="form-check-label small" for="perm_${p.ID_PERMISO}">${p.NOMBRE_PERMISO}</label>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        }
        cont.innerHTML = html;
    } catch(e) { cont.innerHTML = 'Error cargando permisos'; }
}

async function guardarPermisos() {
    const sel = document.getElementById('selectRolPermisos');
    if(!sel) return;
    const idRol = sel.value;
    const checks = document.querySelectorAll('.perm-check:checked');
    const ids = Array.from(checks).map(c => parseInt(c.value));

    try {
        const res = await window.apiFetch(`${API_CONFIG}/roles/${idRol}/permisos`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ permisos: ids })
        });
        if(res.ok) alert('Permisos actualizados correctamente.');
    } catch(e) { alert('Error al guardar permisos.'); }
}

// 3. AUDITORÍA
async function loadLogs(page = 1) {
    const tbody = document.querySelector('#tablaLogs tbody');
    if(!tbody) return;
    
    const search = document.getElementById('searchLog')?.value || '';
    const date = document.getElementById('dateLog')?.value || '';
    
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Cargando...</td></tr>';

    try {
        const res = await window.apiFetch(`${API_CONFIG}/logs?page=${page}&limit=10&search=${search}&fecha=${date}`);
        const data = await res.json();
        const logs = data.logs || [];
        
        if(!logs.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No se encontraron registros.</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(l => `
            <tr>
                <td><small>${new Date(l.FECHA_REGISTRO).toLocaleString()}</small></td>
                <td>${l.NOMBRE_USUARIO || 'System'}</td>
                <td><span class="badge bg-secondary">${l.ACCION}</span></td>
                <td>${l.MODULO}</td>
                <td><small class="text-muted text-truncate d-block" style="max-width:300px">${l.DESCRIPCION || ''}</small></td>
            </tr>
        `).join('');
        
        const totalPages = data.pagination?.totalPages || 1;
        const total = data.pagination?.total || 0;

        document.getElementById('logsPaginacion').innerHTML = `
            <div class="d-flex justify-content-between small">
                <span>Total: ${total}</span>
                <div>
                    <button class="btn btn-sm btn-light" onclick="loadLogs(${page-1})" ${page<=1?'disabled':''}>Ant</button>
                    <span class="mx-2">${page}</span>
                    <button class="btn btn-sm btn-light" onclick="loadLogs(${page+1})" ${page>=totalPages?'disabled':''}>Sig</button>
                </div>
            </div>
        `;

    } catch(e) { console.error(e); }
}

// 4. BACKUP
async function realizarBackup() {
    if(!confirm('¿Generar copia SQL completa de la base de datos?')) return;
    try {
        const res = await window.apiFetch(`${API_CONFIG}/backup`);
        const data = await res.json();
        if(res.ok) {
            const a = document.createElement('a');
            a.href = data.file_url;
            a.download = '';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            alert('Backup descargado exitosamente.');
        } else {
            alert("Error del servidor: " + (data.error || 'Desconocido'));
        }
    } catch(e) { alert('Error al generar backup.'); }
}

// Funciones de Logo
function mostrarLogoPreview(url) {
    const preview = document.getElementById('logoPreview');
    const placeholder = document.getElementById('logoPlaceholder');
    if(preview && placeholder) {
        // Si es base64, usar directamente
        if(url.startsWith('data:image')) {
            preview.src = url;
        } 
        // Si es una ruta relativa que empieza con ../, convertir a ruta absoluta desde la raíz
        else if(url.startsWith('../')) {
            // Convertir ../../frontend/assets/images/LOGO1.png a /frontend/assets/images/LOGO1.png
            const cleanPath = url.replace(/^\.\.\//g, '');
            preview.src = '/' + cleanPath;
        }
        // Si ya es una ruta absoluta o URL completa, usar directamente
        else if(url.startsWith('/') || url.startsWith('http')) {
            preview.src = url;
        }
        // Si no, asumir que es relativa desde la raíz
        else {
            preview.src = '/' + url;
        }
        
        preview.style.display = 'block';
        preview.onerror = function() {
            console.warn('No se pudo cargar el logo desde:', url);
            this.style.display = 'none';
            placeholder.style.display = 'block';
        };
        placeholder.style.display = 'none';
    }
}

function ocultarLogoPreview() {
    const preview = document.getElementById('logoPreview');
    const placeholder = document.getElementById('logoPlaceholder');
    if(preview && placeholder) {
        preview.style.display = 'none';
        placeholder.style.display = 'block';
    }
}

function previewLogo(input) {
    if(input.files && input.files[0]) {
        const file = input.files[0];
        
        // Validar tamaño (2MB máximo)
        if(file.size > 2 * 1024 * 1024) {
            alert('⚠️ El archivo es demasiado grande. Máximo 2MB.');
            input.value = '';
            return;
        }
        
        // Validar tipo
        if(!file.type.match('image.*')) {
            alert('⚠️ Por favor seleccione una imagen válida (JPG, PNG, GIF).');
            input.value = '';
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            mostrarLogoPreview(e.target.result);
            // Guardar como base64 en el campo URL
            document.getElementById('cfgLogoUrl').value = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function actualizarPreviewLogo() {
    const url = document.getElementById('cfgLogoUrl')?.value?.trim();
    if(url) {
        mostrarLogoPreview(url);
    } else {
        ocultarLogoPreview();
    }
}

function limpiarLogo() {
    if(confirm('¿Desea quitar el logo?')) {
        document.getElementById('logoFileInput').value = '';
        document.getElementById('cfgLogoUrl').value = '';
        ocultarLogoPreview();
    }
}

// Exports
window.initConfiguracionModule = initConfiguracionModule;
window.saveConfig = saveConfig;
window.cargarPermisosRol = cargarPermisosRol;
window.guardarPermisos = guardarPermisos;
window.loadLogs = loadLogs;
window.realizarBackup = realizarBackup;
window.previewLogo = previewLogo;
window.actualizarPreviewLogo = actualizarPreviewLogo;
window.limpiarLogo = limpiarLogo;