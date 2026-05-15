
const express = require('express');
const app     = express();
app.use(express.json());

//Datos compartidos 
let tasks    = [];
let tags     = [];      // Act4: recurso independiente de etiquetas
let webhooks = [];      // Act4: suscripciones a notificaciones externas

const assignedList = ['Javier', 'Andrea', 'Carlos', 'Maria'];

const assignedListV2 = [
    { id: 1, nombre: 'Javier', email: 'javier@empresa.com' },
    { id: 2, nombre: 'Andrea', email: 'andrea@empresa.com' },
    { id: 3, nombre: 'Carlos', email: 'carlos@empresa.com' },
    { id: 4, nombre: 'Maria',  email: 'maria@empresa.com'  }
];

const weight      = { 0: 'Unknown', 1: 'Low', 2: 'Medium', 3: 'High' };
const weightOrder = { Unknown: 0, Low: 1, Medium: 2, High: 3 };

const ESTADOS = ['pendiente', 'en progreso', 'bloqueada', 'completada'];

const validTransitions = {
    'pendiente':   ['en progreso'],
    'en progreso': ['bloqueada', 'completada'],
    'bloqueada':   ['en progreso'],
    'completada':  []
};

//  HELPERS

const getWeightValue = (w) => {
    const text = weightOrder[w];
    const num  = Number(w);
    if (text !== undefined) return text;
    if (!Number.isNaN(num)) return num;
    return 0;
};

const addHistory = (task, cambio, detalle = {}) => {
    if (!task.history) task.history = [];
    task.history.push({ timestamp: new Date().toISOString(), cambio, detalle });
};

const resolveAssignedV2 = (nombre) =>
    assignedListV2.find(a => a.nombre === nombre) || nombre;

const toV2 = (task) => ({ ...task, assigned: resolveAssignedV2(task.assigned) });

const validateTransition = (estadoActual, nuevoEstado) => {
    if (!ESTADOS.includes(nuevoEstado))
        return { ok: false, status: 400, error: `Estado inválido. Válidos: ${ESTADOS.join(', ')}` };
    const permitidos = validTransitions[estadoActual] || [];
    if (!permitidos.includes(nuevoEstado))
        return { ok: false, status: 422, error: `Transición inválida: '${estadoActual}' → '${nuevoEstado}'`, permitidos: permitidos.length ? permitidos : ['ninguna (estado final)'] };
    return { ok: true };
};

//  WEBHOOK TRIGGER — Act4
const buildPayload = (evento, data) => ({
    evento, data, timestamp: new Date().toISOString()
});

const notificar = (wh, payload) =>
    new Promise((resolve) => {
        // En producción: fetch(wh.url, { method: 'POST', body: JSON.stringify(payload) })
        console.log(`[Webhook] → ${wh.url} | evento: ${payload.evento}`);
        resolve({ url: wh.url, enviado: true });
    });

const triggerWebhooks = async (evento, data) => {
    const suscriptores = webhooks.filter(w =>
        w.eventos.includes(evento) || w.eventos.includes('*')
    );
    if (!suscriptores.length) return;

    const payload = buildPayload(evento, data);

    await Promise.all(
        suscriptores.map(wh =>
            notificar(wh, payload).catch(err => {
                console.error(`[Webhook] Error en ${wh.url}:`, err.message);
                return { url: wh.url, enviado: false };
            })
        )
    );
};

//  TASKS (todo lo de Act1, Act2 y Act3 heredado)

// GET /tasks — filtros + orden + paginación (Act2)
app.get('/tasks', (req, res) => {
    const { assigned, weight: wq, startDate, endDate, sortBy, sortOrder = 'asc', page = 1, limit = 10 } = req.query;

    let result = [...tasks];
    if (assigned)             result = result.filter(t => t.assigned === assigned);
    if (wq)                   result = result.filter(t => t.weight === weight[wq] || t.weight === wq);
    if (startDate && endDate) result = result.filter(t => t.RegistryTime >= startDate && t.RegistryTime <= endDate);

    if (sortBy === 'weight')
        result.sort((a, b) => sortOrder === 'desc' ? getWeightValue(b.weight) - getWeightValue(a.weight) : getWeightValue(a.weight) - getWeightValue(b.weight));
    if (sortBy === 'RegistryTime')
        result.sort((a, b) => sortOrder === 'desc' ? new Date(b.RegistryTime) - new Date(a.RegistryTime) : new Date(a.RegistryTime) - new Date(b.RegistryTime));

    const startIdx = (Number(page) - 1) * Number(limit);
    res.json({ page: Number(page), limit: Number(limit), total: result.length, tasks: result.slice(startIdx, startIdx + Number(limit)) });
});

