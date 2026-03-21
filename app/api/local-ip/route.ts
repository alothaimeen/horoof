import os from 'os';

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

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  // على السيرفر أو الإنتاج: لا حاجة للـ IP المحلي
  if (appUrl && !appUrl.includes('localhost')) {
    return Response.json({ ip: null, appUrl });
  }
  const ip = getLocalIP();
  const port = process.env.PORT || '3000';
  return Response.json({ ip, appUrl: `http://${ip}:${port}` });
}
