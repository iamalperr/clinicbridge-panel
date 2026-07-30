const https = require('https');

const slugs = [
  'hospitadent-dental-group-cevizlibağ',
  'hospitadent-cevizlibag',
  'dental-group-hospitadent-cevizlibag'
];

slugs.forEach(slug => {
    const url = 'https://feelinhealthy.com/medicalcenter/' + encodeURIComponent(slug);
    https.get(url, (res) => {
      console.log(slug, '-> Status Code:', res.statusCode);
      if (res.statusCode === 302) {
          console.log(slug, '-> Location:', res.headers.location);
      }
    }).on('error', (err) => {
        console.log('Error for', slug, ':', err.message);
    });
});