//  Rutas especiales: ANTES de /:id 

// GET /tasks/search (Act3)
app.get('/tasks/search', (req, res) => {
    const q = (req.query.q || '').toLowerCase().trim();
    if (!q) return res.status(400).json({ mensaje: 'El parámetro q es requerido' });
    const results = tasks.filter(t =>
        (t.description || '').toLowerCase().includes(q) ||
        (t.assigned    || '').toLowerCase().includes(q)
    );
    res.json({ query: q, total: results.length, tasks: results });
});

// DELETE /tasks/batch (Act1)
app.delete('/tasks/batch', (req, res) => {
    if (!Array.isArray(req.body)) return res.status(400).json({ mensaje: 'Body must be an array' });
    const ids = req.body.map(t => t.id);
    tasks = tasks.filter(t => !ids.includes(t.id));
    res.status(204).send();
});

// POST /tasks/batch (Act1)
app.post('/tasks/batch', (req, res) => {
    if (!Array.isArray(req.body)) return res.status(400).json({ mensaje: 'Body must be an array' });
    const invalid = req.body.find(t => !assignedList.includes(t.assigned));
    if (invalid) return res.status(400).json({ mensaje: 'Assigned must be: ' + assignedList.join(', ') });

    const now    = new Date().toISOString();
    const nuevas = req.body.map((t, i) => {
        const tarea = { id: Date.now() + i, title: t.title, RegistryTime: now, weight: weight[t.weight] || weight[0], description: t.description, assigned: t.assigned, estado: 'pendiente', tags: [], comments: [], history: [] };
        addHistory(tarea, 'creada en batch', { estadoInicial: 'pendiente' });
        return tarea;
    });
    tasks.push(...nuevas);
    res.status(201).json(nuevas);
});

//Endpoints con :id 

app.get('/tasks/:id', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });
    res.json(task);
});

// GET /tasks/:id/history (Act3)
app.get('/tasks/:id/history', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });
    res.json({ taskId: task.id, history: task.history || [] });
});

// POST /tasks/:id/transitions (Act3) — ahora dispara webhooks (Act4)
app.post('/tasks/:id/transitions', async (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });

    const estadoActual = task.estado || 'pendiente';
    const resultado    = validateTransition(estadoActual, req.body.estado);
    if (!resultado.ok)
        return res.status(resultado.status).json({ mensaje: resultado.error, transicionesPermitidas: resultado.permitidos });

    const estadoAnterior = estadoActual;
    task.estado = req.body.estado;
    addHistory(task, 'cambio de estado', { de: estadoAnterior, a: task.estado });

    // Act4: dispara webhooks en paralelo sin bloquear la respuesta
    await triggerWebhooks('estado.cambio', { taskId: task.id, de: estadoAnterior, a: task.estado });

    res.json({ taskId: task.id, estadoAnterior, estadoActual: task.estado });
});

app.post('/tasks', (req, res) => {
    if (!assignedList.includes(req.body.assigned))
        return res.status(400).json({ mensaje: 'Assigned must be: ' + assignedList.join(', ') });
    const tarea = { id: Date.now(), title: req.body.title, RegistryTime: new Date().toISOString(), weight: weight[req.body.weight] || weight[0], description: req.body.description, assigned: req.body.assigned, estado: 'pendiente', tags: [], comments: [], history: [] };
    addHistory(tarea, 'creada', { estadoInicial: 'pendiente' });
    tasks.push(tarea);
    res.status(201).json(tarea);
});

app.post('/tasks/:id/move', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });
    if (!assignedList.includes(req.body.assigned))
        return res.status(400).json({ mensaje: 'Assigned must be: ' + assignedList.join(', ') });
    const anterior = task.assigned;
    task.assigned  = req.body.assigned;
    addHistory(task, 'reasignada', { de: anterior, a: task.assigned });
    res.json(task);
});

app.put('/tasks/:id', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });
    if (req.body.assigned && !assignedList.includes(req.body.assigned))
        return res.status(400).json({ mensaje: 'Assigned must be: ' + assignedList.join(', ') });

    const cambios = {};
    if (req.body.title       && req.body.title       !== task.title)         { cambios.title       = { de: task.title,       a: req.body.title };          task.title       = req.body.title; }
    if (req.body.weight      && weight[req.body.weight] !== task.weight)     { cambios.weight      = { de: task.weight,      a: weight[req.body.weight] }; task.weight      = weight[req.body.weight]; }
    if (req.body.description && req.body.description !== task.description)   { cambios.description = { de: task.description, a: req.body.description };    task.description = req.body.description; }
    if (req.body.assigned    && req.body.assigned    !== task.assigned)      { cambios.assigned    = { de: task.assigned,    a: req.body.assigned };        task.assigned    = req.body.assigned; }
    if (Object.keys(cambios).length) addHistory(task, 'actualizada', cambios);
    res.json(task);
});

