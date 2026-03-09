const { validationResult } = require('express-validator');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const oracledb = require('oracledb');

const database = require('../utils'); 

// ==================================================================
// 🛠️ HELPERS
// ==================================================================

function safeToString(v) {
    if (v === null || v === undefined) return '';
    return String(v).trim();
}

const formatearFechaParaFrontend = (dateObj) => {
    if (!dateObj) return null;
    const d = new Date(dateObj);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
};

const limpiarFechaParaOracle = (dateString) => {
    if (!dateString || typeof dateString !== 'string' || dateString.trim() === '') return null;
    return dateString.split('T')[0];
};

// ==================================================================
// 1. OBTENER TODOS (GET /) - BLINDADO CON NVL Y TRIM
// ==================================================================
exports.getPacientes = async (req, res) => {
    let conn;
    try {
        // Headers Anti-Caché
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        
        conn = await database.getConnection();
        
        const pagina = parseInt(req.query.page) || 1;
        const limite = parseInt(req.query.limit) || 10;
        const busquedaRaw = String(req.query.search || '').trim();
        
        // 🔥 FIX DEFINITIVO: Captura exacta y estricta del parámetro
        const estadoReq = String(req.query.estado || 'ACTIVO').toUpperCase().trim(); 
        let estadoFiltro = 'ACTIVO'; // Valor por defecto seguro

        if (estadoReq === 'INACTIVO' || estadoReq === 'INACTIVOS') {
            estadoFiltro = 'INACTIVO';
        } else if (estadoReq === 'TODOS') {
            estadoFiltro = 'TODOS';
        }

        console.log(`Buscando -> Pag: ${pagina} | Filtro: "${busquedaRaw}" | Estado Exacto: [${estadoFiltro}]`);

        const offset = (pagina - 1) * limite;
        const whereParts = [];
        const binds = {};

        // 1. Filtro por Estado (Manejo de nulos y espacios ocultos en la BD)
        if (estadoFiltro === 'TODOS') {
            whereParts.push("UPPER(TRIM(NVL(p.ESTADO, 'ACTIVO'))) != 'ELIMINADO'");
        } else {
            whereParts.push("UPPER(TRIM(NVL(p.ESTADO, 'ACTIVO'))) = :estado");
            binds.estado = estadoFiltro;
        }

        // 2. Filtro de Búsqueda (Texto) - HU002: incluir CI, nombre y teléfono
        if (busquedaRaw) {
            binds.searchRaw = `%${busquedaRaw.toUpperCase()}%`;
            whereParts.push(`(
                UPPER(p.NOMBRES) LIKE :searchRaw OR 
                UPPER(p.APELLIDO_PATERNO) LIKE :searchRaw OR 
                UPPER(NVL(p.APELLIDO_MATERNO, ' ')) LIKE :searchRaw OR
                UPPER(p.CI) LIKE :searchRaw OR
                UPPER(p.NOMBRES || ' ' || p.APELLIDO_PATERNO) LIKE :searchRaw OR
                UPPER(NVL(p.CELULAR, ' ')) LIKE :searchRaw OR
                UPPER(NVL(p.TELEFONO, ' ')) LIKE :searchRaw
            )`);
        }

        const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

        // Query Total
        const countSql = `SELECT COUNT(*) AS TOTAL FROM PACIENTES p ${whereClause}`;
        const resultCount = await conn.execute(countSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const total = resultCount.rows[0]?.TOTAL || 0;

        // Query Datos
        binds.offset = offset;
        binds.limit = limite;

        const dataSql = `
            SELECT p.ID_PACIENTE, p.NOMBRES, p.APELLIDO_PATERNO, p.APELLIDO_MATERNO,
                   p.CI, p.CELULAR, p.TELEFONO, p.FECHA_NACIMIENTO, p.EDAD, 
                   TRIM(NVL(p.ESTADO, 'ACTIVO')) AS ESTADO,
                   (p.NOMBRES || ' ' || p.APELLIDO_PATERNO || ' ' || NVL(p.APELLIDO_MATERNO, '')) AS NOMBRE_COMPLETO,
                   (SELECT MAX(FECHA_CITA) FROM CITAS c WHERE c.ID_PACIENTE = p.ID_PACIENTE) AS ULTIMA_CITA
            FROM PACIENTES p
            ${whereClause}
            ORDER BY p.ID_PACIENTE DESC
            OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
        `;

        const resultData = await conn.execute(dataSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const pacientes = resultData.rows.map(row => {
            const p = {};
            Object.keys(row).forEach(key => p[key.toLowerCase()] = row[key]);
            
            return {
                ...p,
                nombre_completo: row.NOMBRE_COMPLETO || `${row.NOMBRES} ${row.APELLIDO_PATERNO}`,
                fecha_nacimiento: formatearFechaParaFrontend(row.FECHA_NACIMIENTO),
                ultima_cita: formatearFechaParaFrontend(row.ULTIMA_CITA),
                estado: row.ESTADO // Ya viene limpio del TRIM(NVL(...))
            };
        });

        res.json({
            pacientes,
            pagination: {
                page: pagina,
                limit: limite,
                total: total,
                totalPages: Math.ceil(total / limite)
            }
        });

    } catch (error) {
        console.error('❌ Error CRÍTICO en getPacientes:', error);
        res.status(500).json({ error: 'Error interno al listar pacientes.' });
    } finally {
        if (conn) { try { await conn.close(); } catch (e) {} }
    }
};

// ==================================================================
// 2. OBTENER UNO (GET /:id)
// ==================================================================
exports.getPacienteById = async (req, res) => {
    let conn;
    try {
        res.setHeader('Cache-Control', 'no-store');
        conn = await database.getConnection(); 
        const id = req.params.id;
        
        const result = await conn.execute(
            `SELECT * FROM PACIENTES WHERE ID_PACIENTE = :id`, 
            [id], 
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });

        const row = result.rows[0];
        const paciente = {};
        Object.keys(row).forEach(key => paciente[key.toLowerCase()] = row[key]);
        
        paciente.fecha_nacimiento = formatearFechaParaFrontend(row.FECHA_NACIMIENTO);
        
        res.json(paciente);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener paciente' });
    } finally {
        if (conn) await conn.close();
    }
};

// ==================================================================
// 3. CREAR (POST /)
// ==================================================================
exports.createPaciente = async (req, res) => {
    let conn;
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

        conn = await database.getConnection(); 
        const body = req.body;

        // Validar CI único (No eliminados)
        const checkSql = "SELECT COUNT(*) as TOTAL FROM PACIENTES WHERE CI = :ci AND UPPER(ESTADO) != 'ELIMINADO'";
        const checkRes = await conn.execute(checkSql, { ci: body.ci }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        if (checkRes.rows[0].TOTAL > 0) {
            return res.status(400).json({ error: `El CI ${body.ci} ya existe en el sistema.` });
        }

        const fechaNacStr = limpiarFechaParaOracle(body.fecha_nacimiento);
        let edad = 0;
        if (fechaNacStr) {
            const birth = new Date(fechaNacStr);
            const now = new Date();
            edad = now.getFullYear() - birth.getFullYear();
            if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
                edad--;
            }
            if (edad < 0) edad = 0;
        }

        const insertSql = `
            INSERT INTO PACIENTES (
                NOMBRES, APELLIDO_PATERNO, APELLIDO_MATERNO, CI, 
                FECHA_NACIMIENTO, EDAD, GENERO,
                CELULAR, TELEFONO, EMAIL, DIRECCION,
                ESTADO_CIVIL, OCUPACION,
                NOMBRE_CONTACTO_EMERGENCIA, TELEFONO_CONTACTO_EMERGENCIA,
                TIPO_SANGRE, ALERGIAS, ANTECEDENTES_MEDICOS, MEDICAMENTOS_ACTUALES,
                SEGURO_MEDICO, NUMERO_SEGURO,
                ESTADO
            ) VALUES (
                :nombres, :ap_pat, :ap_mat, :ci,
                TO_DATE(:f_nac, 'YYYY-MM-DD'), :edad, :genero,
                :cel, :tel, :email, :dir,
                :ecivil, :ocup,
                :nom_emerg, :tel_emerg,
                :sangre, :alergias, :antecedentes, :medicamentos,
                :seguro, :nro_seguro,
                'ACTIVO'
            )
        `;

        const binds = {
            nombres: body.nombres,
            ap_pat: body.apellido_paterno,
            ap_mat: body.apellido_materno || '',
            ci: body.ci,
            f_nac: fechaNacStr,
            edad: edad,
            genero: body.genero || 'M',
            cel: body.celular || '',
            tel: body.telefono || '',
            email: body.email || '',
            dir: body.direccion || '',
            ecivil: body.estado_civil || '',
            ocup: body.ocupacion || '',
            nom_emerg: body.nombre_contacto_emergencia || '',
            tel_emerg: body.telefono_contacto_emergencia || '',
            sangre: body.tipo_sangre || '',
            alergias: body.alergias || '',
            antecedentes: body.antecedentes_medicos || '',
            medicamentos: body.medicamentos_actuales || '',
            seguro: body.seguro_medico || '',
            nro_seguro: body.numero_seguro || ''
        };

        await conn.execute(insertSql, binds, { autoCommit: true });
        res.status(201).json({ message: 'Paciente registrado exitosamente' });

    } catch (error) {
        console.error('Error Create Paciente:', error);
        res.status(500).json({ error: 'Error al registrar: ' + error.message });
    } finally {
        if (conn) await conn.close();
    }
};

