require('../meta/typedefs');

const { assert, expect } = require('chai')
, { inspect } = require('util')
, { Observable } = require('rxjs')
, { assertDoesNotThrowAsync } = require('./helpers')
, { assertThrowsAsync, mergeObjects, ProgressNumeric,
  timeout, ManualSchedule, Calendar, Interval, symbolDone,
  CalendarScheduler, IntervalScheduler, ManualScheduler,
  symbolRun, symbolFailed, Schedule, Resolve
} = require('sh.orchestration-tools')
, { Task } = require('../lib/cameleer/Task')
, { Cameleer, CameleerJob, JobFailError, symbolCameleerShutdown,
    symbolCameleerSchedule, symbolCameleerWork } = require('../lib/cameleer/Cameleer')
, { LogLevel } = require('sh.log-client')
, {
  createDefaultCameleerConfig,
  StandardConfigProvider
} = require('../lib/cameleer/ConfigProvider')
, { Control } = require('../lib/control/Control')
, { Manager } = require('../lib/manager/Manager')
, { CameleerConfigSchema } = require('../meta/schemas');



describe('JobFailError', function() {
  it('should construct well with default arguments', done => {
    const e = new JobFailError();
    assert.strictEqual(e.previousError, void 0);
    assert.strictEqual(e.message, '');

    const e1 = new JobFailError('42');
    assert.strictEqual(e1.previousError, '42');
    assert.strictEqual(e1.message, '42');

    const dummy = { foo: true, bar: 1.234 };
    const e2 = new JobFailError(dummy);
    assert.strictEqual(e2.previousError, dummy);
    assert.strictEqual(e2.message, inspect(dummy));

    done();
  });
});



describe('CameleerJob', function() {
  it('should throw if given invalid arguments', async() => {
    const task = Task.fromConfiguration({
      name: 't1',
      enabled: true,
      schedule: new ManualSchedule()
    }, createDefaultCameleerConfig().defaults);

    const rConfig = await task.resolveConfig();


    assert.throws(() => {
      new CameleerJob(null, null);
    }, /The task given is not an instance of/i);

    assert.throws(() => {
      new CameleerJob(task, null);
    }, /The resolvedConfig given is not an instance of/i);

    assert.doesNotThrow(() => {
      const j = new CameleerJob(task, rConfig);
      assert.strictEqual(j.functionalTasksProgress, 0);
    });
  });

  it('should always throw an error of type JobFailError', async() => {
    const task = Task.fromConfiguration({
      name: 't1',
      enabled: true,
      schedule: new ManualSchedule()
    }, createDefaultCameleerConfig().defaults);

    const rConfig = await task.resolveConfig();

    assert.doesNotThrow(() => {
      rConfig.tasks.join('');
    });


    // Now let's interfere with internals and simulate an Error where
    // it never should happen.
    Object.defineProperty(rConfig, 'tasks', {
      get: () => { throw '42'; }
    });

    assert.throws(() => {
      console.log(rConfig.tasks);
    }, /42/);

    await assertDoesNotThrowAsync(async() => {
      let threw = false;
      try {
        await (new CameleerJob(task, rConfig)).run();
      } catch (e) {
        threw = true;
        assert.isTrue(e instanceof JobFailError);
        assert.strictEqual(e.previousError, '42');
      } finally {
        assert.isTrue(threw);
      }
    });
  });
});


