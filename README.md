### Clonar Repositorio
```
git clone https://github.com/tuusuario/SistemaEduca-Backend.git
cd SistemaEduca-Backend
npm install
```

### Correr API
npm run dev

### 📁 Archivo `.env`

Crea un archivo llamado `.env` en la raíz del proyecto con el siguiente contenido:

```env
MONGO_URI=tu_cadena_de_conexion_mongodb
PORT=3001
JWT_SECRET=tu_clave_secreta_para_tokens
JWT_EXPIRES=1d
