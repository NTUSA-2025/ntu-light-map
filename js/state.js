export const state = {
  authSession: null,
  reportHexLayer: null,
  selectedHexLayer: null,
  selectedHex: null,
  userLocation: null,
  userLocationMarker: null,
  userAccuracyCircle: null,
  allIncidents: [],
  incidentFilter: 'all', // 'all' | 'harassment' | 'accident'
  reportHexFeatureById: new Map()
};
