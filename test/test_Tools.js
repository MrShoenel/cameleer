require('../meta/typedefs');

const { assert, expect } = require('chai')
, { assertThrowsAsync, mergeObjects } = require('sh.orchestration-tools')
, { RetryInterval } = require('../tools/RetryInterval')
, { wakeAsync, macRegex } = require('../tools/WakeOnLan');


describe('Tools', () => {
  it('should only accept valid MAC addresses', async function() {
    this.timeout(5000);

    assert.isTrue(macRegex.test('01:02:03:04:05:ff'));
    assert.isFalse(macRegex.test('01-02-03-04-05-ff'));

    await assertThrowsAsync(async() => {
      await wakeAsync('foo');
    });

    const now = +new Date;
    await wakeAsync('00:00:00:00:00:00', .5);
    const then = (+new Date) - now;
    assert.isAtLeast(then, 500);

    const now2 = +new Date;
    await wakeAsync('00:00:00:00:00:00', -2);
    const then2 = (+new Date) - now2;
    assert.isBelow(then2, 1000); // because the above arg for waiting is invalid
  });

  it('should initialize a RetryInterval accordingly', done => {
    const ri = new RetryInterval(25, 2, false);
    
    assert.strictEqual(ri.msecs, 25);
    assert.strictEqual(ri.maxNumTriggers, 2);

    const ri2 = new RetryInterval(50, -1);
    assert.strictEqual(ri2.maxNumTriggers, Number.MAX_SAFE_INTEGER);

    const ri3 = new RetryInterval(50);
    assert.strictEqual(ri3.maxNumTriggers, 3); // the default

    assert.isTrue(ri3.itemProducer instanceof Function);
    assert.strictEqual(ri3.itemProducer(), void 0);

    done();
  });

  it('should not accept arguments of wrong type', done => {
    const ri = new RetryInterval(50, 3, false, new Date());

    assert.isTrue(ri.itemProducer instanceof Function);
    assert.isFalse(ri.itemProducer instanceof Date);

    const f = () => 42;
    const ri2 = new RetryInterval(50, 3, false, f);
    assert.strictEqual(ri2.itemProducer, f);

    done();
  })
});