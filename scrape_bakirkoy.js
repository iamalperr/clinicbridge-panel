const https = require('https');
const url = 'https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-bakirkoy';
https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const fs = require('fs');
    fs.writeFileSync('bakirkoy.html', data);
    console.log('Saved to bakirkoy.html, status code:', res.statusCode);
  });
}).on('error', (err) => {
    console.log('Error:', err.message);
});
