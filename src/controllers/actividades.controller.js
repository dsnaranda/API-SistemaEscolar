const Actividad = require('../models/actividades.models');
const Trimestre = require('../models/trimestres.models');
const Materia = require('../models/materias.models');
const mongoose = require('mongoose');
const connectDB = require('../config/db'); // 👈 Importar conexión

// Crear una actividad para todos los trimestres de una materia en un trimestre específico
const crearActividadPorMateria = async (req, res) => {
  try {
    await connectDB();
    const { materia_id, parametro, nombre, descripcion, nota = 0, numero_trimestre } = req.body;

    // Validar datos obligatorios
    if (!materia_id || !parametro || !nombre || !descripcion || !numero_trimestre) {
      return res.status(400).json({ error: 'Debe enviar materia_id, parametro, nombre, descripcion y numero_trimestre' });
    }

    if (![1, 2, 3].includes(Number(numero_trimestre))) {
      return res.status(400).json({ error: 'El número de trimestre solo puede ser 1, 2 o 3' });
    }

    if (!mongoose.Types.ObjectId.isValid(materia_id)) {
      return res.status(400).json({ error: 'materia_id inválido' });
    }

    // Verificar que la materia exista
    const materia = await Materia.findById(materia_id);
    if (!materia) {
      return res.status(404).json({ error: 'Materia no encontrada' });
    }

    // Buscar los trimestres abiertos con ese número
    const trimestres = await Trimestre.find({
      materia_id,
      numero: numero_trimestre,
      estado: 'abierto'
    });

    if (trimestres.length === 0) {
      return res.status(404).json({
        error: `No se encontraron trimestres abiertos con el número ${numero_trimestre} para esta materia`
      });
    }

    // Crear una actividad para cada trimestre (solo los abiertos)
    const nuevasActividades = trimestres.map(t => ({
      parametro,
      trimestre_id: t._id,
      nombre,
      descripcion,
      nota,
      fecha_registro: new Date()
    }));

    const resultado = await Actividad.insertMany(nuevasActividades);

    res.status(201).json({
      mensaje: `Se crearon ${resultado.length} actividades en el trimestre ${numero_trimestre} de la materia ${materia.nombre}`,
      total_trimestres: trimestres.length,
      actividades_creadas: resultado.map(a => ({
        id: a._id,
        trimestre_id: a.trimestre_id,
        nombre: a.nombre
      }))
    });
  } catch (error) {
    console.error('Error al crear actividades:', error);
    res.status(500).json({ error: 'Error al crear actividades' });
  }
};

// Actualizar nota y fecha de calificación de una actividad
const calificarActividad = async (req, res) => {
  try {
    await connectDB();
    const { actividad_id } = req.params;
    const { nota } = req.body;

    // Validar ID y nota
    if (!mongoose.Types.ObjectId.isValid(actividad_id)) {
      return res.status(400).json({ error: 'ID de actividad inválido' });
    }

    if (nota == null || isNaN(nota)) {
      return res.status(400).json({ error: 'Debe enviar una nota válida' });
    }

    // Actualizar la actividad
    const resultado = await Actividad.findByIdAndUpdate(
      actividad_id,
      {
        $set: {
          nota: Number(nota),
          fecha_calificado: new Date()
        }
      },
      { new: true }
    );

    if (!resultado) {
      return res.status(404).json({ error: 'Actividad no encontrada' });
    }

    res.status(200).json({
      mensaje: 'Actividad calificada correctamente',
      actividad: {
        id: resultado._id,
        nombre: resultado.nombre,
        parametro: resultado.parametro,
        nota: resultado.nota,
        fecha_calificado: resultado.fecha_calificado
      }
    });
  } catch (error) {
    console.error('Error al calificar la actividad:', error);
    res.status(500).json({ error: 'Error al calificar la actividad' });
  }
};

module.exports = { crearActividadPorMateria, calificarActividad };
