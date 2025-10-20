const Usuario = require('../models/usuarios.models');
const Curso = require('../models/cursos.models'); //
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const connectDB = require('../config/db');

// Obtener todos los usuarios
const obtenerUsuarios = async (req, res) => {
  try {
    await connectDB();
    const usuarios = await Usuario.find();
    res.json(usuarios);
  } catch (error) {
    console.error('Error al obtener los usuarios:', error);
    res.status(500).json({ error: 'Error al obtener los usuarios' });
  }
};

// Login de usuario
const loginUsuario = async (req, res) => {
  try {
    await connectDB();
    const { email, password } = req.body;

    // Verificar si el usuario existe
    const usuario = await Usuario.findOne({ email });
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Extraer salt y hash del password guardado
    const [_, salt, hashGuardado] = usuario.password.split('$');

    // Crear hash con la contraseña ingresada
    const hashIngresado = crypto
      .createHmac('sha256', salt)
      .update(password)
      .digest('hex');

    // Comparar hashes
    if (hashGuardado !== hashIngresado) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    // Crear token JWT
    const token = jwt.sign(
      {
        id: usuario._id,
        email: usuario.email,
        rol: usuario.rol
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES || '1d' }
    );

    // Enviar respuesta con token
    res.json({
      mensaje: 'Login exitoso',
      token,
      usuario: {
        id: usuario._id,
        nombres: usuario.nombres,
        apellidos: usuario.apellidos,
        email: usuario.email,
        rol: usuario.rol
      }
    });
  } catch (error) {
    console.error('Error en loginUsuario:', error);
    res.status(500).json({ error: 'Error interno en el servidor' });
  }
};

const obtenerEstudiantesPorCurso = async (req, res) => {
  try {
    await connectDB();
    const { cursoId } = req.params;

    // Buscar el curso
    const curso = await Curso.findById(cursoId);
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    // Buscar el docente asignado a ese curso
    const docente = await Usuario.findOne(
      { _id: curso.docente_id, rol: 'docente' },
      { _id: 1, nombres: 1, apellidos: 1 }
    );

    // Buscar estudiantes asignados al curso
    const estudiantes = await Usuario.find(
      { rol: 'estudiante', curso_id: cursoId },
      { _id: 1, nombres: 1, apellidos: 1, ci: 1, email: 1 }
    );

    // Respuesta JSON estructurada
    res.json({
      curso_id: curso._id,
      curso: curso.nombre,
      nivel: curso.nivel,
      paralelo: curso.paralelo,
      docente: docente
        ? {
          id: docente._id,
          nombre: `${docente.nombres} ${docente.apellidos}`
        }
        : { mensaje: 'Docente no asignado' },
      total_estudiantes: estudiantes.length,
      estudiantes: estudiantes.map((e) => ({
        id: e._id,
        nombres: e.nombres,
        apellidos: e.apellidos,
        ci: e.ci,
        email: e.email
      }))
    });
  } catch (error) {
    console.error('Error al obtener estudiantes del curso:', error);
    res.status(500).json({ error: 'Error al obtener estudiantes del curso' });
  }
};

// Crear (insertar) un nuevo profesor
const crearProfesor = async (req, res) => {
  try {
    await connectDB();
    const { nombres, apellidos, ci, email, password } = req.body;

    // Validar campos obligatorios
    if (!nombres || !apellidos || !ci || !email || !password) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    // Verificar si ya existe el profesor por CI o email
    const existente = await Usuario.findOne({ $or: [{ ci }, { email }] });
    if (existente) {
      return res.status(400).json({ error: 'Ya existe un usuario con ese CI o email' });
    }

    // Crear salt y hash de la contraseña
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHmac('sha256', salt).update(password).digest('hex');
    const passwordHash = `sha256$${salt}$${hash}`;

    // Crear nuevo profesor
    const nuevoProfesor = new Usuario({
      nombres,
      apellidos,
      ci,
      email,
      password: passwordHash,
      rol: 'docente',
      curso_id: null
    });

    await nuevoProfesor.save();

    res.status(201).json({
      mensaje: 'Profesor creado correctamente',
      profesor: {
        id: nuevoProfesor._id,
        nombres: nuevoProfesor.nombres,
        apellidos: nuevoProfesor.apellidos,
        email: nuevoProfesor.email,
        ci: nuevoProfesor.ci,
        rol: nuevoProfesor.rol
      }
    });
  } catch (error) {
    console.error('Error al crear el profesor:', error);
    res.status(500).json({ error: 'Error al crear el profesor' });
  }
};

const addEstudiantesEnCursos = async (req, res) => {
  try {
    await connectDB();
    const { curso_id, estudiantes } = req.body;

    // Validar datos
    if (!curso_id || !Array.isArray(estudiantes) || estudiantes.length === 0) {
      return res.status(400).json({ error: 'Debe enviar un curso_id y un arreglo de estudiantes' });
    }

    // Verificar que el curso exista
    const curso = await Curso.findById(curso_id);
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    // Procesar estudiantes
    const nuevosEstudiantes = estudiantes.map((est) => {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.createHmac('sha256', salt).update(est.password).digest('hex');
      const passwordHash = `sha256$${salt}$${hash}`;

      return {
        nombres: est.nombres,
        apellidos: est.apellidos,
        ci: est.ci,
        email: est.email,
        rol: 'estudiante',
        password: passwordHash,
        curso_id
      };
    });

    // Insertar todos
    const resultado = await Usuario.insertMany(nuevosEstudiantes);

    res.status(201).json({
      mensaje: `✅ ${resultado.length} estudiantes agregados correctamente al curso ${curso.nombre} ${curso.paralelo}`,
      estudiantes: resultado.map(e => ({
        id: e._id,
        nombres: e.nombres,
        apellidos: e.apellidos,
        email: e.email,
        ci: e.ci
      }))
    });
  } catch (error) {
    console.error('Error al agregar estudiantes masivamente:', error);
    res.status(500).json({ error: 'Error al agregar estudiantes masivamente' });
  }
};

module.exports = { obtenerUsuarios, loginUsuario, obtenerEstudiantesPorCurso, crearProfesor, addEstudiantesEnCursos };
