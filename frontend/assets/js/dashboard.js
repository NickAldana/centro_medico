/* =====================================================
   DASHBOARD.JS (Módulo Específico - PRODUCCIÓN)
   Responsabilidad: Cargar KPIs, Gráficas y Tablas
   ===================================================== */

// Variables globales para las gráficas
let ingresosChartInstance = null;
let serviciosChartInstance = null;

// INIT: Punto de entrada
function initDashboard() {
    console.log("📊 Inicializando Dashboard Visual...");
    
    // Cargar información del usuario
    loadUserInfo();
    
    // Ejecutamos en paralelo para mayor velocidad, pero capturamos errores individuales
    Promise.allSettled([
        loadKPIs(),
        loadGraficos(),
        loadTablasResumen()
    ]);
}

// --- 0. CARGAR INFORMACIÓN DEL USUARIO ---
function loadUserInfo() {
    // Usar la función checkSession que ya tiene toda la lógica mejorada
    if (typeof checkSession === 'function') {
        checkSession();
    }
    
    // También intentar cargar el logo específicamente (Lógica Mantenida y Optimizada)
    setTimeout(() => {
        const logoImgs = document.querySelectorAll('.sidebar-header img');
        logoImgs.forEach(logoImg => {
            if (logoImg) {
                // 1. Asegurarnos de que siempre apunte a la ruta absoluta correcta
                let baseSrc = logoImg.getAttribute('src');
                if (baseSrc && !baseSrc.startsWith('/assets/')) {
                    baseSrc = '/assets/images/logo.png';
                }

                logoImg.onload = function() {
                    this.style.display = 'block';
                };
                
                logoImg.onerror = function() {
                    // Fallback final: si falla, ocultamos elegantemente (tu lógica original)
                    this.style.display = 'none';
                    const span = this.nextElementSibling;
                    if (span) {
                        span.style.marginLeft = '0';
                    }
                };
                
                // Forzar recarga con timestamp para evitar caché (tu lógica original)
                if (baseSrc && !baseSrc.includes('?t=')) {
                    logoImg.src = baseSrc + '?t=' + Date.now();
                }
            }
        });
    }, 200);
}

// --- 1. CARGAR KPIs ---
async function loadKPIs() {
    try {
        // Anti-Caché para datos en tiempo real
        const res = await window.apiFetch(`reportes/dashboard?t=${Date.now()}`); 
        const data = await res.json();

        if(data) {
            // Pacientes activos (ahora viene como número directo desde el backend)
            const pacientesCount = Number(data.pacientes || 0);
            animateValue("kpiPacientes", 0, pacientesCount, 1000);
            
            // Citas de hoy (campo específico del backend)
            const citasHoy = Number(data.citasHoy || data.citas?.valor || 0);
            animateValue("kpiCitas", 0, citasHoy, 1000);
            
            // Ingresos del día (campo específico del backend)
            const ingresosDia = Number(data.ingresosDia || data.ingresos?.valor || 0);
            const ingresosFmt = new Intl.NumberFormat('es-BO', { 
                style: 'currency', currency: 'BOB' 
            }).format(ingresosDia);
            
            const elIngresos = document.getElementById('kpiIngresos');
            if(elIngresos) elIngresos.innerText = ingresosFmt;
            
            // Stock bajo (campo específico del backend)
            const stockBajo = Number(data.stock_bajo || 0);
            const elStock = document.getElementById('kpiStock');
            if(elStock) elStock.innerText = stockBajo;
        }
    } catch (error) {
        console.error("⚠️ Error cargando KPIs:", error);
        // Mostrar valores por defecto en caso de error
        const elPacientes = document.getElementById('kpiPacientes');
        const elCitas = document.getElementById('kpiCitas');
        const elIngresos = document.getElementById('kpiIngresos');
        const elStock = document.getElementById('kpiStock');
        if(elPacientes) elPacientes.innerText = '0';
        if(elCitas) elCitas.innerText = '0';
        if(elIngresos) elIngresos.innerText = 'Bs 0,00';
        if(elStock) elStock.innerText = '0';
    }
}

