// ── State ──
const state = {
  token: null,
  profile: {},
  catalog: { flores: [], mecanico: [] },
  concepts: [],
  quotes: [],
  currentQuote: null,
  currentQuoteId: null,
  currentView: 'cotizar',
  prevView: 'historial',
  bankAccounts: [],
  editingBankId: null,
  setupLogoDataUrl: null,
  editLogoDataUrl: null
};

// ── API ──
async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok && res.status === 401) { logout(); return {}; }
  return res.json().catch(() => ({}));
}

// ── Helpers ──
function show(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}
function hide(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}
function showLoading(txt) {
  const el = document.getElementById('loading-txt');
  if (el) el.textContent = txt || 'Cargando...';
  show('loading');
}
function hideLoading() { hide('loading'); }

function showToast(msg, type) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast hidden'; }, 3200);
}
function openModal(id) { show(id); }
function closeModal(id) { hide(id); }

function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escJs(str) {
  if (!str) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}
function formatCurrency(val) {
  const n = parseFloat(val) || 0;
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatCurrencyPlain(val) {
  const n = parseFloat(val) || 0;
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch(e) { return dateStr; }
}

// ── AUTH ──
async function handleLogin() {
  const code = document.getElementById('code-input').value.trim();
  if (!code) { showToast('Ingresa tu codigo de acceso', 'error'); return; }
  showLoading('Verificando acceso...');
  try {
    const data = await api('POST', '/api/auth/login', { code });
    hideLoading();
    if (!data.valid) {
      if (data.suspended) {
        showToast('Cuenta suspendida. Contacta al administrador.', 'error');
      } else {
        showToast('Codigo incorrecto', 'error');
      }
      return;
    }
    state.token = data.token;
    localStorage.setItem('fc_token', data.token);
    if (!data.termsAccepted) {
      openModal('modal-terms');
    } else {
      await initApp();
    }
  } catch(e) {
    hideLoading();
    showToast('Error de conexion', 'error');
  }
}

async function acceptTerms() {
  showLoading('Guardando...');
  await api('POST', '/api/auth/accept-terms');
  hideLoading();
  closeModal('modal-terms');
  await initApp();
}

function logout() {
  localStorage.removeItem('fc_token');
  state.token = null;
  state.profile = {};
  state.catalog = { flores: [], mecanico: [] };
  state.concepts = [];
  state.quotes = [];
  state.bankAccounts = [];
  hide('app-shell');
  show('view-login');
  document.getElementById('code-input').value = '';
}

// ── INIT ──
async function initApp() {
  showLoading('Cargando tu cuenta...');
  try {
    const [profile, catalog, bankAccounts] = await Promise.all([
      api('GET', '/api/profile'),
      api('GET', '/api/catalog'),
      api('GET', '/api/bank-accounts')
    ]);
    hideLoading();
    state.profile = profile || {};
    state.catalog = catalog || { flores: [], mecanico: [] };
    state.bankAccounts = Array.isArray(bankAccounts) ? bankAccounts : [];

    if (!state.profile.name) {
      hide('view-login');
      show('view-profile-setup');
    } else {
      hide('view-login');
      show('app-shell');
      renderProfileDisplay();
      renderBankAccounts();
      renderCatalog();
      loadHistorial();
    }
  } catch(e) {
    hideLoading();
    showToast('Error al cargar datos', 'error');
  }
}

async function checkExistingToken() {
  const token = localStorage.getItem('fc_token');
  if (!token) return;
  state.token = token;
  showLoading('');
  try {
    const profile = await api('GET', '/api/profile');
    if (profile && !profile.error) {
      state.profile = profile || {};
      const [catalog, bankAccounts] = await Promise.all([
        api('GET', '/api/catalog'),
        api('GET', '/api/bank-accounts')
      ]);
      state.catalog = catalog || { flores: [], mecanico: [] };
      state.bankAccounts = Array.isArray(bankAccounts) ? bankAccounts : [];
      hideLoading();
      hide('view-login');
      show('app-shell');
      renderProfileDisplay();
      renderBankAccounts();
      renderCatalog();
      loadHistorial();
    } else {
      hideLoading();
      localStorage.removeItem('fc_token');
      state.token = null;
    }
  } catch(e) {
    hideLoading();
    localStorage.removeItem('fc_token');
    state.token = null;
  }
}

// ── PROFILE SETUP ──
function handleLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    state.setupLogoDataUrl = e.target.result;
    const el = document.getElementById('logo-preview');
    el.innerHTML = '<img src="' + e.target.result + '" style="max-height:80px;max-width:100%;object-fit:contain;"/>';
  };
  reader.readAsDataURL(file);
}

function handleEditLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    state.editLogoDataUrl = e.target.result;
    const el = document.getElementById('edit-logo-preview');
    el.innerHTML = '<img src="' + e.target.result + '" style="max-height:80px;max-width:100%;object-fit:contain;"/>';
  };
  reader.readAsDataURL(file);
}

