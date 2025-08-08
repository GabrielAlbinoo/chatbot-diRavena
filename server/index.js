const { createApp } = require('./app');
const { loadScrapedData } = require('./data/loader');
const { PORT } = require('./config/env');

async function bootstrap() {
  await loadScrapedData();
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}

bootstrap();


