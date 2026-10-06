import { parseArgs } from 'node:util';
import { HELP, importVercel } from './importVercel';

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      days: { type: 'string', default: '31' },
      until: { type: 'string' },
      out: { type: 'string', default: 'jialytics-history.json' },
      project: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help || positionals[0] !== 'import-vercel') {
    process.stdout.write(HELP);
    process.exit(values.help ? 0 : 1);
  }
  try {
    const result = importVercel({
      days: Number(values.days),
      until: values.until,
      out: values.out!,
      project: values.project,
    });
    console.log(
      `Pulled ${result.pulled} days (${result.from} to before ${result.until}) into ${values.out}: ` +
        `${result.total} days, ${result.views.toLocaleString('en-US')} views in all.`,
    );
  } catch (error) {
    console.error(`jialytics: ${(error as Error).message}`);
    process.exit(1);
  }
}

main();
