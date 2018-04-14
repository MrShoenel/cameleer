require('../meta/typedefs');

const { assert, expect } = require('chai')
, { assertThrowsAsync  } = require('sh.orchestration-tools')
, { Task } = require('../lib/Task')
, { createExampleTaskConfig } = require('./helpers')
, Joi = require('joi');


describe('Task', () => {
  it('should allow to register subclasses and make use of them and their derived config', done => {
    class X extends Task {
      /**
       * @param {TaskConfig} config
       */
      constructor(config) {
        super(config);
      };

      static get schemaConf() {
        return Joi.concat(Joi.object().keys({
          myConfProp: Joi.number().greater(1).less(2).required().strict()
        })).concat(Task.schemaConf);
      };
    };

    Task.registerSubclass(X);
    assert.strictEqual(Task.getClassForName('X'), X);

    const conf = createExampleTaskConfig('X');
    conf.myConfProp = 1.5;
    const instance = Task.fromConfiguration(conf);

    assert.isTrue(instance instanceof X);
    assert.isTrue(instance.config.hasOwnProperty('myConfProp'));

    done();
  });
});