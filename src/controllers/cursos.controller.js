const Curso = require('../models/cursos.models');
const Usuario = require('../models/usuarios.models');
const Materia = require('../models/materias.models');
const Trimestre = require('../models/trimestres.models');
const mongoose = require('mongoose');
const connectDB = require('../config/db');

// Crear un nuevo curso
const crearCurso = async (req, res) => {
  try {
    await connectDB();
    const { nombre, nivel, paralelo, docente_id } = req.body;

    // Validar campos obligatorios
    if (!nombre || !nivel || !paralelo || !docente_id) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    // Verificar si el docente existe y tiene rol docente
    const docente = await Usuario.findById(docente_id);
    if (!docente || docente.rol !== 'docente') {
      return res.status(400).json({ error: 'El docente_id no es válido o no pertenece a un docente' });
    }

    // Verificar si el docente ya dicta exactamente ese mismo curso
    const cursoExistente = await Curso.findOne({
      nombre,
      nivel,
      paralelo,
      docente_id
    });

    if (cursoExistente) {
      return res.status(400).json({
        error: `El docente ${docente.nombres} ${docente.apellidos} ya tiene asignado el curso ${nombre} ${paralelo}`
      });
    }

    // Verificar que no exista otro curso con el mismo nombre/nivel/paralelo
    // (independientemente del docente)
    const duplicadoGeneral = await Curso.findOne({ nombre, nivel, paralelo });
    if (duplicadoGeneral) {
      return res.status(400).json({
        error: `Ya existe un curso ${nombre} ${paralelo} en el nivel ${nivel}`
      });
    }

    // Crear nuevo curso
    const nuevoCurso = new Curso({
      nombre,
      nivel,
      paralelo,
      docente_id,
      estudiantes: []
    });

    await nuevoCurso.save();

    res.status(201).json({
      mensaje: 'Curso creado correctamente',
      curso: {
        id: nuevoCurso._id,
        nombre: nuevoCurso.nombre,
        nivel: nuevoCurso.nivel,
        paralelo: nuevoCurso.paralelo,
        docente: `${docente.nombres} ${docente.apellidos}`
      }
    });
  } catch (error) {
    console.error('Error al crear el curso:', error);
    res.status(500).json({ error: 'Error interno al crear el curso' });
  }
};

// Obtener los cursos asignados a un docente (incluye total_materias en la respuesta)
const obtenerCursosPorDocente = async (req, res) => {
  try {
    await connectDB();

    const { docente_id } = req.params;

    // Validar que se envíe el ID
    if (!docente_id) {
      return res.status(400).json({ error: 'El ID del docente es obligatorio' });
    }

    // Verificar si el docente existe y tiene rol docente
    const docente = await Usuario.findById(docente_id);
    if (!docente) {
      return res.status(404).json({ error: 'No se encontró el docente' });
    }

    if (docente.rol !== 'docente') {
      return res.status(400).json({ error: 'El usuario no es un docente' });
    }

    // Buscar todos los cursos donde el docente esté asignado
    const cursos = await Curso.find({ docente_id });

    if (!cursos || cursos.length === 0) {
      return res.status(200).json({
        mensaje: `El docente ${docente.nombres} ${docente.apellidos} no tiene cursos asignados.`,
        cursos: []
      });
    }

    // Contar materias por curso. OJO con el tipo de curso_id en Materia (puede ser string u ObjectId)
    const cursosConMaterias = await Promise.all(
      cursos.map(async (curso) => {
        const idObj = curso._id;
        const idStr = String(curso._id);

        const totalMaterias = await Materia.countDocuments({
          $or: [{ curso_id: idObj }, { curso_id: idStr }]
        });

        return {
          id: curso._id,
          nombre: curso.nombre,
          nivel: curso.nivel,
          paralelo: curso.paralelo,
          total_estudiantes: Array.isArray(curso.estudiantes) ? curso.estudiantes.length : 0,
          total_materias: totalMaterias
        };
      })
    );

    res.status(200).json({
      mensaje: `Cursos asignados al docente ${docente.nombres} ${docente.apellidos}`,
      total: cursosConMaterias.length,
      cursos: cursosConMaterias
    });
  } catch (error) {
    console.error('Error al obtener los cursos del docente:', error);
    res.status(500).json({ error: 'Error interno al obtener los cursos' });
  }
};

