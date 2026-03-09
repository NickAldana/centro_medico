// ==========================================
// REPORTES - FRONTEND BLINDADO (v3.1)
// ==========================================
const API_REP = '/api/reportes';
let chartsRef = {};

// Mapa Meses
const MESES = { '01':'Ene', '02':'Feb', '03':'Mar', '04':'Abr', '05':'May', '06':'Jun', '07':'Jul', '08':'Ago', '09':'Sep', '10':'Oct', '11':'Nov', '12':'Dic' };

function initReportesModule() {
    console.log('🚀 Init Reportes...');
    
    // Verificar que Chart.js esté cargado
    if(typeof Chart === 'undefined') {
        console.error('❌ Chart.js no está disponible. Esperando...');
        setTimeout(initReportesModule, 500);
        return;
    }
    
    // Fechas por defecto
    const now = new Date();
    const fi = document.getElementById('fechaInicioReporte');
    const ff = document.getElementById('fechaFinReporte');
    if(fi && ff) {
        fi.value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        ff.value = now.toISOString().split('T')[0];
    }

    // Cargar datos
    loadKPIs();
    loadHistorialCajas();

    // Esperar a que el DOM esté completamente listo antes de renderizar gráficos
    setTimeout(() => {
        loadAdvancedCharts();
    }, 800);
}

// 1. KPIs
async function loadKPIs() {
    try {
        const res = await window.apiFetch(`${API_REP}/dashboard`);
        if(res.ok) {
            const d = await res.json();
            
            // 🔥 FIX: Función inteligente para extraer el número sin importar cómo lo envíe Oracle
            const extraerNumero = (val) => {
                if (val === null || val === undefined) return 0;
                // Si es un objeto, busca la llave más común (valor, total, cantidad, o agarra el primer dato que pille)
                if (typeof val === 'object') {
                    return Number(val.valor || val.TOTAL || val.total || val.CANTIDAD || val.cantidad || Object.values(val)[0] || 0);
                }
                // Si ya es un número o texto numérico
                return Number(val) || 0;
            };

            // Extracción segura
            const ingresosValor = extraerNumero(d.ingresos);
            const citasValor = extraerNumero(d.citas);
            const pacientesNuevos = extraerNumero(d.pacientesNuevos || d.pacientes);
            
            // 🔥 FIX: Si el Ticket Promedio viene nulo, lo calculamos matemáticamente
            let ticketValor = extraerNumero(d.ticket);
            if (ticketValor === 0 && citasValor > 0 && ingresosValor > 0) {
                ticketValor = ingresosValor / citasValor;
            }
            
            const ingresosVariacion = (d.ingresos && d.ingresos.variacion) ? d.ingresos.variacion : '0.0';
            
            // Actualizar tarjetas
            updateCard('ingresosMes', `Bs. ${ingresosValor.toFixed(2)}`, ingresosVariacion);
            updateCard('citasAtendidas', citasValor.toString(), null);
            updateCard('pacientesNuevos', pacientesNuevos.toString(), null);
            updateCard('ticketPromedio', `Bs. ${ticketValor.toFixed(2)}`, null);
            
        } else {
            console.error('Error cargando KPIs:', res.status);
        }
    } catch(e) { 
        console.error("Error KPIs", e);
        // Mostrar valores por defecto limpios en caso de error
        updateCard('ingresosMes', 'Bs. 0.00', '0.0');
        updateCard('citasAtendidas', '0', null);
        updateCard('pacientesNuevos', '0', null);
        updateCard('ticketPromedio', 'Bs. 0.00', null);
    }
}

function updateCard(id, val, variation) {
    const el = document.getElementById(id);
    if(el) el.innerText = val;
    if(variation && id === 'ingresosMes') {
        const vEl = document.getElementById('variacionIngresos');
        if(vEl) vEl.innerText = `${variation}% vs mes anterior`;
    }
}

