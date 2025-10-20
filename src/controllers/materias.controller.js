const mongoose = require('mongoose');
const Materia = require('../models/materias.models');
const Curso = require('../models/cursos.models');
const Trimestre = require('../models/trimestres.models');
const connectDB = require('../config/db');

// Crear una o varias materias asociadas a un curso
const crearMaterias = async (req, res) => {
  try {
    await connectDB();
    const { curso_id, materias } = req.body;

    // Validar datos de entrada
    if (!curso_id || !Array.isArray(materias) || materias.length === 0) {
      return res.status(400).json({ error: 'Debe enviar un curso_id y un arreglo de materias.' });
    }

    // Verificar que el curso exista
    const curso = await Curso.findById(curso_id);
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado.' });
    }

    // Normalizar nombres de materias (para comparar sin mayúsculas/minúsculas)
    const nombresNuevos = materias.map(m => m.nombre.trim().toLowerCase());

    // Buscar materias existentes en ese curso con esos nombres
    const existentes = await Materia.find({
      curso_id,
      nombre: { $in: nombresNuevos.map(n => new RegExp(`^${n}$`, 'i')) }
    }).lean();

    if (existentes.length > 0) {
      return res.status(400).json({
        error: 'Una o más materias ya existen en este curso.',
        duplicadas: existentes.map(e => e.nombre)
      });
    }

    // Crear las materias nuevas
    const nuevasMaterias = materias.map((m) => ({
      nombre: m.nombre.trim(),
      descripcion: m.descripcion?.trim() || '',
      trimestres: [],
      promedio_final: null,
      curso_id
    }));

    const resultado = await Materia.insertMany(nuevasMaterias);

    res.status(201).json({
      mensaje: `${resultado.length} materia(s) agregada(s) correctamente al curso ${curso.nombre} ${curso.paralelo}`,
      materias: resultado.map(m => ({
        id: m._id,
        nombre: m.nombre,
        descripcion: m.descripcion
      }))
    });
  } catch (error) {
    console.error('Error al crear materias:', error);
    res.status(500).json({ error: 'Error al crear materias.' });
  }
};

// Obtener materias por curso
const obtenerMateriasPorCurso = async (req, res) => {
  try {
    await connectDB();
    const { cursoId } = req.params;

    // Validar ID de curso
    if (!mongoose.Types.ObjectId.isValid(cursoId)) {
      return res.status(400).json({ error: 'ID de curso inválido' });
    }

    // Convertir el string a ObjectId
    const objectId = new mongoose.Types.ObjectId(cursoId);

    // Buscar las materias que correspondan a ese curso
    const materias = await Materia.find({ curso_id: objectId });

    if (!materias || materias.length === 0) {
      return res.status(404).json({ mensaje: 'No se encontraron materias para este curso' });
    }

    res.status(200).json(materias);
  } catch (error) {
    console.error('Error al obtener materias:', error);
    res.status(500).json({ error: 'Error al obtener materias' });
  }
};


const cerrarMateriaPorEstudiante = async (req, res) => {
  try {
    await connectDB();
    const { materia_id, estudiante_id } = req.body;

    if (!materia_id || !estudiante_id) {
      return res.status(400).json({ error: 'Debe enviar materia_id y estudiante_id.' });
    }

    if (!mongoose.Types.ObjectId.isValid(materia_id) || !mongoose.Types.ObjectId.isValid(estudiante_id)) {
      return res.status(400).json({ error: 'Alguno de los IDs no es válido.' });
    }

    // Buscar la materia
    const materia = await Materia.findById(materia_id);
    if (!materia) {
      return res.status(404).json({ error: 'Materia no encontrada.' });
    }

    // Buscar los 3 trimestres cerrados de ese estudiante en esa materia
    const trimestres = await Trimestre.find({
      materia_id,
      estudiante_id,
      estado: 'cerrado'
    }).lean();

    if (trimestres.length < 3) {
      return res.status(400).json({
        error: 'El estudiante no tiene los 3 trimestres cerrados.',
        trimestres_registrados: trimestres.length
      });
    }

    // Validar que todos tengan promedio_trimestre calculado
    const incompletos = trimestres.filter(t => t.promedio_trimestre === null);
    if (incompletos.length > 0) {
      return res.status(400).json({
        error: 'No se puede cerrar la materia. Existen trimestres sin promedio.',
        trimestres_incompletos: incompletos.map(t => t.numero)
      });
    }

    // Calcular promedio final (media aritmética de los 3 trimestres)
    const promedio_final = trimestres.reduce((acc, t) => acc + t.promedio_trimestre, 0) / 3;

    // Registrar o actualizar promedio del estudiante dentro de la materia
    const yaExiste = materia.promedios_estudiantes?.find(
      e => e.estudiante_id.toString() === estudiante_id
    );

    if (yaExiste) {
      yaExiste.promedio_final = Number(promedio_final.toFixed(2));
    } else {
      if (!materia.promedios_estudiantes) materia.promedios_estudiantes = [];
      materia.promedios_estudiantes.push({
        estudiante_id,
        promedio_final: Number(promedio_final.toFixed(2))
      });
    }

    await materia.save();

    res.status(200).json({
      mensaje: 'Materia cerrada para el estudiante.',
      materia_id,
      estudiante_id,
      promedio_final: Number(promedio_final.toFixed(2))
    });
  } catch (error) {
    console.error('Error al cerrar materia:', error);
    res.status(500).json({ error: 'Error interno al cerrar materia.' });
  }
};


module.exports = { crearMaterias, obtenerMateriasPorCurso, cerrarMateriaPorEstudiante };
