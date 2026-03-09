/* =====================================================
   MÓDULO PACIENTES - FRONTEND BLINDADO (v4.0)
   Ubicación: frontend/assets/js/pacientes.js
   ===================================================== */

const API_PACIENTES = '/pacientes'; // utils.js asume que agrega /api automáticamente

let currentPagePacientes = 1;
let limitPacientes = 10;
let modalPacienteInstance = null;

// Helper para normalizar llaves de Oracle (por si acaso)
const normKeys = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));

// 1. INICIALIZACIÓN
function initPacientes() {
    console.log("🏥 Módulo Pacientes Iniciado");
    
    const modalEl = document.getElementById('modalPaciente');
    if (modalEl && typeof bootstrap !== 'undefined') {
        modalPacienteInstance = new bootstrap.Modal(modalEl, {
            backdrop: 'static',
            keyboard: false
        });
    }

    setupListeners();
    loadPacientesSeguro();
}

function setupListeners() {
    const btnFiltrar = document.querySelector('button[onclick="loadPacientes()"]');
    if(btnFiltrar) {
        btnFiltrar.onclick = (e) => { e.preventDefault(); loadPacientes(1); };
    }

    const inputSearch = document.getElementById('filtroNombre');
    if(inputSearch) {
        inputSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); loadPacientes(1); }
        });
    }

    const btnNuevo = document.querySelector('button[onclick="abrirModalNuevoPaciente()"]');
    if(btnNuevo) btnNuevo.onclick = abrirModalNuevoPaciente;

    const form = document.getElementById('formPaciente');
    if(form) {
        form.onsubmit = (e) => { e.preventDefault(); guardarPaciente(); };
    }

    const fechaNac = document.getElementById('fecha_nacimiento');
    if(fechaNac) fechaNac.addEventListener('change', calcularEdad);
}

function loadPacientesSeguro() {
    if (!window.apiFetch) { setTimeout(loadPacientesSeguro, 200); return; }
    loadPacientes(1);
}

