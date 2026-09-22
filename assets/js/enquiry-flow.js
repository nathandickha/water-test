import {
  currentSession,
  dataUrlToBlob,
  escapeHtml,
  getSupabase,
  readableError,
  sendEmailCode,
  supabaseConfigured,
  validateAttachment,
  verifyEmailCode
} from './supabase-client.js';
import {
  OPTIONAL_EQUIPMENT,
  STANDARD_EQUIPMENT,
  buildSpecification,
  designDependentEquipment,
  specificationRows
} from './project-model.js';
import { ADDRESS_AUTOCOMPLETE_CONFIG } from './address-autocomplete-config.js';

const dialog = document.getElementById('enquiryDialog');
const form = document.getElementById('enquiryForm');
if (!dialog || !form) throw new Error('The enquiry form could not be initialised.');

const alertBox = document.getElementById('enquiryAlert');
const alertMessage = document.getElementById('enquiryAlertMessage');
const existingEnquiryActions = document.getElementById('existingEnquiryActions');
const openExistingEnquiryLink = document.getElementById('openExistingEnquiry');
const emailExistingEnquiryLinkButton = document.getElementById('emailExistingEnquiryLink');
const backButton = document.getElementById('enquiryBack');
const nextButton = document.getElementById('enquiryNext');
const submitButton = document.getElementById('enquirySubmit');
const saveState = document.getElementById('enquirySaveState');
const builderResults = document.getElementById('builderResults');
const sendVerificationButton = document.getElementById('sendVerification');
const verifyEmailButton = document.getElementById('verifyEmail');
const verificationCodeField = document.getElementById('verificationCodeField');
const verificationHelp = document.getElementById('verificationHelp');
const addressInput = form.elements.address;
const useCurrentLocationButton = document.getElementById('useCurrentLocation');
const locationHelp = document.getElementById('locationHelp');
const accessImageInput = form.elements.accessImages;
const accessImageList = document.getElementById('accessImageList');

let step = 1;
let verifiedEmail = '';
let submissionPackage = null;
let specification = null;
let draftProjectId = null;
let draftPortalToken = null;
let designVersionId = null;
let blockedByActiveProject = false;
let activeProjectMode = false;
const resumeToken = new URLSearchParams(location.search).get('project');
const builders = new Map();
let builderSearchTimer = null;
let builderSearchSequence = 0;
let lastBuilderSearchKey = '';
let siteCoordinates = { latitude:null, longitude:null, source:null };
let verificationCooldownTimer = null;
const uploadedAccessImageKeys = new Set();

function setAlert(message = '', isError = false, showExistingEnquiryActions = false) {
  alertBox.hidden = !message;
  alertBox.classList.toggle('is-error', isError);
  alertMessage.textContent = message;
  existingEnquiryActions.hidden = !showExistingEnquiryActions;
}

function projectPortalPath() {
  return `../project/index.html?token=${encodeURIComponent(draftPortalToken || '')}`;
}

function showExistingProjectAlert(message = 'You already have an active enquiry. Continue in your project portal.') {
  if (!draftPortalToken) {
    setAlert('Your active enquiry was found, but its project link is unavailable. Please contact support.', true);
    return;
  }
  openExistingEnquiryLink.href = projectPortalPath();
  form.classList.add('has-existing-enquiry');
  document.getElementById('enquiryTitle').textContent = 'Continue your existing enquiry';
  setAlert(message, false, true);
}

function setBusy(button, busy, busyLabel) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

function accessImageFiles() {
  return [...(accessImageInput?.files || [])];
}

