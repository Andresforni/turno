# 🔧 Resolviendo problemas con días de la semana

Si el sistema **muestra horarios para un domingo cerrado** o **no diferencia correctamente los días**, sigue estos pasos:

## 1️⃣ Verifica la tabla en Google Sheets

Ve a tu Google Sheet y abre la pestaña **"Horarios"**. Asegúrate de que:

- ✅ Los **días están en minúsculas**: `lunes`, `martes`, `miércoles`, `jueves`, `viernes`, `sábado`, `domingo`
- ✅ El **domingo está configurado como**: 
  - Día: `domingo`
  - Hora Inicio: (vacío o `-`)
  - Hora Fin: (vacío o `-`)
  - Disponible: `no`

## 2️⃣ Verifica que la API lea correctamente

En tu navegador o terminal, prueba estos endpoints:

### Ver toda la tabla de horarios
```bash
curl http://localhost:3000/api/horarios
```

Debería mostrar algo como:
```json
{
  "horarios": [
    { "fila": 2, "dia": "lunes", "horaInicio": "09:00", "horaFin": "18:00", "disponible": true },
    { "fila": 3, "dia": "domingo", "horaInicio": "", "horaFin": "", "disponible": false }
  ]
}
```

### Ver qué día se detecta para una fecha
```bash
# Para el 2 de marzo de 2026 (es un domingo)
curl "http://localhost:3000/api/debug/dia?fecha=2026-03-02"
```

Debería mostrar:
```json
{
  "fecha": "2026-03-02",
  "fechaParsed": "2026-03-02T00:00:00.000Z",
  "dayOfWeek": 0,
  "diaEnEspanol": "domingo",
  "diaEnIngles": "Sunday",
  "horariosEncontrados": 0,
  "horarios": []
}
```

**Importante**: Si `dayOfWeek` es `0` y `diaEnEspanol` es `"domingo"`, pero `horariosEncontrados` es > 0, entonces el domingo está configurado como disponible en la tabla.

### Ver disponibilidad para una fecha
```bash
# Solicitar slots de 30 minutos para el 2 de marzo de 2026
curl "http://localhost:3000/api/disponibilidad?fecha=2026-03-02&duracion=30"
```

Si el domingo está cerrado, debería retornar:
```json
{
  "slots": []
}
```

Si retorna slots, significa que el domingo está configurado como disponible en Sheets.

## 3️⃣ Revisa los logs

Cuando haces una solicitud, mira la **consola donde corre el servidor** (verás logs `[DEBUG]`):

```
[DEBUG] Tabla de horarios completa: [
  { fila: 2, dia: 'lunes', horaInicio: '09:00', ... },
  ...
]
[DEBUG] Buscando horarios para 2026-03-02: día domingo, disponibles en tabla: lunes (abierto), domingo (cerrado)
[DEBUG] Sin horarios para domingo en 2026-03-02
```

Si ves `[DEBUG] Sin horarios para domingo`, eso es **CORRECTO** - el sistema está funcionando.

Si ves `[DEBUG] ✓ Encontrado: domingo 09:00-18:00`, significa que el domingo tiene horarios en la tabla y ese es el problema.

## 4️⃣ Problemas comunes

### "Veo slots para el domingo aunque está como 'no'"
→ **Solución**: Abre Google Sheets → pestaña Horarios → verifica la fila del domingo:
  - Columna D debe tener `no` (no `sí` ni vacío)
  - O elimina esa fila completamente

### "El dayOfWeek es incorrecto"
→ La fecha podría estar en otro formato. Asegúrate de usar `YYYY-MM-DD`:
  - ✅ Correcto: `2026-03-02`
  - ❌ Incorrecto: `03-02-2026` o `2-3-2026`

### "Ver slots para un lunes pero debería estar cerrado"
→ Mismo proceso Above: verifica la tabla Sheets y que el lunes tenga `no` en disponible.

## 5️⃣ Limpiar caché (si cambiaste Google Sheets hace poco)

Si acabas de cambiar la tabla en Google Sheets pero ves los datos viejos:

```bash
# Reinicia el servidor
# Ctrl+C en la terminal donde corre
# Luego executa nuevamente:
npm start
```

La aplicación carga de Google Sheets en tiempo real, así que debería actualizarse.

---

## 📝 Checklist de verificación

Copia esta tabla y verifica cada punto:

**Google Sheets - Pestaña "Horarios"**:
- [ ] El encabezado existe: A1="Día", B1="Hora Inicio", C1="Hora Fin", D1="Disponible"
- [ ] Lunes tiene: `lunes | 09:00 | 18:00 | sí`
- [ ] Domingo tiene: `domingo | - | - | no` (o está vacío el disponible)
- [ ] No hay espacios extras al inicio/final de los valores

**API Tests**:
- [ ] `/api/horarios` muestra `domingo` con `disponible: false`
- [ ] `/api/debug/dia?fecha=2026-03-01` (un lunes) muestra `diaEnEspanol: "lunes"`
- [ ] `/api/debug/dia?fecha=2026-03-02` (un domingo) muestra `diaEnEspanol: "domingo"`
- [ ] `/api/disponibilidad?fecha=2026-03-02&duracion=30` retorna `slots: []`

Si todos estos checks pasan, **el sistema está funcionando correctamente**. 🎉

Si algo falla, copia los errores y comparte el output de los endpoints de debug.
