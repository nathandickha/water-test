import {
  escapeHtml,
  formatDate,
  formatMoney,
  getSupabase,
  readableError,
  sendEmailCode,
  signOut,
  supabaseConfigured,
  validateAttachment,
  verifyEmailCode
} from './supabase-client.js';
import { specificationRows } from './project-model.js';

const token = new URLSearchParams(location.search).get('token');
const authSection = document.getElementById('portalAuth');
const contentSection = document.getElementById('portalContent');
const authForm = document.getElementById('portalAuthForm');
const authNotice = document.getElementById('portalAuthNotice');
const notice = document.getElementById('portalNotice');
let payload;

function showNotice(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle('portal-hidden', !message);
  element.classList.toggle('is-error', isError);
}

function buttonBusy(button, busy, label) {
  if (busy) { button.dataset.label = button.textContent; button.textContent = label; button.disabled = true; }
  else { button.textContent = button.dataset.label || button.textContent; button.disabled = false; }
}

function statusLabel(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

async function previewUrl(path) {
  if (!path) return '';
  const supabase = await getSupabase();
  const { data, error } = await supabase.storage.from('project-files').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

function safeFileName(name) {
  return String(name || 'attachment').replace(/[^a-z0-9._-]+/gi, '-').slice(-120);
}

async function uploadMessageAttachment(supabase, file, messageId, builderId) {
  if (!file?.size) return;
  validateAttachment(file);
  const path = `${payload.project.id}/messages/${messageId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error:uploadError } = await supabase.storage.from('project-files').upload(path, file, { contentType:file.type || 'application/octet-stream' });
  if (uploadError) throw uploadError;
  const { error:recordError } = await supabase.from('attachments').insert({
    project_id:payload.project.id,
    builder_id:builderId,
    message_id:messageId,
    storage_path:path,
    file_name:file.name,
    mime_type:file.type || 'application/octet-stream',
    size_bytes:file.size
  });
  if (recordError) throw recordError;
}

async function renderAccessImages(attachments = []) {
  const files = attachments.filter(file => !file.message_id && String(file.mime_type || '').startsWith('image/'));
  const cards = await Promise.all(files.map(async file => {
    const url = await previewUrl(file.storage_path);
    return `<a class="portal-file-card" href="${escapeHtml(url)}" target="_blank" rel="noopener"><img src="${escapeHtml(url)}" alt="${escapeHtml(file.file_name)}"><span>${escapeHtml(file.file_name)}</span></a>`;
  }));
  document.getElementById('projectAccessImages').innerHTML = cards.length ? cards.join('') : '<p class="portal-empty">No site access images supplied.</p>';
}

function quoteActionCell(invitation) {
  const quote = invitation.quote;
  if (!quote?.currentVersion) return '<span class="portal-muted">Awaiting quote</span>';
  if (quote.status === 'accepted') return '<span class="portal-badge">Accepted</span>';
  if (quote.status !== 'submitted') return `<span class="portal-muted">${escapeHtml(statusLabel(quote.status))}</span>`;
  return `<button class="btn btn-dark" type="button" data-accept-quote="${quote.currentVersion.id}">Accept quote</button>`;
}

async function renderPortal(nextPayload) {
  payload = nextPayload;
  const { project, design, invitations = [], messages = [], attachments = [], activity = [] } = payload;
  document.getElementById('projectNumber').textContent = project.project_number || '';
  document.getElementById('projectTitle').textContent = `${project.contact_details?.firstName || 'Your'} pool project`;
  document.getElementById('projectAddress').textContent = [project.site_details?.address, project.site_details?.suburb, project.site_details?.state, project.site_details?.postcode].filter(Boolean).join(', ');
  document.getElementById('projectStatus').textContent = statusLabel(project.status);
  document.getElementById('designVersion').textContent = design ? `Design version ${design.version_number} · saved ${formatDate(design.created_at)}` : 'No design version';
  document.getElementById('editProjectDesign').href = `../pool-designer/index.html?project=${encodeURIComponent(token)}`;
  const preview = document.getElementById('projectPreview');
  const signedPreview = await previewUrl(design?.preview_path);
  preview.src = signedPreview || '../assets/images/hero-pool.webp';
  document.getElementById('projectSpecification').innerHTML = specificationRows(design?.specification || {}).map(([key, value]) =>
    `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`
  ).join('');
  await renderAccessImages(attachments);

  document.getElementById('builderResponseRows').innerHTML = invitations.length ? invitations.map(invitation => {
    const version = invitation.quote?.currentVersion;
    return `<tr><td><strong>${escapeHtml(invitation.builder.name)}</strong></td><td>${escapeHtml(statusLabel(invitation.status))}</td><td>${version ? `Version ${version.version_number} · design v${version.design_version_number}` : '—'}</td><td>${version ? formatMoney(version.total, version.currency) : '—'}</td><td>${quoteActionCell(invitation)}</td></tr>`;
  }).join('') : '<tr><td colspan="5" class="portal-muted">No builders have been invited.</td></tr>';
  const comparable = invitations.filter(item => item.quote?.currentVersion);
  document.getElementById('quoteComparison').innerHTML = comparable.length ? comparable.map(item => {
    const quote = item.quote;
    const version = quote.currentVersion;
    const currentDesign = Number(version.design_version_number) === Number(design.version_number);
    return `<article class="quote-comparison-card">
      <header><div><strong>${escapeHtml(item.builder.name)}</strong><span>Quote v${version.version_number} · Design v${version.design_version_number}</span></div><b>${formatMoney(version.total, version.currency)}</b></header>
      ${currentDesign ? '' : '<p class="portal-notice is-error">This quote is linked to an older design and cannot be accepted until the builder reprices the current version.</p>'}
      <div class="portal-table-wrap"><table class="portal-table"><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>
        ${version.line_items.map(line => `<tr><td>${escapeHtml(line.description)}</td><td>${escapeHtml(line.quantity)} ${escapeHtml(line.unit)}</td><td>${formatMoney(line.unit_price, version.currency)}</td><td>${formatMoney(line.amount, version.currency)}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="portal-muted">Subtotal ${formatMoney(version.subtotal, version.currency)} · Tax ${formatMoney(version.tax_amount, version.currency)} · Valid until ${escapeHtml(formatDate(version.valid_until))}</p>
      ${version.notes ? `<p>${escapeHtml(version.notes)}</p>` : ''}
      ${currentDesign && quote.status === 'submitted' ? `<button class="btn btn-dark" type="button" data-accept-quote="${version.id}">Accept this quotation</button>` : ''}
    </article>`;
  }).join('') : '<p class="portal-empty">Submitted quotations will appear here for line-by-line comparison.</p>';

  const builderSelect = document.getElementById('messageBuilder');
  builderSelect.innerHTML = invitations.map(item => `<option value="${item.builder.id}">${escapeHtml(item.builder.name)}</option>`).join('');
  await renderMessages(messages, attachments);
  document.getElementById('projectActivity').innerHTML = activity.length ? activity.map(item =>
    `<li class="portal-list-item"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail || '')}</p><p>${escapeHtml(formatDate(item.created_at))}</p></li>`
  ).join('') : '<li class="portal-empty">No activity yet.</li>';
  authSection.hidden = true;
  contentSection.hidden = false;
  document.getElementById('portalSignOut').hidden = false;
}

async function renderMessages(messages, attachments = []) {
  const builderId = document.getElementById('messageBuilder').value;
  const list = document.getElementById('clientMessages');
  const selected = messages.filter(message => message.builder_id === builderId);
  const rendered = await Promise.all(selected.map(async message => {
    const files = attachments.filter(file => file.message_id === message.id);
    const links = await Promise.all(files.map(async file => `<a class="message-attachment" href="${escapeHtml(await previewUrl(file.storage_path))}" target="_blank" rel="noopener">📎 ${escapeHtml(file.file_name)}</a>`));
    return `<article class="portal-message ${message.sender_role === 'client' ? 'is-mine' : ''}">${escapeHtml(message.body)}${links.join('')}<small>${escapeHtml(message.sender_name || message.sender_role)} · ${escapeHtml(formatDate(message.created_at))}</small></article>`;
  }));
  list.innerHTML = rendered.length ? rendered.join('') : '<p class="portal-empty">No messages with this builder yet.</p>';
  list.scrollTop = list.scrollHeight;
}

async function loadPortal() {
  if (!token) throw new Error('This project link is incomplete.');
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('get_project_portal', { p_portal_token:token });
  if (error) throw error;
  if (!data) throw new Error('This project could not be found or you do not have access.');
  await renderPortal(data);
}

document.getElementById('portalSendCode').addEventListener('click', async event => {
  const email = authForm.elements.email;
  if (!email.checkValidity()) return email.reportValidity();
  buttonBusy(event.currentTarget, true, 'Sending…');
  try {
    await sendEmailCode(email.value, location.pathname + location.search);
    document.getElementById('portalCodeField').hidden = false;
    document.getElementById('portalVerifyCode').hidden = false;
    showNotice(authNotice, 'Verification code sent. Check your inbox and junk folder.');
    authForm.elements.code.focus();
  } catch (error) {
    showNotice(authNotice, readableError(error), true);
  } finally {
    buttonBusy(event.currentTarget, false);
  }
});

authForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('portalVerifyCode');
  buttonBusy(button, true, 'Opening…');
  try {
    await verifyEmailCode(authForm.elements.email.value, authForm.elements.code.value);
    await loadPortal();
  } catch (error) {
    showNotice(authNotice, readableError(error), true);
  } finally {
    buttonBusy(button, false);
  }
});