function accessImageKey(file) {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function renderAccessImages() {
  const files = accessImageFiles();
  accessImageList.innerHTML = files.map(file => `<span class="access-image-chip"><b>${escapeHtml(file.name)}</b><span>${(file.size / 1048576).toFixed(1)} MB</span></span>`).join('');
}

function validateAccessImages() {
  const files = accessImageFiles();
  if (files.length > 8) throw new Error('Upload no more than eight site access photos.');
  files.forEach(file => {
    validateAttachment(file);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Site access photos must be JPG, PNG or WebP images.');
  });
}

function clearVerificationCooldown(label = 'Send code') {
  clearTimeout(verificationCooldownTimer);
  verificationCooldownTimer = null;
  sendVerificationButton.textContent = label;
  sendVerificationButton.disabled = false;
}

function startVerificationCooldown() {
  clearTimeout(verificationCooldownTimer);
  sendVerificationButton.textContent = 'Code sent';
  sendVerificationButton.disabled = true;
  verificationCooldownTimer = setTimeout(() => {
    sendVerificationButton.textContent = 'Re-send code';
    sendVerificationButton.disabled = false;
    verificationCooldownTimer = null;
  }, 30000);
}

function normaliseAustralianState(value = '') {
  const states = {
    'New South Wales':'NSW', Victoria:'VIC', Queensland:'QLD',
    'South Australia':'SA', 'Western Australia':'WA', Tasmania:'TAS',
    'Australian Capital Territory':'ACT', 'Northern Territory':'NT'
  };
  const state = String(value).trim();
  return states[state] || state.toUpperCase();
}

function addressComponent(place, type, shortName = false) {
  const component = place.address_components?.find(item => item.types.includes(type));
  return component ? component[shortName ? 'short_name' : 'long_name'] : '';
}

async function initialiseAddressAutocomplete() {
  const apiKey = String(ADDRESS_AUTOCOMPLETE_CONFIG.googleMapsApiKey || '').trim();
  if (!apiKey) return;
  await new Promise((resolve, reject) => {
    if (window.google?.maps?.places) return resolve();
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly`;
    script.async = true;
    script.onerror = () => reject(new Error('Address suggestions could not be loaded. You can still enter the address manually.'));
    script.onload = resolve;
    document.head.append(script);
  });
  const autocomplete = new window.google.maps.places.Autocomplete(addressInput, {
    componentRestrictions:{ country:'au' },
    fields:['address_components', 'formatted_address', 'geometry'],
    types:['address']
  });
  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    const streetNumber = addressComponent(place, 'street_number');
    const route = addressComponent(place, 'route');
    const suburb = addressComponent(place, 'locality') || addressComponent(place, 'postal_town') || addressComponent(place, 'sublocality_level_1');
    const state = normaliseAustralianState(addressComponent(place, 'administrative_area_level_1', true));
    const postcode = addressComponent(place, 'postal_code');
    const latitude = place.geometry?.location?.lat?.();
    const longitude = place.geometry?.location?.lng?.();
    siteCoordinates = {
      latitude:Number.isFinite(latitude) ? latitude : null,
      longitude:Number.isFinite(longitude) ? longitude : null,
      source:Number.isFinite(latitude) && Number.isFinite(longitude) ? 'google_places' : null
    };
    addressInput.value = [streetNumber, route].filter(Boolean).join(' ') || place.formatted_address || addressInput.value;
    form.elements.suburb.value = suburb;
    if ([...form.elements.state.options].some(option => option.value === state)) form.elements.state.value = state;
    form.elements.postcode.value = postcode;
    form.elements.suburb.dispatchEvent(new Event('input', { bubbles:true }));
    form.elements.postcode.dispatchEvent(new Event('input', { bubbles:true }));
    if (siteCoordinates.source) locationHelp.textContent = 'Address location saved. Builders will be ordered by distance.';
  });
}

function useCurrentLocation() {
  if (!navigator.geolocation) {
    setAlert('This browser does not provide location access. Enter your site address instead.', true);
    return;
  }
  setBusy(useCurrentLocationButton, true, 'Finding location…');
  navigator.geolocation.getCurrentPosition(position => {
    siteCoordinates = {
      latitude:position.coords.latitude,
      longitude:position.coords.longitude,
      source:'browser_geolocation'
    };
    locationHelp.textContent = 'Current location saved. Builders will be ordered by distance.';
    setBusy(useCurrentLocationButton, false);
    setAlert('Location found. Enter the site suburb and postcode if they are not already filled in.');
    queueBuilderSearch();
  }, error => {
    setBusy(useCurrentLocationButton, false);
    const message = error.code === error.PERMISSION_DENIED
      ? 'Location access was not allowed. Enter the site address instead.'
      : 'Your location could not be found. Enter the site address instead.';
    setAlert(message, true);
  }, { enableHighAccuracy:false, timeout:10000, maximumAge:300000 });
}

function renderEquipment() {
  document.getElementById('standardEquipment').innerHTML = STANDARD_EQUIPMENT.map(item => `
    <div class="equipment-card is-included"><span><strong>${item.name}</strong><small>${item.description}</small></span></div>
  `).join('');
  document.getElementById('optionalEquipment').innerHTML = OPTIONAL_EQUIPMENT.map(item => `
    <label class="equipment-card"><input type="checkbox" name="equipment" value="${item.code}"><span><strong>${item.name}</strong><small>${item.description}</small></span></label>
  `).join('');
  const dependent = designDependentEquipment(submissionPackage?.configuration);
  document.getElementById('designEquipment').innerHTML = dependent.length ? dependent.map(item => `
    <div class="equipment-card is-required"><span><strong>${item.name}</strong><small>${item.description}</small></span></div>
  `).join('') : '<p class="empty-state">No additional equipment is required by the current design.</p>';
}

function selectedEquipment() {
  const optionalCodes = new Set([...form.querySelectorAll('input[name="equipment"]:checked')].map(input => input.value));
  return [
    ...STANDARD_EQUIPMENT.map(item => ({ ...item, source:'standard', selected:true })),
    ...OPTIONAL_EQUIPMENT.filter(item => optionalCodes.has(item.code)).map(item => ({ ...item, source:'optional', selected:true })),
    ...designDependentEquipment(submissionPackage?.configuration).map(item => ({ ...item, source:'design_required', selected:true }))
  ];
}

function selectedBuilderIds() {
  return [...builders.entries()].filter(([, item]) => item.selected).map(([id]) => id);
}

function renderBuilderCards() {
  const entries = [...builders.values()].sort((left, right) => Number(right.existing) - Number(left.existing));
  const remaining = Math.max(0, 3 - entries.filter(item => item.selected).length);
  const updateHelp = activeProjectMode
    ? `<p class="empty-state">Already invited builders will receive this variation. You can add ${remaining} more builder${remaining === 1 ? '' : 's'}.</p>`
    : '';
  builderResults.innerHTML = updateHelp + entries.map(item => `
    <label class="builder-card${item.existing ? ' is-existing' : ''}">
      <input type="checkbox" value="${item.builder_id}"${item.selected ? ' checked' : ''}${item.existing ? ' disabled' : ''}>
      <strong>${escapeHtml(item.builder_name)}</strong>
      ${item.existing
        ? `<span>Already invited</span><small>${escapeHtml(String(item.invitation_status || 'invited').replaceAll('_', ' '))}</small>`
        : `<span>${escapeHtml(item.suburb || '')}${item.state ? `, ${escapeHtml(item.state)}` : ''}</span>
           ${item.registration_number ? `<span>Licence / registration ${escapeHtml(item.registration_number)}</span>` : ''}
           <small>${item.distance_km == null ? 'Verified builder listing' : `${Number(item.distance_km).toFixed(1)} km away`}</small>`}
    </label>
  `).join('');
  builderResults.querySelectorAll('input:not(:disabled)').forEach(input => input.addEventListener('change', () => {
    if (input.checked && selectedBuilderIds().length >= 3) {
      input.checked = false;
      setAlert('Choose no more than three builders in total.', true);
      return;
    }
    builders.get(input.value).selected = input.checked;
    setAlert('');
    renderBuilderCards();
  }));
}

function formValue(name) {
  return String(new FormData(form).get(name) || '').trim();
}

function contactDetails() {
  return {
    firstName:formValue('firstName'),
    lastName:formValue('lastName'),
    email:formValue('email').toLowerCase(),
    phone:formValue('phone')
  };
}

function siteDetails() {
  return {
    address:formValue('address'),
    suburb:formValue('suburb'),
    state:formValue('state'),
    postcode:formValue('postcode'),
    targetStart:formValue('targetStart'),
    latitude:siteCoordinates.latitude,
    longitude:siteCoordinates.longitude,
    coordinateSource:siteCoordinates.source
  };
}

function safeFileName(name) {
  return String(name || 'site-access-image').replace(/[^a-z0-9._-]+/gi, '-').slice(-120);
}

async function uploadAccessImages(supabase) {
  validateAccessImages();
  for (const file of accessImageFiles()) {
    const key = accessImageKey(file);
    if (uploadedAccessImageKeys.has(key)) continue;
    const storagePath = `${draftProjectId}/site-access/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error:uploadError } = await supabase.storage.from('project-files').upload(storagePath, file, {
      contentType:file.type,
      upsert:false
    });
    if (uploadError) throw uploadError;
    const { error:recordError } = await supabase.from('attachments').insert({
      project_id:draftProjectId,
      builder_id:null,
      message_id:null,
      storage_path:storagePath,
      file_name:file.name,
      mime_type:file.type,
      size_bytes:file.size
    });
    if (recordError) throw recordError;
    uploadedAccessImageKeys.add(key);
  }
}

function validatePanel(panelStep) {
  const panel = form.querySelector(`[data-enquiry-step="${panelStep}"]`);
  const invalid = [...panel.querySelectorAll('input,select,textarea')].find(control => !control.checkValidity());
  if (invalid) {
    invalid.reportValidity();
    invalid.focus();
    return false;
  }
  return true;
}

function showStep(nextStep) {
  step = nextStep;
  form.querySelectorAll('[data-enquiry-step]').forEach(panel => {
    const active = Number(panel.dataset.enquiryStep) === step;
    panel.hidden = !active;
    panel.classList.toggle('is-active', active);
  });
  form.querySelectorAll('[data-step-indicator]').forEach(item => {
    const itemStep = Number(item.dataset.stepIndicator);
    item.classList.toggle('is-active', itemStep === step);
    item.classList.toggle('is-complete', itemStep < step);
  });
  backButton.hidden = step === 1;
  nextButton.hidden = step === 3;
  submitButton.hidden = step !== 3;
  setAlert('');
  form.querySelector('.enquiry-panel.is-active')?.scrollTo?.(0, 0);
}

function syncOpenButtons() {
  const usable = !!window.isDesignerReady?.() && !!window.getDesignerState?.()?.pool?.shape;
  document.querySelectorAll('.js-enquiry-open').forEach(button => { button.disabled = !usable; });
}

async function openEnquiry() {
  if (!window.isDesignerReady?.()) {
    setAlert('Choose a starter pool and wait for the 3D designer to load.', true);
    return;
  }
  dialog.showModal();
  setAlert('Preparing your current 3D design…');
  try {
    submissionPackage = await window.requestDesignerSubmissionPackage();
    specification = buildSpecification(submissionPackage.configuration);
    renderEquipment();
    queueBuilderSearch();
    setAlert(supabaseConfigured() ? '' : 'The enquiry interface is ready, but the Supabase project URL and publishable key still need to be configured.', true);
  } catch (error) {
    setAlert(readableError(error), true);
  }
}

function builderLocation() {
  const postcode = formValue('postcode');
  const suburb = formValue('suburb');
  const state = formValue('state').toUpperCase();
  return {
    postcode,
    suburb,
    state,
    latitude:siteCoordinates.latitude,
    longitude:siteCoordinates.longitude,
    ready:(/^[0-9]{4}$/.test(postcode) && suburb.length >= 2) || (siteCoordinates.latitude != null && siteCoordinates.longitude != null),
    key:`${postcode}|${suburb.toLowerCase()}|${state}|${siteCoordinates.latitude ?? ''}|${siteCoordinates.longitude ?? ''}`
  };
}

function resetBuilderResults(message = 'Enter your suburb and four-digit postcode, or use your current location, to find nearby builders.') {
  builderSearchSequence += 1;
  lastBuilderSearchKey = '';
  if (activeProjectMode) {
    for (const [id, item] of builders) if (!item.existing) builders.delete(id);
    renderBuilderCards();
    return;
  }
  builders.clear();
  builderResults.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
}

async function findBuilders(location = builderLocation()) {
  if (!location.ready) return;
  const requestSequence = ++builderSearchSequence;
  const selectedBuilderIdsBeforeSearch = location.key === lastBuilderSearchKey
    ? new Set(selectedBuilderIds())
    : new Set([...builders.values()].filter(item => item.existing).map(item => item.builder_id));
  const existingBuilders = [...builders.values()].filter(item => item.existing);
  builderResults.innerHTML = '<p class="empty-state">Finding nearby builders…</p>';
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('find_matching_builders', {
    p_postcode:location.postcode,
    p_suburb:location.suburb,
    p_state:location.state,
    p_latitude:location.latitude,
    p_longitude:location.longitude,
    p_limit:12
  });
  if (error) throw error;
  if (requestSequence !== builderSearchSequence) return;
  lastBuilderSearchKey = location.key;
  builders.clear();
  existingBuilders.forEach(item => builders.set(item.builder_id, item));
  (data || []).forEach(item => {
    const existing = builders.get(item.builder_id);
    builders.set(item.builder_id, existing || {
      ...item,
      selected:selectedBuilderIdsBeforeSearch.has(item.builder_id),
      existing:false
    });
  });
  if (!builders.size) {
    builderResults.innerHTML = '<p class="empty-state">No registered builders with usable location details were found. Contact My Pool Designer so we can help allocate your enquiry.</p>';
    return;
  }
  renderBuilderCards();
}

function queueBuilderSearch() {
  clearTimeout(builderSearchTimer);
  const location = builderLocation();
  if (!location.ready) {
    resetBuilderResults();
    return;
  }
  if (location.key !== lastBuilderSearchKey) builders.clear();
  builderResults.innerHTML = '<p class="empty-state">Finding nearby builders…</p>';
  builderSearchTimer = setTimeout(() => {
    findBuilders(location).catch(error => {
      if (location.key !== builderLocation().key) return;
      console.error(error);
      const setupIncomplete = /find_matching_builders|schema cache|PGRST202/i.test(String(error?.message || error));
      const message = setupIncomplete
        ? 'The builder directory has not been deployed to the secure service yet.'
        : 'Builder matching is temporarily unavailable. Please try again.';
      resetBuilderResults(message);
      setAlert(message, true);
    });
  }, 350);
}

function renderExistingBuilders(invitations = []) {
  builders.clear();
  invitations.forEach(item => builders.set(item.builder.id, {
    builder_id:item.builder.id,
    builder_name:item.builder.name,
    suburb:'',
    state:'',
    selected:true,
    existing:true,
    invitation_status:item.status
  }));
  renderBuilderCards();
}

async function resumeActiveProject(session) {
  if (!resumeToken || !session?.user?.email) return;
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('get_project_portal', { p_portal_token:resumeToken });
  if (error) throw error;
  if (!data?.project || !data?.design?.configuration) throw new Error('This saved project is unavailable.');
  activeProjectMode = true;
  draftProjectId = data.project.id;
  draftPortalToken = resumeToken;
  verifiedEmail = session.user.email.toLowerCase();
  const contact = data.project.contact_details || {};
  const site = data.project.site_details || {};
  if (site.latitude != null && site.longitude != null && Number.isFinite(Number(site.latitude)) && Number.isFinite(Number(site.longitude))) {
    siteCoordinates = {
      latitude:Number(site.latitude),
      longitude:Number(site.longitude),
      source:site.coordinateSource || 'saved_project'
    };
  }
  for (const [name, value] of Object.entries({
    firstName:contact.firstName,
    lastName:contact.lastName,
    email:contact.email || session.user.email,
    phone:contact.phone,
    address:site.address,
    suburb:site.suburb,
    state:site.state,
    postcode:site.postcode,
    targetStart:site.targetStart,
    notes:data.project.notes
  })) {
    if (form.elements[name]) form.elements[name].value = value || '';
  }
  form.elements.email.readOnly = true;
  document.getElementById('emailVerification').classList.add('is-verified');
  verificationHelp.textContent = 'Signed in with the verified project email.';
  sendVerificationButton.hidden = true;
  verificationCodeField.hidden = true;
  verifyEmailButton.hidden = true;
  renderExistingBuilders(data.invitations || []);
  (data.equipment || []).filter(item => item.source === 'optional').forEach(item => {
    const input = form.querySelector(`input[name="equipment"][value="${CSS.escape(item.code)}"]`);
    if (input) input.checked = true;
  });
  document.getElementById('enquiryTitle').textContent = 'Save a new version of your project design';
  document.querySelectorAll('.js-enquiry-open').forEach(button => { button.textContent = 'Update project'; });
  submitButton.textContent = 'Save new design version';
  saveState.textContent = `Editing ${data.project.project_number}`;
  window.loadDesignerConfiguration(data.design.configuration);
  queueBuilderSearch();
}

async function checkActiveProject() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('get_active_project');
  if (error) throw error;
  const active = Array.isArray(data) ? data[0] : data;
  if (!active) return true;
  if (active.status === 'draft') {
    draftProjectId = active.project_id;
    draftPortalToken = active.portal_token;
    saveState.textContent = 'Existing draft found';
    return true;
  }
  blockedByActiveProject = true;
  draftPortalToken = active.portal_token;
  showExistingProjectAlert();
  return false;
}

