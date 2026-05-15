const express = require('express');
const app     = express();
app.use(express.json());

// ── Datos compartidos 
let tasks = [];

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

// Convierte peso a valor numérico para ordenar
const getWeightValue = (w) => {
    const text = weightOrder[w];
    const num  = Number(w);
    if (text !== undefined) return text;
    if (!Number.isNaN(num)) return num;
    return 0;
};

// Registra un evento en el historial de auditoría de la tarea
const addHistory = (task, cambio, detalle = {}) => {
    if (!task.history) task.history = [];
    task.history.push({ timestamp: new Date().toISOString(), cambio, detalle });
};

const resolveAssignedV2 = (nombre) =>
    assignedListV2.find(a => a.nombre === nombre) || nombre;

const toV2 = (task) => ({ ...task, assigned: resolveAssignedV2(task.assigned) });

// Valida si una transición de estado es permitida
const validateTransition = (estadoActual, nuevoEstado) => {
    if (!ESTADOS.includes(nuevoEstado))
        return { ok: false, status: 400, error: `Estado inválido. Válidos: ${ESTADOS.join(', ')}` };

    const permitidos = validTransitions[estadoActual] || [];
    if (!permitidos.includes(nuevoEstado))
        return {
            ok: false, status: 422,
            error: `Transición inválida: '${estadoActual}' → '${nuevoEstado}'`,
            permitidos: permitidos.length ? permitidos : ['ninguna (estado final)']
        };

    return { ok: true };
};

//  ENDPOINTS (retrocompatibles con Act1 y Act2)

// ── GET /tasks — filtros + orden + paginación (Act2) ─────────
app.get('/tasks', (req, res) => {
    const {
        assigned, weight: wq, startDate, endDate,
        sortBy, sortOrder = 'asc',
        page = 1, limit = 10
    } = req.query;

    let result = [...tasks];

    if (assigned)             result = result.filter(t => t.assigned === assigned);
    if (wq)                   result = result.filter(t => t.weight === weight[wq] || t.weight === wq);
    if (startDate && endDate) result = result.filter(t => t.RegistryTime >= startDate && t.RegistryTime <= endDate);

    if (sortBy === 'weight')
        result.sort((a, b) => sortOrder === 'desc'
            ? getWeightValue(b.weight) - getWeightValue(a.weight)
            : getWeightValue(a.weight) - getWeightValue(b.weight));

    if (sortBy === 'RegistryTime')
        result.sort((a, b) => sortOrder === 'desc'
            ? new Date(b.RegistryTime) - new Date(a.RegistryTime)
            : new Date(a.RegistryTime) - new Date(b.RegistryTime));

    const startIdx = (Number(page) - 1) * Number(limit);
    res.json({ page: Number(page), limit: Number(limit), total: result.length, tasks: result.slice(startIdx, startIdx + Number(limit)) });
});

// ── Rutas especiales: deben ir ANTES de /:id

// GET /tasks/search — búsqueda full-text (Act3)
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
        const tarea = {
            id: Date.now() + i, title: t.title, RegistryTime: now,
            weight: weight[t.weight] || weight[0], description: t.description,
            assigned: t.assigned, estado: 'pendiente', comments: [], history: []
        };
        addHistory(tarea, 'creada en batch', { estadoInicial: 'pendiente' });
        return tarea;
    });
    tasks.push(...nuevas);
    res.status(201).json(nuevas);
});

// ── Endpoints con :id

// GET /tasks/:id (Act1)
app.get('/tasks/:id', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });
    res.json(task);
});

// GET /tasks/:id/history — auditoría (Act3)
app.get('/tasks/:id/history', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });
    res.json({ taskId: task.id, history: task.history || [] });
});

// POST /tasks/:id/transitions — cambio de estado (Act3)
app.post('/tasks/:id/transitions', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });

    const estadoActual = task.estado || 'pendiente';
    const resultado    = validateTransition(estadoActual, req.body.estado);

    if (!resultado.ok)
        return res.status(resultado.status).json({ mensaje: resultado.error, transicionesPermitidas: resultado.permitidos });

    const estadoAnterior = estadoActual;
    task.estado = req.body.estado;
    addHistory(task, 'cambio de estado', { de: estadoAnterior, a: task.estado });
    res.json({ taskId: task.id, estadoAnterior, estadoActual: task.estado });
});