// ==================================================================
// 4. ACTUALIZAR (PUT /:id)
// ==================================================================
exports.updatePaciente = async (req, res) => {
    let conn;
    try {
        const id = req.params.id;
        const body = req.body;
        conn = await database.getConnection(); 

        const check = await conn.execute("SELECT ID_PACIENTE FROM PACIENTES WHERE ID_PACIENTE = :id", [id]);
        if (check.rows.length === 0) return res.status(404).json({ error: 'Paciente no encontrado' });

        const fechaNacStr = limpiarFechaParaOracle(body.fecha_nacimiento);
        
        let edad = body.edad; 
        if (fechaNacStr) {
            const birth = new Date(fechaNacStr);
            const now = new Date();
            edad = now.getFullYear() - birth.getFullYear();
            if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
                edad--;
            }
        }

        const updateSql = `
            UPDATE PACIENTES SET
                NOMBRES = :nombres,
                APELLIDO_PATERNO = :ap_pat,
                APELLIDO_MATERNO = :ap_mat,
                CI = :ci,
                FECHA_NACIMIENTO = TO_DATE(:f_nac, 'YYYY-MM-DD'),
                EDAD = :edad,
                GENERO = :genero,
                CELULAR = :cel,
                TELEFONO = :tel,
                EMAIL = :email,
                DIRECCION = :dir,
                ESTADO_CIVIL = :ecivil,
                OCUPACION = :ocup,
                NOMBRE_CONTACTO_EMERGENCIA = :nom_emerg,
                TELEFONO_CONTACTO_EMERGENCIA = :tel_emerg,
                TIPO_SANGRE = :sangre,
                ALERGIAS = :alergias,
                ANTECEDENTES_MEDICOS = :antecedentes,
                MEDICAMENTOS_ACTUALES = :medicamentos,
                SEGURO_MEDICO = :seguro,
                NUMERO_SEGURO = :nro_seguro,
                ESTADO = :estado
            WHERE ID_PACIENTE = :id
        `;

        const binds = {
            id: id,
            nombres: body.nombres,
            ap_pat: body.apellido_paterno,
            ap_mat: body.apellido_materno || '',
            ci: body.ci,
            f_nac: fechaNacStr,
            edad: edad,
            genero: body.genero,
            cel: body.celular,
            tel: body.telefono,
            email: body.email,
            dir: body.direccion,
            ecivil: body.estado_civil,
            ocup: body.ocupacion,
            nom_emerg: body.nombre_contacto_emergencia,
            tel_emerg: body.telefono_contacto_emergencia,
            sangre: body.tipo_sangre,
            alergias: body.alergias,
            antecedentes: body.antecedentes_medicos,
            medicamentos: body.medicamentos_actuales,
            seguro: body.seguro_medico,
            nro_seguro: body.numero_seguro,
            estado: (body.estado || 'ACTIVO').toUpperCase().trim()
        };

        await conn.execute(updateSql, binds, { autoCommit: true });
        res.json({ message: 'Paciente actualizado correctamente' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar: ' + error.message });
    } finally {
        if (conn) await conn.close();
    }
};

// ==================================================================
// 5. ELIMINAR (DELETE /:id) - PASA A ESTADO INACTIVO
// ==================================================================
exports.deletePaciente = async (req, res) => {
    let conn;
    try {
        const id = req.params.id;
        conn = await database.getConnection(); 

        await conn.execute(
            "UPDATE PACIENTES SET ESTADO = 'INACTIVO' WHERE ID_PACIENTE = :id",
            [id],
            { autoCommit: true }
        );

        res.json({ message: 'Paciente desactivado correctamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al desactivar' });
    } finally {
        if (conn) await conn.close();
    }
};

// ==================================================================
// EXPORTAR PDF / EXCEL
// ==================================================================
exports.exportPacientePDF = async (req, res) => {
    let conn;
    try {
        conn = await database.getConnection();
        const id = req.params.id;
        const result = await conn.execute("SELECT * FROM PACIENTES WHERE ID_PACIENTE = :id", [id], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        if (!result.rows.length) return res.status(404).json({error: 'Paciente no encontrado'});
        
        const p = result.rows[0];
        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Ficha_Paciente_${p.CI}.pdf`);
        doc.pipe(res);
        
        doc.fontSize(22).fillColor('#0066cc').text(`Ficha Médica del Paciente`, { align: 'center' });
        doc.moveDown();
        
        doc.fontSize(14).fillColor('#333333').text(`Datos Personales`, { underline: true });
        doc.fontSize(12).fillColor('#000000');
        doc.text(`Nombre Completo: ${p.NOMBRES} ${p.APELLIDO_PATERNO} ${p.APELLIDO_MATERNO || ''}`);
        doc.text(`Cédula de Identidad: ${p.CI}`);
        doc.text(`Fecha de Nacimiento: ${formatearFechaParaFrontend(p.FECHA_NACIMIENTO)} (Edad: ${p.EDAD || '-'} años)`);
        doc.text(`Género: ${p.GENERO === 'M' ? 'Masculino' : (p.GENERO === 'F' ? 'Femenino' : 'Otro')}`);
        doc.text(`Teléfono / Celular: ${p.TELEFONO || '-'} / ${p.CELULAR || '-'}`);
        doc.text(`Dirección: ${p.DIRECCION || '-'}`);
        doc.moveDown();

        doc.fontSize(14).fillColor('#333333').text(`Información Médica`, { underline: true });
        doc.fontSize(12).fillColor('#000000');
        doc.text(`Tipo de Sangre: ${p.TIPO_SANGRE || 'No especificado'}`);
        doc.text(`Seguro Médico: ${p.SEGURO_MEDICO || 'Ninguno'} (Nro: ${p.NUMERO_SEGURO || 'N/A'})`);
        doc.text(`Alergias: ${p.ALERGIAS || 'Ninguna reportada'}`);
        doc.text(`Antecedentes: ${p.ANTECEDENTES_MEDICOS || 'Ninguno'}`);
        doc.moveDown();

        doc.fontSize(10).fillColor('gray').text(`Generado el: ${new Date().toLocaleString('es-BO')}`, { align: 'center' });
        
        doc.end();
    } catch(e) { 
        console.error(e);
        res.status(500).send('Error generando PDF'); 
    } finally { 
        if(conn) await conn.close(); 
    }
};

exports.exportTodosPacientesExcel = async (req, res) => {
    let conn;
    try {
        conn = await database.getConnection();
        const sql = `SELECT * FROM PACIENTES WHERE UPPER(ESTADO) != 'ELIMINADO' ORDER BY ID_PACIENTE DESC`;
        const result = await conn.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Pacientes');
        
        worksheet.columns = [
            { header: 'ID', key: 'ID_PACIENTE', width: 10 },
            { header: 'Nombres', key: 'NOMBRES', width: 25 },
            { header: 'Apellido Paterno', key: 'APELLIDO_PATERNO', width: 20 },
            { header: 'Apellido Materno', key: 'APELLIDO_MATERNO', width: 20 },
            { header: 'CI', key: 'CI', width: 15 },
            { header: 'Edad', key: 'EDAD', width: 10 },
            { header: 'Celular', key: 'CELULAR', width: 15 },
            { header: 'Seguro Médico', key: 'SEGURO_MEDICO', width: 20 },
            { header: 'Estado', key: 'ESTADO', width: 15 }
        ];

        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0066CC' } };

        result.rows.forEach(r => worksheet.addRow(r));

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Base_Datos_Pacientes.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error Excel:', error);
        res.status(500).json({ error: 'Error generando archivo Excel' });
    } finally {
        if (conn) await conn.close();
    }
};

exports.exportPacienteExcel = exports.exportTodosPacientesExcel;