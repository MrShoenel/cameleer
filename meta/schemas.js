const Joi = require('joi');


const FunctionalTaskErrorConfigSchema = Joi.object().keys({
  schedule: Joi.func().required(),
  skip: Joi.alternatives(
    Joi.boolean().required(),
    Joi.func().arity(0).required()
  ).default(false).optional(),
  continueOnFinalFail: Joi.alternatives(
    Joi.boolean().required(),
    Joi.func().arity(0).required()
  ).default(false).optional()
}).strict();


const FunctionalTaskConfigSchema = Joi.object().keys({
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
  Joi.func(),
  FunctionalTaskConfigSchema
);


const TaskConfigSchema = Joi.object().keys({
  type: Joi.alternatives(
    Joi.string().min(1),
    Joi.func().class()
  ).required(),
  name: Joi.string().alphanum().min(1).max(255).required(),
  enabled: Joi.alternatives(
    Joi.bool(),
    Joi.func().arity(0)
  ).default(true).optional(), // We require a resolved property!
  skip: Joi.func().arity(0)
    .default(() => false).optional(),
  cost: Joi.alternatives(
    Joi.number().greater(0),
    Joi.func().arity(0)
  ).default(null).optional(),
  allowMutliple: Joi.alternatives(
    Joi.boolean(),
    Joi.func()
  ).default(false).optional(),
  queues: Joi.array().items(
    Joi.string().alphanum().min(1),
    Joi.func()
  ).not().empty().optional(),
  progress: Joi.alternatives(
    Joi.object(),
    Joi.func()
  ).default(null).optional(),
  schedule: Joi.object().required(), // We require a resolved property!
  tasks: Joi.array().items(
    Joi.func(),
    SimpleTaskConfigSchema
  ).not().empty().required()
}).strict().unknown(true);


module.exports = Object.freeze({
  FunctionalTaskErrorConfigSchema,
  FunctionalTaskConfigSchema,
  SimpleTaskConfigSchema,
  TaskConfigSchema
});