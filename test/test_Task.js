require('../meta/typedefs');

const { assert, expect } = require('chai')
, { assertThrowsAsync } = require('sh.orchestration-tools')
, { Task } = require('../lib/cameleer/Task')
, { createExampleTaskConfig } = require('./helpers')
, { TaskConfigSchema } = require('../meta/schemas')
, Joi = require('joi');



class X extends Task {
  /**
   * @param {TaskConfig} config
   */
  constructor(config) {
    super(config);
  };
  
  get schemaConf() {
    return Joi.concat(Joi.object().keys({
      myConfProp: Joi.number().greater(1).less(2).required().strict()
    })).concat(TaskConfigSchema);
  };
};


class Y extends Task {};


describe('Task', () => {
  it('should allow instantiation of subclasses that have their own extended config', done => {
    const conf = createExampleTaskConfig('X');

    assert.throws(() => {
      new X(conf); // X requires 'myConfProp' (not yet added)
    });

    conf.myConfProp = 1.5;
    new X(conf);

    assert.throws(() => {
      conf.myConfProp = 2.1;
      new X(conf);
    });

    done();
  });

  it('should be able to create the right subclass from configuration', done => {

    const conf = createExampleTaskConfig('Y');

    assert.throws(() => {
      const y = Task.fromConfiguration(conf);
    });

    Task.registerSubclass(Y);
    const y = Task.fromConfiguration(conf);

    assert.isTrue(y instanceof Y);

    done();
  });
});
