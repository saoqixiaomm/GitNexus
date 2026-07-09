import { describe, expect, it } from 'vitest';
import { resolveScalaImportTarget } from '../../src/core/ingestion/languages/scala/import-target.js';

describe('Scala import target resolution', () => {
  it('prefers the current source root for wildcard package imports', () => {
    const files = new Set([
      'modules/server/app/utils/UserAgentUtils.scala',
      'modules/server/app/utils/URLUtil.scala',
      'modules/server/test/utils/UserAgentUtilsTest.scala',
      'modules/server/test/utils/URLUtilTest.scala',
    ]);

    const target = resolveScalaImportTarget(
      { kind: 'wildcard', targetRaw: 'utils.*' },
      {
        fromFile: 'modules/server/app/services/FileImportService.scala',
        allFilePaths: files,
      },
    );

    expect(target).toEqual([
      'modules/server/app/utils/UserAgentUtils.scala',
      'modules/server/app/utils/URLUtil.scala',
    ]);
  });
});
