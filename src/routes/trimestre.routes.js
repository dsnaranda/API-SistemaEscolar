const express = require('express');
const router = express.Router();
const trimestreController = require('../controllers/trimestre.controller');

router.post('/add', trimestreController.crearTrimestresPorCurso);
router.get('/:id', trimestreController.obtenerTrimestreDetallado);
router.put('/cerrar/:trimestre_id', trimestreController.cerrarTrimestreIndividual);
router.put('/cerrar-materia', trimestreController.cerrarTrimestresPorMateria);
router.get('/verificar/materia/:materia_id', trimestreController.verificarTrimestresPorMateria);
router.post('/crearPorMateria', trimestreController.crearTrimestresPorMateria);

module.exports = router;
