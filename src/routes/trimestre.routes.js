const express = require('express');
const router = express.Router();
const trimestreController = require('../controllers/trimestre.controller');

router.post('/add', trimestreController.crearTrimestresPorCurso);
router.get('/:id', trimestreController.obtenerTrimestreDetallado);

module.exports = router;