async function saveDraft() {
  if (!verifiedEmail || verifiedEmail !== formValue('email').toLowerCase()) throw new Error('Verify the email address shown in the form before continuing.');
  if (!submissionPackage) submissionPackage = await window.requestDesignerSubmissionPackage();
  specification = buildSpecification(submissionPackage.configuration);
  const supabase = await getSupabase();
  saveState.textContent = 'Saving securely…';
  const { data, error } = await supabase.rpc('save_enquiry_draft', {
    p_project_id:draftProjectId,
    p_contact_details:contactDetails(),
    p_site_details:siteDetails(),
    p_configuration:submissionPackage.configuration,
    p_specification:specification,
    p_equipment:selectedEquipment(),
    p_notes:formValue('notes')
  });
  if (error) throw error;
  const saved = Array.isArray(data) ? data[0] : data;
  draftProjectId = saved.project_id;
  draftPortalToken = saved.portal_token;
  designVersionId = saved.design_version_id;

  if (submissionPackage.previewDataUrl && designVersionId) {
    const previewPath = `${draftProjectId}/designs/${designVersionId}/preview.jpg`;
    const { error:uploadError } = await supabase.storage.from('project-files').upload(
      previewPath,
      dataUrlToBlob(submissionPackage.previewDataUrl),
      { contentType:'image/jpeg', upsert:true }
    );
    if (uploadError) throw uploadError;
    const { error:updateError } = await supabase.from('design_versions').update({ preview_path:previewPath }).eq('id', designVersionId);
    if (updateError) throw updateError;
  }
  if (accessImageFiles().length) {
    saveState.textContent = 'Uploading access photos…';
    await uploadAccessImages(supabase);
  }
  saveState.textContent = 'Draft saved';
  return saved;
}

