/* =====================================================
   MÓDULO CITAS - INTERACTIVIDAD CORREGIDA
   Ubicación: frontend/assets/js/citas.js
   ===================================================== */

let modalCitaInstance = null;

// 1. INICIALIZACIÓN (Se ejecuta al cargar el módulo)
function initCitas() {
    console.log("📅 Módulo Citas: Listo e Interactivo");
    
    // Configurar Modal
    const modalEl = document.getElementById('modalCita');
    if (modalEl) {
        modalCitaInstance = new bootstrap.Modal(modalEl, {
            backdrop: 'static', 
            keyboard: false
        });
    }

    // Cargar Datos (incluye médicos para filtro)
    loadCitasFormData();
    loadMedicosParaFiltro();
    loadTablaCitas();

    // Si venimos desde una notificación con una cita específica, abrirla
    if (window.pendingCitaId) {
        const id = window.pendingCitaId;
        window.pendingCitaId = null;
        setTimeout(() => {
            if (typeof window.editarCita === 'function') {
                window.editarCita(id);
            }
        }, 300);
    }

    // Conectar formulario con saveCita
    const formCita = document.getElementById('formCita');
    if (formCita) {
        formCita.addEventListener('submit', function(e) {
            e.preventDefault();
            window.saveCita(e);
        });
    }

    // Botón de validación de horario
    const btnValidar = document.getElementById('btnValidarHorario');
    if (btnValidar) {
        btnValidar.addEventListener('click', window.validarDisponibilidad);
    }
};

// 2. ABRIR MODAL (NUEVA CITA) - ¡ESTA FUNCIÓN FALTABA!
window.openNewCita = function() {
    const form = document.getElementById('formCita');
    if(form) form.reset();
    
    document.getElementById('id_cita').value = ''; // Limpiar ID
    document.getElementById('modalCitaLabel').innerText = 'Nueva Cita';
    
    // Fecha de hoy por defecto
    document.getElementById('fecha_cita').value = new Date().toISOString().split('T')[0];
    
    if(modalCitaInstance) modalCitaInstance.show();
};

// 3. CARGAR COMBOS
async function loadCitasFormData() {
    try {
        const res = await window.apiFetch('/citas/form-data');
        if(res.ok) {
            const data = await res.json();
            fillSelect('id_paciente', data.pacientes, 'paciente');
            fillSelect('id_medico', data.medicos, 'medico');
        }
    } catch(e) { console.error("Error combos:", e); }
}

// HU003: Cargar combo de profesionales para filtro
async function loadMedicosParaFiltro() {
    try {
        const res = await window.apiFetch('/citas/form-data');
        if(res.ok) {
            const data = await res.json();
            const sel = document.getElementById('citasMedico');
            if(!sel) return;
            sel.innerHTML = '<option value="">Todos los profesionales</option>';
            (data.medicos || []).forEach(m => {
                const val = m.id_usuario || m.ID_USUARIO;
                const nombre = m.nombre_completo || m.NOMBRE_COMPLETO;
                const opt = document.createElement('option');
                opt.value = val;
                opt.textContent = nombre;
                sel.appendChild(opt);
            });

            // Preseleccionar al usuario logueado (médico ve solo sus citas por defecto)
            try {
                const raw = localStorage.getItem('user_data') || localStorage.getItem('user') || localStorage.getItem('usuario');
                if (raw) {
                    const user = JSON.parse(raw);
                    const idUser = user.id_usuario || user.ID_USUARIO || user.id;
                    if (idUser && sel.querySelector(`option[value="${idUser}"]`)) {
                        sel.value = String(idUser);
                    }
                }
            } catch (e) {
                console.warn('No se pudo detectar el usuario actual para filtro de citas:', e);
            }

            // Recargar tabla con el filtro aplicado
            loadTablaCitas();
        }
    } catch(e) { console.error("Error médicos filtro:", e); }
}

