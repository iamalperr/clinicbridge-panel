const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function capture() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Set viewport large enough
  await page.setViewport({ width: 1400, height: 8000, deviceScaleFactor: 2 });
  
  console.log('Navigating to http://localhost:3000/social-posts...');
  await page.goto('http://localhost:3000/social-posts', { waitUntil: 'networkidle2' });
  
  console.log('Waiting for #post-1...');
  await page.waitForSelector('#post-1', { timeout: 10000 });
  // Add a small delay for any animations/fonts to load
  await new Promise(r => setTimeout(r, 2000));
  
  // Create output directory if it doesn't exist
  const outDir = path.join(__dirname, '../public/social');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const posts = [
    { id: 'post-1', name: 'clinicbridge-post-01-brosur-olmayan-web-sitesi.png' }
  ];

  for (const post of posts) {
    console.log(`Capturing ${post.name}...`);
    const element = await page.$(`#${post.id}`);
    if (element) {
      await element.screenshot({
        path: path.join(outDir, post.name),
        type: 'png'
      });
      console.log(`Saved ${post.name}`);
    } else {
      console.log(`Element #${post.id} not found!`);
    }
  }

  await browser.close();
  console.log('Done!');
}

capture().catch(console.error);
