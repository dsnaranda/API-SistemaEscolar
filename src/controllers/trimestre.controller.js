const Trimestre = require('../models/trimestres.models');
const Materia = require('../models/materias.models');
const Curso = require('../models/cursos.models');
const Usuario = require('../models/usuarios.models');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Actividad = require('../models/actividades.models');

// Crear trimestres masivamente para todas las materias y estudiantes del curso
const crearTrimestresPorCurso = async (req, res) => {
  try {
    await connectDB();
    const { curso_id, numero } = req.body;

    if (!curso_id || !numero) {
      return res.status(400).json({ error: 'Debe enviar curso_id y número de trimestre' });
    }

    if (![1, 2, 3].includes(numero)) {
      return res.status(400).json({ error: 'El número de trimestre solo puede ser 1, 2 o 3' });
    }

    if (!mongoose.Types.ObjectId.isValid(curso_id)) {
      return res.status(400).json({ error: 'curso_id inválido' });
    }

    // Buscar curso y estudiantes
    const curso = await Curso.findById(curso_id).populate('estudiantes');
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    // Buscar materias del curso
    const materias = await Materia.find({ curso_id });
    if (materias.length === 0) {
      return res.status(404).json({ error: 'No hay materias asociadas a este curso' });
    }

    // Plantilla de parámetros base
    const parametrosBase = [
      { nombre: 'Lecciones', porcentaje: 20, actividades: [], promedio_parametro: null },
      { nombre: 'Actividad intraclases', porcentaje: 20, actividades: [], promedio_parametro: null },
      { nombre: 'Tareas', porcentaje: 10, actividades: [], promedio_parametro: null },
      { nombre: 'Exposiciones', porcentaje: 10, actividades: [], promedio_parametro: null },
      { nombre: 'Talleres', porcentaje: 10, actividades: [], promedio_parametro: null },
      { nombre: 'Evaluación del periodo', porcentaje: 15, actividades: [], promedio_parametro: null },
      { nombre: 'Proyecto interdisciplinar', porcentaje: 15, actividades: [], promedio_parametro: null }
    ];

    const nuevosTrimestres = [];

    // Validaciones antes de insertar
    for (const materia of materias) {
      for (const estudiante of curso.estudiantes) {
        // Buscar si ya tiene trimestres en esa materia
        const existentes = await Trimestre.find({
          materia_id: materia._id,
          estudiante_id: estudiante._id
        });

        // Limitar máximo 3 trimestres por estudiante
        if (existentes.length >= 3) {
          console.log(`${estudiante.nombres} ${estudiante.apellidos} ya tiene 3 trimestres en ${materia.nombre}`);
          continue;
        }

        // Evitar duplicado del mismo número
        const yaExisteNumero = existentes.some(t => t.numero === numero);
        if (yaExisteNumero) {
          console.log(`El trimestre ${numero} ya existe para ${estudiante.nombres} en ${materia.nombre}`);
          continue;
        }

        // Crear copia independiente de los parámetros
        const parametrosCopia = JSON.parse(JSON.stringify(parametrosBase));

        nuevosTrimestres.push({
          numero,
          materia_id: materia._id,
          parametros: parametrosCopia,
          promedio_trimestre: null,
          estado: 'abierto',
          estudiante_id: estudiante._id
        });
      }
    }

    // Si no hay nada que insertar
    if (nuevosTrimestres.length === 0) {
      return res.status(400).json({
        mensaje: 'No se crearon trimestres porque ya existen o se alcanzó el límite de 3 por materia.'
      });
    }

    // Insertar en bloque
    const resultado = await Trimestre.insertMany(nuevosTrimestres);

    res.status(201).json({
      mensaje: `Se crearon ${resultado.length} trimestres (número ${numero}) para el curso ${curso.nombre} ${curso.paralelo}`,
      total_materias: materias.length,
      total_estudiantes: curso.estudiantes.length,
      creados: resultado.length
    });
  } catch (error) {
    console.error('Error al crear trimestres masivos:', error);
    res.status(500).json({ error: 'Error al crear trimestres masivos' });
  }
};


