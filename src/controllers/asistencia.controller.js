const mongoose = require('mongoose');
const Curso = require('../models/cursos.models');
const Asistencia = require('../models/asistencia.models');
const Usuario = require('../models/usuarios.models');
const connectDB = require('../config/db');
const { enviarCorreo } = require('../utils/email');

const obtenerAsistenciaCurso = async (req, res) => {
  try {
    await connectDB();
    const { cursoId } = req.params;
    const { fecha } = req.query;

    if (!cursoId) return res.status(400).json({ error: 'Falta cursoId en la URL' });
    if (!fecha) return res.status(400).json({ error: 'Debes proporcionar la fecha (?fecha=YYYY-MM-DD)' });

    const cursoObjectId = new mongoose.Types.ObjectId(cursoId);
    const fechaNormalizada = (fecha || '').trim();

    // ===== DEPURACIÓN: mostrar colecciones y query exacta =====
    console.log('--- DEBUG @obtenerAsistenciaCurso ---');
    console.log('DB colecciones esperadas: usuarios / cursos / asistencia');
    console.log('cursoId (string):', cursoId);
    console.log('cursoId (ObjectId):', cursoObjectId);
    console.log('fecha (query):', fecha);
    console.log('fechaNormalizada:', JSON.stringify(fechaNormalizada));
    console.log('Query asistencia:', {
      curso_id: cursoObjectId,
      fecha: fechaNormalizada
    });

    // 1) Curso
    const curso = await Curso.findById(cursoObjectId)
      .select('nombre nivel paralelo')
      .lean();

    // 2) Estudiantes del curso
    const estudiantes = await Usuario.find({ curso_id: cursoObjectId })
      .select('nombres apellidos')
      .lean();

    // Asistencias del curso en esa fecha (fecha es STRING)
    const asistencias = await Asistencia.find({
      curso_id: cursoObjectId,
      fecha: fechaNormalizada
    })
      .select('estudiante_id estado fecha curso_id')
      .lean();

    // ===== DEPURACIÓN: imprimir conteos y algunas filas =====
    console.log('Curso encontrado:', curso ? curso.nombre : '(no existe)');
    console.log('Total estudiantes del curso:', estudiantes.length);
    console.log('Total asistencias encontradas:', asistencias.length);

    if (asistencias.length === 0) {
      console.log('MUESTRA de 3 documentos en colección asistencia (sin filtrar):');
      const muestra = await Asistencia.find({}).limit(3).lean();
      console.log(JSON.stringify(muestra, null, 2));
    } else {
      console.log('Primeras 3 asistencias encontradas:');
      console.log(JSON.stringify(asistencias.slice(0, 3), null, 2));
    }

    // Mapa estudianteId -> estado
    const mapaAsistencia = new Map(asistencias.map(a => [a.estudiante_id.toString(), a.estado]));

    // Unimos estudiante + estado (NO ponemos "Ausente" por defecto; si no existe registro = null)
    const estudiantesConEstado = estudiantes.map(e => ({
      id: e._id.toString(),
      nombres: e.nombres,
      apellidos: e.apellidos,
      estado: mapaAsistencia.get(e._id.toString()) ?? null
    }));

    // Totales SOLO contados desde documentos reales de asistencia
    const total_presentes = asistencias.filter(a => a.estado === 'Presente').length;
    const total_ausentes = asistencias.filter(a => a.estado === 'Ausente').length;

    // Respuesta
    res.json({
      curso_id: cursoId,
      curso: curso ? curso.nombre : 'Curso desconocido',
      nivel: curso?.nivel || '',
      paralelo: curso?.paralelo || '',
      fecha: fechaNormalizada,
      total_estudiantes: estudiantes.length,
      total_presentes,
      total_ausentes,
      estudiantes: estudiantesConEstado
    });

  } catch (error) {
    console.error('Error al obtener asistencia:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const registrarAsistenciaCurso = async (req, res) => {
  try {
    await connectDB();
    let { curso_id, fecha, estudiantes } = req.body;

    // 🔹 Validaciones básicas
    if (!curso_id || !Array.isArray(estudiantes) || estudiantes.length === 0) {
      return res.status(400).json({ error: 'Debe enviar curso_id y una lista de estudiantes con su estado.' });
    }

    if (!mongoose.Types.ObjectId.isValid(curso_id)) {
      return res.status(400).json({ error: 'ID de curso inválido.' });
    }

    // 🔹 Normalización de la fecha (YYYY-MM-DD)
    let fechaNormalizada;
    if (fecha && typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha.trim())) {
      fechaNormalizada = fecha.trim();
    } else {
      const hoy = new Date();
      const yyyy = hoy.getFullYear();
      const mm = String(hoy.getMonth() + 1).padStart(2, '0');
      const dd = String(hoy.getDate()).padStart(2, '0');
      fechaNormalizada = `${yyyy}-${mm}-${dd}`;
    }

    // 🔹 Verificar que el curso exista
    const curso = await Curso.findById(curso_id).select('nombre paralelo').lean();
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado.' });
    }

    // 🔹 Verificar si ya existen registros para esa fecha y curso
    const existentes = await Asistencia.find({
      curso_id: curso_id,
      fecha: fechaNormalizada
    }).select('estudiante_id estado').lean();

    // Crear un mapa de registros existentes
    const existentesMap = new Map(existentes.map(e => [e.estudiante_id.toString(), e.estado]));

    // 🔹 Filtrar solo los estudiantes que aún no tienen asistencia registrada
    const nuevosRegistros = estudiantes.filter(
      e => !existentesMap.has(e.id)
    );

    if (nuevosRegistros.length === 0) {
      return res.status(400).json({
        mensaje: `La asistencia del curso ${curso.nombre} ${curso.paralelo} para la fecha ${fechaNormalizada} ya está registrada.`,
        registros_existentes: existentes.length
      });
    }

    // 🔹 Detectar los ausentes
    const inasistentes = nuevosRegistros
      .filter(e => e.estado === 'Ausente')
      .map(e => new mongoose.Types.ObjectId(e.id));

    console.log("➡️ Inasistentes detectados:", inasistentes);

    // 🔹 Insertar solo los nuevos (sin modificar existentes)
    const operaciones = nuevosRegistros.map(est => ({
      updateOne: {
        filter: {
          curso_id: curso_id,
          estudiante_id: new mongoose.Types.ObjectId(est.id),
          fecha: fechaNormalizada
        },
        update: { $setOnInsert: { estado: est.estado } }, // ✅ solo inserta si no existe
        upsert: true
      }
    }));

    const resultado = await Asistencia.bulkWrite(operaciones);

    // 🔹 Envío de correos solo a los ausentes nuevos
    if (inasistentes.length > 0) {
      console.log("🔍 Buscando correos de los ausentes...");
      const ausentesInfo = await Usuario.find({ _id: { $in: inasistentes } })
        .select("nombres apellidos email")
        .lean();

      for (const user of ausentesInfo) {
        if (!user.email) continue;

        const asunto = `Notificación de Inasistencia - ${curso.nombre} ${curso.paralelo}`;
        const mensaje = `
          <div style="font-family: 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f7fa; padding: 30px;">
            <div style="max-width: 600px; margin: auto; background: #ffffff; border-radius: 10px; box-shadow: 0 3px 8px rgba(0,0,0,0.05); overflow: hidden;">
              <div style="background: linear-gradient(90deg, #007bff, #0056b3); color: white; padding: 15px 25px; font-size: 18px; font-weight: bold; text-align: center;">
                Notificación de Inasistencia
              </div>
              <div style="padding: 25px; color: #333333;">
                <p>Estimado/a <strong>${user.nombres} ${user.apellidos}</strong>,</p>
                <p>Se ha registrado una <strong>inasistencia</strong> el día 
                  <strong>${fechaNormalizada}</strong> en el curso 
                  <strong>${curso.nombre} ${curso.paralelo}</strong>.
                </p>
                <p>Por favor, justifique su ausencia si corresponde.</p>
                <p style="margin-top: 30px;">Atentamente,<br><strong>Sistema Escolar</strong></p>
              </div>
              <div style="background-color: #f0f3f7; padding: 10px; text-align: center; font-size: 12px; color: #777;">
                © ${new Date().getFullYear()} Sistema Escolar - Todos los derechos reservados.
              </div>
            </div>
          </div>
        `;

        try {
          await enviarCorreo(user.email, asunto, mensaje);
          console.log(`Correo enviado correctamente a ${user.email}`);
        } catch (err) {
          console.error(`Error al enviar correo a ${user.email}:`, err.message);
        }
      }
    } else {
      console.log("✅ No hay ausentes nuevos, no se envían correos.");
    }

    // 🔹 Totales
    const total_presentes = nuevosRegistros.filter(e => e.estado === 'Presente').length;
    const total_ausentes = nuevosRegistros.filter(e => e.estado === 'Ausente').length;
    const total_justificados = nuevosRegistros.filter(e => e.estado === 'Justificado').length;

    // 🔹 Respuesta final
    res.status(200).json({
      mensaje: `Asistencia registrada (sin duplicar) para ${curso.nombre} ${curso.paralelo}`,
      fecha: fechaNormalizada,
      total_insertados: nuevosRegistros.length,
      total_presentes,
      total_ausentes,
      total_justificados,
      resumen_db: {
        insertados: resultado.upsertedCount,
        modificados: resultado.modifiedCount
      },
      registros_omitidos: estudiantes.length - nuevosRegistros.length
    });

  } catch (error) {
    console.error('Error al registrar asistencia:', error);
    res.status(500).json({ error: 'Error interno al registrar asistencia.' });
  }
};

