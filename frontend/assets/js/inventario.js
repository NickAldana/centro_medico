// ==========================================
// GESTIÓN DE INVENTARIO - FRONTEND FIXED FINAL
// Ubicación: assets/js/inventario.js
// ==========================================

const INV_API = '/api/inventario';
let currentPageInv = 1;
const currentLimitInv = 10;

// 1. INICIALIZACIÓN
function initInventarioModule() {
    console.log('🚀 Init Inventario...');
    
    // Configurar formularios para NO recargar página
    setupForm('formProducto', guardarProducto);
    setupForm('formAgregarLote', guardarLote);
    setupForm('formMovimiento', guardarMovimiento);

    // Búsqueda
    const search = document.getElementById('invSearch');
    if(search) {
        search.addEventListener('keypress', (e) => {
            if(e.key === 'Enter') { currentPageInv = 1; loadProductos(); }
        });
    }

    // Cargar combos, alerta por vencer y tabla inicial
    loadCategorias().then(() => loadProductos());
    loadProductosCombo();
    loadAlertaPorVencer();
}

// HU004: Alertar productos por vencer (30 días)
async function loadAlertaPorVencer() {
    try {
        const res = await window.apiFetch(`${INV_API}/productos-por-vencer?dias=30`);
        if (!res.ok) return;
        const data = await res.json();
        const lista = data.productos || [];
        const alertEl = document.getElementById('alertaPorVencer');
        const countEl = document.getElementById('countPorVencer');
        if (alertEl && countEl) {
            countEl.textContent = lista.length;
            if (lista.length > 0) {
                alertEl.classList.remove('d-none');
            } else {
                alertEl.classList.add('d-none');
            }
        }
    } catch (e) { console.warn('Alerta por vencer:', e); }
}

function setupForm(id, handler) {
    const form = document.getElementById(id);
    if(form) {
        form.removeEventListener('submit', handler); 
        form.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            await handler();
        });
    }
}

