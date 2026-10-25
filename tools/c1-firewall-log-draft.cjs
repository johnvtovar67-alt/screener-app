// Review artifact only: prints exact project-scoped CLI commands; never runs them.
const plan = require('../docs/operations/c1-firewall-log-plan-20261025.json');

function commandArguments(rule, thresholdLogging = false) {
  const args = ['--scope', plan.teamId, 'firewall', 'rules',
    thresholdLogging ? 'edit' : 'add', rule.name, '--project', plan.projectId];
  rule.conditionGroup.forEach((group, index) => {
    if (index) args.push('--or');
    for (const condition of group.conditions) args.push('--condition', JSON.stringify(condition));
  });
  args.push('--action', thresholdLogging ? 'rate_limit' : 'log');
  if (thresholdLogging) args.push(
    '--rate-limit-window', String(plan.windowSeconds),
    '--rate-limit-requests', String(rule.requestsPer60sPerIp),
    '--rate-limit-keys', 'ip', '--rate-limit-algo', plan.algorithm,
    '--rate-limit-action', 'log');
  args.push('--yes');
  return args;
}

function shellQuote(value) {
  return /^[A-Za-z0-9_./:-]+$/.test(value) ? value : "'" + value.replace(/'/g, "'\\''") + "'";
}

function commands(thresholdLogging = false) {
  return plan.rules.map(rule => ['vercel', ...commandArguments(rule, thresholdLogging)].map(shellQuote).join(' '));
}

if (require.main === module) {
  if (process.argv.slice(2).some(arg => arg !== '--threshold-log')) {
    console.error('Usage: node tools/c1-firewall-log-draft.cjs [--threshold-log]');
    process.exitCode = 1;
  } else {
    console.log('# PRINT ONLY. Confirm six-rule capacity, exact project and existing draft before staging.');
    console.log('# Commands stage only. Review every rule and diff. Owner publishes separately.');
    if (process.argv.includes('--threshold-log')) console.log('# LATER PHASE ONLY: review normal all-match traffic before staging these edits.');
    console.log(commands(process.argv.includes('--threshold-log')).join('\n\n'));
    for (const rule of plan.rules) console.log(['vercel', '--scope', plan.teamId, 'firewall', 'rules', 'inspect', rule.name, '--project', plan.projectId, '--json'].map(shellQuote).join(' '));
    console.log(`vercel --scope ${plan.teamId} firewall diff --project ${plan.projectId}`);
  }
}

module.exports = { plan, commandArguments, commands };