const actualizarAsistenciaCurso = async (req, res) => {
  try {
    await connectDB();
    let { curso_id, fecha, estudiantes } = req.body;

    // Validaciones básicas
    if (!curso_id || !fecha || !Array.isArray(estudiantes) || estudiantes.length === 0) {
      return res.status(400).json({
        error: 'Debe enviar curso_id, fecha y una lista de estudiantes con su nuevo estado.'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(curso_id)) {
      return res.status(400).json({ error: 'ID de curso inválido.' });
    }

    const fechaNormalizada = fecha.trim();

    // Verificar que el curso exista
    const curso = await Curso.findById(curso_id).select('nombre paralelo').lean();
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado.' });
    }

    // Buscar asistencias existentes para ese curso y fecha
    const existentes = await Asistencia.find({
      curso_id: new mongoose.Types.ObjectId(curso_id),
      fecha: fechaNormalizada
    }).lean();

    if (existentes.length === 0) {
      return res.status(400).json({
        error: `No existen registros de asistencia para ${curso.nombre} ${curso.paralelo} en la fecha ${fechaNormalizada}.`
      });
    }

    // Crear mapa estudiante_id → estado actual
    const estadoActual = new Map(
      existentes.map(e => [e.estudiante_id.toString(), e.estado])
    );

    // Validar que no se intente justificar a presentes
    const invalidos = estudiantes.filter(
      e =>
        e.estado === 'Justificado' &&
        estadoActual.get(e.id) === 'Presente'
    );

    if (invalidos.length > 0) {
      const nombres = invalidos
        .map(e => `• ${e.id}`)
        .join('\n');
      return res.status(400).json({
        error: `No se puede justificar a estudiantes que ya están marcados como "Presente".`,
        detalle: nombres
      });
    }

    // Crear operaciones válidas
    const operaciones = estudiantes.map(est => ({
      updateOne: {
        filter: {
          curso_id: new mongoose.Types.ObjectId(curso_id),
          estudiante_id: new mongoose.Types.ObjectId(est.id),
          fecha: fechaNormalizada
        },
        update: { $set: { estado: est.estado } },
        upsert: false
      }
    }));

    const resultado = await Asistencia.bulkWrite(operaciones);

    // Resumen de cambios
    const total_actualizados = resultado.modifiedCount;

    res.status(200).json({
      mensaje: `Asistencia actualizada para ${curso.nombre} ${curso.paralelo}`,
      fecha: fechaNormalizada,
      total_actualizados,
      total_estudiantes_afectados: estudiantes.length
    });
  } catch (error) {
    console.error('Error al actualizar asistencia:', error);
    res.status(500).json({ error: 'Error interno al actualizar asistencia.' });
  }
};


module.exports = { obtenerAsistenciaCurso, registrarAsistenciaCurso, actualizarAsistenciaCurso };
