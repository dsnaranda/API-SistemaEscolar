const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Router  = require('express');
const usuarioRoutes = require('./src/routes/usuarios.routes');
const asistenciaRoutes = require('./src/routes/asistencia.routes');
const cursosRoutes = require('./src/routes/cursos.routes');
const materiasRoutes = require('./src/routes/materias.routes');
const trimestresRoutes = require('./src/routes/trimestre.routes');
const actividadRoutes = require('./src/routes/actividades.routes');
require('dotenv').config();

const router = Router();
const app = express();
const port = process.env.PORT;

app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "DELETE"] }));
app.use(express.json());

app.get("/", (req, res) => {
    const htmlResponse = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>API Encuestas</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                text-align: center;
                margin: 50px;
                background-color: #f4f4f4;
            }
            h1 {
                color: #333;
            }
            p {
                font-size: 18px;
                color: #666;
            }
            .container {
                background: white;
                padding: 20px;
                border-radius: 10px;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
                display: inline-block;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>API SistemaEduca is UP</h1>
        </div>
    </body>
    </html>
    `;
    res.send(htmlResponse);
});


// Ruta base
app.use('/usuarios', usuarioRoutes);
app.use('/asistencia', asistenciaRoutes);
app.use('/cursos', cursosRoutes);
app.use('/materias', materiasRoutes);
app.use('/trimestres', trimestresRoutes);
app.use('/actividades', actividadRoutes);

// Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Conexión a MongoDB exitosa'))
    .catch((err) => console.error('Error al conectar a MongoDB:', err));

app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});