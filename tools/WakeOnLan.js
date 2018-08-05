const wol = require('wakeonlan')
, { timeout } = require('sh.orchestration-tools');

/**
 * A regular expression to match MAC-addresses in the form 77:55:33:ff:bb:aa.
 * 
 * @author Sebastian Hönel <development@hoenel.net>
 */
const macRegex = /^(?:[a-f0-9]{2})(?::(?:[a-f0-9]{2})){5}$/i;


/**
 * Use wake-on-lan to wake a computer by its MAC.
 * 
 * @author Sebastian Hönel <development@hoenel.net>
 * @param {String} mac the mac-address as 77:55:33:ff:bb:aa
 * @param {Number} [waitAfterSeconds] wait amount of seconds before resolving
 */
const wakeAsync = async(mac, waitAfterSeconds = void 0) => {
  if (!macRegex.test(mac)) {
    throw new Error(`The given MAC-address '${mac}' is not valid.`);
  }
  await wol(mac.toUpperCase());
  if (!isNaN(waitAfterSeconds) && waitAfterSeconds > 0) {
    await timeout((waitAfterSeconds * 1e3) | 0);
  }
};

module.exports = Object.freeze({
  wakeAsync,
  macRegex
});
