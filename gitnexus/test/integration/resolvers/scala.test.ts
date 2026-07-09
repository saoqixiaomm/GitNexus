import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SupportedLanguages } from 'gitnexus-shared';
import { isLanguageAvailable } from '../../../src/core/tree-sitter/parser-loader.js';
import { edgeSet, getRelationships, runPipelineFromRepo } from './helpers.js';

const tmpDirs: string[] = [];

function createScalaResolutionRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scala-resolution-'));
  const srcDir = path.join(dir, 'src', 'main', 'scala', 'example');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(srcDir, 'Types.scala'),
    [
      'package example',
      '',
      'class RequestHeader',
      'class Handler',
      '',
      'trait Base {',
      '  def base(): String',
      '}',
      '',
      'class DefaultHttpRequestHandler {',
      '  def routeRequest(request: RequestHeader): Option[Handler] = None',
      '}',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(srcDir, 'GuanHttpRequestHandler.scala'),
    [
      'package example',
      '',
      'import example.{Base, DefaultHttpRequestHandler, Handler, RequestHeader}',
      '',
      'class GuanHttpRequestHandler extends DefaultHttpRequestHandler with Base {',
      '  def addXAuthToken(request: RequestHeader): RequestHeader = request',
      '',
      '  override def routeRequest(request: RequestHeader): Option[Handler] = {',
      '    val updatedRequest = addXAuthToken(rewriteUrl(request))',
      '    super.routeRequest(updatedRequest)',
      '  }',
      '',
      '  private def rewriteUrl(request: RequestHeader): RequestHeader = request',
      '}',
      '',
    ].join('\n'),
  );
  tmpDirs.push(dir);
  return dir;
}

describe.skipIf(!isLanguageAvailable(SupportedLanguages.Scala))('Scala scope resolution', () => {
  afterAll(() => {
    for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('emits import, inheritance, and local method call edges on the worker path', async () => {
    const result = await runPipelineFromRepo(createScalaResolutionRepo(), () => {}, {
      workerThresholdsForTest: { minFiles: 1, minBytes: 1 },
      workerPoolSize: 2,
    });

    expect(result.usedWorkerPool).toBe(true);

    const imports = getRelationships(result, 'IMPORTS');
    expect(
      imports.some(
        (edge) =>
          edge.sourceFilePath.endsWith('GuanHttpRequestHandler.scala') &&
          edge.targetFilePath.endsWith('Types.scala'),
      ),
    ).toBe(true);

    const extendsEdges = getRelationships(result, 'EXTENDS');
    expect(edgeSet(extendsEdges)).toEqual(
      expect.arrayContaining(['GuanHttpRequestHandler → DefaultHttpRequestHandler']),
    );

    const implementsEdges = getRelationships(result, 'IMPLEMENTS');
    expect(edgeSet(implementsEdges)).toEqual(
      expect.arrayContaining(['GuanHttpRequestHandler → Base']),
    );

    const calls = getRelationships(result, 'CALLS');
    expect(edgeSet(calls)).toEqual(
      expect.arrayContaining([
        'routeRequest → addXAuthToken',
        'routeRequest → rewriteUrl',
        'routeRequest → routeRequest',
      ]),
    );
  });
});
