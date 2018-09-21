require('../meta/typedefs');

const { assert, expect } = require('chai')
, { assertThrowsAsync, mergeObjects, Interval } = require('sh.orchestration-tools')
, { Task } = require('../lib/cameleer/Task')
, { Cameleer, CameleerJob, symbolCameleerShutdown,
    symbolCameleerSchedule, symbolCameleerWork, symbolCameleerInterruptable } = require('../lib/cameleer/Cameleer')
, { ProgressNumeric, timeout, ManualSchedule,
    symbolDone, symbolRun, symbolFailed } = require('sh.orchestration-tools')
, { LogLevel } = require('sh.log-client')
, exampleConfInstance = require('../cli/config.example')
, {
  createDefaultCameleerConfig,
  StandardConfigProvider
} = require('../lib/cameleer/ConfigProvider');


/**
 * @returns {TaskConfig}
 */
const getExampleTask = (name = 'testTask') => {
  return {
    name,
    enabled: async() => true,
    skip: () => false,
    allowMultiple: false,
    queues: ['defaultQueue'],
    progress: new ProgressNumeric(0, 1),
    schedule: new ManualSchedule(),
    tasks: [
      async(job) => { await timeout(25); return job.context.value = 41; }
      , {
        name: 'fTask-two',
        func: async function(a1, job) {
          await timeout(50);
  
          if (this !== process) {
            throw new Error('this');
          }
          if (!job || !job.context || !job.context.value || job.context.value !== 41) {
            throw new Error('not 41');
          }
  
          return job.context.value += a1;
        }
        , thisArg: process
        , args: async() => [1]
      }
    ]
  };
};


const DefaultCameleerConfig = createDefaultCameleerConfig();


// Will use the default config but the task(s) from above
with (DefaultCameleerConfig.logging) {
  level = LogLevel.None;
  method = 'none';
};


