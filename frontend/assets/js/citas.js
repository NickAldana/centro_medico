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
}

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
    if(!form.id_paciente.value || !form.id_medico.value || !form.fecha_cita.value) {
        alert('Por favor complete todos los campos obligatorios (*)');
        return;
    }

    // Validar que se haya seleccionado un horario
    if(!form.hora_inicio.value || !form.hora_fin.value) {
        alert('Por favor selecciona un horario disponible');
        return;
    }

    const id = document.getElementById('id_cita').value;
    const url = id ? `/citas/${id}` : '/citas';
    const method = id ? 'PUT' : 'POST';

    // Los horarios ya vienen calculados desde la selección automática
    const data = {
        id_paciente: parseInt(form.id_paciente.value),
        id_medico: parseInt(form.id_medico.value),
        fecha_cita: form.fecha_cita.value,
        hora_inicio: form.hora_inicio.value,
        hora_fin: form.hora_fin.value,
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
        // Actualizar horarios disponibles cuando cambie el médico
        updateHorariosDisponibles();
    }
});

// Listener para cambio de fecha
document.addEventListener('change', function(e) {
    if(e.target && e.target.id === 'fecha_cita') {
        updateHorariosDisponibles();
    }
});

// ==================================================================
// SISTEMA DE SELECCIÓN AUTOMÁTICA DE HORARIOS
// ==================================================================

// Actualizar horarios disponibles cuando cambie fecha o médico
async function updateHorariosDisponibles() {
    const fecha = document.getElementById('fecha_cita').value;
    const medicoId = document.getElementById('id_medico').value;
    const container = document.getElementById('horariosContainer');

    if (!fecha || !medicoId) {
        container.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-clock me-2"></i>
                Selecciona fecha y médico para ver horarios disponibles
            </div>
        `;
        return;
    }

    try {
        // Mostrar loading
        container.innerHTML = `
            <div class="text-center">
                <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                Cargando horarios disponibles...
            </div>
        `;

        // Consultar citas existentes para esta fecha y médico
        const res = await window.apiFetch(`/citas/disponibilidad?id_medico=${medicoId}&fecha=${fecha}`);
        if (!res.ok) {
            throw new Error('Error al consultar horarios');
        }

        const data = await res.json();
        const citasOcupadas = data.citas || [];

        // Generar horarios disponibles (8:00 AM a 5:00 PM, cada 30 min)
        const horariosDisponibles = generarHorariosDisponibles(citasOcupadas);

        renderHorariosDisponibles(horariosDisponibles);

    } catch (error) {
        console.error('Error cargando horarios:', error);
        container.innerHTML = `
            <div class="text-center text-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Error al cargar horarios disponibles
            </div>
        `;
    }
}

// Generar lista de horarios disponibles (8:00 AM - 5:00 PM, cada 30 min)
function generarHorariosDisponibles(citasOcupadas) {
    const horarios = [];
    const horaInicio = 8; // 8:00 AM
    const horaFin = 17;   // 5:00 PM

    for (let hora = horaInicio; hora < horaFin; hora++) {
        for (let minuto = 0; minuto < 60; minuto += 30) {
            const horaStr = `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
            const horaFinStr = minuto === 30 ?
                `${String(hora + 1).padStart(2, '0')}:00` :
                `${String(hora).padStart(2, '0')}:30`;

            // Verificar si este horario está ocupado
            const ocupado = citasOcupadas.some(cita => {
                const citaInicio = cita.HORA_INICIO || cita.hora_inicio;
                const citaFin = cita.HORA_FIN || cita.hora_fin;
                return horarioSolapa(horaStr, horaFinStr, citaInicio, citaFin);
            });

            if (!ocupado) {
                horarios.push({
                    inicio: horaStr,
                    fin: horaFinStr,
                    disponible: true
                });
            }
        }
    }

    return horarios;
}

// Verificar si dos intervalos de tiempo se solapan
function horarioSolapa(inicio1, fin1, inicio2, fin2) {
    const i1 = horaAMinutos(inicio1);
    const f1 = horaAMinutos(fin1);
    const i2 = horaAMinutos(inicio2);
    const f2 = horaAMinutos(fin2);

    return (i1 < f2 && f1 > i2);
}

