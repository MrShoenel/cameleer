require('../meta/typedefs');

const { assert, expect } = require('chai')
, { assertThrowsAsync, mergeObjects } = require('sh.orchestration-tools')
, { DevNullLogger } = require('sh.log-client')
, { Task } = require('../lib/cameleer/Task')
, { createExampleTaskConfig } = require('./helpers')
, { TaskConfigSchema, SimpleTaskConfigSchema } = require('../meta/schemas')
, { getExampleTask } = require('./test_CameleerWork')
, { SubClassRegister } = require('../tools/SubClassRegister')
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
    const org1 = SubClassRegister.getRegisteredSubclasses(Task);
    const org2 = SubClassRegister.getRegisteredSubclasses(Task);

    assert.notEqual(org1, org2);

    SubClassRegister.registerSubclass(Task, Y);
    const org3 = SubClassRegister.getRegisteredSubclasses(Task);
    assert.notEqual(org2, org3);

    SubClassRegister.getRegisteredSubclasses(Task).delete('Y');

    const org4 = SubClassRegister.getRegisteredSubclasses(Task);
    assert.isTrue(org4.has('Y'));
    
    const Y_Class = SubClassRegister.unregisterSubclass(Task, Y.name);
    assert.isTrue(!SubClassRegister.getRegisteredSubclasses(Task).has('Y'));
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
      SubClassRegister.registerSubclass(Task, Date);
    });

    assert.throws(() => {
      SubClassRegister.unregisterSubclass(Task, Date);
    });
    assert.throws(() => {
      SubClassRegister.unregisterSubclass(Task, new Date);
    });
    assert.throws(() => {
      SubClassRegister.unregisterSubclass(Task, Y);
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

    SubClassRegister.registerSubclass(Task, Y);
    const y = Task.fromConfiguration(conf, exampleCameleerConf.defaults);

    assert.isTrue(y instanceof Y);

    done();
  });
});
