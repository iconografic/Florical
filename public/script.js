/* =============================================
   FLORICAL — Lógica principal
   ============================================= */

// ── Estado global de la app ──────────────────
const state = {
  flores:   [],   // [{nombre, proveedor, unidad, costoUnitario, precio}]
  mecanico: [],   // [{nombre, unidad, costoUnitario, precio}]
  profile:  null, // {name, address, phone, email, logoDataUrl}
  project: {
    nombre:  '',
    cliente: '',
    fecha:   '',
    items:   []   // [{tipo, nombre, unidad, cantidad, precioUnitario, costoUnitario, subtotal}]
  },
  selectedItem: null, // ítem seleccionado del autocomplete
  currentType:  'Flor'
};

// ── Helpers básicos ──────────────────────────
const $  = id => document.getElementById(id);
const fmt = n  => '$' + (parseFloat(n) || 0).toFixed(2);

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo(0, 0);
}

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function showLoading(txt = 'Procesando...') {
  $('loading-txt').textContent = txt;
  $('loading').classList.add('show');
}

function hideLoading() {
  $('loading').classList.remove('show');
}

function quoteNumber() {
  return 'FC-' + Date.now().toString().slice(-6);
}

// ── AUTH: códigos válidos (fallback cliente) ──
// Agrega o quita códigos aquí para controlar el acceso
const VALID_CODES = ['FLORISTA01', 'DEMO2024', 'ACCESO01'];

// Verifica primero con el servidor; si no hay servidor (archivo abierto directo),
// usa la lista local VALID_CODES como respaldo.
async function verifyCode(code) {
  const normalized = code.trim().toUpperCase();

  try {
    const res = await fetch('/api/verify-code', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code }),
      signal:  AbortSignal.timeout(3000) // 3 seg máximo
    });
    const data = await res.json();
    return data.valid;
  } catch {
    // Sin servidor (archivo abierto directo) → verificar localmente
    return VALID_CODES.map(c => c.toUpperCase()).includes(normalized);
  }
}

// ── PERFIL: guardar y leer desde localStorage ─
function saveProfile(profile) {
  localStorage.setItem('florical_profile', JSON.stringify(profile));
  state.profile = profile;
}

function loadProfile() {
  const raw = localStorage.getItem('florical_profile');
  return raw ? JSON.parse(raw) : null;
}

function applyProfileToUI(profile) {
  if (!profile) return;

  // Home: avatar y saludo
  const name = profile.name || 'Florista';
  $('home-greeting-name').textContent = '¡Hola, ' + name.split(' ')[0] + '! 👋';

  if (profile.logoDataUrl) {
    const el = $('home-avatar');
    el.innerHTML = '';
    const img = document.createElement('img');
    img.src = profile.logoDataUrl;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
    el.appendChild(img);
  }

  // Formulario de perfil (para edición)
  if (profile.name)    $('biz-name').value    = profile.name;
  if (profile.address) $('biz-address').value = profile.address;
  if (profile.phone)   $('biz-phone').value   = profile.phone;
  if (profile.email)   $('biz-email').value   = profile.email;

  if (profile.logoDataUrl) {
    $('logo-preview').src = profile.logoDataUrl;
    $('logo-preview').style.display = 'block';
    $('logo-placeholder').style.display = 'none';
  }
}

// ── CATÁLOGO: guardar y leer desde localStorage ─
function saveCatalog() {
  localStorage.setItem('florical_flores',   JSON.stringify(state.flores));
  localStorage.setItem('florical_mecanico', JSON.stringify(state.mecanico));
}

function loadCatalog() {
  const f = localStorage.getItem('florical_flores');
  const m = localStorage.getItem('florical_mecanico');
  if (f) state.flores   = JSON.parse(f);
  if (m) state.mecanico = JSON.parse(m);
}

function updateCatalogStats() {
  $('stat-flores').textContent = state.flores.length;
  $('stat-mec').textContent    = state.mecanico.length;

  const hasData = state.flores.length > 0 || state.mecanico.length > 0;
  if (hasData) {
    $('import-zone-title').textContent = '↩ Actualizar catálogo';
    $('import-zone-sub').textContent   = state.flores.length + ' flores · ' + state.mecanico.length + ' mecánicos cargados';
    $('no-catalog-warning').style.display = 'none';
  }
}

