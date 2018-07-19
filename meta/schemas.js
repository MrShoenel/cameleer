const Joi = require('joi');

/**
 * The following schemas are implementations of the type-definitions.
 * 
 * @author Sebastian Hönel <development@hoenel.net>
 */

const FunctionalTaskErrorConfigSchema = Joi.object().keys({
  schedule: Joi.func().required(),
  skip: Joi.alternatives(
    Joi.boolean().required(),
    Joi.func().arity(0).required()
  ).default(false).optional(),
  continueOnFinalFail: Joi.alternatives(
    Joi.boolean().required(),
    Joi.func().arity(0).required()
  ).default(false).optional(),
  maxNumFails: Joi.number().integer().min(0).max(Number.MAX_SAFE_INTEGER).default(Number.MAX_SAFE_INTEGER).optional()
}).strict();


const FunctionalTaskConfigSchema = Joi.object().keys({
  name: Joi.string().min(1).optional(),
  canFail: Joi.alternatives(
    Joi.boolean().required(),
    FunctionalTaskErrorConfigSchema
  ).default(false).optional(),
  func: Joi.func().required(),
  args: Joi.alternatives(
    Joi.array().not().empty().required(),
    Joi.func().required()
  ).default([]).optional(),
  thisArg: Joi.object().default(null).optional()
});


const SimpleTaskConfigSchema = Joi.alternatives(
  Joi.func().required(),
  FunctionalTaskConfigSchema
);


const TaskConfigSchema = Joi.object().keys({
  type: Joi.alternatives(
    Joi.string().min(1),
    Joi.func().class()
  ).default('Task', 'The class Task is the base-class').optional(),
  name: Joi.string().alphanum().min(1).max(255).required(),
  enabled: Joi.alternatives(
    Joi.bool(),
    Joi.func().arity(0)
  ).default(true).optional(), // We require a resolved property!
  skip: Joi.func().arity(0)
    .default(false).optional(),
  cost: Joi.alternatives(
    Joi.number().greater(0),
    Joi.func().arity(0)
  ).default(null).optional(),
  allowMutliple: Joi.alternatives(
    Joi.boolean(),
    Joi.func()
  ).default(false).optional(),
  queues: Joi.alternatives(
    Joi.array().items(
      Joi.string().alphanum().min(1)
    ).required().not().empty(),
    Joi.func().arity(0).required()
  ).optional(),
  progress: Joi.alternatives(
    Joi.object(),
    Joi.func()
  ).default(null).optional(),
  schedule: Joi.object().required(), // We require a resolved property!
  tasks: Joi.array().items(
    Joi.func(),
    SimpleTaskConfigSchema
  ).required().not().empty()
}).strict().unknown(true);


const CameleerDefaultsSchema = Joi.object().keys({
  tasks: FunctionalTaskErrorConfigSchema
}).strict();

const CameleerQueueConfigSchema = Joi.object().keys({
  name: Joi.string().alphanum().min(1).required(),
  enabled: Joi.boolean().required(),
  type: Joi.alternatives('cost', 'parallel'),
  parallelism: Joi.number().integer().greater(0).optional(),
  capabilities: Joi.number().greater(0).optional(),
  allowExclusiveJobs: Joi.boolean().optional()
});

const CameleerLoggingConfigSchema = Joi.object().keys({
  level: Joi.number().integer().required(),
  method: Joi.string().min(1).optional(),
  endpoint: Joi.string().min(1).optional()
});

const CameleerConfigSchema = Joi.object().keys({
  defaults: CameleerDefaultsSchema,
  logging: CameleerLoggingConfigSchema,
  queues: Joi.array().items(CameleerQueueConfigSchema).required().not().empty()
});


module.exports = Object.freeze({
  FunctionalTaskErrorConfigSchema,
  FunctionalTaskConfigSchema,
  SimpleTaskConfigSchema,
  TaskConfigSchema,

  CameleerDefaultsSchema,
  CameleerQueueConfigSchema,
  CameleerLoggingConfigSchema,
  CameleerConfigSchema
});