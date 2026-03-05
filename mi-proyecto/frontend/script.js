// ===================== CONFIG =====================
const API = 'http://localhost:3000/api';

// ===================== TOAST =====================
function toast(msg, type = 'success', duration = 3500) {
  const icons = { success: '✅', error: '❌', info: '💡' };
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ===================== AUTH HELPERS =====================
function getToken() {
  return localStorage.getItem('token');
}

function setSession(token, usuario) {
  localStorage.setItem('token', token);
  localStorage.setItem('saldo', usuario.saldo);
  localStorage.setItem('user_id', usuario.id);
  localStorage.setItem('email', usuario.email);
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('saldo');
  localStorage.removeItem('user_id');
  localStorage.removeItem('email');
}

function estaLogueado() {
  return !!getToken();
}

// ===================== API HELPER =====================
async function apiFetch(ruta, opciones = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (getToken()) headers['Authorization'] = `Bearer ${getToken()}`;

  const res = await fetch(`${API}${ruta}`, { ...opciones, headers });
  const data = await res.json();

  if (!res.ok) {
    const mensaje = data.error || data.errores?.[0]?.msg || 'Error desconocido';
    throw new Error(mensaje);
  }

  return data;
}

// ===================== STATE =====================
const state = { cart: [] };

// ===================== ELEMENTS =====================
const vistas = {
  catalogo: document.getElementById('vista-catalogo'),
  login:    document.getElementById('vista-login'),
  registro: document.getElementById('vista-registro'),
  vender:   document.getElementById('vista-vender'),
  misCosas: document.getElementById('vista-mis-cosas'),
};

const els = {
  menuPublico: document.getElementById('menu-publico'),
  menuPrivado: document.getElementById('menu-privado'),
  userSaldo:   document.getElementById('user-saldo'),
  cartCount:   document.getElementById('cart-count'),
  cartOverlay: document.getElementById('cart-overlay'),
  cartDrawer:  document.getElementById('cart-drawer'),
  cartBody:    document.getElementById('cart-body'),
  cartEmpty:   document.getElementById('cart-empty'),
  cartFooter:  document.getElementById('cart-footer'),
  cartTotal:   document.getElementById('cart-total'),
  buscador:    document.getElementById('buscador'),
  sortSelect:  document.getElementById('sort-select'),
};

// ===================== NAVIGATION =====================
function mostrarVista(nombre) {
  Object.values(vistas).forEach(v => v.classList.remove('active'));
  vistas[nombre].classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function actualizarNav() {
  const saldo = parseFloat(localStorage.getItem('saldo') || 0).toLocaleString('es-ES');
  if (estaLogueado()) {
    els.menuPublico.style.display = 'none';
    els.menuPrivado.style.display = 'flex';
    els.userSaldo.textContent = `${saldo} €`;
    const statSaldo = document.getElementById('stat-saldo');
    if (statSaldo) statSaldo.textContent = `${saldo}€`;
  } else {
    els.menuPublico.style.display = 'flex';
    els.menuPrivado.style.display = 'none';
  }
}

document.getElementById('link-inicio').addEventListener('click', e => {
  e.preventDefault(); cargarCatalogo(); mostrarVista('catalogo');
});
document.getElementById('link-login').addEventListener('click', e => {
  e.preventDefault(); mostrarVista('login');
});
document.getElementById('link-registro').addEventListener('click', e => {
  e.preventDefault(); mostrarVista('registro');
});
document.getElementById('link-vender').addEventListener('click', e => {
  e.preventDefault();
  if (!estaLogueado()) { toast('Inicia sesión para vender', 'info'); mostrarVista('login'); return; }
  mostrarVista('vender');
});
document.getElementById('link-mis-cosas').addEventListener('click', e => {
  e.preventDefault(); cargarDashboard(); mostrarVista('misCosas');
});
document.getElementById('link-logout').addEventListener('click', e => {
  e.preventDefault();
  clearSession();
  state.cart = [];
  renderCart();
  actualizarNav();
  cargarCatalogo();
  mostrarVista('catalogo');
  toast('Sesión cerrada correctamente.', 'info');
});

// ===================== CART =====================
function abrirCarrito()  {
  els.cartDrawer.classList.add('open');
  els.cartOverlay.classList.add('open');
}
function cerrarCarrito() {
  els.cartDrawer.classList.remove('open');
  els.cartOverlay.classList.remove('open');
}

document.getElementById('btn-carrito').addEventListener('click', abrirCarrito);
document.getElementById('close-cart').addEventListener('click', cerrarCarrito);
els.cartOverlay.addEventListener('click', cerrarCarrito);

document.getElementById('btn-checkout').addEventListener('click', async () => {
  if (state.cart.length === 0) return;

  let exitos = 0;
  let nuevoSaldo = null;

  for (const item of state.cart) {
    try {
      const res = await apiFetch(`/comprar/${item.id}`, { method: 'POST' });
      nuevoSaldo = res.saldo_nuevo;
      exitos++;
    } catch (err) {
      toast(`Error al comprar "${item.nombre}": ${err.message}`, 'error');
    }
  }

  if (exitos > 0) {
    if (nuevoSaldo !== null) {
      localStorage.setItem('saldo', nuevoSaldo);
      actualizarNav();
    }
    state.cart = [];
    renderCart();
    cerrarCarrito();
    cargarCatalogo();
    toast(`¡${exitos} compra(s) realizadas con éxito! ✦`, 'success');
  }
});

function renderCart() {
  const items = state.cart;

  if (items.length > 0) {
    els.cartCount.textContent = items.length;
    els.cartCount.classList.add('visible');
  } else {
    els.cartCount.classList.remove('visible');
  }

  els.cartEmpty.style.display  = items.length === 0 ? 'flex' : 'none';
  els.cartFooter.style.display = items.length > 0  ? 'block' : 'none';

  document.querySelectorAll('.cart-item').forEach(el => el.remove());

  items.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'cart-item';
    div.innerHTML = `
      <img src="${item.imagen_url || ''}" alt="${item.nombre}" class="cart-item-img"
           onerror="this.src='https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?w=80&q=60'">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.nombre}</div>
        <div class="cart-item-price">${parseFloat(item.precio).toFixed(2)} €</div>
      </div>
      <button class="remove-item" data-idx="${idx}" title="Eliminar">✕</button>
    `;
    els.cartBody.appendChild(div);
  });

  const total = items.reduce((acc, i) => acc + parseFloat(i.precio), 0);
  els.cartTotal.textContent = `${total.toFixed(2)} €`;

  document.querySelectorAll('.remove-item').forEach(btn => {
    btn.addEventListener('click', () => {
      state.cart.splice(parseInt(btn.dataset.idx), 1);
      renderCart();
    });
  });
}