app.delete('/tasks/:id', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });
    tasks = tasks.filter(t => t.id != req.params.id);
    res.status(204).send();
});

// COMMENTS (Act2)
app.get('/tasks/:id/comments', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });
    res.json(task.comments || []);
});
app.post('/tasks/:id/comments', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });
    if (!task.comments) task.comments = [];
    const comment = { id: Date.now(), text: req.body.text };
    task.comments.push(comment);
    addHistory(task, 'comentario añadido', { commentId: comment.id });
    res.status(201).json(comment);
});
app.put('/tasks/:id/comments/:commentId', (req, res) => {
    const task    = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });
    const comment = (task.comments || []).find(c => c.id == req.params.commentId);
    if (!comment) return res.status(404).json({ mensaje: 'Comment not found' });
    comment.text = req.body.text || comment.text;
    res.json(comment);
});
app.delete('/tasks/:id/comments/:commentId', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });
    if (!task.comments) return res.status(404).json({ mensaje: 'Comment not found' });
    task.comments = task.comments.filter(c => c.id != req.params.commentId);
    res.status(204).send();
});

// TAGS de una tarea (Act4)
app.get('/tasks/:id/tags', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });
    const taskTags = (task.tags || []).map(id => tags.find(t => t.id == id)).filter(Boolean);
    res.json(taskTags);
});
app.put('/tasks/:id/tags/:tagId', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });
    const tag  = tags.find(t => t.id == req.params.tagId);
    if (!tag)  return res.status(404).json({ mensaje: 'Tag not found' });
    if (!task.tags) task.tags = [];
    if (task.tags.includes(tag.id)) return res.status(409).json({ mensaje: 'Tag ya asociado' });
    task.tags.push(tag.id);
    addHistory(task, 'tag asociado', { tagId: tag.id, tagNombre: tag.nombre });
    res.json({ mensaje: 'Tag asociado', taskId: task.id, tagId: tag.id });
});
app.delete('/tasks/:id/tags/:tagId', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });
    const tag  = tags.find(t => t.id == req.params.tagId);
    if (!tag)  return res.status(404).json({ mensaje: 'Tag not found' });
    const antes = (task.tags || []).length;
    task.tags   = (task.tags || []).filter(id => id != tag.id);
    if (task.tags.length === antes) return res.status(404).json({ mensaje: 'Tag no estaba asociado' });
    addHistory(task, 'tag desasociado', { tagId: tag.id, tagNombre: tag.nombre });
    res.status(204).send();
});

//  V2 (Act3 heredado)

app.get('/v2/tasks', (req, res) => {
    const { assigned, page = 1, limit = 10 } = req.query;
    let result = tasks.map(toV2);
    if (assigned) result = result.filter(t => t.assigned?.nombre === assigned);
    const startIdx = (Number(page) - 1) * Number(limit);
    res.json({ page: Number(page), limit: Number(limit), total: result.length, tasks: result.slice(startIdx, startIdx + Number(limit)) });
});
app.get('/v2/tasks/:id', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });
    res.json(toV2(task));
});
app.post('/v2/tasks', (req, res) => {
    let assignedNombre = req.body.assigned;
    if (typeof assignedNombre === 'object') {
        const found = assignedListV2.find(a => a.id === assignedNombre.id);
        if (!found) return res.status(400).json({ mensaje: 'ID de asignado no válido' });
        assignedNombre = found.nombre;
    }
    if (!assignedList.includes(assignedNombre))
        return res.status(400).json({ mensaje: 'Assigned must be: ' + assignedList.join(', ') });
    const tarea = { id: Date.now(), title: req.body.title, RegistryTime: new Date().toISOString(), weight: weight[req.body.weight] || weight[0], description: req.body.description, assigned: assignedNombre, estado: 'pendiente', tags: [], comments: [], history: [] };
    addHistory(tarea, 'creada (v2)', { estadoInicial: 'pendiente' });
    tasks.push(tarea);
    res.status(201).json(toV2(tarea));
});

//  TAGS — recurso independiente (Act4)

