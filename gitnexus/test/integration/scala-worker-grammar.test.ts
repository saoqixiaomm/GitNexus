import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SupportedLanguages } from 'gitnexus-shared';
import { isLanguageAvailable } from '../../src/core/tree-sitter/parser-loader.js';
import { runPipelineFromRepo } from './resolvers/helpers.js';
import type { PipelineResult } from '../../src/types/pipeline.js';

const tmpDirs: string[] = [];

function createScalaRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scala-worker-grammar-'));
  const srcDir = path.join(dir, 'src', 'main', 'scala', 'example');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(srcDir, 'Example.scala'),
    [
      'package example',
      '',
      'trait Greeter {',
      '  def greet(name: String): String',
      '}',
      '',
      'class ConsoleGreeter(prefix: String) extends Greeter {',
      '  override def greet(name: String): String = s"$prefix, $name"',
      '}',
      '',
      'object Main {',
      '  def run(): String = new ConsoleGreeter("hello").greet("scala")',
      '}',
      '',
    ].join('\n'),
  );
  tmpDirs.push(dir);
  return dir;
}

function scalaStructureNodes(result: PipelineResult): Array<{ label: string; name: string }> {
  const nodes: Array<{ label: string; name: string }> = [];
  result.graph.forEachNode((node) => {
    const filePath = node.properties.filePath;
    if (typeof filePath !== 'string' || !filePath.endsWith('.scala')) return;
    if (node.label === 'File') return;
    const name = node.properties.name;
    nodes.push({ label: node.label, name: typeof name === 'string' ? name : '' });
  });
  return nodes;
}

describe.skipIf(!isLanguageAvailable(SupportedLanguages.Scala))(
  'Scala worker grammar registration',
  () => {
    afterAll(() => {
      for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
    });

    it('parses Scala files on the worker path instead of dropping them as unsupported', async () => {
      const result = await runPipelineFromRepo(createScalaRepo(), () => {}, {
        skipGraphPhases: true,
        workerThresholdsForTest: { minFiles: 1, minBytes: 1 },
        workerPoolSize: 2,
      });

      expect(result.usedWorkerPool).toBe(true);

      const nodes = scalaStructureNodes(result);
      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes.map((node) => node.label)).toEqual(expect.arrayContaining(['Class', 'Method']));
      expect(nodes.map((node) => node.name)).toEqual(
        expect.arrayContaining(['ConsoleGreeter', 'run']),
      );
    });
  },
);
