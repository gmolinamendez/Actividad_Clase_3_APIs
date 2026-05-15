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

const weightOrder = {
    Unknown: 0,
    Low: 1,
    Medium: 2,
    High: 3
};

function getWeightValue(taskWeight) {
    const textValue = weightOrder[taskWeight];
    const numberValue = Number(taskWeight);

    if (textValue !== undefined) return textValue;
    if (!Number.isNaN(numberValue)) return numberValue;
    return 0;
}

// endpoint get con filtros asc/desc y por rango de fecha , paginacion

app.get('/tasks', (req, res) => {
    const assigned = req.query.assigned;
    const weightQuery = req.query.weight;
    const startDate = req.query.startDate; //query start
    const endDate = req.query.endDate; // query end

    const sortBy = req.query.sortBy; // query param para ordenar 
    const sortOrder = (req.query.sortOrder || req.query.order || 'asc').toLowerCase(); // asc
    const page = parseInt(req.query.page) || 1; 
    const limit = parseInt(req.query.limit) || 10; 

    let filteredTasks = [...tasks];

    if (assigned) {
        filteredTasks = filteredTasks.filter(t => t.assigned === assigned);
    }

    if (weightQuery) {
        filteredTasks = filteredTasks.filter(t => t.weight === weight[weightQuery] || t.weight === weightQuery);
    }

    
    if (startDate && endDate) {
        filteredTasks = filteredTasks.filter(t =>
            t.RegistryTime >= startDate && t.RegistryTime <= endDate
        );
    }

    // logica para ordenar
    if (sortBy) {
        filteredTasks = filteredTasks.sort((a, b) => {
            if (sortBy == 'weight') {
                return sortOrder === 'desc' ? getWeightValue(b.weight) - getWeightValue(a.weight) : getWeightValue(a.weight) - getWeightValue(b.weight);
            }

            if (sortBy == 'RegistryTime') {
                return sortOrder === 'desc' ? new Date(b.RegistryTime) - new Date(a.RegistryTime) : new Date(a.RegistryTime) - new Date(b.RegistryTime);
            }

            return 0;
        });
    }

    // logic de pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedTasks = filteredTasks.slice(startIndex, endIndex);

    res.json({
        page: page,
        limit: limit,
        total: filteredTasks.length,
        tasks: paginatedTasks
    })
});


// GET by ID

app.get('/tasks/:id', (req, res) => {
    const searchID = req.params.id;     // to find a single id
    const task = tasks.find(t => t.id == searchID);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' }); // if there is no task, send 404
    res.json(task);
});

// GET para comments

app.get('/tasks/:id/comments', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });

    res.json(task.comments || []);
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
        assigned: req.body.assigned,
        comments: [] 
    };

    tasks.push(nueva);
    res.status(201).json(nueva);
});

app.post('/tasks/:id/comments', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });

    if (!task.comments) {
        task.comments = [];
    }

    const newComment = {
        id: Date.now(),
        text: req.body.text
    };
    task.comments.push(newComment);
    res.status(201).json(newComment);
});

app.post('/tasks/:id/move', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });

    const newAssigned = req.body.assigned;
    if (!assignedList.includes(newAssigned)) {
        return res.status(400).json({ mensaje: 'Assigned must be: ' + assignedList.join(', ') });
    }

    task.assigned = newAssigned;
    res.json(task);
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
        assigned: task.assigned,
        comments: []
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

// PUT para comments

app.put('/tasks/:id/comments/:commentId', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });

    const comment = task.comments ? task.comments.find(c => c.id == req.params.commentId) : null;
    if (!comment) return res.status(404).json({ mensaje: 'Comment not found' });

    comment.text = req.body.text || comment.text;
    res.json(comment);
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

// DELETE para comments

app.delete('/tasks/:id/comments/:commentId', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if (!task) return res.status(404).json({ mensaje: 'Task not found' });

    if (!task.comments) {
        return res.status(404).json({ mensaje: 'Comment not found' });
    }

    task.comments = task.comments.filter(c => c.id != req.params.commentId);
    res.status(204).send();
});

// PORT
app.listen(3000, () => console.log('Starting: http://localhost:3000/'));
