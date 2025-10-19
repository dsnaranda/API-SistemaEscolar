const express = require('express');
const router = express.Router();
const trimestreController = require('../controllers/trimestre.controller');

router.post('/add', trimestreController.crearTrimestresPorCurso);
router.get('/:id', trimestreController.obtenerTrimestreDetallado);
router.put('/cerrar/:trimestre_id', trimestreController.cerrarTrimestreIndividual);
router.put('/cerrar-materia', trimestreController.cerrarTrimestresPorMateria);

module.exports = router;
