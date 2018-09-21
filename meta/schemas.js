const Joi = require('joi');

/**
 * The following schemas are implementations of the type-definitions.
 * 
 * @author Sebastian Hönel <development@hoenel.net>
 */

const FunctionalTaskErrorConfigSchema = Joi.object().keys({
  schedule: Joi.alternatives(
    Joi.object()/*.type(Schedule)*/.required(),
    Joi.func().required()
  ).required(),
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


const SimpleTaskConfigSchema = Joi.array().items(
  FunctionalTaskConfigSchema,
  Joi.func()
);


const TaskConfigSchema = Joi.object().keys({
  type: Joi.alternatives(
    Joi.string().min(1),
    Joi.func().class()
  ).default('Task', 'The class Task is the base-class').optional(),
  name: Joi.string().min(1).max(255).required(),
  enabled: Joi.alternatives(
    Joi.bool(),
    Joi.func().maxArity(2)
  ).default(true).optional(), // We require a resolved property!
  skip: Joi.func().maxArity(2)
    .default(false).optional(),
  cost: Joi.alternatives(
    Joi.number().greater(0),
    Joi.func().maxArity(2)
  ).default(null).optional(),
  allowMutliple: Joi.alternatives(
    Joi.boolean(),
    Joi.func()
  ).default(false).optional(),
  queues: Joi.alternatives(
    Joi.array().items(
      Joi.string().min(1)
    ).required().not().empty(),
    Joi.func().maxArity(2).required()
  ).optional(),
  progress: Joi.alternatives(
    Joi.object(),
    Joi.func()
  ).default(null).optional(),
  schedule: Joi.object()/*.type(Schedule)*/.required(), // We require a resolved property!
  interruptTimeoutSecs: Joi.alternatives(
    Joi.number().greater(0),
    Joi.func().maxArity(2)
  ).default(null).optional(),
  tasks: Joi.alternatives(
    SimpleTaskConfigSchema,
    Joi.array().items(
      // Joi.object().type(Task),
      FunctionalTaskConfigSchema,
      Joi.func()
    )
  ).default([]).optional(true)
}).strict().unknown(true);



const ConfigurableClassConfigSchema = Joi.object().keys({
  type: Joi.alternatives(
    Joi.string().min(1),
    Joi.func().class()
  ).required()
}).unknown(true);



const ManagerConfigSchema = ConfigurableClassConfigSchema.unknown(true);

const ControlConfigSchema = ConfigurableClassConfigSchema.unknown(true);



const CameleerDefaultsSchema = Joi.object().keys({
  tasks: FunctionalTaskErrorConfigSchema,
  handleGlobalRejections: Joi.boolean().default(true).optional(),
  handleGlobalErrors: Joi.boolean().default(true).optional(),
  staticTaskContextSerializeInterval: Joi.number().integer().default(60e3).optional()
}).strict();

const CameleerQueueConfigSchema = Joi.object().keys({
  name: Joi.string().min(1).required(),
  enabled: Joi.boolean().required(),
  type: Joi.alternatives('cost', 'parallel'),
  isDefault: Joi.boolean().default(false).optional(),
  parallelism: Joi.number().integer().greater(0).optional(),
  capabilities: Joi.number().greater(0).optional(),
  allowExclusiveJobs: Joi.boolean().optional()
});

const CameleerLoggingConfigSchema = Joi.object().keys({
  level: Joi.number().integer().required(),
  method: Joi.alternatives(
    Joi.string().regex(/^none$/),
    Joi.string().regex(/^console$/)
  ).required(),
  numInMemory: Joi.number().integer().min(0).default(1000).optional(),
  endpoint: Joi.string().min(1).optional()
});

const CameleerConfigSchema = Joi.object().keys({
  defaults: CameleerDefaultsSchema,
  logging: CameleerLoggingConfigSchema,
  queues: Joi.array().items(CameleerQueueConfigSchema).required().not().empty(),
  controls: Joi.array().items(ControlConfigSchema).optional(),
  managers: Joi.array().items(ManagerConfigSchema).optional()
});


module.exports = Object.freeze({
  FunctionalTaskErrorConfigSchema,
  FunctionalTaskConfigSchema,
  SimpleTaskConfigSchema,
  TaskConfigSchema,

  CameleerDefaultsSchema,
  CameleerQueueConfigSchema,
  CameleerLoggingConfigSchema,
  CameleerConfigSchema,

  ConfigurableClassConfigSchema,
  ControlConfigSchema,
  ManagerConfigSchema
});