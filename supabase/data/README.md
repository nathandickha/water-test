# Pool builder directories

The directories are separated by the jurisdiction that issued the registration
or licence:

- `victorian-pool-builders.json`: 204 current Victorian company registrations
  for “Domestic Builder - Limited to construction of swimming pools and spas”.
- `nsw-pool-builders.json`: 488 current NSW organisation contractor licences
  for “Swimming Pool Builder”.

The NSW list was checked on 1 September 2026 against the current-only NSW Verify
Licence public register. The search was partitioned by licence-number prefix to
avoid the register's 200-result display/export limit, filtered by exact licence
number prefix, and de-duplicated by official licence ID. Individuals are not
included, matching the existing business-directory scope used for VIC.

Sources and provenance:

- VIC registration details: Building and Plumbing Commission practitioner
  register.
- NSW licence details and public coordinates: NSW Verify Licence public
  register.
- Published business email, phone, website and some trading addresses: SPASA
  public member directory, only where a strong company-name match was found. No
  email address was guessed.
- Fallback coordinates: G-NAF-derived locality/postcode centroids from
  `joelkoen/postcodes-au`.

The matching migrations import records idempotently by jurisdiction and
registration number. Recheck current status before every future refresh. Public
contact details are directory data, not permission to send bulk marketing.

## State CSV research imports

`state-imports/` contains the eight user-supplied state and territory CSV files
converted to typed JSON while preserving their source evidence and status notes:

- ACT: 12 rows
- NSW: 167 rows
- NT: 6 rows
- QLD: 106 rows
- SA: 18 rows
- TAS: 3 rows
- VIC: 193 rows
- WA: 22 rows

These 527 research records are imported by
`202609010003_national_builder_csv_import.sql`. Exact registration-number or
normalised-name matches enrich the official VIC/NSW records without replacing
their legal names or official status. Unmatched VIC/NSW research rows are staged
inactive. In other jurisdictions, a record becomes available to nearby matching
only when the supplied data marks it verified and includes a licence or
registration number. All other supplied records remain stored but inactive until
their licence is checked directly.
