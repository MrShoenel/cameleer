require('../meta/typedefs');

const { assert, expect } = require('chai')
, { assertThrowsAsync } = require('sh.orchestration-tools')
, { ConfigProvider, createDefaultCameleerConfig, StandardConfigProvider } = require('../lib/cameleer/ConfigProvider')
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

  it('should be able to find tasks by name', async() => {
    const c = new StandardConfigProvider();

    assert.deepEqual(JSON.stringify(c.cameleerConfig), JSON.stringify(createDefaultCameleerConfig()));
    assert.isArray(c.tasks);
    assert.strictEqual(c.tasks.length, 0);
    
    /** @type {TaskConfig} */
    const conf = {
      name: 'foo'
    };
    c.tasks.push(conf);

    const def = await c.getTaskConfig('foo');
    assert.strictEqual(def, conf);
  });
});