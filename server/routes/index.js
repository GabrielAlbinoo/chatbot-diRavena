const { Router } = require('express');
const path = require('path');
const chatRouter = require('./chat');

const router = Router();

router.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

router.use('/api', chatRouter);

router.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

module.exports = router;


