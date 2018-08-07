require('../meta/typedefs');

const { assert, expect } = require('chai')
, { assertThrowsAsync } = require('sh.orchestration-tools')
, { ConfigProvider } = require('../lib/cameleer/ConfigProvider')
, StandardConfigProviderInstance = require('../cli/config.example');


describe('ConfigProvider', function() {
  it('should be an abstract class', async() => {
    const cp = new ConfigProvider();

    assert.throws(() => {
      cp.getCameleerConfig();
    });

    await assertThrowsAsync(async() => {
      await cp.getTaskConfig('foo');
    });

    await assertThrowsAsync(async() => {
      await cp.getAllTaskConfigs();
    });

    await assertThrowsAsync(async() => {
      await StandardConfigProviderInstance.getTaskConfig('foo');
    });
  });
});