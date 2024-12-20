const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const readmePath = '../../README.md';
const outputDir = '../public/static/images';

const categoryTags = {
  'Developer Tools': ['Developer', 'Tools', 'macOS'],
  'AI Tools': ['AI', 'Machine Learning', 'Automation'],
  'Other AI tools': ['AI', 'Voice', 'Text to Speech'],
  'Design Tools': ['Design', 'Graphics', 'Marketing'],
  'Code Libraries': ['NextJs', 'React', 'SaaS'],
  'Productivity': ['Productivity', 'Efficiency', 'Tools'],
  'Marketing Tools': ['Marketing', 'SEO', 'Promotion'],
  'SEO Tools': ['SEO', 'Optimization', 'Marketing'],
  'Startup SaaS/Tools': ['Startup', 'SaaS', 'Business'],
  'Themes, Plugins': ['Themes', 'Plugins', 'Customization'],
  'Books': ['Books', 'Learning', 'Programming'],
  'Health and Fitness': ['Health', 'Fitness', 'Wellness']
};

function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();
}

function escapeQuotes(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

async function downloadImage(url, outputPath) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    fs.writeFileSync(outputPath, response.data);
  } catch (error) {
    console.error(`Failed to download image from ${url}:`, error.message);
  }
}

async function extractAppInfo() {
  const readmeContent = fs.readFileSync(readmePath, 'utf-8');
  const lines = readmeContent.split('\n');
  const apps = [];

  let currentCategory = '';
  let currentSubcategory = '';

  for (const line of lines) {
    if (line.startsWith('## ')) {
      currentCategory = line.replace('## ', '').trim();
    } else if (line.startsWith('### ')) {
      currentSubcategory = line.replace('### ', '').trim();
    } else if (line.startsWith('|')) {
      const parts = line.split('|').map(part => part.trim());
      if (parts.length >= 5 && parts[2].startsWith('[')) {
        const name = parts[2].match(/\[(.*?)\]/)[1];
        const website = parts[2].match(/\((.*?)\)/)[1];
        const description = parts[3];
        const deal = parts[4];

        apps.push({
          name,
          website,
          description,
          deal,
          category: currentCategory,
          subcategory: currentSubcategory,
        });
      }
    }
  }

  return apps;
}

async function fetchAssets(app) {
  const { website, name } = app;
  const productName = sanitizeName(name);
  const appDir = path.join(outputDir, 'product', productName);
  fs.mkdirSync(appDir, { recursive: true });

  try {
    const response = await axios.get(website);
    const $ = cheerio.load(response.data);

    let faviconUrl = $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href');
    let ogImageUrl = $('meta[property="og:image"]').attr('content');

    // Ensure the URLs are absolute
    if (faviconUrl && !faviconUrl.startsWith('http')) {
      faviconUrl = new URL(faviconUrl, website).href;
    }
    if (ogImageUrl && !ogImageUrl.startsWith('http')) {
      ogImageUrl = new URL(ogImageUrl, website).href;
    }

    console.log({ faviconUrl, ogImageUrl });

    // Try to find the highest resolution PNG favicon
    const possibleFaviconUrls = [
      $('link[rel="apple-touch-icon"]').attr('href'),
      $('link[rel="icon"][type="image/png"]').attr('href'),
      '/favicon-32x32.png',
      '/favicon-16x16.png',
      '/apple-touch-icon.png',
      '/favicon.png'
    ].filter(Boolean).map(url => new URL(url, website).href);

    let highestResFaviconUrl = null;
    for (const url of possibleFaviconUrls) {
      try {
        const response = await axios.head(url);
        if (response.status === 200) {
          highestResFaviconUrl = url;
          break;
        }
      } catch (error) {
        console.warn(`Favicon URL not found: ${url}`);
      }
    }

    if (highestResFaviconUrl) {
      const faviconPath = path.join(appDir, 'logo.png');
      try {
        await downloadImage(highestResFaviconUrl, faviconPath);
        app.logo = faviconPath;
      } catch (error) {
        console.warn(`Failed to download favicon from ${highestResFaviconUrl}:`, error.message);
      }
    }

    if (ogImageUrl) {
      const ogImagePath = path.join(appDir, 'og-image.png');
      try {
        await downloadImage(ogImageUrl, ogImagePath);
        app.images = [ogImagePath];
      } catch (error) {
        console.warn(`Failed to download og:image from ${ogImageUrl}:`, error.message);
      }
    }
  } catch (error) {
    console.error(`Failed to fetch assets for ${name}:`, error.message);
  }
}

async function generateMarkdown(apps) {
  const markdownDir = path.join(__dirname, '../data/products');
  fs.mkdirSync(markdownDir, { recursive: true });

  for (const app of apps) {
    try {
      console.log(`👉 Generating markdown for ${app.name}`);
      const tagsList = (categoryTags[app.category] || []).map(tag => `  - '${tag}'`).join('\n');
      const productName = sanitizeName(app.name);
      const imagePath = `/static/images/product/${productName}`;

      const markdownContent = `---
title: '${escapeQuotes(app.name)}'
date: '${new Date().toISOString().split('T')[0]}'
tags:
${tagsList}
images:
  - '${app.images ? `${imagePath}/og-image.png` : ''}'
logo: '${app.logo ? `${imagePath}/logo.png` : ''}'
summary: '${escapeQuotes(app.description)}'
category: '${escapeQuotes(app.category)}'
deal: '${escapeQuotes(app.deal)}'
subcategory: '${escapeQuotes(app.subcategory)}'
website: '${app.website}'
layout: PostLayout
---

## [${escapeQuotes(app.name)}](${app.website})

${escapeQuotes(app.name)} <br/>
${escapeQuotes(app.description)}

## Rare Deal

${escapeQuotes(app.deal)}
`;

      const markdownOutputPath = path.join(markdownDir, `${productName}.mdx`);
      fs.writeFileSync(markdownOutputPath, markdownContent);
    } catch (error) {
      console.error(`💥 Could not generate markdown for ${app.name}:`, error.message);
    }
  }
}

async function main() {
  const apps = await extractAppInfo();

  for (const app of apps) {
    await fetchAssets(app);
  }

  await generateMarkdown(apps);
}

main().catch(error => {
  console.error('Error:', error.message);
});
