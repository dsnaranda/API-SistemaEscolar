const Trimestre = require('../models/trimestres.models');
const Materia = require('../models/materias.models');
const Curso = require('../models/cursos.models');
const Usuario = require('../models/usuarios.models');
const mongoose = require('mongoose');
const connectDB = require('../config/db');

// Crear trimestres masivamente para todas las materias y estudiantes del curso
const crearTrimestresPorCurso = async (req, res) => {
  try {
    await connectDB();
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

    // Buscar curso y estudiantes
    const curso = await Curso.findById(curso_id).populate('estudiantes');
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    // Buscar materias del curso
    const materias = await Materia.find({ curso_id });
    if (materias.length === 0) {
      return res.status(404).json({ error: 'No hay materias asociadas a este curso' });
    }

    // Plantilla de parámetros base
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

    // Validaciones antes de insertar
    for (const materia of materias) {
      for (const estudiante of curso.estudiantes) {
        // Buscar si ya tiene trimestres en esa materia
        const existentes = await Trimestre.find({
          materia_id: materia._id,
          estudiante_id: estudiante._id
        });

        // Limitar máximo 3 trimestres por estudiante
        if (existentes.length >= 3) {
          console.log(`${estudiante.nombres} ${estudiante.apellidos} ya tiene 3 trimestres en ${materia.nombre}`);
          continue;
        }

        // Evitar duplicado del mismo número
        const yaExisteNumero = existentes.some(t => t.numero === numero);
        if (yaExisteNumero) {
          console.log(`El trimestre ${numero} ya existe para ${estudiante.nombres} en ${materia.nombre}`);
          continue;
        }

        // Crear copia independiente de los parámetros
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

    // Si no hay nada que insertar
    if (nuevosTrimestres.length === 0) {
      return res.status(400).json({
        mensaje: 'No se crearon trimestres porque ya existen o se alcanzó el límite de 3 por materia.'
      });
    }

    // Insertar en bloque
    const resultado = await Trimestre.insertMany(nuevosTrimestres);

    res.status(201).json({
      mensaje: `Se crearon ${resultado.length} trimestres (número ${numero}) para el curso ${curso.nombre} ${curso.paralelo}`,
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
    await connectDB();
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID de trimestre inválido' });
    }

    // Buscar el trimestre
    const trimestre = await Trimestre.findById(id).lean();
    if (!trimestre) {
      return res.status(404).json({ error: 'Trimestre no encontrado' });
    }

    // Obtener estudiante
    const estudiante = await Usuario.findById(trimestre.estudiante_id).lean();
    const nombreEstudiante = estudiante
      ? `${estudiante.nombres} ${estudiante.apellidos}`
      : 'Estudiante no encontrado';

    // Obtener materia y curso + docente
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

    // Responder con toda la información
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

const cerrarTrimestreIndividual = async (req, res) => {
  try {
    await connectDB();
    const { trimestre_id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(trimestre_id)) {
      return res.status(400).json({ error: 'ID de trimestre inválido.' });
    }

    // Buscar el trimestre
    const trimestre = await Trimestre.findById(trimestre_id);
    if (!trimestre) {
      return res.status(404).json({ error: 'Trimestre no encontrado.' });
    }

    // Validar que todos los parámetros tengan promedio_parametro != null
    const incompletos = trimestre.parametros.filter(p => p.promedio_parametro === null);

    if (incompletos.length > 0) {
      return res.status(400).json({
        error: 'El trimestre no puede cerrarse. Existen parámetros sin promedio.',
        parametros_pendientes: incompletos.map(p => p.nombre)
      });
    }

    // Solo cambiar estado (el trigger hará el cálculo)
    await Trimestre.updateOne(
      { _id: trimestre_id },
      { $set: { estado: 'cerrado' } }
    );

    res.status(200).json({
      mensaje: 'Trimestre cerrado correctamente.',
      trimestre_id
    });
  } catch (error) {
    console.error('Error al cerrar trimestre individual:', error);
    res.status(500).json({ error: 'Error interno al cerrar trimestre.' });
  }
};


const cerrarTrimestresPorMateria = async (req, res) => {
  try {
    await connectDB();
    const { materia_id, numero } = req.body;

    if (!materia_id || !numero) {
      return res.status(400).json({ error: 'Debe enviar materia_id y número de trimestre.' });
    }

    if (!mongoose.Types.ObjectId.isValid(materia_id)) {
      return res.status(400).json({ error: 'ID de materia inválido.' });
    }

    // Buscar trimestres abiertos de esa materia y número
    const trimestres = await Trimestre.find({ materia_id, numero, estado: 'abierto' });

    if (trimestres.length === 0) {
      return res.status(404).json({ error: 'No hay trimestres abiertos para cerrar.' });
    }

    const cerrados = [];
    const pendientes = [];

    for (const trimestre of trimestres) {
      const incompletos = trimestre.parametros.filter(p => p.promedio_parametro === null);

      if (incompletos.length > 0) {
        pendientes.push({
          estudiante_id: trimestre.estudiante_id,
          parametros_pendientes: incompletos.map(p => p.nombre)
        });
        continue;
      }

      // Cambiar estado (el trigger hará el cálculo)
      await Trimestre.updateOne(
        { _id: trimestre._id },
        { $set: { estado: 'cerrado' } }
      );

      cerrados.push(trimestre._id);
    }

    res.status(200).json({
      mensaje: 'Cierre de trimestres completado.',
      total_trimestres: trimestres.length,
      cerrados: cerrados.length,
      pendientes: pendientes.length,
      detalles_pendientes: pendientes
    });
  } catch (error) {
    console.error('Error al cerrar trimestres por materia:', error);
    res.status(500).json({ error: 'Error interno al cerrar trimestres.' });
  }
};

const verificarTrimestresPorMateria = async (req, res) => {
  try {
    await connectDB();
    const { materia_id } = req.params;

    if (!materia_id) {
      return res.status(400).json({ error: 'Debe enviar materia_id.' });
    }

    if (!mongoose.Types.ObjectId.isValid(materia_id)) {
      return res.status(400).json({ error: 'ID de materia inválido.' });
    }

    // Buscar la materia
    const materia = await Materia.findById(materia_id).lean();
    if (!materia) {
      return res.status(404).json({ error: 'Materia no encontrada.' });
    }

    // Buscar curso asociado
    const curso = await Curso.findById(materia.curso_id).lean();
    if (!curso) {
      return res.status(404).json({ error: 'Curso asociado no encontrado.' });
    }

    // Buscar todos los trimestres de esa materia
    const trimestres = await Trimestre.find({ materia_id })
      .select('_id numero estudiante_id estado')
      .lean();

    // Agrupar por número de trimestre
    const grupo = {
      1: trimestres.filter(t => t.numero === 1).map(t => t._id),
      2: trimestres.filter(t => t.numero === 2).map(t => t._id),
      3: trimestres.filter(t => t.numero === 3).map(t => t._id),
    };

    // Construir respuesta
    const respuesta = {
      curso: `${curso.nombre} ${curso.paralelo}`,
      materia: materia.nombre,
      descripcion: materia.descripcion,
      trimestres: {
        trimestre_1: grupo[1].length > 0
          ? {
              existe: true,
              cantidad: grupo[1].length,
              ids: grupo[1],
              mensaje: 'Trimestre 1 ya creado para esta materia.'
            }
          : { existe: false, mensaje: 'Trimestre 1 aún no ha sido creado.' },
        trimestre_2: grupo[2].length > 0
          ? {
              existe: true,
              cantidad: grupo[2].length,
              ids: grupo[2],
              mensaje: 'Trimestre 2 ya creado para esta materia.'
            }
          : { existe: false, mensaje: 'Trimestre 2 aún no ha sido creado.' },
        trimestre_3: grupo[3].length > 0
          ? {
              existe: true,
              cantidad: grupo[3].length,
              ids: grupo[3],
              mensaje: 'Trimestre 3 ya creado para esta materia.'
            }
          : { existe: false, mensaje: 'Trimestre 3 aún no ha sido creado.' },
      }
    };

    res.status(200).json(respuesta);

  } catch (error) {
    console.error('Error al verificar trimestres por materia:', error);
    res.status(500).json({ error: 'Error interno al verificar trimestres por materia.' });
  }
};


module.exports = { crearTrimestresPorCurso, obtenerTrimestreDetallado, cerrarTrimestreIndividual, cerrarTrimestresPorMateria, verificarTrimestresPorMateria };