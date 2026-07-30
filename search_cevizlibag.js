const https = require('https');
https.get('https://feelinhealthy.com/clinics', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const match = data.match(/cevizliba/i);
        console.log("Found in clinics list:", !!match);
    });
});