async function saveNewDesignVersion() {
  submissionPackage = await window.requestDesignerSubmissionPackage();
  specification = buildSpecification(submissionPackage.configuration);
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('create_design_version_with_builders', {
    p_project_id:draftProjectId,
    p_configuration:submissionPackage.configuration,
    p_specification:specification,
    p_equipment:selectedEquipment(),
    p_change_summary:'Homeowner enquiry variation',
    p_builder_ids:selectedBuilderIds()
  });
  if (error) throw error;
  const saved = Array.isArray(data) ? data[0] : data;
  const previewPath = `${draftProjectId}/designs/${saved.design_version_id}/preview.jpg`;
  const { error:uploadError } = await supabase.storage.from('project-files').upload(
    previewPath,
    dataUrlToBlob(submissionPackage.previewDataUrl),
    { contentType:'image/jpeg', upsert:true }
  );
  if (uploadError) throw uploadError;
  const { error:updateError } = await supabase.from('design_versions').update({ preview_path:previewPath }).eq('id', saved.design_version_id);
  if (updateError) throw updateError;
  if (accessImageFiles().length) await uploadAccessImages(supabase);
  return saved;
}

function renderReview() {
  document.getElementById('enquiryPreview').src = submissionPackage.previewDataUrl;
  document.getElementById('reviewSpecification').innerHTML = specificationRows(specification).map(([name, value]) =>
    `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd></div>`
  ).join('');
  document.getElementById('reviewBuilders').innerHTML = selectedBuilderIds().map(id => `<li>${escapeHtml(builders.get(id).builder_name)}</li>`).join('');
  document.getElementById('reviewEquipment').innerHTML = selectedEquipment().map(item => `<li>${escapeHtml(item.name)}</li>`).join('');
  document.getElementById('reviewAccessImages').innerHTML = accessImageFiles().length
    ? accessImageFiles().map(file => `<li>${escapeHtml(file.name)}</li>`).join('')
    : '<li>No access photos added.</li>';
}

