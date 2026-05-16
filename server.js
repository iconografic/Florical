const express = require('express');
const { Pool } = require('pg');
const jwt     = require('jsonwebtoken');
const XLSX    = require('xlsx');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET     = process.env.JWT_SECRET     || 'florical-secret-change-in-production';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY, code VARCHAR(50) UNIQUE NOT NULL,
        active BOOLEAN DEFAULT true, terms_accepted BOOLEAN DEFAULT false,
        last_login TIMESTAMP, created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS profiles (
        id SERIAL PRIMARY KEY, user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(200), address TEXT, phone VARCHAR(50), email VARCHAR(200),
        logo_data_url TEXT, updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS bank_accounts (
        id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL, details TEXT, is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS catalogs (
        id SERIAL PRIMARY KEY, user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        flores JSONB DEFAULT '[]', mecanico JSONB DEFAULT '[]',
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS quotes (
        id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        quote_number VARCHAR(20), client_name VARCHAR(200), project_name VARCHAR(200),
        date DATE, concepts JSONB DEFAULT '[]', shipping DECIMAL(10,2) DEFAULT 0,
        subtotal DECIMAL(10,2) DEFAULT 0, iva DECIMAL(10,2) DEFAULT 0,
        total DECIMAL(10,2) DEFAULT 0, status VARCHAR(20) DEFAULT 'pending',
        payment_info JSONB, notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    for (const code of ['FLORISTA01','DEMO2024','ACCESO01']) {
      await client.query(`INSERT INTO users (code) VALUES ($1) ON CONFLICT (code) DO NOTHING`, [code]);
    }
    console.log('DB lista');
  } finally { client.release(); }
}

function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'No autorizado' });
  try { req.user = jwt.verify(h.split(' ')[1], JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token invalido' }); }
}
function adminMiddleware(req, res, next) {
  if (req.headers['x-admin-password'] !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Acceso denegado' });
  next();
}

// AUTH
app.post('/api/auth/login', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.json({ valid: false });
  try {
    const r = await pool.query(`SELECT id,active,terms_accepted FROM users WHERE UPPER(code)=UPPER($1)`, [code.trim()]);
    if (!r.rows.length) return res.json({ valid: false });
    const u = r.rows[0];
    if (!u.active) return res.json({ valid: false, suspended: true });
    await pool.query(`UPDATE users SET last_login=NOW() WHERE id=$1`, [u.id]);
    const token = jwt.sign({ userId: u.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ valid: true, token, termsAccepted: u.terms_accepted });
  } catch(e) { console.error(e); res.status(500).json({ valid: false }); }
});

app.post('/api/auth/accept-terms', authMiddleware, async (req, res) => {
  await pool.query(`UPDATE users SET terms_accepted=true WHERE id=$1`, [req.user.userId]);
  res.json({ ok: true });
});

// PERFIL
app.get('/api/profile', authMiddleware, async (req, res) => {
  const r = await pool.query(`SELECT name,address,phone,email,logo_data_url FROM profiles WHERE user_id=$1`, [req.user.userId]);
  res.json(r.rows[0] || {});
});
app.put('/api/profile', authMiddleware, async (req, res) => {
  const { name, address, phone, email, logo_data_url } = req.body;
  await pool.query(`
    INSERT INTO profiles (user_id,name,address,phone,email,logo_data_url,updated_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())
    ON CONFLICT (user_id) DO UPDATE SET name=$2,address=$3,phone=$4,email=$5,logo_data_url=$6,updated_at=NOW()
  `, [req.user.userId, name, address, phone, email, logo_data_url]);
  res.json({ ok: true });
});

// CUENTAS BANCARIAS
app.get('/api/bank-accounts', authMiddleware, async (req, res) => {
  const r = await pool.query(`SELECT id,name,details,is_default FROM bank_accounts WHERE user_id=$1 ORDER BY is_default DESC,id ASC`, [req.user.userId]);
  res.json(r.rows);
});
app.post('/api/bank-accounts', authMiddleware, async (req, res) => {
  const { name, details, is_default } = req.body;
  if (is_default) await pool.query(`UPDATE bank_accounts SET is_default=false WHERE user_id=$1`, [req.user.userId]);
  const r = await pool.query(`INSERT INTO bank_accounts (user_id,name,details,is_default) VALUES ($1,$2,$3,$4) RETURNING *`, [req.user.userId,name,details,is_default||false]);
  res.json(r.rows[0]);
});
app.put('/api/bank-accounts/:id', authMiddleware, async (req, res) => {
  const { name, details, is_default } = req.body;
  if (is_default) await pool.query(`UPDATE bank_accounts SET is_default=false WHERE user_id=$1`, [req.user.userId]);
  await pool.query(`UPDATE bank_accounts SET name=$1,details=$2,is_default=$3 WHERE id=$4 AND user_id=$5`, [name,details,is_default||false,req.params.id,req.user.userId]);
  res.json({ ok: true });
});
app.delete('/api/bank-accounts/:id', authMiddleware, async (req, res) => {
  await pool.query(`DELETE FROM bank_accounts WHERE id=$1 AND user_id=$2`, [req.params.id,req.user.userId]);
  res.json({ ok: true });
});

// CATÁLOGO
app.get('/api/catalog', authMiddleware, async (req, res) => {
  const r = await pool.query(`SELECT flores,mecanico FROM catalogs WHERE user_id=$1`, [req.user.userId]);
  res.json(r.rows[0] || { flores:[], mecanico:[] });
});
app.put('/api/catalog', authMiddleware, async (req, res) => {
  const { flores, mecanico } = req.body;
  await pool.query(`
    INSERT INTO catalogs (user_id,flores,mecanico,updated_at) VALUES ($1,$2,$3,NOW())
    ON CONFLICT (user_id) DO UPDATE SET flores=$2,mecanico=$3,updated_at=NOW()
  `, [req.user.userId, JSON.stringify(flores), JSON.stringify(mecanico)]);
  res.json({ ok: true });
});

// COTIZACIONES
app.get('/api/quotes', authMiddleware, async (req, res) => {
  const { status, from, to } = req.query;
  let q = `SELECT id,quote_number,client_name,project_name,date,total,status,created_at FROM quotes WHERE user_id=$1`;
  const p = [req.user.userId];
  if (status) { q += ` AND status=$${p.length+1}`; p.push(status); }
  if (from)   { q += ` AND date>=$${p.length+1}`; p.push(from); }
  if (to)     { q += ` AND date<=$${p.length+1}`; p.push(to); }
  q += ` ORDER BY created_at DESC`;
  const r = await pool.query(q, p);
  res.json(r.rows);
});
app.post('/api/quotes', authMiddleware, async (req, res) => {
  const { quote_number,client_name,project_name,date,concepts,shipping,subtotal,iva,total,notes } = req.body;
  const r = await pool.query(`
    INSERT INTO quotes (user_id,quote_number,client_name,project_name,date,concepts,shipping,subtotal,iva,total,notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id
  `, [req.user.userId,quote_number,client_name,project_name,date,JSON.stringify(concepts),shipping,subtotal,iva,total,notes]);
  res.json({ id: r.rows[0].id });
});
app.get('/api/quotes/:id', authMiddleware, async (req, res) => {
  const r = await pool.query(`SELECT * FROM quotes WHERE id=$1 AND user_id=$2`, [req.params.id,req.user.userId]);
  if (!r.rows.length) return res.status(404).json({ error: 'No encontrada' });
  res.json(r.rows[0]);
});
app.put('/api/quotes/:id', authMiddleware, async (req, res) => {
  const { status, payment_info } = req.body;
  await pool.query(`UPDATE quotes SET status=$1,payment_info=$2,updated_at=NOW() WHERE id=$3 AND user_id=$4`,
    [status, JSON.stringify(payment_info||null), req.params.id, req.user.userId]);
  res.json({ ok: true });
});

// REPORTE EXCEL
app.get('/api/reports/excel', authMiddleware, async (req, res) => {
  const { from, to } = req.query;
  let q = `SELECT quote_number,client_name,project_name,date,concepts,subtotal,iva,shipping,total,status FROM quotes WHERE user_id=$1`;
  const p = [req.user.userId];
  if (from) { q+=` AND date>=$${p.length+1}`; p.push(from); }
  if (to)   { q+=` AND date<=$${p.length+1}`; p.push(to); }
  q += ` ORDER BY date DESC`;
  const result = await pool.query(q, p);
  const statusMap = {pending:'Pendiente',accepted:'Aceptada',paid:'Pagada',cancelled:'Cancelada'};
  const rows = result.rows.map(row => {
    const concepts  = Array.isArray(row.concepts) ? row.concepts : [];
    const costoBase = concepts.reduce((s,c)=>s+(c.items||[]).reduce((cs,i)=>cs+(i.costoUnitario*i.cantidad),0),0);
    return {
      'No. Cotizacion': row.quote_number, 'Cliente': row.client_name, 'Proyecto': row.project_name,
      'Fecha': row.date?new Date(row.date).toISOString().split('T')[0]:'',
      'Subtotal sin IVA': parseFloat(row.subtotal||0).toFixed(2),
      'IVA 16%': parseFloat(row.iva||0).toFixed(2),
      'Envio': parseFloat(row.shipping||0).toFixed(2),
      'Total': parseFloat(row.total||0).toFixed(2),
      'Costo Base': costoBase.toFixed(2),
      'Utilidad': (parseFloat(row.total||0)-costoBase).toFixed(2),
      'Estado': statusMap[row.status]||row.status
    };
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols']=[{wch:15},{wch:20},{wch:25},{wch:12},{wch:16},{wch:10},{wch:10},{wch:12},{wch:12},{wch:12},{wch:12}];
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
  const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
  res.setHeader('Content-Disposition','attachment; filename="FloriCalc_Reporte.xlsx"');
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ADMIN
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname,'public','admin.html')));
app.post('/api/admin/login', (req,res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    res.json({ ok:true });
  } else { res.json({ ok:false }); }
});
app.get('/api/admin/users', adminMiddleware, async (req,res) => {
  const r = await pool.query(`SELECT u.id,u.code,u.active,u.terms_accepted,u.last_login,u.created_at,p.name,p.email FROM users u LEFT JOIN profiles p ON p.user_id=u.id ORDER BY u.created_at DESC`);
  res.json(r.rows);
});
app.put('/api/admin/users/:id/toggle', adminMiddleware, async (req,res) => {
  await pool.query(`UPDATE users SET active=NOT active WHERE id=$1`, [req.params.id]);
  res.json({ ok:true });
});
app.post('/api/admin/users', adminMiddleware, async (req,res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error:'Codigo requerido' });
  try {
    await pool.query(`INSERT INTO users (code) VALUES (UPPER($1))`, [code.trim()]);
    res.json({ ok:true });
  } catch(e) {
    if (e.code==='23505') return res.status(400).json({ error:'El codigo ya existe' });
    res.status(500).json({ error:'Error' });
  }
});
app.delete('/api/admin/users/:id', adminMiddleware, async (req,res) => {
  await pool.query(`DELETE FROM users WHERE id=$1`, [req.params.id]);
  res.json({ ok:true });
});

initDB().then(()=>app.listen(PORT,()=>console.log(`\n Florical v2 -> http://localhost:${PORT}\n`))).catch(e=>{console.error(e);process.exit(1);});
