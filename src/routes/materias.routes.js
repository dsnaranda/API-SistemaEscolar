const express = require('express');
const router = express.Router();
const materiaController = require('../controllers/materias.controller');

router.post('/add', materiaController.crearMaterias);
router.get('/curso/:cursoId', materiaController.obtenerMateriasPorCurso);

module.exports = router;