describe('CameleerWork', function() {
  it('should throw if given invalid parameters', async() => {
    assert.throws(() => {
      new Cameleer(new Date());
    });

    assert.throws(() => {
      Cameleer.prototype._initializeLogging({ method: 'foo' });
    });

    return await (async() => {
      const testTaskCopy = getExampleTask();
      testTaskCopy.tasks = [
        async() => 42
      ]
      /** @type {CameleerConfig} */
      const cameleerConf = mergeObjects({}, DefaultCameleerConfig);
      cameleerConf.queues = [];
      const config = new StandardConfigProvider(cameleerConf, [ testTaskCopy ]);
      const c = new Cameleer(config);
      await c.loadTasks();


      const rc = await c._tasksArr[0].resolveConfig();

      assert.throws(() => {
        c._selectBestMatchingQueue(rc);
      });

      await assertThrowsAsync(async() => {
        await c.loadTasks();
      });

      // The following should NOT throw:
      await c.clearTasks();
      await c.loadTasks();
      return await c.shutdown();
    })();
  });

  it('should load our tasks successfully', async function() {
    assert.isTrue(DefaultCameleerConfig.defaults.tasks.schedule instanceof Function);
    assert.isTrue(DefaultCameleerConfig.defaults.tasks.schedule() instanceof Interval);

    const testTaskCopy = getExampleTask();
    const config = new StandardConfigProvider(DefaultCameleerConfig, [ testTaskCopy ]);
    const c = new Cameleer(config);

    await c.loadTasks();

    c.run();
    testTaskCopy.schedule.trigger();
    await timeout(50);
    // after this, the first task should be within its 2nd functional task

    /** @type {CameleerJob} */
    const cJob = c._queues.defaultQueue.queue.currentJobs[0];

    assert.strictEqual(cJob.results.length, 1);
    assert.strictEqual(cJob.results[0].value, 41);
    assert.isFalse(cJob.results[0].isError);
    assert.isTrue(cJob.context.value === 41);

    assert.strictEqual(cJob.functionalTasksDone.length, 1);
    assert.strictEqual(cJob.functionalTasksDone[0].name, '1');
    assert.approximately(cJob.functionalTasksProgress, .5, 1e-12);

    await timeout(75);
    assert.strictEqual(cJob.results.length, 2);
    assert.strictEqual(cJob.results[1].value, 42);
    assert.isFalse(cJob.results[1].isError);
    assert.isTrue(cJob.context.value === 42);

    assert.strictEqual(cJob.functionalTasksDone.length, 2);
    assert.strictEqual(cJob.functionalTasksDone[0].name, '1');
    assert.strictEqual(cJob.functionalTasksDone[1].name, '2 (fTask-two)');
    assert.strictEqual(cJob.functionalTasksProgress, 1);

    return await c.shutdown();
  });

  it('should handle multiple mixed functional tasks within a Task', async() => {
    const testTaskCopy = getExampleTask();
    const config = new StandardConfigProvider(DefaultCameleerConfig, [ testTaskCopy ]);

    testTaskCopy.tasks = [
      async() => { await timeout(50); return 41; },
      /**
       * @param {CameleerJob} job
       */
      function (job) {
        return job.result.value + 1;
      }
    ];

    const c = new Cameleer(config);

    await c.loadTasks();

    // Will resolve if stop() is awaited
    const startStopPromise = c.runAsync();
    let shutdownTriggered = false;
    const shutdownObs = c.observableShutdown.subscribe(() => {
      shutdownTriggered = true;
    });
    
    const taskObs = c.getObservableForWork(testTaskCopy.name);
    /** @type {CameleerJob} */
    let job = null;
    /** @type {Task} */
    let task = null;

    let obsSched = false, obsRun = false, obsDone = false, obsFail = false;
    const taskSubs = taskObs.subscribe(camWorkEvt => {
      if (camWorkEvt.type === symbolCameleerSchedule) {
        assert.strictEqual(camWorkEvt.job, null);
        task = camWorkEvt.task;
        obsSched = true;
      } else if (camWorkEvt.type === symbolRun) {
        assert.isTrue(camWorkEvt.job instanceof CameleerJob);
        job = camWorkEvt.job;
        obsRun = true;
      } else if (camWorkEvt.type === symbolDone) {
        obsDone = true;
      } else if (camWorkEvt.type === symbolFailed) {
        obsFail = true;
      }
    });

    /** @type {ManualSchedule} */
    const sched = testTaskCopy.schedule;
    sched.trigger();

    await timeout(25);
    assert.isTrue(c._isTaskRunning(task));

    // Now give Cameleer some time to process the task..
    await timeout(250);

    assert.strictEqual(job.results.length, 2);
    assert.strictEqual(job.result.value, 42);
    assert.strictEqual(job.results[0].value, 41);

    assert.isTrue(obsSched);
    assert.isTrue(obsRun);
    assert.isTrue(obsDone);
    assert.isFalse(obsFail);

    return await Promise.all([ startStopPromise, c.shutdown() ]);
  });

  it('should not run tasks if no queues are available', async() => {
    const testTaskCopy = getExampleTask();
    /** @type {CameleerConfig} */
    const cameleerConfCopy = mergeObjects({}, DefaultCameleerConfig);
    cameleerConfCopy.queues = [];
    const config = new StandardConfigProvider(cameleerConfCopy, [ testTaskCopy ]);

    testTaskCopy.tasks = [{
      func: () => 42
    }];

    const c1 = new Cameleer(config);
    await c1.loadTasks();

    let scheduleObserved = false;
    let interruptableObserverd = false;
    let numWorkObserved = 0;
    c1.getObservableForWork(testTaskCopy.name).subscribe(camWorkEvt => {
      if (camWorkEvt.type === symbolCameleerSchedule) {
        scheduleObserved = true;
        return; // that will happen, but the task should not execute
      }
      if (camWorkEvt.type === symbolCameleerInterruptable) {
        interruptableObserverd = true;
        return; // This should also happen
      }
      numWorkObserved++; // This should never happen as there are no queues
    });
    
    const runObs = c1.runAsync();
    testTaskCopy.schedule.trigger();
    await timeout(100);
    await c1.shutdown();
    await runObs;

    assert.isTrue(scheduleObserved);
    assert.isTrue(interruptableObserverd);
    assert.strictEqual(numWorkObserved, 0);

    return await c1.shutdown();
  });

  it('should not crash Cameleer if a Job is entirely erroneous', async function() {
    this.timeout(5000);
    
    const testTaskCopy = getExampleTask();
    const config = new StandardConfigProvider(DefaultCameleerConfig, [ testTaskCopy ]);

    testTaskCopy.tasks = [{
      func: () => { throw '42'; },
      canFail: false
    }];

    const c = new Cameleer(config);
    await c.loadTasks();

    let failed = false;
    c.getObservableForWork(testTaskCopy.name).subscribe(camWorkEvt => {
      if (camWorkEvt.type === symbolFailed) {
        failed = true;
      }
    });

    const runPromise = c.runAsync();
    testTaskCopy.schedule.trigger();

    await timeout(150);
    assert.isTrue(failed);

    await Promise.all([ runPromise, c.shutdown() ]);
  });

  it('should select the default queue if available and task does not specify', async function() {
    const testTaskCopy = getExampleTask();
    const conf = createDefaultCameleerConfig();
    conf.logging.method = 'none';
    conf.queues = [{
      name: 'q1',
      isDefault: true,
      enabled: true,
      type: 'cost',
      capabilities: 4.3
    }];
    
    // Do not select any queues
    delete testTaskCopy.queues;
    testTaskCopy.cost = 2.7;

    const m = new ManualSchedule();
    testTaskCopy.schedule = m;

    testTaskCopy.tasks = [async() => { await timeout(100); }];

    const config = new StandardConfigProvider(conf, [ testTaskCopy ]);
    const cameleer = new Cameleer(config);
    const cq = cameleer._queuesArr[0];
    assert.strictEqual(cameleer._queuesArr.length, 1);

    await cameleer.loadTasks();
    const runPromise = cameleer.runAsync();

    m.triggerNext();
    await timeout(50);
    assert.isTrue(cq.queue.isWorking);

    await Promise.all([ runPromise, cameleer.shutdown() ]);
  });

  it('should not enqueue tasks if their config cannot be resolved', async() => {
    const conf = createDefaultCameleerConfig();
    conf.logging.method = 'none';
    const testTaskCopy = getExampleTask();
    const ms = new ManualSchedule();
    testTaskCopy.schedule = ms;
    let x = false;
    testTaskCopy.allowMultiple = async() => {
      await timeout(10);
      if (!x) {
        x = true;
        throw 'FU';
      }
      throw new Error('FU');
    };
    const config = new StandardConfigProvider(conf, [ testTaskCopy ]);
    const cameleer = new Cameleer(config);

    await cameleer.loadTasks();

    const runPromise = cameleer.runAsync();
    ms.trigger();

    await timeout(100);

    ms.trigger();
    await timeout(100);

    const cq = cameleer._queuesArr[0];
    assert.strictEqual(cq.queue.numJobsDone, 0);
    assert.strictEqual(cq.queue.numJobsRunning, 0);
    assert.strictEqual(cq.queue.numJobsFailed, 0);

    await Promise.all([ runPromise, cameleer.shutdown() ]);
  });

  it('should not enqueue tasks that are to be skipped are non-multiple', async() => {
    const conf = createDefaultCameleerConfig();
    conf.logging.method = 'none';
    const m1 = new ManualSchedule(), m2 = new ManualSchedule();
    
    const t1 = getExampleTask();
    t1.name = 't1';
    t1.allowMultiple = false;
    t1.schedule = m1;
    t1.tasks = [async() => { await timeout(100) }];

    const t2 = getExampleTask();
    t2.name = 't2';
    t2.skip = async() => { await timeout(5); return true; };
    t2.schedule = m2;
    
    const config = new StandardConfigProvider(conf, [ t1, t2 ]);
    const cameleer = new Cameleer(config);

    const runPromise = cameleer.runAsync();

    await cameleer.loadTasks();
    m1.triggerNext();
    m2.triggerNext();
    // t1 runs, t2 is skipped -> but t1 is not allowed mutliple times

    await timeout(50); // t2 should be done (and t1 running)
    assert.isTrue(cameleer._isTaskEnqueuedOrRunning(cameleer._tasks['t1']));
    const q = cameleer._queuesArr[0].queue;
    assert.strictEqual(q.numJobsDone, 0);
    assert.strictEqual(q.numJobsRunning, 1);
    assert.strictEqual(q.numJobsFailed, 0);
    assert.isTrue(q.utilization > 0);

    m1.triggerNext();
    await timeout(25);
    assert.strictEqual(q.backlog, 0); // should not have been enqueued

    await timeout(50);
    assert.strictEqual(q.numJobsDone, 1);
    assert.strictEqual(q.numJobsRunning, 0);
    assert.strictEqual(q.numJobsFailed, 0);
    assert.strictEqual(q.utilization, 0);

    await Promise.all([ runPromise, cameleer.shutdown() ]);
  });

  it('should throw if the task demands Queues not defined', async() => {
    const testTaskCopy = getExampleTask();
    const conf = createDefaultCameleerConfig();
    conf.logging.method = 'none';
    
    testTaskCopy.queues = ['notExistingQueue'];
    const m = new ManualSchedule();
    testTaskCopy.schedule = m;

    testTaskCopy.tasks = [async() => { await timeout(100); }];

    const config = new StandardConfigProvider(conf, [ testTaskCopy ]);
    const cameleer = new Cameleer(config);

    await cameleer.loadTasks();
    const resolvedConf = await cameleer._tasksArr[0].resolveConfig();

    assert.throws(() => {
      cameleer._selectBestMatchingQueue(resolvedConf);
    }, /None of the Queues as demanded by task/i);

    await cameleer.shutdown();
  });

  it('should only select appropriate Queues for a Task', async() => {
    const conf = createDefaultCameleerConfig();
    conf.logging.method = 'none';
    conf.queues = [{
      enabled: true,
      name: 'q0',
      type: 'parallel',
      parallelism: 10
    }, {
      enabled: true,
      name: 'q1',
      type: 'cost',
      capabilities: 1.5,
      allowExclusiveJobs: false
    }, {
      enabled: true,
      name: 'q2',
      type: 'cost',
      capabilities: 2.5,
      allowExclusiveJobs: false
    }, {
      enabled: true,
      name: 'q3',
      type: 'cost',
      capabilities: 0.5,
      allowExclusiveJobs: true
    }];

    const t1 = getExampleTask('t1');
    const t2 = getExampleTask('t2');
    const t3 = getExampleTask('t3');

    t1.cost = 1.1;
    t2.cost = 2.1;
    t3.cost = 4.5;

    t1.queues = t2.queues = t3.queues = ['q0', 'q1', 'q2', 'q3'];

    const config = new StandardConfigProvider(conf, [ t1, t2, t3 ]);
    const cameleer = new Cameleer(config);

    await cameleer.loadTasks();
    const [r1, r2, r3] = await Promise.all([
      cameleer._tasks['t1'].resolveConfig(),
      cameleer._tasks['t2'].resolveConfig(),
      cameleer._tasks['t3'].resolveConfig()
    ]);

    let q = cameleer._selectBestMatchingQueue(r1);
    assert.strictEqual(q.name, 'q2');

    q = cameleer._selectBestMatchingQueue(r2);
    assert.strictEqual(q.name, 'q2');

    q = cameleer._selectBestMatchingQueue(r3);
    assert.strictEqual(q.name, 'q3');

    await cameleer.shutdown();
  });

  it(`should have its Tasks remain in the Queue's backlog if too busy`, async() => {
    const conf = createDefaultCameleerConfig();
    conf.logging.method = 'none';
    const t1 = getExampleTask('t1');
    const m1 = new ManualSchedule();
    t1.allowMultiple = true;
    t1.schedule = m1;
    t1.tasks = [{
      func: async() => await timeout(150)
    }];

    const config = new StandardConfigProvider(conf, [ t1 ]);
    const cameleer = new Cameleer(config);

    await cameleer.loadTasks();
    const runPromise = cameleer.runAsync();

    m1.triggerNext();
    await timeout(50);
    assert.isTrue(cameleer._isTaskRunning(cameleer._tasks['t1']));
    assert.isFalse(cameleer._isTaskEnqueued(cameleer._tasks['t1']));

    m1.triggerNext();
    await timeout(50);
    assert.isTrue(cameleer._isTaskRunning(cameleer._tasks['t1']));
    assert.isTrue(cameleer._isTaskEnqueued(cameleer._tasks['t1']));

    await cameleer.shutdown();
    await runPromise;
  });

  it('should support interruptable tasks (and those that are not)', async() => {
    const conf = createDefaultCameleerConfig();
    conf.logging.method = 'none';
    const m1 = new ManualSchedule();
    const t1 = getExampleTask('t1');
    t1.interruptTimeoutSecs = 30;
    t1.schedule = m1;
    t1.tasks = [{
      func: async() => await timeout(150)
    }];

    const config = new StandardConfigProvider(conf, [ t1 ]);
    const cameleer = new Cameleer(config);

    await cameleer.loadTasks();

    let scheduleObserved = false;
    let interruptableObserverd = false;

    cameleer.observableWork.subscribe(camWorkEvt => {
      if (camWorkEvt.type === symbolCameleerSchedule) {
        scheduleObserved = true;
        return;
      }
      if (camWorkEvt.type === symbolCameleerInterruptable) {
        cameleer.interruptJob(camWorkEvt.job);
        interruptableObserverd = true;
        return;
      }

      throw new Error(); // we shall not get here..
    });

    const runPromise = cameleer.runAsync();
    
    m1.triggerNext();

    await timeout(50);
    assert.isTrue(scheduleObserved);
    assert.isTrue(interruptableObserverd);

    const q = cameleer._queuesArr[0].queue;
    assert.isTrue(q.workDone === 0 && q.workFailed === 0);

    await cameleer.shutdown();
    await runPromise;
  });
});


module.exports = Object.freeze({
  getExampleTask
});
