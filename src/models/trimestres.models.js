const mongoose = require('mongoose');

const TrimestreSchema = new mongoose.Schema({
  numero: { type: Number, required: true },
  materia_id: { type: mongoose.Schema.Types.ObjectId, ref: 'materias', required: true },
  parametros: [
    {
      nombre: String,
      porcentaje: Number,
      actividades: [{ type: mongoose.Schema.Types.ObjectId, ref: 'actividades' }],
      promedio_parametro: { type: Number, default: null }
    }
  ],
  promedio_trimestre: { type: Number, default: null },
  estado: { type: String, enum: ['abierto', 'cerrado'], default: 'abierto' },
  estudiante_id: { type: mongoose.Schema.Types.ObjectId, ref: 'usuarios', required: true }
}, {
  collection: 'trimestres'
});

module.exports = mongoose.model('Trimestre', TrimestreSchema);
