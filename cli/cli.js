const program = require('commander')
, path = require('path')
, fs = require('fs')
, packagePath = path.resolve(path.dirname(__filename), '../package.json')
, package = JSON.parse(fs.readFileSync(packagePath))
, defaultConfigFile = path.resolve(path.dirname(__filename), './config.js')
, { Cameleer } = require('../lib/Cameleer')
, interfaceRegex = /^(none|stdin|(?:http(?:-([0-9]+))?))$/i
, Control = require('../lib/control/Control')
, { HttpControl } = require('../lib/control/HttpControl')
, { StdinControl } = require('../lib/control/StdinControl');

program
  .version(package.version, '-v, --version')
  .option('-c, --config [path]', 'the configuration file to use. This file should export an instance of ConfigProvider (see config.example.js) that is then passed to Cameleer.', defaultConfigFile)
  .option('-i, --interface [itype]', `the interface to use to control Cameleer. Defaults to 'none'. Allowed values are 'none', 'stdin' and 'http'. The format for http is: http(-[0-9]+)? to specify an optional port.`, interfaceRegex, 'none')
  .option('-n, --no-run [norun]', `specify this so that Cameleer is not run automatically (requires an interface other than 'none').`)
  .parse(process.argv);


const cameleer = new Cameleer(require(path.resolve(program.config)));

/** @type {Control} */
let control = null;
if (program.interface === 'stdin') {
  control = new StdinControl(cameleer);
} else if (program.interface.startsWith('http')) {
  const exec = interfaceRegex.exec(program.interface);
  control = new HttpControl(cameleer, exec.length > 2 ? parseInt(exec[2], 10) : void 0);
}

if (program.norun) {
  if (control === null) {
    throw new Error(`You must not specify '-n'/'--no-run' without using an interface to control Cameleer.`);
  }
} else {
  cameleer.run();
}