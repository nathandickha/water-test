import { access } from 'node:fs/promises';
import path from 'node:path';

const requiredPaths = [
  'index.html',
  'pool-designer/index.html',
  'project/index.html',
  'builder/index.html',
  'assets/js/enquiry-flow.js',
  'assets/js/supabase-client.js',
  'supabase/functions/send-project-notification/index.ts',
  'supabase/migrations/202608300001_enquiry_quotation_schema.sql'
];

for (const relative of requiredPaths) {
  await access(path.join(process.cwd(), relative));
}

console.log(`Project structure validated (${requiredPaths.length} required paths).`);