sendVerificationButton.addEventListener('click', async () => {
  const email = form.elements.email;
  if (!email.checkValidity()) return email.reportValidity();
  setBusy(sendVerificationButton, true, 'Sending…');
  let sent = false;
  try {
    await sendEmailCode(email.value, location.pathname + location.search);
    sent = true;
    verificationCodeField.hidden = false;
    verifyEmailButton.hidden = false;
    verificationHelp.textContent = 'Enter the six-digit code sent to your inbox.';
    setAlert('Code request accepted. Check your inbox and junk folder.');
    form.elements.verificationCode.focus();
  } catch (error) {
    setAlert(readableError(error), true);
  } finally {
    if (sent) startVerificationCooldown();
    else setBusy(sendVerificationButton, false);
  }
});

emailExistingEnquiryLinkButton.addEventListener('click', async () => {
  if (!blockedByActiveProject || !draftPortalToken || !verifiedEmail) {
    setAlert('Verify your project email before requesting a secure link.', true, true);
    return;
  }
  setBusy(emailExistingEnquiryLinkButton, true, 'Sending…');
  try {
    await sendEmailCode(verifiedEmail, projectPortalPath());
    setAlert('Secure sign-in link sent. Check your inbox and junk folder.', false, true);
  } catch (error) {
    setAlert(readableError(error), true, true);
  } finally {
    setBusy(emailExistingEnquiryLinkButton, false);
  }
});

