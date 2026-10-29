import { classifyTool } from '../src/lock/lock-state.js';

describe('classifyTool', () => {
  const approved = { status: 'approved' as const, approvedHash: 'h1', currentHash: 'h1' };

  it('new tool (no row) → new', () => {
    expect(classifyTool(undefined, 'h1')).toBe('new');
  });

  it('known tool, same hash as approved → unchanged', () => {
    expect(classifyTool(approved, 'h1')).toBe('unchanged');
  });

  it('known tool, different hash → changed', () => {
    expect(classifyTool(approved, 'h2')).toBe('changed');
  });

  it('pending tool seen again with the same hash → unchanged (stays pending)', () => {
    expect(classifyTool({ status: 'pending', approvedHash: 'h1', currentHash: 'h2' }, 'h2')).toBe('unchanged');
  });

  it('pending tool whose definition goes back to the approved one → reverted', () => {
    expect(classifyTool({ status: 'pending', approvedHash: 'h1', currentHash: 'h2' }, 'h1')).toBe('reverted');
  });

  it('pending tool that changes again → changed', () => {
    expect(classifyTool({ status: 'pending', approvedHash: 'h1', currentHash: 'h2' }, 'h3')).toBe('changed');
  });

  it('rejected tool with the same hash → unchanged (stays rejected)', () => {
    expect(classifyTool({ status: 'rejected', approvedHash: 'h1', currentHash: 'h2' }, 'h2')).toBe('unchanged');
  });

  it('rejected tool that changes again → changed (needs a fresh review)', () => {
    expect(classifyTool({ status: 'rejected', approvedHash: 'h1', currentHash: 'h2' }, 'h3')).toBe('changed');
  });

  it('never-approved tool that changes → changed, not reverted', () => {
    expect(classifyTool({ status: 'pending', approvedHash: null, currentHash: 'h1' }, 'h2')).toBe('changed');
  });
});