// --- 2. GRÁFICOS ---
async function loadGraficos() {
    // Si no hay librería Chart, salimos (evita error fatal)
    if (typeof Chart === 'undefined') return;

    try {
        const res = await window.apiFetch(`reportes/graficos?t=${Date.now()}`);
        const data = await res.json();

        // A) Ingresos Semanales (Gráfico de línea mejorado)
        const ctxIngresos = document.getElementById('ingresosChart');
        if (ctxIngresos) {
            if (ingresosChartInstance) ingresosChartInstance.destroy();

            // Preparar datos para el gráfico - siempre mostrar 7 semanas
            let labels = [];
            let valores = [];
            
            if (Array.isArray(data.tendencia) && data.tendencia.length > 0) {
                // Ordenar por semana (más antigua primero)
                const tendenciaOrdenada = [...data.tendencia].sort((a, b) => {
                    const semanaA = Number(a.SEMANA || 0);
                    const semanaB = Number(b.SEMANA || 0);
                    return semanaA - semanaB;
                });
                
                labels = tendenciaOrdenada.map(item => {
                    // Usar PERIODO si está disponible, sino construir desde fechas
                    if (item.PERIODO) {
                        return item.PERIODO;
                    }
                    if (item.FECHA_INICIO && item.FECHA_FIN) {
                        return `${item.FECHA_INICIO} - ${item.FECHA_FIN}`;
                    }
                    return `Sem ${item.SEMANA || ''}`;
                });
                
                valores = tendenciaOrdenada.map(item => Number(item.TOTAL) || 0);
            }
            
            // Asegurar que siempre tengamos 7 semanas
            // Si tenemos menos de 7, completar con semanas vacías
            if (labels.length < 7) {
                const hoy = new Date();
                const semanasCompletas = [];
                
                // Generar las últimas 7 semanas
                for (let i = 6; i >= 0; i--) {
                    const fechaSemana = new Date(hoy);
                    fechaSemana.setDate(fechaSemana.getDate() - (i * 7));
                    
                    // Ajustar al inicio de la semana (lunes)
                    const diaSemana = fechaSemana.getDay();
                    const diff = diaSemana === 0 ? -6 : 1 - diaSemana;
                    fechaSemana.setDate(fechaSemana.getDate() + diff);
                    
                    const semanaInicio = new Date(fechaSemana);
                    const semanaFin = new Date(fechaSemana);
                    semanaFin.setDate(semanaFin.getDate() + 6);
                    
                    const labelSemana = `${String(semanaInicio.getDate()).padStart(2, '0')}/${String(semanaInicio.getMonth() + 1).padStart(2, '0')} - ${String(semanaFin.getDate()).padStart(2, '0')}/${String(semanaFin.getMonth() + 1).padStart(2, '0')}`;
                    
                    // Verificar si ya existe esta semana en los datos
                    const existe = labels.some(l => l.includes(semanaInicio.getDate().toString()));
                    
                    if (!existe) {
                        semanasCompletas.push({
                            label: labelSemana,
                            valor: 0
                        });
                    }
                }
                
                // Combinar datos existentes con semanas faltantes
                const todasLasSemanas = [...labels.map((l, i) => ({ label: l, valor: valores[i] })), ...semanasCompletas];
                
                // Ordenar por fecha (más antigua primero)
                todasLasSemanas.sort((a, b) => {
                    const fechaA = a.label.split(' - ')[0];
                    const fechaB = b.label.split(' - ')[0];
                    return fechaA.localeCompare(fechaB);
                });
                
                // Limitar a 7 semanas más recientes
                const ultimas7 = todasLasSemanas.slice(-7);
                
                labels = ultimas7.map(s => s.label);
                valores = ultimas7.map(s => s.valor);
            }
            
            // Asegurar que tenemos exactamente 7 semanas
            if (labels.length > 7) {
                labels = labels.slice(-7);
                valores = valores.slice(-7);
            }

            ingresosChartInstance = new Chart(ctxIngresos, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Ingresos (Bs)',
                        data: valores,
                        borderColor: '#004e92',
                        backgroundColor: 'rgba(0, 78, 146, 0.15)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBackgroundColor: '#004e92',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointHoverBackgroundColor: '#00c6fb',
                        pointHoverBorderColor: '#004e92'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { 
                        legend: { 
                            display: false 
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            padding: 12,
                            titleFont: { size: 14, weight: 'bold' },
                            bodyFont: { size: 13 },
                            borderColor: '#004e92',
                            borderWidth: 1,
                            callbacks: {
                                label: function(context) {
                                    return 'Ingresos: Bs ' + new Intl.NumberFormat('es-BO').format(context.parsed.y);
                                }
                            }
                        }
                    },
                    scales: { 
                        y: { 
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return 'Bs ' + new Intl.NumberFormat('es-BO').format(value);
                                },
                                font: { size: 11 }
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.05)'
                            }
                        },
                        x: {
                            ticks: {
                                font: { size: 10 },
                                maxRotation: 45,
                                minRotation: 0
                            },
                            grid: {
                                display: false
                            }
                        }
                    },
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    }
                }
            });
        } else if (ctxIngresos) {
            // Si no hay datos, mostrar mensaje
            ctxIngresos.parentElement.innerHTML = '<div class="text-center text-muted p-4">No hay datos de ingresos disponibles</div>';
        }

        // B) Servicios (Dona)
        const ctxServicios = document.getElementById('serviciosChart');
        if (ctxServicios && Array.isArray(data.especialidad)) {
            if (serviciosChartInstance) serviciosChartInstance.destroy();

            serviciosChartInstance = new Chart(ctxServicios, {
                type: 'doughnut',
                data: {
                    labels: data.especialidad.map(item => item.ESPECIALIDAD),
                    datasets: [{
                        data: data.especialidad.map(item => item.CANTIDAD),
                        backgroundColor: ['#00c6fb', '#004e92', '#2ecc71', '#f1c40f', '#e74c3c'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { 
                        legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } } 
                    }
                }
            });
        }

    } catch (error) {
        console.error("⚠️ Error cargando gráficos:", error);
    }
}

