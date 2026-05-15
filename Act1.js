const express = require('express');
const app = express();
app.use(express.json());
let tasks = [];

// Assigned list

const assignedList = ['Javier', 'Andrea', 'Carlos', 'Maria'];

// Weight list

const weight = {
    0: 'Unknown',
    1: 'Low',
    2: 'Medium',
    3: 'High'
};

// GET

app.get('/tasks', (req, res) => {
    res.json(tasks);
});

// GET by ID

app.get('/tasks/:id', (req, res) => {
    const searchID = req.params.id;     // to find a single id
    const task = tasks.find(t => t.id == searchID);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' }); // if there is no task, send 404
    res.json(task);
});

// POST

app.post('/tasks', (req, res) => {
    // this one is for current time
    const currentTime = new Date().toISOString();

    if (!assignedList.includes(req.body.assigned)) {
        return res.status(400).json({ mensaje: 'Assigned must be: ' + assignedList.join(', ') });
    }

    const nueva = {
        id: Date.now(),
        title: req.body.title,
        RegistryTime: currentTime,
        weight: weight[req.body.weight] || weight[0],
        description: req.body.description,
        assigned: req.body.assigned
    };
    tasks.push(nueva);
    res.status(201).json(nueva);
});

// POST BATCH

app.post('/tasks/batch', (req, res) => {
    if (!Array.isArray(req.body)) {
        return res.status(400).json({ mensaje: 'Body must be an array' });
    }

    const currentTime = new Date().toISOString();

    const invalidAssigned = req.body.find(task => !assignedList.includes(task.assigned));
    if (invalidAssigned) {
        return res.status(400).json({ mensaje: 'Assigned must be: ' + assignedList.join(', ') });
    }

    const nuevas = req.body.map((task, index) => ({
        id: Date.now() + index, // added this so that ids dont repeat on batch
        title: task.title,
        RegistryTime: currentTime,
        weight: weight[task.weight] || weight[0],
        description: task.description,
        assigned: task.assigned
    }));

    tasks.push(...nuevas);
    res.status(201).json(nuevas);
});

// PUT

app.put('/tasks/:id', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });

    if (req.body.assigned && !assignedList.includes(req.body.assigned)) {
        return res.status(400).json({ mensaje: 'Assigned must be: ' + assignedList.join(', ') });
    }

    task.title = req.body.title || task.title;
    task.weight = weight[req.body.weight] || task.weight;
    task.description = req.body.description || task.description;
    task.assigned = req.body.assigned || task.assigned;
    res.json(task);
});

// DELETE Batch

app.delete('/tasks/batch', (req, res) => {
    if (!Array.isArray(req.body)) {
        return res.status(400).json({ mensaje: 'Body must be an array' });
    }

    const idsDelete = req.body.map(t => t.id);
    tasks = tasks.filter(t => !idsDelete.includes(t.id));
    res.status(204).send();
    // how to do batch delete, put the JSON like this
    /*
    [
    {"id":1778265538424},
    {"id":1778265538288}
    ]
    */
});

// DELETE

app.delete('/tasks/:id', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });

    tasks = tasks.filter(t => t.id != req.params.id);
    res.status(204).send();
});

// PORT
app.listen(3000, () => console.log('Starting: http://localhost:3000/'));

// Done Here, POST BATCH was done by, the rest by me, GMO