// 2. CARGAR TABLA (CON TRUCO ANTI-CACHÉ)
async function loadPacientes(page = 1) {
    currentPagePacientes = page;
    const tbody = document.querySelector('#tablaPacientes tbody');
    if(!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" class="text-center p-4"><div class="spinner-border text-primary"></div><br>Cargando pacientes...</td></tr>';

    try {
        const search = document.getElementById('filtroNombre')?.value || '';
        const estado = document.getElementById('filtroEstado')?.value || '';

        // params exactos que espera nuestro nuevo controlador
        const params = new URLSearchParams({ 
            page, 
            limit: limitPacientes, 
            search, 
            estado,
            t: Date.now() // Anti-Caché agresivo
        });

        const res = await window.apiFetch(`${API_PACIENTES}?${params}`);
        
        if(!res.ok) throw new Error(`Error API: ${res.status}`);

        const data = await res.json();
        const lista = data.pacientes || data.rows || [];

        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted p-4"><i class="fas fa-users-slash fa-2x mb-2"></i><br>No se encontraron pacientes.</td></tr>';
            renderPaginacionPacientes({});
            return;
        }

        tbody.innerHTML = lista.map(item => {
            const p = normKeys(item); // Garantiza que todo esté en minúscula
            
            const id = p.id_paciente;
            const nombre = p.nombre_completo || `${p.nombres} ${p.apellido_paterno}`;
            const ci = p.ci || 'S/N';
            const contacto = p.celular || p.telefono || 'Sin contacto';
            
            // Backend ahora nos manda las fechas limpias 'YYYY-MM-DD'
            const fechaStr = p.fecha_nacimiento ? p.fecha_nacimiento.split('-').reverse().join('/') : '-';
            const ultimaCita = p.ultima_cita ? p.ultima_cita.split('-').reverse().join('/') : '-';
            
            const edad = p.edad !== null ? p.edad : calcularEdadDesdeFecha(p.fecha_nacimiento);
            const estadoPac = (p.estado || 'ACTIVO').toUpperCase();
            
            let badgeClass = 'bg-success';
            if (estadoPac === 'INACTIVO') badgeClass = 'bg-warning text-dark';
            if (estadoPac === 'ELIMINADO') badgeClass = 'bg-danger';

            return `
                <tr>
                    <td class="text-center"><strong>#${id}</strong></td>
                    <td>
                        <div class="fw-bold text-dark">${nombre}</div>
                        <small class="text-muted">${edad} años</small>
                    </td>
                    <td>${ci}</td>
                    <td><i class="fas fa-phone-alt text-muted me-1"></i> ${contacto}</td>
                    <td class="text-center">${fechaStr}</td>
                    <td class="text-center">${ultimaCita}</td>
                    <td class="text-center"><span class="badge ${badgeClass}">${estadoPac}</span></td>
                    <td class="text-center">
                        <div class="btn-group" role="group">
                            <button class="btn btn-sm btn-info text-white" onclick="editarPaciente(${id})" title="Ver/Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <a href="/api/pacientes/${id}/pdf" target="_blank" class="btn btn-sm btn-secondary" title="Imprimir PDF">
                                <i class="fas fa-file-pdf"></i>
                            </a>
                            <button class="btn btn-sm btn-danger" onclick="eliminarPaciente(${id})" title="Eliminar">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        renderPaginacionPacientes(data.pagination);

    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger p-4"><i class="fas fa-exclamation-triangle fa-2x mb-2"></i><br>${e.message}</td></tr>`;
    }
}

// 3. OPERACIONES
window.abrirModalNuevoPaciente = function() {
    const form = document.getElementById('formPaciente');
    if(form) form.reset();
    document.getElementById('id_paciente').value = '';
    document.getElementById('modalTitulo').innerText = 'Nuevo Paciente';
    
    // Ocultar estado al crear
    const divEst = document.getElementById('estadoContainer');
    if(divEst) divEst.style.display = 'none';

    if(modalPacienteInstance) modalPacienteInstance.show();
};

window.guardarPaciente = async function() {
    const form = document.getElementById('formPaciente');
    if (!form.checkValidity()) { form.reportValidity(); return; }

    const id = document.getElementById('id_paciente').value;
    const url = id ? `${API_PACIENTES}/${id}` : API_PACIENTES;
    const method = id ? 'PUT' : 'POST';

    const val = (id) => document.getElementById(id)?.value.trim() || null;

    const data = {
        nombres: val('nombres'),
        apellido_paterno: val('apellido_paterno'),
        apellido_materno: val('apellido_materno'),
        ci: val('ci'),
        fecha_nacimiento: val('fecha_nacimiento'),
        genero: val('genero'),
        celular: val('celular'),
        telefono: val('telefono'),
        email: val('email'),
        direccion: val('direccion'),
        estado_civil: val('estado_civil'),
        ocupacion: val('ocupacion'),
        nombre_contacto_emergencia: val('nombre_contacto_emergencia'),
        telefono_contacto_emergencia: val('telefono_contacto_emergencia'),
        tipo_sangre: val('tipo_sangre'),
        alergias: val('alergias'),
        antecedentes_medicos: val('antecedentes_medicos'),
        medicamentos_actuales: val('medicamentos_actuales'),
        seguro_medico: val('seguro_medico'),
        numero_seguro: val('numero_seguro'),
        estado: val('estado') || 'ACTIVO'
    };

    const btnSubmit = form.querySelector('button[type="submit"]');
    if(btnSubmit) { btnSubmit.disabled = true; btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }

    try {
        const res = await window.apiFetch(url, {
            method,
            body: JSON.stringify(data)
        });

        if(res.ok) {
            alert(`✅ Paciente ${id ? 'actualizado' : 'registrado'} exitosamente`);
            if(modalPacienteInstance) modalPacienteInstance.hide();
            
            setTimeout(() => {
                loadPacientes(currentPagePacientes);
            }, 300);
        } else {
            const err = await res.json();
            alert('❌ Error: ' + (err.error || 'No se pudo guardar'));
        }
    } catch(e) { 
        alert('❌ Error de conexión: ' + e.message); 
    } finally {
        if(btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = 'Guardar Paciente'; }
    }
};

window.editarPaciente = async function(id) {
    try {
        const res = await window.apiFetch(`${API_PACIENTES}/${id}?t=${Date.now()}`);
        if(res.ok) {
            const dataRaw = await res.json();
            const data = normKeys(dataRaw); // Normalizamos para estar seguros
            
            const setVal = (fid, val) => {
                const el = document.getElementById(fid);
                if(el) el.value = val || '';
            };

            setVal('id_paciente', data.id_paciente);
            setVal('nombres', data.nombres);
            setVal('apellido_paterno', data.apellido_paterno);
            setVal('apellido_materno', data.apellido_materno);
            setVal('ci', data.ci);
            
            let fecha = data.fecha_nacimiento;
            if(fecha && fecha.includes('T')) fecha = fecha.split('T')[0];
            setVal('fecha_nacimiento', fecha);
            
            calcularEdad(); 

            setVal('genero', data.genero);
            setVal('celular', data.celular);
            setVal('telefono', data.telefono);
            setVal('email', data.email);
            setVal('direccion', data.direccion);
            setVal('estado_civil', data.estado_civil);
            setVal('ocupacion', data.ocupacion);
            setVal('nombre_contacto_emergencia', data.nombre_contacto_emergencia);
            setVal('telefono_contacto_emergencia', data.telefono_contacto_emergencia);
            setVal('tipo_sangre', data.tipo_sangre);
            setVal('alergias', data.alergias);
            setVal('antecedentes_medicos', data.antecedentes_medicos);
            setVal('medicamentos_actuales', data.medicamentos_actuales);
            setVal('seguro_medico', data.seguro_medico);
            setVal('numero_seguro', data.numero_seguro);
            
            // Mostrar campo estado al editar
            const divEstado = document.getElementById('estadoContainer');
            if(divEstado) divEstado.style.display = 'block';
            setVal('estado', (data.estado || 'ACTIVO').toUpperCase());

            document.getElementById('modalTitulo').innerText = `Editar Paciente #${id}`;
            if(modalPacienteInstance) modalPacienteInstance.show();
        }
    } catch(e) { console.error(e); alert('No se pudo cargar la información del paciente.'); }
};

window.eliminarPaciente = async function(id) {
    if(confirm('¿Está seguro de eliminar este paciente del sistema? (Pasará a estado Inactivo)')) {
        try {
            const res = await window.apiFetch(`${API_PACIENTES}/${id}`, { method: 'DELETE' });
            if(res.ok) {
                loadPacientes(currentPagePacientes);
            } else {
                alert("❌ No se pudo eliminar el paciente.");
            }
        } catch(e) { alert(e.message); }
    }
};

// 4. NUEVAS FUNCIONALIDADES
window.exportarExcelPacientes = function() {
    // Redirigir directamente a la ruta de exportación del backend
    window.open(`/api/pacientes/exportar/excel`, '_blank');
};

// 5. UTILS
function calcularEdad() {
    const fechaInput = document.getElementById('fecha_nacimiento');
    const edadInput = document.getElementById('edad');
    if(!fechaInput || !edadInput) return;
    edadInput.value = calcularEdadDesdeFecha(fechaInput.value);
}

function calcularEdadDesdeFecha(fechaString) {
    if(!fechaString) return '';
    const hoy = new Date();
    const nac = new Date(fechaString);
    if(isNaN(nac.getTime())) return '';
    let edad = hoy.getFullYear() - nac.getFullYear();
    const m = hoy.getMonth() - nac.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) { edad--; }
    return edad >= 0 ? edad : 0;
}

function renderPaginacionPacientes(pag) {
    const div = document.getElementById('pacientesPaginacion');
    if(!div) return;
    if(!pag || !pag.total) { div.innerHTML = ''; return; }

    div.innerHTML = `
        <div class="d-flex justify-content-between align-items-center w-100 px-3 py-2 bg-light border-top">
            <small class="fw-bold text-muted">Total Registros: ${pag.total}</small>
            <div>
                <button class="btn btn-sm btn-outline-secondary" ${pag.page <= 1 ? 'disabled' : ''} onclick="loadPacientes(${pag.page - 1})"><i class="fas fa-chevron-left"></i> Anterior</button>
                <span class="mx-3 small fw-bold">Pág ${pag.page} de ${pag.totalPages}</span>
                <button class="btn btn-sm btn-outline-secondary" ${pag.page >= pag.totalPages ? 'disabled' : ''} onclick="loadPacientes(${pag.page + 1})">Siguiente <i class="fas fa-chevron-right"></i></button>
            </div>
        </div>
    `;
}

// Exponer inicialización global
window.initPacientes = initPacientes;