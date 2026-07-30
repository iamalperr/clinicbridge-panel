const https = require('https');
const url = 'https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-mecidiyekoy';
https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const fs = require('fs');
    fs.writeFileSync('mecidiyekoy.html', data);
    console.log('Saved to mecidiyekoy.html, status code:', res.statusCode);
  });
}).on('error', (err) => {
    console.log('Error:', err.message);
});
