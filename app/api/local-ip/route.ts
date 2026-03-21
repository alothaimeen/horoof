import os from 'os';

function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  // أولوية: شبكات WiFi المحلية الحقيقية — يتجاهل Tailscale (100.64-127.x.x)
  const isPrivateLocal = (ip: string) =>
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip);

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal && isPrivateLocal(iface.address)) {
        return iface.address;
      }
    }
  }
  // احتياط: أي IP غير internal
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
  // APP_URL (بدون NEXT_PUBLIC_) يُقرأ في وقت التشغيل — لا يُضمَّن في build
  const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  // على السيرفر أو الإنتاج: لا حاجة للـ IP المحلي
  if (appUrl && !appUrl.includes('localhost')) {
    return Response.json({ ip: null, appUrl });
  }
  const ip = getLocalIP();
  const port = process.env.PORT || '3000';
  return Response.json({ ip, appUrl: `http://${ip}:${port}` });
}
