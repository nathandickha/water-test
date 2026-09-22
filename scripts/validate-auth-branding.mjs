import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const preservedTemplate = 'supabase/templates/magic-link-otp.html';
const preservedTemplateHash = 'e62b0e2ba8c63ac06426c2266eaea298add5817201539cb3c6919eb02b3ece5e';
const textExtensions = new Set([
  '.css', '.html', '.htm', '.js', '.json', '.jsx', '.md', '.mjs', '.cjs',
  '.scss', '.sql', '.toml', '.ts', '.tsx', '.txt', '.xml', '.yaml', '.yml'
]);
const ignoredDirectories = new Set(['.git', 'build', 'dist', 'node_modules']);

async function collectFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolute));
    else if (entry.isFile() && textExtensions.has(path.extname(entry.name).toLowerCase())) files.push(absolute);
  }
  return files;
}

const templateSource = await readFile(path.join(root, preservedTemplate), 'utf8');
const templateHash = createHash('sha256').update(templateSource.replaceAll('\r\n', '\n')).digest('hex');
if (templateHash !== preservedTemplateHash) {
  throw new Error(`The preserved email template changed (expected ${preservedTemplateHash}, received ${templateHash}).`);
}
if (!templateSource.includes('{{ .ConfirmationURL }}') || !templateSource.includes('{{ .Token }}')) {
  throw new Error('The auth email must include both the secure sign-in link and six-digit OTP fallback.');
}

const files = await collectFiles(root);
const brandingFailures = [];
for (const absolute of files) {
  const relative = path.relative(root, absolute).replaceAll('\\', '/');
  if (relative === preservedTemplate) continue;
  const source = await readFile(absolute, 'utf8');
  if (/at[e]lier(?:[\s_-]*3d)?/i.test(source)) brandingFailures.push(relative);
  if (/https:\/\/nathandickha\.github\.io\/D6\.5\/?index\.html/i.test(source)) brandingFailures.push(`${relative} (legacy branding link)`);
}
if (brandingFailures.length) {
  throw new Error(`Legacy branding remains in: ${[...new Set(brandingFailures)].join(', ')}`);
}

const supabaseClient = await readFile(path.join(root, 'assets/js/supabase-client.js'), 'utf8');
const supabaseConfig = await readFile(path.join(root, 'assets/js/supabase-config.js'), 'utf8');
const enquiryFlow = await readFile(path.join(root, 'assets/js/enquiry-flow.js'), 'utf8');
const designerPage = await readFile(path.join(root, 'pool-designer/index.html'), 'utf8');
for (const [label, pattern, source] of [
  ['live Supabase project URL', /https:\/\/[a-z0-9-]+\.supabase\.co/i, supabaseConfig],
  ['public publishable key', /sb_publishable_[A-Za-z0-9_-]+/, supabaseConfig],
  ['OTP request', /auth\.signInWithOtp\s*\(/, supabaseClient],
  ['origin-safe redirect URL', /new URL\(redirectPath,\s*location\.origin\)/, supabaseClient],
  ['email redirect option', /emailRedirectTo/, supabaseClient],
  ['email OTP verification', /auth\.verifyOtp\s*\(/, supabaseClient],
  ['email OTP type', /type:\s*['"]email['"]/, supabaseClient],
  ['existing enquiry portal action', /id=["']openExistingEnquiry["']/, designerPage],
  ['secure-link email action', /id=["']emailExistingEnquiryLink["']/, designerPage],
  ['project-specific auth redirect', /sendEmailCode\(verifiedEmail,\s*projectPortalPath\(\)\)/, enquiryFlow]
]) {
  if (!pattern.test(source)) throw new Error(`Missing expected ${label}.`);
}

console.log('Auth configuration, existing-enquiry access, redirect handling, branding sweep, and email template validated.');