function fillSelect(id, items, type) {
    const el = document.getElementById(id);
    if(!el) return;
    
    el.innerHTML = '<option value="">Seleccione...</option>';
    
    if (!items || items.length === 0) {
        // Si sigue llegando vacío (imposible con el cambio anterior), avisamos
        const opt = document.createElement('option');
        opt.text = "--- Sin Datos ---";
        el.add(opt);
        return;
    }

    items.forEach(i => {
        // Obtenemos los valores (Soporta mayúsculas y minúsculas por seguridad)
        
        if(type === 'medico') {
            const val = i.id_usuario || i.ID_USUARIO; 
            const nombre = i.nombre_completo || i.NOMBRE_COMPLETO;
            const rol = i.nombre_rol || i.NOMBRE_ROL || ''; 
            const esp = i.especialidad || i.ESPECIALIDAD || '';
            
            // Texto: "Juan Perez - MEDICO (Cardiologia)"
            let texto = `${nombre}`;
            if (rol) texto += ` - ${rol}`;
            if (esp) texto += ` (${esp})`;

            const option = document.createElement('option');
            option.value = val;
            option.text = texto;
            option.setAttribute('data-esp', esp); 
            el.add(option);
        } else {
            // Pacientes
            const val = i.id_paciente || i.ID_PACIENTE;
            const nombre = i.nombre_completo || i.NOMBRE_COMPLETO;
            
            const option = document.createElement('option');
            option.value = val;
            option.text = nombre;
            el.add(option);
        }
    });
}

// 4. CARGAR TABLA (BUSCAR)
window.loadTablaCitas = async function() {
    const tbody = document.querySelector('#tablaCitas tbody');
    if(!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" class="text-center"><div class="spinner-border spinner-border-sm"></div> Buscando...</td></tr>';

    try {
        // Obtener valores de los filtros
        const search = document.getElementById('citasSearch')?.value || '';
        const fecha = document.getElementById('citasFecha')?.value || '';
        const estado = document.getElementById('citasEstado')?.value || '';
        const id_medico = document.getElementById('citasMedico')?.value || '';

        const params = new URLSearchParams({ search, fecha, estado, limit: 50 });
        if (id_medico) params.set('id_medico', id_medico);
        const res = await window.apiFetch(`/citas?${params}`);
        const data = await res.json();
        
        const lista = data.citas || [];

        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No se encontraron citas con esos criterios.</td></tr>';
            return;
        }

        tbody.innerHTML = lista.map(c => {
            const id = c.id || c.ID_CITA || '';
            const fecha = c.fecha || c.FECHA_CITA || '';
            const hora = c.hora || c.HORA_INICIO || '';
            const paciente = c.paciente || c.PACIENTE || 'Sin paciente';
            const medico = c.medico || c.MEDICO || 'Sin médico';
            const especialidad = c.especialidad || c.ESPECIALIDAD || '-';
            const estado = c.estado || c.ESTADO || 'PROGRAMADA';
            
            return `
            <tr>
                <td>${id}</td>
                <td>${fecha}</td>
                <td class="fw-bold text-primary">${hora}</td>
                <td>${paciente}</td>
                <td>${medico}</td>
                <td>${especialidad}</td>
                <td><span class="badge ${getBadge(estado)}">${estado}</span></td>
                <td>
                    <button class="btn btn-sm btn-warning" onclick="window.editarCita(${id})" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="window.cancelarCita(${id})" title="Cancelar"><i class="fas fa-times"></i></button>
                </td>
            </tr>
        `;
        }).join('');

    } catch(e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Error de conexión</td></tr>';
    }
};

function getBadge(est) {
    const s = (est || '').toUpperCase();
    if(s === 'PROGRAMADA') return 'bg-primary';
    if(s === 'CONFIRMADA') return 'bg-info';
    if(s === 'ATENDIDA') return 'bg-success';
    if(s === 'EN_CURSO') return 'bg-warning';
    if(s === 'FINALIZADA') return 'bg-success';
    if(s === 'CANCELADA') return 'bg-danger';
    return 'bg-secondary';
}

