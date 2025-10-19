const mongoose = require('mongoose');

const CursoSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  nivel: { type: String, required: true },
  paralelo: { type: String, required: true },
  docente_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  estudiantes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }],
  notas_finales: [
    {
      estudiante_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
      promedio_curso: { type: Number, required: true },
      estado: { type: String, enum: ['Aprobado', 'Reprobado'], required: true }
    }
  ]
}, {
  collection: 'cursos'
});

module.exports = mongoose.model('Curso', CursoSchema);
