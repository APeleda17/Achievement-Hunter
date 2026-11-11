import { config } from './config.js';
import { createApp } from './app.js';

const app = createApp();

app.listen(config.PORT, () => {
  console.log(`Serveris veikia: http://localhost:${config.PORT}`);
});