document.getElementById('messageBuilder').addEventListener('change', () => renderMessages(payload.messages || [], payload.attachments || []));

document.getElementById('clientMessageForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  buttonBusy(button, true, 'Sending…');
  try {
    const supabase = await getSupabase();
    const builderId = document.getElementById('messageBuilder').value;
    const formData = new FormData(form);
    const { data:message, error } = await supabase.from('messages').insert({
      project_id:payload.project.id,
      builder_id:builderId,
      body:String(formData.get('message') || '').trim()
    }).select('id').single();
    if (error) throw error;
    await uploadMessageAttachment(supabase, formData.get('attachment'), message.id, builderId);
    form.reset();
    await loadPortal();
  } catch (error) {
    showNotice(notice, readableError(error), true);
  } finally {
    buttonBusy(button, false);
  }
});

async function handleQuoteAcceptance(event) {
  const button = event.target.closest('[data-accept-quote]');
  if (!button) return;
  if (!confirm('Accept this quotation? Other submitted quotations will be declined.')) return;
  buttonBusy(button, true, 'Accepting…');
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.rpc('accept_quote', { p_quote_version_id:button.dataset.acceptQuote });
    if (error) throw error;
    showNotice(notice, 'Quotation accepted. The builder has been notified.');
    await loadPortal();
  } catch (error) {
    showNotice(notice, readableError(error), true);
    buttonBusy(button, false);
  }
}
document.getElementById('builderResponseRows').addEventListener('click', handleQuoteAcceptance);
document.getElementById('quoteComparison').addEventListener('click', handleQuoteAcceptance);

document.getElementById('portalSignOut').addEventListener('click', async () => { await signOut(); location.reload(); });

async function initialise() {
  if (!supabaseConfigured()) return showNotice(authNotice, 'Supabase has not been configured for this site yet.', true);
  if (!token) return showNotice(authNotice, 'This project link is incomplete.', true);
  try {
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getSession();
    if (data.session) await loadPortal();
  } catch (error) {
    showNotice(authNotice, readableError(error), true);
  }
}
initialise();