verifyEmailButton.addEventListener('click', async () => {
  const email = form.elements.email;
  const code = form.elements.verificationCode;
  if (!email.checkValidity()) return email.reportValidity();
  if (!code.checkValidity()) return code.reportValidity();
  setBusy(verifyEmailButton, true, 'Verifying…');
  try {
    const auth = await verifyEmailCode(email.value, code.value);
    verifiedEmail = auth.user.email.toLowerCase();
    const canContinue = await checkActiveProject();
    if (!canContinue) return;
    document.getElementById('emailVerification').classList.add('is-verified');
    verificationHelp.textContent = 'Email verified. Your draft can now be saved securely.';
    clearTimeout(verificationCooldownTimer);
    sendVerificationButton.hidden = true;
    verificationCodeField.hidden = true;
    verifyEmailButton.hidden = true;
    queueBuilderSearch();
    setAlert(draftProjectId ? 'Email verified. Your existing draft will be updated.' : 'Email verified. You can now continue after choosing your builders.');
  } catch (error) {
    setAlert(readableError(error), true);
  } finally {
    setBusy(verifyEmailButton, false);
  }
});

form.elements.email.addEventListener('input', () => {
  const changed = !verifiedEmail || formValue('email').toLowerCase() !== verifiedEmail;
  if (changed) {
    verifiedEmail = '';
    document.getElementById('emailVerification').classList.remove('is-verified');
    sendVerificationButton.hidden = false;
    verificationCodeField.hidden = true;
    verifyEmailButton.hidden = true;
    form.elements.verificationCode.value = '';
    clearVerificationCooldown();
    verificationHelp.textContent = 'Email changed. Verify the new address before continuing.';
  }
});

