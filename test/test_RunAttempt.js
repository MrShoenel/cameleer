require('../meta/typedefs');

const { assert, expect } = require('chai')
, { assertThrowsAsync, timeout, mergeObjects, ManualSchedule } = require('sh.orchestration-tools')
, { DevNullLogger } = require('sh.log-client')
, { CameleerJob } = require('../lib/cameleer/Cameleer')
, { Task } = require('../lib/cameleer/Task')
, { ResolvedConfig } = require('../lib/cameleer/ResolvedConfig')
, { RunAttempt, ErrorTypes, AttemptError } = require('../lib/cameleer/RunAttempt')
, { Result, ErrorResult } = require('../lib/cameleer/Result')
, { getExampleTask } = require('./test_CameleerWork')
, { cameleerConfig } = require('../cli/config.example');



/**
 * @param {TaskConfig} taskConf 
 * @param {CameleerDefaults} defaults
 * @returns {CameleerJob}
 */
const createCamJob = async(taskConf, defaults) => {
  const taskInstance = Task.fromConfiguration(taskConf, defaults);
  const resolvedConf = await taskInstance.resolveConfig();

  const cJob = new CameleerJob(taskInstance, resolvedConf);

  cJob.task.logger = new DevNullLogger('foo');
  return cJob;
};


/**
 * @param {SimpleTaskConfig|(() => (SimpleTaskConfig|Promise.<SimpleTaskConfig>))} [tasks] defaults to []
 * @returns {TaskConfig}
 */
const createTasks = (tasks = []) => {
  /** @type {TaskConfig} */
  const t = getExampleTask();
  t.enabled = true;
  t.tasks = tasks;
  return t;
};



describe('RunAttempt', function() {

  /** @type {FunctionalTaskConfig} */
  const funcTaskConf = {
    func: async() => { await timeout(10); return 42; }
  };

  /** @type {FunctionalTaskConfig} */
  const funcTaskConf41 = {
    func: () => { return 41; }
  };

  /** @type {FunctionalTaskConfig} */
  const funcTaskConfErrArgs = {
    func: () => {},
    args: async() => { throw new Error() }
  };

  /** @type {FunctionalTaskConfig} */
  const funcTaskConfErr = {
    func: async() => { throw '42'; },
    canFail: {
      maxNumFails: 0
    }
  };

  /** @type {FunctionalTaskConfig} */
  const funcTaskConfErrConfErr = {
    func: async() => { throw 42; },
    canFail: {
      schedule: async() => new Date()
    }
  };

  /** @type {FunctionalTaskConfig} */
  const funcTaskConfErrSkip = {
    func: () => { throw '42'; },
    canFail: {
      schedule: () => new ManualSchedule(),
      skip: async() => { await timeout(50); return true; }
    }
  };

  /** @type {FunctionalTaskConfig} */
  const funcTaskConfMustNotFail = {
    func: () => { throw '42'; },
    canFail: false
  };


  it('should handle intermediate or previous results accordingly', async() => {
    const exTask = createTasks([ funcTaskConf41 ]);
    const cJob = await createCamJob(exTask, cameleerConfig.defaults);

    const ra = new RunAttempt(cJob.conf.tasks[0], cJob);

    await cJob.run();
    assert.strictEqual(ra.previousResult.value, 41);
  });


  it('should throw for functional tasks that fail or that fail to resolve their args', async() => {
    const exampleTask = createTasks([funcTaskConfErrArgs]);
    const cJob = await createCamJob(exampleTask, cameleerConfig.defaults);

    const ra = new RunAttempt(cJob.conf.tasks[0], cJob);

    assert.strictEqual(cJob.result, void 0);
    assert.strictEqual(ra.previousResult, void 0);

    await assertThrowsAsync(async() => {
      await ra.run();
    });

    await assertThrowsAsync(async() => {
      exampleTask.tasks = [funcTaskConfErr];
      let cJob = await createCamJob(exampleTask, cameleerConfig.defaults);
      await cJob.run();
    });
  });

  it('should throw for erroneous Error-configurations', async() => {
    const exampleTask = createTasks([ funcTaskConfErrConfErr ]);
    const cJob = await createCamJob(exampleTask, cameleerConfig.defaults);

    const ra = new RunAttempt(cJob.conf.tasks[0], cJob);

    let threw = false;
    try {
      await ra.run();
    } catch (attErr) {
      threw = true;
      assert.isTrue(attErr instanceof AttemptError);
      assert.strictEqual(attErr.errType, 'resolveErrConf')
    } finally {
      assert.isTrue(threw);
    }
  });

  it('should skip skippable errored tasks or hard-fail those that must not fail', async() => {
    const exampleTask = createTasks([ funcTaskConfErrSkip, funcTaskConfMustNotFail ]);
    const cJob = await createCamJob(exampleTask, cameleerConfig.defaults);

    const ra0 = new RunAttempt(cJob.conf.tasks[0], cJob); // skippable
    const ra1 = new RunAttempt(cJob.conf.tasks[1], cJob); // must not fail

    const r0 = await ra0.run();
    assert.isTrue(r0 instanceof Result);
    assert.isTrue(r0.isError); // Result.fromError

    let threw = false;
    try {
      await ra1.run();
    } catch (attErr) {
      threw = true;
      assert.isTrue(attErr instanceof AttemptError);
      assert.strictEqual(attErr.errType, 'finalFail');
    } finally {
      assert.isTrue(threw);
    }
  });

  it('should, if running errored, not attempt twice', async function() {
    this.timeout(60000);
    const ms = new ManualSchedule();

    /** @type {Array.<FunctionalTaskConfig>} */
    const fTasks = [{
      func: async job => {
        if (!job.context.hasOwnProperty('x')) {
          job.context.x = 0;
          throw new Error('Will only succeed once failed');
        }
        job.context.x++;
        if (job.context.x > 1) {
          throw new Error('That should not happen. Task is attempted once, then errors and succeeds.');
        }

        await timeout(200); // We will attempt to schedule this job again while it is attempting
        return 84;
      },
      /** @type {FunctionalTaskErrorConfig} */
      canFail: {
        schedule: async() => {
          await timeout(5);
          timeout(50).then(() => {
            ms.trigger('should be blocked');
          });
          return ms;
        }
      }
    }];


    const exampleTask = createTasks(fTasks);
    const cJob = await createCamJob(exampleTask, cameleerConfig.defaults);

    const r = await cJob.run();
    assert.strictEqual(cJob.result, r);
  });
});