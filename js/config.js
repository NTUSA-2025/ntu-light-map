export const ASSET_BASE = location.pathname.startsWith('/ntu_light_map/') ? '/ntu_light_map' : '';
export const assetUrl = path => `${ASSET_BASE}${path}`;

export const incidentTypeMeta = {
  accident: { label: '夜間事故', color: '#ff8a5c' },
  harassment: { label: '夜間騷擾', color: '#f43f5e' }
};
