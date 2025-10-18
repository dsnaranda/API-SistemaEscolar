const Trimestre = require('../models/trimestres.models');
const Materia = require('../models/materias.models');
const Curso = require('../models/cursos.models');
const Usuario = require('../models/usuarios.models');
const mongoose = require('mongoose');

// Crear trimestres masivamente para todas las materias y estudiantes del curso
const crearTrimestresPorCurso = async (req, res) => {
  try {
    const { curso_id, numero } = req.body;

    if (!curso_id || !numero) {
      return res.status(400).json({ error: 'Debe enviar curso_id y número de trimestre' });
    }

    if (![1, 2, 3].includes(numero)) {
      return res.status(400).json({ error: 'El número de trimestre solo puede ser 1, 2 o 3' });
    }

    if (!mongoose.Types.ObjectId.isValid(curso_id)) {
      return res.status(400).json({ error: 'curso_id inválido' });
    }

    // 1️⃣ Buscar curso y estudiantes
    const curso = await Curso.findById(curso_id).populate('estudiantes');
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    // 2️⃣ Buscar materias del curso
    const materias = await Materia.find({ curso_id });
    if (materias.length === 0) {
      return res.status(404).json({ error: 'No hay materias asociadas a este curso' });
    }

    // 3️⃣ Plantilla de parámetros base
    const parametrosBase = [
      { nombre: 'Lecciones', porcentaje: 20, actividades: [], promedio_parametro: null },
      { nombre: 'Actividad intraclases', porcentaje: 20, actividades: [], promedio_parametro: null },
      { nombre: 'Tareas', porcentaje: 10, actividades: [], promedio_parametro: null },
      { nombre: 'Exposiciones', porcentaje: 10, actividades: [], promedio_parametro: null },
      { nombre: 'Talleres', porcentaje: 10, actividades: [], promedio_parametro: null },
      { nombre: 'Evaluación del periodo', porcentaje: 15, actividades: [], promedio_parametro: null },
      { nombre: 'Proyecto interdisciplinar', porcentaje: 15, actividades: [], promedio_parametro: null }
    ];

    const nuevosTrimestres = [];

    // 4️⃣ Validaciones antes de insertar
    for (const materia of materias) {
      for (const estudiante of curso.estudiantes) {
        // Buscar si ya tiene trimestres en esa materia
        const existentes = await Trimestre.find({
          materia_id: materia._id,
          estudiante_id: estudiante._id
        });

        // Limitar máximo 3 trimestres por estudiante
        if (existentes.length >= 3) {
          console.log(`⛔ ${estudiante.nombres} ${estudiante.apellidos} ya tiene 3 trimestres en ${materia.nombre}`);
          continue;
        }

        // Evitar duplicado del mismo número
        const yaExisteNumero = existentes.some(t => t.numero === numero);
        if (yaExisteNumero) {
          console.log(`⚠️ El trimestre ${numero} ya existe para ${estudiante.nombres} en ${materia.nombre}`);
          continue;
        }

        // ✅ Crear copia independiente de los parámetros
        const parametrosCopia = JSON.parse(JSON.stringify(parametrosBase));

        nuevosTrimestres.push({
          numero,
          materia_id: materia._id,
          parametros: parametrosCopia,
          promedio_trimestre: null,
          estado: 'abierto',
          estudiante_id: estudiante._id
        });
      }
    }

    // 5️⃣ Si no hay nada que insertar
    if (nuevosTrimestres.length === 0) {
      return res.status(400).json({
        mensaje: 'No se crearon trimestres porque ya existen o se alcanzó el límite de 3 por materia.'
      });
    }

    // 6️⃣ Insertar en bloque
    const resultado = await Trimestre.insertMany(nuevosTrimestres);

    res.status(201).json({
      mensaje: `✅ Se crearon ${resultado.length} trimestres (número ${numero}) para el curso ${curso.nombre} ${curso.paralelo}`,
      total_materias: materias.length,
      total_estudiantes: curso.estudiantes.length,
      creados: resultado.length
    });
  } catch (error) {
    console.error('Error al crear trimestres masivos:', error);
    res.status(500).json({ error: 'Error al crear trimestres masivos' });
  }
};


const obtenerTrimestreDetallado = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID de trimestre inválido' });
    }

    // 1️⃣ Buscar el trimestre
    const trimestre = await Trimestre.findById(id).lean();
    if (!trimestre) {
      return res.status(404).json({ error: 'Trimestre no encontrado' });
    }

    // 2️⃣ Obtener estudiante
    const estudiante = await Usuario.findById(trimestre.estudiante_id).lean();
    const nombreEstudiante = estudiante
      ? `${estudiante.nombres} ${estudiante.apellidos}`
      : 'Estudiante no encontrado';

    // 3️⃣ Obtener materia y curso + docente
    const materia = await Materia.findById(trimestre.materia_id).lean();
    let nombreMateria = 'Materia no encontrada';
    let nombreDocente = 'Docente no asignado';
    let nombreCurso = 'Curso no encontrado';

    if (materia) {
      nombreMateria = materia.nombre;
      const curso = await Curso.findById(materia.curso_id).lean();
      if (curso) {
        nombreCurso = `${curso.nombre} ${curso.paralelo}`;
        const docente = await Usuario.findById(curso.docente_id).lean();
        if (docente) {
          nombreDocente = `${docente.nombres} ${docente.apellidos}`;
        }
      }
    }

    // 4️⃣ Responder con toda la información
    res.status(200).json({
      _id: trimestre._id,
      numero: trimestre.numero,
      estado: trimestre.estado,
      promedio_trimestre: trimestre.promedio_trimestre,
      materia: nombreMateria,
      curso: nombreCurso,
      docente: nombreDocente,
      estudiante: nombreEstudiante,
      parametros: trimestre.parametros
    });
  } catch (error) {
    console.error('Error al obtener trimestre detallado:', error);
    res.status(500).json({ error: 'Error al obtener trimestre detallado' });
  }
};

module.exports = { crearTrimestresPorCurso, obtenerTrimestreDetallado };