describe('Cameleer', function() {
  it('should not configurations with duplicate task-names', async() => {
    const camConf = createDefaultCameleerConfig();
    camConf.logging.method = 'none';
    const std = new StandardConfigProvider(camConf, [{
      name: 'foo'
    }, {
      name: 'foo'
    }]);

    const c = new Cameleer(std);

    await assertThrowsAsync(async() => {
      await c.loadTasks();
    });

    await c.shutdown();
  });

  it('should never enqueue tasks that are not enabled', async() => {
    const camConf = createDefaultCameleerConfig();
    camConf.logging.method = 'none';
    const std = new StandardConfigProvider(camConf, [{
      name: 'foo',
      enabled: async() => false,
      schedule: new ManualSchedule()
    }]);

    const c = new Cameleer(std);
    await c.loadTasks();

    assert.strictEqual(c._tasksArr.length, 0);
    await c.shutdown();
  });

  it('should properly tear down Managers and Controllers', async() => {    
    const camConf = createDefaultCameleerConfig();
    camConf.logging.method = 'none';
    camConf.managers.push({
      type: 'Manager'
    });
    camConf.controls.push({
      type: Control
    });
    const std = new StandardConfigProvider(camConf);

    const c = new Cameleer(std);
    assert.strictEqual(c._managers.length, 1);
    assert.isTrue(c.hasManagers);
    assert.strictEqual(c._controllers.length, 1);
    assert.isTrue(c.hasControls);

    await c.shutdown();
    assert.strictEqual(c._managers.length, 0);
    assert.isFalse(c.hasManagers);
    assert.strictEqual(c._controllers.length, 0);
    assert.isFalse(c.hasControls);
  });

  it('should return the correct Scheduler', async() => {
    const camConf = createDefaultCameleerConfig();
    camConf.logging.method = 'none';
    const std = new StandardConfigProvider(camConf);

    const c = new Cameleer(std);

    class UnknowSchedule extends Schedule {
      constructor() { super(); };
    };

    assert.throws(() => {
      c._getSchedulerForSchedule(new UnknowSchedule());
    });

    assert.isTrue(c._getSchedulerForSchedule(new Calendar('a', () => '')) instanceof CalendarScheduler);
    assert.isTrue(c._getSchedulerForSchedule(new Interval(1)) instanceof IntervalScheduler);
    assert.isTrue(c._getSchedulerForSchedule(new ManualSchedule()) instanceof ManualScheduler);

    await c.shutdown();
  });

  it('should work with incomplete (optional) configuration', async() => {
    const camConf = createDefaultCameleerConfig();
    camConf.logging.method = 'none';

    delete camConf.controls;
    delete camConf.managers;

    class NonChangingConfProv extends StandardConfigProvider {
      constructor(cam, tasks) {
        super(cam, tasks);
        this.cameleerConfig = cam;
        this.tasks = tasks;
      };
    };


    const c = new Cameleer(new NonChangingConfProv(camConf));
    assert.isTrue(Resolve.isTypeOf(c._controllers, []));
    assert.isTrue(Resolve.isTypeOf(c._managers, []));

    assert.doesNotThrow(() => {
      assert.strictEqual(c._managers.concat(c._controllers).length, 0);
    });

    await c.shutdown();
  });

  it('should throw when an invalid config is encountered', async() => {
    const camConf = createDefaultCameleerConfig();
    camConf.logging.method = 'none';

    assert.doesNotThrow(() => {
      Cameleer._checkAgainstSchema(camConf, CameleerConfigSchema);
    });


    delete camConf.queues; // This is required..
    assert.throws(() => {
      Cameleer._checkAgainstSchema(camConf, CameleerConfigSchema);
    })
  });

  it('should throw if more than one default queue per type is defined', async() => {
    const camConf = createDefaultCameleerConfig();
    camConf.logging.method = 'none';

    camConf.queues.splice(0, camConf.queues.length);
    camConf.queues.push({
      enabled: true,
      name: 'q1',
      type: 'cost',
      capabilities: 2.5,
      isDefault: true
    }, {
      enabled: true,
      name: 'q2',
      type: 'cost',
      capabilities: 1.5,
      isDefault: true
    });

    assert.throws(() => {
      new Cameleer(new StandardConfigProvider(camConf));
    }, /More than one default queue for type/i);
  });

  it('should schedule a keep-alive until the next day', async function() {
    this.timeout(5000);

    const camConf = createDefaultCameleerConfig();
    camConf.logging.method = 'none';
    const std = new StandardConfigProvider(camConf);
    const c = new Cameleer(std);

    const toNextDay = () => {
      const d = new Date();
      return 864e5 - (d.getMilliseconds() + d.getSeconds() * 1e3 + d.getMinutes() * 6e4 + d.getHours() * 36e5);
    };


    let kaMsecsLeft = c._keepAliveInterval._idleTimeout;
    assert.approximately(kaMsecsLeft, toNextDay(), 500);

    // Now we wait 2 seconds, elapse the timeout and check again
    await timeout(2000);
    c._keepAliveInterval._onTimeout();

    kaMsecsLeft = c._keepAliveInterval._idleTimeout;
    assert.approximately(kaMsecsLeft, toNextDay(), 500);

    await c.shutdown();
  });

  it('should always keep the last log-message, even when disabled', async() => {
    const camConf = createDefaultCameleerConfig();
    camConf.logging.method = 'none';
    camConf.logging.numInMemory = 0;
    const std = new StandardConfigProvider(camConf);

    const c = new Cameleer(std);
    assert.strictEqual(c.inMemoryLogger.numMessages, 1);

    await c.shutdown();
  });
});