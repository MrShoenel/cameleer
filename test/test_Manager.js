require('../meta/typedefs');

const { assert } = require('chai')
, { assertThrowsAsync } = require('sh.orchestration-tools')
, { Cameleer } = require('../lib/cameleer/Cameleer')
, { Manager } = require('../lib/manager/Manager')
, { createDefaultCameleerConfig, StandardConfigProvider } = require('../lib/cameleer/ConfigProvider');



const camConf = createDefaultCameleerConfig();
camConf.logging.method = 'none';
const std = new StandardConfigProvider(camConf);


describe('Manager', function() {
  it('should initialize properly with default arguments', async() => {
    const m = new Manager(new Cameleer(std));

    assert.strictEqual(JSON.stringify(m.config), JSON.stringify({}));

    await m.cameleer.shutdown();
  });
});