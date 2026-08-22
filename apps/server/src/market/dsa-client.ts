// Compatibility re-export. DSA ownership lives in integration/dsa.
// Keep existing market imports working while consumers migrate to DsaModule.
export { DsaClient, DsaError } from '../integration/dsa/dsa.client.js';
