# Supabase setup

This repository contains the frontend, database migrations, Row Level Security policies, private storage rules and notification Edge Function for the Pool Designer enquiry and quotation workflow. A Supabase project must be provisioned before the live GitHub Pages site can store enquiries.

## 1. Create and link the project

Create a Supabase project in the Australian region appropriate for your users, install the Supabase CLI, then link this repository to the project:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The migrations create all project tables, RPCs, status types, private helper functions, RLS policies and the private `project-files` storage bucket.

## 2. Configure passwordless email verification

The observed `POST /auth/v1/otp` HTTP 500 is an Auth email-delivery failure. The
request reaches project `uigioamqtgfgjtamxelp`, and the frontend supplies the
expected production redirect. The Supabase Email Templates screen reports
`Set up custom SMTP to edit templates`, which proves the project is still using
the restricted default mail service. That service refuses public recipients who
are not members of the Supabase project team.

In **Authentication → Emails → SMTP Settings**, enable custom SMTP. For Resend,
use these values after verifying the sending domain:

- Sender name: `Poolly`
- Sender email: a verified address on your authentication subdomain, such as `login@auth.your-domain.example`
- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend`
- Password: the Resend API key (store it only in the Supabase dashboard)

Then, in Authentication settings:

1. Set the Site URL to the production GitHub Pages origin.
2. Add the designer, client portal and builder dashboard URLs to the allowed redirect URLs.
3. Set the Magic Link subject to `Open your Poolly project`, then copy the complete contents of `supabase/templates/magic-link-otp.html` into the hosted project's Magic Link template. It intentionally contains both `{{ .ConfirmationURL }}` for the secure project button and `{{ .Token }}` as the six-digit fallback.
4. Save the SMTP settings and send a fresh code to a non-team email address. If it still fails, open the matching Auth log entry and confirm that the SMTP provider accepted the sender and credentials.

The enquiry button shows `Code sent` for 30 seconds, then changes to `Re-send code`. Configure the Supabase email OTP rate limit to allow that interval, or increase the frontend interval to match the stricter backend setting. A successful browser request only means Supabase accepted it; delivery still requires the OTP template and SMTP provider above.

The browser calls `signInWithOtp`, then verifies the entered code with `verifyOtp({ type: 'email' })`. Draft creation also checks `auth.users.email_confirmed_at` inside PostgreSQL, so bypassing the browser does not bypass verification.

### Authentication email deliverability

Inbox placement cannot be guaranteed, but the production sender should meet all of the following before launch:

- Verify a dedicated authentication subdomain in Resend, for example `auth.poolly.example`, and send from an address on that exact domain.
- Publish the Resend-provided SPF and DKIM records, then add a valid DMARC record. Confirm that the visible From domain aligns with SPF or DKIM.
- Use the same sender name and address in Supabase custom SMTP for every authentication email. Do not use the Supabase default mail service in production.
- Configure a custom Supabase Auth domain on a Poolly-owned subdomain so authentication links do not point at a shared `supabase.co` hostname.
- Keep Resend open and click tracking disabled for authentication email. Tracking rewrites links and can make sign-in mail look suspicious.
- Keep authentication traffic separate from marketing traffic and avoid sudden volume spikes on a new domain.
- Review Resend Deliverability Insights, bounces, complaints and suppressions. Do not repeatedly send to invalid or complaining recipients.
- Test Gmail, Outlook and Yahoo inbox placement after every DNS or template change. DNS authentication improves delivery but does not override each mailbox provider's reputation filters.

## 3. Configure the static frontend

Copy the project URL and publishable key from Supabase project settings into:

```js
// assets/js/supabase-config.js
export const SUPABASE_CONFIG = Object.freeze({
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  publishableKey: 'YOUR_PUBLISHABLE_KEY'
});
```

The live project URL and publishable key are already present in this repository. The publishable key is designed for browser use and is constrained by RLS. Never use a secret key or service-role key in this repository or in GitHub Pages.

Builder matching is public and runs as soon as a valid suburb and four-digit postcode are entered. Email verification is still required before an enquiry can be saved or submitted. Run every migration through `202608310002_security_hardening.sql`. The hardening migration ensures an invited builder sees only the invitation summary until they accept, isolates builder-specific messages/attachments/quotes, and restricts private Storage reads to the matching design or attachment record.

For address suggestions, create a browser-restricted Google Maps Platform key, enable the Places API, and place the key in `assets/js/address-autocomplete-config.js`. Restrict it to the production and local review origins. Address suggestions remain disabled when the key is blank, so typed street addresses are never sent to a third party without deliberate configuration.

## 4. VIC and NSW builder directories and location matching

Migration `202609010001_victorian_builder_directory.sql` imports the 204 current
Victorian company registrations for construction of swimming pools and spas.
Migration `202609010002_state_builder_directories.sql` separates the VIC and NSW
directories, imports 488 current NSW organisation licences, and adds NSW postcode
centroids. Typed addresses are matched only to builders licensed in the selected
state, then ranked by
distance even when browser location and Google Places are unavailable.

Migration `202609010003_national_builder_csv_import.sql` incorporates the eight
state and territory CSV research lists, expands state-aware postcode matching
nationwide, and safely stages records that still require a direct licence check.
Verified records with a supplied licence/registration can participate in ACT,
QLD and SA matching; unverified NT, TAS and WA records remain inactive until
their licence evidence is completed.

The browser asks for location only when the homeowner presses **Use my current
location**. Choosing a Google Places suggestion also stores its coordinates.
Otherwise the entered postcode centroid is used. The nearest 12 current,
verified companies are shown and the homeowner can select up to three. A
builder may decline after claiming its account.

The first user who signs in with the exact published builder email is linked to
that builder record automatically. Enquiries selected before a builder account
is claimed are added to `builder_contact_queue`; an administrator must verify
the contact and invite the builder. This deliberately avoids treating public
directory email addresses as consent for bulk automated email. No email address
in the dataset was guessed.

Before a directory refresh, recheck current status against the Building and
Plumbing Commission practitioner register. Source notes are stored in
`supabase/data/README.md`.

Homeowners must select one to three active, verified builders before submitting. A unique partial index enforces one non-closed enquiry per client account.

## 5. Deploy email notifications

The database queues notification rows whenever project activity is created. Deploy the Edge Function and keep its secrets server-side:

```bash
supabase functions deploy send-project-notification --no-verify-jwt
supabase secrets set DATABASE_WEBHOOK_SECRET="GENERATE_A_LONG_RANDOM_VALUE"
supabase secrets set RESEND_API_KEY="YOUR_RESEND_API_KEY"
supabase secrets set NOTIFICATION_FROM_EMAIL="Pool Designer <projects@your-domain.example>"
supabase secrets set SITE_URL="https://nathandickha.github.io/D6.5"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied to deployed Edge Functions by Supabase.

