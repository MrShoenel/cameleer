const { Cameleer, CameleerJob, CameleerQueue, CameleerWorkEvent, JobFailError,
  symbolCameleerSchedule, symbolCameleerShutdown, symbolCameleerWork
} = require('./lib/cameleer/Cameleer')
, { ConfigProvider } = require('./lib/cameleer/ConfigProvider')
, { ResolvedConfig } = require('./lib/cameleer/ResolvedConfig')
, { ErrorResult, Result } = require('./lib/cameleer/Result')
, { AttemptError, ErrorTypes, ErrorTypesKeys, RunAttempt } = require('./lib/cameleer/RunAttempt')
, { Task } = require('./lib/cameleer/Task')
, { Control } = require('./lib/control/Control')
, { HttpControl, ControlHttpControlConfigSchema } = require('./lib/control/HttpControl')
, { StdinControl } = require('./lib/control/StdinControl')
, { Manager } = require('./lib/manager/Manager')
, { ConfigurableClass } = require('./tools/ConfigurableClass')
, { RetryInterval } = require('./tools/RetryInterval')
, { SubClassRegister } = require('./tools/SubClassRegister')
, {
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
} = require('./meta/schemas')
, {
  Progress, ProgressNumeric,
  ProcessExit, ProcessResult, ProcessErrorResult, ProcessOutput,

  Schedule, ScheduleEvent,
  Interval, IntervalEventSimple,
  Calendar, CalendarEventSimple,
  ManualSchedule, ManualScheduleEventSimple
} = require('sh.orchestration-tools');


module.exports = Object.freeze({
  Cameleer, CameleerJob, CameleerQueue, CameleerWorkEvent, JobFailError,
  symbolCameleerSchedule, symbolCameleerShutdown, symbolCameleerWork,
  ConfigProvider,
  ResolvedConfig,
  ErrorResult, Result,
  AttemptError, ErrorTypes, ErrorTypesKeys, RunAttempt,
  Task,
  Control,
  HttpControl, ControlHttpControlConfigSchema,
  StdinControl,
  Manager,
  ConfigurableClass,
  RetryInterval,
  SubClassRegister,
  
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
  ManagerConfigSchema,
  
  Progress, ProgressNumeric,
  ProcessExit, ProcessResult, ProcessErrorResult, ProcessOutput,

  Schedule, ScheduleEvent,
  Interval, IntervalEventSimple,
  Calendar, CalendarEventSimple,
  ManualSchedule, ManualScheduleEventSimple
});
