const express = require('express');
const router = express.Router();
const cursoController = require('../controllers/cursos.controller');

router.post('/add', cursoController.crearCurso);
router.put('/finalizar-promedios', cursoController.finalizarPromediosCurso);

module.exports = router;
