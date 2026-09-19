import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addEvidenceV2,
  addClaimV2,
  getEvidenceV2,
  getClaimV2,
  listEvidenceV2,
  listClaimsV2,
  getLedgerV2Summary,
} from '../ledger/evidence-v2.js';
import { saveArtifact, getArtifact, hasArtifact } from '../ledger/artifact-store.js';
import { adaptLegacyEvidence, adaptLegacyClaim, getAllEvidenceCombined, getAllClaimsCombined } from '../ledger/legacy-adapter.js';
import { addSource, addEvidence as addEvidenceV1, addClaim as addClaimV1 } from '../ledger/evidence-ledger.js';
import { runResearchEvidence } from '../gateway-evidence.js';
import { resolveWorkspaceScope } from '../scope/workspace-scope.js';

describe('Phase 3: Evidence v2 & Typed Research Store', () => {
  let tmpDir;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tianshu-ev2-test-'));
  });

  after(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('records empirical and theoretical evidence without requiring paper DOI', () => {
    const empiricalEv = addEvidenceV2(tmpDir, {
      id: 'ev_sensor_42',
      kind: 'empirical',
      statement: 'Measured wind-tunnel pressure drop of 4.2 kPa at Mach 0.8',
      locator: { kind: 'dataset', datasetKey: 'pressure_drop', columns: ['mach', 'delta_p'] },
      provenance: { method: 'wind_tunnel_daq', methodVersion: '2.1' },
      relation: 'supports',
    });

    assert.equal(empiricalEv.id, 'ev_sensor_42');
    assert.equal(empiricalEv.kind, 'empirical');
    assert.equal(empiricalEv.schemaVersion, 2);

    const theoreticalEv = addEvidenceV2(tmpDir, {
      id: 'ev_theory_dim',
      kind: 'theoretical',
      statement: 'Bernoulli pressure head is dimensionally homogeneous with dynamic pressure',
      locator: { kind: 'derivation', stepId: 'step_3' },
      provenance: { method: 'dimensional_analysis' },
      relation: 'supports',
    });

    assert.equal(theoreticalEv.kind, 'theoretical');

    const fetched = getEvidenceV2(tmpDir, 'ev_sensor_42');
    assert.ok(fetched);
    assert.equal(fetched.statement, 'Measured wind-tunnel pressure drop of 4.2 kPa at Mach 0.8');

    const allEv = listEvidenceV2(tmpDir);
    assert.equal(allEv.length, 2);
  });

  it('creates scientific claim without external DOI and references typed evidence', () => {
    const claim = addClaimV2(tmpDir, {
      id: 'clm_boundary_layer',
      statement: 'Compressibility effect induces non-linear pressure drop past Mach 0.7',
      kind: 'empirical',
      evidenceIds: ['ev_sensor_42'],
      scope: 'transonic_aerodynamics',
      assumptions: ['adiabatic_wall', 'dry_air'],
      conclusion: 'supported',
    });

    assert.equal(claim.id, 'clm_boundary_layer');
    assert.equal(claim.conclusion, 'supported');
    assert.equal(claim.schemaVersion, 2);

    const fetchedClaim = getClaimV2(tmpDir, 'clm_boundary_layer');
    assert.ok(fetchedClaim);
    assert.deepEqual(fetchedClaim.evidenceIds, ['ev_sensor_42']);

    const summary = getLedgerV2Summary(tmpDir);
    assert.equal(summary.totalEvidence, 2);
    assert.equal(summary.totalClaims, 1);
    assert.equal(summary.evidenceByKind.empirical, 1);
    assert.equal(summary.evidenceByKind.theoretical, 1);
  });

  it('persists content-addressed artifacts in ArtifactStore', () => {
    const sampleData = 'mach,delta_p\n0.2,0.5\n0.5,1.8\n0.8,4.2\n';
    const art = saveArtifact(tmpDir, sampleData, {
      kind: 'dataset',
      mediaType: 'text/csv',
      filename: 'wind_tunnel_data.csv',
    });

    assert.ok(art.id.startsWith('art_'));
    assert.equal(art.kind, 'dataset');
    assert.equal(art.mediaType, 'text/csv');
    assert.ok(art.sha256.length === 64);

    assert.ok(hasArtifact(tmpDir, art.sha256));
    const loaded = getArtifact(tmpDir, art.sha256);
    assert.ok(loaded);
    assert.equal(loaded.readText(), sampleData);
  });

  it('losslessly adapts legacy literature ledger into v2 structures', () => {
    // Write legacy v1 records
    addSource(tmpDir, {
      id: 'paper_einstein_1905',
      title: 'Zur Elektrodynamik bewegter Körper',
      year: 1905,
    });
    addEvidenceV1(tmpDir, {
      id: 'ev_speed_of_light',
      sourceId: 'paper_einstein_1905',
      excerpt: 'Light is always propagated in empty space with a definite velocity c.',
      locator: { page: 891 },
    });
    addClaimV1(tmpDir, {
      id: 'clm_constancy_c',
      statement: 'Speed of light is invariant across inertial frames',
      evidenceIds: ['ev_speed_of_light'],
      status: 'verified',
    });

    const combinedEv = getAllEvidenceCombined(tmpDir);
    const speedEv = combinedEv.find(e => e.id === 'ev_speed_of_light');
    assert.ok(speedEv);
    assert.equal(speedEv.kind, 'literature');
    assert.equal(speedEv.provenance.imported, true);

    const combinedClm = getAllClaimsCombined(tmpDir);
    const speedClm = combinedClm.find(c => c.id === 'clm_constancy_c');
    assert.ok(speedClm);
    assert.equal(speedClm.conclusion, 'supported');
    assert.equal(speedClm.kind, 'literature');
  });

  it('supports direct v2 evidence addition via gateway without DOI', async () => {
    const scope = resolveWorkspaceScope({ workspace: tmpDir, explicitTrust: true });
    const res = await runResearchEvidence({
      action: 'add_evidence',
      workspace: tmpDir,
      kind: 'empirical',
      id: 'ev_gateway_exp',
      statement: 'Spot measurement shows 12.4% latency drop',
      locator: { kind: 'benchmark', runId: 'run_123' },
    }, {
      scope,
    });

    assert.equal(res.isError, undefined);
    assert.ok(res.content.includes('已记录 [empirical] 科学证据'));
    assert.equal(res.data.id, 'ev_gateway_exp');
  });
});
