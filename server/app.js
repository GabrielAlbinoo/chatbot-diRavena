const express = require('express');
const path = require('path');
const routes = require('./routes');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(process.cwd(), 'public')));
  app.use(routes);
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Algo deu errado!' });
  });
  return app;
}

module.exports = { createApp };


