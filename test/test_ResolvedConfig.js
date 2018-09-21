require('../meta/typedefs');

const { assert, expect } = require('chai')
, { assertThrowsAsync, timeout, ProgressNumeric, Interval,
  Resolve, ManualSchedule } = require('sh.orchestration-tools')
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
      /** @param {ResolvedResolveObject} resolveObj */
      queues: async function(resolveObj, task) {
        assert.strictEqual(arguments.length, 2);
        assert.strictEqual(task, void 0);

        assert.strictEqual(resolveObj.asd, 42);
        assert.strictEqual(resolveObj.bla, 17);
        assert.strictEqual(resolveObj.foo, true);
        assert.strictEqual(resolveObj.baz, null);
        assert.strictEqual(resolveObj.asd, 42);
        return ['q1'];
      },
      progress: new ProgressNumeric(0, 1),
      resolve: {
        asd: async() => { await timeout(50); return 42; },
        bla: 17,
        foo: new Promise((resolve, reject) => resolve(true)),
        baz: () => null
      },
      schedule: new Interval(100, () => Math.random(), 5, true, false, true),
      interruptTimeoutSecs: async() => 500,
      tasks: async() => [
        async() => { await timeout(10); return 41; },
        _41 => _41 + 1
      ]
    };

    const cameleerDefaults = createExampleInstance(Schemas.CameleerDefaultsSchema);
    const resolved = await (new ResolvedConfig(taskConf, cameleerDefaults.tasks)).resolveAll();

    assert.approximately(resolved.cost, 1.5, .1e10);
    assert.isTrue(resolved.allowMultiple === true || resolved.allowMultiple === false);
    assert.isTrue(resolved.queues.length === 1 && resolved.queues[0] === 'q1');
    assert.strictEqual(resolved.progress, taskConf.progress);
    assert.strictEqual(resolved.schedule, taskConf.schedule);
    assert.isTrue(resolved.tasks.length === 2);
    assert.strictEqual(resolved.interruptTimeoutSecs, 500);
    assert.strictEqual(resolved.tasks[1].func(await resolved.tasks[0].func()), 42);
  });

  it('should resolve partial Error-configs appropriately', async() => {
    /** @type {TaskConfig} */
    const taskConf = {
      name: 'foo',
      resolve: {
        dummy: async() => 42
      },
      schedule: rObj => {
        assert.strictEqual(rObj.dummy, 42);
        return new ManualSchedule();
      },
      tasks: [
        {
          func: () => 42,
          canFail: true
        },
        async() => 43,
        {
          func: async() => 44,
          canFail: {
            schedule: async() => new ManualSchedule()
          }
        },
        {
          func: () => 45,
          canFail: false
        },
        {
          func:() => 46,
          canFail: {
            continueOnFinalFail: false,
            schedule: async() => new ManualSchedule(),
            skip: async() => false,
            maxNumFails: 46
          }
        }
      ]
    };

    /** @type {CameleerDefaults} */
    const cameleerDefaults = createExampleInstance(Schemas.CameleerDefaultsSchema);
    const rc = new ResolvedConfig(taskConf, cameleerDefaults.tasks);
    await rc.resolveAll();

    const te0 = rc.tasks[0], te1 = rc.tasks[1], te2 = rc.tasks[2], te3 = rc.tasks[3], te4 = rc.tasks[4];
    
    assert.strictEqual(Schemas.FunctionalTaskErrorConfigSchema.validate(te0.canFail).error, null);
    assert.strictEqual(Schemas.FunctionalTaskErrorConfigSchema.validate(te1.canFail).error, null);
    assert.strictEqual(Schemas.FunctionalTaskErrorConfigSchema.validate(te2.canFail).error, null);
    assert.strictEqual(Schemas.FunctionalTaskErrorConfigSchema.validate(te3.canFail).error, null);
    assert.strictEqual(Schemas.FunctionalTaskErrorConfigSchema.validate(te4.canFail).error, null);

    assert.strictEqual(te0.canFail.continueOnFinalFail, true);
    assert.strictEqual(te0.canFail.maxNumFails, cameleerDefaults.tasks.maxNumFails);

    assert.strictEqual(te3.canFail.continueOnFinalFail, false);
    assert.strictEqual(te3.canFail.maxNumFails, 0);
  });
});