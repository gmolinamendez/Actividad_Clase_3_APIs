const express = require('express');
const app = express();
app.use(express.json());
let tasks = [];

// GET

app.get('/tasks', (req, res) => {
    res.json(tasks);
});

// GET by ID

app.get('/tasks/:id', (req, res) => {
    // to find a single id
    const searchID = req.params.id;
    const task = tasks.find(t => t.id == searchID);
    // if there are no tasks, then nothing
    res.json(task);
});

// POST

app.post('/tasks', (req, res) => {
    // this one is for current time
    const currentTime = new Date().toISOString();
    // instead of manually typing it, just made it 1 2 or 3, prob ill make a condition to make it if >3, just use 3
    const weight = {
        0: 'Unknown',
        1: 'Low',
        2: 'Medium',
        3: 'High'
    };
    const nueva = {id: Date.now(), 
        title: req.body.title, 
        RegistryTime: currentTime, 
        weight: weight[req.body.weight] || weight[0], 
        description: req.body.description,
        assigned: req.body.assigned || false // this is to prevent it from being undefined
    };
    tasks.push(nueva);
    res.status(201).json(nueva);
});

// POST BATCH -- FIX PLS
/*
app.post('/tasks', (req, res) => {
    // this one is for current time
    const currentTime = new Date().toISOString();
    // instead of manually typing it, just made it 1 2 or 3, prob ill make a condition to make it if >3, just use 3
    const weight = {
        0: 'Unknown',
        1: 'Low',
        2: 'Medium',
        3: 'High'
    };
    const nuevas = req.body.map((task, index) => ({
        id: Date.now() + index, // added this so that ids dont repeat on batch
        title: task.title,
        RegistryTime: currentTime,
        weight: weight[task.weight] || weight[0],
        description: task.description,
        assigned: task.assigned || false // this is to prevent it from being undefined
    }));
    tasks.push(...nuevas);
    res.status(201).json(nuevas);
    });

 to do batch post, do this
[
    {
    "title":"2839u8293",
    "weight":4,
    "description":"Just Dance3",
    "assigned":true
    },
    {
    "title":"2839u8293",
    "weight":4,
    "description":"Just Dance3",
    "assigned":true
    }
]
    */ 


// PUT

app.put('/tasks/:id', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);
    if(!task) return res.status(404).json({mensaje: 'Task not found'});
    task.title = req.body.title;
    task.weight = req.body.weight;
    task.description = req.body.description;
    task.assigned = req.body.assigned || false;
    res.json(task);
});

// DELETE

app.delete('/tasks/:id', (req, res) => {
    tasks = tasks.filter(t => t.id != req.params.id);
    res.status(204).send();
});

// DELETE Batch

app.delete('/tasks',(req,res)=> {
    const idsDelete = req.body.map(t=> t.id);
    tasks = tasks.filter(t=> !idsDelete.includes(t.id));
    res.status(204).send();
    // how to do batch delete, put the JSON like this
    /*
    [
    {"id":1778265538424},
    {"id":1778265538288}
    ]
    */
});

// PORT
app.listen(3000, () => console.log('Starting: http://localhost:3000/'));