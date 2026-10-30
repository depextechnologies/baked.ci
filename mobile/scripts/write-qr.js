// Writes dist/expo-go-qr.png for the current Expo tunnel (reads the local ngrok API).
const QR = require('qrcode');
fetch('http://localhost:4040/api/tunnels')
  .then((r) => r.json())
  .then(({ tunnels }) => {
    const url = tunnels.find((t) => t.public_url.startsWith('https')).public_url.replace('https://', 'exp://');
    return QR.toFile('dist/expo-go-qr.png', url, { width: 480, margin: 2 }).then(() => console.log('QR ->', url));
  })
  .catch((e) => console.log('QR skipped:', e.message));
