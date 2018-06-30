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


module.exports = Object.freeze({
  createExampleTaskConfig
});