const obtenerTrimestreDetallado = async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;

    // Validar el ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID de trimestre inválido' });
    }

    // Buscar el trimestre
    const trimestre = await Trimestre.findById(id).lean();
    if (!trimestre) {
      return res.status(404).json({ error: 'Trimestre no encontrado' });
    }

    // Obtener estudiante
    const estudiante = await Usuario.findById(trimestre.estudiante_id).lean();
    const nombreEstudiante = estudiante
      ? `${estudiante.nombres} ${estudiante.apellidos}`
      : 'Estudiante no encontrado';

    // Obtener materia, curso y docente
    const materia = await Materia.findById(trimestre.materia_id).lean();
    let nombreMateria = 'Materia no encontrada';
    let nombreDocente = 'Docente no asignado';
    let nombreCurso = 'Curso no encontrado';

    if (materia) {
      nombreMateria = materia.nombre;
      const curso = await Curso.findById(materia.curso_id).lean();
      if (curso) {
        nombreCurso = `${curso.nombre} ${curso.paralelo}`;
        const docente = await Usuario.findById(curso.docente_id).lean();
        if (docente) {
          nombreDocente = `${docente.nombres} ${docente.apellidos}`;
        }
      }
    }

    // Reemplazar IDs de actividades por sus datos reales
    const parametrosDetallados = await Promise.all(
      trimestre.parametros.map(async (param) => {
        const actividadesDetalladas = await Promise.all(
          (param.actividades || []).map(async (actividadId) => {
            const actividad = await Actividad.findById(actividadId).lean();
            if (!actividad) {
              return {
                _id: actividadId,
                nombre: 'Actividad no encontrada',
                descripcion: '',
                nota: null,
                fecha_registro: null,
                fecha_calificado: null
              };
            }

            return {
              _id: actividad._id,
              nombre: actividad.nombre,
              descripcion: actividad.descripcion || '',
              nota: actividad.nota ?? null,
              fecha_registro: actividad.fecha_registro || null,
              fecha_calificado: actividad.fecha_calificado || null
            };
          })
        );

        return {
          ...param,
          actividades: actividadesDetalladas
        };
      })
    );

    // Respuesta completa
    res.status(200).json({
      _id: trimestre._id,
      numero: trimestre.numero,
      estado: trimestre.estado,
      promedio_trimestre: trimestre.promedio_trimestre,
      materia: nombreMateria,
      curso: nombreCurso,
      docente: nombreDocente,
      estudiante: nombreEstudiante,
      parametros: parametrosDetallados
    });

  } catch (error) {
    console.error('Error al obtener trimestre detallado:', error);
    res.status(500).json({ error: 'Error al obtener trimestre detallado' });
  }
};

const cerrarTrimestreIndividual = async (req, res) => {
  try {
    await connectDB();
    const { trimestre_id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(trimestre_id)) {
      return res.status(400).json({ error: 'ID de trimestre inválido.' });
    }

    // Buscar el trimestre
    const trimestre = await Trimestre.findById(trimestre_id);
    if (!trimestre) {
      return res.status(404).json({ error: 'Trimestre no encontrado.' });
    }

    // Validar que todos los parámetros tengan promedio_parametro != null
    const incompletos = trimestre.parametros.filter(p => p.promedio_parametro === null);

    if (incompletos.length > 0) {
      return res.status(400).json({
        error: 'El trimestre no puede cerrarse. Existen parámetros sin promedio.',
        parametros_pendientes: incompletos.map(p => p.nombre)
      });
    }

    // Solo cambiar estado (el trigger hará el cálculo)
    await Trimestre.updateOne(
      { _id: trimestre_id },
      { $set: { estado: 'cerrado' } }
    );

    res.status(200).json({
      mensaje: 'Trimestre cerrado correctamente.',
      trimestre_id
    });
  } catch (error) {
    console.error('Error al cerrar trimestre individual:', error);
    res.status(500).json({ error: 'Error interno al cerrar trimestre.' });
  }
};

