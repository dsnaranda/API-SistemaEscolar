const mongoose = require('mongoose');

const AsistenciaSchema = new mongoose.Schema({
  curso_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Curso', required: true },
  estudiante_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  fecha: { type: String, required: true },
  estado: { type: String, enum: ['Presente', 'Ausente', 'Justificado'], required: true }
});

module.exports =
  mongoose.models.Asistencia ||
  mongoose.model('Asistencia', AsistenciaSchema, 'asistencia');
