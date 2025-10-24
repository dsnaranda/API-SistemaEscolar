const Curso = require('../models/cursos.models');
const Usuario = require('../models/usuarios.models');
const Materia = require('../models/materias.models');
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

    // Buscar curso
    const curso = await Curso.findById(curso_id);
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado.' });
    }

    // Buscar materias del curso
    const materias = await Materia.find({ curso_id }).lean();
    if (materias.length === 0) {
      return res.status(400).json({ error: 'El curso no tiene materias registradas.' });
    }

    // Determinar estudiantes a procesar
    const estudiantesProcesar = estudiante_id
      ? [estudiante_id]
      : curso.estudiantes.map(e => e.toString());

    const resultados = [];
    const pendientes = [];
    const yaGuardados = [];

    for (const estId of estudiantesProcesar) {
      let todasMateriasCompletas = true;
      const promediosEstudiante = [];

      // Revisar las materias de ese estudiante
      for (const materia of materias) {
        const registro = materia.promedios_estudiantes?.find(
          e => e.estudiante_id.toString() === estId
        );

        if (!registro || registro.promedio_final == null) {
          todasMateriasCompletas = false;
          break;
        }

        promediosEstudiante.push(registro.promedio_final);
      }

      if (!todasMateriasCompletas) {
        pendientes.push(estId);
        continue;
      }

      const promedio = promediosEstudiante.reduce((a, b) => a + b, 0) / promediosEstudiante.length;
      const promedioFinal = Number(promedio.toFixed(2));
      const estado = promedioFinal >= 7 ? 'Aprobado' : 'Reprobado';

      // Revisar si ya está en notas_finales
      const cursoActual = await Curso.findById(curso_id).lean();
      const yaExiste = cursoActual.notas_finales?.some(
        nf => nf.estudiante_id.toString() === estId
      );

      if (yaExiste) {
        yaGuardados.push(estId);
        continue;
      }

      // Guardar resultado en notas_finales (sin duplicar)
      await Curso.updateOne(
        { _id: curso_id },
        {
          $addToSet: {
            notas_finales: {
              estudiante_id: new mongoose.Types.ObjectId(estId),
              promedio_curso: promedioFinal,
              estado
            }
          }
        }
      );

      resultados.push({
        estudiante_id: estId,
        promedio_curso: promedioFinal,
        estado
      });
    }

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
    console.error('Error al finalizar promedios del curso:', error);
    res.status(500).json({ error: 'Error interno al finalizar promedios del curso.' });
  }
};

module.exports = { crearCurso, finalizarPromediosCurso, obtenerCursosPorDocente };
