const express = require('express');
const router = express.Router();
const asistenciaController = require('../controllers/asistencia.controller');

router.get('/curso/:cursoId', asistenciaController.obtenerAsistenciaCurso);
router.post('/registrar', asistenciaController.registrarAsistenciaCurso);
router.post('/registrar', asistenciaController.registrarAsistenciaCurso);
router.put('/actualizar', asistenciaController.actualizarAsistenciaCurso);

module.exports = router;
