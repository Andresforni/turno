# 📋 Configuración de Horarios de Atención

## ¿Cómo funciona?

La aplicación ahora lee los **horarios de atención del médico** directamente desde una hoja en Google Sheets. 

Esto permite:
- **Cambiar horarios sin reiniciar la aplicación** - edita Google Sheets y listo
- **Diferentes horarios por día** - trabaja diferentes horas cada día
- **Pausas o cierres** - marca un día como no disponible (domingo, feriados)
- **Mismo Google Sheet** - usa la misma hoja que la de prestaciones

---

## Estructura de la tabla "Horarios"

En Google Sheets, crea una **nueva pestaña** llamada **"Horarios"** con esta estructura:

| A        | B            | C          | D            |
|----------|--------------|------------|--------------|
| **Día** | **Hora Inicio** | **Hora Fin** | **Disponible** |
| lunes    | 09:00        | 18:00      | sí           |
| martes   | 09:00        | 18:00      | sí           |
| miércoles | 09:00        | 18:00      | sí           |
| jueves   | 09:00        | 18:00      | sí           |
| viernes  | 09:00        | 18:00      | sí           |
| sábado   | 10:00        | 14:00      | sí           |
| domingo  | -            | -          | no           |

---

## 📌 Reglas Importantes

### 1. Columna A - Día
- **Debe estar en minúsculas**: `lunes`, `martes`, `miércoles`, `jueves`, `viernes`, `sábado`, `domingo`
- Estos son los únicos valores válidos
- Uno por fila

### 2. Columna B - Hora Inicio
- Formato **24 horas**: `HH:MM`
- Ejemplos: `09:00`, `08:30`, `14:00`
- Si el día no está disponible, puedes dejar vacío `-`

### 3. Columna C - Hora Fin
- Formato **24 horas**: `HH:MM`
- Debe ser **mayor que** Hora Inicio
- Ejemplos: `18:00`, `17:30`, `19:45`
- Si el día no está disponible, puedes dejar vacío `-`

### 4. Columna D - Disponible
- Escribe `sí` para que el día esté abierto
- Escribe `no` para cerrar ese día
- Si dejas vacío, se asume `sí` por defecto
- **No es case-sensitive**: `Sí`, `SÍ`, `SI`, `si` todos funcionan

---

## 📚 Ejemplos de Uso

### Ejemplo 1: Horario Estándar
```
lunes     | 09:00 | 18:00 | sí
martes    | 09:00 | 18:00 | sí
miércoles | 09:00 | 18:00 | sí
jueves    | 09:00 | 18:00 | sí
viernes   | 09:00 | 18:00 | sí
sábado    | 09:00 | 14:00 | sí
domingo   | -     | -     | no
```

### Ejemplo 2: Con Pausas (Múltiples Franjas en el Mismo Día)
```
lunes     | 09:00 | 13:00 | sí    (MAÑANA)
lunes     | 14:00 | 18:00 | sí    (TARDE - después de pausa de 1 hora)
martes    | 09:00 | 18:00 | sí    (SIN PAUSA)
miércoles | 09:00 | 13:00 | sí    (MAÑANA - cierra en la tarde)
```
✅ **Ahora funciona nativamente**: si un día tiene múltiples filas, se procesan todas las franjas.

### Ejemplo 3: Cerrado en Fin de Semana
```
lunes     | 09:00 | 18:00 | sí
martes    | 09:00 | 18:00 | sí
miércoles | 09:00 | 18:00 | sí
jueves    | 09:00 | 18:00 | sí
viernes   | 09:00 | 18:00 | sí
sábado    | -     | -     | no
domingo   | -     | -     | no
```

### Ejemplo 4: Horario Reducido
```
lunes     | 14:00 | 20:00 | sí
martes    | 14:00 | 20:00 | sí
miércoles | 14:00 | 20:00 | sí
jueves    | 14:00 | 20:00 | sí
viernes   | 10:00 | 16:00 | sí
sábado    | -     | -     | no
domingo   | -     | -     | no
```

---

## ¿Cómo actúa la aplicación?

### 1. Al calcular disponibilidad (endpoint `/api/disponibilidad`)
- Lee el día de la fecha solicitada
- Busca TODAS las filas con ese día en la tabla Horarios
- Si el día no está disponible, **retorna slots vacíos** (no hay horarios)
- Si el día está disponible, **procesa cada franja horaria** por separado:
  - Genera slots dentro de cada franja
  - Respeta las pausas (espacios sin horarios)
  - Luego, resta los eventos del Google Calendar de cada franja
- Retorna todos los slots combinados de todas las franjas

### 2. Al crear una reserva
- Verifica que la fecha esté dentro de uno de los horarios
- Crea el evento en Google Calendar
- Envía confirmación por email

### 3. Si no hay horarios configurados
- El endpoint retorna **slots vacíos** (`[]`)
- Así se puede ver claramente que el día está cerrado
- Los valores `WORK_START_HOUR` y `WORK_END_HOUR` del `.env` ya no se usan si tienes tabla de horarios

---

## 🔄 Cambios en Tiempo Real

Cuando **modifiques** la tabla en Google Sheets:
- Los cambios se aplican **inmediatamente**
- No necesitas reiniciar la aplicación
- Cada solicitud consulta Google Sheets

## ⚠️ Errores Comunes

| Error | Causa | Solución |
|-------|-------|----------|
| "No se pudieron cargar los horarios" | El nombre de la hoja es incorrecto | Asegúrate de que la pestaña se llame exactamente "Horarios" |
| Slots vacíos todo el día | Día no está disponible | Revisa que la columna D diga "sí" |
| Horarios raros | Formato incorrecto | Usa siempre `HH:MM` en 24 horas |
| Minutos ignorados | Minutos no se procesan | Verifica que estén después de `:` |

---

##API Endpoint

Puedes consultar los horarios directamente:

```bash
curl http://localhost:3000/api/horarios
```

Respuesta:
```json
{
  "horarios": [
    {
      "dia": "lunes",
      "horaInicio": "09:00",
      "horaFin": "18:00",
      "disponible": true
    },
    ...
  ]
}
```

---

## 📝 Variables de Entorno

En tu `.env`, asegúrate de tener:

```env
# Nombre exacto de la pestaña
HORARIOS_SHEET_NAME=Horarios

# Valores por defecto si no hay horarios
WORK_START_HOUR=9
WORK_END_HOUR=19
```

---

¡Listo! Ahora puedes gestionar los horarios directamente desde Google Sheets. 🦷
