// ==========================================
// FACTURACIÓN - FRONTEND BLINDADO
// ==========================================

const API_FACT = '/api/facturacion';
const API_PACIENTES = '/api/pacientes';
const API_PROD = '/api/inventario/productos';

let detallesFactura = [];
let productosCache = []; 

// 🔥 RETO: Variables globales para seguridad de sesión
let sesionCajaActiva = null;
let idUsuarioLogueado = null; 

function initFacturacionModule() {
    console.log('🚀 Init Facturación...');
    
    // 🔥 RETO: Extraer el ID del usuario logueado en cuanto carga el módulo
    try {
        const userData = JSON.parse(localStorage.getItem('usuario') || localStorage.getItem('user_data') || localStorage.getItem('user') || '{}');
        idUsuarioLogueado = userData.id_usuario || userData.id;
    } catch(e) {
        console.error("No se pudo obtener el usuario logueado", e);
    }

    // Clonar form para limpiar eventos viejos
    const form = document.getElementById('formFactura');
    if(form) {
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        newForm.addEventListener('submit', function(e) {
            e.preventDefault(); 
            guardarFactura();
        });
    }

    loadFacturas();
    loadPacientesCombo();
    loadProductosCombo();
    
    // Al cambiar método de pago, cargar la referencia secuencial en pantalla
    const selMetodo = document.getElementById('metodo_pago');
    if (selMetodo) {
        selMetodo.addEventListener('change', function() {
            loadSiguienteReferenciaEnPantalla(this.value);
            const m = (this.value || '').toUpperCase();
            const refObl = document.getElementById('refObligatorio');
            if (refObl) refObl.style.display = (m === 'QR' || m === 'TRANSFERENCIA') ? 'inline' : 'none';
            const refCampo = document.getElementById('referencia_pago');
            if (refCampo) refCampo.required = (m === 'QR' || m === 'TRANSFERENCIA');
        });
    }
    
    // Inicializar gestión de caja
    verificarRolCajero();
    cargarEstadoCaja();
    
    // Actualizar estado cada 30 segundos
    setInterval(cargarEstadoCaja, 30000);
}

// Carga la siguiente referencia de pago según el método y la muestra en el campo
async function loadSiguienteReferenciaEnPantalla(metodo) {
    const campo = document.getElementById('referencia_pago');
    if (!campo) return;
    const m = (metodo || 'EFECTIVO').trim();
    if (!m) {
        campo.value = '';
        campo.placeholder = 'Seleccione un método de pago';
        return;
    }
    campo.value = '';
    campo.placeholder = 'Cargando...';
    try {
        const res = await window.apiFetch(`${API_FACT}/facturas/siguiente-referencia?metodo=${encodeURIComponent(m)}`);
        const data = await res.json();
        if (res.ok && data.referencia_pago) {
            campo.value = data.referencia_pago;
            campo.placeholder = '';
        } else {
            campo.placeholder = 'Se genera al guardar';
        }
    } catch (e) {
        campo.placeholder = 'Se genera al guardar';
    }
}

// Fecha y hora actual para datetime-local (YYYY-MM-DDTHH:mm)
function getFechaHoraLocalParaInput() {
    const d = new Date();
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${mo}-${day}T${h}:${min}`;
}

async function loadFacturas(page = 1) {
    const tbody = document.querySelector('#tablaFacturas tbody');
    if(!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="11" class="text-center p-3">Cargando...</td></tr>';

    try {
        const params = new URLSearchParams({
            page, 
            limit: 10,
            search: document.getElementById('factSearch')?.value || '',
            estado: document.getElementById('factEstado')?.value || '', 
            t: Date.now()
        });

        const res = await window.apiFetch(`${API_FACT}/facturas?${params}`);
        if(!res.ok) throw new Error("Error API");
        const data = await res.json();
        
        renderTabla(data.facturas || []);
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="12" class="text-danger text-center">${e.message}</td></tr>`;
    }
}

