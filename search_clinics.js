const https = require('https');
https.get('https://feelinhealthy.com/clinics', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        // Find all hrefs inside the clinics list
        const links = data.match(/href=["'](https:\/\/feelinhealthy.com\/medicalcenter\/[^"']+)["']/g);
        if (links) {
            const uniqueLinks = [...new Set(links)];
            console.log("Found links:", uniqueLinks);
        } else {
            console.log("No links found.");
        }
    });
});
