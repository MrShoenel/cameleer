require('../meta/typedefs');

const { ProgressNumeric, Interval, timeout
} = require('sh.orchestration-tools')
, Schemas = require('../meta/schemas')
, Joi = require('joi')
, Felicity = require('felicity');


/**
 * @author Sebastian Hönel <development@hoenel.net>
 * @returns {TaskConfig} an example config that validates
 */
const createExampleTaskConfig = (className = 'Task', name = 'foo') => {
  return {
    type: className,
    name,
    enabled: true,
    skip: () => false,
    cost: () => 1,
    queues: ['q0'],
    progress: new ProgressNumeric(0, 1),
    schedule: new Interval(100, () => 'item', 3),
    tasks: [async() => await timeout(100)]
  };
};


/**
 * @author Sebastian Hönel <development@hoenel.net>
 * @template T
 * @param {ObjectSchema} schema a Joi-schema
 * @param {Boolean} [full] defaults to true; whether or not to populate optional properties
 * @returns {T} an exemplary instance of the given schema
 */
createExampleInstance = (schema, full = true) => {
  return Felicity.example(schema, {
    config: {
      includeOptional: full
    }
  });
};


/**
 * @returns {CameleerConfig} with one queue (parallel, 1, non-ex only)
 */
createCameleerConfig = () => {
  /** @type {CameleerConfig} */
  const ex = createExampleTaskConfig(Schemas.CameleerConfigSchema);

  /** @type {CameleerQueueConfig} */
  const exQ = {};

  exQ.allowExclusiveJobs = false;
  exQ.parallelism = 1;
  exQ.enabled = true;
  exQ.name = 'q1';
  exQ.type = 'parallel';
  ex.queues = [exQ];

  return ex;
};


module.exports = Object.freeze({
  createExampleTaskConfig,
  createExampleInstance,
  createCameleerConfig
});