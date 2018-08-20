require('../meta/typedefs');

const Joi = require('joi')
, { assert, expect } = require('chai')
, { assertThrowsAsync } = require('sh.orchestration-tools')
, { Task } = require('../lib/cameleer/Task')
, {
  createDefaultCameleerConfig,
  StandardConfigProvider
} = require('../lib/cameleer/ConfigProvider')
, { DevNullLogger } = require('sh.log-client')
, { FunctionalTaskConfigSchema, SimpleTaskConfigSchema } = require('../meta/schemas')
, confInstance = require('../cli/config.example');


const taskArrSchema = Joi.array().items(
  Joi.func(),
  Joi.alternatives(
    FunctionalTaskConfigSchema,
    Joi.object().type(Task).required()
  )
).default([]).optional();


describe('CLI-example', function() {
  it('should provide a valid CLI example configuration', async() => {
    const valRes = Joi.validate(confInstance.tasks, taskArrSchema);
    assert.strictEqual(valRes.error, null);

    /** @type {Task} */
    const task = await confInstance.getTaskConfig('myTask');
    task.logger = new DevNullLogger(Task);

    const ctx = {};
    let result = await task.config.tasks[0]({
      logger: task.logger,
      context: ctx
    });
    assert.strictEqual(result, 42);
    assert.strictEqual(ctx.value, 42);

    result = await task.config.tasks[1].func({
      logger: task.logger,
      context: ctx
    });
    assert.strictEqual(result, 43);
    assert.strictEqual(ctx.value, 43);
  });
});