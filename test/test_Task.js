require('../meta/typedefs');

const { assert, expect } = require('chai')
, { assertThrowsAsync, mergeObjects } = require('sh.orchestration-tools')
, { DevNullLogger } = require('sh.log-client')
, { Task } = require('../lib/cameleer/Task')
, { createExampleTaskConfig } = require('./helpers')
, { TaskConfigSchema, SimpleTaskConfigSchema } = require('../meta/schemas')
, { getExampleTask } = require('./test_CameleerWork')
, exampleConfInstance = require('../cli/config.example')
, exampleCameleerConf = exampleConfInstance.cameleerConfig
, util = require('util')
, Joi = require('joi');



class X extends Task {
  /**
   * @param {TaskConfig} config
   * @param {CameleerDefaults} defaults
   */
  constructor(config, defaults) {
    super(config, defaults);
  };
  
  get schemaConf() {
    return Joi.concat(Joi.object().keys({
      myConfProp: Joi.number().greater(1).less(2).required().strict()
    })).concat(TaskConfigSchema);
  };
};


class Y extends Task {};


describe('Task', () => {
  it('should provide an immutable Map with registered sub-classes', done => {
    const org1 = Task.registeredSubclasses;
    const org2 = Task.registeredSubclasses;

    assert.notEqual(org1, org2);

    Task.registerSubclass(Y);
    const org3 = Task.registeredSubclasses;
    assert.notEqual(org2, org3);

    Task.registeredSubclasses.delete('Y');

    const org4 = Task.registeredSubclasses;
    assert.isTrue(org4.has('Y'));
    
    const Y_Class = Task.unregisterSubclass(Y.name);
    assert.isTrue(!Task.registeredSubclasses.has('Y'));
    assert.strictEqual(Y_Class, Y);

    done();
  });

  it('should throw if given invalid arguments', done => {
    assert.throws(() => {
      new Task({
        enabled: async() => true
      });
    });

    assert.throws(() => {
      new Task({
        enabled: true,
        schedule: null
      });
    });

    assert.throws(() => {
      Task.registerSubclass(Date);
    });

    assert.throws(() => {
      Task.unregisterSubclass(Date);
    });
    assert.throws(() => {
      Task.unregisterSubclass(new Date);
    });
    assert.throws(() => {
      Task.unregisterSubclass(Y);
    });

    done();
  });

  it('should not allow changing the logger, once set', done => {
    /** @type {TaskConfig} */
    const exampleTask = getExampleTask();

    exampleTask.enabled = true;
    exampleTask.tasks.splice(1, 1);
    const t = Task.fromConfiguration(exampleTask, exampleCameleerConf.defaults);


    assert.throws(() => {
      t.logger.log();
    });

    assert.throws(() => {
      t.logger = new Date();
    });

    assert.throws(() => {
      const l = new DevNullLogger('ffoo');
      t.logger = l;
      t.logger = l;
    });

    assert.isFalse(t.hasCost);

    const config = mergeObjects({}, exampleTask);
    config.cost = 1.5;
    const t2 = Task.fromConfiguration(config, exampleCameleerConf.defaults);
    assert.isTrue(t2.hasCost);

    done();
  });

  it('should allow instantiation of subclasses that have their own extended config', done => {
    const conf = createExampleTaskConfig('X');

    assert.throws(() => {
      new X(conf, exampleCameleerConf.defaults); // X requires 'myConfProp' (not yet added)
    });

    conf.myConfProp = 1.5;
    new X(conf, exampleCameleerConf.defaults);

    assert.throws(() => {
      conf.myConfProp = 2.1;
      new X(conf, exampleCameleerConf.defaults);
    });

    assert.throws(() => {
      Task.registerSubclass(X);
      Task.registerSubclass(X);
    });

    done();
  });

  it('should be able to create the right subclass from configuration', done => {
    const conf = createExampleTaskConfig('Y');
    assert.throws(() => {
      const y = Task.fromConfiguration(conf, exampleCameleerConf.defaults);
    });

    Task.registerSubclass(Y);
    const y = Task.fromConfiguration(conf, exampleCameleerConf.defaults);

    assert.isTrue(y instanceof Y);

    done();
  });
});