app.get('/tags', (req, res) => res.json(tags));

app.post('/tags', (req, res) => {
    if (!req.body.nombre) return res.status(400).json({ mensaje: 'nombre es requerido' });
    const existe = tags.find(t => t.nombre.toLowerCase() === req.body.nombre.toLowerCase());
    if (existe) return res.status(409).json({ mensaje: 'El tag ya existe', tag: existe });
    const tag = { id: Date.now(), nombre: req.body.nombre };
    tags.push(tag);
    res.status(201).json(tag);
});

app.put('/tags/:tagId', (req, res) => {
    const tag = tags.find(t => t.id == req.params.tagId);
    if (!tag) return res.status(404).json({ mensaje: 'Tag not found' });
    tag.nombre = req.body.nombre || tag.nombre;
    res.json(tag);
});

app.delete('/tags/:tagId', (req, res) => {
    const tag = tags.find(t => t.id == req.params.tagId);
    if (!tag) return res.status(404).json({ mensaje: 'Tag not found' });
    

    tasks.forEach(task => { task.tags = (task.tags || []).filter(id => id != req.params.tagId); });
    tags = tags.filter(t => t.id != req.params.tagId);
    res.status(204).send();
});

//  REPORTES — recurso independiente (Act4)

app.get('/reportes', (req, res) => {
    const { startDate, endDate } = req.query;

    const scope = startDate && endDate
        ? tasks.filter(t => t.RegistryTime >= startDate && t.RegistryTime <= endDate)
        : [...tasks];

    const porAsignado = assignedList.reduce((acc, nombre) => {
        acc[nombre] = scope.filter(t => t.assigned === nombre).length;
        return acc;
    }, {});

    const distribucionPesos = Object.values(weight).reduce((acc, label) => {
        acc[label] = scope.filter(t => t.weight === label).length;
        return acc;
    }, {});

    res.json({
        periodo:           startDate && endDate ? { desde: startDate, hasta: endDate } : 'sin filtro',
        totalTareas:       scope.length,
        porAsignado,
        distribucionPesos,
        tareasCompletadas: scope.filter(t => t.estado === 'completada').length
    });
});

//  WEBHOOKS — CRUD de suscripciones (Act4)

//  Se disparan en POST /tasks/:id/transitions

app.get('/webhooks', (req, res) => res.json(webhooks));

app.post('/webhooks', (req, res) => {
    const { url, eventos } = req.body;
    if (!url)   return res.status(400).json({ mensaje: 'url es requerida' });
    if (!eventos || !Array.isArray(eventos) || !eventos.length)
        return res.status(400).json({ mensaje: 'eventos debe ser un array. Ej: ["estado.cambio"]' });
    const existe = webhooks.find(w => w.url === url);
    if (existe) return res.status(409).json({ mensaje: 'Ya existe una suscripción para esta URL', webhook: existe });
    const webhook = { id: Date.now(), url, eventos, creadoEn: new Date().toISOString() };
    webhooks.push(webhook);
    res.status(201).json(webhook);
});

app.get('/webhooks/:id', (req, res) => {
    const webhook = webhooks.find(w => w.id == req.params.id);
    if (!webhook) return res.status(404).json({ mensaje: 'Webhook not found' });
    res.json(webhook);
});

app.put('/webhooks/:id', (req, res) => {
    const webhook = webhooks.find(w => w.id == req.params.id);
    if (!webhook) return res.status(404).json({ mensaje: 'Webhook not found' });
    webhook.url     = req.body.url     || webhook.url;
    webhook.eventos = req.body.eventos || webhook.eventos;
    res.json(webhook);
});

app.delete('/webhooks/:id', (req, res) => {
    const webhook = webhooks.find(w => w.id == req.params.id);
    if (!webhook) return res.status(404).json({ mensaje: 'Webhook not found' });
    webhooks = webhooks.filter(w => w.id != req.params.id);
    res.status(204).send();
});

// ── Servidor
app.listen(3000, () => {
    console.log('Act4 corriendo en http://localhost:3000/\n');
    console.log('── Nuevos en Act4 ──────────────────────────────────');
    console.log('  GET    /reportes                  → métricas agregadas');
    console.log('  CRUD   /tags                      → etiquetas');
    console.log('  PUT    /tasks/:id/tags/:tagId     → asociar tag a tarea');
    console.log('  DELETE /tasks/:id/tags/:tagId     → desasociar tag');
    console.log('  CRUD   /webhooks                  → suscripciones');
    console.log('────────────────────────────────────────────────────');
});