// POST /tasks — crear tarea (Act1)
app.post('/tasks', (req, res) => {
    if (!assignedList.includes(req.body.assigned))
        return res.status(400).json({ mensaje: 'Assigned must be: ' + assignedList.join(', ') });

    const tarea = {
        id: Date.now(), title: req.body.title,
        RegistryTime: new Date().toISOString(),
        weight: weight[req.body.weight] || weight[0],
        description: req.body.description, assigned: req.body.assigned,
        estado: 'pendiente', comments: [], history: []
    };
    addHistory(tarea, 'creada', { estadoInicial: 'pendiente' });
    tasks.push(tarea);
    res.status(201).json(tarea);
});

// POST /tasks/:id/move — reasignar (Act2)
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

// PUT /tasks/:id — actualizar tarea (Act1)
app.put('/tasks/:id', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });
    if (req.body.assigned && !assignedList.includes(req.body.assigned))
        return res.status(400).json({ mensaje: 'Assigned must be: ' + assignedList.join(', ') });

    const cambios = {};
    if (req.body.title       && req.body.title       !== task.title)           { cambios.title       = { de: task.title,       a: req.body.title };          task.title       = req.body.title; }
    if (req.body.weight      && weight[req.body.weight] !== task.weight)       { cambios.weight      = { de: task.weight,      a: weight[req.body.weight] }; task.weight      = weight[req.body.weight]; }
    if (req.body.description && req.body.description !== task.description)     { cambios.description = { de: task.description, a: req.body.description };    task.description = req.body.description; }
    if (req.body.assigned    && req.body.assigned    !== task.assigned)        { cambios.assigned    = { de: task.assigned,    a: req.body.assigned };        task.assigned    = req.body.assigned; }
    if (Object.keys(cambios).length) addHistory(task, 'actualizada', cambios);
    res.json(task);
});

// DELETE /tasks/:id — eliminar tarea (Act1)
app.delete('/tasks/:id', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });
    tasks = tasks.filter(t => t.id != req.params.id);
    res.status(204).send();
});

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




// GET /v2/tasks
app.get('/v2/tasks', (req, res) => {
    const { assigned, page = 1, limit = 10 } = req.query;
    // Clase 2: .map() con función flecha para transformar cada tarea
    let result = tasks.map(toV2);
    if (assigned) result = result.filter(t => t.assigned?.nombre === assigned);
    const startIdx = (Number(page) - 1) * Number(limit);
    res.json({ page: Number(page), limit: Number(limit), total: result.length, tasks: result.slice(startIdx, startIdx + Number(limit)) });
});

// GET /v2/tasks/:id
app.get('/v2/tasks/:id', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });
    res.json(toV2(task));
});

// POST /v2/tasks — acepta assigned como string o como { id }
app.post('/v2/tasks', (req, res) => {
    let assignedNombre = req.body.assigned;
    if (typeof assignedNombre === 'object') {
        const found = assignedListV2.find(a => a.id === assignedNombre.id);
        if (!found) return res.status(400).json({ mensaje: 'ID de asignado no válido' });
        assignedNombre = found.nombre;
    }
    if (!assignedList.includes(assignedNombre))
        return res.status(400).json({ mensaje: 'Assigned must be: ' + assignedList.join(', ') });

    const tarea = {
        id: Date.now(), title: req.body.title,
        RegistryTime: new Date().toISOString(),
        weight: weight[req.body.weight] || weight[0],
        description: req.body.description,
        assigned: assignedNombre,       // se guarda como string internamente
        estado: 'pendiente', comments: [], history: []
    };
    addHistory(tarea, 'creada (v2)', { estadoInicial: 'pendiente' });
    tasks.push(tarea);
    res.status(201).json(toV2(tarea)); // la respuesta devuelve assigned como objeto
});

// ── Servidor ─────────────────────────────────────────────────
app.listen(3000, () => {
    console.log('Act3 corriendo en http://localhost:3000/\n');
    console.log('── Nuevos en Act3 ──────────────────────────────────');
    console.log('  GET  /tasks/search?q=texto     → búsqueda full-text');
    console.log('  POST /tasks/:id/transitions    → cambio de estado');
    console.log('  GET  /tasks/:id/history        → historial de cambios');
    console.log('  GET  /v2/tasks                 → assigned como objeto');
    console.log('────────────────────────────────────────────────────');
    console.log('  Estados válidos: pendiente → en progreso → bloqueada/completada');
});