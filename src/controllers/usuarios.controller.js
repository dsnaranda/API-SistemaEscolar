const Usuario = require('../models/usuarios.models');
const Curso = require('../models/cursos.models'); //
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const connectDB = require('../config/db');
const { enviarCorreo } = require('../utils/email');

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

// Crear un nuevo profesor
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
      return res
        .status(400)
        .json({ error: 'Debe enviar un curso_id y un arreglo de estudiantes' });
    }

    // Verificar que el curso exista
    const curso = await Curso.findById(curso_id);
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    // Obtener todas las cédulas y correos enviados
    const ciList = estudiantes.map((e) => e.ci);
    const emailList = estudiantes.map((e) => e.email);

    // Buscar duplicados existentes en la base de datos
    const duplicados = await Usuario.find({
      $or: [{ ci: { $in: ciList } }, { email: { $in: emailList } }],
    });

    if (duplicados.length > 0) {
      const ciSet = new Set(ciList);
      const emailSet = new Set(emailList);

      const detalles = duplicados.map((d) => {
        const choques = [];
        if (d.ci && ciSet.has(d.ci)) choques.push(`CI: ${d.ci}`);
        if (d.email && emailSet.has(d.email)) choques.push(`Email: ${d.email}`);

        // Si por alguna razón no se pudo determinar (edge cases), muestra ambos si existen
        const info = choques.length > 0
          ? choques.join(' y ')
          : `CI: ${d.ci || '—'}${d.email ? `, Email: ${d.email}` : ''}`;

        return `• ${d.nombres} ${d.apellidos} (${info})`;
      });

      return res.status(400).json({
        error: `Algunos estudiantes ya están registrados:\n${detalles.join('\n')}`,
      });
    }

    // Procesar estudiantes (hash de contraseñas)
    const nuevosEstudiantes = estudiantes.map((est) => {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto
        .createHmac('sha256', salt)
        .update(est.password)
        .digest('hex');
      const passwordHash = `sha256$${salt}$${hash}`;

      return {
        nombres: est.nombres,
        apellidos: est.apellidos,
        ci: est.ci,
        email: est.email,
        rol: 'estudiante',
        password: passwordHash,
        curso_id,
      };
    });

    // Insertar todos los nuevos
    const resultado = await Usuario.insertMany(nuevosEstudiantes);

    res.status(201).json({
      mensaje: `${resultado.length} estudiantes agregados correctamente al curso ${curso.nombre} ${curso.paralelo}`,
      estudiantes: resultado.map((e) => ({
        id: e._id,
        nombres: e.nombres,
        apellidos: e.apellidos,
        email: e.email,
        ci: e.ci,
      })),
    });
  } catch (error) {
    console.error('Error al agregar estudiantes masivamente:', error);
    res.status(500).json({ error: 'Error al agregar estudiantes masivamente' });
  }
};


const verificarCorreo = async (req, res) => {
  try {
    await connectDB();
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Debe proporcionar un correo electrónico' });
    }

    // Buscar usuario por correo
    const usuario = await Usuario.findOne({ email });
    if (!usuario) {
      return res.status(404).json({
        existe: false,
        mensaje: 'El correo no está registrado',
      });
    }

    // URL del frontend 
    const frontendUrl = `https://sistema-educa-frontend.vercel.app/changepassword/${usuario._id}`;

    // Cuerpo del mensaje HTML
    const mensajeHTML = `
      <div style="font-family: Arial, sans-serif; background-color: #f8f9fa; padding: 20px; border-radius: 10px;">
        <h2 style="color: #4F46E5;">Recuperación de contraseña</h2>
        <p>Hola <b>${usuario.nombres} ${usuario.apellidos}</b>,</p>
        <p>Has solicitado recuperar tu contraseña. Haz clic en el siguiente botón para establecer una nueva:</p>
        <p style="text-align:center; margin-top: 15px;">
          <a href="${frontendUrl}" 
             style="display: inline-block; background-color: #4F46E5; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none;">
             Cambiar contraseña
          </a>
        </p>
        <p style="margin-top: 20px; color: #6b7280; font-size: 14px;">
          Si no solicitaste este cambio, ignora este mensaje. 
          Este enlace es válido solo para el usuario con el correo <b>${usuario.email}</b>.
        </p>
      </div>
    `;

    // Asunto y texto
    const asunto = 'Recuperación de contraseña - Sistema Escolar';
    const texto = `Hola ${usuario.nombres}, haz clic en el siguiente enlace para cambiar tu contraseña: ${frontendUrl}`;

    // Enviar correo usando tu función utilitaria
    await enviarCorreo(usuario.email, asunto, mensajeHTML);

    // Respuesta al frontend
    res.status(200).json({
      existe: true,
      mensaje: 'Se ha enviado un enlace de recuperación al correo registrado.',
      usuario: {
        id: usuario._id,
        nombres: usuario.nombres,
        apellidos: usuario.apellidos,
        email: usuario.email,
      },
    });
  } catch (error) {
    console.error('Error al verificar el correo:', error);
    res.status(500).json({ error: 'Error al verificar el correo o enviar el correo electrónico.' });
  }
};

