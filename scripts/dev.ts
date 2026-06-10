const args = Bun.argv.slice(2)
const modeArg = args.find((arg) => arg === '--production' || arg === '--prod' || arg === '--sandbox')
const forwardedArgs = args.filter((arg) => arg !== '--production' && arg !== '--prod' && arg !== '--sandbox')
const mode = modeArg === '--production' || modeArg === '--prod' ? 'production' : 'sandbox'

const env = { ...process.env }

if (mode === 'production') {
  env.DATABASE_URL = env.PLAID_PRODUCTION_DATABASE_URL ?? env.DATABASE_URL
  env.PLAID_ENV = env.PLAID_PRODUCTION_ENV ?? 'production'
  env.PLAID_SECRET = env.PLAID_PRODUCTION_SECRET ?? env.PLAID_SECRET
} else {
  env.DATABASE_URL = env.PLAID_SANDBOX_DATABASE_URL ?? env.DATABASE_URL
  env.PLAID_ENV = env.PLAID_SANDBOX_ENV ?? 'sandbox'
  env.PLAID_SECRET = env.PLAID_SANDBOX_SECRET ?? env.PLAID_SECRET
}

env.MONAI_CREDENTIAL_MODE = mode

const databaseLabel = env.DATABASE_URL
  ? env.DATABASE_URL.replace(process.cwd(), '.')
  : '<unset>'

console.log(
  [
    `[monai] starting dev server`,
    `mode=${mode}`,
    `plaid=${env.PLAID_ENV ?? '<unset>'}`,
    `db=${databaseLabel}`,
  ].join(' | '),
)

const child = Bun.spawn(
  ['bunx', 'vite', 'dev', '--port', '3000', ...forwardedArgs],
  {
    env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  },
)

const exitCode = await child.exited
process.exit(exitCode)
