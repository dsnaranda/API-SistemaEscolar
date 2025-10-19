const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Cargar variables del .env
dotenv.config();

const usuarioRoutes = require('./src/routes/usuarios.routes');
const asistenciaRoutes = require('./src/routes/asistencia.routes');
const cursoRoutes = require('./src/routes/cursos.routes');
const materiaRoutes = require('./src/routes/materias.routes');
const trimestreRoutes = require('./src/routes/trimestre.routes');
const actividadRoutes = require('./src/routes/actividades.routes');

// Inicializar app
const app = express();

//  MIDDLEWARES
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
app.use(express.json());

//  CONEXIÓN A MONGODB

mongoose.connect(process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 50000, 
  socketTimeoutMS: 45000,
})
.then(() => console.log('✅ Conexión a MongoDB exitosa'))
.catch(err => console.error('❌ Error al conectar a MongoDB:', err.message));

//  RUTAS

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>API SistemaEduca</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f4f4f4;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
          }
          .card {
            background: white;
            padding: 25px 40px;
            border-radius: 10px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.1);
            text-align: center;
          }
          h1 {
            color: #333;
          }
          p {
            color: #555;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>✅ API SistemaEduca está activa</h1>
          <p>Conectada a MongoDB Atlas correctamente.</p>
        </div>
      </body>
    </html>
  `);
});

// Registrar rutas
app.use('/usuarios', usuarioRoutes);
app.use('/asistencia', asistenciaRoutes);
app.use('/cursos', cursoRoutes);
app.use('/materias', materiaRoutes);
app.use('/trimestres', trimestreRoutes);
app.use('/actividades', actividadRoutes);

//  CONFIGURACIÓN DE PUERTO

const PORT = process.env.PORT || 3001;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  });
}

// Exportar app
module.exports = app;
