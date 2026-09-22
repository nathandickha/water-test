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

const authSection = document.getElementById('builderAuth');
const dashboardSection = document.getElementById('builderDashboard');
const projectSection = document.getElementById('builderProject');
const authForm = document.getElementById('builderAuthForm');
const projectId = new URLSearchParams(location.search).get('project');
let dashboardPayload;
let projectPayload;
let verificationCooldownTimer;

function showNotice(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle('portal-hidden', !message);
  element.classList.toggle('is-error', isError);
}
function busy(button, active, label) {
  if (active) { button.dataset.label = button.textContent; button.textContent = label; button.disabled = true; }
  else { button.textContent = button.dataset.label || button.textContent; button.disabled = false; }
}
function label(value) { return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase()); }

function startVerificationCooldown() {
  const button = document.getElementById('builderSendCode');
  clearTimeout(verificationCooldownTimer);
  button.textContent = 'Code sent';
  button.disabled = true;
  verificationCooldownTimer = setTimeout(() => {
    button.textContent = 'Re-send code';
    button.disabled = false;
    verificationCooldownTimer = null;
  }, 30000);
}

async function claimBuilderAccess() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('claim_builder_access');
  if (error) throw error;
  if (!data?.builder_id) throw new Error('Your verified email is not attached to an active builder profile.');
  return data;
}