accessImageInput.addEventListener('change', () => {
  try {
    validateAccessImages();
    renderAccessImages();
    setAlert('');
  } catch (error) {
    accessImageInput.value = '';
    renderAccessImages();
    setAlert(readableError(error), true);
  }
});

form.elements.suburb.addEventListener('input', queueBuilderSearch);
form.elements.postcode.addEventListener('input', queueBuilderSearch);
useCurrentLocationButton?.addEventListener('click', useCurrentLocation);

nextButton.addEventListener('click', async () => {
  if (step === 1) {
    if (!validatePanel(1)) return;
    if (!verifiedEmail || verifiedEmail !== formValue('email').toLowerCase()) return setAlert('Verify your email before continuing.', true);
    if (blockedByActiveProject) return setAlert('Open your active project instead of starting another enquiry.', true);
    const chosen = selectedBuilderIds();
    if (chosen.length < 1 || chosen.length > 3) return setAlert('Choose between one and three builders.', true);
    setBusy(nextButton, true, 'Saving…');
    try {
      if (!activeProjectMode) await saveDraft();
      showStep(2);
    } catch (error) {
      saveState.textContent = draftProjectId ? 'Draft update failed' : 'Draft not saved';
      setAlert(readableError(error), true);
    } finally {
      setBusy(nextButton, false);
    }
    return;
  }
  if (step === 2) {
    setBusy(nextButton, true, 'Preparing…');
    try {
      submissionPackage = await window.requestDesignerSubmissionPackage();
      specification = buildSpecification(submissionPackage.configuration);
      if (!activeProjectMode) await saveDraft();
      renderReview();
      showStep(3);
    } catch (error) {
      saveState.textContent = draftProjectId ? 'Draft update failed' : 'Draft not saved';
      setAlert(readableError(error), true);
    } finally {
      setBusy(nextButton, false);
    }
  }
});

