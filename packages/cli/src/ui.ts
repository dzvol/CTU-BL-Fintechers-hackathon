const color = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string) => (s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);

export const green = wrap('32');
export const red = wrap('31');
export const yellow = wrap('33');
export const dim = wrap('2');
export const bold = wrap('1');

export const ok = (msg: string) => console.log(`${green('✓')} ${msg}`);
export const warn = (msg: string) => console.log(`${yellow('!')} ${msg}`);
export const fail = (msg: string) => console.log(`${red('✗')} ${msg}`);
export const hint = (msg: string) => console.log(`  ${dim('→')} ${msg}`);
export const info = (msg: string) => console.log(msg);

/** An error shown to the user without a stack trace. */
export class CliError extends Error {
  constructor(
    message: string,
    readonly hintText?: string,
  ) {
    super(message);
    this.name = 'CliError';
  }
}
