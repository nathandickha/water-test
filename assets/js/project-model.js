export const STANDARD_EQUIPMENT = Object.freeze([
  { code:'filtration-system', name:'Filtration system', description:'Builder-sized pump, filter and hydraulic allowance.' },
  { code:'skimmer-and-returns', name:'Skimmer and returns', description:'Standard circulation fittings and return lines.' },
  { code:'standard-led-light', name:'LED pool light', description:'At least one underwater LED light.' },
  { code:'electrical-provision', name:'Electrical provision', description:'Standard pool equipment electrical allowance.' },
  { code:'commissioning', name:'Commissioning', description:'Water balance, handover and operating instructions.' }
]);

export const OPTIONAL_EQUIPMENT = Object.freeze([
  { code:'heat-pump', name:'Heat pump', description:'Energy-efficient pool heating.' },
  { code:'gas-heating', name:'Gas heating', description:'Rapid pool or spa heating.' },
  { code:'salt-chlorination', name:'Salt chlorination', description:'Automated salt-water sanitation.' },
  { code:'mineral-system', name:'Mineral system', description:'Mineral-enhanced sanitation system.' },
  { code:'automation', name:'Pool automation', description:'App-based equipment and lighting control.' },
  { code:'in-floor-cleaning', name:'In-floor cleaning', description:'Integrated circulation and debris removal.' },
  { code:'robotic-cleaner', name:'Robotic cleaner', description:'Standalone automatic pool cleaner.' },
  { code:'pool-cover', name:'Pool cover', description:'Manual or concealed cover allowance.' },
  { code:'additional-lighting', name:'Additional lighting', description:'Extra pool, spa or landscape lights.' }
]);

const FEATURE_NAMES = Object.freeze({
  'bar-stools':'Swim-up bar stools',
  'laminar-jets':'Laminar jets',
  bubblers:'Sun-shelf bubblers',
  'infinity-edge':'Infinity edge and balance tank',
  'spout-water-features':'Spout water features',
  'blade-water-features':'Blade water features',
  'acrylic-window':'Acrylic viewing window'
});

export function designDependentEquipment(configuration = {}) {
  const required = [];
  const features = new Set(configuration.features || []);
  if (configuration.spa?.enabled) required.push({ code:'spa-equipment', name:'Spa plant and controls', description:'Heating, jets, air and hydraulic separation required by the spa.' });
  if (features.has('infinity-edge')) required.push({ code:'infinity-hydraulics', name:'Infinity-edge hydraulics', description:'Balance tank, catchment, levelling and additional circulation.' });
  if (features.has('laminar-jets') || features.has('bubblers') || features.has('spout-water-features') || features.has('blade-water-features')) {
    required.push({ code:'water-feature-pump', name:'Water-feature plant', description:'Dedicated pump, valves and control allowance.' });
  }
  if (features.has('acrylic-window')) required.push({ code:'acrylic-engineering', name:'Acrylic panel engineering', description:'Structural engineering, waterproofing and specialist installation.' });
  if (configuration.pool?.raised || Object.values(configuration.wallRaiseBySourceEdge || {}).some(value => Number(value) > 0)) {
    required.push({ code:'raised-wall-engineering', name:'Raised-wall engineering', description:'Structural allowance for out-of-ground or raised walls.' });
  }
  return required;
}

export function buildSpecification(configuration = {}) {
  const pool = configuration.pool || {};
  const spa = configuration.spa || {};
  const length = Number(pool.length || 0);
  const width = Number(pool.width || 0);
  const shallow = Number(pool.shallow || 0);
  const deep = Number(pool.deep || 0);
  const area = length && width ? length * width : 0;
  const volume = area && (shallow || deep) ? area * ((shallow + deep) / 2) : 0;
  const features = (configuration.features || []).map(code => FEATURE_NAMES[code] || code);
  return {
    shape: pool.shape || 'Custom',
    dimensions: length && width ? `${length.toFixed(1)} × ${width.toFixed(1)} m` : 'Custom footprint',
    depths: shallow || deep ? `${shallow.toFixed(1)}–${deep.toFixed(1)} m` : 'To be confirmed',
    estimatedSurfaceAreaM2: Number(area.toFixed(1)),
    estimatedVolumeLitres: Math.round(volume * 1000),
    poolElevationM: Number(pool.poolElevation || 0),
    raisedPool: !!pool.raised,
    spa: spa.enabled ? {
      shape:spa.shape || 'square',
      widthM:Number(spa.width || 0),
      lengthM:Number(spa.length || 0),
      heightM:Number(spa.height || 0)
    } : null,
    features,
    interiorFinish: pool.tileColor || configuration.interiorTile || 'To be selected',
    geometry: configuration.editablePolygon ? 'Custom editable polygon included' : 'Parametric shape',
    generatedAt: new Date().toISOString(),
    disclaimer: 'Dimensions and quantities are design estimates for quotation and remain subject to site survey, engineering and approvals.'
  };
}

export function specificationRows(specification = {}) {
  return [
    ['Shape', specification.shape],
    ['Dimensions', specification.dimensions],
    ['Depth', specification.depths],
    ['Estimated surface', specification.estimatedSurfaceAreaM2 ? `${specification.estimatedSurfaceAreaM2} m²` : '—'],
    ['Estimated volume', specification.estimatedVolumeLitres ? `${specification.estimatedVolumeLitres.toLocaleString('en-AU')} L` : '—'],
    ['Spa', specification.spa ? `${specification.spa.shape}, ${specification.spa.widthM} × ${specification.spa.lengthM} m` : 'No'],
    ['Raised pool', specification.raisedPool ? `Yes (${specification.poolElevationM} m)` : 'No'],
    ['Features', specification.features?.join(', ') || 'None selected']
  ];
}