// --- SOLUCIÓN UNDEFINED ---
function renderTabla(lista) {
    const tbody = document.querySelector('#tablaFacturas tbody');
    if(!lista.length) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted">No hay facturas.</td></tr>';
        return;
    }

    tbody.innerHTML = lista.map(f => {
        const id = f.id_factura || f.ID_FACTURA;
        let rawNum = f.numero_factura ?? f.NUMERO_FACTURA;
        const num = (rawNum != null && rawNum !== '' && String(rawNum).indexOf('undefined') === -1)
            ? rawNum
            : 'N/A';
        const fechaRaw = f.fecha_emision || f.FECHA_EMISION;
        const paciente = f.paciente_nombre || f.PACIENTE_NOMBRE || 'Cliente';
        const ci = f.paciente_ci || f.PACIENTE_CI || '';
        const sub = parseFloat(f.subtotal || f.SUBTOTAL || 0);
        const desc = parseFloat(f.descuento || f.DESCUENTO || 0);
        const iva = parseFloat(f.iva || f.IVA || 0);
        const total = parseFloat(f.total || f.TOTAL || 0);
        const metodo = f.metodo_pago || f.METODO_PAGO || '-';
        const refPago = f.referencia_pago || f.REFERENCIA_PAGO || '-';
        const estado = (f.estado || f.ESTADO || 'UNKNOWN').toUpperCase();

        let badge = 'bg-secondary';
        if(estado === 'PAGADA') badge = 'bg-success';
        if(estado === 'ANULADA') badge = 'bg-danger';
        if(estado === 'PENDIENTE') badge = 'bg-warning text-dark';
        
        const fechaStr = fechaRaw ? new Date(fechaRaw).toLocaleDateString() : '-';

        return `
            <tr>
                <td><strong>${num}</strong></td>
                <td>${fechaStr}</td>
                <td>${paciente}</td>
                <td>${ci}</td>
                <td class="text-end">Bs. ${sub.toFixed(2)}</td>
                <td class="text-end">Bs. ${desc.toFixed(2)}</td>
                <td class="text-end">Bs. ${iva.toFixed(2)}</td>
                <td class="text-end fw-bold">Bs. ${total.toFixed(2)}</td>
                <td>${metodo}</td>
                <td><small><code>${refPago}</code></small></td>
                <td class="text-center"><span class="badge ${badge}">${estado}</span></td>
                <td class="text-center">
                    <button class="btn btn-sm btn-secondary" onclick="imprimirFactura(${id})" title="Imprimir"><i class="fas fa-print"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="anularFactura(${id})" ${estado==='ANULADA'?'disabled':''} title="Anular"><i class="fas fa-ban"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

// IMPRESIÓN PROFESIONAL CON LOGO
async function imprimirFactura(id) {
    if(!id) return alert("ID inválido");
    try {
        const res = await window.apiFetch(`${API_FACT}/facturas/${id}`);
        const f = await res.json();
        
        // Mapeo seguro
        const num = f.numero || f.numero_factura || f.NUMERO_FACTURA || 'S/N';
        const fecha = f.fecha || f.fecha_emision || f.FECHA_EMISION;
        const pac = f.paciente || f.paciente_nombre || f.PACIENTE_NOMBRE || 'Cliente';
        const ci = f.ci || f.paciente_ci || f.PACIENTE_CI || '';
        const direccion = f.direccion || f.DIRECCION || '';
        const subtotal = parseFloat(f.subtotal || f.SUBTOTAL || 0);
        const descuento = parseFloat(f.descuento || f.DESCUENTO || 0);
        const iva = parseFloat(f.iva || f.IVA || 0);
        const tot = parseFloat(f.total || f.TOTAL || 0);
        const metodo = f.metodo || f.metodo_pago || f.METODO_PAGO || 'Efectivo';
        const refPago = f.referencia_pago || f.REFERENCIA_PAGO || '';
        const notas = f.notas || f.NOTAS || '';
        // 🔥 RETO: Extraer el nombre del cajero
        const cajeroNombre = f.usuario_cajero || f.USUARIO_CAJERO || f.cajero || f.CAJERO || 'Cajero de Turno';
        const dets = f.detalles || [];
        
        const fechaFormateada = fecha ? new Date(fecha).toLocaleString('es-BO', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        }) : new Date().toLocaleString('es-BO');

        const logoPath = '/assets/images/logo.png';
        
        const printWindow = window.open('', '_blank', 'width=800,height=900');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Factura ${num}</title>
                <meta charset="UTF-8">
                <style>
                    @media print {
                        @page { margin: 10mm; size: A4; }
                        body { margin: 0; }
                        .no-print { display: none; }
                    }
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'Arial', 'Helvetica', sans-serif;
                        font-size: 12px;
                        color: #333;
                        padding: 20px;
                        background: #fff;
                    }
                    .invoice-container {
                        max-width: 800px;
                        margin: 0 auto;
                        background: #fff;
                        border: 1px solid #ddd;
                        padding: 30px;
                    }
                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        border-bottom: 3px solid #0066cc;
                        padding-bottom: 20px;
                        margin-bottom: 30px;
                    }
                    .logo-section {
                        display: flex;
                        align-items: center;
                        gap: 15px;
                    }
                    .logo-section img {
                        max-width: 120px;
                        max-height: 120px;
                        object-fit: contain;
                    }
                    .company-info {
                        flex: 1;
                    }
                    .company-info h1 {
                        color: #0066cc;
                        font-size: 24px;
                        margin-bottom: 5px;
                        font-weight: bold;
                    }
                    .company-info p {
                        font-size: 11px;
                        color: #666;
                        line-height: 1.4;
                    }
                    .invoice-info {
                        text-align: right;
                    }
                    .invoice-info h2 {
                        color: #0066cc;
                        font-size: 20px;
                        margin-bottom: 10px;
                    }
                    .invoice-info .invoice-number {
                        font-size: 16px;
                        font-weight: bold;
                        color: #333;
                    }
                    .client-section {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 30px;
                        margin-bottom: 30px;
                        padding: 15px;
                        background: #f8f9fa;
                        border-radius: 5px;
                    }
                    .client-info h3, .invoice-details h3 {
                        color: #0066cc;
                        font-size: 14px;
                        margin-bottom: 10px;
                        border-bottom: 1px solid #ddd;
                        padding-bottom: 5px;
                    }
                    .client-info p, .invoice-details p {
                        margin: 5px 0;
                        font-size: 11px;
                    }
                    .details-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 20px 0;
                    }
                    .details-table thead {
                        background: #0066cc;
                        color: #fff;
                    }
                    .details-table th {
                        padding: 12px 8px;
                        text-align: left;
                        font-size: 11px;
                        font-weight: bold;
                    }
                    .details-table td {
                        padding: 10px 8px;
                        border-bottom: 1px solid #ddd;
                        font-size: 11px;
                    }
                    .details-table tbody tr:hover {
                        background: #f8f9fa;
                    }
                    .text-right { text-align: right; }
                    .text-center { text-align: center; }
                    .totals-section {
                        margin-top: 20px;
                        margin-left: auto;
                        width: 300px;
                    }
                    .totals-row {
                        display: flex;
                        justify-content: space-between;
                        padding: 8px 0;
                        border-bottom: 1px solid #eee;
                    }
                    .totals-row.total-final {
                        border-top: 2px solid #0066cc;
                        border-bottom: 2px solid #0066cc;
                        margin-top: 10px;
                        padding: 15px 0;
                        font-size: 16px;
                        font-weight: bold;
                        color: #0066cc;
                    }
                    .payment-info {
                        margin-top: 30px;
                        padding: 15px;
                        background: #f8f9fa;
                        border-radius: 5px;
                    }
                    .payment-info p {
                        margin: 5px 0;
                        font-size: 11px;
                    }
                    .footer {
                        margin-top: 40px;
                        padding-top: 20px;
                        border-top: 2px solid #ddd;
                        text-align: center;
                        font-size: 10px;
                        color: #666;
                    }
                    .notes {
                        margin-top: 20px;
                        padding: 10px;
                        background: #fff3cd;
                        border-left: 4px solid #ffc107;
                        font-size: 11px;
                    }
                </style>
            </head>
            <body>
                <div class="invoice-container">
                    <div class="header">
                        <div class="logo-section">
                            <img src="${logoPath}" alt="Logo" onerror="this.style.display='none'">
                            <div class="company-info">
                                <h1>CENTRO MÉDICO</h1>
                                <p>Iglesia Católica - Los Chacos</p>
                                <p>Dirección: Av. Principal, Los Chacos</p>
                                <p>Teléfono: (591) 123-4567 | Email: contacto@centromedico.bo</p>
                            </div>
                        </div>
                        <div class="invoice-info">
                            <h2>FACTURA</h2>
                            <div class="invoice-number">${num}</div>
                            <p style="margin-top: 10px; font-size: 11px;">Fecha: ${fechaFormateada}</p>
                        </div>
                    </div>
                    
                    <div class="client-section">
                        <div class="client-info">
                            <h3>DATOS DEL CLIENTE</h3>
                            <p><strong>Nombre:</strong> ${pac}</p>
                            <p><strong>CI/NIT:</strong> ${ci || 'N/A'}</p>
                            <p><strong>Dirección:</strong> ${direccion || 'N/A'}</p>
                        </div>
                        <div class="invoice-details">
                            <h3>INFORMACIÓN DE FACTURA</h3>
                            <p><strong>Método de Pago:</strong> ${metodo}</p>
                            ${refPago ? `<p><strong>Referencia de Pago:</strong> ${refPago}</p>` : ''}
                            <p><strong>Estado:</strong> ${f.estado || f.ESTADO || 'PAGADA'}</p>
                            <p><strong>Atendido por (Cajero):</strong> ${cajeroNombre}</p> <!-- 🔥 RETO LOGRADO -->
                        </div>
                    </div>
                    
                    <table class="details-table">
                        <thead>
                            <tr>
                                <th>Descripción</th>
                                <th class="text-center">Cantidad</th>
                                <th class="text-right">Precio Unit.</th>
                                <th class="text-right">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${dets.map(d => {
                                const desc = d.descripcion || d.DESCRIPCION_SERVICIO || 'Servicio';
                                const cant = d.cantidad || d.CANTIDAD || 1;
                                const precio = parseFloat(d.precio_unitario || d.PRECIO_UNITARIO || 0);
                                const subt = parseFloat(d.subtotal || d.SUBTOTAL || precio * cant);
                                return `<tr>
                                    <td>${desc}</td>
                                    <td class="text-center">${cant}</td>
                                    <td class="text-right">Bs. ${precio.toFixed(2)}</td>
                                    <td class="text-right">Bs. ${subt.toFixed(2)}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                    
                    <div class="totals-section">
                        <div class="totals-row">
                            <span>Subtotal:</span>
                            <span>Bs. ${subtotal.toFixed(2)}</span>
                        </div>
                        ${descuento > 0 ? `
                        <div class="totals-row">
                            <span>Descuento:</span>
                            <span>- Bs. ${descuento.toFixed(2)}</span>
                        </div>
                        ` : ''}
                        <div class="totals-row">
                            <span>IVA (13%):</span>
                            <span>Bs. ${iva.toFixed(2)}</span>
                        </div>
                        <div class="totals-row total-final">
                            <span>TOTAL:</span>
                            <span>Bs. ${tot.toFixed(2)}</span>
                        </div>
                    </div>
                    
                    ${notas ? `
                    <div class="notes">
                        <strong>Notas:</strong> ${notas}
                    </div>
                    ` : ''}
                    
                    <div class="footer">
                        <p><strong>Gracias por su preferencia</strong></p>
                        <p>Esta factura es un comprobante válido para efectos tributarios</p>
                        <p>Centro Médico - Sistema de Gestión Administrativa</p>
                    </div>
                </div>
                <script>
                    window.onload = function() {
                        setTimeout(() => window.print(), 500);
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    } catch(e) { 
        console.error('Error impresión:', e);
        alert('Error al generar la factura: ' + e.message); 
    }
}

async function solicitarAutorizacionSupervisor() {
    try {
        const res = await window.apiFetch('/api/usuarios?limit=500');
        const d = await res.json();
        const supervisores = (d.usuarios || d.pacientes || []).filter(u => {
            const r = (u.nombre_rol || u.NOMBRE_ROL || u.rol || '').toUpperCase();
            return /ADMIN|SUPERVISOR|GERENTE/.test(r);
        });
        if (!supervisores.length) {
            return prompt('Descuento >10% requiere autorización. Ingrese el ID del supervisor/autorizador:');
        }
        const opts = supervisores.map(u => {
            const id = u.id_usuario || u.ID_USUARIO;
            const nom = (u.nombres || u.NOMBRES || '') + ' ' + (u.apellido_paterno || u.APELLIDO_PATERNO || '');
            return `${id}: ${nom}`;
        }).join('\n');
        const sel = prompt('Descuento >10%. Seleccione supervisor (copie ID):\n\n' + opts);
        if (!sel) return null;
        const id = parseInt(sel.trim(), 10);
        return isNaN(id) ? null : id;
    } catch (e) { return null; }
}

async function enviarFacturaAPI(data, btn) {
    const res = await window.apiFetch(`${API_FACT}/facturas`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });
    const json = await res.json();
    if (res.ok) {
        const refMsg = json.referencia_pago ? ` Ref. de pago: ${json.referencia_pago}` : '';
        alert(`✅ Factura generada con éxito.${refMsg}`);
        bootstrap.Modal.getInstance(document.getElementById('modalFactura')).hide();
        loadFacturas(1);
        cargarEstadoCaja();
    } else if (json.requiere_supervisor) {
        alert('Se requiere autorización de supervisor. Intente nuevamente.');
    } else {
        alert('Error: ' + json.error);
    }
    if (btn) { btn.disabled = false; btn.innerHTML = 'Guardar Factura'; }
}