// 2. GRÁFICOS (Chart.js)
async function loadAdvancedCharts() {
    try {
        const res = await window.apiFetch(`${API_REP}/graficos`);
        if(!res.ok) {
            console.error('Error cargando gráficos:', res.status);
            return;
        }
        const d = await res.json();

        // 1. TENDENCIA DE INGRESOS (Línea profesional)
        const dataTend = d.tendencia || [];
        if(dataTend.length > 0) {
            const labels = dataTend.map(x => x.PERIODO || x.periodo || 'N/A');
            const datos = dataTend.map(x => parseFloat(x.TOTAL || x.total || 0));
            
            renderChart('tendenciaIngresosChart', 'line', {
                labels: labels,
                datasets: [{
                    label: 'Ingresos (Bs)',
                    data: datos,
                    borderColor: '#4e73df',
                    backgroundColor: 'rgba(78, 115, 223, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: '#4e73df',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointHoverBackgroundColor: '#2e59d9',
                    pointHoverBorderColor: '#fff'
                }]
            }, {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        display: true,
                        position: 'bottom',
                        labels: { padding: 15, font: { size: 12 } }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 12,
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 12 },
                        callbacks: {
                            label: function(context) {
                                return 'Ingresos: Bs. ' + context.parsed.y.toFixed(2);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return 'Bs. ' + value.toFixed(0);
                            },
                            font: { size: 11 }
                        },
                        grid: { color: 'rgba(0,0,0,0.1)' }
                    },
                    x: {
                        ticks: { 
                            font: { size: 11 },
                            maxRotation: 45,
                            minRotation: 45
                        },
                        grid: { display: false }
                    }
                }
            });
        } else {
            mostrarMensajeGrafico('tendenciaIngresosChart', 'No hay datos de ingresos disponibles');
        }

        // 2. ESPECIALIDAD (Donut profesional)
        const dataEsp = d.especialidad || [];
        if(dataEsp.length > 0) {
            const labelsEsp = dataEsp.map(x => x.ESPECIALIDAD || x.especialidad || 'Sin especialidad');
            const datosEsp = dataEsp.map(x => parseInt(x.CANTIDAD || x.cantidad || 0));
            
            renderChart('distribucionEspecialidadChart', 'doughnut', {
                labels: labelsEsp,
                datasets: [{
                    data: datosEsp,
                    backgroundColor: ['#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b', '#858796'],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            }, {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        display: true,
                        position: 'bottom',
                        labels: { 
                            padding: 10, 
                            font: { size: 12 },
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 10,
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return label + ': ' + value + ' (' + percentage + '%)';
                            }
                        }
                    }
                }
            });
        } else {
            mostrarMensajeGrafico('distribucionEspecialidadChart', 'No hay datos de especialidades');
        }

        // 3. MÉTODOS DE PAGO (Pie profesional)
        const dataMet = d.metodos || [];
        if(dataMet.length > 0) {
            const labelsMet = dataMet.map(x => x.METODO_PAGO || x.metodo_pago || 'Sin método');
            const datosMet = dataMet.map(x => parseFloat(x.TOTAL || x.total || 0));
            
            renderChart('ingresosMetodoPagoChart', 'pie', {
                labels: labelsMet,
                datasets: [{
                    data: datosMet,
                    backgroundColor: ['#f6c23e', '#e74a3b', '#4e73df', '#1cc88a', '#36b9cc'],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            }, {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        display: true,
                        position: 'bottom',
                        labels: { 
                            padding: 10, 
                            font: { size: 12 },
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 10,
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return label + ': Bs. ' + value.toFixed(2) + ' (' + percentage + '%)';
                            }
                        }
                    }
                }
            });
        } else {
            mostrarMensajeGrafico('ingresosMetodoPagoChart', 'No hay datos de métodos de pago');
        }

        // 4. COMPARATIVA CITAS VS PACIENTES (Bar profesional)
        const dataComp = d.comparativa || [];
        if(dataComp.length > 0) {
            const labelsComp = dataComp.map(x => x.PERIODO || x.periodo || 'N/A');
            const datosCitas = dataComp.map(x => parseInt(x.CITAS || x.citas || 0));
            const datosPac = dataComp.map(x => parseInt(x.PACIENTES || x.pacientes || 0));
            
            renderChart('citasPacientesChart', 'bar', {
                labels: labelsComp,
                datasets: [
                    {
                        label: 'Citas',
                        data: datosCitas,
                        backgroundColor: 'rgba(54, 185, 204, 0.8)',
                        borderColor: '#36b9cc',
                        borderWidth: 2
                    },
                    {
                        label: 'Pacientes',
                        data: datosPac,
                        backgroundColor: 'rgba(28, 200, 138, 0.8)',
                        borderColor: '#1cc88a',
                        borderWidth: 2
                    }
                ]
            }, {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        display: true,
                        position: 'bottom',
                        labels: { padding: 15, font: { size: 12 } }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 10
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { font: { size: 11 } },
                        grid: { color: 'rgba(0,0,0,0.1)' }
                    },
                    x: {
                        ticks: { font: { size: 11 } },
                        grid: { display: false }
                    }
                }
            });
        } else {
            mostrarMensajeGrafico('citasPacientesChart', 'No hay datos comparativos disponibles');
        }

    } catch(e) { 
        console.error("Error Gráficos", e);
        ['tendenciaIngresosChart', 'distribucionEspecialidadChart', 'ingresosMetodoPagoChart', 'citasPacientesChart'].forEach(id => {
            mostrarMensajeGrafico(id, 'Error al cargar datos');
        });
    }
}

function mostrarMensajeGrafico(canvasId, mensaje) {
    const canvas = document.getElementById(canvasId);
    if(canvas) {
        const container = canvas.parentElement;
        if(container) {
            container.innerHTML = `
                <div class="d-flex align-items-center justify-content-center" style="height: 100%; min-height: 200px;">
                    <div class="text-center text-muted">
                        <i class="fas fa-chart-line fa-3x mb-3" style="opacity: 0.3;"></i>
                        <p class="mb-0">${mensaje}</p>
                    </div>
                </div>
            `;
        }
    }
}

