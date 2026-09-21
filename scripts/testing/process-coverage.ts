/** Each process invocation needs its own evidence file: Windows may reuse PIDs. */
export function processCoveragePrelude(directory: string): string {
  return (
    `import { writeFileSync as coverageWrite } from 'node:fs';\n` +
    `import { randomUUID as coverageId } from 'node:crypto';\n` +
    `process.on('exit', () => coverageWrite(${JSON.stringify(directory)} + '/' + coverageId() + '.json', JSON.stringify(globalThis.__coverage__ || {}), {flag:'wx'}));\n`
  );
}
