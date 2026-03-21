import { createServer } from 'http';
import { Server } from 'socket.io';
import next from 'next';
import { initGameEngine } from './lib/gameEngine';
import os from 'os';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server(httpServer, {
    path: '/horoof/api/socket',
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  initGameEngine(io);

  const port = parseInt(process.env.PORT || '3000');

  httpServer.listen(port, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log(`\n🎉 مسابقة العيد جاهزة!`);
    console.log(`\n📱 محلياً:    http://localhost:${port}`);
    console.log(`📡 الشبكة:   http://${localIP}:${port}  (شاركه مع اللاعبين على نفس الـ WiFi)\n`);
  });
});
