const https = require('https');
const url = 'https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-cevizlibag';
https.get(url, (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Location:', res.headers.location);
  if (res.headers.location) {
      https.get(res.headers.location, (res2) => {
          let data = '';
          res2.on('data', (chunk) => data += chunk);
          res2.on('end', () => {
            const fs = require('fs');
            fs.writeFileSync('cevizlibag.html', data);
            console.log('Saved to cevizlibag.html, final status code:', res2.statusCode);
          });
      })
  }
}).on('error', (err) => {
    console.log('Error:', err.message);
});
