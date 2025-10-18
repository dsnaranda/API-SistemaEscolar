const mongoose = require('mongoose');

const CursoSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  nivel: { type: String, required: true },
  paralelo: { type: String, required: true },
  docente_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  estudiantes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }],
}, {
  collection: 'cursos', // asegura que use la colección existente
});

module.exports = mongoose.model('Curso', CursoSchema);
