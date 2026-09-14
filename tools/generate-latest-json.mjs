import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const VERSION = '1.2.2';
const REPOSITORY = 'voidnont/Frxe-Desktop';
const TAG = `v${VERSION}`;
const dir = resolve(process.argv[2] || 'release-upload');
const assetBase = `https://github.com/${REPOSITORY}/releases/download/${TAG}`;

const files = {
  windows: 'Frxe-Desktop-1.2.2-x64.msi',
  windowsSig: 'Frxe-Desktop-1.2.2-x64.msi.sig',
  linux: 'Frxe-Desktop-1.2.2-x86_64.AppImage',
  linuxSig: 'Frxe-Desktop-1.2.2-x86_64.AppImage.sig',
  macArm: 'Frxe-Desktop-1.2.2-macos-arm64.app.tar.gz',
  macArmSig: 'Frxe-Desktop-1.2.2-macos-arm64.app.tar.gz.sig',
  macX64: 'Frxe-Desktop-1.2.2-macos-x64.app.tar.gz',
  macX64Sig: 'Frxe-Desktop-1.2.2-macos-x64.app.tar.gz.sig',
};

for (const name of Object.values(files)) {
  await access(resolve(dir, name)).catch(() => {
    throw new Error(`Required updater artifact is missing: ${name}`);
  });
}

async function signature(name) {
  const value = (await readFile(resolve(dir, name), 'utf8')).trim();
  if (!value) throw new Error(`Updater signature is empty: ${name}`);
  return value;
}

const pubDate = process.env.FRXE_PUB_DATE || new Date().toISOString();
const notes = process.env.FRXE_RELEASE_NOTES || 'Frxe Desktop 1.2.2';

const latest = {
  version: VERSION,
  notes,
  pub_date: pubDate,
  platforms: {
    'windows-x86_64': {
      signature: await signature(files.windowsSig),
      url: `${assetBase}/${files.windows}`,
    },
    'linux-x86_64': {
      signature: await signature(files.linuxSig),
      url: `${assetBase}/${files.linux}`,
    },
    'darwin-aarch64': {
      signature: await signature(files.macArmSig),
      url: `${assetBase}/${files.macArm}`,
    },
    'darwin-x86_64': {
      signature: await signature(files.macX64Sig),
      url: `${assetBase}/${files.macX64}`,
    },
  },
};

const output = resolve(dir, 'latest.json');
await writeFile(output, `${JSON.stringify(latest, null, 2)}\n`, 'utf8');
console.log(output);