async function saveProfileSetup() {
  const name = document.getElementById('setup-name').value.trim();
  if (!name) { showToast('El nombre es requerido', 'error'); return; }
  showLoading('Guardando perfil...');
  const profileData = {
    name,
    phone: document.getElementById('setup-phone').value.trim(),
    email: document.getElementById('setup-email').value.trim(),
    address: document.getElementById('setup-address').value.trim(),
    logo_data_url: state.setupLogoDataUrl || null
  };
  await api('PUT', '/api/profile', profileData);
  state.profile = profileData;
  hideLoading();
  hide('view-profile-setup');
  show('app-shell');
  renderProfileDisplay();
  renderBankAccounts();
  renderCatalog();
  loadHistorial();
}

// ── PROFILE EDIT ──
function toggleEditProfile() {
  const editDiv = document.getElementById('profile-edit');
  const isHidden = editDiv.classList.contains('hidden');
  if (isHidden) {
    document.getElementById('edit-name').value = state.profile.name || '';
    document.getElementById('edit-phone').value = state.profile.phone || '';
    document.getElementById('edit-email').value = state.profile.email || '';
    document.getElementById('edit-address').value = state.profile.address || '';
    state.editLogoDataUrl = null;
    const logoEl = document.getElementById('edit-logo-preview');
    if (state.profile.logo_data_url) {
      logoEl.innerHTML = '<img src="' + state.profile.logo_data_url + '" style="max-height:80px;max-width:100%;object-fit:contain;"/>';
    } else {
      logoEl.textContent = 'Toca para cambiar logo';
    }
    editDiv.classList.remove('hidden');
  } else {
    editDiv.classList.add('hidden');
  }
}

function cancelEditProfile() {
  document.getElementById('profile-edit').classList.add('hidden');
}

async function saveProfile() {
  const name = document.getElementById('edit-name').value.trim();
  if (!name) { showToast('El nombre es requerido', 'error'); return; }
  showLoading('Guardando...');
  const profileData = {
    name,
    phone: document.getElementById('edit-phone').value.trim(),
    email: document.getElementById('edit-email').value.trim(),
    address: document.getElementById('edit-address').value.trim(),
    logo_data_url: state.editLogoDataUrl || state.profile.logo_data_url || null
  };
  await api('PUT', '/api/profile', profileData);
  state.profile = profileData;
  hideLoading();
  cancelEditProfile();
  renderProfileDisplay();
  showToast('Perfil guardado', 'success');
}

function renderProfileDisplay() {
  const p = state.profile;
  const logoEl = document.getElementById('profile-logo-display');
  const infoEl = document.getElementById('profile-info-display');
  if (!logoEl || !infoEl) return;
  if (p.logo_data_url) {
    logoEl.innerHTML = '<img src="' + p.logo_data_url + '" class="profile-logo-img"/>';
  } else {
    logoEl.innerHTML = '<div class="logo-placeholder-sm">🌸</div>';
  }
  infoEl.innerHTML =
    '<div class="profile-name">' + escHtml(p.name || '') + '</div>' +
    (p.phone ? '<div class="profile-detail">' + escHtml(p.phone) + '</div>' : '') +
    (p.email ? '<div class="profile-detail">' + escHtml(p.email) + '</div>' : '') +
    (p.address ? '<div class="profile-detail">' + escHtml(p.address) + '</div>' : '');
}

// ── CATALOG ──
function switchCatalogTab(btn) {
  document.querySelectorAll('.cat-tab').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  const type = btn.dataset.type;
  document.getElementById('cat-flores').classList.toggle('hidden', type !== 'flores');
  document.getElementById('cat-mecanico').classList.toggle('hidden', type !== 'mecanico');
}

function renderCatalog() {
  renderCatalogSection('flores');
  renderCatalogSection('mecanico');
}

function renderCatalogSection(type) {
  const items = state.catalog[type] || [];
  const el = document.getElementById(type + '-items');
  if (!el) return;
  el.innerHTML = items.map(function(item, i) {
    return '<div class="catalog-item">' +
      '<input type="text" class="cat-name" value="' + escHtml(item.name) + '" placeholder="Nombre" data-type="' + type + '" data-idx="' + i + '"/>' +
      '<input type="number" class="cat-price" value="' + (item.price || 0) + '" placeholder="Precio" data-type="' + type + '" data-idx="' + i + '" min="0" step="0.01"/>' +
      '<button class="cat-del" onclick="deleteCatalogItem(\'' + type + '\',' + i + ')">&#10005;</button>' +
      '</div>';
  }).join('');
  el.querySelectorAll('.cat-name, .cat-price').forEach(function(input) {
    input.addEventListener('change', function() { syncCatalogFromDOM(); });
  });
}

function syncCatalogFromDOM() {
  ['flores', 'mecanico'].forEach(function(type) {
    const items = [];
    const nameEls = document.querySelectorAll('[data-type="' + type + '"].cat-name');
    nameEls.forEach(function(nameEl) {
      const idx = nameEl.dataset.idx;
      const priceEl = document.querySelector('[data-type="' + type + '"][data-idx="' + idx + '"].cat-price');
      items.push({ name: nameEl.value, price: parseFloat(priceEl ? priceEl.value : 0) || 0 });
    });
    state.catalog[type] = items;
  });
}

