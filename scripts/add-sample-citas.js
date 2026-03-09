const oracledb = require('oracledb');

const DB = {
  user: 'C##ELMARCHORE',
  password: '9012264',
  connectString: 'localhost:1521/XE'
};

(async () => {
  let conn;
  try {
    conn = await oracledb.getConnection(DB);
    console.log('Conexión establecida. Añadiendo citas de muestra...\n');

    // Médicos disponibles (ID: 1 Carlos, 2 Ana, 3 Juan, etc.)
    const medicos = [
      { id: 1, nombre: 'Carlos Montaño' },
      { id: 2, nombre: 'Ana García' },
      { id: 3, nombre: 'Juan Pérez' }
    ];

    // Pacientes disponibles (ID: 1-5)
    const pacientes = [1, 2, 3, 4, 5];

    // Fechas: hoy (09-03-2026) y próximos 7 días
    const today = new Date('2026-03-09');
    const especialidades = ['Cardiología', 'Pediatría', 'Dermatología', 'Neurología', 'Oftalmología'];

    let citaId = 101; // Empezando desde ID 101

    // Crear 15 citas distribuidas en los próximos 7 días
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const fecha = new Date(today);
      fecha.setDate(fecha.getDate() + dayOffset);
      const fechaStr = fecha.toISOString().split('T')[0]; // YYYY-MM-DD

      // 2-3 citas por día
      const citasDelDia = 2 + Math.floor(Math.random() * 2);
      const horasUsadas = [];

      for (let i = 0; i < citasDelDia; i++) {
        // Generar hora aleatoria entre 08:00 y 16:00, evitando solapamientos
        let horaNum;
        let intentos = 0;
        do {
          horaNum = 8 + Math.floor(Math.random() * 8);
          intentos++;
        } while (horasUsadas.includes(horaNum) && intentos < 10);

        if (intentos >= 10) continue; // Saltar si no pudimos encontrar una hora libre

        horasUsadas.push(horaNum);

        const horaInicio = `${String(horaNum).padStart(2, '0')}:00`;
        const horaFin = `${String(horaNum + 1).padStart(2, '0')}:00`;

        const medico = medicos[Math.floor(Math.random() * medicos.length)];
        const paciente = pacientes[Math.floor(Math.random() * pacientes.length)];
        const especialidad = especialidades[Math.floor(Math.random() * especialidades.length)];

        const sql = `
          INSERT INTO CITAS (
            ID_CITA, ID_PACIENTE, ID_MEDICO, FECHA_CITA, 
            HORA_INICIO, HORA_FIN, ESPECIALIDAD, MOTIVO_CONSULTA, 
            COSTO_CONSULTA, ESTADO, CREADA_POR, FECHA_CREACION
          ) VALUES (
            ${citaId},
            ${paciente},
            ${medico.id},
            TO_DATE('${fechaStr}', 'YYYY-MM-DD'),
            '${horaInicio}',
            '${horaFin}',
            '${especialidad}',
            'Consulta de ${especialidad}',
            100.00,
            'PROGRAMADA',
            1,
            SYSDATE
          )
        `;

        await conn.execute(sql);
        console.log(`✅ Cita ${citaId} creada: ${fechaStr} ${horaInicio}-${horaFin} | Médico: ${medico.nombre} | Paciente: ${paciente}`);

        citaId++;
      }
    }

    await conn.commit();
    console.log('\n✅ Todas las citas de muestra han sido creadas correctamente');

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch (e) {}
    }
  }
})();
