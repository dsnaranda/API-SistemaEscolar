const mongoose = require('mongoose');

const ActividadSchema = new mongoose.Schema({
  parametro: { type: String, required: true },
  trimestre_id: { type: mongoose.Schema.Types.ObjectId, ref: 'trimestres', required: true },
  nombre: { type: String, required: true },
  descripcion: { type: String, required: true },
  nota: { type: Number, default: 0 },
  fecha_registro: { type: Date, default: Date.now },
  fecha_calificado: { type: Date, default: null }
}, {
  collection: 'actividades'
});

module.exports = mongoose.model('Actividad', ActividadSchema);
