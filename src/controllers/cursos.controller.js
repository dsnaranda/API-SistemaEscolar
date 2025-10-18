const Curso = require('../models/cursos.models');
const Usuario = require('../models/usuarios.models');

// Crear un nuevo curso
const crearCurso = async (req, res) => {
  try {
    const { nombre, nivel, paralelo, docente_id } = req.body;

    // Validar campos
    if (!nombre || !nivel || !paralelo || !docente_id) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    // Verificar si el docente existe y es rol docente
    const docente = await Usuario.findById(docente_id);
    if (!docente || docente.rol !== 'docente') {
      return res.status(400).json({ error: 'El docente_id no es válido o no pertenece a un docente' });
    }

    // Verificar si el docente ya tiene un curso asignado
    const cursoDocente = await Curso.findOne({ docente_id });
    if (cursoDocente) {
      return res.status(400).json({
        error: `El docente ${docente.nombres} ${docente.apellidos} ya tiene asignado el curso ${cursoDocente.nombre} ${cursoDocente.paralelo}`
      });
    }

    // Verificar que el paralelo no se repita dentro del mismo nivel
    const paraleloExistente = await Curso.findOne({ nivel, paralelo });
    if (paraleloExistente) {
      return res.status(400).json({
        error: `Ya existe un curso con el paralelo ${paralelo} en el nivel ${nivel}`
      });
    }

    // Crear curso vacío con docente asignado
    const nuevoCurso = new Curso({
      nombre,
      nivel,
      paralelo,
      docente_id,
      estudiantes: []
    });

    await nuevoCurso.save();

    res.status(201).json({
      mensaje: 'Curso creado correctamente',
      curso: {
        id: nuevoCurso._id,
        nombre: nuevoCurso.nombre,
        nivel: nuevoCurso.nivel,
        paralelo: nuevoCurso.paralelo,
        docente: `${docente.nombres} ${docente.apellidos}`
      }
    });
  } catch (error) {
    console.error('Error al crear el curso:', error);
    res.status(500).json({ error: 'Error interno al crear el curso' });
  }
};

module.exports = { crearCurso };
