const https = require('https');
https.get('https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-serifali', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const fs = require('fs');
    fs.writeFileSync('serifali.html', data);
    console.log('Saved to serifali.html');
  });
});