function addToCart(producto) {
  if (!estaLogueado()) {
    toast('Inicia sesión para añadir al carrito', 'info');
    mostrarVista('login');
    return;
  }
  if (state.cart.find(p => p.id === producto.id)) {
    toast('Este producto ya está en el carrito', 'info');
    return;
  }
  state.cart.push({ ...producto });
  renderCart();
  toast(`"${producto.nombre}" añadido al carrito ✦`, 'success');
}

// ===================== CATÁLOGO =====================
let todosLosProductos = [];

function crearTarjeta(producto) {
  const tarjeta = document.createElement('div');
  tarjeta.className = 'product-card';
  const esMio = producto.vendedor_id === parseInt(localStorage.getItem('user_id'));

  tarjeta.innerHTML = `
    <div class="product-img-wrap">
      <img src="${producto.imagen_url || ''}" alt="${producto.nombre}" class="product-img" loading="lazy"
           onerror="this.src='https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?w=500&q=60'">
    </div>
    <div class="product-content">
      <p class="product-seller">${producto.vendedor || 'Vendedor verificado'}</p>
      <h3 class="product-title">${producto.nombre}</h3>
      <p class="product-desc">${producto.descripcion}</p>
      <div class="product-footer">
        <span class="product-price">${parseFloat(producto.precio).toFixed(2)} €</span>
        ${esMio
          ? '<span class="btn btn-ghost btn-sm">Tu producto</span>'
          : '<button class="btn btn-primary btn-sm add-btn">Añadir →</button>'
        }
      </div>
    </div>
  `;

  if (!esMio) {
    tarjeta.querySelector('.add-btn').addEventListener('click', () => addToCart(producto));
  }
  return tarjeta;
}

