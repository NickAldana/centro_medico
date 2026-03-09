const oracledb = require('oracledb');
const chalk = require('chalk');

// =============================================================================
// CONFIGURACIÓN DE CONEXIÓN
// =============================================================================
const DB = {
  user: 'C##ELMARCHORE',
  password: '9012264',
  connectString: 'localhost:1521/XE'
};

(async () => {
  let conn;
  try {
    console.log(chalk.cyan('╔══════════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║               SISTEMA DE ADMINISTRACION MEDICA               ║'));
    console.log(chalk.cyan('║           Centro Médico Iglesia Católica - Los Chacos        ║'));
    console.log(chalk.cyan('║                                                              ║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════════════════════════╝\n'));

    conn = await oracledb.getConnection(DB);
    console.log(chalk.green('✔ Conexión establecida correctamente.\n'));

    // Configurar formato de fecha para la sesión actual
    await conn.execute("ALTER SESSION SET NLS_DATE_FORMAT = 'YYYY-MM-DD HH24:MI:SS'");

    // =========================================================================
    // 1. LIMPIEZA PROFUNDA (CORREGIDA)
    // =========================================================================
    console.log(chalk.red('1. Ejecutando limpieza profunda...'));
    await conn.execute(`
      BEGIN
        FOR o IN (SELECT object_name, object_type FROM user_objects 
                  WHERE object_type IN ('TABLE','SEQUENCE','TRIGGER')
                  AND object_name NOT LIKE 'BIN$%') LOOP
          BEGIN -- Iniciamos bloque para capturar errores de objetos ya borrados
            IF o.object_type = 'TABLE' THEN
              EXECUTE IMMEDIATE 'DROP TABLE '||o.object_name||' CASCADE CONSTRAINTS PURGE';
            ELSIF o.object_type = 'SEQUENCE' THEN
              EXECUTE IMMEDIATE 'DROP SEQUENCE '||o.object_name;
            ELSIF o.object_type = 'TRIGGER' THEN
              EXECUTE IMMEDIATE 'DROP TRIGGER '||o.object_name;
            END IF;
          EXCEPTION
            WHEN OTHERS THEN 
              NULL; -- Ignorar error si el objeto ya no existe (ej. trigger borrado con su tabla)
          END;
        END LOOP;
      END;
    `);

    // =========================================================================
    // 2. CREACIÓN DE SECUENCIAS
    // =========================================================================
    console.log(chalk.yellow('2. Inicializando secuencias...'));
    const seqs = [
      'seq_config', 'seq_permiso', 'seq_rol', 'seq_rol_permiso',
      'seq_usuario', 'seq_paciente', 'seq_categoria', 'seq_producto',
      'seq_inventario', 'seq_movimiento', 'seq_cita', 'seq_factura',
      'seq_detalle', 'seq_bitacora', 'seq_sesion', 'seq_notificacion'
    ];
    for (const s of seqs) await conn.execute(`CREATE SEQUENCE ${s} START WITH 1 INCREMENT BY 1 NOCACHE`);

    // =========================================================================
    // 3. ARQUITECTURA DE DATOS (DDL) - NORMALIZADA
    // =========================================================================
    console.log(chalk.yellow('3. Construyendo tablas normalizadas...'));
    const ddl = [
      // CONFIGURACION 
      `CREATE TABLE configuracion_sistema (
        id_configuracion NUMBER CONSTRAINT pk_config PRIMARY KEY,
        nombre_empresa VARCHAR2(200) NOT NULL,
        nit VARCHAR2(50) NOT NULL,
        direccion CLOB,
        telefono VARCHAR2(50),
        email VARCHAR2(100),
        moneda VARCHAR2(10) DEFAULT 'BOB',
        logo_url VARCHAR2(500), 
        horario_atencion VARCHAR2(100),
        iva_porcentaje NUMBER(5,2) DEFAULT 13.00,
        tiempo_inactividad NUMBER DEFAULT 30,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      // PERMISOS
      `CREATE TABLE permisos (
        id_permiso NUMBER CONSTRAINT pk_permiso PRIMARY KEY,
        nombre_permiso VARCHAR2(100) NOT NULL CONSTRAINT uq_permiso UNIQUE,
        descripcion CLOB,
        modulo VARCHAR2(50) NOT NULL,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      // ROLES
      `CREATE TABLE roles (
        id_rol NUMBER CONSTRAINT pk_rol PRIMARY KEY,
        nombre_rol VARCHAR2(50) NOT NULL CONSTRAINT uq_rol UNIQUE,
        descripcion CLOB,
        nivel_acceso NUMBER DEFAULT 1 NOT NULL,
        estado VARCHAR2(20) DEFAULT 'activo',
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      // ROL_PERMISOS
      `CREATE TABLE rol_permisos (
        id_rol_permiso NUMBER CONSTRAINT pk_rol_permiso PRIMARY KEY,
        id_rol NUMBER NOT NULL,
        id_permiso NUMBER NOT NULL,
        concedido_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_rp_rol FOREIGN KEY (id_rol) REFERENCES roles(id_rol) ON DELETE CASCADE,
        CONSTRAINT fk_rp_permiso FOREIGN KEY (id_permiso) REFERENCES permisos(id_permiso) ON DELETE CASCADE,
        CONSTRAINT uq_rol_permiso UNIQUE (id_rol, id_permiso)
      )`,
      // USUARIOS
      `CREATE TABLE usuarios (
        id_usuario NUMBER CONSTRAINT pk_usuario PRIMARY KEY,
        nombres VARCHAR2(100) NOT NULL,
        apellido_paterno VARCHAR2(100) NOT NULL,
        apellido_materno VARCHAR2(100),
        ci VARCHAR2(20) NOT NULL CONSTRAINT uq_ci UNIQUE,
        email VARCHAR2(100) NOT NULL CONSTRAINT uq_email UNIQUE,
        telefono VARCHAR2(20),
        direccion CLOB,
        fecha_nacimiento DATE,
        genero VARCHAR2(10),
        cargo VARCHAR2(50),
        especialidad VARCHAR2(100),
        id_rol NUMBER NOT NULL,
        nombre_usuario VARCHAR2(50) NOT NULL CONSTRAINT uq_usuario UNIQUE,
        password_hash VARCHAR2(255) NOT NULL,
        ultimo_acceso TIMESTAMP,
        estado VARCHAR2(20) DEFAULT 'activo',
        intentos_fallidos NUMBER DEFAULT 0,
        bloqueado_hasta TIMESTAMP,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_usu_rol FOREIGN KEY (id_rol) REFERENCES roles(id_rol)
      )`,
      // PACIENTES
      `CREATE TABLE pacientes (
        id_paciente NUMBER CONSTRAINT pk_paciente PRIMARY KEY,
        nombres VARCHAR2(100) NOT NULL,
        apellido_paterno VARCHAR2(100) NOT NULL,
        apellido_materno VARCHAR2(100),
        ci VARCHAR2(20) NOT NULL CONSTRAINT uq_pac_ci UNIQUE,
        email VARCHAR2(100),
        telefono VARCHAR2(20),
        celular VARCHAR2(20),
        direccion CLOB,
        fecha_nacimiento DATE,
        edad NUMBER,
        genero VARCHAR2(10),
        estado_civil VARCHAR2(20),
        ocupacion VARCHAR2(100),
        nombre_contacto_emergencia VARCHAR2(100),
        telefono_contacto_emergencia VARCHAR2(20),
        tipo_sangre VARCHAR2(10),
        alergias CLOB,
        antecedentes_medicos CLOB,
        medicamentos_actuales CLOB,
        seguro_medico VARCHAR2(100),
        numero_seguro VARCHAR2(50),
        estado VARCHAR2(20) DEFAULT 'activo',
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      // CATEGORIAS
      `CREATE TABLE categorias (
        id_categoria NUMBER CONSTRAINT pk_categoria PRIMARY KEY,
        nombre_categoria VARCHAR2(100) NOT NULL CONSTRAINT uq_categoria UNIQUE,
        descripcion CLOB,
        estado VARCHAR2(20) DEFAULT 'activo',
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      // PRODUCTOS
      `CREATE TABLE productos (
        id_producto NUMBER CONSTRAINT pk_producto PRIMARY KEY,
        codigo_producto VARCHAR2(50) NOT NULL CONSTRAINT uq_cod_prod UNIQUE,
        nombre_producto VARCHAR2(200) NOT NULL,
        descripcion CLOB,
        id_categoria NUMBER NOT NULL,
        laboratorio VARCHAR2(100),
        principio_activo VARCHAR2(200),
        concentracion VARCHAR2(50),
        presentacion VARCHAR2(50),
        unidad_medida VARCHAR2(20) DEFAULT 'unidades',
        stock_minimo NUMBER DEFAULT 10,
        stock_maximo NUMBER DEFAULT 1000,
        precio_compra NUMBER(10,2) NOT NULL,
        precio_venta NUMBER(10,2) NOT NULL,
        requiere_receta NUMBER(1, 0) DEFAULT 0,
        estado VARCHAR2(20) DEFAULT 'activo',
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_prod_cat FOREIGN KEY (id_categoria) REFERENCES categorias(id_categoria)
      )`,
      // INVENTARIO
      `CREATE TABLE inventario (
        id_inventario NUMBER CONSTRAINT pk_inventario PRIMARY KEY,
        id_producto NUMBER NOT NULL,
        lote VARCHAR2(50),
        fecha_vencimiento DATE,
        cantidad_actual NUMBER DEFAULT 0 NOT NULL,
        cantidad_reservada NUMBER DEFAULT 0,
        ubicacion_almacen VARCHAR2(100),
        costo_unitario NUMBER(10,2),
        estado VARCHAR2(20) DEFAULT 'disponible',
        ultimo_movimiento TIMESTAMP,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_inv_prod FOREIGN KEY (id_producto) REFERENCES productos(id_producto) ON DELETE CASCADE,
        CONSTRAINT uq_inv_lote UNIQUE (id_producto, lote)
      )`,
      // MOVIMIENTOS INVENTARIO
      `CREATE TABLE movimientos_inventario (
        id_movimiento NUMBER CONSTRAINT pk_movimiento PRIMARY KEY,
        id_inventario NUMBER NOT NULL,
        id_usuario NUMBER NOT NULL,
        tipo_movimiento VARCHAR2(20) NOT NULL,
        cantidad NUMBER NOT NULL,
        motivo CLOB,
        documento_referencia VARCHAR2(50),
        costo_unitario NUMBER(10,2),
        fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_mov_inv FOREIGN KEY (id_inventario) REFERENCES inventario(id_inventario),
        CONSTRAINT fk_mov_usu FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
      )`,
      // SESIONES CAJA
      `CREATE TABLE sesiones_caja (
        id_sesion NUMBER CONSTRAINT pk_sesion PRIMARY KEY,
        id_usuario NUMBER NOT NULL,
        fecha_apertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        fecha_cierre TIMESTAMP,
        monto_inicial NUMBER(10,2) DEFAULT 0,
        monto_final NUMBER(10,2),
        estado VARCHAR2(20) DEFAULT 'ABIERTA',
        CONSTRAINT fk_ses_usu FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
      )`,
      // FACTURAS
      `CREATE TABLE facturas (
        id_factura NUMBER CONSTRAINT pk_factura PRIMARY KEY,
        numero_factura VARCHAR2(50) NOT NULL CONSTRAINT uq_num_fact UNIQUE,
        id_paciente NUMBER NOT NULL,
        id_usuario_cajero NUMBER NOT NULL,
        id_sesion NUMBER, 
        fecha_emision TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        subtotal NUMBER(10,2) NOT NULL,
        descuento NUMBER(10,2) DEFAULT 0,
        iva NUMBER(10,2) DEFAULT 0,
        total NUMBER(10,2) NOT NULL,
        estado VARCHAR2(20) DEFAULT 'pendiente',
        metodo_pago VARCHAR2(50),
        referencia_pago VARCHAR2(100),
        notas CLOB,
        anulada NUMBER(1, 0) DEFAULT 0,
        motivo_anulacion CLOB,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_fac_pac FOREIGN KEY (id_paciente) REFERENCES pacientes(id_paciente),
        CONSTRAINT fk_fac_caj FOREIGN KEY (id_usuario_cajero) REFERENCES usuarios(id_usuario),
        CONSTRAINT fk_fac_ses FOREIGN KEY (id_sesion) REFERENCES sesiones_caja(id_sesion)
      )`,
      // CITAS
      `CREATE TABLE citas (
        id_cita NUMBER CONSTRAINT pk_cita PRIMARY KEY,
        id_paciente NUMBER NOT NULL,
        id_medico NUMBER NOT NULL,
        fecha_cita DATE NOT NULL,
        hora_inicio VARCHAR2(8) NOT NULL,
        hora_fin VARCHAR2(8) NOT NULL,
        especialidad VARCHAR2(100),
        motivo_consulta CLOB,
        estado VARCHAR2(20) DEFAULT 'programada',
        notas CLOB,
        costo_consulta NUMBER(10,2),
        id_factura NUMBER,
        recordatorio_enviado NUMBER(1, 0) DEFAULT 0,
        creada_por NUMBER NOT NULL,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_cit_pac FOREIGN KEY (id_paciente) REFERENCES pacientes(id_paciente),
        CONSTRAINT fk_cit_med FOREIGN KEY (id_medico) REFERENCES usuarios(id_usuario),
        CONSTRAINT fk_cit_cre FOREIGN KEY (creada_por) REFERENCES usuarios(id_usuario),
        CONSTRAINT fk_cit_fac FOREIGN KEY (id_factura) REFERENCES facturas(id_factura) ON DELETE SET NULL
      )`,
      // NOTIFICACIONES (para médicos/recepcionistas)
      `CREATE TABLE notificaciones (
        id_notificacion NUMBER PRIMARY KEY,
        id_usuario_destino NUMBER NOT NULL,
        titulo VARCHAR2(200) NOT NULL,
        mensaje CLOB NOT NULL,
        tipo VARCHAR2(50),
        id_referencia NUMBER,
        leida NUMBER(1,0) DEFAULT 0,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_notif_usuario 
          FOREIGN KEY (id_usuario_destino) 
          REFERENCES usuarios(id_usuario)
          ON DELETE CASCADE
      )`,
      // DETALLE FACTURA
      `CREATE TABLE detalle_factura (
        id_detalle NUMBER CONSTRAINT pk_detalle PRIMARY KEY,
        id_factura NUMBER NOT NULL,
        id_producto NUMBER,
        id_cita NUMBER,
        descripcion_servicio VARCHAR2(200),
        cantidad NUMBER DEFAULT 1,
        precio_unitario NUMBER(10,2) NOT NULL,
        subtotal NUMBER(10,2) NOT NULL,
        CONSTRAINT fk_det_fac FOREIGN KEY (id_factura) REFERENCES facturas(id_factura) ON DELETE CASCADE,
        CONSTRAINT fk_det_prod FOREIGN KEY (id_producto) REFERENCES productos(id_producto) ON DELETE SET NULL,
        CONSTRAINT fk_det_cita FOREIGN KEY (id_cita) REFERENCES citas(id_cita) ON DELETE SET NULL
      )`,
      // BITACORA
      `CREATE TABLE bitacora_accesos (
        id_bitacora NUMBER CONSTRAINT pk_bitacora PRIMARY KEY,
        id_usuario NUMBER,
        ip_address VARCHAR2(45),
        user_agent CLOB,
        accion VARCHAR2(50) NOT NULL,
        modulo VARCHAR2(50),
        descripcion CLOB,
        fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_bit_usu FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE SET NULL
      )`
    ];

    for (let i = 0; i < ddl.length; i++) {
      await conn.execute(ddl[i]);
      process.stdout.write(chalk.gray('.'));
    }
    console.log(chalk.green('\n✔ Tablas normalizadas creadas.\n'));

    // =========================================================================
    // 4. TRIGGERS
    // =========================================================================
    console.log(chalk.yellow('4. Configurando triggers...'));
    const trig = [
      `CREATE OR REPLACE TRIGGER trg_config BEFORE INSERT ON configuracion_sistema FOR EACH ROW BEGIN IF :NEW.id_configuracion IS NULL THEN :NEW.id_configuracion := seq_config.NEXTVAL; END IF; END;`,
      `CREATE OR REPLACE TRIGGER trg_permiso BEFORE INSERT ON permisos FOR EACH ROW BEGIN IF :NEW.id_permiso IS NULL THEN :NEW.id_permiso := seq_permiso.NEXTVAL; END IF; END;`,
      `CREATE OR REPLACE TRIGGER trg_rol BEFORE INSERT ON roles FOR EACH ROW BEGIN IF :NEW.id_rol IS NULL THEN :NEW.id_rol := seq_rol.NEXTVAL; END IF; END;`,
      `CREATE OR REPLACE TRIGGER trg_rp BEFORE INSERT ON rol_permisos FOR EACH ROW BEGIN IF :NEW.id_rol_permiso IS NULL THEN :NEW.id_rol_permiso := seq_rol_permiso.NEXTVAL; END IF; END;`,
      `CREATE OR REPLACE TRIGGER trg_usu BEFORE INSERT ON usuarios FOR EACH ROW BEGIN IF :NEW.id_usuario IS NULL THEN :NEW.id_usuario := seq_usuario.NEXTVAL; END IF; END;`,
      `CREATE OR REPLACE TRIGGER trg_pac BEFORE INSERT ON pacientes FOR EACH ROW BEGIN IF :NEW.id_paciente IS NULL THEN :NEW.id_paciente := seq_paciente.NEXTVAL; END IF; END;`,
      `CREATE OR REPLACE TRIGGER trg_cat BEFORE INSERT ON categorias FOR EACH ROW BEGIN IF :NEW.id_categoria IS NULL THEN :NEW.id_categoria := seq_categoria.NEXTVAL; END IF; END;`,
      `CREATE OR REPLACE TRIGGER trg_prod BEFORE INSERT ON productos FOR EACH ROW BEGIN IF :NEW.id_producto IS NULL THEN :NEW.id_producto := seq_producto.NEXTVAL; END IF; END;`,
      `CREATE OR REPLACE TRIGGER trg_inv BEFORE INSERT ON inventario FOR EACH ROW BEGIN IF :NEW.id_inventario IS NULL THEN :NEW.id_inventario := seq_inventario.NEXTVAL; END IF; END;`,
      `CREATE OR REPLACE TRIGGER trg_mov BEFORE INSERT ON movimientos_inventario FOR EACH ROW BEGIN IF :NEW.id_movimiento IS NULL THEN :NEW.id_movimiento := seq_movimiento.NEXTVAL; END IF; END;`,
      `CREATE OR REPLACE TRIGGER trg_cit BEFORE INSERT ON citas FOR EACH ROW BEGIN IF :NEW.id_cita IS NULL THEN :NEW.id_cita := seq_cita.NEXTVAL; END IF; END;`,
      `CREATE OR REPLACE TRIGGER trg_fac BEFORE INSERT ON facturas FOR EACH ROW BEGIN IF :NEW.id_factura IS NULL THEN :NEW.id_factura := seq_factura.NEXTVAL; END IF; END;`,
      `CREATE OR REPLACE TRIGGER trg_det BEFORE INSERT ON detalle_factura FOR EACH ROW BEGIN IF :NEW.id_detalle IS NULL THEN :NEW.id_detalle := seq_detalle.NEXTVAL; END IF; END;`,
      `CREATE OR REPLACE TRIGGER trg_bit BEFORE INSERT ON bitacora_accesos FOR EACH ROW BEGIN IF :NEW.id_bitacora IS NULL THEN :NEW.id_bitacora := seq_bitacora.NEXTVAL; END IF; END;`,
      `CREATE OR REPLACE TRIGGER trg_ses BEFORE INSERT ON sesiones_caja FOR EACH ROW BEGIN IF :NEW.id_sesion IS NULL THEN :NEW.id_sesion := seq_sesion.NEXTVAL; END IF; END;`,
      // Secuencia para notificaciones
      `CREATE OR REPLACE TRIGGER trg_notificacion
       BEFORE INSERT ON notificaciones
       FOR EACH ROW
       BEGIN
         IF :NEW.id_notificacion IS NULL THEN
           :NEW.id_notificacion := seq_notificacion.NEXTVAL;
         END IF;
       END;`,
      // Notificación automática al crear cita (para el médico asignado)
      `CREATE OR REPLACE TRIGGER trg_notificar_nueva_cita
       AFTER INSERT ON citas
       FOR EACH ROW
       BEGIN
         INSERT INTO notificaciones (
             id_usuario_destino,
             titulo,
             mensaje,
             tipo,
             id_referencia
         )
         VALUES (
             :NEW.id_medico,
             'Nueva Cita Asignada',
             'Tiene una nueva cita médica programada para el día ' 
             || TO_CHAR(:NEW.fecha_cita, 'DD/MM/YYYY') 
             || ' a las ' || :NEW.hora_inicio,
             'CITA_NUEVA',
             :NEW.id_cita
         );
       END;`,
      // Notificación al recepcionista/creador cuando cambia el estado de la cita
      // CORREGIDO: Se eliminó el SELECT a la tabla mutante. Se usa :OLD.creada_por
      `CREATE OR REPLACE TRIGGER trg_notificar_estado_cita
       AFTER UPDATE OF estado ON citas
       FOR EACH ROW
       WHEN (OLD.estado != NEW.estado)
       BEGIN
           INSERT INTO notificaciones (
               id_usuario_destino,
               titulo,
               mensaje,
               tipo,
               id_referencia
           )
           VALUES (
               :OLD.creada_por,  -- USAMOS EL VALOR DIRECTO SIN CONSULTAR LA TABLA
               'Actualización de Cita',
               'La cita del día ' 
               || TO_CHAR(:NEW.fecha_cita,'DD/MM/YYYY') 
               || ' cambió a estado: ' || :NEW.estado,
               'CAMBIO_ESTADO',
               :NEW.id_cita
           );
       END;`
    ];
    for (const t of trig) await conn.execute(t);

    // =========================================================================
    // 5. INYECCIÓN DE DATOS
    // =========================================================================
    console.log(chalk.blue('5. Inyectando datos maestros...'));

    // A. CONFIG
    await conn.execute(`
      INSERT INTO configuracion_sistema (nombre_empresa, nit, direccion, telefono, email, logo_url, horario_atencion, moneda, iva_porcentaje, tiempo_inactividad) 
      VALUES ('Centro Médico de la Iglesia Católica', '1020304050', 'Barrio Los Chacos, Calle Principal #100, Santa Cruz de la Sierra', '3-3456789', 'admin@cmic-scz.org', '/assets/images/logo.png', 'Lunes a Domingo 07:00 - 22:00', 'BOB', 13.00, 30)
    `);

    // B. PERMISOS
    const permisosSQL = [
      `INSERT INTO permisos (nombre_permiso, descripcion, modulo) VALUES ('ver_dashboard', 'Acceso al panel principal', 'dashboard')`,
      `INSERT INTO permisos (nombre_permiso, descripcion, modulo) VALUES ('gestion_usuarios', 'Crear y editar usuarios', 'admin')`,
      `INSERT INTO permisos (nombre_permiso, descripcion, modulo) VALUES ('gestion_roles', 'Crear y editar roles', 'admin')`,
      `INSERT INTO permisos (nombre_permiso, descripcion, modulo) VALUES ('crear_paciente', 'Registrar pacientes', 'admision')`,
      `INSERT INTO permisos (nombre_permiso, descripcion, modulo) VALUES ('editar_paciente', 'Modificar datos paciente', 'admision')`,
      `INSERT INTO permisos (nombre_permiso, descripcion, modulo) VALUES ('ver_paciente', 'Ver ficha paciente', 'admision')`,
      `INSERT INTO permisos (nombre_permiso, descripcion, modulo) VALUES ('agendar_cita', 'Crear citas médicas', 'agenda')`,
      `INSERT INTO permisos (nombre_permiso, descripcion, modulo) VALUES ('reprogramar_cita', 'Mover citas', 'agenda')`,
      `INSERT INTO permisos (nombre_permiso, descripcion, modulo) VALUES ('cancelar_cita', 'Anular citas', 'agenda')`,
      `INSERT INTO permisos (nombre_permiso, descripcion, modulo) VALUES ('ver_historia_clinica', 'Acceso medico completo', 'medico')`,
      `INSERT INTO permisos (nombre_permiso, descripcion, modulo) VALUES ('escribir_evolucion', 'Registrar consulta', 'medico')`,
      `INSERT INTO permisos (nombre_permiso, descripcion, modulo) VALUES ('recetar', 'Crear recetas', 'medico')`,
      `INSERT INTO permisos (nombre_permiso, descripcion, modulo) VALUES ('solicitar_lab', 'Orden de laboratorios', 'medico')`,
      `INSERT INTO permisos (nombre_permiso, descripcion, modulo) VALUES ('ver_resultados_lab', 'Ver resultados', 'medico')`,
      `INSERT INTO permisos (nombre_permiso, descripcion, modulo) VALUES ('procesar_muestra', 'Gestión de lab', 'laboratorio')`,
      `INSERT INTO permisos (nombre_permiso, descripcion, modulo) VALUES ('facturar_servicio', 'Cobrar consulta/proc', 'caja')`,
      `INSERT INTO permisos (nombre_permiso, descripcion, modulo) VALUES ('anular_factura', 'Nota de crédito', 'caja')`,
      `INSERT INTO permisos (nombre_permiso, descripcion, modulo) VALUES ('cierre_caja', 'Arqueo diario', 'caja')`,
      `INSERT INTO permisos (nombre_permiso, descripcion, modulo) VALUES ('gestion_stock', 'Ajuste de inventario', 'farmacia')`,
      `INSERT INTO permisos (nombre_permiso, descripcion, modulo) VALUES ('reportes_gerencia', 'Ver estadisticas', 'gerencia')`
    ];
    for (const sql of permisosSQL) await conn.execute(sql);

    // C. ROLES
    const rolesSQL = [
      `INSERT INTO roles (nombre_rol, descripcion, nivel_acceso) VALUES ('Administrador Sistema', 'Control total', 100)`,
      `INSERT INTO roles (nombre_rol, descripcion, nivel_acceso) VALUES ('Director Médico', 'Gestión médica', 90)`,
      `INSERT INTO roles (nombre_rol, descripcion, nivel_acceso) VALUES ('Médico General', 'Consulta general', 50)`,
      `INSERT INTO roles (nombre_rol, descripcion, nivel_acceso) VALUES ('Odontólogo Senior', 'Dentista principal', 50)`,
      `INSERT INTO roles (nombre_rol, descripcion, nivel_acceso) VALUES ('Odontólogo Junior', 'Dentista asistente', 40)`,
      `INSERT INTO roles (nombre_rol, descripcion, nivel_acceso) VALUES ('Ginecólogo', 'Especialista mujer', 50)`,
      `INSERT INTO roles (nombre_rol, descripcion, nivel_acceso) VALUES ('Pediatra', 'Especialista niños', 50)`,
      `INSERT INTO roles (nombre_rol, descripcion, nivel_acceso) VALUES ('Jefe de Laboratorio', 'Bioquímico jefe', 60)`,
      `INSERT INTO roles (nombre_rol, descripcion, nivel_acceso) VALUES ('Técnico de Laboratorio', 'Analista', 40)`,
      `INSERT INTO roles (nombre_rol, descripcion, nivel_acceso) VALUES ('Licenciada Enfermería', 'Jefa enfermeras', 40)`,
      `INSERT INTO roles (nombre_rol, descripcion, nivel_acceso) VALUES ('Auxiliar Enfermería', 'Apoyo', 30)`,
      `INSERT INTO roles (nombre_rol, descripcion, nivel_acceso) VALUES ('Recepcionista Mañana', 'Turno AM', 20)`,
      `INSERT INTO roles (nombre_rol, descripcion, nivel_acceso) VALUES ('Recepcionista Tarde', 'Turno PM', 20)`,
      `INSERT INTO roles (nombre_rol, descripcion, nivel_acceso) VALUES ('Cajero Principal', 'Tesorería', 30)`,
      `INSERT INTO roles (nombre_rol, descripcion, nivel_acceso) VALUES ('Farmacéutico', 'Regente', 40)`,
      `INSERT INTO roles (nombre_rol, descripcion, nivel_acceso) VALUES ('Personal Limpieza', 'Servicios generales', 10)`,
      `INSERT INTO roles (nombre_rol, descripcion, nivel_acceso) VALUES ('Seguridad', 'Vigilancia', 10)`,
      `INSERT INTO roles (nombre_rol, descripcion, nivel_acceso) VALUES ('RRHH', 'Recursos Humanos', 70)`,
      `INSERT INTO roles (nombre_rol, descripcion, nivel_acceso) VALUES ('Contador', 'Finanzas', 70)`,
      `INSERT INTO roles (nombre_rol, descripcion, nivel_acceso) VALUES ('Auditor', 'Auditoría interna', 80)`
    ];
    for (const sql of rolesSQL) await conn.execute(sql);

  // =========================================================================
    // D. ROL_PERMISOS (ASIGNACIÓN REALISTA PARA PRUEBAS)
    // =========================================================================
    console.log(chalk.gray('   > Asignando permisos a roles...'));
    
    const rolPermisos = [];

    // 1. ADMIN (Rol 1) -> Tiene ABSOLUTAMENTE TODOS los permisos (1 al 20)
    for (let p = 1; p <= 20; p++) {
        rolPermisos.push({ id_rol: 1, id_permiso: p });
    }

    // 2. MÉDICO GENERAL (Rol 3) -> jperez
    const permisosMedico = [1, 6, 10, 11, 12, 13, 14]; 
    permisosMedico.forEach(p => rolPermisos.push({ id_rol: 3, id_permiso: p }));

    // 3. RECEPCIONISTA (Rol 12) -> recep1
    const permisosRecep = [1, 4, 5, 6, 7, 8, 9]; 
    permisosRecep.forEach(p => rolPermisos.push({ id_rol: 12, id_permiso: p }));

    // 4. CAJERO (Rol 14) -> cajero
    const permisosCajero = [1, 6, 16, 17, 18]; 
    permisosCajero.forEach(p => rolPermisos.push({ id_rol: 14, id_permiso: p }));

    // 5. FARMACÉUTICO (Rol 15) -> farma
    const permisosFarma = [1, 19]; 
    permisosFarma.forEach(p => rolPermisos.push({ id_rol: 15, id_permiso: p }));

    // Ejecutar las inserciones en la base de datos
    for (const rp of rolPermisos) {
        await conn.execute(`INSERT INTO rol_permisos (id_rol, id_permiso) VALUES (${rp.id_rol}, ${rp.id_permiso})`);
    }

    // E. USUARIOS
    console.log(chalk.gray('   > Usuarios...'));
    const usuariosSQL = [
      `INSERT INTO usuarios (nombres, apellido_paterno, apellido_materno, ci, email, nombre_usuario, password_hash, id_rol, cargo, direccion, fecha_nacimiento, genero, telefono, especialidad) VALUES ('Carlos', 'Montaño', 'Perez', '1010101', 'admin@cmic.org', 'admin', 'hash123', 1, 'Admin', 'Av. Beni Calle 2', TO_DATE('1980-05-15', 'YYYY-MM-DD'), 'M', '70010001', 'GESTION ADMINISTRATIVA')`,
      `INSERT INTO usuarios (nombres, apellido_paterno, apellido_materno, ci, email, nombre_usuario, password_hash, id_rol, cargo, direccion, fecha_nacimiento, genero, telefono, especialidad) VALUES ('Roberto', 'Fernandez', 'Gomez', '2020202', 'dir@cmic.org', 'director', 'hash123', 2, 'Director', 'Equipetrol Norte', TO_DATE('1975-08-20', 'YYYY-MM-DD'), 'M', '70010002', 'GESTION MEDICA')`,
      `INSERT INTO usuarios (nombres, apellido_paterno, apellido_materno, ci, email, nombre_usuario, password_hash, id_rol, cargo, especialidad, direccion, fecha_nacimiento, genero, telefono) VALUES ('Juan', 'Perez', 'Lopez', '3030303', 'dr.perez@cmic.org', 'jperez', 'hash123', 3, 'Médico', 'Medicina General', 'Urbari', TO_DATE('1982-01-10', 'YYYY-MM-DD'), 'M', '70010003')`,
      `INSERT INTO usuarios (nombres, apellido_paterno, apellido_materno, ci, email, nombre_usuario, password_hash, id_rol, cargo, especialidad, direccion, fecha_nacimiento, genero, telefono) VALUES ('Lucia', 'Vargas', 'Rojas', '4040404', 'dra.vargas@cmic.org', 'lvargas', 'hash123', 3, 'Médico', 'Medicina General', 'Las Palmas', TO_DATE('1985-03-25', 'YYYY-MM-DD'), 'F', '70010004')`,
      `INSERT INTO usuarios (nombres, apellido_paterno, apellido_materno, ci, email, nombre_usuario, password_hash, id_rol, cargo, especialidad, direccion, fecha_nacimiento, genero, telefono) VALUES ('Mario', 'Ortiz', 'Suarez', '5050505', 'dr.ortiz@cmic.org', 'mortiz', 'hash123', 3, 'Médico', 'Medicina General', 'Centro', TO_DATE('1983-07-12', 'YYYY-MM-DD'), 'M', '70010005')`,
      `INSERT INTO usuarios (nombres, apellido_paterno, apellido_materno, ci, email, nombre_usuario, password_hash, id_rol, cargo, especialidad, direccion, fecha_nacimiento, genero, telefono) VALUES ('Ana', 'Suarez', 'Mendez', '6060606', 'dra.suarez@cmic.org', 'asuarez', 'hash123', 4, 'Odontólogo', 'Odontología', 'Hamacas', TO_DATE('1990-11-05', 'YYYY-MM-DD'), 'F', '70010006')`,
      `INSERT INTO usuarios (nombres, apellido_paterno, apellido_materno, ci, email, nombre_usuario, password_hash, id_rol, cargo, especialidad, direccion, fecha_nacimiento, genero, telefono) VALUES ('Pedro', 'Mendez', 'Vaca', '7070707', 'dr.mendez@cmic.org', 'pmendez', 'hash123', 5, 'Odontólogo', 'Odontología', 'Villa 1ro Mayo', TO_DATE('1995-02-14', 'YYYY-MM-DD'), 'M', '70010007')`,
      `INSERT INTO usuarios (nombres, apellido_paterno, apellido_materno, ci, email, nombre_usuario, password_hash, id_rol, cargo, especialidad, direccion, fecha_nacimiento, genero, telefono) VALUES ('Sofia', 'Justiniano', 'Roca', '8080808', 'dra.sofia@cmic.org', 'sofia', 'hash123', 6, 'Médico', 'Ginecología', 'Sirari', TO_DATE('1988-09-30', 'YYYY-MM-DD'), 'F', '70010008')`,
      `INSERT INTO usuarios (nombres, apellido_paterno, apellido_materno, ci, email, nombre_usuario, password_hash, id_rol, cargo, especialidad, direccion, fecha_nacimiento, genero, telefono) VALUES ('Elena', 'Roca', 'Antelo', '9090909', 'dra.eroca@cmic.org', 'eroca', 'hash123', 6, 'Médico', 'Ginecología', 'El Trompillo', TO_DATE('1986-06-18', 'YYYY-MM-DD'), 'F', '70010009')`,
      `INSERT INTO usuarios (nombres, apellido_paterno, apellido_materno, ci, email, nombre_usuario, password_hash, id_rol, cargo, especialidad, direccion, fecha_nacimiento, genero, telefono) VALUES ('Raul', 'Cuellar', 'Pinto', '1111222', 'dr.rcuellar@cmic.org', 'rcuellar', 'hash123', 7, 'Médico', 'Pediatría', 'Av. Santos Dumont', TO_DATE('1981-12-22', 'YYYY-MM-DD'), 'M', '70010010')`,
      `INSERT INTO usuarios (nombres, apellido_paterno, apellido_materno, ci, email, nombre_usuario, password_hash, id_rol, cargo, especialidad, direccion, fecha_nacimiento, genero, telefono) VALUES ('Patricia', 'Chavez', 'Solis', '2222333', 'dra.pchavez@cmic.org', 'pchavez', 'hash123', 7, 'Médico', 'Pediatría', 'Av. Moscú', TO_DATE('1989-04-10', 'YYYY-MM-DD'), 'F', '70010011')`,
      `INSERT INTO usuarios (nombres, apellido_paterno, apellido_materno, ci, email, nombre_usuario, password_hash, id_rol, cargo, especialidad, direccion, fecha_nacimiento, genero, telefono) VALUES ('Jorge', 'Antelo', 'Vargas', '3333444', 'bio.antelo@cmic.org', 'jantelo', 'hash123', 8, 'Bioquímico', 'Laboratorio', 'Pampa de la Isla', TO_DATE('1978-05-05', 'YYYY-MM-DD'), 'M', '70010012')`,
      `INSERT INTO usuarios (nombres, apellido_paterno, apellido_materno, ci, email, nombre_usuario, password_hash, id_rol, cargo, especialidad, direccion, fecha_nacimiento, genero, telefono) VALUES ('Maria', 'López', 'Garcia', '4444555', 'tec.lopez@cmic.org', 'mlopez', 'hash123', 9, 'Técnico', 'Laboratorio', 'Plan 3000', TO_DATE('1998-08-08', 'YYYY-MM-DD'), 'F', '70010013')`,
      `INSERT INTO usuarios (nombres, apellido_paterno, apellido_materno, ci, email, nombre_usuario, password_hash, id_rol, cargo, direccion, fecha_nacimiento, genero, telefono, especialidad) VALUES ('Juana', 'Mamani', 'Quispe', '5555666', 'enf.mamani@cmic.org', 'jmamani', 'hash123', 10, 'Enfermera', 'Los Lotes', TO_DATE('1990-01-20', 'YYYY-MM-DD'), 'F', '70010014', 'ENFERMERIA GENERAL')`,
      `INSERT INTO usuarios (nombres, apellido_paterno, apellido_materno, ci, email, nombre_usuario, password_hash, id_rol, cargo, direccion, fecha_nacimiento, genero, telefono, especialidad) VALUES ('Rosa', 'Quispe', 'Flores', '6666777', 'enf.quispe@cmic.org', 'rquispe', 'hash123', 11, 'Auxiliar', 'Satélite Norte', TO_DATE('1995-10-10', 'YYYY-MM-DD'), 'F', '70010015', 'ASISTENCIA MEDICA')`,
      `INSERT INTO usuarios (nombres, apellido_paterno, apellido_materno, ci, email, nombre_usuario, password_hash, id_rol, cargo, direccion, fecha_nacimiento, genero, telefono, especialidad) VALUES ('Carla', 'Torrico', 'Villarroel', '7777888', 'recep1@cmic.org', 'recep1', 'hash123', 12, 'Recepcionista', 'Av. Cumavi', TO_DATE('2000-03-30', 'YYYY-MM-DD'), 'F', '70010016', 'ATENCION AL CLIENTE')`,
      `INSERT INTO usuarios (nombres, apellido_paterno, apellido_materno, ci, email, nombre_usuario, password_hash, id_rol, cargo, direccion, fecha_nacimiento, genero, telefono, especialidad) VALUES ('Viviana', 'Saucedo', 'Mora', '8888999', 'recep2@cmic.org', 'recep2', 'hash123', 13, 'Recepcionista', 'Villa 1ro Mayo', TO_DATE('2001-07-25', 'YYYY-MM-DD'), 'F', '70010017', 'ATENCION AL CLIENTE')`,
      `INSERT INTO usuarios (nombres, apellido_paterno, apellido_materno, ci, email, nombre_usuario, password_hash, id_rol, cargo, direccion, fecha_nacimiento, genero, telefono, especialidad) VALUES ('Marcos', 'Ribera', 'Vaca', '9999000', 'caja@cmic.org', 'cajero', 'hash123', 14, 'Cajero', 'Los Chacos', TO_DATE('1992-12-05', 'YYYY-MM-DD'), 'M', '70010018', 'CONTABILIDAD BASICA')`,
      `INSERT INTO usuarios (nombres, apellido_paterno, apellido_materno, ci, email, nombre_usuario, password_hash, id_rol, cargo, direccion, fecha_nacimiento, genero, telefono, especialidad) VALUES ('Luis', 'Guzman', 'Ortiz', '1212121', 'farma@cmic.org', 'farma', 'hash123', 15, 'Farmacéutico', 'Av. Paraguay', TO_DATE('1985-02-18', 'YYYY-MM-DD'), 'M', '70010019', 'FARMACIA CLINICA')`,
      `INSERT INTO usuarios (nombres, apellido_paterno, apellido_materno, ci, email, nombre_usuario, password_hash, id_rol, cargo, direccion, fecha_nacimiento, genero, telefono, especialidad) VALUES ('Pedro', 'Callau', 'Justiniano', '2323232', 'aux.farma@cmic.org', 'auditor', 'hash123', 11, 'Auxiliar Farmacia', 'Barrio Lindo', TO_DATE('1999-06-15', 'YYYY-MM-DD'), 'M', '70010020', 'AUXILIAR DE FARMACIA')`
    ];
    for (const sql of usuariosSQL) await conn.execute(sql);

    // F. PACIENTES
    console.log(chalk.gray('   > Pacientes...'));
    const pacientesSQL = [
      `INSERT INTO pacientes (nombres, apellido_paterno, apellido_materno, ci, direccion, genero, fecha_nacimiento, email, telefono, celular, estado_civil, ocupacion, nombre_contacto_emergencia, telefono_contacto_emergencia, tipo_sangre, seguro_medico, alergias, antecedentes_medicos, medicamentos_actuales) 
        VALUES ('Hugo', 'Banzer', 'Suarez', '1001', 'Los Chacos C/1', 'M', TO_DATE('1980-01-01', 'YYYY-MM-DD'), 'hugo.banzer@mail.com', '3340001', '70000001', 'Casado', 'Militar', 'Sra. Banzer', '70000002', 'O+', 'Caja Nacional', 'NINGUNA', 'HIPERTENSION ARTERIAL', 'LOSARTAN 50MG')`,
      `INSERT INTO pacientes (nombres, apellido_paterno, apellido_materno, ci, direccion, genero, fecha_nacimiento, email, telefono, celular, estado_civil, ocupacion, nombre_contacto_emergencia, telefono_contacto_emergencia, tipo_sangre, seguro_medico, alergias, antecedentes_medicos, medicamentos_actuales) 
        VALUES ('Lidia', 'Gueiler', 'Tejada', '1002', 'Los Chacos C/2', 'F', TO_DATE('1985-02-02', 'YYYY-MM-DD'), 'lidia.gueiler@mail.com', '3340002', '70000003', 'Viuda', 'Política', 'Hijo Gueiler', '70000004', 'A+', 'Particular', 'PENICILINA', 'DIABETES TIPO 2', 'METFORMINA 850MG')`,
      `INSERT INTO pacientes (nombres, apellido_paterno, apellido_materno, ci, direccion, genero, fecha_nacimiento, email, telefono, celular, estado_civil, ocupacion, nombre_contacto_emergencia, telefono_contacto_emergencia, tipo_sangre, seguro_medico, alergias, antecedentes_medicos, medicamentos_actuales) 
        VALUES ('Jaime', 'Paz', 'Zamora', '1003', 'Pampa de la Isla', 'M', TO_DATE('1990-03-03', 'YYYY-MM-DD'), 'jaime.paz@mail.com', '3340003', '70000005', 'Soltero', 'Abogado', 'Tia Paz', '70000006', 'B+', 'Caja Petrolera', 'POLVO', 'ASMA', 'SALBUTAMOL')`,
      `INSERT INTO pacientes (nombres, apellido_paterno, apellido_materno, ci, direccion, genero, fecha_nacimiento, email, telefono, celular, estado_civil, ocupacion, nombre_contacto_emergencia, telefono_contacto_emergencia, tipo_sangre, seguro_medico, alergias, antecedentes_medicos, medicamentos_actuales) 
        VALUES ('Gonzalo', 'Sanchez', 'de Lozada', '1004', 'Villa 1ro Mayo', 'M', TO_DATE('1975-04-04', 'YYYY-MM-DD'), 'goni@mail.com', '3340004', '70000007', 'Casado', 'Empresario', 'Sra. Sanchez', '70000008', 'O-', 'Seguro Privado', 'SULFA', 'NINGUNO', 'NINGUNO')`,
      `INSERT INTO pacientes (nombres, apellido_paterno, apellido_materno, ci, direccion, genero, fecha_nacimiento, email, telefono, celular, estado_civil, ocupacion, nombre_contacto_emergencia, telefono_contacto_emergencia, tipo_sangre, seguro_medico, alergias, antecedentes_medicos, medicamentos_actuales) 
        VALUES ('Carlos', 'Mesa', 'Gisbert', '1005', 'Plan 3000', 'M', TO_DATE('1960-05-05', 'YYYY-MM-DD'), 'carlos.mesa@mail.com', '3340005', '70000009', 'Casado', 'Periodista', 'Esposa Mesa', '70000010', 'A-', 'SUS', 'NINGUNA', 'GASTRITIS CRONICA', 'OMEPRAZOL')`
    ];
    for (const sql of pacientesSQL) await conn.execute(sql);

    // G. CATEGORÍAS
    const catList = [
      'Analgésicos', 'Antibióticos', 'Antiinflamatorios', 'Antihistamínicos', 'Antipiréticos',
      'Antimicóticos', 'Antivirales', 'Cardiología', 'Dermatología', 'Gastroenterología',
      'Ginecología', 'Oftalmología', 'Pediatría', 'Traumatología', 'Vitaminas',
      'Insumos Médicos', 'Higiene Personal', 'Material Laboratorio', 'Odontología', 'Sueros'
    ];
    for (const cat of catList) {
      await conn.execute(`INSERT INTO categorias (nombre_categoria, descripcion) VALUES ('${cat}', 'Productos de ${cat}')`);
    }

    // H. PRODUCTOS
    console.log(chalk.gray('   > Productos...'));
    const prodSQL = [
      `INSERT INTO productos (codigo_producto, nombre_producto, id_categoria, precio_compra, precio_venta, stock_minimo, laboratorio, principio_activo, concentracion, presentacion) VALUES ('P01', 'Paracetamol 500mg', 1, 0.5, 1.0, 50, 'Laboratorios Bagó', 'Paracetamol', '500 mg', 'Caja x 100')`,
      `INSERT INTO productos (codigo_producto, nombre_producto, id_categoria, precio_compra, precio_venta, stock_minimo, laboratorio, principio_activo, concentracion, presentacion) VALUES ('P02', 'Ibuprofeno 400mg', 3, 0.8, 1.5, 50, 'Laboratorios Inti', 'Ibuprofeno', '400 mg', 'Caja x 20')`,
      `INSERT INTO productos (codigo_producto, nombre_producto, id_categoria, precio_compra, precio_venta, stock_minimo, laboratorio, principio_activo, concentracion, presentacion) VALUES ('P03', 'Amoxicilina 1g', 2, 3.0, 5.0, 30, 'Laboratorios Chile', 'Amoxicilina', '1 g', 'Comprimidos')`,
      `INSERT INTO productos (codigo_producto, nombre_producto, id_categoria, precio_compra, precio_venta, stock_minimo, laboratorio, principio_activo, concentracion, presentacion) VALUES ('P04', 'Loratadina 10mg', 4, 0.5, 1.0, 20, 'Genfar', 'Loratadina', '10 mg', 'Jarabe')`,
      `INSERT INTO productos (codigo_producto, nombre_producto, id_categoria, precio_compra, precio_venta, stock_minimo, laboratorio, principio_activo, concentracion, presentacion) VALUES ('P05', 'Dipirona 1g Ampolla', 5, 2.0, 4.0, 10, 'Laboratorios Vita', 'Metamizol', '1 g/2ml', 'Ampolla')`,
      `INSERT INTO productos (codigo_producto, nombre_producto, id_categoria, precio_compra, precio_venta, stock_minimo, laboratorio, principio_activo, concentracion, presentacion) VALUES ('P06', 'Fluconazol 150mg', 6, 5.0, 10.0, 10, 'Bago', 'Fluconazol', '150 mg', 'Capsula')`,
      `INSERT INTO productos (codigo_producto, nombre_producto, id_categoria, precio_compra, precio_venta, stock_minimo, laboratorio, principio_activo, concentracion, presentacion) VALUES ('P07', 'Aciclovir Crema', 7, 15.0, 25.0, 5, 'Inti', 'Aciclovir', '5%', 'Tubo 10g')`,
      `INSERT INTO productos (codigo_producto, nombre_producto, id_categoria, precio_compra, precio_venta, stock_minimo, laboratorio, principio_activo, concentracion, presentacion) VALUES ('P08', 'Losartan 50mg', 8, 1.0, 2.0, 100, 'Delta', 'Losartan Potasico', '50 mg', 'Comprimidos')`,
      `INSERT INTO productos (codigo_producto, nombre_producto, id_categoria, precio_compra, precio_venta, stock_minimo, laboratorio, principio_activo, concentracion, presentacion) VALUES ('P09', 'Crema Dérmica Triple', 9, 20.0, 35.0, 10, 'Dermica', 'Betametasona/Gentamicina', '0.5%', 'Tubo 20g')`,
      `INSERT INTO productos (codigo_producto, nombre_producto, id_categoria, precio_compra, precio_venta, stock_minimo, laboratorio, principio_activo, concentracion, presentacion) VALUES ('P10', 'Omeprazol 20mg', 10, 0.5, 1.0, 50, 'Generico', 'Omeprazol', '20 mg', 'Capsulas')`,
      `INSERT INTO productos (codigo_producto, nombre_producto, id_categoria, precio_compra, precio_venta, stock_minimo, laboratorio, principio_activo, concentracion, presentacion) VALUES ('P11', 'Ovulos Vaginales', 11, 25.0, 40.0, 10, 'Ginecotex', 'Clotrimazol', '100 mg', 'Caja x 6')`,
      `INSERT INTO productos (codigo_producto, nombre_producto, id_categoria, precio_compra, precio_venta, stock_minimo, laboratorio, principio_activo, concentracion, presentacion) VALUES ('P12', 'Colirio Lagrimas', 12, 30.0, 50.0, 5, 'Oftalmos', 'Hipromelosa', '0.3%', 'Gotero 15ml')`,
      `INSERT INTO productos (codigo_producto, nombre_producto, id_categoria, precio_compra, precio_venta, stock_minimo, laboratorio, principio_activo, concentracion, presentacion) VALUES ('P13', 'Jarabe Tos Infantil', 13, 15.0, 25.0, 20, 'Vita', 'Ambroxol', '15mg/5ml', 'Frasco 120ml')`,
      `INSERT INTO productos (codigo_producto, nombre_producto, id_categoria, precio_compra, precio_venta, stock_minimo, laboratorio, principio_activo, concentracion, presentacion) VALUES ('P14', 'Venda Elástica', 14, 5.0, 10.0, 15, '3M', 'Algodon/Latex', '10cm x 5m', 'Rollo')`,
      `INSERT INTO productos (codigo_producto, nombre_producto, id_categoria, precio_compra, precio_venta, stock_minimo, laboratorio, principio_activo, concentracion, presentacion) VALUES ('P15', 'Vitamina C 1g', 15, 2.0, 4.0, 50, 'Bayer', 'Acido Ascorbico', '1 g', 'Efervescente')`,
      `INSERT INTO productos (codigo_producto, nombre_producto, id_categoria, precio_compra, precio_venta, stock_minimo, laboratorio, principio_activo, concentracion, presentacion) VALUES ('P16', 'Jeringa 5ml', 16, 0.5, 1.0, 100, 'Nipro', 'Plastico Esteral', '5 ml', 'Unidad')`,
      `INSERT INTO productos (codigo_producto, nombre_producto, id_categoria, precio_compra, precio_venta, stock_minimo, laboratorio, principio_activo, concentracion, presentacion) VALUES ('P17', 'Alcohol en Gel 1L', 17, 10.0, 18.0, 20, 'Astrix', 'Etanol', '70%', 'Botella 1L')`,
      `INSERT INTO productos (codigo_producto, nombre_producto, id_categoria, precio_compra, precio_venta, stock_minimo, laboratorio, principio_activo, concentracion, presentacion) VALUES ('P18', 'Tubo Ensayo', 18, 1.0, 2.0, 100, 'Glassware', 'Vidrio Borosilicato', '10ml', 'Unidad')`,
      `INSERT INTO productos (codigo_producto, nombre_producto, id_categoria, precio_compra, precio_venta, stock_minimo, laboratorio, principio_activo, concentracion, presentacion) VALUES ('P19', 'Pasta Profiláctica', 19, 50.0, 80.0, 2, 'Colgate', 'Fluoruro', 'Standard', 'Pote')`,
      `INSERT INTO productos (codigo_producto, nombre_producto, id_categoria, precio_compra, precio_venta, stock_minimo, laboratorio, principio_activo, concentracion, presentacion) VALUES ('P20', 'Suero Fisiológico 1L', 20, 10.0, 20.0, 30, 'Baxter', 'Cloruro de Sodio', '0.9%', 'Bolsa 1L')`
    ];
    for (const sql of prodSQL) await conn.execute(sql);

   // I. INVENTARIO
    console.log(chalk.gray('   > Inventario...'));
    const invSQL = [
      // Productos 1-10
      `INSERT INTO inventario (id_producto, lote, cantidad_actual, ubicacion_almacen, costo_unitario, fecha_vencimiento, ultimo_movimiento) VALUES (1, 'L01', 40, 'EST-A1', 0.5, TO_DATE('2026-06-30','YYYY-MM-DD'), TO_DATE('2026-02-09 08:00:00', 'YYYY-MM-DD HH24:MI:SS'))`,
      `INSERT INTO inventario (id_producto, lote, cantidad_actual, ubicacion_almacen, costo_unitario, fecha_vencimiento, ultimo_movimiento) VALUES (2, 'L02', 200, 'EST-A1', 0.8, TO_DATE('2027-01-01','YYYY-MM-DD'), TO_DATE('2026-02-09 08:00:00', 'YYYY-MM-DD HH24:MI:SS'))`,
      `INSERT INTO inventario (id_producto, lote, cantidad_actual, ubicacion_almacen, costo_unitario, fecha_vencimiento, ultimo_movimiento) VALUES (3, 'L03', 10, 'EST-A2', 3.0, TO_DATE('2026-03-15','YYYY-MM-DD'), TO_DATE('2026-02-09 08:00:00', 'YYYY-MM-DD HH24:MI:SS'))`,
      `INSERT INTO inventario (id_producto, lote, cantidad_actual, ubicacion_almacen, costo_unitario, fecha_vencimiento, ultimo_movimiento) VALUES (4, 'L04', 100, 'EST-A2', 0.5, TO_DATE('2026-12-12','YYYY-MM-DD'), TO_DATE('2026-02-09 08:00:00', 'YYYY-MM-DD HH24:MI:SS'))`,
      `INSERT INTO inventario (id_producto, lote, cantidad_actual, ubicacion_almacen, costo_unitario, fecha_vencimiento, ultimo_movimiento) VALUES (5, 'L05', 80, 'EST-C1', 2.0, TO_DATE('2026-08-08','YYYY-MM-DD'), TO_DATE('2026-02-09 08:00:00', 'YYYY-MM-DD HH24:MI:SS'))`,
      `INSERT INTO inventario (id_producto, lote, cantidad_actual, ubicacion_almacen, costo_unitario, fecha_vencimiento, ultimo_movimiento) VALUES (6, 'L06', 50, 'EST-C2', 5.0, TO_DATE('2026-09-09','YYYY-MM-DD'), TO_DATE('2026-02-09 08:00:00', 'YYYY-MM-DD HH24:MI:SS'))`,
      `INSERT INTO inventario (id_producto, lote, cantidad_actual, ubicacion_almacen, costo_unitario, fecha_vencimiento, ultimo_movimiento) VALUES (7, 'L07', 2, 'EST-B1', 15.0, TO_DATE('2026-04-20','YYYY-MM-DD'), TO_DATE('2026-02-09 08:00:00', 'YYYY-MM-DD HH24:MI:SS'))`,
      `INSERT INTO inventario (id_producto, lote, cantidad_actual, ubicacion_almacen, costo_unitario, fecha_vencimiento, ultimo_movimiento) VALUES (8, 'L08', 500, 'EST-D1', 1.0, TO_DATE('2027-02-28','YYYY-MM-DD'), TO_DATE('2026-02-09 08:00:00', 'YYYY-MM-DD HH24:MI:SS'))`,
      `INSERT INTO inventario (id_producto, lote, cantidad_actual, ubicacion_almacen, costo_unitario, fecha_vencimiento, ultimo_movimiento) VALUES (9, 'L09', 60, 'EST-D2', 20.0, TO_DATE('2026-11-30','YYYY-MM-DD'), TO_DATE('2026-02-09 08:00:00', 'YYYY-MM-DD HH24:MI:SS'))`,
      `INSERT INTO inventario (id_producto, lote, cantidad_actual, ubicacion_almacen, costo_unitario, fecha_vencimiento, ultimo_movimiento) VALUES (10, 'L10', 300, 'EST-E1', 0.5, TO_DATE('2028-01-01','YYYY-MM-DD'), TO_DATE('2026-02-09 08:00:00', 'YYYY-MM-DD HH24:MI:SS'))`,
      
      // Productos 11-20
      `INSERT INTO inventario (id_producto, lote, cantidad_actual, ubicacion_almacen, costo_unitario, fecha_vencimiento, ultimo_movimiento) VALUES (11, 'L11', 8, 'EST-F1', 25.0, TO_DATE('2026-05-10','YYYY-MM-DD'), TO_DATE('2026-02-09 08:00:00', 'YYYY-MM-DD HH24:MI:SS'))`,
      `INSERT INTO inventario (id_producto, lote, cantidad_actual, ubicacion_almacen, costo_unitario, fecha_vencimiento, ultimo_movimiento) VALUES (12, 'L12', 3, 'EST-F2', 30.0, TO_DATE('2026-07-15','YYYY-MM-DD'), TO_DATE('2026-02-09 08:00:00', 'YYYY-MM-DD HH24:MI:SS'))`,
      `INSERT INTO inventario (id_producto, lote, cantidad_actual, ubicacion_almacen, costo_unitario, fecha_vencimiento, ultimo_movimiento) VALUES (13, 'L13', 15, 'EST-G1', 15.0, TO_DATE('2026-10-20','YYYY-MM-DD'), TO_DATE('2026-02-09 08:00:00', 'YYYY-MM-DD HH24:MI:SS'))`,
      `INSERT INTO inventario (id_producto, lote, cantidad_actual, ubicacion_almacen, costo_unitario, fecha_vencimiento, ultimo_movimiento) VALUES (14, 'L14', 100, 'EST-G2', 5.0, TO_DATE('2028-12-31','YYYY-MM-DD'), TO_DATE('2026-02-09 08:00:00', 'YYYY-MM-DD HH24:MI:SS'))`,
      `INSERT INTO inventario (id_producto, lote, cantidad_actual, ubicacion_almacen, costo_unitario, fecha_vencimiento, ultimo_movimiento) VALUES (15, 'L15', 45, 'EST-H1', 2.0, TO_DATE('2027-04-10','YYYY-MM-DD'), TO_DATE('2026-02-09 08:00:00', 'YYYY-MM-DD HH24:MI:SS'))`,
      `INSERT INTO inventario (id_producto, lote, cantidad_actual, ubicacion_almacen, costo_unitario, fecha_vencimiento, ultimo_movimiento) VALUES (16, 'L16', 500, 'EST-H2', 0.5, TO_DATE('2029-01-01','YYYY-MM-DD'), TO_DATE('2026-02-09 08:00:00', 'YYYY-MM-DD HH24:MI:SS'))`,
      `INSERT INTO inventario (id_producto, lote, cantidad_actual, ubicacion_almacen, costo_unitario, fecha_vencimiento, ultimo_movimiento) VALUES (17, 'L17', 5, 'EST-I1', 10.0, TO_DATE('2026-08-30','YYYY-MM-DD'), TO_DATE('2026-02-09 08:00:00', 'YYYY-MM-DD HH24:MI:SS'))`,
      `INSERT INTO inventario (id_producto, lote, cantidad_actual, ubicacion_almacen, costo_unitario, fecha_vencimiento, ultimo_movimiento) VALUES (18, 'L18', 80, 'EST-I2', 1.0, TO_DATE('2030-05-05','YYYY-MM-DD'), TO_DATE('2026-02-09 08:00:00', 'YYYY-MM-DD HH24:MI:SS'))`,
      `INSERT INTO inventario (id_producto, lote, cantidad_actual, ubicacion_almacen, costo_unitario, fecha_vencimiento, ultimo_movimiento) VALUES (19, 'L19', 1, 'EST-J1', 50.0, TO_DATE('2026-11-15','YYYY-MM-DD'), TO_DATE('2026-02-09 08:00:00', 'YYYY-MM-DD HH24:MI:SS'))`,
      `INSERT INTO inventario (id_producto, lote, cantidad_actual, ubicacion_almacen, costo_unitario, fecha_vencimiento, ultimo_movimiento) VALUES (20, 'L20', 25, 'EST-J2', 10.0, TO_DATE('2027-03-25','YYYY-MM-DD'), TO_DATE('2026-02-09 08:00:00', 'YYYY-MM-DD HH24:MI:SS'))`
    ];
    for (const sql of invSQL) await conn.execute(sql);

    // 🔥 FIX: SESIÓN CAJA DEFAULT A NOMBRE DEL CAJERO (ID: 18, Marcos Ribera Vaca)
    await conn.execute(`INSERT INTO sesiones_caja (id_usuario, monto_inicial, estado) VALUES (18, 500, 'ABIERTA')`);

    // J. CITAS
    console.log(chalk.gray('   > Citas y Facturación...'));
    const doctores = [
        { id: 3, esp: 'Medicina General' },
        { id: 6, esp: 'Odontología' },
        { id: 8, esp: 'Ginecología' },
        { id: 10, esp: 'Pediatría' },
        { id: 4, esp: 'Medicina General' }
    ];

    for(let i=1; i<=20; i++) {
        const days = [9, 10, 11, 12, 13, 14];
        const day = days[(i - 1) % 6];
        const formattedDay = day < 10 ? `0${day}` : `${day}`;
        
        const hours = ['08:30', '09:00', '10:30', '11:00', '14:30', '15:00'];
        const startHour = hours[(i - 1) % 6];
        
        let endHourStr = '';
        if (startHour.endsWith('30')) {
            let h = parseInt(startHour.substring(0,2)) + 1;
            endHourStr = (h < 10 ? '0' + h : h) + ':00';
        } else {
            endHourStr = startHour.substring(0,2) + ':30';
        }

        const specificDate = `2026-02-${formattedDay} ${startHour}:00`;
        const docIndex = (i - 1) % doctores.length;
        const medico = doctores[docIndex];

        await conn.execute(`
            INSERT INTO citas (id_paciente, id_medico, fecha_cita, hora_inicio, hora_fin, especialidad, creada_por, motivo_consulta, costo_consulta, estado) 
            VALUES (
                ${(i%5)+1}, ${medico.id}, TO_DATE('${specificDate}', 'YYYY-MM-DD HH24:MI:SS'), '${startHour}', '${endHourStr}', '${medico.esp}', 1, 'Consulta de ${medico.esp}', 100.00, 'atendida'
            )
        `);
        
        // 🔥 FIX: Facturas hechas por el Cajero (ID 18) y en la Sesión 1
        await conn.execute(`
            INSERT INTO facturas (numero_factura, id_paciente, id_usuario_cajero, id_sesion, fecha_emision, subtotal, total, estado, metodo_pago)
            VALUES (
                'FAC-${1000+i}', ${(i%5)+1}, 18, 1, TO_DATE('${specificDate}', 'YYYY-MM-DD HH24:MI:SS'), 100, 100, 'PAGADA', 'Efectivo'
            )
        `);
        
        await conn.execute(`UPDATE citas SET id_factura = ${i} WHERE id_cita = ${i}`);
        
        await conn.execute(`
            INSERT INTO detalle_factura (id_factura, id_cita, descripcion_servicio, precio_unitario, subtotal)
            VALUES (${i}, ${i}, 'Consulta ${medico.esp}', 100, 100)
        `);
    }

    // K. BITÁCORA
    // 🔥 FIX: Bitácora realista, mezclando acciones del Admin (1), Médico (3) y Cajero (18)
    console.log(chalk.gray('   > Bitácora de seguridad...'));
    const auditoriaMock = [
        { u: 1,  acc: 'LOGIN', mod: 'AUTH', desc: 'Ingreso exitoso al sistema: admin' },
        { u: 1,  acc: 'CREAR', mod: 'ADMIN', desc: 'Registro de nuevo usuario' },
        { u: 18, acc: 'LOGIN', mod: 'AUTH', desc: 'Ingreso exitoso al sistema: cajero' },
        { u: 18, acc: 'ABRIR CAJA', mod: 'CAJA', desc: 'Apertura de sesión de caja (Turno)' },
        { u: 3,  acc: 'LOGIN', mod: 'AUTH', desc: 'Ingreso exitoso al sistema: jperez' },
        { u: 3,  acc: 'AGENDAR CITA', mod: 'AGENDA', desc: 'Creación de nueva cita médica (Registro ID: 21)' },
        { u: 18, acc: 'FACTURAR', mod: 'CAJA', desc: 'Emisión de nueva factura/recibo (Registro ID: 21)' },
        { u: 18, acc: 'MOVIMIENTO CAJA', mod: 'CAJA', desc: 'Registro de ingreso o egreso de caja chica' },
        { u: 1,  acc: 'EDITAR', mod: 'SISTEMA', desc: 'Actualización de configuración del sistema' },
        { u: 18, acc: 'ANULAR', mod: 'CAJA', desc: 'Anulación de documento/factura' }
    ];

    for(let i=0; i<auditoriaMock.length; i++) {
        const log = auditoriaMock[i];
        // Distribuimos las fechas en los últimos días
        const logDate = `2026-02-${10 + i} 08:30:00`; 
        await conn.execute(`
            INSERT INTO bitacora_accesos (id_usuario, accion, descripcion, modulo, ip_address, fecha_registro) 
            VALUES (${log.u}, '${log.acc}', '${log.desc}', '${log.mod}', '192.168.1.${10 + i}', TO_DATE('${logDate}', 'YYYY-MM-DD HH24:MI:SS'))
        `);
    }

    await conn.commit();
    console.log(chalk.green('\n✔ Transacciones confirmadas.'));
    console.log(chalk.cyan('╔══════════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║   SISTEMA RESTAURADO Y NORMALIZADO CON ÉXITO                 ║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════════════════════════╝'));

  } catch (e) {
    console.error(chalk.red('\n✖ FALLO CRÍTICO:', e.message));
    if (e.offset) console.error(chalk.red(`  Error en posición SQL: ${e.offset}`));
    console.error(e);
  } finally {
    if (conn) await conn.close();
  }
})();