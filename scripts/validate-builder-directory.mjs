import { readFile } from 'node:fs/promises';

const directories = [
  { file:'victorian-pool-builders.json', jurisdiction:'VIC', expected:204, registration:/^CDB-L\s+\d+$/, registry:'https://bams.vba.vic.gov.au/' },
  { file:'nsw-pool-builders.json', jurisdiction:'NSW', expected:488, registration:/^\d+C?$/, registry:'https://verify.licence.nsw.gov.au/' }
];

const registrations = new Set();
for (const directory of directories) {
  const builders = JSON.parse(await readFile(new URL(`../supabase/data/${directory.file}`, import.meta.url), 'utf8'));
  if (builders.length !== directory.expected) throw new Error(`${directory.jurisdiction}: expected ${directory.expected}, received ${builders.length}.`);
  let coordinates = 0;
  let emails = 0;
  for (const builder of builders) {
    if (builder.jurisdiction !== directory.jurisdiction) throw new Error(`${builder.name} is assigned to the wrong directory.`);
    if (builder.status !== 'Current') throw new Error(`${builder.name} is not current.`);
    if (!directory.registration.test(builder.registration_number)) throw new Error(`Invalid registration number for ${builder.name}.`);
    const key = `${builder.jurisdiction}|${builder.registration_number}`;
    if (registrations.has(key)) throw new Error(`Duplicate registration ${key}.`);
    registrations.add(key);
    if (!builder.registry_url?.startsWith(directory.registry)) throw new Error(`Missing official registry URL for ${builder.name}.`);
    if (builder.email) {
      emails += 1;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(builder.email)) throw new Error(`Invalid published email for ${builder.name}.`);
    }
    if (builder.latitude != null || builder.longitude != null) {
      coordinates += 1;
      if (!(builder.latitude >= -44 && builder.latitude <= -10 && builder.longitude >= 112 && builder.longitude <= 154)) {
        throw new Error(`Coordinates are outside Australia for ${builder.name}.`);
      }
    }
  }
  if (directory.jurisdiction === 'VIC' && (coordinates !== 183 || emails !== 98)) throw new Error(`VIC evidence totals changed: ${coordinates} located, ${emails} email.`);
  if (directory.jurisdiction === 'NSW' && coordinates !== builders.length) throw new Error(`NSW: expected all ${builders.length} builders to have coordinates, received ${coordinates}.`);
  console.log(`${directory.jurisdiction} builder directory validated: ${builders.length} current, ${coordinates} located, ${emails} with published email.`);
}

const stateImports = { ACT:[12,3], NSW:[167,68], NT:[6,0], QLD:[106,20], SA:[18,5], TAS:[3,0], VIC:[193,184], WA:[22,0] };
const importIds = new Set();
for (const [jurisdiction, [expectedRows, expectedEligible]] of Object.entries(stateImports)) {
  const rows = JSON.parse(await readFile(new URL(`../supabase/data/state-imports/${jurisdiction.toLowerCase()}-pool-builders.json`, import.meta.url), 'utf8'));
  if (rows.length !== expectedRows) throw new Error(`${jurisdiction} import: expected ${expectedRows}, received ${rows.length}.`);
  let eligible = 0;
  for (const row of rows) {
    if (row.jurisdiction !== jurisdiction || row.state !== jurisdiction) throw new Error(`${row.name} is in the wrong state import.`);
    if (importIds.has(row.id)) throw new Error(`Duplicate imported id ${row.id}.`);
    importIds.add(row.id);
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) throw new Error(`Invalid imported email for ${row.name}.`);
    if (row.active) {
      eligible += 1;
      if (!row.eligible_for_matching || !row.verified || !row.registration_number) throw new Error(`${row.name} is active without sufficient licence evidence.`);
      if (['VIC', 'NSW'].includes(jurisdiction) && !row.matched_official_directory) throw new Error(`${row.name} bypasses the official ${jurisdiction} directory.`);
    }
  }
  if (eligible !== expectedEligible) throw new Error(`${jurisdiction} import: expected ${expectedEligible} eligible rows, received ${eligible}.`);
  console.log(`${jurisdiction} CSV import validated: ${rows.length} stored, ${eligible} eligible for matching.`);
}

