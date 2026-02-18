import pc from "picocolors";

export function styled(text: string, opts: { bold?: boolean; color?: string } = {}): string {
  let result = text;
  if (opts.color === "green") result = pc.green(result);
  else if (opts.color === "yellow") result = pc.yellow(result);
  else if (opts.color === "red") result = pc.red(result);
  else if (opts.color === "cyan") result = pc.cyan(result);
  if (opts.bold) result = pc.bold(result);
  return result;
}

export function info(msg: string): void {
  console.log(`  ${msg}`);
}

export function success(msg: string): void {
  console.log(`  ${pc.green(msg)}`);
}

export function warn(msg: string): void {
  console.log(`  ${pc.yellow(msg)}`);
}

export function error(msg: string): void {
  console.log(`  ${pc.red(msg)}`);
}

export function heading(msg: string): void {
  console.log(`\n  ${pc.bold(msg)}`);
}

export function blank(): void {
  console.log();
}

export function cmd(command: string): string {
  return pc.bold(pc.cyan(command));
}
