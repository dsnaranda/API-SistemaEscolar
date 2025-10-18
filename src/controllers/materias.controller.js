const mongoose = require('mongoose');
const Materia = require('../models/materias.models');
const Curso = require('../models/cursos.models');

// Crear una o varias materias asociadas a un curso
const crearMaterias = async (req, res) => {
  try {
    const { curso_id, materias } = req.body;

    // Validar datos de entrada
    if (!curso_id || !Array.isArray(materias) || materias.length === 0) {
      return res.status(400).json({ error: 'Debe enviar un curso_id y un arreglo de materias' });
    }

    // Verificar que el curso exista
    const curso = await Curso.findById(curso_id);
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    // Crear las materias con el mismo curso_id
    const nuevasMaterias = materias.map((m) => ({
      nombre: m.nombre,
      descripcion: m.descripcion,
      trimestres: [],
      promedio_final: null,
      curso_id
    }));

    const resultado = await Materia.insertMany(nuevasMaterias);

    res.status(201).json({
      mensaje: `✅ ${resultado.length} materia(s) agregada(s) correctamente al curso ${curso.nombre} ${curso.paralelo}`,
      materias: resultado.map(m => ({
        id: m._id,
        nombre: m.nombre,
        descripcion: m.descripcion
      }))
    });
  } catch (error) {
    console.error('Error al crear materias:', error);
    res.status(500).json({ error: 'Error al crear materias' });
  }
};

// Obtener materias por curso
const obtenerMateriasPorCurso = async (req, res) => {
  try {
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

module.exports = { crearMaterias, obtenerMateriasPorCurso };
