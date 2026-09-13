export const ASSET_BASE = location.pathname.startsWith('/ntu_light_map/') ? '/ntu_light_map' : '';
export const assetUrl = path => `${ASSET_BASE}${path}`;

export const incidentTypeMeta = {
  accident: { label: '夜間事故', color: '#F0997B' },
  harassment: { label: '夜間騷擾', color: '#ef718d' }
};