async function signedPreview(path) {
  if (!path) return '';
  const supabase = await getSupabase();
  const { data, error } = await supabase.storage.from('project-files').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

function safeFileName(name) {
  return String(name || 'attachment').replace(/[^a-z0-9._-]+/gi, '-').slice(-120);
}

async function uploadMessageAttachment(supabase, file, messageId) {
  if (!file?.size) return;
  validateAttachment(file);
  const path = `${projectPayload.project.id}/messages/${messageId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error:uploadError } = await supabase.storage.from('project-files').upload(path, file, { contentType:file.type || 'application/octet-stream' });
  if (uploadError) throw uploadError;
  const { error:recordError } = await supabase.from('attachments').insert({
    project_id:projectPayload.project.id,
    builder_id:projectPayload.builder.id,
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
    const url = await signedPreview(file.storage_path);
    return `<a class="portal-file-card" href="${escapeHtml(url)}" target="_blank" rel="noopener"><img src="${escapeHtml(url)}" alt="${escapeHtml(file.file_name)}"><span>${escapeHtml(file.file_name)}</span></a>`;
  }));
  document.getElementById('builderAccessImages').innerHTML = cards.length ? cards.join('') : '<p class="portal-empty">No site access images supplied.</p>';
}

async function renderBuilderMessages(messages, attachments = []) {
  const rendered = await Promise.all(messages.map(async message => {
    const files = attachments.filter(file => file.message_id === message.id);
    const links = await Promise.all(files.map(async file => `<a class="message-attachment" href="${escapeHtml(await signedPreview(file.storage_path))}" target="_blank" rel="noopener">📎 ${escapeHtml(file.file_name)}</a>`));
    return `<article class="portal-message ${message.sender_role === 'builder' ? 'is-mine' : ''}">${escapeHtml(message.body)}${links.join('')}<small>${escapeHtml(message.sender_name || message.sender_role)} · ${escapeHtml(formatDate(message.created_at))}</small></article>`;
  }));
  document.getElementById('builderMessages').innerHTML = rendered.length ? rendered.join('') : '<p class="portal-empty">No messages yet.</p>';
}

async function loadDashboard() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('get_builder_dashboard');
  if (error) throw error;
  dashboardPayload = data;
  if (!data?.builder) throw new Error('Your account is not attached to an active builder profile.');
  document.getElementById('builderName').textContent = data.builder.name;
  const invitationList = document.getElementById('builderInvitations');
  invitationList.innerHTML = data.invitations?.length ? data.invitations.map(item => `
    <article class="portal-list-item"><header><strong>${escapeHtml(item.project.project_number)} · ${escapeHtml(item.project.suburb)}, ${escapeHtml(item.project.state)}</strong><span class="portal-badge">${escapeHtml(label(item.status))}</span></header><p>${escapeHtml(item.project.summary)}</p><div class="portal-actions"><button class="btn btn-dark" data-invitation="${item.id}" data-response="accepted">Accept</button><button class="btn btn-light" data-invitation="${item.id}" data-response="declined">Decline</button></div></article>
  `).join('') : '<p class="portal-empty">No new invitations.</p>';
  document.getElementById('builderProjects').innerHTML = data.projects?.length ? data.projects.map(item => `
    <tr><td><strong>${escapeHtml(item.project_number)}</strong></td><td>${escapeHtml(item.suburb)}, ${escapeHtml(item.state)}</td><td>Version ${item.design_version_number}</td><td>${escapeHtml(label(item.invitation_status))}</td><td>${escapeHtml(label(item.quote_status || 'not started'))}</td><td><a class="btn btn-dark" href="index.html?project=${encodeURIComponent(item.project_id)}">Open</a></td></tr>
  `).join('') : '<tr><td colspan="6" class="portal-muted">No active projects.</td></tr>';
  authSection.hidden = true;
  dashboardSection.hidden = false;
  document.getElementById('builderSignOut').hidden = false;
  return data;
}

async function openBuilderWorkspace() {
  await claimBuilderAccess();
  const data = await loadDashboard();
  if (!projectId) return;
  if (data.projects?.some(item => item.project_id === projectId)) {
    await loadProject();
    return;
  }
  if (data.invitations?.some(item => item.project?.id === projectId)) {
    showNotice(document.getElementById('builderNotice'), 'Accept this invitation to open the client enquiry.');
    return;
  }
  throw new Error('This project is unavailable to your builder account.');
}

function renderQuoteLines(lines = []) {
  const body = document.getElementById('quoteLines');
  const source = lines.length ? lines : [
    { description:'Pool construction and finishes', quantity:1, unit:'item', unit_price:0 },
    { description:'Hydraulic and equipment package', quantity:1, unit:'item', unit_price:0 },
    { description:'Electrical, commissioning and handover', quantity:1, unit:'item', unit_price:0 }
  ];
  body.innerHTML = source.map(line => quoteRow(line)).join('');
  updateQuoteTotal();
}

function quoteRow(line = {}) {
  const quantity = Number(line.quantity ?? 1);
  const unitPrice = Number(line.unit_price ?? 0);
  return `<tr><td><input data-field="description" value="${escapeHtml(line.description || '')}" required maxlength="240"></td><td><input data-field="quantity" type="number" min="0.01" step="0.01" value="${quantity}" required></td><td><input data-field="unit" value="${escapeHtml(line.unit || 'item')}" required maxlength="30"></td><td><input data-field="unit_price" type="number" min="0" step="0.01" value="${unitPrice}" required></td><td data-line-total>${formatMoney(quantity * unitPrice)}</td><td><button type="button" aria-label="Remove line" data-remove-line>×</button></td></tr>`;
}

function quoteLines() {
  return [...document.querySelectorAll('#quoteLines tr')].map((row, index) => ({
    position:index + 1,
    description:row.querySelector('[data-field="description"]').value.trim(),
    quantity:Number(row.querySelector('[data-field="quantity"]').value),
    unit:row.querySelector('[data-field="unit"]').value.trim(),
    unit_price:Number(row.querySelector('[data-field="unit_price"]').value)
  }));
}

function updateQuoteTotal() {
  [...document.querySelectorAll('#quoteLines tr')].forEach(row => {
    const quantity = Number(row.querySelector('[data-field="quantity"]').value || 0);
    const price = Number(row.querySelector('[data-field="unit_price"]').value || 0);
    row.querySelector('[data-line-total]').textContent = formatMoney(quantity * price);
  });
  const subtotal = quoteLines().reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
  const taxRate = Number(document.getElementById('quoteForm').elements.taxRate.value || 0);
  document.getElementById('quoteTotal').textContent = formatMoney(subtotal * (1 + taxRate / 100));
}

async function loadProject() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('get_builder_project', { p_project_id:projectId });
  if (error) throw error;
  if (!data?.project) throw new Error('This project is unavailable or its invitation has not been accepted.');
  projectPayload = data;
  const { project, design, invitation, equipment = [], messages = [], attachments = [], quote } = data;
  document.getElementById('builderProjectNumber').textContent = project.project_number;
  document.getElementById('builderProjectTitle').textContent = `${project.contact_details.firstName || 'Client'} pool project`;
  document.getElementById('builderProjectAddress').textContent = [project.site_details.address, project.site_details.suburb, project.site_details.state, project.site_details.postcode].filter(Boolean).join(', ');
  document.getElementById('builderProjectStatus').textContent = label(invitation.status);
  document.getElementById('builderDesignVersion').textContent = `Design version ${design.version_number} · ${formatDate(design.created_at)}`;
  document.getElementById('quoteDesignNotice').textContent = `This quotation will be permanently linked to design version ${design.version_number}.`;
  document.getElementById('builderProjectPreview').src = await signedPreview(design.preview_path) || '../assets/images/hero-pool.webp';
  document.getElementById('builderSpecification').innerHTML = specificationRows(design.specification).map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
  await renderAccessImages(attachments);
  document.getElementById('builderEquipment').innerHTML = equipment.length ? equipment.map(item => `<li class="portal-list-item"><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.description || '')}</p></li>`).join('') : '<li class="portal-empty">No equipment selections.</li>';
  await renderBuilderMessages(messages, attachments);
  renderQuoteLines(quote?.currentVersion?.line_items || []);
  if (quote?.currentVersion?.valid_until) document.getElementById('quoteForm').elements.validUntil.value = quote.currentVersion.valid_until;
  document.getElementById('quoteForm').elements.notes.value = quote?.currentVersion?.notes || '';
  authSection.hidden = true;
  dashboardSection.hidden = true;
  projectSection.hidden = false;
  document.getElementById('builderSignOut').hidden = false;
}

document.getElementById('builderSendCode').addEventListener('click', async event => {
  const email = authForm.elements.email;
  if (!email.checkValidity()) return email.reportValidity();
  busy(event.currentTarget, true, 'Sending…');
  let sent = false;
  try {
    await sendEmailCode(email.value, location.pathname + location.search);
    sent = true;
    document.getElementById('builderCodeField').hidden = false;
    document.getElementById('builderVerifyCode').hidden = false;
    showNotice(document.getElementById('builderAuthNotice'), 'Verification code sent. Check your inbox and junk folder.');
    authForm.elements.code.focus();
  } catch (error) { showNotice(document.getElementById('builderAuthNotice'), readableError(error), true); }
  finally {
    if (sent) startVerificationCooldown();
    else busy(event.currentTarget, false);
  }
});

authForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('builderVerifyCode');
  busy(button, true, 'Opening…');
  try {
    await verifyEmailCode(authForm.elements.email.value, authForm.elements.code.value);
    await openBuilderWorkspace();
  } catch (error) { showNotice(document.getElementById('builderAuthNotice'), readableError(error), true); }
  finally { busy(button, false); }
});

document.getElementById('builderInvitations').addEventListener('click', async event => {
  const button = event.target.closest('[data-invitation]');
  if (!button) return;
  busy(button, true, 'Saving…');
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.rpc('respond_to_invitation', { p_invitation_id:button.dataset.invitation, p_response:button.dataset.response });
    if (error) throw error;
    await loadDashboard();
  } catch (error) { showNotice(document.getElementById('builderNotice'), readableError(error), true); busy(button, false); }
});

document.getElementById('quoteLines').addEventListener('input', updateQuoteTotal);
document.getElementById('quoteLines').addEventListener('click', event => {
  const button = event.target.closest('[data-remove-line]');
  if (!button) return;
  if (document.querySelectorAll('#quoteLines tr').length > 1) button.closest('tr').remove();
  updateQuoteTotal();
});
document.getElementById('addQuoteLine').addEventListener('click', () => {
  document.getElementById('quoteLines').insertAdjacentHTML('beforeend', quoteRow({ quantity:1, unit:'item', unit_price:0 }));
});
document.getElementById('quoteForm').elements.taxRate.addEventListener('input', updateQuoteTotal);

document.getElementById('quoteForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const lines = quoteLines();
  if (!lines.length || lines.some(line => !line.description || !line.unit || !(line.quantity > 0) || line.unit_price < 0)) return showNotice(document.getElementById('projectNotice'), 'Complete every quotation line.', true);
  if (!confirm('Submit this quotation to the homeowner? It will be locked as a new version.')) return;
  busy(button, true, 'Submitting…');
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.rpc('submit_quote', {
      p_project_id:projectPayload.project.id,
      p_design_version_id:projectPayload.design.id,
      p_valid_until:event.currentTarget.elements.validUntil.value,
      p_tax_rate:Number(event.currentTarget.elements.taxRate.value),
      p_notes:event.currentTarget.elements.notes.value.trim(),
      p_line_items:lines
    });
    if (error) throw error;
    showNotice(document.getElementById('projectNotice'), 'Quotation submitted successfully.');
    await loadProject();
  } catch (error) { showNotice(document.getElementById('projectNotice'), readableError(error), true); }
  finally { busy(button, false); }
});

document.getElementById('builderMessageForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  busy(button, true, 'Sending…');
  try {
    const supabase = await getSupabase();
    const formData = new FormData(event.currentTarget);
    const { data:message, error } = await supabase.from('messages').insert({
      project_id:projectPayload.project.id,
      builder_id:projectPayload.builder.id,
      body:String(formData.get('message') || '').trim()
    }).select('id').single();
    if (error) throw error;
    await uploadMessageAttachment(supabase, formData.get('attachment'), message.id);
    event.currentTarget.reset();
    await loadProject();
  } catch (error) { showNotice(document.getElementById('projectNotice'), readableError(error), true); }
  finally { busy(button, false); }
});

document.getElementById('builderSignOut').addEventListener('click', async () => { await signOut(); location.assign('index.html'); });

async function initialise() {
  const authNotice = document.getElementById('builderAuthNotice');
  if (!supabaseConfigured()) return showNotice(authNotice, 'Supabase has not been configured for this site yet.', true);
  try {
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getSession();
    if (data.session) await openBuilderWorkspace();
  } catch (error) { showNotice(authNotice, readableError(error), true); }
}
initialise();