const finalizarPromediosCurso = async (req, res) => {
  try {
    await connectDB();
    const { curso_id, estudiante_id } = req.body;

    if (!curso_id) {
      return res.status(400).json({ error: 'Debe enviar el curso_id.' });
    }

    if (!mongoose.Types.ObjectId.isValid(curso_id)) {
      return res.status(400).json({ error: 'ID de curso inválido.' });
    }

    // 🔹 Buscar curso
    const curso = await Curso.findById(curso_id).lean();
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado.' });
    }

    // 🔹 Buscar materias del curso
    const materias = await Materia.find({ curso_id }).lean();
    if (materias.length === 0) {
      return res.status(400).json({ error: 'El curso no tiene materias registradas.' });
    }

    // 🔹 Buscar trimestres de todas las materias del curso
    const materiaIds = materias.map(m => m._id.toString());
    const Trimestre = require('../models/trimestres.models');
    const trimestres = await Trimestre.find({ materia_id: { $in: materiaIds } }).lean();

    if (trimestres.length === 0) {
      return res.status(400).json({ error: 'No se encontraron trimestres para las materias del curso.' });
    }

    // 🔹 Estudiantes a procesar
    const estudiantesProcesar = estudiante_id
      ? [estudiante_id]
      : curso.estudiantes.map(e => e.toString());

    const resultados = [];
    const pendientes = [];
    const yaGuardados = [];

    console.log('📘 Procesando curso:', curso.nombre);
    console.log('🔹 Estudiantes en curso:', estudiantesProcesar.length);
    console.log('🔹 Materias encontradas:', materias.length);
    console.log('🔹 Trimestres encontrados:', trimestres.length);

    // =======================================================
    for (const estId of estudiantesProcesar) {
      // Obtener trimestres del estudiante
      const trimestresEst = trimestres.filter(
        t => t.estudiante_id?.toString() === estId.toString()
      );

      if (trimestresEst.length < 3) {
        pendientes.push(estId);
        continue;
      }

      // Agrupar por materia
      const materiasPorEst = {};
      for (const t of trimestresEst) {
        const materiaId = t.materia_id?.toString();
        if (!materiasPorEst[materiaId]) materiasPorEst[materiaId] = [];
        materiasPorEst[materiaId].push(t);
      }

      const promediosMaterias = [];

      // Calcular promedio de cada materia
      for (const materiaId in materiasPorEst) {
        const trimestresMat = materiasPorEst[materiaId];

        const cerrados = trimestresMat.filter(t => t.estado === 'cerrado');
        if (cerrados.length < 3) {
          console.log(`⚠️ Estudiante ${estId} tiene trimestres sin cerrar en materia ${materiaId}`);
          continue;
        }

        const promedioMateria = cerrados.reduce(
          (acc, t) => acc + (t.promedio_trimestre || 0),
          0
        ) / cerrados.length;

        // Buscar nombre de la materia
        const nombreMateria = materias.find(m => m._id.toString() === materiaId)?.nombre || 'Materia desconocida';

        promediosMaterias.push({
          materia_id: materiaId,
          materia_nombre: nombreMateria,
          promedio_materia: Number(promedioMateria.toFixed(2))
        });
      }

      if (promediosMaterias.length === 0) {
        pendientes.push(estId);
        continue;
      }

      // Promedio del curso = promedio de los promedios de materia
      const sumaTotal = promediosMaterias.reduce((a, m) => a + m.promedio_materia, 0);
      const promedioFinal = Number((sumaTotal / promediosMaterias.length).toFixed(2));
      const estado = promedioFinal >= 7 ? 'Aprobado' : 'Reprobado';

      // Verificar duplicado
      const yaExiste = curso.notas_finales?.some(
        nf => nf.estudiante_id.toString() === estId.toString()
      );
      if (yaExiste) {
        yaGuardados.push(estId);
        continue;
      }

      // Guardar resultado completo
      await Curso.updateOne(
        { _id: curso_id },
        {
          $addToSet: {
            notas_finales: {
              estudiante_id: new mongoose.Types.ObjectId(estId),
              promedio_curso: promedioFinal,
              estado,
              detalle_materias: promediosMaterias
            }
          }
        }
      );

      console.log(`✅ Estudiante ${estId} - promedio final: ${promedioFinal} (${estado})`);

      resultados.push({
        estudiante_id: estId,
        promedio_curso: promedioFinal,
        estado,
        detalle_materias: promediosMaterias
      });
    }

    // =======================================================
    res.status(200).json({
      mensaje: 'Promedios del curso calculados correctamente.',
      curso_id,
      procesados: resultados.length,
      pendientes: pendientes.length,
      ya_guardados: yaGuardados.length,
      detalles: {
        guardados: resultados,
        pendientes,
        ya_guardados: yaGuardados
      }
    });
  } catch (error) {
    console.error('❌ Error al finalizar promedios del curso:', error);
    res.status(500).json({ error: 'Error interno al finalizar promedios del curso.' });
  }
};