// 5. GUARDAR CITA
window.saveCita = async function(e) {
    if(e) e.preventDefault();
    
    const form = document.getElementById('formCita');
    if(!form) {
        alert('Error: No se encontró el formulario');
        return;
    }

    // Validar campos requeridos
    if(!form.id_paciente.value || !form.id_medico.value || !form.fecha_cita.value || !form.hora_inicio.value) {
        alert('Por favor complete todos los campos obligatorios (*)');
        return;
    }

    let horaFin = form.hora_fin.value;

    // Si no especificó hora de fin, calcular automáticamente (+30 min)
    if (!horaFin) {
        const [h, m] = form.hora_inicio.value.split(':').map(Number);
        let minutos = m + 30;
        let horas = h;
        if (minutos >= 60) {
            horas = (horas + 1) % 24;
            minutos -= 60;
        }
        horaFin = `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
    }

    // Validar que hora_fin > hora_inicio
    const [h1, m1] = form.hora_inicio.value.split(':').map(Number);
    const [h2, m2] = horaFin.split(':').map(Number);
    const minInicio = h1 * 60 + m1;
    const minFin = h2 * 60 + m2;

    if (minFin <= minInicio) {
        alert('❌ La hora de fin debe ser posterior a la hora de inicio');
        return;
    }

    const id = document.getElementById('id_cita').value;
    const url = id ? `/citas/${id}` : '/citas';
    const method = id ? 'PUT' : 'POST';

    const data = {
        id_paciente: parseInt(form.id_paciente.value),
        id_medico: parseInt(form.id_medico.value),
        fecha_cita: form.fecha_cita.value,
        hora_inicio: form.hora_inicio.value,
        hora_fin: horaFin,
        especialidad: form.especialidad.value || '',
        motivo: form.motivo_consulta.value || '',
        costo: parseFloat(form.costo_consulta.value) || 0,
        notas: form.notas.value || '',
        estado: form.estado ? form.estado.value.toUpperCase() : 'PROGRAMADA'
    };

    console.log('💾 Guardando cita:', data);

    try {
        const res = await window.apiFetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const responseData = await res.json();

        if(res.ok) {
            alert('✅ Cita guardada correctamente');
            if(modalCitaInstance) modalCitaInstance.hide();
            form.reset();
            document.getElementById('id_cita').value = '';
            document.getElementById('alertaDisponibilidad').innerHTML = '';
            // Recargar tabla para mostrar la nueva cita
            await loadTablaCitas();
        } else {
            let mensajeError = responseData.error || 'No se pudo guardar la cita';
            if(res.status === 409 && responseData.detalle) {
                mensajeError = `⚠️ HORARIO OCUPADO\n\n${mensajeError}\n${responseData.detalle}\n\nPor favor, seleccione otro horario.`;
            }
            alert('❌ Error: ' + mensajeError);
        }
    } catch(err) { 
        console.error('Error guardando cita:', err);
        alert('❌ Error de red: ' + err.message); 
    }
};

// 6. EDITAR Y CANCELAR
window.editarCita = async function(id) {
    try {
        const res = await window.apiFetch(`/citas/${id}`);
        if(!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "Error al obtener datos de la cita");
        }
        const data = await res.json();

        console.log('📝 Datos de cita para editar:', data);

        // Llenar form
        document.getElementById('id_cita').value = data.id_cita || data.id || data.ID_CITA || id;
        document.getElementById('id_paciente').value = data.id_paciente || data.ID_PACIENTE || '';
        document.getElementById('id_medico').value = data.id_medico || data.ID_MEDICO || '';
        
        let fecha = data.fecha_cita || data.fecha || data.FECHA_CITA || '';
        if(fecha && fecha.includes('T')) fecha = fecha.split('T')[0];
        if(fecha && fecha.includes(' ')) fecha = fecha.split(' ')[0];
        document.getElementById('fecha_cita').value = fecha;

        document.getElementById('hora_inicio').value = data.hora_inicio || data.HORA_INICIO || '';
        document.getElementById('hora_fin').value = data.hora_fin || data.HORA_FIN || '';
        document.getElementById('especialidad').value = data.especialidad || data.ESPECIALIDAD || '';
        document.getElementById('motivo_consulta').value = data.motivo_consulta || data.motivo || data.MOTIVO_CONSULTA || '';
        document.getElementById('costo_consulta').value = data.costo_consulta || data.costo || data.COSTO_CONSULTA || '';
        document.getElementById('notas').value = data.notas || data.NOTAS || '';
        
        const estField = document.getElementById('estado');
        if(estField) {
            const estado = (data.estado || data.ESTADO || 'PROGRAMADA').toLowerCase();
            estField.value = estado;
        }

        document.getElementById('modalCitaLabel').innerText = `Editar Cita #${id}`;
        if(modalCitaInstance) modalCitaInstance.show();

    } catch(e) { 
        console.error('Error editando cita:', e);
        alert('❌ Error: ' + e.message); 
    }
};