function addCatalogItem(type) {
  if (!state.catalog[type]) state.catalog[type] = [];
  state.catalog[type].push({ name: '', price: 0 });
  renderCatalogSection(type);
}

function deleteCatalogItem(type, idx) {
  state.catalog[type].splice(idx, 1);
  renderCatalogSection(type);
}

async function saveCatalog() {
  syncCatalogFromDOM();
  showLoading('Guardando catalogo...');
  await api('PUT', '/api/catalog', state.catalog);
  hideLoading();
  showToast('Catalogo guardado', 'success');
}

// ── QUOTE BUILDER ──
function addConcept() {
  state.concepts.push({ name: '', items: [] });
  renderConcepts();
  const idx = state.concepts.length - 1;
  setTimeout(function() {
    const inp = document.getElementById('concept-name-' + idx);
    if (inp) inp.focus();
  }, 50);
}

function removeConcept(idx) {
  state.concepts.splice(idx, 1);
  renderConcepts();
}

function updateConceptName(idx, val) {
  if (state.concepts[idx]) state.concepts[idx].name = val;
}

function addItemToConcept(ci) {
  if (!state.concepts[ci]) return;
  state.concepts[ci].items.push({ name: '', cantidad: 1, costoUnitario: 0 });
  renderConcepts();
}

function removeItemFromConcept(ci, ii) {
  if (!state.concepts[ci]) return;
  state.concepts[ci].items.splice(ii, 1);
  renderConcepts();
}

function updateItemField(ci, ii, field, val) {
  if (state.concepts[ci] && state.concepts[ci].items[ii]) {
    state.concepts[ci].items[ii][field] = val;
    updateTotals();
  }
}

function updateItemName(ci, ii, val) {
  if (!state.concepts[ci] || !state.concepts[ci].items[ii]) return;
  state.concepts[ci].items[ii].name = val;
  const allItems = (state.catalog.flores || []).concat(state.catalog.mecanico || []);
  const found = allItems.find(function(i) { return i.name.toLowerCase() === val.toLowerCase(); });
  if (found && found.price) {
    state.concepts[ci].items[ii].costoUnitario = found.price;
    const priceEl = document.querySelector('#concept-items-' + ci + ' .concept-item:nth-child(' + (ii+1) + ') .item-price');
    if (priceEl) { priceEl.value = found.price; }
    updateTotals();
  }
}

function showAutocomplete(ci, ii, query) {
  const acEl = document.getElementById('ac-' + ci + '-' + ii);
  if (!acEl) return;
  if (!query || query.length < 1) { acEl.classList.add('hidden'); return; }
  const allItems = (state.catalog.flores || []).concat(state.catalog.mecanico || []);
  const matches = allItems.filter(function(i) {
    return i.name.toLowerCase().includes(query.toLowerCase());
  }).slice(0, 6);
  if (!matches.length) { acEl.classList.add('hidden'); return; }
  acEl.innerHTML = matches.map(function(m) {
    return '<div class="ac-item" onmousedown="selectAutocomplete(' + ci + ',' + ii + ',\'' + escJs(m.name) + '\',' + (m.price || 0) + ')">' +
      escHtml(m.name) + ' <span class="ac-price">' + formatCurrency(m.price) + '</span>' +
      '</div>';
  }).join('');
  acEl.classList.remove('hidden');
}

function selectAutocomplete(ci, ii, name, price) {
  if (!state.concepts[ci] || !state.concepts[ci].items[ii]) return;
  state.concepts[ci].items[ii].name = name;
  state.concepts[ci].items[ii].costoUnitario = price;
  renderConcepts();
}

function hideAllAutocomplete() {
  document.querySelectorAll('.autocomplete-list').forEach(function(el) {
    el.classList.add('hidden');
  });
}

