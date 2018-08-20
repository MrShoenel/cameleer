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
, { CameleerConfigSchema } = require('../meta/schemas')
, fs = require('fs')
, fsProm = fs.promises;



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
  it('should handle global rejections or uncaught errors', async() => {
    const camConf = createDefaultCameleerConfig();
    camConf.logging.method = 'none';
    const std = new StandardConfigProvider(camConf, []);
    const cameleer = new Cameleer(std);

    new Promise((res, rej) => {
      rej();
    });

    // We cannot actually throw an Error that will be unhandled..
    // setTimeout(() => {
    //   throw new Error();
    // }, 50);
    cameleer._handleUncaughtErrors(new Error('42'));
    cameleer._handleUncaughtErrors({ foo: 42 });

    await timeout(150);

    assert.isTrue(true);
    await cameleer.shutdown();


    camConf.defaults.handleGlobalErrors = false;
    camConf.defaults.handleGlobalRejections = false;
    const cam2 = new Cameleer(new StandardConfigProvider(camConf)); // to cover the else-branch
    await cam2.shutdown();
  });

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

  it('should be able to also load Task-instances', async() => {
    const camConf = createDefaultCameleerConfig();
    camConf.logging.method = 'none';
    const std = new StandardConfigProvider(camConf, [Task.fromConfiguration({
      name: 'foo',
      enabled: true,
      schedule: new ManualSchedule()
    }, camConf.defaults)]);

    const c = new Cameleer(std);
    await c.loadTasks();

    assert.strictEqual(c._tasksArr.length, 1);
    assert.isTrue(c._tasks['foo'] instanceof Task);

    // We should also be able to obtain an Observable by instance:
    const obs = c.getObservableForWork(c._tasks['foo']);
    assert.isTrue(obs instanceof Observable);

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
    delete camConf.defaults.handleGlobalErrors;
    delete camConf.defaults.handleGlobalRejections;
    delete camConf.defaults.staticTaskContextSerializeInterval;

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
    }, /More than one default queue for type 'cost'/i);


    // Also check parallel queues:
    camConf.queues[0].parallelism = 2;
    camConf.queues[0].type = 'parallel';
    camConf.queues[1].parallelism = 2;
    camConf.queues[1].type = 'parallel';

    assert.throws(() => {
      new Cameleer(new StandardConfigProvider(camConf));
    }, /More than one default queue for type 'parallel'/i);
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

  it('should allow accessing and storing static context', async() => {
    let numExec = 0;

    const sched = new ManualSchedule();
    const camConf = createDefaultCameleerConfig();
    camConf.logging.method = 'none';
    camConf.logging.numInMemory = 0;
    const std = new StandardConfigProvider(camConf, [{
      name: 'FooTask',
      /** @param {Task} task */
      skip: async(rro, task) => {
        assert.isTrue(task instanceof Task);
        assert.isTrue(!!task.staticContext);

        if (numExec === 0) {
          assert.isFalse('foo' in task.staticContext);
          task.staticContext['foo'] = 42;
        } else if (numExec === 1) {
          assert.isTrue('foo' in task.staticContext);
          assert.strictEqual(task.staticContext.foo, 42);
        } else {
          throw new Error('Should not happen!');
        }

        numExec++;
        return true;
      },
      schedule: sched
    }]);


    const c1 = new Cameleer(std);
    if (fs.existsSync(c1._staticTaskContextFile)) {
      await fsProm.unlink(c1._staticTaskContextFile);
    }
    let runProm = c1.runAsync();
    await c1.loadTasks();
    sched.triggerNext();
    await timeout(100);
    await Promise.all([ runProm, c1.shutdown() ]);

    assert.strictEqual(numExec, 1);


    // Now run another cameleer instance
    const c2 = new Cameleer(std);
    assert.isTrue(fs.existsSync(c2._staticTaskContextFile));
    runProm = c2.runAsync();
    await c2.loadTasks();
    sched.triggerNext();
    await timeout(100);
    await Promise.all([ runProm, c2.shutdown() ]);

    assert.strictEqual(numExec, 2);


    // Let's check how it looks if the static context cannot be written..
    const c3 = new Cameleer(std);
    runProm = c3.runAsync();
    await c3.loadTasks();
    const fileBefore = c3._staticTaskContextFile;
    c3._staticTaskContextFile = '/invalid:///file.ser';

    await assertThrowsAsync(async() => {
      await c3._saveStaticTaskContext();
    });
    c3._staticTaskContextFile = fileBefore; // Otherwise, shutdown() throws

    await Promise.all([ runProm, c3.shutdown() ]);
  });
});