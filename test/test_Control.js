require('../meta/typedefs');

const { assert } = require('chai')
, { assertThrowsAsync } = require('sh.orchestration-tools')
, { BaseLogger } = require('sh.log-client')
, { Cameleer } = require('../lib/cameleer/Cameleer')
, { Control } = require('../lib/control/Control')
, { createDefaultCameleerConfig, StandardConfigProvider } = require('../lib/cameleer/ConfigProvider')
, { assertDoesNotThrowAsync } = require('./helpers');



const camConf = createDefaultCameleerConfig();
camConf.logging.method = 'none';
const std = new StandardConfigProvider(camConf);


describe('Control', function() {
  it('should execute commands on Cameleer accordingly', async() => {
    const cam = new Cameleer(std);
    const ctrl = new Control(cam);

    await assertDoesNotThrowAsync(async() => {
      await ctrl.processCommand('load');
    });

    await assertDoesNotThrowAsync(async() => {
      await ctrl.processCommand('run');
    });

    await assertDoesNotThrowAsync(async() => {
      await ctrl.processCommand('pause');
    });

    await assertDoesNotThrowAsync(async() => {
      await ctrl.processCommand('run');
    });

    await assertDoesNotThrowAsync(async() => {
      await ctrl.processCommand('pausewait');
    });

    // Let's call a custom method
    await assertDoesNotThrowAsync(async() => {
      class XxGg {};
      /** @type {BaseLogger.<XxGg>} */
      const logger = await ctrl.processCommand('getLogger', XxGg);
      assert.isTrue(logger instanceof BaseLogger);
    });

    await assertDoesNotThrowAsync(async() => {
      await ctrl.processCommand('pauseWait');
    });

    await assertThrowsAsync(async() => {
      await ctrl.processCommand('foobar');
    });

    await assertDoesNotThrowAsync(async() => {
      await ctrl.processCommand('shutdown');
    });
  });
});