// ── IMPORT EXCEL ─────────────────────────────
function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });

        // ── BD_Flores ──
        const wsF = wb.Sheets['BD_Flores'];
        const flores = [];
        if (wsF) {
          // sheet_to_json con header:1 devuelve arrays por fila
          const rows = XLSX.utils.sheet_to_json(wsF, { header: 1 });
          // Fila 0: título, 1: instrucciones, 2: headers → datos desde fila 3
          for (let i = 3; i < rows.length; i++) {
            const r = rows[i];
            // Col 0: nombre, 1: proveedor, 2: tallos/paquete, 3: costo paquete,
            // 4: costo/tallo, 5: factor, 6: precio c/factor, 7: IVA, 8: precio neto
            if (r[0] && r[8]) {
              flores.push({
                nombre:        String(r[0]).trim(),
                proveedor:     r[1] ? String(r[1]).trim() : '',
                unidad:        'Tallo',
                costoUnitario: parseFloat(r[4]) || 0,
                precio:        parseFloat(r[8]) || 0
              });
            }
          }
        }

        // ── BD_Mecanico ──
        const wsM = wb.Sheets['BD_Mecanico'];
        const mecanico = [];
        if (wsM) {
          const rows = XLSX.utils.sheet_to_json(wsM, { header: 1 });
          // Col 0: nombre, 1: medida, 2: costo unitario, 3: factor,
          // 4: precio c/factor, 5: IVA, 6: precio neto
          for (let i = 3; i < rows.length; i++) {
            const r = rows[i];
            if (r[0] && r[6]) {
              mecanico.push({
                nombre:        String(r[0]).trim(),
                unidad:        r[1] ? String(r[1]).trim() : 'pieza',
                costoUnitario: parseFloat(r[2]) || 0,
                precio:        parseFloat(r[6]) || 0
              });
            }
          }
        }

        resolve({ flores, mecanico });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsArrayBuffer(file);
  });
}

// ── CALCULADORA: tipo (Flor / Mecánico) ──────
function setType(tipo) {
  state.currentType    = tipo;
  state.selectedItem   = null;
  $('search-input').value = '';
  $('price-display').textContent = '—';
  $('qty-input').value = '';
  closeAutocomplete();

  $('type-flor').classList.toggle('active', tipo === 'Flor');
  $('type-mec').classList.toggle('active',  tipo === 'Mecánico');
}

// ── AUTOCOMPLETE ─────────────────────────────
function openAutocomplete(items) {
  const list = $('autocomplete-list');
  list.innerHTML = '';

  if (items.length === 0) {
    list.classList.remove('open');
    return;
  }

  items.slice(0, 12).forEach(item => {
    const div = document.createElement('div');
    div.className = 'autocomplete-item';
    div.innerHTML = `
      <span class="ac-name">${item.nombre}</span>
      <span class="ac-meta">${fmt(item.precio)} / ${item.unidad}</span>
    `;
    div.addEventListener('mousedown', e => {
      e.preventDefault(); // evita blur antes de click
      selectItem(item);
    });
    list.appendChild(div);
  });

  list.classList.add('open');
}

function closeAutocomplete() {
  $('autocomplete-list').classList.remove('open');
}

function selectItem(item) {
  state.selectedItem = item;
  $('search-input').value       = item.nombre;
  $('price-display').textContent = fmt(item.precio) + ' / ' + item.unidad;
  $('qty-input').value           = '';
  closeAutocomplete();
  $('qty-input').focus();
}

// ── ITEMS: agregar, eliminar, renderizar ──────
function addItem() {
  const item = state.selectedItem;
  const qty  = parseFloat($('qty-input').value);

  if (!item) { showToast('Selecciona un producto primero'); return; }
  if (!qty || qty <= 0) { showToast('Ingresa una cantidad válida'); return; }

  state.project.items.push({
    tipo:          state.currentType,
    nombre:        item.nombre,
    unidad:        item.unidad,
    cantidad:      qty,
    precioUnitario: item.precio,
    costoUnitario:  item.costoUnitario,
    subtotal:       item.precio * qty
  });

  // Limpiar selección
  state.selectedItem = null;
  $('search-input').value        = '';
  $('price-display').textContent = '—';
  $('qty-input').value           = '';

  renderItems();
  updateTotals();
  showToast('✓ ' + item.nombre + ' agregado');
}

