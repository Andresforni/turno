require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// Google Auth (Service Account)
// ─────────────────────────────────────────────
function getGoogleAuth() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/calendar',
    ],
  });
  return auth;
}

// ─────────────────────────────────────────────
// Email transporter
// ─────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

// ─────────────────────────────────────────────
// GET /api/prestaciones - Obtiene tipos de prestación desde Google Sheets
// ─────────────────────────────────────────────
app.get('/api/prestaciones', async (req, res) => {
  try {
    const auth = getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${process.env.SHEET_NAME || 'Prestaciones'}!A2:C100`,
    });

    const rows = response.data.values || [];
    const prestaciones = rows
      .filter(row => row[0] && row[1])
      .map(row => ({
        nombre: row[0].trim(),
        duracion: parseInt(row[1], 10), // duración en minutos
        descripcion: row[2] || '',
      }));

    res.json({ prestaciones });
  } catch (err) {
    console.error('Error obteniendo prestaciones:', err.message);
    res.status(500).json({ error: 'No se pudieron cargar las prestaciones. Verifica la configuración de Google Sheets.' });
  }
});

// ─────────────────────────────────────────────
// GET /api/debug/dia?fecha=YYYY-MM-DD - DEBUG: Ver qué día se detecta
// ─────────────────────────────────────────────
app.get('/api/debug/dia', async (req, res) => {
  const { fecha } = req.query;
  
  if (!fecha) {
    return res.status(400).json({ error: 'Falta parámetro: fecha' });
  }

  const diaEnEspanol = getDayNameInSpanish(fecha);
  
  const [year, month, day] = fecha.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const diaEnIngles = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
  
  const horarios = await getHorariosForDay(fecha);

  res.json({
    fecha,
    diaEnEspanol,
    diaEnIngles,
    horariosEncontrados: horarios ? horarios.length : 0,
    horarios: horarios || [],
  });
});

// ─────────────────────────────────────────────
// GET /api/horarios - Ver toda la tabla de horarios desde Google Sheets
// ─────────────────────────────────────────────
app.get('/api/horarios', async (req, res) => {
  try {
    const auth = getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${process.env.HORARIOS_SHEET_NAME || 'Horarios'}!A2:D100`,
    });

    const rows = response.data.values || [];
    const horarios = rows
      .filter(row => row[0] && row[1] && row[2])
      .map((row, idx) => ({
        fila: idx + 2,
        dia: row[0].trim().toLowerCase(),
        horaInicio: row[1].trim(),
        horaFin: row[2].trim(),
        disponible: (row[3] || 'sí').trim().toLowerCase() === 'sí',
      }));

    console.log('[DEBUG] Tabla de horarios completa:', JSON.stringify(horarios, null, 2));
    
    res.json({ horarios });
  } catch (err) {
    console.error('Error obteniendo horarios:', err.message);
    res.status(500).json({ error: 'No se pudieron cargar los horarios de atención.' });
  }
});

