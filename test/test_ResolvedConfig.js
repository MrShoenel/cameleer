require('../meta/typedefs');

const { assert, expect } = require('chai')
, { assertThrowsAsync, timeout, ProgressNumeric, Interval } = require('sh.orchestration-tools')
, { Resolve } = require('../tools/Resolve')
, { ResolvedConfig } = require('../lib/cameleer/ResolvedConfig')
, { createExampleInstance } = require('./helpers')
, Schemas = require('../meta/schemas');


describe('ResolvedConfig', () => {
  it('deeply resolves all of a tasks properties', async function() {
    this.timeout(5000);
    // The purpose of this test is to ascertain that simple properties
    // are resolved and, after that, represented as fully-fledged complex
    // properties; e.g. a functional task given as a simple function
    // should be resolved to a full FunctionalTaskConfig.

    /** @type {TaskConfig} */
    const taskConf = {
      name: 'my-task',
      enabled: async() => true,
      skip: () => false,
      cost: async() => 1.5,
      allowMultiple: () => Math.random() < .25,
      queues: async() => ['q1'],
      progress: new ProgressNumeric(0, 1),
      schedule: new Interval(100, () => Math.random(), 5, true, false, true),
      tasks: async() => [
        async() => { await timeout(10); return 41; },
        _41 => _41 + 1
      ]
    };

    const cameleerDefaults = createExampleInstance(Schemas.CameleerDefaultsSchema);
    const resolved = await (new ResolvedConfig(taskConf, cameleerDefaults)).resolveAll();

    assert.approximately(resolved.cost, 1.5, .1e10);
    assert.isTrue(resolved.allowMultiple === true || resolved.allowMultiple === false);
    assert.isTrue(resolved.queues.length === 1 && resolved.queues[0] === 'q1');
    assert.strictEqual(resolved.progress, taskConf.progress);
    assert.strictEqual(resolved.schedule, taskConf.schedule);
    assert.isTrue(resolved.tasks.length === 2);
    assert.strictEqual(resolved.tasks[1].func(await resolved.tasks[0].func()), 42);
  });
});