const cerrarTrimestresPorMateria = async (req, res) => {
  try {
    await connectDB();
    const { materia_id, numero } = req.body;

    if (!materia_id || !numero) {
      return res.status(400).json({ error: 'Debe enviar materia_id y número de trimestre.' });
    }

    if (!mongoose.Types.ObjectId.isValid(materia_id)) {
      return res.status(400).json({ error: 'ID de materia inválido.' });
    }

    // Buscar trimestres abiertos de esa materia y número
    const trimestres = await Trimestre.find({ materia_id, numero, estado: 'abierto' });

    if (trimestres.length === 0) {
      return res.status(404).json({ error: 'No hay trimestres abiertos para cerrar.' });
    }

    const cerrados = [];
    const pendientes = [];

    for (const trimestre of trimestres) {
      const incompletos = trimestre.parametros.filter(p => p.promedio_parametro === null);

      if (incompletos.length > 0) {
        // Buscar información del usuario (estudiante)
        const usuario = await Usuario.findById(trimestre.estudiante_id).select('nombres apellidos');

        pendientes.push({
          estudiante_id: trimestre.estudiante_id,
          nombres: usuario?.nombres || 'Desconocido',
          apellidos: usuario?.apellidos || '',
          parametros_pendientes: incompletos.map(p => p.nombre)
        });
        continue;
      }

      // Cambiar estado (el trigger hará el cálculo)
      await Trimestre.updateOne(
        { _id: trimestre._id },
        { $set: { estado: 'cerrado' } }
      );

      cerrados.push(trimestre._id);
    }

    res.status(200).json({
      mensaje: 'Cierre de trimestres completado.',
      total_trimestres: trimestres.length,
      cerrados: cerrados.length,
      pendientes: pendientes.length,
      detalles_pendientes: pendientes
    });
  } catch (error) {
    console.error('Error al cerrar trimestres por materia:', error);
    res.status(500).json({ error: 'Error interno al cerrar trimestres.' });
  }
};

const verificarTrimestresPorMateria = async (req, res) => {
  try {
    await connectDB();
    const { materia_id } = req.params;

    if (!materia_id) {
      return res.status(400).json({ error: 'Debe enviar materia_id.' });
    }

    if (!mongoose.Types.ObjectId.isValid(materia_id)) {
      return res.status(400).json({ error: 'ID de materia inválido.' });
    }

    // Buscar la materia
    const materia = await Materia.findById(materia_id).lean();
    if (!materia) {
      return res.status(404).json({ error: 'Materia no encontrada.' });
    }

    // Buscar curso asociado
    const curso = await Curso.findById(materia.curso_id).lean();
    if (!curso) {
      return res.status(404).json({ error: 'Curso asociado no encontrado.' });
    }

    // Buscar todos los trimestres de esa materia
    const trimestres = await Trimestre.find({ materia_id })
      .select('_id numero estudiante_id estado')
      .lean();

    // Agrupar por número de trimestre
    const grupo = {
      1: trimestres.filter(t => t.numero === 1),
      2: trimestres.filter(t => t.numero === 2),
      3: trimestres.filter(t => t.numero === 3),
    };

    // Calcular estado general
    const calcularEstado = (trimestresArr) => {
      if (trimestresArr.length === 0) return null;

      const abiertos = trimestresArr.filter(t => t.estado === 'abierto').length;
      const cerrados = trimestresArr.filter(t => t.estado === 'cerrado').length;

      if (abiertos > 0) {
        return {
          estado: 'abierto',
          mensaje: 'Trimestre aún abierto. Existen usuarios sin calificaciones registradas.'
        };
      } else if (cerrados > 0 && abiertos === 0) {
        return { estado: 'cerrado', mensaje: 'Trimestre cerrado correctamente.' };
      }
      return null;
    };

    // Estados
    const t1Estado = calcularEstado(grupo[1]);
    const t2Estado = calcularEstado(grupo[2]);
    const t3Estado = calcularEstado(grupo[3]);

    // Construir respuesta 
    const respuesta = {
      curso_id: curso._id, 
      curso: `${curso.nombre} ${curso.paralelo}`,
      materia: materia.nombre,
      descripcion: materia.descripcion,
      trimestres: {
        trimestre_1: grupo[1].length > 0
          ? {
              existe: true,
              cantidad: grupo[1].length,
              ids: grupo[1].map(t => t._id),
              estado: t1Estado?.estado,
              mensaje: t1Estado?.mensaje
            }
          : { existe: false, mensaje: 'Trimestre 1 aún no ha sido creado.' },

        trimestre_2: grupo[2].length > 0
          ? {
              existe: true,
              cantidad: grupo[2].length,
              ids: grupo[2].map(t => t._id),
              estado: t2Estado?.estado,
              mensaje: t2Estado?.mensaje
            }
          : { existe: false, mensaje: 'Trimestre 2 aún no ha sido creado.' },

        trimestre_3: grupo[3].length > 0
          ? {
              existe: true,
              cantidad: grupo[3].length,
              ids: grupo[3].map(t => t._id),
              estado: t3Estado?.estado,
              mensaje: t3Estado?.mensaje
            }
          : { existe: false, mensaje: 'Trimestre 3 aún no ha sido creado.' },
      }
    };

    res.status(200).json(respuesta);
  } catch (error) {
    console.error('Error al verificar trimestres por materia:', error);
    res.status(500).json({ error: 'Error interno al verificar trimestres por materia.' });
  }
};