// --- 3. TABLAS RESUMEN ---
async function loadTablasResumen() {
    // Citas de Hoy
    const tablaCitas = document.getElementById('tablaCitasHoy');
    if (tablaCitas) {
        tablaCitas.innerHTML = '<tr><td colspan="4" class="text-center"><div class="spinner-border spinner-border-sm text-primary"></div></td></tr>';
        try {
            const hoy = new Date().toISOString().split('T')[0];
            const res = await window.apiFetch(`citas?fecha=${hoy}&limit=5&t=${Date.now()}`);
            const data = await res.json();
            const citas = data.rows || [];
            
            if (citas.length === 0) {
                tablaCitas.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No hay citas para hoy</td></tr>';
            } else {
                tablaCitas.innerHTML = citas.map(c => `
                    <tr>
                        <td class="fw-bold text-primary">${c.HORA_INICIO}</td>
                        <td>${c.PACIENTE || c.NOMBRE_PACIENTE || 'N/A'}</td>
                        <td>${c.MEDICO || c.APELLIDO_MEDICO || 'N/A'}</td>
                        <td><span class="badge bg-${(c.ESTADO || '').toLowerCase() === 'atendida' ? 'success' : 'warning'}">${c.ESTADO || 'Pendiente'}</span></td>
                    </tr>
                `).join('');
            }
        } catch (e) { 
            tablaCitas.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error al cargar</td></tr>';
        }
    }

    // Stock Bajo - Verificar primero el KPI y luego cargar productos para consistencia
    const tablaStock = document.getElementById('tablaStockBajo');
    if (tablaStock) {
        tablaStock.innerHTML = '<tr><td colspan="4" class="text-center"><div class="spinner-border spinner-border-sm text-primary"></div></td></tr>';
        try {
            // Primero verificar el KPI para saber si hay stock bajo
            const kpiRes = await window.apiFetch(`reportes/dashboard?t=${Date.now()}`);
            const kpiData = await kpiRes.json();
            const stockBajoCount = Number(kpiData.stock_bajo || 0);
            
            if (stockBajoCount === 0) {
                // No hay stock bajo según el KPI
                tablaStock.innerHTML = '<tr><td colspan="4" class="text-center text-success"><i class="fas fa-check me-1"></i> Stock Saludable</td></tr>';
            } else {
                // Hay stock bajo, obtener los productos
                try {
                    const res = await window.apiFetch(`inventario/productos?limit=10&stock_bajo=true&estado=activo&t=${Date.now()}`);
                    const data = await res.json();
                    // El endpoint devuelve 'productos', no 'rows' o 'data'
                    const productos = data.productos || data.rows || data.data || [];

                    if (productos.length === 0) {
                        // El KPI dice que hay stock bajo pero no se obtuvieron productos
                        // Intentar con una consulta más amplia sin filtro de estado
                        const res2 = await window.apiFetch(`inventario/productos?limit=20&stock_bajo=true&t=${Date.now()}`);
                        const data2 = await res2.json();
                        const productos2 = data2.productos || data2.rows || data2.data || [];
                        
                        if (productos2.length > 0) {
                            tablaStock.innerHTML = productos2.slice(0, 10).map(p => {
                                const codigo = p.codigo_producto || p.CODIGO_PRODUCTO || p.CODIGO || 'S/C';
                                const nombre = p.nombre_producto || p.NOMBRE_PRODUCTO || p.NOMBRE || 'Sin nombre';
                                const stock = p.stock_actual || p.STOCK_ACTUAL || p.cantidad_actual || p.CANTIDAD_ACTUAL || p.stock || 0;
                                const vence = p.fecha_vencimiento || p.FECHA_VENCIMIENTO || p.VENCE || p.vence || null;
                                
                                return `
                                    <tr>
                                        <td><small>${codigo}</small></td>
                                        <td>${nombre}</td>
                                        <td class="text-danger fw-bold">${stock}</td>
                                        <td><small>${formatDate(vence)}</small></td>
                                    </tr>
                                `;
                            }).join('');
                        } else {
                            // Mostrar advertencia de inconsistencia
                            tablaStock.innerHTML = `<tr><td colspan="4" class="text-center text-warning"><i class="fas fa-exclamation-triangle me-1"></i> Se detectaron ${stockBajoCount} producto(s) con stock bajo, pero no se pudieron cargar los detalles</td></tr>`;
                        }
                    } else {
                        // Mostrar los productos con stock bajo
                        tablaStock.innerHTML = productos.map(p => {
                            const codigo = p.codigo_producto || p.CODIGO_PRODUCTO || p.CODIGO || 'S/C';
                            const nombre = p.nombre_producto || p.NOMBRE_PRODUCTO || p.NOMBRE || 'Sin nombre';
                            const stock = p.stock_actual || p.STOCK_ACTUAL || p.cantidad_actual || p.CANTIDAD_ACTUAL || p.stock || 0;
                            // Para fecha de vencimiento, necesitamos obtenerla del inventario
                            const vence = p.fecha_vencimiento || p.FECHA_VENCIMIENTO || p.VENCE || p.vence || null;
                            
                            return `
                                <tr>
                                    <td><small>${codigo}</small></td>
                                    <td>${nombre}</td>
                                    <td class="text-danger fw-bold">${stock}</td>
                                    <td><small>${formatDate(vence)}</small></td>
                                </tr>
                            `;
                        }).join('');
                    }
                } catch (productosError) {
                    console.error("Error obteniendo productos con stock bajo:", productosError);
                    // Mostrar advertencia con el conteo del KPI
                    tablaStock.innerHTML = `<tr><td colspan="4" class="text-center text-warning"><i class="fas fa-exclamation-triangle me-1"></i> Se detectaron ${stockBajoCount} producto(s) con stock bajo. Error al cargar detalles.</td></tr>`;
                }
            }
        } catch (e) {
            console.error("Error cargando stock bajo:", e);
            tablaStock.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error al cargar</td></tr>';
        }
    }
}

// --- UTILIDADES ---

function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (!obj) return;
    if (start === end) { obj.innerHTML = end; return; }
    
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = end;
        }
    };
    window.requestAnimationFrame(step);
}

function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const d = new Date(dateString);
        return isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
    } catch (e) { return '-'; }
}

// Exponer init globalmente
window.initDashboard = initDashboard;