Before applying migration `202609080005`, store the same webhook secret in
Supabase Vault under the name `project_notification_webhook_secret`. The migration
enables `pg_net`, grants the Edge Function's service role only the table access it
needs, and installs an `INSERT` trigger for `enquiry_submitted` activity. The
trigger calls:

- URL: the deployed `send-project-notification` function URL
- Header: `x-pool-designer-webhook-secret: <the same DATABASE_WEBHOOK_SECRET>`

For temporary testing without a domain, Resend permits
`My Pool Designer <onboarding@resend.dev>` as `NOTIFICATION_FROM_EMAIL`, but it
can deliver only to the email address that owns the Resend account. A verified
sending domain is required before enquiries can be delivered to unrelated
builder email addresses. A personal Gmail address cannot be used as the From
address through Resend.

The function sends account notifications to registered users and sends new-enquiry emails directly to the public business email stored on directory-only builder records. Directory delivery is atomically claimed to prevent duplicate sends, records attempts and provider errors, and marks successful queue entries as `contacted` with `delivery_status = 'sent'`.

## 6. Security checks before launch

- Confirm every table in the Supabase Table Editor shows RLS enabled.
- Confirm the `project-files` bucket is private.
- Test with four separate accounts: homeowner, invited-but-not-accepted builder, accepted builder and unrelated builder.
- Verify an invited-but-not-accepted builder can see the invitation summary but cannot query project/design/specification/message/quote/file data directly.
- Verify an unrelated account cannot call either portal RPC for another project.
- Verify two accepted builders on the same project cannot read each other's messages, message attachments or quotation rows.
- Verify an accepted builder can read shared site-access images and the current design preview, but not arbitrary objects elsewhere in the project's Storage folder.
- Verify a homeowner cannot accept a quotation tied to an older design version.
- Configure CAPTCHA and Auth rate limits before public promotion.
- Review privacy, retention and deletion requirements with an Australian privacy adviser.

## Workflow summary

1. The homeowner verifies their email and saves a draft containing the complete 3D JSON, generated specification, equipment selections and a private preview.
2. Submission atomically invites one to three builders and creates the activity/notification trail.
3. A builder accepts or declines independently, then messages the homeowner and submits an immutable quote version tied to the current design version.
4. The homeowner compares itemised quotes and can accept only a current-design quotation.
5. A later design version makes older quotations visibly outdated and ineligible for acceptance.
