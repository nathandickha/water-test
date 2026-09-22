# Pool Designer

Pool Designer is a static GitHub Pages website with an embedded Three.js pool designer and an optional Supabase project workflow.

The project workflow adds:

- a verified three-step homeowner enquiry;
- versioned 3D configuration, preview and specification records;
- postcode and distance-aware builder matching;
- a secure homeowner project portal;
- builder invitations, messaging and private attachments;
- design-linked, versioned quotations with line-by-line comparison;
- independent project, builder-invitation and quotation statuses;
- database activity records and queued email notifications;
- Row Level Security across every exposed project table and private storage object.

## Local preview

```bash
python -m http.server 8000
```

Open `http://localhost:8000`. The 3D designer remains usable without Supabase. Enquiries and portals show a clear setup message until the Supabase client configuration is provided.

## Supabase

See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for database migration, authentication, storage, notification and builder-onboarding steps. Only the public project URL and publishable key belong in `assets/js/supabase-config.js`; service-role and email-provider secrets must remain in Supabase.

## Validation

```bash
npm run check
```

The existing `pool-designer-app` and its Three.js modelling logic are preserved. The outer designer requests an authoritative state snapshot and a pixel-copy preview only when an enquiry draft is saved.
