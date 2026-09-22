(() => {
  const frame = document.getElementById('pool-designer-frame');
  const loading = document.getElementById('designerLoading');
  const error = document.getElementById('designerError');
  const status = document.getElementById('controlStatus');
  const controls = document.getElementById('designerControls');
  const accordion = document.getElementById('designerAccordion');
  const targetOrigin = window.location.origin;
  let ready = false;
  let loadAttempted = false;
  let loadFailureTimer = 0;
  let state = {};
  let submissionRequest = null;

  function sendDesignerCommand(type, payload = {}) {
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage({ source: 'pool-designer-controls', type, payload }, targetOrigin);
  }
  window.sendDesignerCommand = sendDesignerCommand;
  window.getDesignerState = () => JSON.parse(JSON.stringify(state || {}));
  window.isDesignerReady = () => ready;
  window.loadDesignerConfiguration = configuration => {
    sendDesignerCommand('LOAD_DESIGN_STATE', { configuration });
  };
  window.requestDesignerSubmissionPackage = () => {
    if (!ready) return Promise.reject(new Error('Choose a starter pool and wait for the designer to finish loading.'));
    if (submissionRequest) return submissionRequest.promise;
    let resolveRequest;
    let rejectRequest;
    const timeout = window.setTimeout(() => {
      submissionRequest = null;
      rejectRequest(new Error('The 3D preview took too long to prepare. Please try again.'));
    }, 15000);
    const promise = new Promise((resolve, reject) => { resolveRequest = resolve; rejectRequest = reject; });
    submissionRequest = { promise, resolve:resolveRequest, reject:rejectRequest, timeout };
    sendDesignerCommand('REQUEST_SUBMISSION_PACKAGE');
    return promise;
  };

  function numericPayload(group) {
    const payload = {};
    document.querySelectorAll(`[data-group="${group}"]`).forEach(input => payload[input.dataset.key] = Number(input.value));
    return payload;
  }
  function setOutput(key, value) {
    if (value == null || !Number.isFinite(Number(value))) return;
    const editor = document.querySelector(`[data-number-for="${key}"]`);
    if (!editor || editor === document.activeElement) return;
    const decimals = key === 'stepCount' ? 0 : (Number(editor.step) < 0.1 ? 2 : 1);
    editor.value = Number(value).toFixed(decimals);
  }

  function rangeForDisplayKey(key) {
    const map = {
      length: ['poolDimensions', 'length'],
      width: ['poolDimensions', 'width'],
      shallowDepth: ['poolDimensions', 'shallowDepth'],
      deepDepth: ['poolDimensions', 'deepDepth'],
      poolHeight: ['poolHeight', 'height'],
      spaWidth: ['spa', 'width'],
      spaLength: ['spa', 'length'],
      spaHeight: ['spa', 'height'],
      stepCount: ['steps', 'count'],
      stepDepth: ['steps', 'depth'],
      stepWidth: ['steps', 'width'],
      acrylicLength: ['acrylic', 'length'],
      acrylicHeight: ['acrylic', 'height'],
      wallRaiseHeight: ['wallRaise', 'extra']
    };
    const entry = map[key];
    return entry ? document.querySelector(`[data-group="${entry[0]}"][data-key="${entry[1]}"]`) : null;
  }

  function clampToRange(input, value) {
    const min = input.min === '' ? -Infinity : Number(input.min);
    const max = input.max === '' ? Infinity : Number(input.max);
    const step = Number(input.step);
    let next = Math.min(max, Math.max(min, Number(value)));
    if (Number.isFinite(step) && step > 0) {
      const base = Number.isFinite(min) ? min : 0;
      next = base + Math.round((next - base) / step) * step;
      next = Number(next.toFixed(step >= 1 ? 0 : 1));
    }
    return next;
  }

  document.querySelectorAll('[data-group]').forEach(input => {
    const group = input.dataset.group;

    input.addEventListener('pointerdown', () => {
      if (group === 'poolDimensions') sendDesignerCommand('BEGIN_POOL_DIMENSION_PREVIEW');
    });

    input.addEventListener('input', () => {
      const map = {
        length:'length', width:'width', shallowDepth:'shallowDepth', deepDepth:'deepDepth',
        count:'stepCount', depth:'stepDepth', height: group === 'poolHeight' ? 'poolHeight' : 'spaHeight'
      };
      if (group === 'spa' && input.dataset.key === 'width') setOutput('spaWidth', input.value);
      else if (group === 'spa' && input.dataset.key === 'length') setOutput('spaLength', input.value);
      else if (group === 'acrylic') setOutput(input.dataset.key === 'length' ? 'acrylicLength' : 'acrylicHeight', input.value);
      else if (group === 'wallRaise') setOutput('wallRaiseHeight', input.value);
      else setOutput(map[input.dataset.key] || input.dataset.key, input.value);

      if (group === 'poolDimensions') sendDesignerCommand('PREVIEW_POOL_DIMENSIONS', numericPayload(group));
      if (group === 'spa') sendDesignerCommand('PREVIEW_SPA', numericPayload(group));
      if (group === 'poolHeight') sendDesignerCommand('PREVIEW_POOL_HEIGHT', numericPayload(group));
      if (group === 'acrylic') sendDesignerCommand('PREVIEW_ACRYLIC_WINDOW', numericPayload(group));
      if (group === 'wallRaise') sendDesignerCommand('PREVIEW_SELECTED_WALL_HEIGHT', numericPayload(group));
    });

    input.addEventListener('change', () => {
      if (group === 'poolDimensions') sendDesignerCommand('SET_POOL_DIMENSIONS', numericPayload(group));
      if (group === 'spa') sendDesignerCommand('UPDATE_SPA', numericPayload(group));
      if (group === 'steps') sendDesignerCommand('UPDATE_STEPS', numericPayload(group));
      if (group === 'poolHeight') sendDesignerCommand('SET_POOL_HEIGHT', numericPayload(group));
      if (group === 'acrylic') sendDesignerCommand('UPDATE_ACRYLIC_WINDOW', numericPayload(group));
      if (group === 'wallRaise') sendDesignerCommand('SET_SELECTED_WALL_HEIGHT', numericPayload(group));
    });

    input.addEventListener('pointercancel', () => {
      if (group === 'poolDimensions') sendDesignerCommand('SET_POOL_DIMENSIONS', numericPayload(group));
      if (group === 'spa') sendDesignerCommand('UPDATE_SPA', numericPayload(group));
      if (group === 'poolHeight') sendDesignerCommand('SET_POOL_HEIGHT', numericPayload(group));
      if (group === 'acrylic') sendDesignerCommand('UPDATE_ACRYLIC_WINDOW', numericPayload(group));
      if (group === 'wallRaise') sendDesignerCommand('SET_SELECTED_WALL_HEIGHT', numericPayload(group));
    });
  });

  document.querySelectorAll('[data-number-for]').forEach(editor => {
    const key = editor.dataset.numberFor;
    const range = rangeForDisplayKey(key);
    if (!range) return;

    const applyManualValue = (commit = false) => {
      const raw = String(editor.value ?? '').trim();
      // Keep partial decimal entry intact while typing (for example "5." or "-0.").
      if (!commit && (raw === '' || raw === '-' || raw.endsWith('.'))) return;
      if (!/^-?\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw))) return;
      const value = clampToRange(range, raw);
      if (commit) editor.value = String(value);
      range.value = String(value);
      range.dispatchEvent(new Event(commit ? 'change' : 'input', { bubbles: true }));
    };

    editor.addEventListener('input', () => applyManualValue(false));
    editor.addEventListener('change', () => applyManualValue(true));
    editor.addEventListener('blur', () => applyManualValue(true));
    editor.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyManualValue(true);
        editor.blur();
      }
    });
  });

  function setPillState(button, active) {
    if (!button) return;
    button.setAttribute('aria-pressed', String(!!active));
    button.classList.toggle('is-active', !!active);
    const stateLabel = button.querySelector('[data-toggle-state]');
    if (stateLabel) stateLabel.textContent = '';
    button.setAttribute('aria-label', `${button.querySelector('span')?.textContent || 'Option'}: ${active ? 'On' : 'Off'}`);
    if (button.matches('[data-command="SET_POOL_RAISED"]')) {
      const heightControl = document.getElementById('raisedPoolHeightControl');
      if (heightControl) heightControl.hidden = !active;
    }
  }


  function setSpaControlsEnabled(enabled) {
    const section = document.getElementById('spaControlsSection');
    if (!section) return;
    section.classList.toggle('spa-controls-disabled', !enabled);
    section.querySelectorAll('.control-content input, .control-content select, .control-content button').forEach(control => {
      const isEnableToggle = control.matches('[data-command="UPDATE_SPA"][data-key="enabled"]');
      if (!isEnableToggle) control.disabled = !enabled;
    });
  }

  document.querySelectorAll('[data-command]').forEach(el => {
    if (el.dataset.group) return;
    const eventName = (el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'click';
    el.addEventListener(eventName, async () => {
      const type = el.dataset.command;
      let payload = {};
      if (el.dataset.value != null) payload.value = el.dataset.value;
      if (el.dataset.key) {
        if (el.matches('[data-toggle-pill]')) {
          payload[el.dataset.key] = el.getAttribute('aria-pressed') !== 'true';
        } else {
          payload[el.dataset.key] = el.type === 'checkbox' ? el.checked : el.value;
        }
      }
      if (type === 'SHARE_DESIGN') {
        try { await navigator.clipboard.writeText(window.location.href); status.textContent = 'Design link copied'; } catch (_) { status.textContent = 'Copy unavailable'; }
        return;
      }
      sendDesignerCommand(type, payload);
    });
  });

  ['poolControlsSection', 'spaControlsSection'].forEach(id => {
    const section = document.getElementById(id);
    if (section) section.open = false;
  });

  const controlTabs = [...document.querySelectorAll('[data-control-tab]')];
  const controlPanels = [...document.querySelectorAll('[data-control-panel]')];
  const lastOpenByPanel = new Map();

  function activateControlTab(tabName, focusTab = false) {
    controlTabs.forEach(tab => {
      const active = tab.dataset.controlTab === tabName;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      if (active && focusTab) tab.focus();
    });
    controlPanels.forEach(panel => {
      const active = panel.dataset.controlPanel === tabName;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
      if (active) {
        const rememberedId = lastOpenByPanel.get(tabName);
        const remembered = rememberedId ? panel.querySelector(`#${rememberedId}`) : null;
        if (remembered) remembered.setAttribute('open', '');
      }
    });
  }

  function focusModelControlSection(target) {
    if (target === 'steps') {
      activateControlTab('features-finishes');
      const stepsSection = document.getElementById('stepsControlsSection');
      if (stepsSection) stepsSection.open = true;
      lastOpenByPanel.set('features-finishes', 'stepsControlsSection');
      stepsSection?.querySelector('summary')?.focus?.({ preventScroll:true });
      return;
    }
    activateControlTab('pool-spa');
    const poolSection = document.getElementById('poolControlsSection');
    const spaSection = document.getElementById('spaControlsSection');
    if (target === 'spa') {
      if (poolSection) poolSection.open = false;
      if (spaSection) spaSection.open = true;
      lastOpenByPanel.set('pool-spa', 'spaControlsSection');
      spaSection?.querySelector('summary')?.focus?.({ preventScroll: true });
    } else {
      if (spaSection) spaSection.open = false;
      if (poolSection) poolSection.open = true;
      lastOpenByPanel.set('pool-spa', 'poolControlsSection');
      poolSection?.querySelector('summary')?.focus?.({ preventScroll: true });
    }
  }

  controlTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateControlTab(tab.dataset.controlTab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = index;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + controlTabs.length) % controlTabs.length;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % controlTabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = controlTabs.length - 1;
      activateControlTab(controlTabs[nextIndex].dataset.controlTab, true);
    });
  });

  controlPanels.forEach(panel => {
    panel.querySelectorAll('details').forEach(item => item.addEventListener('toggle', () => {
      if (!item.open) return;
      if (item.id) lastOpenByPanel.set(panel.dataset.controlPanel, item.id);
      panel.querySelectorAll('details').forEach(other => { if (other !== item) other.open = false; });
    }));
  });

  document.querySelectorAll('[data-feature-option]').forEach(button => {
    button.addEventListener('click', () => {
      if (button.disabled || button.getAttribute('aria-disabled') === 'true') {
        if (['spout-water-features','blade-water-features'].includes(button.dataset.featureOption)) {
          sendDesignerCommand('PROMPT_RAISE_WALL', { feature:button.dataset.featureOption });
          status.textContent = 'Select and raise the highlighted pool wall first';
        }
        return;
      }
      const selected = button.getAttribute('aria-pressed') !== 'true';
      if (button.dataset.featureOption === 'curved-wall') {
        sendDesignerCommand('SET_CURVED_WALL', { enabled:selected });
        status.textContent = selected
          ? 'Curved wall enabled — select two adjacent walls to create the curve'
          : 'Removing curved wall…';
        return;
      }
      sendDesignerCommand('SET_POOL_FEATURE', {
        feature: button.dataset.featureOption,
        enabled: selected
      });
      status.textContent = selected ? `Adding ${button.textContent.trim()}…` : `Removing ${button.textContent.trim()}…`;
    });
  });

  setSpaControlsEnabled(false);
  activateControlTab('pool-spa');

  document.getElementById('panelCollapse')?.addEventListener('click', () => {
    controls.classList.toggle('is-collapsed');
    document.querySelector('.designer-workspace').style.gridTemplateColumns = controls.classList.contains('is-collapsed') ? '220px minmax(0,1fr) 52px' : '';
  });

  const backdrop = document.getElementById('sheetBackdrop');
  const setSheet = open => { controls.classList.toggle('sheet-open', open); backdrop.hidden = !open; backdrop.classList.toggle('is-open', open); };
  document.getElementById('openMobileControls')?.addEventListener('click', () => setSheet(true));
  backdrop?.addEventListener('click', () => setSheet(false));

  function setSummaryValue(key, value) {
    const row = document.querySelector(`[data-summary-row="${key}"]`);
    const output = row?.querySelector(`[data-summary="${key}"]`);
    const visible = value != null && String(value).trim() !== '';
    if (row) row.hidden = !visible;
    if (output) output.textContent = visible ? String(value) : '';
  }

  function formatFeatureName(value) {
    const labels = {
      'bar-stools':'Bar stools',
      'laminar-jets':'Laminar jets',
      'bubblers':'Bubblers',
      'infinity-edge':'Infinity edge',
      'spout-water-features':'Spout water features',
      'blade-water-features':'Blade water features',
      'acrylic-window':'Acrylic window',
      'curved-wall':'Curved wall'
    };
    return labels[value] || String(value).replace(/-/g, ' ').replace(/^./, char => char.toUpperCase());
  }

  function updateDesignerControls(next = {}) {
    const previouslySelectedWall = !!state?.selectedWall?.selected;
    state = next;
    const p = next.pool || next.poolParams || {};
    const s = next.spa || {};
    const selectedFeatures = new Set(Array.isArray(next.features) ? next.features : []);
    const featureAvailability = next.featureAvailability || {};
    document.querySelectorAll('[data-feature-option]').forEach(button => {
      const feature = button.dataset.featureOption;
      const isCurve = feature === 'curved-wall';
      const selected = isCurve ? (!!next.curvedWallEnabled || !!next.customizeMode) : selectedFeatures.has(feature);
      const available = isCurve
        ? !['oval','kidney'].includes(String(p.shape || '').toLowerCase())
        : featureAvailability[feature] !== false;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('is-selected', selected);
      // Keep unavailable buttons pointer-addressable so their hover explanation
      // can be shown. aria-disabled plus the guarded click handler above retains
      // the disabled behaviour without suppressing pointer events/tooltips.
      button.disabled = false;
      button.setAttribute('aria-disabled', String(!available));
      if (!available) {
        const reasons = {
          'laminar-jets': 'Laminar jets require paving at the installation edge.',
          'infinity-edge': 'Infinity edge requires an out-of-ground pool wall without paving.',
          'spout-water-features': 'Raise a pool wall to add this feature.',
          'blade-water-features': 'Raise a pool wall to add this feature.',
          'acrylic-window': 'Raise the pool to enable this feature.',
          'curved-wall': 'Curved-wall editing is not available for this pool shape.'
        };
        const reason = reasons[feature] || 'This feature is not available for the current pool configuration.';
        button.title = reason;
        button.dataset.disabledReason = reason;
      } else {
        button.removeAttribute('title');
        delete button.dataset.disabledReason;
      }
    });
    const selectedWall = next.selectedWall || {};
    const wallControl = document.getElementById('selectedWallRaiseControl');
    const wallRange = document.querySelector('[data-group="wallRaise"][data-key="extra"]');
    const wallEditor = document.querySelector('[data-number-for="wallRaiseHeight"]');
    const wallNote = document.getElementById('selectedWallRaiseNote');
    if (wallControl) wallControl.hidden = !selectedWall.selected;
    if (wallRange) {
      wallRange.value = String(Number(selectedWall.extra || 0));
      wallRange.disabled = !selectedWall.canRaise;
    }
    if (wallEditor) {
      wallEditor.value = Number(selectedWall.extra || 0).toFixed(2);
      wallEditor.disabled = !selectedWall.canRaise;
    }
    if (wallNote) wallNote.textContent = selectedWall.entrySide
      ? 'Entry-step walls cannot be raised. Move the steps or select another wall.'
      : 'Drag the wall-height handle in the 3D view or use this slider.';
    if (selectedWall.selected && !previouslySelectedWall) {
      activateControlTab('pool-spa');
      const poolSection = document.getElementById('poolControlsSection');
      if (poolSection) poolSection.open = true;
      lastOpenByPanel.set('pool-spa', 'poolControlsSection');
    }
    const shapeLabels = { rectangular:'Rectangle', oval:'Oval', kidney:'Kidney', L:'L-shape', freeform:'Freeform', lap:'Lap pool', plunge:'Plunge pool' };
    setSummaryValue('shape', p.shape ? (shapeLabels[p.shape] || p.shape) : null);
    setSummaryValue('size', p.length && p.width ? `${Number(p.length).toFixed(1)} × ${Number(p.width).toFixed(1)} m` : null);
    setSummaryValue('depth', p.shallow != null && p.deep != null ? `${Number(p.shallow).toFixed(1)}–${Number(p.deep).toFixed(1)} m` : null);
    setSummaryValue('spa', s.enabled ? (s.shape === 'circular' ? 'Circular' : 'Rectangular') : null);
    setSummaryValue('spa-size', s.enabled && s.width != null
      ? (s.shape === 'circular'
        ? `${Number(s.width).toFixed(1)} m diameter`
        : `${Number(s.length ?? s.width).toFixed(1)} × ${Number(s.width).toFixed(1)} m`)
      : null);
    setSummaryValue('spa-height', s.enabled && Math.abs(Number(s.height || 0)) > 0.001 ? `${Number(s.height).toFixed(1)} m` : null);
    setSummaryValue('pool-height', p.raised ? `${Number(p.poolElevation || 0).toFixed(1)} m high` : null);
    const raisedWallHeights = Object.values(next.wallRaiseBySourceEdge || {})
      .map(Number)
      .filter(height => Number.isFinite(height) && height > 0.001);
    setSummaryValue('raised-walls', raisedWallHeights.length
      ? raisedWallHeights.map((height, index) => `Wall ${index + 1}: ${height.toFixed(2)} m`).join(' · ')
      : null);
    setSummaryValue('features', selectedFeatures.size ? [...selectedFeatures].map(formatFeatureName).join(', ') : null);
    const tileColour = p.tileColor || next.tileColor || next.interiorTile;
    setSummaryValue('tile-colour', tileColour
      ? String(tileColour).replace(/\b\w/g, character => character.toUpperCase())
      : null);
    const tileFaceSize = Number(next.tileFaceSize) === 23 ? 23 : 48;
    setSummaryValue('tile-size', p.shape ? `${tileFaceSize} mm` : null);
    const raisedToggle = document.querySelector('[data-command="SET_POOL_RAISED"][data-key="raised"]');
    setPillState(raisedToggle, !!p.raised);
    const spaToggle = document.querySelector('[data-command="UPDATE_SPA"][data-key="enabled"]');
    setPillState(spaToggle, !!s.enabled);
    setSpaControlsEnabled(!!s.enabled);
    const selectedTile = String(p.tileColor || next.tileColor || next.interiorTile || '').toLowerCase();
    document.querySelectorAll('[data-command="SET_INTERIOR_TILE"][data-value]').forEach(button => {
      button.classList.toggle('is-selected', String(button.dataset.value || '').toLowerCase() === selectedTile);
    });
    document.querySelectorAll('[data-command="SET_TILE_SIZE"][data-value]').forEach(button => {
      const selected = Number(button.dataset.value) === tileFaceSize;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelector('.tile-swatch-grid')?.setAttribute('data-tile-preview-size', String(tileFaceSize));
    const values = {
      length:p.length, width:p.width, shallowDepth:p.shallow, deepDepth:p.deep,
      poolHeight:p.poolElevation ?? 0.7,
      spaWidth:s.width, spaLength:s.length, spaHeight:s.height,
      stepCount:p.stepCount, stepDepth:p.stepDepth, stepWidth:p.stepWidth
    };
    Object.entries(values).forEach(([key,value]) => {
      if (value == null) return;
      const range = rangeForDisplayKey(key);
      if (range && range !== document.activeElement) range.value = value;
      setOutput(key, value);
    });
    // A recovered design is authoritative. Always synchronize the external
    // shape selector so it never falls back to Rectangle after loading.
    const shapeSelect = document.querySelector('[data-command="SET_POOL_SHAPE"][data-key="shape"]');
    if (shapeSelect && p.shape && [...shapeSelect.options].some(option => option.value === p.shape)) {
      shapeSelect.value = p.shape;
    }
    const viewToggle = document.querySelector('[data-command="SET_CAMERA_VIEW"][data-key="view"]');
    setPillState(viewToggle, !!next.camera?.section);
  }

  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow || event.origin !== targetOrigin) return;
    const message = event.data || {};
    if (message.source !== 'pool-designer-designer') return;
    switch (message.type) {
      case 'DESIGN_LOADING_STARTED':
        loadAttempted = true;
        ready = false;
        error.hidden = true;
        loading.hidden = false;
        loading.classList.remove('is-ready');
        status.textContent = 'Loading designer…';
        clearTimeout(loadFailureTimer);
        loadFailureTimer = window.setTimeout(() => {
          if (loadAttempted && !ready) {
            error.hidden = false;
            loading.hidden = true;
          }
        }, 30000);
        break;
      case 'DESIGNER_READY':
        ready = true;
        clearTimeout(loadFailureTimer);
        loading?.classList.add('is-ready');
        status.textContent = 'Connected';
        sendDesignerCommand('REQUEST_DESIGN_STATE');
        requestAnimationFrame(() => updateRenderPause(false));
        break;
      case 'DESIGN_LOAD_FAILED':
        clearTimeout(loadFailureTimer);
        if (loadAttempted) {
          error.hidden = false;
          loading.hidden = true;
        }
        status.textContent = 'Designer failed to load';
        break;
      case 'DESIGN_STATE_CHANGED':
        updateDesignerControls(message.payload);
        status.textContent = 'Saved in model';
        window.dispatchEvent(new CustomEvent('pool-designer:designer-state', { detail:window.getDesignerState() }));
        break;
      case 'SUBMISSION_PACKAGE_READY':
        if (submissionRequest) {
          clearTimeout(submissionRequest.timeout);
          submissionRequest.resolve(message.payload);
          submissionRequest = null;
        }
        break;
      case 'MODEL_INTERACTION': focusModelControlSection(['spa','steps'].includes(message.payload?.target) ? message.payload.target : 'pool'); break;
      case 'LOADING_STARTED': status.textContent = 'Updating…'; break;
      case 'LOADING_COMPLETE': status.textContent = 'Connected'; break;
      case 'DESIGN_ERROR': {
        const detail = String(message.payload?.message || '').trim();
        status.textContent = detail ? `Update failed: ${detail}` : 'Update failed';
        console.error(message.payload);
        if (message.payload?.type === 'REQUEST_SUBMISSION_PACKAGE' && submissionRequest) {
          clearTimeout(submissionRequest.timeout);
          submissionRequest.reject(new Error(detail || 'The 3D preview could not be prepared.'));
          submissionRequest = null;
        }
        break;
      }
    }
  });

  // The iframe initially displays the starter-pool chooser, which is a valid
  // idle state. Do not show loading or failure UI until a starter pool is chosen.
  frame?.addEventListener('load', () => {
    error.hidden = true;
    if (!loadAttempted) loading.hidden = true;
  });
  frame?.addEventListener('error', () => {
    if (!loadAttempted) return;
    clearTimeout(loadFailureTimer);
    error.hidden = false;
    loading.hidden = true;
  });

  let previousScrollY = window.scrollY;
  let scrollFrame = 0;
  let scrollEndTimer = 0;
  let workspaceVisible = true;
  let renderPaused = false;
  const header = document.querySelector('.site-header');
  const reveal = document.querySelector('.designer-header-reveal');
  const workspace = document.querySelector('.designer-workspace');
  const showHeader = () => header?.classList.remove('designer-header-hidden');
  const hideHeader = () => { if (!document.querySelector('.main-nav.open')) header?.classList.add('designer-header-hidden'); };

  function updateRenderPause(scrolling = false) {
    const shouldPause = scrolling || !workspaceVisible || document.hidden;
    if (!ready || shouldPause === renderPaused) return;
    renderPaused = shouldPause;
    sendDesignerCommand('SET_RENDER_PAUSED', { paused: shouldPause });
  }

  // Throttle scroll work to one update per painted frame. The header is moved
  // only with transform, so scrolling never resizes the WebGL iframe.
  window.addEventListener('scroll', () => {
    updateRenderPause(true);
    clearTimeout(scrollEndTimer);
    scrollEndTimer = window.setTimeout(() => updateRenderPause(false), 160);
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      const y = window.scrollY;
      if (y < 30) showHeader();
      else if (y > previousScrollY && y > 70) hideHeader();
      else if (y < previousScrollY) showHeader();
      previousScrollY = y;
    });
  }, { passive:true });

  if ('IntersectionObserver' in window && workspace) {
    new IntersectionObserver(([entry]) => {
      workspaceVisible = entry.isIntersecting && entry.intersectionRatio > 0.08;
      updateRenderPause(false);
    }, { threshold:[0, 0.08, 0.25] }).observe(workspace);
  }
  // Magnetise small page offsets back to the full-height workspace. Larger
  // deliberate scrolls can still continue to the supporting content below.
  if (workspace) {
    let snapTimer = 0;
    window.addEventListener('scroll', () => {
      clearTimeout(snapTimer);
      snapTimer = window.setTimeout(() => {
        const rect = workspace.getBoundingClientRect();
        const offset = Math.abs(rect.top);
        if (offset > 4 && offset < Math.min(120, window.innerHeight * 0.18)) {
          workspace.scrollIntoView({ behavior:'smooth', block:'start' });
        }
      }, 140);
    }, { passive:true });
  }
  document.addEventListener('visibilitychange', () => updateRenderPause(false));
  reveal?.addEventListener('pointerenter', showHeader);
  header?.addEventListener('focusin', showHeader);
})();
