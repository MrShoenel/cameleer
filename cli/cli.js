const program = require('commander')
, path = require('path')
, fs = require('fs')
, packagePath = path.resolve(path.dirname(__filename), '../package.json')
, package = JSON.parse(fs.readFileSync(packagePath))
, defaultConfigFile = path.resolve(path.dirname(__filename), './config.js')
, interfaceRegex = /^(none|stdin|(?:http(?:-([0-9]+))?))$/i
, { Resolve } = require('sh.orchestration-tools')
, { ConfigProvider } = require('../lib/cameleer/ConfigProvider')
, { Cameleer } = require('../lib/cameleer/Cameleer')
, { Control } = require('../lib/control/Control')
, { HttpControl } = require('../lib/control/HttpControl')
, { StdinControl } = require('../lib/control/StdinControl')
, { LogLevel } = require('sh.log-client');


program
  .version(package.version, '-v, --version')
  .option('-c, --config <path>', 'The configuration file to use. This file should export an instance of ConfigProvider (see config.example.js) that is then passed to Cameleer.', defaultConfigFile)
  .option('-i, --instrument [itype]', `Specify an additional instrument to use to control Cameleer. Defaults to 'none'. Allowed values are 'none', 'stdin' and 'http'. The format for http is: http(-[0-9]+)? to specify an optional port.`, interfaceRegex, 'none')
  .option('-n, --norun [norun]', `Specify this so that Cameleer is not run automatically (requires an interface other than 'none' to control the Cameleer instance).`)
  .option('-l, --loglevel [loglevel]', `Use this optional flag to override the LogLevel. Allowed values are: ${Object.keys(LogLevel).join(', ')}`)
  .parse(process.argv);


(async() => {
  /** @type {ConfigProvider} */
  const configProvider = await Resolve.toValue(require(path.resolve(program.config)), ConfigProvider);

  // Let's check extra configured controls:
  if (program.instrument === 'stdin') {
    configProvider.getCameleerConfig().controls.push({
      type: StdinControl
    });
  } else if (program.instrument.startsWith('http')) {
    const exec = interfaceRegex.exec(program.instrument);
    configProvider.getCameleerConfig().controls.push({
      type: HttpControl,
      port: exec.length > 2 ? parseInt(exec[2], 10) : HttpControl.defaultPort
    });
  }

  // Create Cameleer
  const cameleer = new Cameleer(configProvider);

  // Check optional override of LogLevel:
  if (program.loglevel) {
    if (!LogLevel.hasOwnProperty(program.loglevel)) {
      throw new Error(`The given Log-level '${program.logLevel}' is not valid.`);
    }
    cameleer.logger.logLevel = LogLevel[program.loglevel];
  }

  if (program.norun) {
    if (!cameleer.hasControls) {
      throw new Error(`You must not specify '-n'/'--no-run' without using a Controller to instrument Cameleer.`);
    }
  } else {
    await cameleer.loadTasks();
    await cameleer.runAsync();
  }
})().catch(err => {
  console.log(err);
});