const cambiarContrasena = async (req, res) => {
  try {
    await connectDB();

    const { id } = req.params;
    const { password } = req.body;

    // Validar datos
    if (!id || !password) {
      return res.status(400).json({ error: 'Debe proporcionar el ID del usuario y una nueva contraseña.' });
    }

    // Buscar usuario
    const usuario = await Usuario.findById(id);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // Generar nuevo hash de la contraseña
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHmac('sha256', salt).update(password).digest('hex');
    const passwordHash = `sha256$${salt}$${hash}`;

    // Actualizar la contraseña
    usuario.password = passwordHash;
    await usuario.save();

    res.status(200).json({
      mensaje: 'Contraseña actualizada correctamente.',
      usuario: {
        id: usuario._id,
        nombres: usuario.nombres,
        apellidos: usuario.apellidos,
        email: usuario.email,
      },
    });
  } catch (error) {
    console.error('Error al cambiar la contraseña:', error);
    res.status(500).json({ error: 'Error interno al cambiar la contraseña.' });
  }
};

// Editar un usuario existente (sin modificar id, rol ni contraseña)
const editarUsuario = async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    const datos = req.body;

    // Verificar si el usuario existe
    const usuario = await Usuario.findById(id);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Eliminar campos no modificables
    delete datos._id;
    delete datos.id;
    delete datos.rol;
    delete datos.password;

    // Si no hay campos válidos para actualizar
    if (Object.keys(datos).length === 0) {
      return res.status(400).json({ error: 'No hay campos válidos para actualizar' });
    }

    // Validar duplicados de CI
    if (datos.ci) {
      const duplicadoCI = await Usuario.findOne({
        ci: datos.ci,
        _id: { $ne: id } // excluye al propio usuario
      });
      if (duplicadoCI) {
        return res.status(400).json({ error: `Ya existe un usuario con la cédula ${datos.ci}` });
      }
    }

    // Validar duplicados de Email
    if (datos.email) {
      const duplicadoEmail = await Usuario.findOne({
        email: datos.email,
        _id: { $ne: id } // excluye al propio usuario
      });
      if (duplicadoEmail) {
        return res.status(400).json({ error: `Ya existe un usuario con el correo ${datos.email}` });
      }
    }

    // Actualizar campos permitidos
    Object.assign(usuario, datos);
    await usuario.save();

    res.status(200).json({
      mensaje: 'Usuario actualizado correctamente',
      usuario: {
        id: usuario._id,
        nombres: usuario.nombres,
        apellidos: usuario.apellidos,
        ci: usuario.ci,
        email: usuario.email,
        curso_id: usuario.curso_id,
        rol: usuario.rol,
      },
    });
  } catch (error) {
    console.error('Error al editar el usuario:', error);
    res.status(500).json({ error: 'Error interno al editar el usuario' });
  }
};

module.exports = { obtenerUsuarios, loginUsuario, obtenerEstudiantesPorCurso, crearProfesor, addEstudiantesEnCursos, verificarCorreo, cambiarContrasena, editarUsuario };