function removeItem(idx) {
  state.project.items.splice(idx, 1);
  renderItems();
  updateTotals();
}

function renderItems() {
  const list = $('items-list');

  if (state.project.items.length === 0) {
    list.innerHTML = `
      <p class="text-center text-muted text-sm" style="padding:20px 0;">
        Aún no hay ítems. Agrega flores y materiales arriba.
      </p>`;
    return;
  }

  list.innerHTML = state.project.items.map((it, i) => `
    <div class="item-row">
      <div class="item-info">
        <div class="item-name">${it.nombre}</div>
        <div class="item-meta">
          <span class="tag tag-${it.tipo === 'Flor' ? 'flor' : 'mecanico'}">${it.tipo}</span>
          <span>${it.cantidad} ${it.unidad}</span>
        </div>
      </div>
      <div class="item-price">${fmt(it.subtotal)}</div>
      <button class="item-del" onclick="removeItem(${i})" title="Eliminar">×</button>
    </div>
  `).join('');
}

function updateTotals() {
  const items = state.project.items;
  const hasItems = items.length > 0;

  $('totals-card').style.display           = hasItems ? 'block' : 'none';
  $('btn-ver-cotizacion').classList.toggle('hidden', !hasItems);

  if (!hasItems) return;

  const flores   = items.filter(i => i.tipo === 'Flor');
  const mecanico = items.filter(i => i.tipo === 'Mecánico');

  const tFlores   = flores.reduce((s, i) => s + i.subtotal, 0);
  const tMecanico = mecanico.reduce((s, i) => s + i.subtotal, 0);
  const total     = tFlores + tMecanico;
  const costoBase = items.reduce((s, i) => s + i.costoUnitario * i.cantidad, 0);
  const utilidad  = total - costoBase;

  $('total-flores').textContent  = fmt(tFlores);
  $('total-mecanico').textContent = fmt(tMecanico);
  $('total-general').textContent  = fmt(total);
  $('costo-base').textContent    = fmt(costoBase);
  $('utilidad').textContent       = fmt(utilidad);
}

// ── COTIZACIÓN: renderizar vista ──────────────
function renderQuote() {
  const profile = state.profile || {};
  const project = state.project;
  const items   = project.items;

  // Número y fecha
  $('q-number').textContent = quoteNumber();
  $('q-date').textContent   = new Date().toLocaleDateString('es-MX', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  // Datos del negocio
  $('q-biz-name').textContent = profile.name || 'Mi Florería';

  const metaParts = [profile.address, profile.phone, profile.email].filter(Boolean);
  $('q-biz-meta').textContent = metaParts.join(' · ');

  // Logo
  if (profile.logoDataUrl) {
    $('q-logo-img').src = profile.logoDataUrl;
    $('q-logo-img').style.display    = 'block';
    $('q-logo-placeholder').style.display = 'none';
  } else {
    $('q-logo-img').style.display         = 'none';
    $('q-logo-placeholder').style.display = 'flex';
  }

  // Cliente y proyecto
  $('q-client').textContent  = project.cliente || '—';
  $('q-project').textContent = project.nombre  || '—';

  // Ítems
  $('q-items-list').innerHTML = items.map(it => `
    <div class="quote-item-row">
      <div>
        <div class="q-name">${it.nombre}</div>
        <div style="font-size:11px;color:var(--text-2);">
          <span class="tag tag-${it.tipo === 'Flor' ? 'flor' : 'mecanico'}">${it.tipo}</span>
        </div>
      </div>
      <div class="q-right">${it.cantidad} ${it.unidad}</div>
      <div class="q-right">${fmt(it.precioUnitario)}</div>
      <div class="q-total">${fmt(it.subtotal)}</div>
    </div>
  `).join('');

  // Totales
  const tFlores   = items.filter(i => i.tipo === 'Flor').reduce((s, i) => s + i.subtotal, 0);
  const tMecanico = items.filter(i => i.tipo === 'Mecánico').reduce((s, i) => s + i.subtotal, 0);
  const total     = tFlores + tMecanico;

  $('q-total-flores').textContent = fmt(tFlores);
  $('q-total-mec').textContent    = fmt(tMecanico);
  $('q-grand-total').textContent  = fmt(total);

  // Footer
  const contactParts = [profile.phone, profile.email].filter(Boolean);
  $('q-footer-contact').textContent = contactParts.join(' · ');
}

// ── PDF: generar y descargar ─────────────────
async function downloadPDF() {
  showLoading('Generando PDF...');
  try {
    const doc = $('quote-doc');

    // html2canvas captura el div de cotización
    const canvas = await html2canvas(doc, {
      scale:           2,      // alta resolución
      useCORS:         true,
      backgroundColor: '#ffffff',
      logging:         false
    });

    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit:        'px',
      format:      [canvas.width / 2, canvas.height / 2]
    });

    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);

    const clienteName = state.project.cliente
      ? state.project.cliente.replace(/\s+/g, '_')
      : 'cotizacion';
    pdf.save('FloriCalc_' + clienteName + '.pdf');

    showToast('✓ PDF descargado');
  } catch (err) {
    console.error(err);
    showToast('Error generando PDF. Intenta de nuevo.');
  } finally {
    hideLoading();
  }
}