async function guardarFactura() {
    const id_paciente = document.getElementById('id_paciente').value;
    if(!id_paciente) return alert('Seleccione paciente');
    if(!detallesFactura.length) return alert('Agregue detalles');

    if (!sesionCajaActiva || !sesionCajaActiva.ID_SESION) {
        return alert('⚠️ Error: No hay una sesión de caja abierta. Por favor abra la caja antes de facturar.');
    }
    if (!idUsuarioLogueado) {
        return alert('⚠️ Error: No se pudo identificar su usuario. Cierre sesión y vuelva a ingresar.');
    }

    const pagoDividido = document.getElementById('pagoDividido')?.checked;
    let metodoPago = document.getElementById('metodo_pago').value;
    let pagosArr = null;
    if (pagoDividido && window.pagosDivididosLista && window.pagosDivididosLista.length >= 2) {
        const totalCalc = getTotalFacturaCalculado();
        const suma = window.pagosDivididosLista.reduce((s, p) => s + (p.monto || 0), 0);
        if (Math.abs(suma - totalCalc) > 0.01) {
            alert('La suma de los pagos debe coincidir con el total de la factura.');
            return;
        }
        pagosArr = window.pagosDivididosLista.filter(p => (p.monto || 0) > 0);
        if (pagosArr.length < 2) {
            alert('Para pago dividido agregue al menos 2 líneas con monto mayor a 0.');
            return;
        }
        const sinRef = pagosArr.filter(p => {
            const m = (p.metodo_pago || '').toUpperCase();
            return (m === 'QR' || m === 'TRANSFERENCIA') && !(p.referencia_pago || '').trim();
        });
        if (sinRef.length) {
            alert('Para pagos con QR o Transferencia debe ingresar la referencia/comprobante.');
            return;
        }
        metodoPago = 'MIXTO';
    }

    if (!pagoDividido) {
        const m = (document.getElementById('metodo_pago').value || '').toUpperCase();
        const ref = (document.getElementById('referencia_pago').value || '').trim();
        if ((m === 'QR' || m === 'TRANSFERENCIA') && !ref) {
            alert('Para QR o Transferencia debe ingresar el número de referencia o comprobante.');
            return;
        }
    }

    const data = {
        id_paciente: id_paciente,
        id_usuario_cajero: idUsuarioLogueado,
        id_sesion: sesionCajaActiva.ID_SESION,
        metodo_pago: metodoPago,
        descuento: document.getElementById('descuento').value,
        notas: document.getElementById('notas').value,
        estado: document.getElementById('estado').value,
        detalles: detallesFactura
    };
    if (!pagoDividido) {
        const ref = (document.getElementById('referencia_pago').value || '').trim();
        if (ref) data.referencia_pago = ref;
    }
    if (pagosArr && pagosArr.length) data.pagos = pagosArr;

    const btn = document.getElementById('btnGuardarFactura');
    btn.disabled = true;
    btn.innerHTML = 'Guardando...';

    try {
        const res = await window.apiFetch(`${API_FACT}/facturas`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        
        const json = await res.json();

        if(res.ok) {
            const refMsg = json.referencia_pago ? ` Ref. de pago: ${json.referencia_pago}` : '';
            alert(`✅ Factura generada con éxito.${refMsg}`);
            bootstrap.Modal.getInstance(document.getElementById('modalFactura')).hide();
            loadFacturas(1);
            cargarEstadoCaja();
        } else if (json.requiere_supervisor) {
            const idSup = await solicitarAutorizacionSupervisor();
            if (idSup) {
                data.id_supervisor_autorizador = idSup;
                await enviarFacturaAPI(data, btn);
                return;
            } else {
                alert('Se requiere autorización de supervisor para aplicar este descuento.');
            }
        } else {
            alert('Error: ' + json.error);
        }
    } catch(e) { alert('Error de conexión'); }
    finally { btn.disabled = false; btn.innerHTML = 'Guardar Factura'; }
}

// Auxiliares
async function loadPacientesCombo() {
    try {
        const res = await window.apiFetch(`${API_PACIENTES}?limit=1000&estado=activo`); 
        const data = await res.json();
        const lista = data.pacientes || [];
        const sel = document.getElementById('id_paciente');
        if(sel) {
            sel.innerHTML = '<option value="">Seleccione paciente...</option>' + 
                lista.map(p => {
                    const id = p.id_paciente || p.ID_PACIENTE;
                    const nom = p.nombres || p.NOMBRES;
                    const ape = (p.apellido_paterno || p.APELLIDO_PATERNO || '') + ' ' + (p.apellido_materno || p.APELLIDO_MATERNO || '');
                    return `<option value="${id}">${nom} ${ape}</option>`;
                }).join('');
            sel.onchange = function() { 
                cargarDatosPaciente(this.value);
                loadCitasPendientes(this.value); 
            };
        }
    } catch(e) {}
}

// Cargar datos del paciente seleccionado
async function cargarDatosPaciente(idPaciente) {
    if(!idPaciente) {
        const infoDiv = document.getElementById('infoPaciente');
        if(infoDiv) infoDiv.style.display = 'none';
        return;
    }
    
    try {
        const res = await window.apiFetch(`${API_PACIENTES}/${idPaciente}`);
        if(res.ok) {
            const paciente = await res.json();
            const infoDiv = document.getElementById('infoPaciente');
            const datosDiv = document.getElementById('datosPaciente');
            
            if(infoDiv && datosDiv) {
                const ci = paciente.ci || paciente.CI || 'N/A';
                const telefono = paciente.telefono || paciente.TELEFONO || 'N/A';
                const direccion = paciente.direccion || paciente.DIRECCION || 'N/A';
                
                datosDiv.innerHTML = `
                    <strong>CI:</strong> ${ci} | 
                    <strong>Teléfono:</strong> ${telefono}<br>
                    <strong>Dirección:</strong> ${direccion}
                `;
                infoDiv.style.display = 'block';
            }
        }
    } catch(e) {
        console.error('Error cargando datos del paciente:', e);
    }
}

async function loadProductosCombo() {
    try {
        const res = await window.apiFetch(`${API_PROD}?limit=1000&estado=activo`);
        const data = await res.json();
        productosCache = data.productos || []; 
        const sel = document.getElementById('selectProducto');
        if(sel) {
            sel.innerHTML = '<option value="">Agregar Producto...</option>' + 
                productosCache.map(p => {
                    const id = p.id_producto || p.ID_PRODUCTO;
                    const nom = p.nombre_producto || p.NOMBRE_PRODUCTO;
                    const pre = p.precio_venta || p.PRECIO_VENTA;
                    return `<option value="${id}">${nom} (Bs. ${pre})</option>`;
                }).join('');
            sel.onchange = function() { if(this.value) agregarProductoDetalle(this.value); this.value = ""; };
        }
    } catch(e) {}
}

async function loadCitasPendientes(id) {
    const sel = document.getElementById('selectCita');
    if(!id) { sel.innerHTML = '<option value="">...</option>'; return; }
    try {
        const res = await window.apiFetch(`${API_FACT}/pacientes/${id}/citas-pendientes`);
        const data = await res.json();
        const citas = data.citas || [];
        if(!citas.length) { sel.innerHTML = '<option>No hay citas pendientes</option>'; return; }
        sel.innerHTML = '<option value="">Seleccione cita...</option>' + 
            citas.map(c => `<option value="${c.ID_CITA}" data-cost="${c.COSTO_CONSULTA}" data-desc="Consulta: ${c.ESPECIALIDAD}">${c.FECHA_CITA.split('T')[0]} - ${c.ESPECIALIDAD} (Bs. ${c.COSTO_CONSULTA})</option>`).join('');
        sel.onchange = function() { if(this.value) agregarCitaDetalle(this); this.value=""; };
    } catch(e){}
}

function agregarCitaDetalle(sel) {
    const opt = sel.options[sel.selectedIndex];
    detallesFactura.push({ id_cita: sel.value, descripcion: opt.dataset.desc, cantidad: 1, precio_unitario: parseFloat(opt.dataset.cost), tipo: 'CITA' });
    renderDetalles();
}

function agregarProductoDetalle(id) {
    const prod = productosCache.find(p => (p.id_producto || p.ID_PRODUCTO) == id);
    if(!prod) return;
    const c = prompt('Cantidad:', 1);
    if(!c) return;
    detallesFactura.push({ id_producto: id, descripcion: prod.nombre_producto || prod.NOMBRE_PRODUCTO, cantidad: parseInt(c), precio_unitario: parseFloat(prod.precio_venta || prod.PRECIO_VENTA), tipo: 'PROD' });
    renderDetalles();
}

function agregarServicioPersonalizado() {
    const desc = document.getElementById('descripcionServicio').value;
    const pre = parseFloat(document.getElementById('precioServicio').value);
    if(!desc || !pre) return;
    detallesFactura.push({ descripcion: desc, cantidad: 1, precio_unitario: pre, tipo: 'SERV' });
    renderDetalles();
}

function renderDetalles() {
    const t = document.getElementById('tbodyDetalles');
    t.innerHTML = detallesFactura.map((d,i) => `<tr><td>${d.descripcion}</td><td class="text-center">${d.cantidad}</td><td class="text-end">${d.precio_unitario.toFixed(2)}</td><td class="text-end">${(d.cantidad*d.precio_unitario).toFixed(2)}</td><td class="text-center"><button class="btn btn-sm btn-danger" type="button" onclick="eliminarDetalle(${i})">X</button></td></tr>`).join('');
    calcularTotales();
}

function eliminarDetalle(i) { detallesFactura.splice(i,1); renderDetalles(); }

window.pagosDivididosLista = [];

function getTotalFacturaCalculado() {
    let s = 0;
    detallesFactura.forEach(d => s += d.cantidad * d.precio_unitario);
    const desc = parseFloat(document.getElementById('descuento')?.value || 0);
    const sub = Math.max(0, s - desc);
    return sub + sub * 0.13;
}

function togglePagosDivididos() {
    const chk = document.getElementById('pagoDividido');
    const panelSimple = document.getElementById('panelPagoSimple');
    const panelDivididos = document.getElementById('panelPagosDivididos');
    if (chk?.checked) {
        panelSimple.style.display = 'none';
        panelDivididos.style.display = 'block';
        if (window.pagosDivididosLista.length === 0) agregarLineaPago();
    } else {
        panelSimple.style.display = 'block';
        panelDivididos.style.display = 'none';
        window.pagosDivididosLista = [];
    }
    document.getElementById('metodo_pago').required = !chk?.checked;
    actualizarSumaPagosDivididos();
}

function agregarLineaPago() {
    const id = 'pago_' + Date.now();
    const div = document.createElement('div');
    div.className = 'row g-2 align-items-center mb-2';
    div.id = id;
    div.innerHTML = `
        <div class="col-md-4"><select class="form-control form-control-sm metodo-pago-linea"><option value="Efectivo">Efectivo</option><option value="QR">QR</option><option value="Transferencia">Transferencia</option><option value="Tarjeta">Tarjeta</option></select></div>
        <div class="col-md-3"><input type="number" class="form-control form-control-sm monto-pago-linea" step="0.01" min="0" placeholder="Monto"></div>
        <div class="col-md-4"><input type="text" class="form-control form-control-sm ref-pago-linea" placeholder="Ref./Comprobante (QR/TR)"></div>
        <div class="col-md-1"><button type="button" class="btn btn-sm btn-outline-danger" onclick="quitarLineaPago('${id}')"><i class="fas fa-times"></i></button></div>
    `;
    document.getElementById('listaPagosDivididos').appendChild(div);
    window.pagosDivididosLista.push({ metodo_pago: 'EFECTIVO', monto: 0, referencia_pago: '' });
    div.querySelector('.metodo-pago-linea').onchange = () => actualizarSumaPagosDivididos();
    div.querySelector('.monto-pago-linea').oninput = () => actualizarSumaPagosDivididos();
    div.querySelector('.ref-pago-linea').oninput = () => actualizarSumaPagosDivididos();
}

function quitarLineaPago(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
    actualizarSumaPagosDivididos();
}

function actualizarSumaPagosDivididos() {
    const lineas = document.querySelectorAll('#listaPagosDivididos .row');
    window.pagosDivididosLista = [];
    lineas.forEach((row, i) => {
        const met = row.querySelector('.metodo-pago-linea')?.value || 'EFECTIVO';
        const monto = parseFloat(row.querySelector('.monto-pago-linea')?.value || 0);
        const ref = row.querySelector('.ref-pago-linea')?.value || '';
        window.pagosDivididosLista.push({ metodo_pago: met, monto, referencia_pago: ref });
    });
    const suma = window.pagosDivididosLista.reduce((s, p) => s + p.monto, 0);
    const total = getTotalFacturaCalculado();
    const sumEl = document.getElementById('sumaPagosDivididos');
    const avisoEl = document.getElementById('avisoSumaPagos');
    if (sumEl) sumEl.textContent = 'Bs. ' + suma.toFixed(2);
    if (avisoEl) avisoEl.textContent = Math.abs(suma - total) > 0.01 ? ' (Debe coincidir con el total)' : '';
}

function calcularTotales() {
    let s = 0; 
    detallesFactura.forEach(d => s += d.cantidad * d.precio_unitario);
    const desc = parseFloat(document.getElementById('descuento').value || 0);
    const sub = Math.max(0, s - desc);
    const iva = sub * 0.13;
    const total = sub + iva;
    
    const subtotalEl = document.getElementById('calcSubtotal');
    const ivaEl = document.getElementById('calcIva');
    const totalEl = document.getElementById('calcTotal');
    
    if(subtotalEl) subtotalEl.textContent = 'Bs. ' + s.toFixed(2);
    if(ivaEl) ivaEl.textContent = 'Bs. ' + iva.toFixed(2);
    if(totalEl) totalEl.textContent = 'Bs. ' + total.toFixed(2);
    if (document.getElementById('pagoDividido')?.checked) actualizarSumaPagosDivididos();
}

async function anularFactura(id) {
    if(confirm('¿Anular?')) {
        await window.apiFetch(`${API_FACT}/facturas/${id}/anular`, { method: 'PUT' });
        loadFacturas();
    }
}

// ==================================================================
// GESTIÓN DE SESIONES DE CAJA
// ==================================================================

// Verificar rol del usuario
function verificarRolCajero() {
    try {
        const userData = JSON.parse(localStorage.getItem('usuario') || localStorage.getItem('user_data') || '{}');
        const rol = (userData.nombre_rol || userData.rol || '').toUpperCase();
        const esCajero = rol.includes('CAJERO') || rol.includes('ADMIN');
        
        // Mostrar/ocultar botones según rol
        const botones = ['btnAbrirCaja', 'btnCerrarCaja', 'btnReportes', 'btnNuevaFactura'];
        botones.forEach(id => {
            const btn = document.getElementById(id);
            if(btn) btn.style.display = esCajero ? 'inline-block' : 'none';
        });
        
        return esCajero;
    } catch(e) {
        console.error('Error verificando rol:', e);
        return false;
    }
}

// Cargar estado de sesión de caja
async function cargarEstadoCaja() {
    try {
        const res = await window.apiFetch(`${API_FACT}/caja/sesion-activa`);
        if(!res.ok) {
            sesionCajaActiva = null;
            actualizarUIEstadoCaja(null);
            return;
        }
        const data = await res.json();
        sesionCajaActiva = data.sesion;
        actualizarUIEstadoCaja(sesionCajaActiva);
    } catch(e) {
        console.error('Error cargando estado de caja:', e);
        sesionCajaActiva = null;
        actualizarUIEstadoCaja(null);
    }
}

function actualizarUIEstadoCaja(sesion) {
    const panel = document.getElementById('panelEstadoCaja');
    const info = document.getElementById('infoSesionCaja');
    
    if(sesion) {
        panel.style.display = 'block';
        const montoInicial = parseFloat(sesion.MONTO_INICIAL || 0);
        const fechaApertura = new Date(sesion.FECHA_APERTURA).toLocaleString('es-BO');
        info.innerHTML = `
            <strong>Sesión Abierta</strong> desde ${fechaApertura}<br>
            <small>Monto Inicial: Bs. ${montoInicial.toFixed(2)} | Cajero en turno: <span class="badge bg-primary">${sesion.CAJERO || 'Activo'}</span></small>
        `;
        document.getElementById('btnAbrirCaja').style.display = 'none';
        document.getElementById('btnCerrarCaja').style.display = 'inline-block';
        document.getElementById('btnNuevaFactura').style.display = 'inline-block';
    } else {
        panel.style.display = 'none';
        document.getElementById('btnAbrirCaja').style.display = 'inline-block';
        document.getElementById('btnCerrarCaja').style.display = 'none';
        document.getElementById('btnNuevaFactura').style.display = 'none';
    }
}

// Abrir sesión de caja
async function abrirSesionCaja() {
    if (!idUsuarioLogueado) return alert('No se pudo identificar tu usuario. Inicia sesión de nuevo.');

    const monto = prompt('Ingrese el monto inicial en caja (Bs.):', '0');
    if(monto === null) return;
    
    const montoNum = parseFloat(monto);
    if(isNaN(montoNum) || montoNum < 0) {
        alert('Monto inválido');
        return;
    }
    
    try {
        const res = await window.apiFetch(`${API_FACT}/caja/abrir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id_usuario: idUsuarioLogueado, // 🔥 RETO: Ahora sí usa el cajero real
                monto_inicial: montoNum
            })
        });
        
        const data = await res.json();
        if(res.ok) {
            alert('✅ Sesión de caja abierta correctamente por tu usuario.');
            await cargarEstadoCaja();
        } else {
            alert('❌ Error: ' + (data.error || 'No se pudo abrir la sesión'));
        }
    } catch(e) {
        alert('❌ Error de conexión: ' + e.message);
    }
}

// Mostrar modal para cerrar caja
async function mostrarModalCerrarCaja() {
    if(!sesionCajaActiva) {
        alert('No hay sesión de caja abierta');
        return;
    }
    
    const modal = new bootstrap.Modal(document.getElementById('modalCerrarCaja'));
    const resumenDiv = document.getElementById('resumenCierreCaja');
    
    // Cierre ciego: NO mostrar monto esperado. Solo instrucción para contar físicamente
    resumenDiv.innerHTML = `
        <div class="alert alert-secondary">
            <i class="fas fa-hand-holding-usd me-2"></i>
            <strong>Declaración a ciegas:</strong> Cuente el efectivo físico en la gaveta e ingrese el monto en el campo de arriba.
            <br><small class="text-muted">El sistema no mostrará cuánto debería haber; usted declara lo que contó.</small>
        </div>
    `;
    
    modal.show();
}

// Mostrar reporte profesional de Corte Z tras cerrar
function mostrarReporteCorteZ(data) {
    const r = data.reporte_corte_z || {};
    let canalesHtml = (r.canales || []).map(c => {
        let decl = c.declarado != null ? `Bs. ${Number(c.declarado).toFixed(2)}` : 'N/A';
        let diff = '';
        if (c.diferencia != null && c.diferencia !== 0) {
            const d = Number(c.diferencia);
            diff = `<span class="${d < 0 ? 'text-danger fw-bold' : 'text-success fw-bold'}">Bs. ${d.toFixed(2)}</span>`;
        } else if (c.declarado == null) diff = '<span class="text-muted">OK</span>';
        return `<tr><td>${c.concepto}</td><td class="text-end">Bs. ${Number(c.esperado || 0).toFixed(2)}</td><td class="text-end">${decl}</td><td class="text-end">${diff || '-'}</td></tr>`;
    }).join('');
    let resumenHtml = (r.resumen_operaciones || []).map(op => {
        const m = Number(op.monto || 0);
        const signo = m >= 0 ? '' : '';
        return `<tr><td>${op.concepto}</td><td class="text-end">${signo}Bs. ${Math.abs(m).toFixed(2)}</td></tr>`;
    }).join('');
    const totalVentas = Number(r.total_ventas || data.total_facturado || 0).toFixed(2);
    const dif = data.diferencia;
    const diffMsg = (dif !== undefined && dif !== 0) ? `<p class="mb-0"><strong>Diferencia en efectivo:</strong> <span class="${dif < 0 ? 'text-danger' : 'text-success'}">Bs. ${Number(dif).toFixed(2)} ${dif < 0 ? '(Faltante)' : '(Sobrante)'}</span></p>` : '';

    document.getElementById('contenidoReporteCorteZ').innerHTML = `
        <div class="alert alert-success"><strong>Caja cerrada correctamente.</strong> Monto declarado: Bs. ${Number(data.monto_final || 0).toFixed(2)}${diffMsg}</div>
        <table class="table table-bordered table-sm">
            <thead class="table-light"><tr><th>Concepto</th><th class="text-end">Esperado (Sistema)</th><th class="text-end">Declarado (Cajero)</th><th class="text-end">Diferencia</th></tr></thead>
            <tbody>${canalesHtml}</tbody>
        </table>
        <p class="mb-1"><strong>TOTAL VENTAS:</strong> Bs. ${totalVentas}</p>
        <h6 class="mt-3">Resumen de Operaciones</h6>
        <table class="table table-sm table-bordered"><tbody>${resumenHtml}</tbody></table>
    `;
    new bootstrap.Modal(document.getElementById('modalReporteCorteZ')).show();
}

// Cerrar sesión de caja
async function cerrarSesionCaja() {
    const montoFinal = document.getElementById('montoFinalCaja').value;
    if(!montoFinal || parseFloat(montoFinal) < 0) {
        alert('Ingrese un monto válido');
        return;
    }
    
    if(!confirm('¿Está seguro de cerrar la caja? No podrá facturar hasta abrir una nueva sesión.')) {
        return;
    }
    
    try {
        const res = await window.apiFetch(`${API_FACT}/caja/cerrar/${sesionCajaActiva.ID_SESION}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monto_final: parseFloat(montoFinal) })
        });
        
        const data = await res.json();
        if(res.ok) {
            bootstrap.Modal.getInstance(document.getElementById('modalCerrarCaja')).hide();
            mostrarReporteCorteZ(data);
            sesionCajaActiva = null;
            await cargarEstadoCaja();
        } else {
            alert('❌ Error: ' + (data.error || 'No se pudo cerrar la caja'));
        }
    } catch(e) {
        alert('❌ Error de conexión: ' + e.message);
    }
}

