const express = require('express');
const router = express.Router();
const actividadController = require('../controllers/actividades.controller');

router.post('/enviar-tarea', actividadController.crearActividadPorMateria);
router.put('/calificar/:actividad_id', actividadController.calificarActividad);

module.exports = router;
