const https = require('https');
https.get('https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-antalya', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const fs = require('fs');
    fs.writeFileSync('antalya.html', data);
    console.log('Saved to antalya.html');
  });
});
