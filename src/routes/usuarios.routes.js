const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuarios.controller');

router.get('/list', usuarioController.obtenerUsuarios);
router.post('/login', usuarioController.loginUsuario);
router.get('/curso/:cursoId/estudiantes', usuarioController.obtenerEstudiantesPorCurso);
router.post('/addprofesores', usuarioController.crearProfesor);
router.post('/addestudiantes', usuarioController.addEstudiantesEnCursos);
router.post('/verificar-correo', usuarioController.verificarCorreo);
router.put('/cambiar-contrasena/:id', usuarioController.cambiarContrasena);
router.put('/:id', usuarioController.editarUsuario);

module.exports = router;
