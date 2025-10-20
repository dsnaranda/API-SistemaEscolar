const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  throw new Error('❌ MONGO_URI no está definida en las variables de entorno');
}

// Cache global para Vercel (evita reconexiones innecesarias)
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGO_URI, {
      dbName: 'SistemaEduca', // cambia si tu base tiene otro nombre
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    })
    .then((mongoose) => {
      console.log('✅ Conectado a MongoDB Atlas');
      return mongoose;
    })
    .catch((err) => {
      console.error('❌ Error al conectar a MongoDB:', err.message);
      throw err;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = connectDB;
