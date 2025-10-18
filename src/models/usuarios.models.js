const mongoose = require('mongoose');

const UsuarioSchema = new mongoose.Schema({
  nombres: { type: String, required: true },
  apellidos: { type: String, required: true },
  ci: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  rol: { type: String, required: true },
  curso_id: { type: mongoose.Schema.Types.ObjectId, ref: 'cursos', default: null },
});

module.exports = mongoose.model('Usuario', UsuarioSchema);
