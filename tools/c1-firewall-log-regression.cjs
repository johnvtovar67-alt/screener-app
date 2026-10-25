// Verify the reviewed rule scope without HTTP, credentials or platform mutations.
const assert = require('node:assert/strict');
const { plan, commandArguments, commands } = require('./c1-firewall-log-draft.cjs');

const expected = [
  ['/api/top5', null, 0],
  ...['/api', '/api/', '/api/index', '/api/lookup'].map(path => [path, null, 1]),
  ['/api/c1-account', 'POST', 2],
  ['/api/portfolio-sync', 'PUT', 3],
  ...['/api/c1-account', '/api/portfolio-sync', '/api/performance'].map(path => [path, 'GET', 4]),
  ['/api/entry-timing', null, 5], ['/api/options', 'GET', 5], ['/api/catalysts', 'POST', 5],
];
assert.equal(plan.projectId, 'prj_9MJJaMsEfOdtQKXj4VFI7TfJcBjQ');
assert.equal(plan.teamId, 'team_vBLhac1QJ54zPEiWFFK7XmGN');
assert.equal(plan.rules.length, 6);
assert.deepEqual(plan.rules.map(rule => rule.requestsPer60sPerIp), [120, 12000, 300, 120, 600, 300]);
assert.equal(plan.windowSeconds, 60);
assert.deepEqual(plan.keys, ['ip']);
assert.equal(plan.algorithm, 'fixed_window');
for (const rule of plan.rules) for (const group of rule.conditionGroup) {
  assert.deepEqual(group.conditions[0], { type: 'environment', op: 'eq', value: 'production' });
  for (const condition of group.conditions) {
    assert.equal(condition.op, 'eq');
    assert.ok(['environment', 'path', 'method'].includes(condition.type));
    assert.equal(condition.neg, undefined);
  }
}

function matchedRules(environment, rawPath, method) {
  const path = new URL(rawPath, 'https://synthetic.invalid').pathname;
  const request = { environment, path, method };
  return plan.rules.flatMap((rule, index) => rule.conditionGroup.some(group =>
    group.conditions.every(condition => request[condition.type] === condition.value)) ? [index] : []);
}

const excluded = [
  '/', '/portfolio', '/api/version', '/api/health', '/api/ops-acceptance',
  '/api/cron/c1-account', '/api/cron/discovery', '/api/research/c1', '/api/research/run',
  '/_next/static/main.js', '/api/top5/extra', '/api/lookup/extra', '/api2',
];
const paths = [...new Set(expected.map(([path]) => path)), ...excluded];
const methods = ['GET', 'POST', 'PUT', 'HEAD', 'PATCH', 'DELETE', 'OPTIONS'];
let checked = 0;
for (const environment of ['production', 'preview', 'development', '']) {
  for (const path of paths) for (const method of methods) for (const query of ['', '?health=1', '?symbol=AAA&verificationPass=2']) {
    const actual = matchedRules(environment, path + query, method);
    const wanted = environment === 'production' ? expected.filter(([p, m]) => p === path && (!m || m === method)).map(([, , index]) => index) : [];
    assert.deepEqual(actual, wanted, `${environment} ${method} ${path}${query}`);
    checked++;
  }
}
for (const threshold of [false, true]) {
  assert.equal(commands(threshold).length, 6);
  for (const rule of plan.rules) {
    const args = commandArguments(rule, threshold);
    assert.equal(args[args.indexOf('--project') + 1], plan.projectId);
    assert.equal(args[args.indexOf('--action') + 1], threshold ? 'rate_limit' : 'log');
    assert.ok(!args.includes('publish'));
    assert.ok(!args.includes('--duration'));
    assert.equal(args.filter(arg => arg === '--or').length, rule.conditionGroup.length - 1);
    if (threshold) assert.equal(args[args.indexOf('--rate-limit-action') + 1], 'log');
    else assert.ok(!args.includes('--rate-limit-action'));
    assert.equal(args.at(-1), '--yes');
  }
}
console.log(`C1 firewall logging draft: PASS (${checked} environment/method/path/query cases; six initial log rules; six later nonblocking threshold edits; zero HTTP/platform writes).`);
