import { SUPABASE_CONFIG } from './supabase-config.js';

let clientPromise;

export function supabaseConfigured() {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_CONFIG.url)
    && !SUPABASE_CONFIG.url.includes('YOUR_PROJECT_REF')
    && SUPABASE_CONFIG.publishableKey
    && !SUPABASE_CONFIG.publishableKey.includes('YOUR_SUPABASE');
}

export async function getSupabase() {
  if (!supabaseConfigured()) {
    throw new Error('Supabase is not configured yet. Add the project URL and publishable key in assets/js/supabase-config.js.');
  }
  if (!clientPromise) {
    clientPromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
      .then(({ createClient }) => createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey, {
        auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
      }));
  }
  return clientPromise;
}

export async function sendEmailCode(email, redirectPath = location.pathname) {
  const supabase = await getSupabase();
  const emailRedirectTo = new URL(redirectPath, location.origin).toString();
  const { error } = await supabase.auth.signInWithOtp({
    email: String(email).trim().toLowerCase(),
    options: { shouldCreateUser:true, emailRedirectTo }
  });
  if (error) throw error;
}

export async function verifyEmailCode(email, token) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.verifyOtp({
    email: String(email).trim().toLowerCase(),
    token: String(token).trim(),
    type: 'email'
  });
  if (error) throw error;
  if (!data.user?.email_confirmed_at) throw new Error('Your email has not been verified.');
  return data;
}

export async function currentSession() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function dataUrlToBlob(dataUrl) {
  const [header, encoded] = String(dataUrl).split(',');
  if (!header || !encoded) throw new Error('The design preview is invalid.');
  const mime = header.match(/^data:([^;]+)/)?.[1] || 'application/octet-stream';
  const bytes = atob(encoded);
  const array = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) array[index] = bytes.charCodeAt(index);
  return new Blob([array], { type:mime });
}

export function validateAttachment(file) {
  if (!file?.size) return;
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain']);
  if (file.size > 26214400) throw new Error('Attachments must be 25 MB or smaller.');
  if (!allowed.has(file.type)) throw new Error('Attachments must be a JPG, PNG, WebP, PDF or text file.');
}

export function readableError(error) {
  const message = String(error?.message || error || 'Something went wrong.');
  if (/column reference ["'](?:portal_token|design_version_id|project_id)["'] is ambiguous/i.test(message)) {
    return 'The enquiry database update has not finished yet. Please try again shortly.';
  }
  if (/Failed to fetch/i.test(message)) return 'The secure service could not be reached. Check your connection and try again.';
  if (/email_address_not_authorized|email.*not authorized/i.test(message)) return 'Email delivery is not configured for this address. Configure custom SMTP in Supabase Auth, then try again.';
  if (/rate limit|over_email_send_rate_limit/i.test(message)) return 'Please wait before requesting another verification code.';
  return message.replace(/^Error:\s*/i, '');
}

export function formatMoney(value, currency = 'AUD') {
  return new Intl.NumberFormat('en-AU', { style:'currency', currency }).format(Number(value || 0));
}

export function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-AU', { dateStyle:'medium', timeStyle:value.includes?.('T') ? 'short' : undefined }).format(new Date(value));
}

export function escapeHtml(value) {
  const node = document.createElement('span');
  node.textContent = String(value ?? '');
  return node.innerHTML;
}