// Crear los 3 trimestres (1, 2 y 3) para una materia específica
// Si ya existen, solo crea los que faltan (para nuevos estudiantes)
const crearTrimestresPorMateria = async (req, res) => {
  try {
    await connectDB();
    const { materia_id } = req.body;

    if (!materia_id) {
      return res.status(400).json({ error: 'Debe enviar materia_id.' });
    }

    if (!mongoose.Types.ObjectId.isValid(materia_id)) {
      return res.status(400).json({ error: 'ID de materia inválido.' });
    }

    // Buscar la materia
    const materia = await Materia.findById(materia_id).lean();
    if (!materia) {
      return res.status(404).json({ error: 'Materia no encontrada.' });
    }

    // Buscar el curso asociado y sus estudiantes
    const curso = await Curso.findById(materia.curso_id).populate('estudiantes');
    if (!curso) {
      return res.status(404).json({ error: 'Curso asociado no encontrado.' });
    }

    if (curso.estudiantes.length === 0) {
      return res.status(400).json({ error: 'No hay estudiantes en el curso.' });
    }

    // Parámetros base
    const parametrosBase = [
      { nombre: 'Lecciones', porcentaje: 20, actividades: [], promedio_parametro: null },
      { nombre: 'Actividad intraclases', porcentaje: 20, actividades: [], promedio_parametro: null },
      { nombre: 'Tareas', porcentaje: 10, actividades: [], promedio_parametro: null },
      { nombre: 'Exposiciones', porcentaje: 10, actividades: [], promedio_parametro: null },
      { nombre: 'Talleres', porcentaje: 10, actividades: [], promedio_parametro: null },
      { nombre: 'Evaluación del periodo', porcentaje: 15, actividades: [], promedio_parametro: null },
      { nombre: 'Proyecto interdisciplinar', porcentaje: 15, actividades: [], promedio_parametro: null }
    ];

    const nuevosTrimestres = [];
    const yaExistentes = [];

    // Crear trimestres 1, 2 y 3 para cada estudiante
    for (const estudiante of curso.estudiantes) {
      let nuevosPorEstudiante = 0;

      for (let numero = 1; numero <= 3; numero++) {
        // Verificar si ya existe ese trimestre
        const existente = await Trimestre.findOne({
          materia_id: materia._id,
          estudiante_id: estudiante._id,
          numero
        });

        if (existente) {
          yaExistentes.push({
            estudiante: `${estudiante.nombres} ${estudiante.apellidos}`,
            trimestre: numero
          });
          continue;
        }

        // Crear nuevo trimestre para este estudiante
        const parametrosCopia = JSON.parse(JSON.stringify(parametrosBase));

        nuevosTrimestres.push({
          numero,
          materia_id: materia._id,
          parametros: parametrosCopia,
          promedio_trimestre: null,
          estado: 'abierto',
          estudiante_id: estudiante._id
        });

        nuevosPorEstudiante++;
      }

      if (nuevosPorEstudiante > 0) {
        console.log(`Se crearán ${nuevosPorEstudiante} trimestres para ${estudiante.nombres} ${estudiante.apellidos}`);
      }
    }

    if (nuevosTrimestres.length === 0) {
      return res.status(200).json({
        mensaje: 'No se crearon trimestres nuevos. Todos los estudiantes ya tienen los 3 trimestres.',
        total_existentes: yaExistentes.length
      });
    }

    // Insertar en bloque solo los nuevos
    const resultado = await Trimestre.insertMany(nuevosTrimestres);

    res.status(201).json({
      mensaje: `Trimestres creados correctamente para nuevos estudiantes en la materia ${materia.nombre}.`,
      total_estudiantes: curso.estudiantes.length,
      nuevos_trimestres: resultado.length,
      ya_existentes: yaExistentes.length,
      detalles_existentes: yaExistentes
    });
  } catch (error) {
    console.error('Error al crear trimestres por materia:', error);
    res.status(500).json({ error: 'Error al crear trimestres por materia.' });
  }
};

