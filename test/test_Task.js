require('../meta/typedefs');

const { assert, expect } = require('chai')
, { assertThrowsAsync } = require('sh.orchestration-tools')
, { Task } = require('../lib/cameleer/Task')
, { createExampleTaskConfig } = require('./helpers')
, { TaskConfigSchema } = require('../meta/schemas')
, Joi = require('joi');


describe('Task', () => {
  it('should allow instantiation of subclasses that have their own extended config', done => {
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

    const conf = createExampleTaskConfig('X');

    new Task(conf);

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
    class X extends Task {};

    const conf = createExampleTaskConfig('X');

    assert.throws(() => {
      const x = Task.fromConfiguration(conf);
    });

    Task.registerSubclass(X);
    const x = Task.fromConfiguration(conf);

    assert.isTrue(x instanceof X);

    done();
  });
});
