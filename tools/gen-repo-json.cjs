#!/usr/bin/env node

// Generates repo.json (the webOS Homebrew Repository manifest) and the
// release-asset manifest from the IPK in the current working directory.
// Expects REPO_NAME and TAG_NAME in the environment so metadata tracks
// the release being published rather than whatever is checked out.

const fs = require('fs');
const crypto = require('crypto');

const APP_ID = 'com.cobalt.youtube.adfree';
const TITLE = 'YouTube Cobalt AdFree';
const DESCRIPTION =
  'Cobalt-based YouTube client for webOS with ad blocking and SponsorBlock support.';

const repoName = process.env.REPO_NAME;
const tagName = process.env.TAG_NAME;

if (!repoName || !tagName) {
  console.error('REPO_NAME and TAG_NAME env vars required');
  process.exit(1);
}

const version = tagName.replace(/^v/, '');
const ipkFile = `${APP_ID}_${version}_arm.ipk`;
if (!fs.existsSync(ipkFile)) {
  console.error(`IPK file not found in cwd: ${ipkFile}`);
  process.exit(1);
}

const sha256 = crypto
  .createHash('sha256')
  .update(fs.readFileSync(ipkFile))
  .digest('hex');

const iconUri = `https://raw.githubusercontent.com/${repoName}/main/assets/largeIcon.png`;

const manifest = {
  id: APP_ID,
  version,
  type: 'web',
  title: TITLE,
  appDescription: DESCRIPTION,
  iconUri,
  sourceUrl: `https://github.com/${repoName}`,
  rootRequired: false,
  ipkHash: { sha256 }
};

// The release-asset manifest uses a relative ipkUrl (webosbrew convention);
// repo.json needs the absolute release download URL.
fs.writeFileSync(
  `${APP_ID}.manifest.json`,
  JSON.stringify({ ...manifest, ipkUrl: ipkFile }, null, 2) + '\n'
);

const ipkUrl = `https://github.com/${repoName}/releases/download/${tagName}/${ipkFile}`;
const repoData = {
  paging: { page: 1, count: 1, maxPage: 1, itemsTotal: 1 },
  packages: [
    {
      id: APP_ID,
      title: TITLE,
      description: DESCRIPTION,
      iconUri,
      manifest: { ...manifest, ipkUrl }
    }
  ]
};
fs.writeFileSync('repo.json', JSON.stringify(repoData, null, 2) + '\n');

console.log(`repo.json + ${APP_ID}.manifest.json generated for ${tagName} (sha256 ${sha256})`);