const verificarTrimestrePorMateriaYNumero = async (req, res) => {
  try {
    await connectDB();
    const { materia_id, numero } = req.params;

    // Validar parámetros
    if (!materia_id || !numero) {
      return res.status(400).json({ error: 'Debe enviar materia_id y número de trimestre.' });
    }

    if (!mongoose.Types.ObjectId.isValid(materia_id)) {
      return res.status(400).json({ error: 'ID de materia inválido.' });
    }

    const numeroTrimestre = Number(numero);
    if (![1, 2, 3].includes(numeroTrimestre)) {
      return res.status(400).json({ error: 'El número de trimestre solo puede ser 1, 2 o 3.' });
    }

    // Buscar la materia y curso asociado
    const materia = await Materia.findById(materia_id).lean();
    if (!materia) {
      return res.status(404).json({ error: 'Materia no encontrada.' });
    }

    const curso = await Curso.findById(materia.curso_id).populate('estudiantes');
    if (!curso) {
      return res.status(404).json({ error: 'Curso asociado no encontrado.' });
    }

    // Buscar todos los trimestres existentes de esa materia y número
    const trimestres = await Trimestre.find({ materia_id, numero: numeroTrimestre })
      .select('_id estudiante_id promedio_trimestre estado')
      .lean();

    // Crear un mapa rápido de estudiante -> trimestre
    const mapaTrimestres = new Map();
    trimestres.forEach(t => {
      mapaTrimestres.set(t.estudiante_id.toString(), t);
    });

    const listaFinal = [];
    const faltantes = [];

    // Recorrer todos los estudiantes del curso
    for (const estudiante of curso.estudiantes) {
      const trimestre = mapaTrimestres.get(estudiante._id.toString());

      if (trimestre) {
        listaFinal.push({
          estudiante_id: estudiante._id,
          nombres: estudiante.nombres,
          apellidos: estudiante.apellidos,
          promedio_trimestre: trimestre.promedio_trimestre ?? null,
          estado: trimestre.estado,
          trimestre_id: trimestre._id
        });
      } else {
        listaFinal.push({
          estudiante_id: estudiante._id,
          nombres: estudiante.nombres,
          apellidos: estudiante.apellidos,
          promedio_trimestre: null,
          estado: 'no creado',
          trimestre_id: null
        });
        faltantes.push({
          estudiante_id: estudiante._id,
          nombres: estudiante.nombres,
          apellidos: estudiante.apellidos
        });
      }
    }

    const respuesta = {
      materia: materia.nombre,
      curso: `${curso.nombre} ${curso.paralelo}`,
      trimestre_numero: numeroTrimestre,
      total_estudiantes_curso: curso.estudiantes.length,
      total_trimestres_creados: trimestres.length,
      total_faltantes: faltantes.length,
      faltantes,
      estudiantes: listaFinal
    };

    res.status(200).json(respuesta);

  } catch (error) {
    console.error('Error al verificar trimestres por materia y número:', error);
    res.status(500).json({ error: 'Error interno al verificar trimestres.' });
  }
};

module.exports = { crearTrimestresPorCurso, obtenerTrimestreDetallado, cerrarTrimestreIndividual, cerrarTrimestresPorMateria, verificarTrimestresPorMateria, crearTrimestresPorMateria, verificarTrimestrePorMateriaYNumero };