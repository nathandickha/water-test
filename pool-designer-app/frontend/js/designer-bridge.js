const SOURCE_IN = 'pool-designer-controls';
const SOURCE_OUT = 'pool-designer-designer';
const params = new URLSearchParams(location.search);
const embedded = params.get('embedded') === '1';
let app = null;
let starterPresets = [];

function parentOriginAllowed(origin) {
  return origin === location.origin || origin === 'https://nathandickha.github.io';
}
function post(type, payload = {}) {
  if (window.parent === window) return;
  window.parent.postMessage({ source: SOURCE_OUT, type, payload }, location.origin);
}
function input(id, value, event='change') {
  const el = document.getElementById(id); if (!el) return false;
  el.value = String(value); el.dispatchEvent(new Event(event, { bubbles:true })); return true;
}
function clickData(selector, value) {
  const el = document.querySelector(`${selector}[data-step-wall="${value}"],${selector}[data-step-position="${value}"],${selector}[data-step-shape="${value}"],${selector}[data-step-bench-mode="${value}"]`);
  el?.click(); return !!el;
}
function snapshot() {
  const p = app?.poolParams?.snapshot?.() || app?.poolParams || {};
  const spa = app?.spa;
  return {
    pool: { ...p, raised: !!p.raised, poolElevation: Number(p.poolElevation || 0) },
    editablePolygon: app?._serializeEditablePolygon?.() || null,
    wallRaiseBySourceEdge: JSON.parse(JSON.stringify(app?.wallRaiseBySourceEdge || {})),
    selectedWall: app?.getSelectedWallRaiseState?.() || { selected:false, extra:0, canRaise:false, entrySide:false },
    barStoolPlacements: JSON.parse(JSON.stringify(app?.barStoolPlacements || null)),
    raisedWallWaterFeaturePlacements: JSON.parse(JSON.stringify(app?.raisedWallWaterFeaturePlacements || {})),
    acrylicWindow: JSON.parse(JSON.stringify(app?.acrylicWindowState || { length:1.8, height:0.8, placement:null })),
    bladeLength: Number(app?.bladeLength || 1.2),
    tileFaceSize: Number(app?.tileFaceSize) === 23 ? 23 : 48,
    tileColor: app?.pbrManager?.currentTileKey || p.tileColor || null,
    features: [...(app?.poolFeatures || [])],
    customizeMode: !!app?.customizeMode,
    curvedWallEnabled: !!app?._polygonHasCurves?.(),
    featureAvailability: app?.getPoolFeatureAvailability?.() || {},
    spa: {
      enabled:!!spa,
      shape:spa?.userData?.spaShape || null,
      width:spa?.userData?.spaWidth || null,
      length:spa?.userData?.spaLength || null,
      height:Number(spa?.userData?.spaTopHeight ?? document.getElementById('spaTopHeight')?.value ?? 0),
      x:spa?.position?.x || 0,
      y:spa?.position?.y || 0,
      z:spa?.position?.z || 0
    },
    camera: { section:!!app?.sectionViewEnabled }
  };
}
async function captureSubmissionPreview() {
  const sourceCanvas = app?.renderer?.domElement;
  if (!sourceCanvas) throw new Error('The 3D preview is not available yet.');
  await new Promise(resolve => requestAnimationFrame(resolve));
  const sourceWidth = sourceCanvas.width || sourceCanvas.clientWidth || 1;
  const sourceHeight = sourceCanvas.height || sourceCanvas.clientHeight || 1;
  const maxWidth = 1600;
  const scale = Math.min(1, maxWidth / sourceWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d', { alpha:false });
  if (!context) throw new Error('The 3D preview could not be captured.');
  context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
}
function changed() { const state=snapshot(); try{ localStorage.setItem('pool-designer:lastProject:v1', JSON.stringify({modifiedAt:new Date().toISOString(),state})); }catch(_){} post('DESIGN_STATE_CHANGED', state); }
async function apply(type, payload={}) {
  if (!app) throw new Error('Designer is not ready');
  const isPreview = type === 'PREVIEW_POOL_DIMENSIONS'
    || type === 'PREVIEW_SPA'
    || type === 'PREVIEW_POOL_HEIGHT'
    || type === 'PREVIEW_ACRYLIC_WINDOW';
  if (!isPreview) post('LOADING_STARTED', { type });
  switch(type) {
    case 'REQUEST_DESIGN_STATE': changed(); break;
    case 'REQUEST_SUBMISSION_PACKAGE': {
      const configuration = snapshot();
      const previewDataUrl = await captureSubmissionPreview();
      post('SUBMISSION_PACKAGE_READY', { configuration, previewDataUrl, capturedAt:new Date().toISOString() });
      return;
    }
    case 'LOAD_DESIGN_STATE': {
      const recovered = payload?.configuration;
      if (!recovered?.pool) throw new Error('The saved design is invalid.');
      const recoveredSpa = recovered.spa?.enabled ? {
        shape:recovered.spa.shape,
        width:recovered.spa.width,
        length:recovered.spa.length,
        topHeight:recovered.spa.height,
        x:recovered.spa.x,
        y:recovered.spa.y
      } : null;
      await app.applyStarterPreset({
        id:'saved-project',
        title:'Saved project',
        params:recovered.pool,
        recoveryState:recovered,
        spa:recoveredSpa
      });
      app.tileFaceSize = Number(recovered.tileFaceSize) === 23 ? 23 : 48;
      await app.pbrManager?.setTileFaceSize?.(app.tileFaceSize);
      break;
    }
    case 'SET_RENDER_PAUSED': app._renderPaused = !!payload.paused; break;
    case 'SET_STARTER_POOL': { const preset = starterPresets.find(x => x.id === payload.id); if (preset) await app.applyStarterPreset(preset); break; }
    case 'SET_POOL_SHAPE': await app.setPoolShape?.(payload.shape); break;
    case 'SET_POOL_RAISED': await app.setPoolRaised?.(!!payload.raised); break;
    case 'PREVIEW_SELECTED_WALL_HEIGHT':
    case 'SET_SELECTED_WALL_HEIGHT':
      app.setSelectedWallRaiseHeight?.(Number(payload.extra), { captureUndo:type === 'SET_SELECTED_WALL_HEIGHT' });
      break;
    case 'PROMPT_RAISE_WALL':
      app.promptRaiseWallForFeature?.(String(payload.feature || ''));
      break;
    case 'PREVIEW_POOL_HEIGHT':
    case 'SET_POOL_HEIGHT':
      if (payload.height != null) await app.setPoolElevationHeight?.(Number(payload.height), { captureUndo: type === 'SET_POOL_HEIGHT' });
      break;
    case 'BEGIN_POOL_DIMENSION_PREVIEW':
      if (!app._live?.dragging) {
        if (!app._live.baseParams) app._live.baseParams = { ...(app.poolGroup?.userData?.poolParams || app.poolParams) };
        await app._setLiveDragging?.(true);
      }
      break;
    case 'PREVIEW_POOL_DIMENSIONS':
      if (!app._live?.dragging) {
        if (!app._live.baseParams) app._live.baseParams = { ...(app.poolGroup?.userData?.poolParams || app.poolParams) };
        await app._setLiveDragging?.(true);
      }
      if (payload.length != null) input('length', payload.length, 'input');
      if (payload.width != null) input('width', payload.width, 'input');
      if (payload.shallowDepth != null) input('shallow', payload.shallowDepth, 'input');
      if (payload.deepDepth != null) input('deep', payload.deepDepth, 'input');
      break;
    case 'SET_POOL_DIMENSIONS':
      if (payload.length != null) input('length', payload.length, 'input');
      if (payload.width != null) input('width', payload.width, 'input');
      if (payload.shallowDepth != null) input('shallow', payload.shallowDepth, 'input');
      if (payload.deepDepth != null) input('deep', payload.deepDepth, 'input');
      await app._setLiveDragging?.(false); break;
    case 'RESET_DIMENSIONS': Object.assign(app.poolParams,{length:8,width:4,shallow:1.2,deep:1.8}); app.syncSlidersFromParams(); await app.rebuildPoolForCurrentShape(); break;
    case 'RESET_DESIGN': location.reload(); return;
    case 'PREVIEW_SPA':
    case 'UPDATE_SPA':
      if (payload.enabled != null && payload.enabled !== !!app.spa) document.getElementById('addRemoveSpa')?.click();
      if (payload.shape) input('spaShape', payload.shape);
      if (payload.width != null) input('spaWidth', payload.width, 'input');
      if (payload.length != null) input('spaLength', payload.length, 'input');
      if (payload.height != null) input('spaTopHeight', payload.height, 'input');
      break;
    case 'UPDATE_STEPS':
      if (payload.count != null) input('stepCount', payload.count, 'input');
      if (payload.depth != null) input('stepDepth', payload.depth, 'input');
      if (payload.width != null) input('stepWidth', payload.width, 'input');
      if (payload.wall) clickData('.step-toggle-btn', payload.wall);
      if (payload.position) clickData('.step-toggle-btn', payload.position);
      if (payload.style) clickData('.step-toggle-btn', payload.style);
      break;
    case 'UPDATE_BENCH': if (payload.mode) clickData('.step-toggle-btn', payload.mode); break;
    case 'SET_POOL_FEATURE':
      app.setPoolFeature?.(String(payload.feature || ''), !!payload.enabled);
      break;
    case 'SET_CURVED_WALL':
      await app.setCurvedWallEnabled?.(!!payload.enabled);
      break;
    case 'SET_BLADE_LENGTH':
      app.setBladeLength?.(Number(payload.length));
      break;
    case 'PREVIEW_ACRYLIC_WINDOW':
    case 'UPDATE_ACRYLIC_WINDOW':
      app.setAcrylicWindowSize?.(payload.length, payload.height, { captureUndo:type === 'UPDATE_ACRYLIC_WINDOW' });
      break;
    case 'SET_INTERIOR_TILE':
    case 'SET_WATERLINE_TILE': { const wanted = String(payload.value||'').toLowerCase(); const btn=[...document.querySelectorAll('#tile-grid button')].find(b => (b.textContent||'').toLowerCase().includes(wanted)); btn?.click(); break; }
    case 'SET_TILE_SIZE':
      app.tileFaceSize = Number(payload.value) === 23 ? 23 : 48;
      await app.pbrManager?.setTileFaceSize?.(app.tileFaceSize);
      break;
    case 'SET_CAMERA_VIEW': if (payload.view === 'section' || payload.view === true) app.setSectionViewEnabled(true); else { if(app.sectionViewEnabled) app.setSectionViewEnabled(false); if(payload.view === 'top'){ app.camera.position.set(0,0,18); app.camera.lookAt(0,0,0); } else app.focusCameraOnPoolShape(); } break;
    case 'RESET_CAMERA': app.focusCameraOnPoolShape(); break;
    case 'SAVE_SCREENSHOT': await app.captureCurrentCanvasScreenshot(); break;
    case 'SET_COPING':
    case 'SET_PAVING': console.info(type, payload.value, 'uses current bundled material system'); break;
    default: console.warn('Unsupported designer command', type, payload);
  }
  if (isPreview) changed(); else { setTimeout(changed, 60); post('LOADING_COMPLETE', { type }); }
}
window.addEventListener('message', event => {
  if (!parentOriginAllowed(event.origin)) return;
  const message = event.data || {}; if (message.source !== SOURCE_IN) return;
  apply(message.type, message.payload).catch(error => post('DESIGN_ERROR', { type:message.type, message:error.message }));
});
export function connectDesignerBridge(poolApp, presets=[]) {
  app = poolApp; starterPresets = presets;
  if (embedded && params.get('externalControls') === '1') document.documentElement.classList.add('external-controls');
  let stateFrame = 0;
  const scheduleChanged = () => {
    if (stateFrame) return;
    stateFrame = requestAnimationFrame(() => { stateFrame = 0; changed(); });
  };
  app.poolParams?.subscribe?.(scheduleChanged);
  app._notifyDesignerStateChanged = scheduleChanged;
  app._notifyDesignerInteraction = (target) => post('MODEL_INTERACTION', { target: ['spa','steps'].includes(target) ? target : 'pool' });
  post('DESIGNER_READY', snapshot()); changed();
}