// Convertir hora HH:MM a minutos totales
function horaAMinutos(hora) {
    const [h, m] = hora.split(':').map(Number);
    return h * 60 + m;
}

// Renderizar los botones de horarios disponibles
function renderHorariosDisponibles(horarios) {
    const container = document.getElementById('horariosContainer');

    if (horarios.length === 0) {
        container.innerHTML = `
            <div class="text-center text-warning">
                <i class="fas fa-calendar-times me-2"></i>
                No hay horarios disponibles para esta fecha
            </div>
        `;
        return;
    }

    // Agrupar por mañana y tarde
    const manana = horarios.filter(h => horaAMinutos(h.inicio) < 12 * 60);
    const tarde = horarios.filter(h => horaAMinutos(h.inicio) >= 12 * 60);

    let html = '<div class="row g-2">';

    if (manana.length > 0) {
        html += `
            <div class="col-12">
                <small class="text-muted fw-bold">🌅 MAÑANA</small>
                <div class="d-flex flex-wrap gap-1 mt-1">
                    ${manana.map(h => crearBotonHorario(h)).join('')}
                </div>
            </div>
        `;
    }

    if (tarde.length > 0) {
        html += `
            <div class="col-12">
                <small class="text-muted fw-bold">🌇 TARDE</small>
                <div class="d-flex flex-wrap gap-1 mt-1">
                    ${tarde.map(h => crearBotonHorario(h)).join('')}
                </div>
            </div>
        `;
    }

    html += '</div>';
    container.innerHTML = html;
}

// Crear botón para un horario específico
function crearBotonHorario(horario) {
    const horaFormateada = formatearHoraAmigable(horario.inicio);
    return `
        <button type="button"
                class="btn btn-outline-primary btn-sm horario-btn"
                data-inicio="${horario.inicio}"
                data-fin="${horario.fin}"
                onclick="seleccionarHorario('${horario.inicio}', '${horario.fin}')">
            ${horaFormateada}
        </button>
    `;
}

// Formatear hora de manera amigable (8:00 → 8:00 AM)
function formatearHoraAmigable(hora) {
    const [h, m] = hora.split(':').map(Number);
    const periodo = h >= 12 ? 'PM' : 'AM';
    const hora12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hora12}:${String(m).padStart(2, '0')} ${periodo}`;
}

// Función para seleccionar un horario
window.seleccionarHorario = function(inicio, fin) {
    // Remover selección anterior
    document.querySelectorAll('.horario-btn').forEach(btn => {
        btn.classList.remove('active', 'btn-primary');
        btn.classList.add('btn-outline-primary');
    });

    // Marcar botón seleccionado
    const botonSeleccionado = document.querySelector(`[data-inicio="${inicio}"]`);
    if (botonSeleccionado) {
        botonSeleccionado.classList.remove('btn-outline-primary');
        botonSeleccionado.classList.add('active', 'btn-primary');
    }

    // Establecer valores en campos ocultos
    document.getElementById('hora_inicio').value = inicio;
    document.getElementById('hora_fin').value = fin;

    console.log(`🕐 Horario seleccionado: ${inicio} - ${fin}`);
};

// Modificar openNewCita para inicializar horarios
const originalOpenNewCita = window.openNewCita;
window.openNewCita = function() {
    originalOpenNewCita();
    // Limpiar selección de horario
    document.querySelectorAll('.horario-btn').forEach(btn => {
        btn.classList.remove('active', 'btn-primary');
        btn.classList.add('btn-outline-primary');
    });
    document.getElementById('hora_inicio').value = '';
    document.getElementById('hora_fin').value = '';
    updateHorariosDisponibles();
};

// Modificar editarCita para mostrar horario seleccionado
const originalEditarCita = window.editarCita;
window.editarCita = async function(id) {
    await originalEditarCita(id);
    // Después de cargar los datos, actualizar horarios y marcar el seleccionado
    setTimeout(() => {
        updateHorariosDisponibles().then(() => {
            const horaInicio = document.getElementById('hora_inicio').value;
            if (horaInicio) {
                const boton = document.querySelector(`[data-inicio="${horaInicio}"]`);
                if (boton) {
                    boton.classList.remove('btn-outline-primary');
                    boton.classList.add('active', 'btn-primary');
                }
            }
        });
    }, 100);
};

// EXPOSICIÓN GLOBAL (INIT)
window.initCitas = initCitas;