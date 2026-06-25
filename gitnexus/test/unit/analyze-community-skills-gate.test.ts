import { describe, it, expect } from 'vitest';
import {
  resolveProjectFileSkips,
  shouldGenerateCommunitySkillFiles,
} from '../../src/cli/analyze.js';

describe('shouldGenerateCommunitySkillFiles (#742 / PR 1485)', () => {
  it('is false when --index-only is set even if --skills and pipelineResult are present', () => {
    expect(shouldGenerateCommunitySkillFiles({ skills: true, indexOnly: true }, { ok: true })).toBe(
      false,
    );
  });

  it('is false when pipelineResult is missing', () => {
    expect(shouldGenerateCommunitySkillFiles({ skills: true, indexOnly: false }, null)).toBe(false);
    expect(shouldGenerateCommunitySkillFiles({ skills: true }, undefined)).toBe(false);
  });

  it('is true when --skills is set, pipeline exists, and not index-only', () => {
    expect(
      shouldGenerateCommunitySkillFiles({ skills: true, indexOnly: false }, { communities: [] }),
    ).toBe(true);
    expect(shouldGenerateCommunitySkillFiles({ skills: true }, { x: 1 })).toBe(true);
  });

  it('is false when --skills is omitted', () => {
    expect(shouldGenerateCommunitySkillFiles({ indexOnly: false }, { x: 1 })).toBe(false);
    expect(shouldGenerateCommunitySkillFiles(undefined, { x: 1 })).toBe(false);
  });
});

describe('resolveProjectFileSkips', () => {
  it('skips project-local context files by default', () => {
    expect(resolveProjectFileSkips(undefined)).toEqual({
      skipAgentsMd: true,
      skipSkills: true,
    });
    expect(resolveProjectFileSkips({})).toEqual({
      skipAgentsMd: true,
      skipSkills: true,
    });
  });

  it('enables legacy context writes only when explicitly requested', () => {
    expect(resolveProjectFileSkips({ writeContextFiles: true })).toEqual({
      skipAgentsMd: false,
      skipSkills: false,
    });
  });

  it('keeps explicit skip flags and indexOnly stronger than writeContextFiles', () => {
    expect(resolveProjectFileSkips({ writeContextFiles: true, skipAgentsMd: true })).toEqual({
      skipAgentsMd: true,
      skipSkills: false,
    });
    expect(
      resolveProjectFileSkips({
        writeContextFiles: true,
        skipAgentsMd: false,
        skipSkills: false,
        indexOnly: true,
      }),
    ).toEqual({
      skipAgentsMd: true,
      skipSkills: true,
    });
  });
});