// ==================================================================
// INGRESOS Y EGRESOS DE CAJA CHICA
// ==================================================================

function mostrarModalMovimientoCaja(tipo) {
    if(!sesionCajaActiva) {
        alert('Debe abrir una sesión de caja primero');
        return;
    }
    
    const modal = new bootstrap.Modal(document.getElementById('modalMovimientoCaja'));
    const titulo = document.getElementById('tituloMovimientoCaja');
    const header = document.getElementById('headerMovimientoCaja');
    const tipoInput = document.getElementById('tipoMovimiento');
    const divCat = document.getElementById('divCategoriaEgreso');
    
    tipoInput.value = tipo;
    titulo.textContent = tipo === 'INGRESO' ? 'Registrar Ingreso' : 'Registrar Egreso';
    header.className = tipo === 'INGRESO' ? 'modal-header bg-success text-white' : 'modal-header bg-danger text-white';
    
    divCat.style.display = tipo === 'EGRESO' ? 'block' : 'none';
    document.getElementById('montoMovimiento').value = '';
    document.getElementById('categoriaMovimiento').value = '';
    document.getElementById('conceptoMovimiento').value = '';
    
    modal.show();
}

async function guardarMovimientoCaja() {
    const tipo = document.getElementById('tipoMovimiento').value;
    const monto = document.getElementById('montoMovimiento').value;
    let concepto = document.getElementById('conceptoMovimiento').value;
    const cat = document.getElementById('categoriaMovimiento').value;
    
    if(!monto || !concepto) {
        alert('Complete todos los campos');
        return;
    }
    
    if (tipo === 'EGRESO' && cat) {
        concepto = `[${cat}] ${concepto}`;
    }
    
    try {
        const res = await window.apiFetch(`${API_FACT}/caja/movimiento`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tipo: tipo,
                monto: parseFloat(monto),
                concepto: concepto
            })
        });
        
        const data = await res.json();
        if(res.ok) {
            alert(`✅ ${tipo} registrado correctamente`);
            bootstrap.Modal.getInstance(document.getElementById('modalMovimientoCaja')).hide();
            await cargarEstadoCaja();
        } else {
            alert('❌ Error: ' + (data.error || 'No se pudo registrar el movimiento'));
        }
    } catch(e) {
        alert('❌ Error de conexión: ' + e.message);
    }
}

