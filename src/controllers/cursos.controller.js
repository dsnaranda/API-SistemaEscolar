const Curso = require('../models/cursos.models');
const Usuario = require('../models/usuarios.models');
const Materia = require('../models/materias.models');
const mongoose = require('mongoose');

// Crear un nuevo curso
const crearCurso = async (req, res) => {
  try {
    const { nombre, nivel, paralelo, docente_id } = req.body;

    // Validar campos
    if (!nombre || !nivel || !paralelo || !docente_id) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    // Verificar si el docente existe y es rol docente
    const docente = await Usuario.findById(docente_id);
    if (!docente || docente.rol !== 'docente') {
      return res.status(400).json({ error: 'El docente_id no es válido o no pertenece a un docente' });
    }

    // Verificar si el docente ya tiene un curso asignado
    const cursoDocente = await Curso.findOne({ docente_id });
    if (cursoDocente) {
      return res.status(400).json({
        error: `El docente ${docente.nombres} ${docente.apellidos} ya tiene asignado el curso ${cursoDocente.nombre} ${cursoDocente.paralelo}`
      });
    }

    // Verificar que el paralelo no se repita dentro del mismo nivel
    const paraleloExistente = await Curso.findOne({ nivel, paralelo });
    if (paraleloExistente) {
      return res.status(400).json({
        error: `Ya existe un curso con el paralelo ${paralelo} en el nivel ${nivel}`
      });
    }

    // Crear curso vacío con docente asignado
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

const finalizarPromediosCurso = async (req, res) => {
  try {
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

module.exports = { crearCurso, finalizarPromediosCurso };