const getCartillaNotas = async (req, res) => {
  try {
    await connectDB(); // ✅ conexión asegurada antes de cualquier consulta

    const { id } = req.params;
    const curso = await Curso.findById(id).lean();
    if (!curso) {
      return res.status(404).json({ mensaje: 'Curso no encontrado.' });
    }

    if (!curso.notas_finales || curso.notas_finales.length === 0) {
      return res.status(200).json({
        mensaje: 'El curso no tiene notas registradas aún.',
        curso_id: id,
        total_estudiantes: 0,
        cartilla: []
      });
    }

    const idsEstudiantes = curso.notas_finales.map(n => n.estudiante_id);
    const estudiantes = await Usuario.find({ _id: { $in: idsEstudiantes } })
      .select('_id nombres apellidos')
      .lean();

    const cartilla = curso.notas_finales.map(nota => {
      const estudiante = estudiantes.find(e => e._id.toString() === nota.estudiante_id.toString());
      return {
        estudiante_id: nota.estudiante_id,
        nombre_estudiante: estudiante
          ? `${estudiante.nombres} ${estudiante.apellidos}`
          : 'Desconocido',
        promedio_curso: nota.promedio_curso,
        estado: nota.estado,
        detalle_materias: nota.detalle_materias.map(m => ({
          materia_id: m.materia_id,
          materia_nombre: m.materia_nombre,
          promedio_materia: m.promedio_materia
        }))
      };
    });

    return res.status(200).json({
      mensaje: 'Cartilla final del curso obtenida correctamente.',
      curso_id: id,
      total_estudiantes: cartilla.length,
      cartilla
    });

  } catch (error) {
    console.error('Error al obtener cartilla de notas:', error);
    return res.status(500).json({
      mensaje: 'Error al obtener cartilla final del curso.',
      error: error.message
    });
  }
};

// Obtener los cursos donde un estudiante está matriculado
const obtenerCursosPorEstudiante = async (req, res) => {
  try {
    await connectDB();
    const { estudiante_id } = req.params;

    if (!estudiante_id) {
      return res.status(400).json({ error: 'El ID del estudiante es obligatorio.' });
    }

    if (!mongoose.Types.ObjectId.isValid(estudiante_id)) {
      return res.status(400).json({ error: 'ID de estudiante inválido.' });
    }

    // Buscar el estudiante y validar rol
    const estudiante = await Usuario.findById(estudiante_id).lean();
    if (!estudiante) {
      return res.status(404).json({ error: 'Estudiante no encontrado.' });
    }

    if (estudiante.rol !== 'estudiante') {
      return res.status(400).json({ error: 'El usuario no tiene rol de estudiante.' });
    }

    // Buscar todos los cursos donde figure en la lista de estudiantes
    const cursos = await Curso.find({ estudiantes: estudiante_id })
      .populate('docente_id', 'nombres apellidos correo')
      .lean();

    if (cursos.length === 0) {
      return res.status(200).json({
        mensaje: `${estudiante.nombres} ${estudiante.apellidos} no está matriculado en ningún curso.`,
        cursos: []
      });
    }

    // Para cada curso, contar materias
    const cursosDetalle = await Promise.all(
      cursos.map(async (curso) => {
        const totalMaterias = await Materia.countDocuments({
          $or: [{ curso_id: curso._id }, { curso_id: String(curso._id) }]
        });

        return {
          id: curso._id,
          nombre: curso.nombre,
          nivel: curso.nivel,
          paralelo: curso.paralelo,
          total_materias: totalMaterias,
          total_estudiantes: curso.estudiantes?.length || 0,
          docente: curso.docente_id
            ? `${curso.docente_id.nombres} ${curso.docente_id.apellidos}`
            : 'Sin docente asignado'
        };
      })
    );

    res.status(200).json({
      mensaje: `Cursos donde está matriculado ${estudiante.nombres} ${estudiante.apellidos}`,
      total: cursosDetalle.length,
      cursos: cursosDetalle
    });
  } catch (error) {
    console.error('Error al obtener cursos del estudiante:', error);
    res.status(500).json({ error: 'Error interno al obtener cursos del estudiante.' });
  }
};

const obtenerTodosLosCursos = async (req, res) => {
  try {
    await connectDB();

    const cursos = await Curso.find().populate('docente_id', 'nombres apellidos').lean();

    if (!cursos || cursos.length === 0) {
      return res.status(200).json({
        mensaje: 'No hay cursos registrados actualmente.',
        cursos: []
      });
    }

    const cursosDetalle = await Promise.all(
      cursos.map(async (curso) => {
        const totalMaterias = await Materia.countDocuments({
          $or: [{ curso_id: curso._id }, { curso_id: String(curso._id) }]
        });

        return {
          id: curso._id,
          nombre: curso.nombre,
          nivel: curso.nivel,
          paralelo: curso.paralelo,
          total_estudiantes: curso.estudiantes?.length || 0,
          total_materias: totalMaterias,
          docente: curso.docente_id
            ? `${curso.docente_id.nombres} ${curso.docente_id.apellidos}`
            : 'Sin docente'
        };
      })
    );

    res.status(200).json({
      mensaje: 'Lista completa de cursos registrados.',
      total: cursosDetalle.length,
      cursos: cursosDetalle
    });
  } catch (error) {
    console.error('Error al obtener todos los cursos:', error);
    res.status(500).json({ error: 'Error interno al obtener todos los cursos.' });
  }
};


module.exports = { crearCurso, finalizarPromediosCurso, obtenerCursosPorDocente, obtenerCursosPorEstudiante, obtenerTodosLosCursos, getCartillaNotas };
