const mongoose = require('mongoose');

const MateriaSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  descripcion: { type: String, required: true },
  trimestres: [
    {
      trimestre_id: { type: mongoose.Schema.Types.ObjectId, ref: 'trimestres' },
      numero: { type: Number },
      estudiante_id: { type: mongoose.Schema.Types.ObjectId, ref: 'usuarios' }
    }
  ],
  promedio_final: { type: Number, default: null },
  curso_id: { type: mongoose.Schema.Types.ObjectId, ref: 'cursos', required: true }
}, {
  collection: 'materias'
});

module.exports = mongoose.model('Materia', MateriaSchema);
