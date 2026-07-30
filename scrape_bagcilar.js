const https = require('https');
https.get('https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-bagcilar', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const fs = require('fs');
    fs.writeFileSync('bagcilar.html', data);
    console.log('Saved to bagcilar.html');
  });
});
