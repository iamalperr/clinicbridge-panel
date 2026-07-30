const https = require('https');

const slugs = [
  "hospitadent-dental-group-gokturk",
  "hospitadent-dental-group-göktürk",
  "hospitadent-gokturk",
  "dental-group-hospitadent-gokturk",
  "hospitadent-eyupsultan"
];

async function checkUrl(slug) {
  const url = `https://feelinhealthy.com/medicalcenter/${slug}`;
  return new Promise((resolve) => {
    https.get(url, (res) => {
      resolve({ slug, url, status: res.statusCode, location: res.headers.location });
    }).on('error', (e) => {
      resolve({ slug, url, status: 'error', message: e.message });
    });
  });
}

async function main() {
  console.log("Checking FeelinHealthy slugs for Göktürk...\n");
  for (const slug of slugs) {
    const result = await checkUrl(slug);
    console.log(`[${result.status}] ${result.url}`);
    if (result.location) {
      console.log(`   -> Redirects to: ${result.location}`);
    }
  }
}

main();
