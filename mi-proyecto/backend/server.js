const express    = require('express');
const cors       = require('cors');
const bcrypt     = require('bcrypt');
const jwt        = require('jsonwebtoken');
const sqlite3    = require('sqlite3').verbose();
const { body, validationResult } = require('express-validator');

// ===================== CONFIG =====================
const app    = express();
const PORT   = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'mi_clave_secreta_cambiar_en_produccion';
const SALT_ROUNDS = 10;

// ===================== MIDDLEWARES =====================
app.use(cors());
app.use(express.json());

// ===================== BASE DE DATOS =====================
const db = new sqlite3.Database('./tienda.db', (err) => {
  if (err) {
    console.error('❌ Error al conectar con la base de datos:', err.message);
  } else {
    console.log('✅ Conectado a SQLite (tienda.db)');
  }
});

// Crear tablas si no existen
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      email     TEXT    UNIQUE NOT NULL,
      password  TEXT    NOT NULL,
      saldo     REAL    NOT NULL DEFAULT 1000.00,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS productos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre      TEXT  NOT NULL,
      descripcion TEXT  NOT NULL,
      precio      REAL  NOT NULL,
      imagen_url  TEXT,
      vendedor_id INTEGER NOT NULL,
      activo      INTEGER NOT NULL DEFAULT 1,
      creado_en   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vendedor_id) REFERENCES usuarios(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS compras (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER NOT NULL,
      comprador_id INTEGER NOT NULL,
      precio      REAL    NOT NULL,
      fecha       DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (producto_id)  REFERENCES productos(id),
      FOREIGN KEY (comprador_id) REFERENCES usuarios(id)
    )
  `);

  console.log('✅ Tablas verificadas/creadas correctamente');
});

// ===================== HELPERS =====================

// Genera un token JWT
function generarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, email: usuario.email },
    SECRET,
    { expiresIn: '7d' }
  );
}

// Middleware: verifica que el token sea válido
function autenticar(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
  }

  jwt.verify(token, SECRET, (err, payload) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o expirado.' });
    }
    req.usuario = payload; // { id, email }
    next();
  });
}

// Devuelve los errores de validación si los hay
function manejarValidacion(req, res) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    res.status(400).json({ errores: errores.array() });
    return true;
  }
  return false;
}

// ===================== RUTAS DE AUTENTICACIÓN =====================

/**
 * POST /api/auth/registro
 * Body: { email, password }
 */
app.post('/api/auth/registro',
  [
    body('email').isEmail().withMessage('El correo no es válido.').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres.').trim().notEmpty().withMessage('La contraseña no puede ser solo espacios.'),
  ],
  async (req, res) => {
    if (manejarValidacion(req, res)) return;

    const { email, password } = req.body;

    try {
      // Comprobar si el email ya está registrado
      db.get('SELECT id FROM usuarios WHERE email = ?', [email], async (err, fila) => {
        if (err) return res.status(500).json({ error: 'Error interno del servidor.' });
        if (fila) return res.status(409).json({ error: 'Este correo ya está registrado.' });

        // Hashear la contraseña
        const hash = await bcrypt.hash(password, SALT_ROUNDS);

        db.run(
          'INSERT INTO usuarios (email, password) VALUES (?, ?)',
          [email, hash],
          function (err) {
            if (err) return res.status(500).json({ error: 'Error al crear el usuario.' });

            const nuevoUsuario = { id: this.lastID, email };
            const token = generarToken(nuevoUsuario);

            res.status(201).json({
              mensaje: '¡Cuenta creada con éxito!',
              token,
              usuario: { id: nuevoUsuario.id, email, saldo: 1000 },
            });
          }
        );
      });
    } catch (error) {
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  }
);

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
app.post('/api/auth/login',
  [
    body('email').isEmail().withMessage('El correo no es válido.').normalizeEmail(),
    body('password').notEmpty().withMessage('La contraseña es obligatoria.'),
  ],
  async (req, res) => {
    if (manejarValidacion(req, res)) return;

    const { email, password } = req.body;

    db.get('SELECT * FROM usuarios WHERE email = ?', [email], async (err, usuario) => {
      if (err)      return res.status(500).json({ error: 'Error interno del servidor.' });
      if (!usuario) return res.status(401).json({ error: 'Credenciales incorrectas.' });

      const passwordOk = await bcrypt.compare(password, usuario.password);
      if (!passwordOk) return res.status(401).json({ error: 'Credenciales incorrectas.' });

      const token = generarToken(usuario);

      res.json({
        mensaje: '¡Bienvenido!',
        token,
        usuario: { id: usuario.id, email: usuario.email, saldo: usuario.saldo },
      });
    });
  }
);

// ===================== RUTAS DE USUARIO =====================

/**
 * GET /api/usuario/perfil
 * Devuelve el perfil del usuario autenticado
 */
app.get('/api/usuario/perfil', autenticar, (req, res) => {
  db.get(
    'SELECT id, email, saldo, creado_en FROM usuarios WHERE id = ?',
    [req.usuario.id],
    (err, usuario) => {
      if (err)      return res.status(500).json({ error: 'Error interno del servidor.' });
      if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado.' });
      res.json(usuario);
    }
  );
});

// ===================== RUTAS DE PRODUCTOS =====================

/**
 * GET /api/productos
 * Devuelve todos los productos activos (con email del vendedor)
 */
app.get('/api/productos', (req, res) => {
  db.all(
    `SELECT p.id, p.nombre, p.descripcion, p.precio, p.imagen_url, p.creado_en,
            u.email AS vendedor
     FROM productos p
     JOIN usuarios u ON p.vendedor_id = u.id
     WHERE p.activo = 1
     ORDER BY p.creado_en DESC`,
    [],
    (err, filas) => {
      if (err) return res.status(500).json({ error: 'Error al obtener los productos.' });
      res.json(filas);
    }
  );
});

/**
 * POST /api/productos
 * Crea un nuevo producto (requiere autenticación)
 * Body: { nombre, descripcion, precio, imagen_url }
 */
app.post('/api/productos', autenticar,
  [
    body('nombre').notEmpty().withMessage('El nombre es obligatorio.').trim(),
    body('descripcion').notEmpty().withMessage('La descripción es obligatoria.').trim(),
    body('precio').isFloat({ min: 0.01 }).withMessage('El precio debe ser mayor que 0.'),
    body('imagen_url').optional().isURL().withMessage('La URL de imagen no es válida.'),
  ],
  (req, res) => {
    if (manejarValidacion(req, res)) return;

    const { nombre, descripcion, precio, imagen_url } = req.body;
    const vendedorId = req.usuario.id;

    db.run(
      'INSERT INTO productos (nombre, descripcion, precio, imagen_url, vendedor_id) VALUES (?, ?, ?, ?, ?)',
      [nombre, descripcion, precio, imagen_url || null, vendedorId],
      function (err) {
        if (err) return res.status(500).json({ error: 'Error al publicar el producto.' });

        res.status(201).json({
          mensaje: '¡Producto publicado con éxito!',
          producto: { id: this.lastID, nombre, descripcion, precio, imagen_url, vendedorId },
        });
      }
    );
  }
);

/**
 * PUT /api/productos/:id
 * Edita un producto propio (requiere autenticación)
 * Body: { nombre, descripcion, precio, imagen_url }
 */
app.put('/api/productos/:id', autenticar,
  [
    body('nombre').notEmpty().withMessage('El nombre es obligatorio.').trim(),
    body('descripcion').notEmpty().withMessage('La descripción es obligatoria.').trim(),
    body('precio').isFloat({ min: 0.01 }).withMessage('El precio debe ser mayor que 0.'),
    body('imagen_url').optional().isURL().withMessage('La URL de imagen no es válida.'),
  ],
  (req, res) => {
    if (manejarValidacion(req, res)) return;

    const productoId = parseInt(req.params.id);
    const usuarioId  = req.usuario.id;
    const { nombre, descripcion, precio, imagen_url } = req.body;

    db.get(
      'SELECT id, vendedor_id FROM productos WHERE id = ? AND activo = 1',
      [productoId],
      (err, producto) => {
        if (err)       return res.status(500).json({ error: 'Error interno del servidor.' });
        if (!producto) return res.status(404).json({ error: 'Producto no encontrado.' });
        if (producto.vendedor_id !== usuarioId) {
          return res.status(403).json({ error: 'No tienes permiso para editar este producto.' });
        }

        db.run(
          'UPDATE productos SET nombre = ?, descripcion = ?, precio = ?, imagen_url = ? WHERE id = ?',
          [nombre, descripcion, precio, imagen_url || null, productoId],
          (err) => {
            if (err) return res.status(500).json({ error: 'Error al editar el producto.' });
            res.json({ mensaje: 'Producto actualizado correctamente.' });
          }
        );
      }
    );
  }
);

/**
 * DELETE /api/productos/:id
 * Elimina (desactiva) un producto propio (requiere autenticación)
 */
app.delete('/api/productos/:id', autenticar, (req, res) => {
  const productoId = parseInt(req.params.id);
  const usuarioId  = req.usuario.id;

  // Solo puede borrar el dueño del producto
  db.get(
    'SELECT id, vendedor_id FROM productos WHERE id = ? AND activo = 1',
    [productoId],
    (err, producto) => {
      if (err)       return res.status(500).json({ error: 'Error interno del servidor.' });
      if (!producto) return res.status(404).json({ error: 'Producto no encontrado.' });
      if (producto.vendedor_id !== usuarioId) {
        return res.status(403).json({ error: 'No tienes permiso para eliminar este producto.' });
      }

      db.run(
        'UPDATE productos SET activo = 0 WHERE id = ?',
        [productoId],
        (err) => {
          if (err) return res.status(500).json({ error: 'Error al eliminar el producto.' });
          res.json({ mensaje: 'Producto eliminado correctamente.' });
        }
      );
    }
  );
});

// ===================== RUTA DE COMPRA =====================

/**
 * POST /api/comprar/:id
 * Compra un producto (requiere autenticación)
 */
app.post('/api/comprar/:id', autenticar, (req, res) => {
  const productoId = parseInt(req.params.id);
  const compradorId = req.usuario.id;

  db.get(
    `SELECT p.*, u.email AS vendedor_email
     FROM productos p
     JOIN usuarios u ON p.vendedor_id = u.id
     WHERE p.id = ? AND p.activo = 1`,
    [productoId],
    (err, producto) => {
      if (err)       return res.status(500).json({ error: 'Error interno del servidor.' });
      if (!producto) return res.status(404).json({ error: 'Producto no disponible.' });
      if (producto.vendedor_id === compradorId) {
        return res.status(400).json({ error: 'No puedes comprar tu propio producto.' });
      }

      // Comprobar saldo del comprador
      db.get('SELECT saldo FROM usuarios WHERE id = ?', [compradorId], (err, comprador) => {
        if (err) return res.status(500).json({ error: 'Error interno del servidor.' });
        if (comprador.saldo < producto.precio) {
          return res.status(400).json({ error: 'Saldo insuficiente.' });
        }

        // Transacción: descontar saldo + registrar compra + desactivar producto
        db.serialize(() => {
          db.run('UPDATE usuarios SET saldo = saldo - ? WHERE id = ?', [producto.precio, compradorId]);
          db.run('UPDATE usuarios SET saldo = saldo + ? WHERE id = ?', [producto.precio, producto.vendedor_id]);
          db.run('UPDATE productos SET activo = 0 WHERE id = ?', [productoId]);
          db.run(
            'INSERT INTO compras (producto_id, comprador_id, precio) VALUES (?, ?, ?)',
            [productoId, compradorId, producto.precio],
            function (err) {
              if (err) return res.status(500).json({ error: 'Error al procesar la compra.' });

              // Devolver saldo actualizado
              db.get('SELECT saldo FROM usuarios WHERE id = ?', [compradorId], (err, row) => {
                res.json({
                  mensaje: `¡Compra realizada con éxito! Has comprado "${producto.nombre}".`,
                  saldo_nuevo: row ? row.saldo : null,
                });
              });
            }
          );
        });
      });
    }
  );
});

// ===================== RUTAS DEL PANEL =====================

/**
 * GET /api/mis-compras
 * Devuelve las compras del usuario autenticado
 */
app.get('/api/mis-compras', autenticar, (req, res) => {
  db.all(
    `SELECT c.id, p.nombre, p.imagen_url, c.precio, c.fecha
     FROM compras c
     JOIN productos p ON c.producto_id = p.id
     WHERE c.comprador_id = ?
     ORDER BY c.fecha DESC`,
    [req.usuario.id],
    (err, filas) => {
      if (err) return res.status(500).json({ error: 'Error al obtener las compras.' });
      res.json(filas);
    }
  );
});

/**
 * GET /api/mis-productos
 * Devuelve los productos activos publicados por el usuario autenticado
 */
app.get('/api/mis-productos', autenticar, (req, res) => {
  db.all(
    `SELECT id, nombre, descripcion, precio, imagen_url, creado_en
     FROM productos
     WHERE vendedor_id = ? AND activo = 1
     ORDER BY creado_en DESC`,
    [req.usuario.id],
    (err, filas) => {
      if (err) return res.status(500).json({ error: 'Error al obtener tus productos.' });
      res.json(filas);
    }
  );
});

// ===================== RUTA 404 =====================
app.use((req, res) => {
  res.status(404).json({ error: `Ruta "${req.method} ${req.path}" no encontrada.` });
});

// ===================== ARRANQUE =====================
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📦 Endpoints disponibles:`);
  console.log(`   POST   /api/auth/registro`);
  console.log(`   POST   /api/auth/login`);
  console.log(`   GET    /api/usuario/perfil`);
  console.log(`   GET    /api/productos`);
  console.log(`   POST   /api/productos`);
  console.log(`   DELETE /api/productos/:id`);
  console.log(`   POST   /api/comprar/:id`);
  console.log(`   GET    /api/mis-compras`);
  console.log(`   GET    /api/mis-productos\n`);
});