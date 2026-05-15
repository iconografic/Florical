const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
//  POST /api/verify-code
//  Body: { code: "FLORISTA01" }
//  Response: { valid: true | false }
//
//  Para dar acceso a alguien nuevo:
//    1. Abre codes.json
//    2. Agrega el código al array: ["FLORISTA01", "NUEVO_CODIGO"]
//    3. Guarda el archivo — sin reiniciar el servidor
// ─────────────────────────────────────────────
app.post('/api/verify-code', (req, res) => {
  const { code } = req.body;

  if (!code || typeof code !== 'string') {
    return res.json({ valid: false });
  }

  try {
    const raw   = fs.readFileSync(path.join(__dirname, 'codes.json'), 'utf8');
    const codes = JSON.parse(raw);

    const valid = codes
      .map(c => c.trim().toUpperCase())
      .includes(code.trim().toUpperCase());

    res.json({ valid });
  } catch (err) {
    console.error('Error leyendo codes.json:', err.message);
    res.status(500).json({ valid: false });
  }
});

app.listen(PORT, () => {
  console.log(`\n🌸 FloriCalc corriendo en → http://localhost:${PORT}\n`);
});
