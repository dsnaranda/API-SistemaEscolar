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
    const curso = await Curso.findById(cursoObjectId).select('nombre').lean();
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
      curso_nombre: curso ? curso.nombre : 'Curso desconocido',
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

    // Validaciones básicas
    if (!curso_id || !Array.isArray(estudiantes) || estudiantes.length === 0) {
      return res.status(400).json({ error: 'Debe enviar curso_id y una lista de estudiantes con su estado.' });
    }

    if (!mongoose.Types.ObjectId.isValid(curso_id)) {
      return res.status(400).json({ error: 'ID de curso inválido.' });
    }

    // ✅ Normalización de la fecha
    // Si el frontend la envía, la usamos directamente.
    // Si no, se usa la actual. En ambos casos, formato YYYY-MM-DD.
    let fechaNormalizada;
    if (fecha && typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha.trim())) {
      fechaNormalizada = fecha.trim(); // usar tal cual (sin alterar)
    } else {
      const hoy = new Date();
      const yyyy = hoy.getFullYear();
      const mm = String(hoy.getMonth() + 1).padStart(2, '0');
      const dd = String(hoy.getDate()).padStart(2, '0');
      fechaNormalizada = `${yyyy}-${mm}-${dd}`;
    }

    // Verificar que el curso exista
    const curso = await Curso.findById(curso_id).select('nombre paralelo').lean();
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado.' });
    }

    // Detectar los ausentes
    const inasistentes = estudiantes
      .filter(e => e.estado === 'Ausente')
      .map(e => new mongoose.Types.ObjectId(e.id));

    console.log("➡️ Inasistentes detectados:", inasistentes);

    // Ejecutar operaciones en bloque (insertar/actualizar)
    const operaciones = estudiantes.map(est => ({
      updateOne: {
        filter: {
          curso_id: curso_id,
          estudiante_id: new mongoose.Types.ObjectId(est.id),
          fecha: fechaNormalizada
        },
        update: { $set: { estado: est.estado } },
        upsert: true
      }
    }));

    const resultado = await Asistencia.bulkWrite(operaciones);

    // Buscar correos solo de los ausentes
    if (inasistentes.length > 0) {
      console.log("🔍 Buscando correos de los ausentes...");
      const ausentesInfo = await Usuario.find({ _id: { $in: inasistentes } })
        .select("nombres apellidos email")
        .lean();

      console.log("🧾 Usuarios encontrados:", ausentesInfo);

      for (const user of ausentesInfo) {
        if (!user.email) {
          console.warn(`⚠️ El estudiante ${user.nombres} ${user.apellidos} no tiene campo "email" en su registro.`);
          continue;
        }

        const asunto = `Notificación de Inasistencia - ${curso.nombre} ${curso.paralelo}`;
        const mensaje = `
          <div style="font-family: 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f7fa; padding: 30px;">
            <div style="max-width: 600px; margin: auto; background: #ffffff; border-radius: 10px; box-shadow: 0 3px 8px rgba(0,0,0,0.05); overflow: hidden;">
              <div style=" background: linear-gradient(90deg, #007bff, #0056b3); color: white; padding: 15px 25px; font-size: 18px; font-weight: bold; text-align: center; letter-spacing: 0.5px;">
                Notificación de Inasistencia
              </div>
              <div style="padding: 25px; color: #333333;">
                <p>Estimado/a <strong>${user.nombres} ${user.apellidos}</strong>,</p>
                <p>
                  Se ha registrado una <strong>inasistencia</strong> el día 
                  <strong>${fechaNormalizada}</strong> en el curso 
                  <strong>${curso.nombre} ${curso.paralelo}</strong>.
                </p>
                <p>
                  Por favor, justifique su ausencia si corresponde. Si considera que esta notificación es un error,
                  comuníquese con el docente o el área administrativa.
                </p>
                <div style="border-left: 4px solid #007bff; padding-left: 10px; margin: 20px 0; color: #555; font-style: italic;">
                  “La asistencia constante es clave para tu éxito académico.”
                </div>
                <p style="margin-top: 30px;">Atentamente,</p>
                <p style="font-weight: bold; color: #007bff;">Sistema Escolar</p>
              </div>
              <div style="background-color: #f0f3f7; padding: 10px; text-align: center; font-size: 12px; color: #777;">
                © ${new Date().getFullYear()} Sistema Escolar - Todos los derechos reservados.
              </div>
            </div>
          </div>
        `;

        console.log(`Intentando enviar correo a: ${user.email} ...`);
        try {
          await enviarCorreo(user.email, asunto, mensaje);
          console.log(`Correo enviado correctamente a ${user.email}`);
        } catch (err) {
          console.error(`Error al enviar correo a ${user.email}:`, err.message);
        }
      }
    } else {
      console.log("✅ No hay ausentes, no se envían correos.");
    }

    // Contar estados
    const total_presentes = estudiantes.filter(e => e.estado === 'Presente').length;
    const total_ausentes = estudiantes.filter(e => e.estado === 'Ausente').length;
    const total_justificados = estudiantes.filter(e => e.estado === 'Justificado').length;

    // Respuesta final
    res.status(200).json({
      mensaje: `Asistencia registrada para el curso ${curso.nombre} ${curso.paralelo}`,
      fecha: fechaNormalizada,
      total_estudiantes: estudiantes.length,
      total_presentes,
      total_ausentes,
      total_justificados,
      resumen_db: {
        insertados: resultado.upsertedCount,
        modificados: resultado.modifiedCount
      },
      correos_enviados: inasistentes.length
    });

  } catch (error) {
    console.error('Error al registrar asistencia:', error);
    res.status(500).json({ error: 'Error interno al registrar asistencia.' });
  }
};

module.exports = { obtenerAsistenciaCurso, registrarAsistenciaCurso };