// ==================================================================
// REPORTES
// ==================================================================

function mostrarReportes() {
    const modal = new bootstrap.Modal(document.getElementById('modalReportes'));
    document.getElementById('reporteFechaInicio').value = '';
    document.getElementById('reporteFechaFin').value = '';
    document.getElementById('contenidoReporte').innerHTML = '<p class="text-muted text-center">Seleccione un rango de fechas y haga clic en "Generar Reporte"</p>';
    modal.show();
}

async function cargarReporteIngresos() {
    const fechaInicio = document.getElementById('reporteFechaInicio').value;
    const fechaFin = document.getElementById('reporteFechaFin').value;
    const contenido = document.getElementById('contenidoReporte');
    
    contenido.innerHTML = '<div class="text-center"><div class="spinner-border"></div> Generando reporte...</div>';
    
    try {
        const params = new URLSearchParams();
        if(fechaInicio) params.append('fecha_inicio', fechaInicio);
        if(fechaFin) params.append('fecha_fin', fechaFin);
        
        const res = await window.apiFetch(`${API_FACT}/reportes/ingresos?${params}`);
        const data = await res.json();
        
        if(res.ok && data.reporte) {
            let html = `
                <div class="table-responsive">
                    <table class="table table-bordered">
                        <thead class="table-light">
                            <tr>
                                <th>Método de Pago</th>
                                <th class="text-end">Cantidad</th>
                                <th class="text-end">Total (Bs.)</th>
                                <th class="text-end">%</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            const totalGeneral = data.total_general || 0;
            data.reporte.forEach(row => {
                const metodo = row.METODO_PAGO || row.metodo_pago || 'N/A';
                const cantidad = row.CANTIDAD || row.cantidad || 0;
                const total = parseFloat(row.TOTAL_INGRESOS || row.total_ingresos || 0);
                const porcentaje = totalGeneral > 0 ? ((total / totalGeneral) * 100).toFixed(1) : '0.0';
                
                html += `
                    <tr>
                        <td><strong>${metodo}</strong></td>
                        <td class="text-end">${cantidad}</td>
                        <td class="text-end">Bs. ${total.toFixed(2)}</td>
                        <td class="text-end">${porcentaje}%</td>
                    </tr>
                `;
            });
            
            html += `
                        </tbody>
                        <tfoot class="table-light">
                            <tr>
                                <th>TOTAL GENERAL</th>
                                <th class="text-end">${data.reporte.reduce((sum, r) => sum + (r.CANTIDAD || 0), 0)}</th>
                                <th class="text-end">Bs. ${totalGeneral.toFixed(2)}</th>
                                <th class="text-end">100%</th>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            `;
            
            contenido.innerHTML = html;
        } else {
            contenido.innerHTML = '<p class="text-danger">Error al generar el reporte</p>';
        }
    } catch(e) {
        console.error('Error cargando reporte:', e);
        contenido.innerHTML = '<p class="text-danger">Error de conexión al generar el reporte</p>';
    }
}

// ==================================================================
// EXPORTAR FUNCIONES GLOBALES
// ==================================================================

window.initFacturacionModule = initFacturacionModule;
window.loadFacturas = loadFacturas;
window.openNewFactura = () => {
    document.getElementById('formFactura').reset();
    detallesFactura = [];
    window.pagosDivididosLista = [];
    const chk = document.getElementById('pagoDividido');
    if (chk) chk.checked = false;
    const ps = document.getElementById('panelPagoSimple');
    if (ps) ps.style.display = 'block';
    const pd = document.getElementById('panelPagosDivididos');
    if (pd) { pd.style.display = 'none'; const lista = pd.querySelector('#listaPagosDivididos'); if (lista) lista.innerHTML = ''; }
    const mp = document.getElementById('metodo_pago');
    if (mp) mp.required = true;
    renderDetalles();
    // Fecha de emisión: cargar automáticamente fecha y hora actual
    const fechaInput = document.getElementById('fecha_emision');
    if (fechaInput) {
        fechaInput.value = getFechaHoraLocalParaInput();
    }
    // Referencia de pago: se cargará al elegir método
    const refInput = document.getElementById('referencia_pago');
    if (refInput) {
        refInput.value = '';
        refInput.placeholder = 'Seleccione método de pago para ver la referencia';
    }
    const metodoSelect = document.getElementById('metodo_pago');
    if (metodoSelect && metodoSelect.value) {
        loadSiguienteReferenciaEnPantalla(metodoSelect.value);
    } else if (metodoSelect && metodoSelect.options.length > 1) {
        metodoSelect.selectedIndex = 1;
        loadSiguienteReferenciaEnPantalla(metodoSelect.value);
    }
    new bootstrap.Modal(document.getElementById('modalFactura')).show();
};
window.guardarFactura = guardarFactura;
window.agregarServicioPersonalizado = agregarServicioPersonalizado;
window.eliminarDetalle = eliminarDetalle;
window.calcularTotales = calcularTotales;
window.imprimirFactura = imprimirFactura;
window.anularFactura = anularFactura;
window.limpiarFiltrosFacturas = () => { document.getElementById('factSearch').value=''; loadFacturas(); };
window.abrirSesionCaja = abrirSesionCaja;
window.mostrarModalCerrarCaja = mostrarModalCerrarCaja;
window.cerrarSesionCaja = cerrarSesionCaja;
window.mostrarModalMovimientoCaja = mostrarModalMovimientoCaja;
window.guardarMovimientoCaja = guardarMovimientoCaja;
window.mostrarReportes = mostrarReportes;
window.cargarReporteIngresos = cargarReporteIngresos;
window.cargarDatosPaciente = cargarDatosPaciente;
window.togglePagosDivididos = togglePagosDivididos;
window.agregarLineaPago = agregarLineaPago;
window.quitarLineaPago = quitarLineaPago;