function renderProductos(lista) {
  const contenedor = document.getElementById('lista-productos');
  contenedor.innerHTML = '';

  if (lista.length === 0) {
    contenedor.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p>No se encontraron productos.</p>
      </div>`;
    return;
  }

  lista.forEach(p => contenedor.appendChild(crearTarjeta(p)));
}

function filtrarYOrdenar() {
  const query = els.buscador.value.toLowerCase();
  const sort  = els.sortSelect.value;

  let lista = todosLosProductos.filter(p =>
    p.nombre.toLowerCase().includes(query) ||
    p.descripcion.toLowerCase().includes(query)
  );

  if (sort === 'price-asc')  lista.sort((a, b) => a.precio - b.precio);
  if (sort === 'price-desc') lista.sort((a, b) => b.precio - a.precio);
  if (sort === 'name')       lista.sort((a, b) => a.nombre.localeCompare(b.nombre));

  renderProductos(lista);
}

async function cargarCatalogo() {
  const contenedor = document.getElementById('lista-productos');
  contenedor.innerHTML = '<div class="empty-state"><p>Cargando productos…</p></div>';

  try {
    todosLosProductos = await apiFetch('/productos');
    filtrarYOrdenar();
  } catch (err) {
    contenedor.innerHTML = '<div class="empty-state"><p>Error al cargar productos. ¿Está el servidor encendido?</p></div>';
    toast('No se pudo conectar con el servidor', 'error');
  }
}

els.buscador.addEventListener('input', filtrarYOrdenar);
els.sortSelect.addEventListener('change', filtrarYOrdenar);

// ===================== FORMS =====================
function setError(inputId, errorId, condicion, mensaje) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(errorId);
  if (condicion) {
    input.classList.add('error');
    error.textContent = mensaje;
    error.classList.add('show');
    return false;
  }
  input.classList.remove('error');
  error.classList.remove('show');
  return true;
}

// --- Login ---
document.getElementById('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const pass  = document.getElementById('login-password').value;

  const v1 = setError('login-email',    'err-login-email', !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Introduce un correo válido.');
  const v2 = setError('login-password', 'err-login-pass',  !pass, 'La contraseña no puede estar vacía.');
  if (!v1 || !v2) return;

  const btn = e.target.querySelector('button[type="submit"]');
  btn.textContent = 'Entrando…'; btn.disabled = true;

  try {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: pass }),
    });
    setSession(data.token, data.usuario);
    actualizarNav();
    toast('¡Bienvenido a Mercado! ✦', 'success');
    e.target.reset();
    cargarCatalogo();
    mostrarVista('catalogo');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.textContent = 'Entrar →'; btn.disabled = false;
  }
});

// --- Registro ---
document.getElementById('form-registro').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('reg-email').value;
  const pass  = document.getElementById('reg-password').value;
  const conf  = document.getElementById('reg-password-conf').value;

  const v1 = setError('reg-email',         'err-reg-email', !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Introduce un correo válido.');
  const v2 = setError('reg-password', 'err-reg-pass', pass.trim().length < 6, 'Mínimo 6 caracteres sin espacios.');
  const v3 = setError('reg-password-conf', 'err-reg-conf',  pass !== conf,       'Las contraseñas no coinciden.');
  if (!v1 || !v2 || !v3) return;

  const btn = e.target.querySelector('button[type="submit"]');
  btn.textContent = 'Creando cuenta…'; btn.disabled = true;

  try {
    const data = await apiFetch('/auth/registro', {
      method: 'POST',
      body: JSON.stringify({ email, password: pass }),
    });
    setSession(data.token, data.usuario);
    actualizarNav();
    toast('¡Cuenta creada con éxito! ✦', 'success');
    e.target.reset();
    cargarCatalogo();
    mostrarVista('catalogo');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.textContent = 'Crear Cuenta →'; btn.disabled = false;
  }
});

// --- Vender ---
document.getElementById('form-vender').addEventListener('submit', async e => {
  e.preventDefault();
  const nombre = document.getElementById('prod-nombre').value;
  const desc   = document.getElementById('prod-descripcion').value;
  const precio = document.getElementById('prod-precio').value;
  const imagen = document.getElementById('prod-imagen').value;

  const v1 = setError('prod-nombre',      'err-prod-nombre', !nombre.trim(),                         'El nombre es obligatorio.');
  const v2 = setError('prod-descripcion', 'err-prod-desc',   !desc.trim(),                            'La descripción es obligatoria.');
  const v3 = setError('prod-precio',      'err-prod-precio', !precio || parseFloat(precio) <= 0,     'Introduce un precio válido.');
  if (!v1 || !v2 || !v3) return;

  const btn = e.target.querySelector('button[type="submit"]');
  btn.textContent = 'Publicando…'; btn.disabled = true;

  try {
    await apiFetch('/productos', {
      method: 'POST',
      body: JSON.stringify({
        nombre:      nombre.trim(),
        descripcion: desc.trim(),
        precio:      parseFloat(precio),
        imagen_url:  imagen || undefined,
      }),
    });
    toast(`"${nombre}" publicado con éxito ✦`, 'success');
    e.target.reset();
    cargarCatalogo();
    mostrarVista('catalogo');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.textContent = 'Publicar Ahora →'; btn.disabled = false;
  }
});

// ===================== DASHBOARD =====================
async function cargarDashboard() {
  const saldo = parseFloat(localStorage.getItem('saldo') || 0).toLocaleString('es-ES');
  document.getElementById('stat-saldo').textContent = `${saldo}€`;

  // Compras
  try {
    const compras = await apiFetch('/mis-compras');
    document.getElementById('stat-compras').textContent = compras.length;

    const listaCompras = document.getElementById('lista-mis-compras');
    if (compras.length === 0) {
      listaCompras.innerHTML = '<div class="list-empty">Aún no has realizado compras.</div>';
    } else {
      listaCompras.innerHTML = '';
      compras.forEach(c => {
        const fecha = new Date(c.fecha).toLocaleDateString('es-ES');
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
          <div class="item-info">
            <strong>${c.nombre}</strong>
            <small>Comprado el: ${fecha}</small>
          </div>
          <span class="price-tag">${parseFloat(c.precio).toFixed(2)} €</span>
        `;
        listaCompras.appendChild(div);
      });
    }
  } catch (err) {
    toast('Error al cargar compras', 'error');
  }

  // Productos propios
  try {
    const productos = await apiFetch('/mis-productos');
    document.getElementById('stat-ventas').textContent = productos.length;

    const listaVentas = document.getElementById('lista-mis-productos');
    if (productos.length === 0) {
      listaVentas.innerHTML = '<div class="list-empty">Aún no tienes productos publicados.</div>';
    } else {
      listaVentas.innerHTML = '';
      productos.forEach(p => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
          <div class="item-info">
            <strong>${p.nombre}</strong>
            <small>Activo</small>
          </div>
          <div class="item-actions">
            <span class="price-tag">${parseFloat(p.precio).toFixed(2)} €</span>
            <button class="btn btn-ghost btn-sm" data-edit-id="${p.id}">Editar</button>
            <button class="btn btn-danger btn-sm" data-id="${p.id}">Eliminar</button>
          </div>
        `;
        listaVentas.appendChild(div);
      });

      listaVentas.querySelectorAll('[data-edit-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const prod = productos.find(p => p.id === parseInt(btn.dataset.editId));
          if (prod) abrirModal(prod);
        });
      });

      listaVentas.querySelectorAll('[data-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await apiFetch(`/productos/${btn.dataset.id}`, { method: 'DELETE' });
            toast('Producto eliminado.', 'info');
            cargarDashboard();
            cargarCatalogo();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      });
    }
  } catch (err) {
    toast('Error al cargar tus productos', 'error');
  }
}

// ===================== INIT =====================
actualizarNav();
cargarCatalogo();
renderCart();

// ===================== MODAL EDITAR =====================
function abrirModal(producto) {
  document.getElementById('edit-id').value          = producto.id;
  document.getElementById('edit-nombre').value      = producto.nombre;
  document.getElementById('edit-descripcion').value = producto.descripcion;
  document.getElementById('edit-precio').value      = producto.precio;
  document.getElementById('edit-imagen').value      = producto.imagen_url || '';
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('modal-editar').classList.add('open');
}

function cerrarModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.getElementById('modal-editar').classList.remove('open');
}

document.getElementById('close-modal').addEventListener('click', cerrarModal);
document.getElementById('modal-overlay').addEventListener('click', cerrarModal);

document.getElementById('form-editar').addEventListener('submit', async e => {
  e.preventDefault();
  const id     = document.getElementById('edit-id').value;
  const nombre = document.getElementById('edit-nombre').value;
  const desc   = document.getElementById('edit-descripcion').value;
  const precio = document.getElementById('edit-precio').value;
  const imagen = document.getElementById('edit-imagen').value;

  const v1 = setError('edit-nombre',      'err-edit-nombre', !nombre.trim(),                     'El nombre es obligatorio.');
  const v2 = setError('edit-descripcion', 'err-edit-desc',   !desc.trim(),                       'La descripción es obligatoria.');
  const v3 = setError('edit-precio',      'err-edit-precio', !precio || parseFloat(precio) <= 0, 'Introduce un precio válido.');
  if (!v1 || !v2 || !v3) return;

  const btn = e.target.querySelector('button[type="submit"]');
  btn.textContent = 'Guardando…'; btn.disabled = true;

  try {
    await apiFetch(`/productos/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        nombre:      nombre.trim(),
        descripcion: desc.trim(),
        precio:      parseFloat(precio),
        imagen_url:  imagen || undefined,
      }),
    });
    toast('Producto actualizado con éxito ✦', 'success');
    cerrarModal();
    cargarDashboard();
    cargarCatalogo();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.textContent = 'Guardar Cambios →'; btn.disabled = false;
  }
});