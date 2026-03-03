# 🦷 Sistema de Reserva de Citas - Clínica Dental

Aplicación Node.js para agendar citas online con integración a **Google Sheets**, **Google Calendar** y **Gmail**.

---

## 📦 Instalación

```bash
npm install
```

---

## ⚙️ Configuración paso a paso

### 1. Copia el archivo de configuración

```bash
cp .env.example .env
```

### 2. Configura Google Cloud (Cuenta de Servicio)

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea o selecciona un proyecto
3. Activa las APIs:
   - **Google Sheets API**
   - **Google Calendar API**
4. Ve a **IAM y administración → Cuentas de servicio**
5. Crea una nueva cuenta de servicio
6. Descarga el archivo JSON de credenciales
7. Copia del JSON los valores:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `GOOGLE_PRIVATE_KEY`

### 3. Configura Google Sheets

#### Hoja "Prestaciones"

1. Crea un Google Sheet con esta estructura:

| A (Nombre)            | B (Duración min) | C (Descripción)              |
|-----------------------|------------------|------------------------------|
| Consulta General      | 30               | Revisión y diagnóstico       |
| Limpieza Dental       | 45               | Profilaxis y pulido          |
| Extracción Simple     | 30               | Extracción de pieza dental   |
| Empaste              | 60               | Restauración con resina      |
| Radiografía           | 15               | Rx dental panorámica         |

2. **Comparte el Sheet** con el email de la cuenta de servicio (editor no es necesario, solo lector)
3. Copia el ID del Sheet de la URL y ponlo en `GOOGLE_SHEET_ID`

#### Hoja "Horarios" (NUEVA)

En el **mismo Google Sheet**, crea una nueva pestaña llamada **"Horarios"** con la estructura:

| A (Día)       | B (Hora Inicio) | C (Hora Fin) | D (Disponible) |
|---------------|-----------------|--------------|----------------|
| lunes         | 09:00           | 18:00        | sí             |
| martes        | 09:00           | 18:00        | sí             |
| miércoles     | 09:00           | 18:00        | sí             |
| jueves        | 09:00           | 18:00        | sí             |
| viernes       | 09:00           | 18:00        | sí             |
| sábado        | 09:00           | 13:00        | sí             |
| domingo       | -               | -            | no             |

**Notas importantes:**
- El día debe estar en **minúsculas** (lunes, martes, miércoles, etc.)
- Los horarios deben estar en formato **HH:MM** (24 horas)
- La columna "Disponible" acepta "sí" o "no"
- Puedes tener múltiples horarios modificando directamente en Google Sheets
- La aplicación cachea estos horarios por solicitud, así que los cambios serán instantáneos

### 4. Configura Google Calendar

1. Abre Google Calendar del dentista
2. Ve a **Configuración del calendario** del calendario del dentista
3. Copia el **ID del calendario** (parece `xxx@group.calendar.google.com` o es el email del dentista)
4. **Comparte el calendario** con la cuenta de servicio con permiso para **"Hacer cambios en eventos"**
5. Pega el ID en `DENTIST_CALENDAR_ID`

### 5. Configura Gmail para envío de emails

1. En la cuenta de Gmail que enviará los emails
2. Ve a **Configuración de cuenta → Seguridad**
3. Activa la **Verificación en 2 pasos** (si no la tienes)
4. Ve a **Contraseñas de aplicaciones**
5. Genera una contraseña para "Correo > Otro"
6. Copia esa contraseña (16 caracteres) en `EMAIL_APP_PASSWORD`

---

## 🚀 Ejecutar

```bash
# Producción
npm start

# Desarrollo (con auto-reload)
npm run dev
```

El servidor estará disponible en: `http://localhost:3000`

---

## 📁 Estructura del proyecto

```
dental-booking/
├── server.js          # Servidor Express principal
├── package.json
├── .env               # Variables de entorno (NO subir a git)
├── .env.example       # Plantilla de configuración
└── public/
    └── index.html     # Frontend de reservas
```

---

## 🔌 API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/prestaciones` | Listado de prestaciones desde Google Sheets |
| `GET` | `/api/horarios` | Horarios de atención por día (lunes-domingo) |
| `GET` | `/api/disponibilidad?fecha=YYYY-MM-DD&duracion=30` | Horarios disponibles en el calendario |
| `POST` | `/api/reservar` | Crear reserva en calendario + enviar email |
| `GET` | `/cancelar?token=xxx&event=xxx` | Cancelar cita (desde link del email) |

---

## 🔒 Seguridad

- Agrega `.env` a tu `.gitignore`
- Las cancelaciones usan tokens UUID únicos por cita
- La cuenta de servicio solo tiene acceso a los recursos que compartas explícitamente

---

## 🌐 Producción

Para desplegar en un VPS/servidor:

```bash
# Con PM2
npm install -g pm2
pm2 start server.js --name dental-booking
pm2 save

# Configurar reverse proxy con Nginx
# y obtener certificado SSL con Certbot
```

Recuerda actualizar `BASE_URL` en `.env` con tu dominio real para que los links de cancelación funcionen correctamente.
