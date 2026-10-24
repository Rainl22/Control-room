import type { Evidence, EvidenceType } from './types.js';

/** Stable, readable evidence id, e.g. ev:po:PO-1042:total */
export function evidenceId(entity: string, entityId: string, fieldPath: string): string {
  return `ev:${entity}:${entityId}:${fieldPath}`;
}

export function makeEvidence(
  type: EvidenceType,
  entity: string,
  entityId: string,
  fieldPath: string,
  value: unknown,
  retrievedAt: string,
): Evidence {
  return {
    id: evidenceId(entity, entityId, fieldPath),
    type,
    source: { entity, entityId, fieldPath },
    value,
    retrievedAt,
  };
}

/** Returns the cited ids that do NOT exist in the assembled context. */
export function unknownEvidenceIds(cited: string[], known: Set<string>): string[] {
  return [...new Set(cited)].filter((id) => !known.has(id));
}