backButton.addEventListener('click', () => showStep(Math.max(1, step - 1)));

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!validatePanel(3)) return;
  setBusy(submitButton, true, 'Submitting…');
  try {
    if (activeProjectMode) {
      await saveNewDesignVersion();
      saveState.textContent = 'New design version saved';
      location.assign(`../project/index.html?token=${encodeURIComponent(draftPortalToken)}`);
      return;
    }
    await saveDraft();
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc('submit_enquiry', {
      p_project_id:draftProjectId,
      p_builder_ids:selectedBuilderIds()
    });
    if (error) throw error;
    const submitted = Array.isArray(data) ? data[0] : data;
    saveState.textContent = 'Enquiry submitted';
    location.assign(`../project/index.html?token=${encodeURIComponent(submitted.portal_token || draftPortalToken)}`);
  } catch (error) {
    setAlert(readableError(error), true);
    setBusy(submitButton, false);
  }
});

document.querySelectorAll('.js-enquiry-open').forEach(button => button.addEventListener('click', openEnquiry));
document.getElementById('closeEnquiry').addEventListener('click', () => dialog.close());
dialog.addEventListener('cancel', event => {
  if (saveState.textContent === 'Saving securely…') event.preventDefault();
});
window.addEventListener('pool-designer:designer-state', syncOpenButtons);
window.addEventListener('load', async () => {
  syncOpenButtons();
  initialiseAddressAutocomplete().catch(error => {
    console.error(error);
    setAlert(readableError(error), true);
  });
  if (!supabaseConfigured()) {
    if (resumeToken) {
      dialog.showModal();
      setAlert('The project portal is not connected until Supabase is configured.', true);
    }
    return;
  }
  try {
    const session = await currentSession();
    if (session?.user?.email) form.elements.email.value = session.user.email;
    await resumeActiveProject(session);
  } catch (error) {
    console.error(error);
    if (resumeToken) {
      dialog.showModal();
      setAlert(readableError(error), true);
    }
  }
});
renderEquipment();
