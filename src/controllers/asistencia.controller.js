const mongoose = require('mongoose');
const Curso = require('../models/cursos.models');
const Asistencia = require('../models/asistencia.models'); // <- usa la colección 'asistencia'
const Usuario = require('../models/usuarios.models');

const obtenerAsistenciaCurso = async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { fecha } = req.query;

    if (!cursoId) return res.status(400).json({ error: 'Falta cursoId en la URL' });
    if (!fecha)   return res.status(400).json({ error: 'Debes proporcionar la fecha (?fecha=YYYY-MM-DD)' });

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
    const total_ausentes  = asistencias.filter(a => a.estado === 'Ausente').length;

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
    let { curso_id, fecha, estudiantes } = req.body;

    // Validaciones básicas
    if (!curso_id || !Array.isArray(estudiantes) || estudiantes.length === 0) {
      return res.status(400).json({ error: 'Debe enviar curso_id y una lista de estudiantes con su estado.' });
    }

    if (!mongoose.Types.ObjectId.isValid(curso_id)) {
      return res.status(400).json({ error: 'ID de curso inválido.' });
    }

    // Si no se envía la fecha, usar la fecha actual
    if (!fecha) {
      const hoy = new Date();
      const yyyy = hoy.getFullYear();
      const mm = String(hoy.getMonth() + 1).padStart(2, '0');
      const dd = String(hoy.getDate()).padStart(2, '0');
      fecha = `${yyyy}-${mm}-${dd}`; // 👉 Formato "YYYY-MM-DD"
    } else {
      // Normalizar si viene con espacios
      fecha = fecha.trim();
    }

    // Verificar que el curso exista
    const curso = await Curso.findById(curso_id).select('nombre paralelo').lean();
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado.' });
    }

    // Procesar estudiantes (inserta o actualiza si ya existe ese día)
    const operaciones = estudiantes.map(est => ({
      updateOne: {
        filter: {
          curso_id: curso_id,
          estudiante_id: new mongoose.Types.ObjectId(est.id),
          fecha: fecha
        },
        update: {
          $set: {
            estado: est.estado
          }
        },
        upsert: true
      }
    }));

    // Ejecutar todas las operaciones en bloque
    const resultado = await Asistencia.bulkWrite(operaciones);

    // Contar estados
    const total_presentes = estudiantes.filter(e => e.estado === 'Presente').length;
    const total_ausentes = estudiantes.filter(e => e.estado === 'Ausente').length;
    const total_justificados = estudiantes.filter(e => e.estado === 'Justificado').length;

    res.status(200).json({
      mensaje: `Asistencia registrada para el curso ${curso.nombre} ${curso.paralelo}`,
      fecha,
      total_estudiantes: estudiantes.length,
      total_presentes,
      total_ausentes,
      total_justificados,
      resumen_db: {
        insertados: resultado.upsertedCount,
        modificados: resultado.modifiedCount
      }
    });
  } catch (error) {
    console.error('Error al registrar asistencia:', error);
    res.status(500).json({ error: 'Error interno al registrar asistencia.' });
  }
};

module.exports = { obtenerAsistenciaCurso, registrarAsistenciaCurso };