function renderConcepts() {
  const container = document.getElementById('concepts-list');
  if (!container) return;
  container.innerHTML = state.concepts.map(function(concept, ci) {
    const conceptTotal = concept.items.reduce(function(s, i) { return s + (i.costoUnitario * i.cantidad); }, 0);
    return '<div class="concept-card card">' +
      '<div class="concept-header">' +
        '<input type="text" id="concept-name-' + ci + '" class="concept-name-input" ' +
          'value="' + escHtml(concept.name) + '" placeholder="Nombre del concepto (ej: Ramo de Novia)" ' +
          'onchange="updateConceptName(' + ci + ', this.value)"/>' +
        '<button class="btn-icon-sm" onclick="removeConcept(' + ci + ')">&#10005;</button>' +
      '</div>' +
      '<div class="concept-items" id="concept-items-' + ci + '">' +
        concept.items.map(function(item, ii) {
          return '<div class="concept-item">' +
            '<div class="item-name-wrap">' +
              '<input type="text" class="item-name" value="' + escHtml(item.name) + '" placeholder="Flor o material" ' +
                'oninput="showAutocomplete(' + ci + ',' + ii + ',this.value)" ' +
                'onblur="setTimeout(hideAllAutocomplete,150)" ' +
                'onchange="updateItemName(' + ci + ',' + ii + ',this.value)" ' +
                'id="item-name-' + ci + '-' + ii + '"/>' +
              '<div class="autocomplete-list hidden" id="ac-' + ci + '-' + ii + '"></div>' +
            '</div>' +
            '<input type="number" class="item-qty" value="' + item.cantidad + '" placeholder="Cant." min="1" ' +
              'onchange="updateItemField(' + ci + ',' + ii + ',\'cantidad\',parseFloat(this.value)||1)"/>' +
            '<input type="number" class="item-price" value="' + item.costoUnitario + '" placeholder="Precio" min="0" step="0.01" ' +
              'onchange="updateItemField(' + ci + ',' + ii + ',\'costoUnitario\',parseFloat(this.value)||0)"/>' +
            '<button class="btn-icon-sm" onclick="removeItemFromConcept(' + ci + ',' + ii + ')">&#10005;</button>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<button class="btn-text btn-add-item" onclick="addItemToConcept(' + ci + ')">+ Agregar material</button>' +
      '<div class="concept-subtotal">Subtotal: ' + formatCurrency(conceptTotal) + '</div>' +
    '</div>';
  }).join('');
  updateTotals();
  if (state.concepts.length > 0) {
    document.getElementById('totals-preview').style.display = 'block';
  }
}

function updateTotals() {
  const shipping = parseFloat(document.getElementById('q-shipping') ? document.getElementById('q-shipping').value : 0) || 0;
  const rawTotal = state.concepts.reduce(function(s, c) {
    return s + c.items.reduce(function(cs, i) { return cs + (i.costoUnitario * i.cantidad); }, 0);
  }, 0);
  const subtotal = rawTotal / 1.16;
  const iva = rawTotal - subtotal;
  const total = rawTotal + shipping;

  const tSub = document.getElementById('t-subtotal');
  const tIva = document.getElementById('t-iva');
  const tTotal = document.getElementById('t-total');
  const tShip = document.getElementById('t-ship');
  const tShipRow = document.getElementById('t-ship-row');
  const noDelivery = document.getElementById('no-delivery-note');

  if (tSub) tSub.textContent = formatCurrency(subtotal);
  if (tIva) tIva.textContent = formatCurrency(iva);
  if (tTotal) tTotal.textContent = formatCurrency(total);

  if (shipping > 0) {
    if (tShip) tShip.textContent = formatCurrency(shipping);
    if (tShipRow) tShipRow.style.display = 'flex';
    if (noDelivery) noDelivery.style.display = 'none';
  } else {
    if (tShipRow) tShipRow.style.display = 'none';
    if (noDelivery) noDelivery.style.display = 'block';
  }

  if (rawTotal > 0) {
    const tp = document.getElementById('totals-preview');
    if (tp) tp.style.display = 'block';
  }
}

async function saveQuote() {
  const client = (document.getElementById('q-client').value || '').trim();
  const project = (document.getElementById('q-project').value || '').trim();
  const date = document.getElementById('q-date').value;
  if (!client || !project) { showToast('Cliente y proyecto son requeridos', 'error'); return; }
  if (state.concepts.length === 0) { showToast('Agrega al menos un concepto', 'error'); return; }

  const shipping = parseFloat(document.getElementById('q-shipping').value) || 0;
  const rawTotal = state.concepts.reduce(function(s, c) {
    return s + c.items.reduce(function(cs, i) { return cs + (i.costoUnitario * i.cantidad); }, 0);
  }, 0);
  const subtotal = rawTotal / 1.16;
  const iva = rawTotal - subtotal;
  const total = rawTotal + shipping;
  const quoteNumber = 'COT-' + Date.now().toString().slice(-6);

  showLoading('Guardando cotizacion...');
  const res = await api('POST', '/api/quotes', {
    quote_number: quoteNumber,
    client_name: client,
    project_name: project,
    date: date || new Date().toISOString().split('T')[0],
    concepts: state.concepts,
    shipping: shipping,
    subtotal: subtotal.toFixed(2),
    iva: iva.toFixed(2),
    total: total.toFixed(2),
    notes: (document.getElementById('q-notes').value || '').trim()
  });
  hideLoading();
  if (res.id) {
    showToast('Cotizacion guardada', 'success');
    resetQuote();
    await loadHistorial();
    switchView('historial', document.querySelector('[data-view="historial"]'));
  } else {
    showToast('Error al guardar', 'error');
  }
}

function resetQuote() {
  state.concepts = [];
  ['q-client','q-project','q-date','q-shipping','q-notes'].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const cl = document.getElementById('concepts-list');
  if (cl) cl.innerHTML = '';
  const tp = document.getElementById('totals-preview');
  if (tp) tp.style.display = 'none';
}

// ── HISTORIAL ──
let currentFilter = 'all';

async function loadHistorial() {
  try {
    const url = currentFilter !== 'all' ? '/api/quotes?status=' + currentFilter : '/api/quotes';
    const quotes = await api('GET', url);
    state.quotes = Array.isArray(quotes) ? quotes : [];
    renderQuotesList();
  } catch(e) { console.error(e); }
}

function filterQuotes(btn) {
  document.querySelectorAll('.pill').forEach(function(p) { p.classList.remove('active'); });
  btn.classList.add('active');
  currentFilter = btn.dataset.status;
  loadHistorial();
}

function renderQuotesList() {
  const el = document.getElementById('quotes-list');
  if (!el) return;
  if (!state.quotes.length) {
    el.innerHTML = '<div class="empty-state">No hay cotizaciones aun</div>';
    return;
  }
  const sLabels = { pending: 'Pendiente', accepted: 'Aceptada', paid: 'Pagada', cancelled: 'Cancelada' };
  const sColors = { pending: 'yellow', accepted: 'blue', paid: 'green', cancelled: 'red' };
  el.innerHTML = state.quotes.map(function(q) {
    return '<div class="quote-card" onclick="openQuoteDetail(' + q.id + ')">' +
      '<div class="quote-card-header">' +
        '<span class="quote-number">' + escHtml(q.quote_number) + '</span>' +
        '<span class="status-chip ' + (sColors[q.status] || '') + '">' + (sLabels[q.status] || q.status) + '</span>' +
      '</div>' +
      '<div class="quote-client">' + escHtml(q.client_name) + '</div>' +
      '<div class="quote-project">' + escHtml(q.project_name) + '</div>' +
      '<div class="quote-footer">' +
        '<span class="quote-date">' + (q.date ? formatDate(q.date) : '') + '</span>' +
        '<span class="quote-total">' + formatCurrency(q.total) + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

// ── QUOTE DETAIL ──
async function openQuoteDetail(id) {
  showLoading('Cargando cotizacion...');
  const quote = await api('GET', '/api/quotes/' + id);
  hideLoading();
  if (!quote || !quote.id) { showToast('Error al cargar cotizacion', 'error'); return; }
  state.currentQuote = quote;
  state.currentQuoteId = id;

  const sLabels = { pending: 'Pendiente', accepted: 'Aceptada', paid: 'Pagada', cancelled: 'Cancelada' };
  const sColors = { pending: 'yellow', accepted: 'blue', paid: 'green', cancelled: 'red' };
  const concepts = Array.isArray(quote.concepts) ? quote.concepts : [];
  const shipping = parseFloat(quote.shipping) || 0;

  let paymentHtml = '';
  if (quote.payment_info) {
    const pi = typeof quote.payment_info === 'string' ? JSON.parse(quote.payment_info) : quote.payment_info;
    if (pi && pi.bankName) {
      const remaining = parseFloat(quote.total) - (pi.anticipo || 0);
      paymentHtml = '<div class="card payment-card">' +
        '<h4>Informacion de pago</h4>' +
        '<div class="pay-detail-row"><span>Banco:</span><span>' + escHtml(pi.bankName) + '</span></div>' +
        (pi.anticipo > 0 ? '<div class="pay-detail-row"><span>Anticipo:</span><span>' + formatCurrency(pi.anticipo) + '</span></div>' : '') +
        (pi.anticipo > 0 ? '<div class="pay-detail-row"><span>Restante:</span><span>' + formatCurrency(remaining) + '</span></div>' : '') +
        '</div>';
    }
  }

  const conceptsHtml = concepts.map(function(c) {
    const cTotal = (c.items || []).reduce(function(s, i) { return s + (i.costoUnitario * i.cantidad); }, 0);
    return '<div class="card concept-detail-card">' +
      '<div class="concept-detail-name">' + escHtml(c.name) + '</div>' +
      '<ul class="concept-detail-items">' +
        (c.items || []).map(function(i) {
          return '<li>' + escHtml(i.name) + ' x' + i.cantidad + ' &mdash; ' + formatCurrency(i.costoUnitario * i.cantidad) + '</li>';
        }).join('') +
      '</ul>' +
      '<div class="concept-detail-total">Total: ' + formatCurrency(cTotal) + '</div>' +
    '</div>';
  }).join('');

  const detailEl = document.getElementById('detail-content');
  detailEl.innerHTML =
    '<div class="detail-meta card">' +
      '<div class="detail-row"><span>Cliente:</span><strong>' + escHtml(quote.client_name) + '</strong></div>' +
      '<div class="detail-row"><span>Proyecto:</span><strong>' + escHtml(quote.project_name) + '</strong></div>' +
      '<div class="detail-row"><span>Fecha:</span><span>' + (quote.date ? formatDate(quote.date) : '') + '</span></div>' +
      '<div class="detail-row"><span>Estado:</span><span class="status-chip ' + (sColors[quote.status] || '') + '">' + (sLabels[quote.status] || quote.status) + '</span></div>' +
    '</div>' +
    '<div class="concepts-detail">' + conceptsHtml + '</div>' +
    '<div class="card totals-card">' +
      '<div class="totals-row"><span>Subtotal (sin IVA)</span><span>' + formatCurrency(quote.subtotal) + '</span></div>' +
      '<div class="totals-row"><span>IVA 16%</span><span>' + formatCurrency(quote.iva) + '</span></div>' +
      (shipping > 0 ? '<div class="totals-row"><span>Envio</span><span>' + formatCurrency(shipping) + '</span></div>' : '') +
      '<div class="totals-row totals-total"><span>Total</span><span>' + formatCurrency(quote.total) + '</span></div>' +
      (shipping === 0 ? '<div class="no-delivery-note">Este costo no incluye entrega</div>' : '') +
    '</div>' +
    (quote.notes ? '<div class="card"><p class="quote-notes">' + escHtml(quote.notes) + '</p></div>' : '') +
    paymentHtml +
    renderStatusActions(quote);

  document.getElementById('detail-quote-number').textContent = quote.quote_number;
  state.prevView = state.currentView;
  showView('view-quote-detail');
  hide('bottom-nav');
}

function renderStatusActions(quote) {
  if (quote.status === 'pending') {
    return '<div class="action-row">' +
      '<button class="btn-outline" onclick="openPaymentModal(\'accepted\')">Marcar Aceptada</button>' +
      '<button class="btn-danger" onclick="updateQuoteStatus(\'cancelled\')">Cancelar</button>' +
    '</div>';
  }
  if (quote.status === 'accepted') {
    return '<div class="action-row">' +
      '<button class="btn-primary" onclick="openPaymentModal(\'paid\')">Marcar Pagada</button>' +
      '<button class="btn-danger" onclick="updateQuoteStatus(\'cancelled\')">Cancelar</button>' +
    '</div>';
  }
  if (quote.status === 'paid') {
    return '<div class="status-final paid-final">Pagada completamente</div>';
  }
  if (quote.status === 'cancelled') {
    return '<div class="status-final cancelled-final">Cancelada</div>';
  }
  return '';
}

function goBack() {
  showView('view-' + (state.prevView || 'historial'));
  show('bottom-nav');
  if (state.prevView === 'historial') loadHistorial();
}

// ── PAYMENT ──
function openPaymentModal(targetStatus) {
  const bankSel = document.getElementById('pay-bank');
  bankSel.innerHTML = state.bankAccounts.length
    ? state.bankAccounts.map(function(b) {
        return '<option value="' + b.id + '">' + escHtml(b.name) + '</option>';
      }).join('')
    : '<option value="">Sin cuentas configuradas</option>';

  document.getElementById('pay-status').value = targetStatus;
  document.getElementById('pay-anticipo').value = '';
  const total = parseFloat(state.currentQuote ? state.currentQuote.total : 0) || 0;
  document.getElementById('pay-remaining').textContent = formatCurrency(total);
  document.getElementById('pay-anticipo').oninput = function() {
    const ant = parseFloat(this.value) || 0;
    document.getElementById('pay-remaining').textContent = formatCurrency(Math.max(0, total - ant));
  };
  openModal('modal-payment');
}

async function savePayment() {
  const status = document.getElementById('pay-status').value;
  const bankSel = document.getElementById('pay-bank');
  const bankName = bankSel.options[bankSel.selectedIndex] ? bankSel.options[bankSel.selectedIndex].text : '';
  const anticipo = parseFloat(document.getElementById('pay-anticipo').value) || 0;
  showLoading('Guardando...');
  await api('PUT', '/api/quotes/' + state.currentQuoteId, {
    status: status,
    payment_info: { bankName: bankName, anticipo: anticipo }
  });
  hideLoading();
  closeModal('modal-payment');
  showToast('Estado actualizado', 'success');
  await openQuoteDetail(state.currentQuoteId);
}

async function updateQuoteStatus(status) {
  const labels = { cancelled: 'cancelar', pending: 'pendiente', accepted: 'aceptada', paid: 'pagada' };
  if (!confirm('Cambiar estado a ' + (labels[status] || status) + '?')) return;
  showLoading('Actualizando...');
  await api('PUT', '/api/quotes/' + state.currentQuoteId, { status: status, payment_info: null });
  hideLoading();
  showToast('Estado actualizado', 'success');
  await openQuoteDetail(state.currentQuoteId);
}

// ── BANK ACCOUNTS ──
function renderBankAccounts() {
  const el = document.getElementById('bank-accounts-list');
  if (!el) return;
  if (!state.bankAccounts.length) {
    el.innerHTML = '<div class="empty-state">No hay cuentas configuradas</div>';
    return;
  }
  el.innerHTML = state.bankAccounts.map(function(b) {
    return '<div class="bank-item">' +
      '<div class="bank-info">' +
        '<div class="bank-name">' + escHtml(b.name) + (b.is_default ? ' <span class="default-badge">Predeterminada</span>' : '') + '</div>' +
        '<div class="bank-details">' + escHtml(b.details || '') + '</div>' +
      '</div>' +
      '<div class="bank-actions">' +
        '<button class="btn-text" onclick="editBank(' + b.id + ')">Editar</button>' +
        '<button class="btn-text danger" onclick="deleteBank(' + b.id + ')">Eliminar</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function openAddBank() {
  state.editingBankId = null;
  document.getElementById('bank-modal-title').textContent = 'Nueva Cuenta Bancaria';
  document.getElementById('bank-name').value = '';
  document.getElementById('bank-details').value = '';
  document.getElementById('bank-default').checked = false;
  openModal('modal-bank');
}

function editBank(id) {
  const bank = state.bankAccounts.find(function(b) { return b.id === id; });
  if (!bank) return;
  state.editingBankId = id;
  document.getElementById('bank-modal-title').textContent = 'Editar Cuenta Bancaria';
  document.getElementById('bank-name').value = bank.name || '';
  document.getElementById('bank-details').value = bank.details || '';
  document.getElementById('bank-default').checked = bank.is_default || false;
  openModal('modal-bank');
}

async function saveBank() {
  const name = (document.getElementById('bank-name').value || '').trim();
  if (!name) { showToast('El nombre es requerido', 'error'); return; }
  const details = (document.getElementById('bank-details').value || '').trim();
  const is_default = document.getElementById('bank-default').checked;
  showLoading('Guardando...');
  if (state.editingBankId) {
    await api('PUT', '/api/bank-accounts/' + state.editingBankId, { name: name, details: details, is_default: is_default });
  } else {
    await api('POST', '/api/bank-accounts', { name: name, details: details, is_default: is_default });
  }
  const accounts = await api('GET', '/api/bank-accounts');
  state.bankAccounts = Array.isArray(accounts) ? accounts : [];
  hideLoading();
  closeModal('modal-bank');
  renderBankAccounts();
  showToast('Cuenta guardada', 'success');
}

async function deleteBank(id) {
  if (!confirm('Eliminar esta cuenta bancaria?')) return;
  showLoading('Eliminando...');
  await api('DELETE', '/api/bank-accounts/' + id);
  const accounts = await api('GET', '/api/bank-accounts');
  state.bankAccounts = Array.isArray(accounts) ? accounts : [];
  hideLoading();
  renderBankAccounts();
  showToast('Cuenta eliminada', 'success');
}

// ── WHATSAPP ──
function shareWhatsApp() {
  if (!state.currentQuote) return;
  const q = state.currentQuote;
  document.getElementById('wa-greeting').value = 'Hola ' + (q.client_name || '') + ',';
  document.getElementById('wa-note').value = 'Con gusto te comparto la cotizacion para tu proyecto.';
  document.getElementById('wa-signature').value = state.profile.name || '';
  updateWAPreview();
  openModal('modal-whatsapp');
}

function updateWAPreview() {
  if (!state.currentQuote) return;
  const q = state.currentQuote;
  const concepts = Array.isArray(q.concepts) ? q.concepts : [];
  const shipping = parseFloat(q.shipping) || 0;
  const greeting = document.getElementById('wa-greeting').value;
  const note = document.getElementById('wa-note').value;
  const sig = document.getElementById('wa-signature').value;

  var msg = '';
  if (greeting) msg += greeting + '\n\n';
  if (note) msg += note + '\n\n';
  msg += '--- ' + (q.project_name || '') + ' ---\n\n';
  concepts.forEach(function(c) {
    msg += (c.name || 'Concepto') + '\n';
    (c.items || []).forEach(function(i) {
      msg += '  - ' + i.name + ' x' + i.cantidad + '\n';
    });
    var cTotal = (c.items || []).reduce(function(s, i) { return s + (i.costoUnitario * i.cantidad); }, 0);
    msg += '  Total: ' + formatCurrencyPlain(cTotal) + '\n\n';
  });
  msg += 'Subtotal: ' + formatCurrencyPlain(q.subtotal) + '\n';
  msg += 'IVA 16%: ' + formatCurrencyPlain(q.iva) + '\n';
  if (shipping > 0) msg += 'Envio: ' + formatCurrencyPlain(shipping) + '\n';
  msg += 'TOTAL: ' + formatCurrencyPlain(q.total) + '\n';
  if (shipping === 0) msg += '\n(Este costo no incluye entrega)\n';
  if (sig) msg += '\n' + sig;

  document.getElementById('wa-preview').textContent = msg;
}

function sendWhatsApp() {
  const text = document.getElementById('wa-preview').textContent;
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  closeModal('modal-whatsapp');
}

// ── PDF ──
async function generatePDF() {
  if (!state.currentQuote) return;
  const q = state.currentQuote;
  const p = state.profile;
  const concepts = Array.isArray(q.concepts) ? q.concepts : [];
  const shipping = parseFloat(q.shipping) || 0;
  const docEl = document.getElementById('detail-quote-doc');
  docEl.className = 'pdf-render';

  var conceptsHtml = concepts.map(function(c) {
    var cTotal = (c.items || []).reduce(function(s, i) { return s + (i.costoUnitario * i.cantidad); }, 0);
    return '<div class="pdf-concept">' +
      '<div class="pdf-concept-name">' + escHtml(c.name) + '</div>' +
      (c.items || []).map(function(i) {
        return '<div class="pdf-item">' +
          '<span>' + escHtml(i.name) + '</span>' +
          '<span>x' + i.cantidad + '</span>' +
          '<span>' + formatCurrencyPlain(i.costoUnitario * i.cantidad) + '</span>' +
        '</div>';
      }).join('') +
      '<div class="pdf-concept-total">Total: ' + formatCurrencyPlain(cTotal) + '</div>' +
    '</div>';
  }).join('');

  docEl.innerHTML =
    '<div class="pdf-header">' +
      (p.logo_data_url ? '<img src="' + p.logo_data_url + '" class="pdf-logo"/>' : '') +
      '<div class="pdf-business">' +
        '<div class="pdf-business-name">' + escHtml(p.name || '') + '</div>' +
        (p.phone ? '<div class="pdf-contact">' + escHtml(p.phone) + '</div>' : '') +
        (p.email ? '<div class="pdf-contact">' + escHtml(p.email) + '</div>' : '') +
        (p.address ? '<div class="pdf-contact">' + escHtml(p.address) + '</div>' : '') +
      '</div>' +
      '<div class="pdf-quote-info">' +
        '<div class="pdf-quote-num">' + escHtml(q.quote_number) + '</div>' +
        '<div class="pdf-quote-date">' + (q.date ? formatDate(q.date) : '') + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="pdf-client">' +
      '<div class="pdf-label">Para:</div>' +
      '<div class="pdf-client-name">' + escHtml(q.client_name) + '</div>' +
      '<div class="pdf-project">' + escHtml(q.project_name) + '</div>' +
    '</div>' +
    '<div class="pdf-concepts">' + conceptsHtml + '</div>' +
    '<div class="pdf-totals">' +
      '<div class="pdf-total-row"><span>Subtotal (sin IVA)</span><span>' + formatCurrencyPlain(q.subtotal) + '</span></div>' +
      '<div class="pdf-total-row"><span>IVA 16%</span><span>' + formatCurrencyPlain(q.iva) + '</span></div>' +
      (shipping > 0 ? '<div class="pdf-total-row"><span>Envio</span><span>' + formatCurrencyPlain(shipping) + '</span></div>' : '') +
      '<div class="pdf-total-row pdf-total-final"><span>TOTAL</span><span>' + formatCurrencyPlain(q.total) + '</span></div>' +
      (shipping === 0 ? '<div class="pdf-no-delivery">Este costo no incluye entrega</div>' : '') +
    '</div>' +
    (q.notes ? '<div class="pdf-notes">' + escHtml(q.notes) + '</div>' : '');

  showLoading('Generando PDF...');
  try {
    const canvas = await html2canvas(docEl, { scale: 2, backgroundColor: '#ffffff', logging: false });
    const imgData = canvas.toDataURL('image/png');
    const jsPDFLib = window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : (window.jsPDF || null);
    if (!jsPDFLib) { showToast('Error: libreria PDF no disponible', 'error'); hideLoading(); return; }
    const pdf = new jsPDFLib({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfW = pdf.internal.pageSize.getWidth();
    const imgHeight = (canvas.height * pdfW) / canvas.width;
    var y = 0;
    var pageHeight = pdf.internal.pageSize.getHeight();
    while (y < imgHeight) {
      if (y > 0) pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, -y, pdfW, imgHeight);
      y += pageHeight;
    }
    pdf.save((q.quote_number || 'cotizacion') + '.pdf');
  } catch(e) {
    showToast('Error al generar PDF', 'error');
    console.error(e);
  }
  hideLoading();
  docEl.className = 'hidden-print';
  docEl.innerHTML = '';
}

// ── REPORTS ──
async function downloadReport() {
  const from = document.getElementById('rep-from').value;
  const to = document.getElementById('rep-to').value;
  var url = '/api/reports/excel';
  var params = [];
  if (from) params.push('from=' + from);
  if (to) params.push('to=' + to);
  if (params.length) url += '?' + params.join('&');
  showLoading('Generando reporte...');
  try {
    const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + state.token } });
    if (!res.ok) throw new Error('Error');
    const blob = await res.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'FloriCalc_Reporte.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    showToast('Reporte descargado', 'success');
  } catch(e) {
    showToast('Error al descargar reporte', 'error');
  }
  hideLoading();
}

// ── NAVIGATION ──
function switchView(viewName, btn) {
  if (btn) {
    document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
    btn.classList.add('active');
  }
  state.currentView = viewName;
  showView('view-' + viewName);
  show('bottom-nav');
  if (viewName === 'historial') loadHistorial();
  if (viewName === 'cuenta') {
    renderProfileDisplay();
    renderBankAccounts();
    renderCatalog();
  }
}

function showView(viewId) {
  document.querySelectorAll('.view').forEach(function(v) {
    v.classList.add('hidden');
    v.classList.remove('active');
  });
  const target = document.getElementById(viewId);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active');
  }
}

// ── DOMContentLoaded ──
document.addEventListener('DOMContentLoaded', function() {
  var codeInput = document.getElementById('code-input');
  if (codeInput) {
    codeInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') handleLogin(); });
  }

  ['wa-greeting','wa-note','wa-signature'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', function() { if (state.currentQuote) updateWAPreview(); });
  });

  var shipInput = document.getElementById('q-shipping');
  if (shipInput) shipInput.addEventListener('input', updateTotals);

  checkExistingToken();
});