// ─────────────────────────────────────────────
// Helper: Obtener horarios de atención para un día específico
// Retorna TODOS los horarios para ese día (puede haber múltiples franjas)
// ─────────────────────────────────────────────
async function getHorariosForDay(fechaStr) {
  try {
    const auth = getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${process.env.HORARIOS_SHEET_NAME || 'Horarios'}!A2:D100`,
    });

    const rows = response.data.values || [];
    const horarios = rows
      .filter(row => row[0] && row[1] && row[2])
      .map(row => ({
        dia: row[0].trim().toLowerCase(),
        horaInicio: row[1].trim(),
        horaFin: row[2].trim(),
        disponible: (row[3] || 'sí').trim().toLowerCase() === 'sí',
      }));

    // Obtener el día de la semana de la fecha (YYYY-MM-DD)
    const diaEnEspanol = getDayNameInSpanish(fechaStr);

    console.log(`[DEBUG] Buscando horarios para ${fechaStr}: día ${diaEnEspanol}, disponibles en tabla:`, horarios.map(h => `${h.dia} (${h.disponible ? 'abierto' : 'cerrado'})`).join(', '));

    // Obtener TODOS los horarios para ese día que estén disponibles
    const horariosDelDia = horarios.filter(h => {
      const esDelDia = h.dia === diaEnEspanol;
      const estaDisponible = h.disponible;
      
      if (esDelDia && estaDisponible) {
        console.log(`[DEBUG] ✓ Encontrado: ${h.dia} ${h.horaInicio}-${h.horaFin}`);
      }
      
      return esDelDia && estaDisponible;
    });

    if (horariosDelDia.length === 0) {
      console.log(`[DEBUG] Sin horarios para ${diaEnEspanol} en ${fechaStr}`);
      return null;
    }

    // Ordenar por hora de inicio
    return horariosDelDia.sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  } catch (err) {
    console.error('Error obteniendo horarios del día:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// Helper: Obtener nombre del día en español desde una fecha YYYY-MM-DD
// Sin dependencias de timezone - usa UTC
// ─────────────────────────────────────────────
function getDayNameInSpanish(fechaStr) {
  // Parsear la fecha seguramente: YYYY-MM-DD
  const [year, month, day] = fechaStr.split('-').map(Number);
  
  // Crear en UTC para evitar problemas de timezone
  const date = new Date(Date.UTC(year, month - 1, day));
  
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return days[date.getUTCDay()];
}

// ─────────────────────────────────────────────
// GET /api/disponibilidad?fecha=YYYY-MM-DD&duracion=30
// ─────────────────────────────────────────────
app.get('/api/disponibilidad', async (req, res) => {
  const { fecha, duracion } = req.query;

  if (!fecha || !duracion) {
    return res.status(400).json({ error: 'Faltan parámetros: fecha y duracion son requeridos.' });
  }

  const durationMin = parseInt(duracion, 10);
  
  // Obtener horarios del día desde Google Sheets (puede haber múltiples franjas)
  let horariosDelDia = await getHorariosForDay(fecha);
  
  if (!horariosDelDia) {
    // Si el día está cerrado, retornar slots vacíos
    return res.json({ slots: [] });
  }

  try {
    const auth = getGoogleAuth();
    const calendar = google.calendar({ version: 'v3', auth });

    // Obtener TODOS los eventos del día completo para filtrar ocupados
    const dayFullStart = new Date(`${fecha}T00:00:00`);
    const dayFullEnd = new Date(`${fecha}T23:59:59`);

    const eventsResp = await calendar.events.list({
      calendarId: process.env.DENTIST_CALENDAR_ID,
      timeMin: dayFullStart.toISOString(),
      timeMax: dayFullEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = eventsResp.data.items || [];

    // Construir bloques ocupados
    const busyBlocks = events
      .filter(e => e.start?.dateTime)
      .map(e => ({
        start: new Date(e.start.dateTime),
        end: new Date(e.end.dateTime),
      }));

    // Generar slots disponibles para TODAS las franjas horarias del día
    const slots = [];

    // Iterar sobre cada franja horaria del día
    for (const franja of horariosDelDia) {
      const [startHour, startMin] = franja.horaInicio.split(':').map(Number);
      const [endHour, endMin] = franja.horaFin.split(':').map(Number);

      const franjaStart = new Date(`${fecha}T${String(startHour).padStart(2,'0')}:${String(startMin).padStart(2,'0')}:00`);
      const franjaEnd = new Date(`${fecha}T${String(endHour).padStart(2,'0')}:${String(endMin).padStart(2,'0')}:00`);

      // Generar slots para esta franja
      let current = new Date(franjaStart);

      while (current < franjaEnd) {
        const slotEnd = new Date(current.getTime() + durationMin * 60000);
        if (slotEnd > franjaEnd) break;

        // Verificar si el slot se solapa con algún evento
        const isBusy = busyBlocks.some(b => current < b.end && slotEnd > b.start);

        if (!isBusy) {
          slots.push({
            inicio: current.toISOString(),
            fin: slotEnd.toISOString(),
            label: formatTime(current),
          });
        }

        // Avanzar 30 minutos
        current = new Date(current.getTime() + 30 * 60000);
      }
    }

    // Ordenar slots por hora de inicio
    slots.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());

    res.json({ slots });
  } catch (err) {
    console.error('Error obteniendo disponibilidad:', err.message);
    res.status(500).json({ error: 'No se pudo obtener la disponibilidad del calendario.' });
  }
});

// ─────────────────────────────────────────────
// POST /api/reservar
// ─────────────────────────────────────────────
app.post('/api/reservar', async (req, res) => {
  const { nombre, apellido, email, prestacion, duracion, inicio, fin } = req.body;

  if (!nombre || !apellido || !email || !prestacion || !inicio || !fin) {
    return res.status(400).json({ error: 'Faltan datos obligatorios para la reserva.' });
  }

  const cancelToken = uuidv4();
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

  try {
    const auth = getGoogleAuth();
    const calendar = google.calendar({ version: 'v3', auth });

    // Crear evento en Google Calendar
    const event = await calendar.events.insert({
      calendarId: process.env.DENTIST_CALENDAR_ID,
      resource: {
        summary: `${prestacion} - ${nombre} ${apellido}`,
        description: `Paciente: ${nombre} ${apellido}\nEmail: ${email}\nPrestación: ${prestacion}\nToken de cancelación: ${cancelToken}`,
        start: { dateTime: inicio, timeZone: 'America/Santiago' },
        end: { dateTime: fin, timeZone: 'America/Santiago' },
        extendedProperties: {
          private: {
            cancelToken,
            patientEmail: email,
          },
        },
      },
    });

    const eventId = event.data.id;

    // Enviar email de confirmación
    const startDate = new Date(inicio);
    const fechaFormateada = startDate.toLocaleDateString('es-CL', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const horaFormateada = startDate.toLocaleTimeString('es-CL', {
      hour: '2-digit', minute: '2-digit',
    });

    const cancelUrl = `${baseUrl}/cancelar?token=${cancelToken}&event=${eventId}`;

    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'Clínica Dental'}" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `✅ Confirmación de cita - ${process.env.CLINIC_NAME || 'Clínica Dental'}`,
      html: buildConfirmationEmail({
        nombre, apellido, prestacion, fechaFormateada, horaFormateada,
        duracion, cancelUrl,
        clinicName: process.env.CLINIC_NAME || 'Clínica Dental',
        dentistName: process.env.DENTIST_NAME || 'el dentista',
      }),
    });

    res.json({
      ok: true,
      message: 'Cita reservada exitosamente. Te enviamos un email de confirmación.',
    });
  } catch (err) {
    console.error('Error al reservar:', err.message);
    res.status(500).json({ error: 'No se pudo completar la reserva. Intenta nuevamente.' });
  }
});

// ─────────────────────────────────────────────
// GET /cancelar?token=xxx&event=xxx
// ─────────────────────────────────────────────
app.get('/cancelar', async (req, res) => {
  const { token, event: eventId } = req.query;

  if (!token || !eventId) {
    return res.status(400).send(buildCancelPage('error', 'Enlace de cancelación inválido.'));
  }

  try {
    const auth = getGoogleAuth();
    const calendar = google.calendar({ version: 'v3', auth });

    // Obtener el evento y verificar el token
    const eventResp = await calendar.events.get({
      calendarId: process.env.DENTIST_CALENDAR_ID,
      eventId,
    });

    const savedToken = eventResp.data.extendedProperties?.private?.cancelToken;
    const patientEmail = eventResp.data.extendedProperties?.private?.patientEmail;

    if (savedToken !== token) {
      return res.status(403).send(buildCancelPage('error', 'Token de cancelación inválido.'));
    }

    // Eliminar el evento
    await calendar.events.delete({
      calendarId: process.env.DENTIST_CALENDAR_ID,
      eventId,
    });

    // Notificar al paciente
    if (patientEmail) {
      await transporter.sendMail({
        from: `"${process.env.EMAIL_FROM_NAME || 'Clínica Dental'}" <${process.env.EMAIL_USER}>`,
        to: patientEmail,
        subject: `❌ Cita cancelada - ${process.env.CLINIC_NAME || 'Clínica Dental'}`,
        html: buildCancellationEmail(process.env.CLINIC_NAME || 'Clínica Dental'),
      });
    }

    res.send(buildCancelPage('ok', 'Tu cita ha sido cancelada exitosamente. Recibirás un email de confirmación.'));
  } catch (err) {
    console.error('Error cancelando cita:', err.message);
    if (err.code === 404 || err.message.includes('Not Found')) {
      return res.send(buildCancelPage('ok', 'Esta cita ya fue cancelada anteriormente.'));
    }
    res.status(500).send(buildCancelPage('error', 'No se pudo cancelar la cita. Por favor contáctanos directamente.'));
  }
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function formatTime(date) {
  return date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function buildConfirmationEmail({ nombre, apellido, prestacion, fechaFormateada, horaFormateada, duracion, cancelUrl, clinicName, dentistName }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0f4c81,#1a73e8);padding:40px 32px;text-align:center;">
      <div style="font-size:48px;">🦷</div>
      <h1 style="color:#fff;margin:12px 0 4px;font-size:24px;font-weight:700;">${clinicName}</h1>
      <p style="color:rgba(255,255,255,0.85);margin:0;font-size:14px;">Confirmación de cita</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#374151;font-size:16px;">Hola <strong>${nombre} ${apellido}</strong>,</p>
      <p style="color:#6b7280;font-size:15px;">Tu cita ha sido reservada exitosamente. Aquí está el resumen:</p>
      <div style="background:#f8fafc;border-left:4px solid #1a73e8;border-radius:8px;padding:20px;margin:24px 0;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;width:120px;">📋 Prestación</td><td style="color:#111827;font-weight:600;font-size:14px;">${prestacion}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">📅 Fecha</td><td style="color:#111827;font-weight:600;font-size:14px;text-transform:capitalize;">${fechaFormateada}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">⏰ Hora</td><td style="color:#111827;font-weight:600;font-size:14px;">${horaFormateada} hrs</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">⏱ Duración</td><td style="color:#111827;font-weight:600;font-size:14px;">${duracion} minutos</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">👨‍⚕️ Profesional</td><td style="color:#111827;font-weight:600;font-size:14px;">${dentistName}</td></tr>
        </table>
      </div>
      <div style="background:#fff3cd;border-radius:8px;padding:16px;margin:24px 0;border:1px solid #ffc107;">
        <p style="margin:0;color:#856404;font-size:14px;">⚠️ <strong>¿Necesitas cancelar tu cita?</strong><br>Puedes hacerlo hasta 24 horas antes de la hora agendada.</p>
      </div>
      <div style="text-align:center;margin:32px 0;">
        <a href="${cancelUrl}" style="display:inline-block;background:#dc3545;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">❌ Cancelar mi cita</a>
      </div>
      <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">© ${clinicName} | Este email fue enviado automáticamente.</p>
    </div>
  </div>
</body>
</html>`;
}

function buildCancellationEmail(clinicName) {
  return `
<!DOCTYPE html>
<html>
<body style="font-family:'Segoe UI',sans-serif;background:#f0f4f8;margin:0;padding:40px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:40px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="font-size:48px;">✅</div>
    <h2 style="color:#374151;">Cita cancelada</h2>
    <p style="color:#6b7280;">Tu cita en <strong>${clinicName}</strong> ha sido cancelada correctamente.</p>
    <p style="color:#6b7280;font-size:14px;">Si deseas reagendar, visita nuestro sitio web.</p>
  </div>
</body>
</html>`;
}

function buildCancelPage(type, message) {
  const isOk = type === 'ok';
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isOk ? 'Cita Cancelada' : 'Error'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', sans-serif; background: #f0f4f8; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: white; border-radius: 20px; padding: 48px 40px; text-align: center; max-width: 480px; width: 100%; box-shadow: 0 8px 32px rgba(0,0,0,0.08); }
    .icon { font-size: 64px; margin-bottom: 24px; }
    h1 { font-size: 24px; color: #111827; margin-bottom: 12px; }
    p { color: #6b7280; font-size: 16px; line-height: 1.6; margin-bottom: 32px; }
    a { display: inline-block; background: #1a73e8; color: white; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: 600; font-size: 15px; }
    a:hover { background: #0f4c81; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isOk ? '✅' : '❌'}</div>
    <h1>${isOk ? 'Cita cancelada' : 'Error'}</h1>
    <p>${message}</p>
    <a href="/">Volver al inicio</a>
  </div>
</body>
</html>`;
}

module.exports = app;
