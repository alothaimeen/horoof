import { createServer } from 'http';
import { Server } from 'socket.io';
import next from 'next';
import { initGameEngine } from './lib/gameEngine';
import os from 'os';

const dev = process.env.NODE_ENV !== 'production';
const useTurbopack = dev && process.env.USE_TURBOPACK === '1';
const app = next({ dev, turbopack: useTurbopack });
const handle = app.getRequestHandler();

function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  // أولوية: شبكات WiFi المحلية الحقيقية (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  // يتجاهل Tailscale (100.64.0.0/10) وعناوين VPN الأخرى
  const isPrivateLocal = (ip: string) =>
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip);

  // المرور الأول: ابحث عن IP شبكة محلية حقيقية
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal && isPrivateLocal(iface.address)) {
        return iface.address;
      }
    }
  }
  // المرور الثاني: أي IP غير internal كاحتياط
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
    console.log(`🧰 bundler:  ${useTurbopack ? 'turbopack' : 'webpack'}`);
    console.log(`\n📱 محلياً:    http://localhost:${port}`);
    console.log(`📡 الشبكة:   http://${localIP}:${port}  (شاركه مع اللاعبين على نفس الـ WiFi)\n`);
  });
});
