/**
 * node-edge-tts stub for almostnode containers
 *
 * Text-to-speech via Microsoft Edge is not available in browser containers.
 * This stub provides the API surface so imports resolve, but actual
 * synthesis calls throw a descriptive error.
 */
'use strict';

const STUB_ERROR = 'node-edge-tts is not available in browser containers. TTS is disabled.';

class MsEdgeTTS {
  async setMetadata() { throw new Error(STUB_ERROR); }
  async toStream()    { throw new Error(STUB_ERROR); }
  async toFile()      { throw new Error(STUB_ERROR); }
  async getVoices()   { return []; }
  close() {}
}

module.exports = { MsEdgeTTS };
module.exports.MsEdgeTTS = MsEdgeTTS;
module.exports.default = MsEdgeTTS;