// ── WHATSAPP: compartir con enlace ───────────
function shareWhatsApp() {
  const total    = state.project.items.reduce((s, i) => s + i.subtotal, 0);
  const cliente  = state.project.cliente || 'cliente';
  const proyecto = state.project.nombre  || 'tu proyecto';
  const biz      = state.profile?.name   || 'FloriCalc';

  const msg = encodeURIComponent(
    `Hola ${cliente} 🌸\n\n` +
    `Te comparto la cotización de *${proyecto}*:\n\n` +
    `💐 Flores + Mecánico\n` +
    `*Total: ${fmt(total)}* (IVA incluido)\n\n` +
    `Con cariño,\n${biz}`
  );

  window.open('https://wa.me/?text=' + msg, '_blank');
}

// ── INIT: arrancar la app ────────────────────
function init() {
  // Cargar datos guardados
  const profile = loadProfile();
  loadCatalog();
  updateCatalogStats();

  if (profile) {
    state.profile = profile;
    applyProfileToUI(profile);
    showView('view-home');
  } else {
    showView('view-login');
  }

  // Fecha de hoy por defecto
  const today = new Date().toISOString().split('T')[0];
  $('proj-fecha').value = today;

  bindEvents();
}

// ── EVENTOS ──────────────────────────────────
function bindEvents() {

  // LOGIN
  $('btn-login').addEventListener('click', async () => {
    const code = $('code-input').value.trim();
    if (!code) { showToast('Escribe tu código de acceso'); return; }

    showLoading('Verificando...');
    const valid = await verifyCode(code);
    hideLoading();

    if (valid) {
      localStorage.setItem('florical_auth', '1');
      $('login-error').classList.remove('show');

      const profile = loadProfile();
      if (profile) {
        state.profile = profile;
        applyProfileToUI(profile);
        showView('view-home');
      } else {
        showView('view-profile');
      }
    } else {
      $('login-error').classList.add('show');
      $('code-input').focus();
    }
  });

  // LOGIN: permitir Enter
  $('code-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('btn-login').click();
  });

  // PERFIL: logo upload
  $('logo-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target.result;
      $('logo-preview').src = dataUrl;
      $('logo-preview').style.display = 'block';
      $('logo-placeholder').style.display = 'none';
      // Guardar temporalmente en el profile del state
      if (!state.profile) state.profile = {};
      state.profile.logoDataUrl = dataUrl;
    };
    reader.readAsDataURL(file);
  });

  // PERFIL: guardar
  $('btn-save-profile').addEventListener('click', () => {
    const profile = {
      name:       $('biz-name').value.trim(),
      address:    $('biz-address').value.trim(),
      phone:      $('biz-phone').value.trim(),
      email:      $('biz-email').value.trim(),
      logoDataUrl: state.profile?.logoDataUrl || null
    };

    if (!profile.name) { showToast('Escribe el nombre del negocio'); return; }

    saveProfile(profile);
    applyProfileToUI(profile);
    updateCatalogStats();
    showToast('✓ Perfil guardado');
    showView('view-home');
  });

  // PERFIL: saltar
  $('skip-profile').addEventListener('click', e => {
    e.preventDefault();
    showView('view-home');
  });

  // HOME: ir a editar perfil
  $('btn-go-profile').addEventListener('click', () => {
    if (state.profile) applyProfileToUI(state.profile);
    showView('view-profile');
    // Cambiar botón a "Guardar cambios"
    $('btn-save-profile').textContent = 'Guardar cambios';
  });

  // HOME: importar Excel
  $('import-zone').addEventListener('click', () => $('excel-file').click());

  $('excel-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;

    showLoading('Importando catálogo...');
    try {
      const { flores, mecanico } = await parseExcel(file);

      if (flores.length === 0 && mecanico.length === 0) {
        showToast('⚠️ No se encontraron datos. ¿Es el archivo correcto?');
        return;
      }

      state.flores   = flores;
      state.mecanico = mecanico;
      saveCatalog();
      updateCatalogStats();

      showToast('✓ ' + flores.length + ' flores y ' + mecanico.length + ' mecánicos importados');
    } catch (err) {
      console.error(err);
      showToast('Error al leer el archivo Excel');
    } finally {
      hideLoading();
      e.target.value = ''; // limpiar input
    }
  });

  // HOME: nueva cotización
  $('btn-nueva-cotizacion').addEventListener('click', () => {
    if (state.flores.length === 0 && state.mecanico.length === 0) {
      $('no-catalog-warning').style.display = 'block';
      showToast('Importa tu catálogo primero');
      return;
    }
    // Reiniciar proyecto
    state.project = { nombre: '', cliente: '', fecha: '', items: [] };
    const today = new Date().toISOString().split('T')[0];
    $('proj-nombre').value = '';
    $('proj-cliente').value = '';
    $('proj-fecha').value  = today;
    renderItems();
    updateTotals();
    setType('Flor');
    showView('view-calculator');
  });

  // CALCULADORA: volver
  $('btn-calc-back').addEventListener('click', () => showView('view-home'));

  // CALCULADORA: búsqueda con autocomplete
  $('search-input').addEventListener('input', e => {
    const q    = e.target.value.trim().toLowerCase();
    const pool = state.currentType === 'Flor' ? state.flores : state.mecanico;

    state.selectedItem = null;
    $('price-display').textContent = '—';

    if (q.length < 1) { closeAutocomplete(); return; }

    const matches = pool.filter(item =>
      item.nombre.toLowerCase().includes(q)
    );
    openAutocomplete(matches);
  });

  $('search-input').addEventListener('blur', () => {
    // Pequeño delay para que el click en el item funcione
    setTimeout(closeAutocomplete, 200);
  });

  // CALCULADORA: agregar ítem
  $('btn-add-item').addEventListener('click', addItem);

  $('qty-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addItem();
  });

  // CALCULADORA: ver cotización
  $('btn-ver-cotizacion').addEventListener('click', () => {
    // Guardar datos del proyecto desde los inputs
    state.project.nombre  = $('proj-nombre').value.trim();
    state.project.cliente = $('proj-cliente').value.trim();
    state.project.fecha   = $('proj-fecha').value;

    renderQuote();
    showView('view-quote');
  });

  // COTIZACIÓN: volver a calculadora
  $('btn-quote-back').addEventListener('click', () => showView('view-calculator'));

  // COTIZACIÓN: descargar PDF
  $('btn-download-pdf').addEventListener('click', downloadPDF);

  // COTIZACIÓN: compartir por WhatsApp
  $('btn-whatsapp').addEventListener('click', shareWhatsApp);
}

// ── Arrancar cuando el DOM esté listo ────────
document.addEventListener('DOMContentLoaded', init);