window.cancelarCita = async function(id) {
    if(confirm('¿Está seguro de CANCELAR esta cita?')) {
        try {
            const res = await window.apiFetch(`/citas/${id}`, { method: 'DELETE' });
            if(res.ok) {
                alert('✅ Cita cancelada correctamente');
                await loadTablaCitas();
            } else {
                const err = await res.json();
                alert('❌ Error: ' + (err.error || 'No se pudo cancelar'));
            }
        } catch(err) {
            alert('❌ Error de red: ' + err.message);
        }
    }
};

// Función para limpiar filtros
window.limpiarFiltrosCitas = function() {
    const search = document.getElementById('citasSearch');
    const fecha = document.getElementById('citasFecha');
    const estado = document.getElementById('citasEstado');
    const medico = document.getElementById('citasMedico');
    if (search) search.value = '';
    if (fecha) fecha.value = '';
    if (estado) estado.value = '';
    if (medico) medico.value = '';
    loadTablaCitas();
};

// Listener para cambio de médico (Actualizar especialidad)
document.addEventListener('change', function(e) {
    if(e.target && e.target.id === 'id_medico') {
        const opt = e.target.options[e.target.selectedIndex];
        const esp = opt.getAttribute('data-esp');
        if(esp) document.getElementById('especialidad').value = esp;
    }
});

// ==================================================================
// FUNCIÓN PARA VALIDAR DISPONIBILIDAD DE HORARIO
// ==================================================================

window.validarDisponibilidad = async function() {
    const medicoId = document.getElementById('id_medico').value;
    const fecha = document.getElementById('fecha_cita').value;
    const horaInicio = document.getElementById('hora_inicio').value;
    const alertaDiv = document.getElementById('alertaDisponibilidad');

    if (!medicoId || !fecha || !horaInicio) {
        alertaDiv.innerHTML = `
            <div class="alert alert-warning alert-dismissible fade show" role="alert">
                <i class="fas fa-info-circle me-2"></i> Complete médico, fecha y hora para validar
            </div>
        `;
        return;
    }

    try {
        alertaDiv.innerHTML = `
            <div class="alert alert-info alert-dismissible fade show" role="alert">
                <div class="spinner-border spinner-border-sm me-2" role="status"></div> Validando...
            </div>
        `;

        // Calcular hora_fin si no está especificada
        let horaFin = document.getElementById('hora_fin').value;
        if (!horaFin) {
            const [h, m] = horaInicio.split(':').map(Number);
            let minutos = m + 30;
            let horas = h;
            if (minutos >= 60) {
                horas = (horas + 1) % 24;
                minutos -= 60;
            }
            horaFin = `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
        }

        const res = await window.apiFetch(
            `/citas/disponibilidad?id_medico=${medicoId}&fecha=${fecha}&hora_inicio=${horaInicio}&hora_fin=${horaFin}`
        );

        const data = await res.json();

        if (data.disponible) {
            alertaDiv.innerHTML = `
                <div class="alert alert-success alert-dismissible fade show" role="alert">
                    <i class="fas fa-check-circle me-2"></i> <strong>¡Excelente!</strong> Este horario está disponible
                    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                </div>
            `;
        } else {
            alertaDiv.innerHTML = `
                <div class="alert alert-danger alert-dismissible fade show" role="alert">
                    <i class="fas fa-times-circle me-2"></i> <strong>Horario ocupado:</strong> ${data.mensaje}
                    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                </div>
            `;
        }

    } catch (error) {
        console.error('Error validando:', error);
        alertaDiv.innerHTML = `
            <div class="alert alert-danger alert-dismissible fade show" role="alert">
                <i class="fas fa-exclamation-triangle me-2"></i> Error al validar disponibilidad
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
    }
};

// EXPOSICIÓN GLOBAL (INIT)
window.initCitas = initCitas;