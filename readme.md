# Cameleer
<pre>
    /\_/\  __
/\_/     \/''\
   \  _  ____/
    || ||       . . . . .   let Cameleer move 'them hoofs
</pre>
Cameleer is an application that can schedule and execute any kind of job using various queue-types and schedulers.

A few paradigms to get your thinking started:
* Do _something_ using _some schedule_, in parallel or defined by a cost. _Something_ can be any `Function` or `Promise`. A schedule can e.g. be a calendar, a timeout or interval or any scheduler that you provide.
* Backup-paradigm: Take _something_ from _somewhere_ and put it somewhere _else_. Actually, Cameleer is a spin-off from the [backup-wrapper](https://github.com/MrShoenel/backup-wrapper). It was started when I realized that the _backup-wrapper_ can actually do any job, not just backups.
* IoT-paradigm: Control devices based on a schedule.
* Cameleer is meant to be run as a service, unlike other task-runners, such as _Gulp_ or _Grunt_. But if you want, you may use it as a simple task runner.
* Create jobs from descriptions. Cameleer comes with a few built-in task-types. But feel free to provide your own. Have a look at the file `config.example.js` to get an idea of what is possible.

## Install
Run `npm install cameleer` to install Cameleer. Please refrain from installing any version from npm with versions _prior_ to 1.0.0.