function renderChart(id, type, dataConfig, customOptions = {}) {
    const ctx = document.getElementById(id);
    if(!ctx) {
        console.warn(`Canvas ${id} no encontrado`);
        return;
    }
    
    if(typeof Chart === 'undefined') {
        mostrarMensajeGrafico(id, 'Chart.js no está cargado');
        return;
    }
    
    if(chartsRef[id]) { 
        chartsRef[id].destroy(); 
        chartsRef[id] = null;
    }

    const defaultOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 1000, easing: 'easeInOutQuart' },
        plugins: {
            legend: { 
                display: true, position: 'bottom',
                labels: { padding: 15, font: { size: 12, family: "'Arial', sans-serif" }, usePointStyle: true }
            },
            tooltip: {
                enabled: true, backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: 12, titleFont: { size: 14, weight: 'bold' },
                bodyFont: { size: 12 }, cornerRadius: 6, displayColors: true
            }
        }
    };

    const finalOptions = {
        ...defaultOptions, ...customOptions,
        plugins: { ...defaultOptions.plugins, ...(customOptions.plugins || {}) }
    };

    try {
        chartsRef[id] = new Chart(ctx, { type: type, data: dataConfig, options: finalOptions });
    } catch(error) {
        console.error(`Error creando gráfico ${id}:`, error);
        mostrarMensajeGrafico(id, 'Error al renderizar gráfico');
    }
}

// 3. EXPORTAR
function generarPDF() {
    const tipo = document.getElementById('tipoReporte').value;
    const fi = document.getElementById('fechaInicioReporte').value;
    const ff = document.getElementById('fechaFinReporte').value;
    window.open(`${API_REP}/exportar/pdf?tipo=${tipo}&fecha_inicio=${fi}&fecha_fin=${ff}`, '_blank');
}

function exportarExcel() {
    const tipo = document.getElementById('tipoReporte').value;
    const fi = document.getElementById('fechaInicioReporte').value;
    const ff = document.getElementById('fechaFinReporte').value;
    window.open(`${API_REP}/exportar/excel?tipo=${tipo}&fecha_inicio=${fi}&fecha_fin=${ff}`, '_blank');
}

// 4. HISTORIAL DE CAJAS (ARQUEOS)
function formatBs(n) {
    if (n == null || isNaN(n)) return '0.00';
    return parseFloat(n).toFixed(2);
}

function limpiarFiltrosArqueos() {
    const fi = document.getElementById('arqueoFechaInicio');
    const ff = document.getElementById('arqueoFechaFin');
    if (fi) fi.value = '';
    if (ff) ff.value = '';
}

async function loadHistorialCajas() {
    const tbody = document.querySelector('#tablaArqueos tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Cargando...</td></tr>';

    const fi = document.getElementById('arqueoFechaInicio');
    const ff = document.getElementById('arqueoFechaFin');
    let url = `${API_REP}/historial-cajas`;
    const params = [];
    if (fi && fi.value) params.push('fecha_inicio=' + encodeURIComponent(fi.value));
    if (ff && ff.value) params.push('fecha_fin=' + encodeURIComponent(ff.value));
    if (params.length) url += '?' + params.join('&');

    try {
        const res = await window.apiFetch(url);
        if (!res.ok) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-4">Error al cargar historial de cajas.</td></tr>';
            return;
        }
        const data = await res.json();
        const arqueos = data.arqueos || [];
        if (arqueos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No hay sesiones cerradas en el rango seleccionado.</td></tr>';
            return;
        }
        tbody.innerHTML = arqueos.map(a => {
            const dif = parseFloat(a.diferencia);
            let diffHtml;
            if (dif < 0) {
                diffHtml = '<span class="text-danger fw-bold">' + formatBs(dif) + ' Bs (FALTANTE)</span>';
            } else if (dif > 0) {
                diffHtml = '<span class="text-success fw-bold">+' + formatBs(dif) + ' Bs (SOBRANTE)</span>';
            } else {
                diffHtml = '<span class="text-success fw-bold">0.00 Bs (CUADRÓ)</span>';
            }
            return '<tr>' +
                '<td>' + (a.fecha_cierre || '-') + '</td>' +
                '<td>' + (a.cajero || '-') + '</td>' +
                '<td class="text-end">' + formatBs(a.monto_inicial) + '</td>' +
                '<td class="text-end">' + formatBs(a.ventas_sistema) + '</td>' +
                '<td class="text-end">' + formatBs(a.monto_teorico) + '</td>' +
                '<td class="text-end">' + formatBs(a.monto_declarado) + '</td>' +
                '<td class="text-end">' + diffHtml + '</td>' +
                '</tr>';
        }).join('');
    } catch (e) {
        console.error('Error loadHistorialCajas', e);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-4">Error de conexión.</td></tr>';
    }
}

window.initReportesModule = initReportesModule;
window.generarPDF = generarPDF;
window.exportarExcel = exportarExcel;
window.loadHistorialCajas = loadHistorialCajas;
window.limpiarFiltrosArqueos = limpiarFiltrosArqueos;