// 2. CARGAR TABLA PRINCIPAL
async function loadProductos(page = 1) {
    currentPageInv = page;
    const tbody = document.querySelector('#tablaInventario tbody');
    if(!tbody) return;

    tbody.innerHTML = '<tr><td colspan="10" class="text-center p-3"><div class="spinner-border text-primary"></div> Cargando...</td></tr>';

    try {
        const params = new URLSearchParams({
            page: currentPageInv,
            limit: currentLimitInv,
            search: document.getElementById('invSearch')?.value || '',
            id_categoria: document.getElementById('invCategoria')?.value || '',
            stock_bajo: document.getElementById('invBajoStock')?.checked || false,
            t: Date.now() 
        });

        const res = await window.apiFetch(`${INV_API}/productos?${params}`);
        if(!res.ok) throw new Error('Error de red');
        const data = await res.json();

        renderTablaProductos(data.productos || []);
        renderPaginacionInv(data.pagination);

    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="10" class="text-center text-danger">${e.message}</td></tr>`;
    }
}

function renderTablaProductos(lista) {
    const tbody = document.querySelector('#tablaInventario tbody');
    if(lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">Sin resultados.</td></tr>';
        return;
    }

    tbody.innerHTML = lista.map(p => {
        const stock = p.stock_actual || 0;
        const min = p.stock_minimo || 0;
        const color = stock <= min ? 'text-danger fw-bold' : 'text-success';
        
        return `
            <tr>
                <td>${p.codigo_producto}</td>
                <td>${p.nombre_producto}</td>
                <td>${p.nombre_categoria || '-'}</td>
                <td>${p.laboratorio || '-'}</td>
                <td class="text-center ${color}">${stock}</td>
                <td class="text-center">${min}</td>
                <td class="text-end">Bs. ${p.precio_compra}</td>
                <td class="text-end">Bs. ${p.precio_venta}</td>
                <td class="text-center"><span class="badge bg-secondary">${p.estado}</span></td>
                <td class="text-center">
                    <button class="btn btn-sm btn-info" onclick="editarProducto(${p.id_producto})" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-warning" onclick="gestionarLotes(${p.id_producto})" title="Lotes"><i class="fas fa-boxes"></i></button>
                    <button class="btn btn-sm btn-secondary" onclick="verKardex(${p.id_producto})" title="Kardex"><i class="fas fa-history"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderPaginacionInv(p) {
    const div = document.getElementById('inventarioPaginacion');
    if(!div || !p) return;
    div.innerHTML = `
        <div class="d-flex justify-content-between w-100 mt-2">
            <span class="text-muted small">Total: ${p.total}</span>
            <div>
                <button class="btn btn-sm btn-light" onclick="loadProductos(${p.page-1})" ${p.page<=1?'disabled':''}>«</button>
                <span class="mx-2">${p.page} / ${p.totalPages}</span>
                <button class="btn btn-sm btn-light" onclick="loadProductos(${p.page+1})" ${p.page>=p.totalPages?'disabled':''}>»</button>
            </div>
        </div>
    `;
}

// 3. COMBOS 
async function loadCategorias() {
    try {
        const res = await window.apiFetch(`${INV_API}/categorias?t=${Date.now()}`);
        const data = await res.json();
        const cats = data.categorias || [];
        
        const filter = document.getElementById('invCategoria');
        if(filter) {
            filter.innerHTML = '<option value="">Todas</option>' + 
                cats.map(c => `<option value="${c.ID_CATEGORIA}">${c.NOMBRE_CATEGORIA}</option>`).join('');
        }

        const modalSel = document.getElementById('id_categoria');
        if(modalSel) {
            modalSel.innerHTML = '<option value="">Seleccione...</option>' + 
                cats.map(c => `<option value="${c.ID_CATEGORIA}">${c.NOMBRE_CATEGORIA}</option>`).join('');
        }
    } catch(e) { console.error('Error cats:', e); }
}

async function loadProductosCombo() {
    try {
        const res = await window.apiFetch(`${INV_API}/productos?limit=1000&estado=activo`);
        const data = await res.json();
        const prods = data.productos || [];
        
        const sel = document.getElementById('id_producto_mov');
        if(sel) {
            sel.innerHTML = '<option value="">Seleccione producto...</option>' + 
                prods.map(p => `<option value="${p.id_producto}">${p.codigo_producto} - ${p.nombre_producto}</option>`).join('');
            
            sel.onchange = function() { loadLotesParaMovimiento(this.value); };
        }
    } catch(e) { console.error('Error combo prods:', e); }
}

// 4. CREAR / EDITAR PRODUCTO (VALIDADO)
function openNewProducto() {
    const f = document.getElementById('formProducto');
    if(f) {
        f.reset();
        document.getElementById('id_producto').value = ''; 
        new bootstrap.Modal(document.getElementById('modalProducto')).show();
    }
}

// HU004: Ver Kardex (historial entrada/salida)
window.verKardex = async function(idProducto) {
    const body = document.getElementById('kardexBody');
    const modal = document.getElementById('modalKardex');
    if (!body || !modal) return;
    body.innerHTML = '<div class="text-center py-4 text-muted"><div class="spinner-border"></div><br>Cargando...</div>';
    new bootstrap.Modal(modal).show();
    try {
        const res = await window.apiFetch(`${INV_API}/productos/${idProducto}/kardex?t=${Date.now()}`);
        const data = await res.json();
        const kardex = data.kardex || [];
        if (kardex.length === 0) {
            body.innerHTML = '<p class="text-center text-muted">No hay movimientos registrados para este producto.</p>';
            return;
        }
        body.innerHTML = `
            <table class="table table-sm table-hover">
                <thead><tr>
                    <th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Lote</th><th>Vencimiento</th><th>Motivo</th><th>Costo Unit.</th>
                </tr></thead>
                <tbody>
                    ${kardex.map(m => `
                        <tr>
                            <td>${m.fecha || '-'}</td>
                            <td><span class="badge ${m.tipo === 'ENTRADA' ? 'bg-success' : 'bg-warning text-dark'}">${m.tipo}</span></td>
                            <td>${m.cantidad}</td>
                            <td>${m.lote || '-'}</td>
                            <td>${m.fecha_vencimiento || '-'}</td>
                            <td>${m.motivo || '-'}</td>
                            <td>${m.costo_unitario != null ? 'Bs. ' + m.costo_unitario : '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (e) {
        body.innerHTML = '<p class="text-center text-danger">Error al cargar el Kardex.</p>';
    }
};

async function editarProducto(id) {
    try {
        const res = await window.apiFetch(`${INV_API}/productos/${id}?t=${Date.now()}`);
        const p = await res.json();
        
        const setVal = (k, v) => { const el = document.getElementById(k); if(el) el.value = v; };
        
        setVal('id_producto', p.id_producto);
        setVal('codigo_producto', p.codigo_producto);
        setVal('nombre_producto', p.nombre_producto);
        setVal('id_categoria', p.id_categoria);
        setVal('laboratorio', p.laboratorio);
        setVal('descripcion', p.descripcion);
        setVal('principio_activo', p.principio_activo);
        setVal('concentracion', p.concentracion);
        setVal('presentacion', p.presentacion);
        setVal('unidad_medida', p.unidad_medida);
        setVal('stock_minimo', p.stock_minimo);
        setVal('stock_maximo', p.stock_maximo);
        setVal('precio_compra', p.precio_compra);
        setVal('precio_venta', p.precio_venta);
        
        const reqReceta = document.getElementById('requiere_receta');
        if(reqReceta) reqReceta.value = p.requiere_receta ? '1' : '0';

        new bootstrap.Modal(document.getElementById('modalProducto')).show();

    } catch(e) { alert('Error al cargar datos: ' + e.message); }
}

async function guardarProducto() {
    const form = document.getElementById('formProducto');
    const id = document.getElementById('id_producto').value;
    const url = id ? `${INV_API}/productos/${id}` : `${INV_API}/productos`;
    const method = id ? 'PUT' : 'POST';

    // VALIDACIÓN MANUAL PREVIA
    const data = {};
    new FormData(form).forEach((value, key) => data[key] = value);
    
    // Asegurar números
    data.stock_minimo = parseInt(data.stock_minimo) || 0;
    data.stock_maximo = parseInt(data.stock_maximo) || 0;
    data.precio_compra = parseFloat(data.precio_compra) || 0;
    data.precio_venta = parseFloat(data.precio_venta) || 0;
    data.requiere_receta = data.requiere_receta === '1';

    try {
        const res = await window.apiFetch(url, {
            method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        
        if(res.ok) {
            alert('Producto guardado');
            bootstrap.Modal.getInstance(document.getElementById('modalProducto')).hide();
            loadProductos(currentPageInv);
            loadProductosCombo(); 
        } else {
            const err = await res.json();
            alert('Error: ' + err.error);
        }
    } catch(e) { alert('Error de red'); }
}

// 5. GESTIÓN DE LOTES (FIXED)
async function gestionarLotes(idProducto) {
    document.getElementById('id_producto_inventario').value = idProducto;
    const row = await window.apiFetch(`${INV_API}/productos/${idProducto}`);
    const data = await row.json();
    document.getElementById('nombreProductoInventario').innerText = data.nombre_producto;
    
    renderTablaLotes(data.lotes || []);
    new bootstrap.Modal(document.getElementById('modalInventario')).show();
}

function renderTablaLotes(lotes) {
    const tbody = document.getElementById('tablaLotes');
    if(!lotes.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No hay lotes registrados.</td></tr>';
        return;
    }
    tbody.innerHTML = lotes.map(l => `
        <tr>
            <td>${l.lote}</td>
            <td class="fw-bold">${l.cantidad}</td>
            <td>${l.vence}</td>
            <td>${l.ubicacion || '-'}</td>
            <td><span class="badge bg-success">Activo</span></td>
        </tr>
    `).join('');
}

async function guardarLote() {
    const idProd = document.getElementById('id_producto_inventario').value;
    
    // VALIDACIÓN PREVIA EN FRONTEND
    const cantidad = parseInt(document.getElementById('cantidad_actual').value);
    const costo = parseFloat(document.getElementById('costo_unitario').value);
    
    if (isNaN(cantidad) || cantidad <= 0) {
        alert("La cantidad debe ser un número mayor a 0");
        return;
    }

    const data = {
        id_producto: parseInt(idProd),
        lote: document.getElementById('lote').value,
        fecha_vencimiento: document.getElementById('fecha_vencimiento').value,
        cantidad_actual: cantidad,
        ubicacion_almacen: document.getElementById('ubicacion_almacen').value,
        costo_unitario: isNaN(costo) ? 0 : costo
    };

    try {
        const res = await window.apiFetch(`${INV_API}/inventario`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        
        if(res.ok) {
            alert('Lote agregado');
            document.getElementById('formAgregarLote').reset();
            const row = await window.apiFetch(`${INV_API}/productos/${idProd}?t=${Date.now()}`);
            const newData = await row.json();
            renderTablaLotes(newData.lotes || []);
            loadProductos(currentPageInv); 
        } else {
            const err = await res.json();
            alert('Error: ' + err.error);
        }
    } catch(e) { alert('Error al guardar lote'); }
}

// 6. MOVIMIENTOS
function openMovimientoInventario() {
    document.getElementById('formMovimiento').reset();
    document.getElementById('id_inventario_mov').innerHTML = '<option value="">Primero seleccione producto</option>';
    new bootstrap.Modal(document.getElementById('modalMovimiento')).show();
}

async function loadLotesParaMovimiento(idProducto) {
    const selLote = document.getElementById('id_inventario_mov');
    selLote.innerHTML = '<option>Cargando...</option>';
    
    if(!idProducto) { selLote.innerHTML = '<option value="">Seleccione producto</option>'; return; }

    try {
        const res = await window.apiFetch(`${INV_API}/productos/${idProducto}?t=${Date.now()}`);
        const data = await res.json();
        const lotes = data.lotes || [];
        
        if(!lotes.length) {
            selLote.innerHTML = '<option value="">Sin lotes disponibles</option>';
            return;
        }

        selLote.innerHTML = lotes.map(l => 
            `<option value="${l.id_inventario}">Lote: ${l.lote} | Stock: ${l.cantidad} | Vence: ${l.vence}</option>`
        ).join('');
    } catch(e) { console.error(e); }
}

async function guardarMovimiento() {
    const data = {
        id_inventario: document.getElementById('id_inventario_mov').value,
        tipo_movimiento: document.getElementById('tipo_movimiento').value,
        cantidad: document.getElementById('cantidad_mov').value,
        costo_unitario: document.getElementById('costo_unitario_mov').value,
        motivo: document.getElementById('motivo_mov').value,
        documento_referencia: document.getElementById('documento_referencia').value
    };

    if(!data.id_inventario) { alert('Seleccione un lote'); return; }

    try {
        const res = await window.apiFetch(`${INV_API}/movimientos`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        
        if(res.ok) {
            alert('Movimiento registrado');
            bootstrap.Modal.getInstance(document.getElementById('modalMovimiento')).hide();
            loadProductos(currentPageInv);
        } else {
            const err = await res.json();
            alert('Error: ' + err.error);
        }
    } catch(e) { alert('Error de red'); }
}

// Globales
window.initInventarioModule = initInventarioModule;
window.loadProductos = loadProductos;
window.openNewProducto = openNewProducto;
window.editarProducto = editarProducto;
window.gestionarLotes = gestionarLotes;
window.openMovimientoInventario = openMovimientoInventario;
window.limpiarFiltrosInventario = () => {
    document.getElementById('invSearch').value = '';
    document.getElementById('invCategoria').value = '';
    loadProductos();
};