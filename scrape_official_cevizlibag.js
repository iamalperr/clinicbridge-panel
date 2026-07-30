const https = require('https');
const url = 'https://www.hospitadent.com/en/branches/cevizlibag/';
https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const fs = require('fs');
    fs.writeFileSync('official_cevizlibag.html', data);
    console.log('Saved to official_cevizlibag.html, status code:', res.statusCode);
  });
}).on('error', (err) => {
    console.log('Error:', err.message);
});
