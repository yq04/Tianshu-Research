/**
 * Operation Descriptors Registry for tianshu-research.
 * Defines immutable, authoritative capability contracts for data, theory, benchmark,
 * figure, and run operations without requiring paper literature or artificial DOIs.
 */

export const OPERATION_DESCRIPTORS = Object.freeze({
  // --- DATA OPERATIONS ---
  'data.inspect@1': Object.freeze({
    id: 'data.inspect@1',
    capability: 'data',
    summary: 'Inspect dataset schema, columns, summary statistics, and missing value counts.',
    effects: Object.freeze(['read']),
    dependencies: Object.freeze([]),
    execution: 'inline',
    persistByDefault: false,
    inputSchema: {
      type: 'object',
      properties: {
        datasetPath: { type: 'string', description: 'Path to CSV, TSV, or JSON dataset file' },
        data: { type: 'array', description: 'Direct inline array of record objects' },
        columns: { type: 'array', items: { type: 'string' }, description: 'Optional subset of columns to inspect' },
        maxRows: { type: 'integer', minimum: 1, maximum: 10000, description: 'Maximum rows to sample (default 1000)' },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        rowCount: { type: 'integer' },
        columnCount: { type: 'integer' },
        columns: { type: 'array' },
        summary: { type: 'object' },
        missingValues: { type: 'object' },
      },
      required: ['rowCount', 'columnCount', 'columns'],
    },
  }),

  'data.prepare@1': Object.freeze({
    id: 'data.prepare@1',
    capability: 'data',
    summary: 'Clean, filter, or transform tabular data according to pipeline specifications.',
    effects: Object.freeze(['read', 'write']),
    dependencies: Object.freeze([]),
    execution: 'inline',
    persistByDefault: false,
    inputSchema: {
      type: 'object',
      properties: {
        datasetPath: { type: 'string', description: 'Path to input dataset' },
        operations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['filter', 'drop_na', 'select_columns', 'rename', 'sort'] },
              column: { type: 'string' },
              operator: { type: 'string' },
              value: {},
              columns: { type: 'array', items: { type: 'string' } },
            },
            required: ['type'],
          },
        },
        outputPath: { type: 'string', description: 'Optional output path for cleaned dataset' },
      },
      required: ['operations'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        rowsBefore: { type: 'integer' },
        rowsAfter: { type: 'integer' },
        columns: { type: 'array', items: { type: 'string' } },
        artifactRef: { type: 'object' },
      },
    },
  }),

  'statistics.compare@1': Object.freeze({
    id: 'statistics.compare@1',
    capability: 'data',
    summary: 'Compare two groups with parametric or non-parametric hypothesis tests and effect sizes.',
    effects: Object.freeze(['read']),
    dependencies: Object.freeze([]),
    execution: 'inline',
    persistByDefault: false,
    inputSchema: {
      type: 'object',
      properties: {
        groupA: { type: 'array', items: { type: 'number' }, description: 'Sample values for group A' },
        groupB: { type: 'array', items: { type: 'number' }, description: 'Sample values for group B' },
        method: { type: 'string', enum: ['t_test', 'mann_whitney', 'welch', 'paired_t'], description: 'Comparison method (default: welch)' },
        paired: { type: 'boolean', description: 'Whether observations are paired' },
        alpha: { type: 'number', minimum: 0.0001, maximum: 0.5, description: 'Significance level alpha (default: 0.05)' },
      },
      required: ['groupA', 'groupB'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        statistic: { type: 'number' },
        pValue: { type: 'number' },
        effectSize: { type: 'number' },
        effectMetric: { type: 'string' },
        confidenceInterval: { type: 'array', items: { type: 'number' } },
        significant: { type: 'boolean' },
      },
    },
  }),

  'statistics.fit@1': Object.freeze({
    id: 'statistics.fit@1',
    capability: 'data',
    summary: 'Perform linear, polynomial, or nonlinear regression with residual diagnostics.',
    effects: Object.freeze(['read']),
    dependencies: Object.freeze([]),
    execution: 'inline',
    persistByDefault: false,
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'array', items: { type: 'number' }, description: 'Independent variable values' },
        y: { type: 'array', items: { type: 'number' }, description: 'Dependent variable values' },
        model: { type: 'string', enum: ['linear', 'polynomial', 'exponential', 'power'], description: 'Model family (default linear)' },
        degree: { type: 'integer', minimum: 1, maximum: 5, description: 'Degree for polynomial model (default 1)' },
      },
      required: ['x', 'y'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        rSquared: { type: 'number' },
        coefficients: { type: 'array', items: { type: 'number' } },
        residualsStd: { type: 'number' },
        formula: { type: 'string' },
      },
    },
  }),

  'uncertainty.propagate@1': Object.freeze({
    id: 'uncertainty.propagate@1',
    capability: 'data',
    summary: 'Propagate measurement uncertainties using first-order Taylor expansion or Monte Carlo.',
    effects: Object.freeze(['read']),
    dependencies: Object.freeze([]),
    execution: 'inline',
    persistByDefault: false,
    inputSchema: {
      type: 'object',
      properties: {
        formula: { type: 'string', description: 'Mathematical expression, e.g. "a * b / c"' },
        variables: {
          type: 'object',
          description: 'Map of variable name to { value, uncertainty }',
          additionalProperties: {
            type: 'object',
            properties: {
              value: { type: 'number' },
              uncertainty: { type: 'number' },
            },
            required: ['value', 'uncertainty'],
          },
        },
        method: { type: 'string', enum: ['taylor', 'monte_carlo'], description: 'Propagation method' },
      },
      required: ['formula', 'variables'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        nominalValue: { type: 'number' },
        combinedUncertainty: { type: 'number' },
        relativeUncertainty: { type: 'number' },
      },
    },
  }),

  // --- THEORY OPERATIONS ---
  'theory.dimension@1': Object.freeze({
    id: 'theory.dimension@1',
    capability: 'theory',
    summary: 'Verify physical dimensional consistency between LHS and RHS expressions across 7 SI base dimensions.',
    effects: Object.freeze(['read']),
    dependencies: Object.freeze([]),
    execution: 'inline',
    persistByDefault: false,
    inputSchema: {
      type: 'object',
      properties: {
        lhs: { type: 'string', description: 'Left-hand side expression (e.g. "force")' },
        rhs: { type: 'string', description: 'Right-hand side expression (e.g. "stress * area")' },
        symbols: { type: 'object', description: 'Optional dictionary of custom unit/symbol dimensions' },
        customUnits: { type: 'object', description: 'Alias for symbols' },
      },
      required: ['lhs', 'rhs'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        consistent: { type: 'boolean' },
        lhsDimension: { type: 'object' },
        rhsDimension: { type: 'object' },
        mismatch: { type: 'array' },
        formula: { type: 'string' },
      },
      required: ['consistent'],
    },
  }),

  'theory.symbolic@1': Object.freeze({
    id: 'theory.symbolic@1',
    capability: 'theory',
    summary: 'Perform symbolic simplification, derivation, or series expansion under strict AST safety.',
    effects: Object.freeze(['read', 'execute']),
    dependencies: Object.freeze(['sympy']),
    execution: 'inline',
    persistByDefault: false,
    inputSchema: {
      type: 'object',
      properties: {
        expr: { type: 'string', description: 'Mathematical expression' },
        operation: { type: 'string', enum: ['simplify', 'diff', 'expand', 'factor'], description: 'Symbolic operation' },
        symbolicAction: { type: 'string', description: 'Alias for operation' },
        var: { type: 'string', description: 'Variable name for differentiation (default: "x")' },
      },
      required: ['expr'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'string' },
        latex: { type: 'string' },
      },
    },
  }),

  'theory.limit@1': Object.freeze({
    id: 'theory.limit@1',
    capability: 'theory',
    summary: 'Evaluate asymptotic limits and physical boundary conditions.',
    effects: Object.freeze(['read', 'execute']),
    dependencies: Object.freeze(['sympy']),
    execution: 'inline',
    persistByDefault: false,
    inputSchema: {
      type: 'object',
      properties: {
        expr: { type: 'string', description: 'Mathematical expression' },
        var: { type: 'string', description: 'Variable taking the limit (default: "x")' },
        to: { type: ['string', 'number'], description: 'Target limit point, e.g. "oo", "0", 0 (default: "oo")' },
        dir: { type: 'string', enum: ['+', '-', '+-'], description: 'Direction of approach' },
      },
      required: ['expr'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        limit: { type: ['string', 'number'] },
        isFinite: { type: 'boolean' },
      },
    },
  }),

  'theory.numeric-check@1': Object.freeze({
    id: 'theory.numeric-check@1',
    capability: 'theory',
    summary: 'Numerically evaluate and verify analytical expressions against reference values within tolerances.',
    effects: Object.freeze(['read']),
    dependencies: Object.freeze([]),
    execution: 'inline',
    persistByDefault: false,
    inputSchema: {
      type: 'object',
      properties: {
        analytic: { type: ['number', 'string'], description: 'Analytic/reference value' },
        numerical: { type: ['number', 'string'], description: 'Numerical/simulated value' },
        tolerance: { type: 'number', minimum: 0, description: 'Relative/absolute tolerance threshold (default: 1e-4)' },
        atol: { type: 'number', minimum: 0, description: 'Absolute tolerance' },
        rtol: { type: 'number', minimum: 0, description: 'Relative tolerance' },
      },
      required: ['analytic', 'numerical'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        consistent: { type: 'boolean' },
        absoluteError: { type: 'number' },
        relativeError: { type: 'number' },
        tolerance: { type: 'number' },
      },
      required: ['consistent'],
    },
  }),

  // --- BENCHMARK OPERATIONS ---
  'benchmark.plan@1': Object.freeze({
    id: 'benchmark.plan@1',
    capability: 'benchmark',
    summary: 'Define fixed experimental matrix, partition schemes, and ablation baselines.',
    effects: Object.freeze(['read']),
    dependencies: Object.freeze([]),
    execution: 'inline',
    persistByDefault: false,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Benchmark protocol name' },
        tasks: { type: 'array', items: { type: 'string' }, description: 'Target tasks or datasets' },
        baselines: { type: 'array', description: 'Baseline model/method names or specs' },
        ablations: { type: 'array', description: 'Ablation variant configurations' },
        metrics: { type: 'array', items: { type: 'string' }, description: 'Evaluation metrics' },
        fixedSeeds: { type: 'array', items: { type: 'integer' }, description: 'Fixed pseudo-random seeds' },
        budget: { type: 'object', properties: { maxRuns: { type: 'integer' }, wallSeconds: { type: 'number' } } },
      },
      required: ['name', 'metrics'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        runCount: { type: 'integer' },
        matrix: { type: 'array' },
      },
    },
  }),

  'benchmark.run@1': Object.freeze({
    id: 'benchmark.run@1',
    capability: 'benchmark',
    summary: 'Execute reproducible benchmark suite with hardware/resource accounting and RunReceipt.',
    effects: Object.freeze(['read', 'execute', 'write']),
    dependencies: Object.freeze([]),
    execution: 'job',
    persistByDefault: true,
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'Associated benchmark plan ID' },
        plan: { type: 'object', description: 'Associated benchmark plan object' },
        executable: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            argv: { type: 'array', items: { type: 'string' } },
          },
          required: ['path'],
        },
        parameters: { type: 'object', description: 'Benchmark parameters' },
        limits: {
          type: 'object',
          properties: {
            wallSeconds: { type: 'number' },
            maxOutputBytes: { type: 'integer' },
            memoryBytes: { type: 'integer' },
          },
        },
        idempotencyKey: { type: 'string' },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        status: { type: 'string', enum: ['running', 'completed', 'failed'] },
        receipt: { type: 'object' },
      },
    },
  }),

  'benchmark.compare@1': Object.freeze({
    id: 'benchmark.compare@1',
    capability: 'benchmark',
    summary: 'Compare benchmark runs across metrics, efficiency, and ablation conditions.',
    effects: Object.freeze(['read']),
    dependencies: Object.freeze([]),
    execution: 'inline',
    persistByDefault: false,
    inputSchema: {
      type: 'object',
      properties: {
        runIds: { type: 'array', items: { type: 'string' }, description: 'Run identifiers to compare' },
        results: { type: 'array', description: 'Direct array of run result objects if not reading from storage' },
        primaryMetric: { type: 'string', description: 'Primary metric key for sorting and comparisons' },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        ranking: { type: 'array' },
        comparisonMatrix: { type: 'object' },
        bestRunId: { type: 'string' },
      },
    },
  }),

  // --- FIGURE OPERATIONS ---
  'figure.render@1': Object.freeze({
    id: 'figure.render@1',
    capability: 'figure',
    summary: 'Render publication-quality vector (SVG/PDF) figure from data or script.',
    effects: Object.freeze(['read', 'write', 'execute']),
    dependencies: Object.freeze(['matplotlib']),
    execution: 'inline',
    persistByDefault: false,
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['svg', 'pdf', 'png'], description: 'Output graphic format (default svg)' },
        paletteId: { type: 'integer', description: 'Optional journal palette id (1-100)' },
        role: { type: 'string', description: 'Palette role, e.g. colorblind' },
        title: { type: 'string', description: 'Figure title' },
        xLabel: { type: 'string', description: 'X-axis label' },
        yLabel: { type: 'string', description: 'Y-axis label' },
        xUnit: { type: 'string', description: 'X-axis unit' },
        yUnit: { type: 'string', description: 'Y-axis unit' },
        errorBarType: { type: 'string', description: 'Error bar semantics' },
        datasetPath: { type: 'string', description: 'Source dataset path' },
        series: { type: 'array', description: 'Data series' },
        dataArtifactId: { type: 'string', description: 'Source dataset artifact ID' },
        outputPath: { type: 'string', description: 'Target output image path' },
        script: { type: 'string', description: 'Rendering script content' },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        figureArtifactId: { type: 'string' },
        outputPath: { type: 'string' },
        format: { type: 'string' },
      },
    },
  }),

  'figure.inspect@1': Object.freeze({
    id: 'figure.inspect@1',
    capability: 'figure',
    summary: 'Inspect figure labels, dimensions, color palettes, and axis units.',
    effects: Object.freeze(['read']),
    dependencies: Object.freeze([]),
    execution: 'inline',
    persistByDefault: false,
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to figure file (SVG, PNG, PDF)' },
      },
      required: ['filePath'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string' },
        sizeBytes: { type: 'integer' },
        metadata: { type: 'object' },
      },
    },
  }),

  // --- RUN OPERATIONS ---
  'run.status@1': Object.freeze({
    id: 'run.status@1',
    capability: 'run',
    summary: 'Query execution status, resource metrics, and receipt of an asynchronous run.',
    effects: Object.freeze(['read']),
    dependencies: Object.freeze([]),
    execution: 'inline',
    persistByDefault: false,
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'Run identifier' },
      },
      required: ['runId'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        status: { type: 'string' },
        receipt: { type: 'object' },
        metrics: { type: 'object' },
      },
    },
  }),

  'run.cancel@1': Object.freeze({
    id: 'run.cancel@1',
    capability: 'run',
    summary: 'Cancel an ongoing run and issue cancellation receipt.',
    effects: Object.freeze(['write']),
    dependencies: Object.freeze([]),
    execution: 'inline',
    persistByDefault: false,
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'Run identifier' },
        reason: { type: 'string', description: 'Cancellation reason' },
      },
      required: ['runId'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        status: { type: 'string' },
        cancelledAt: { type: 'string' },
      },
    },
  }),

  // --- WORKFLOW OPERATIONS ---
  'workflow.patch@1': Object.freeze({
    id: 'workflow.patch@1',
    capability: 'workflow',
    summary: 'Apply a GraphPatch to a running research workflow under CAS verification.',
    effects: Object.freeze(['write']),
    dependencies: Object.freeze([]),
    execution: 'inline',
    persistByDefault: true,
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task identifier' },
        patch: { type: 'object', description: 'GraphPatch payload' },
      },
      required: ['taskId', 'patch'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        baseRevision: { type: 'integer' },
        newRevision: { type: 'integer' },
        supersededNodeIds: { type: 'array' },
        appendedNodeIds: { type: 'array' },
      },
    },
  }),

  'workflow.resume@1': Object.freeze({
    id: 'workflow.resume@1',
    capability: 'workflow',
    summary: 'Resume an interrupted workflow from persistent event journal.',
    effects: Object.freeze(['read', 'write']),
    dependencies: Object.freeze([]),
    execution: 'inline',
    persistByDefault: true,
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task identifier' },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        completedNodes: { type: 'array' },
        partialDelivery: { type: 'boolean' },
      },
    },
  }),

  'workflow.step@1': Object.freeze({
    id: 'workflow.step@1',
    capability: 'workflow',
    summary: 'Advance workflow execution by one or more scheduling ticks.',
    effects: Object.freeze(['write']),
    dependencies: Object.freeze([]),
    execution: 'inline',
    persistByDefault: true,
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task identifier' },
        steps: { type: 'integer', description: 'Number of steps' },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        stopped: { type: 'boolean' },
        executed: { type: 'array' },
      },
    },
  }),

  'workflow.input@1': Object.freeze({
    id: 'workflow.input@1',
    capability: 'workflow',
    summary: 'Provide human input to an awaiting_input workflow node.',
    effects: Object.freeze(['write']),
    dependencies: Object.freeze([]),
    execution: 'inline',
    persistByDefault: true,
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task identifier' },
        nodeId: { type: 'string', description: 'Target awaiting_input node ID' },
        inputData: { type: 'object', description: 'Input data payload' },
      },
      required: ['taskId', 'nodeId'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        nodeId: { type: 'string' },
      },
    },
  }),

  'run.submit@1': Object.freeze({
    id: 'run.submit@1',
    capability: 'run',
    summary: 'Submit a RunSpec asynchronously to the local-process backend (fire-and-forget; query via run.status@1).',
    effects: Object.freeze(['read', 'execute', 'write']),
    dependencies: Object.freeze([]),
    execution: 'inline',
    persistByDefault: true,
    inputSchema: {
      type: 'object',
      properties: {
        operationId: { type: 'string', description: 'Operation the run executes (metadata on the receipt)' },
        parameters: { type: 'object', description: 'Parameters payload for the spec' },
        executable: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            argv: { type: 'array', items: { type: 'string' } },
          },
          required: ['path'],
        },
        limits: {
          type: 'object',
          properties: {
            wallSeconds: { type: 'number' },
            maxOutputBytes: { type: 'integer' },
          },
        },
        idempotencyKey: { type: 'string', description: 'Required: same key replays the same run without re-execution' },
        runId: { type: 'string', description: 'Optional explicit run id' },
      },
      required: ['operationId', 'idempotencyKey'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        status: { type: 'string' },
        idempotentReplay: { type: 'boolean' },
      },
      required: ['runId', 'status'],
    },
  }),

  'run.reconcile@1': Object.freeze({
    id: 'run.reconcile@1',
    capability: 'run',
    summary: 'Reconcile in-flight runs against the backend: ingest verified receipts, mark backend-unknown runs orphaned, never fabricate.',
    effects: Object.freeze(['read', 'write']),
    dependencies: Object.freeze([]),
    execution: 'inline',
    persistByDefault: false,
    inputSchema: {
      type: 'object',
      properties: {
        runIds: { type: 'array', items: { type: 'string' }, description: 'Optional subset; default reconciles all in-flight runs' },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        checked: { type: 'integer' },
        ingested: { type: 'array' },
        orphaned: { type: 'array' },
        stillRunning: { type: 'array' },
        unreachable: { type: 'array' },
      },
      required: ['checked'],
    },
  }),

  'workflow.status@1': Object.freeze({
    id: 'workflow.status@1',
    capability: 'workflow',
    summary: 'Query persistent workflow state, revision, and budget summary.',
    effects: Object.freeze(['read']),
    dependencies: Object.freeze([]),
    execution: 'inline',
    persistByDefault: false,
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task identifier' },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        revision: { type: 'integer' },
        status: { type: 'string' },
      },
    },
  }),
  // --- NOTEBOOK OPERATIONS (Phase 9B: interactive execution vs clean replay) ---
  'notebook.execute@1': Object.freeze({
    id: 'notebook.execute@1',
    capability: 'notebook',
    summary: 'Execute one cell in a persistent Jupyter kernel session and record the execution honestly.',
    effects: Object.freeze(['read', 'execute', 'write']),
    dependencies: Object.freeze(['jupyter']),
    execution: 'inline',
    persistByDefault: true,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Cell source code to execute' },
        sessionName: { type: 'string', description: 'Kernel session name (default: "default")' },
        timeoutMs: { type: 'integer', description: 'Cell deadline in ms (default 60000); overrun interrupts the kernel' },
      },
      required: ['code'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ok', 'error', 'timeout', 'blocked'] },
        outputs: { type: 'array' },
        epoch: { type: 'integer' },
        recordPath: { type: 'string' },
      },
    },
  }),

  'notebook.replay@1': Object.freeze({
    id: 'notebook.replay@1',
    capability: 'notebook',
    summary: 'Re-run a recorded notebook session in a fresh kernel and compare outputs; out-of-order or multi-epoch records refuse the formal gate.',
    effects: Object.freeze(['read', 'execute', 'write']),
    dependencies: Object.freeze(['jupyter']),
    execution: 'inline',
    persistByDefault: true,
    inputSchema: {
      type: 'object',
      properties: {
        recordName: { type: 'string', description: 'Persisted execution record name under .rivet/research/notebook/' },
        sessionName: { type: 'string', description: 'Optional replay session name (default: "<recordName>:replay")' },
      },
      required: ['recordName'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        verdict: { type: 'string', enum: ['reproduced', 'diverged', 'not_comparable', 'blocked'] },
        gateStatus: { type: 'string', enum: ['pass', 'fail', 'inconclusive', 'blocked'] },
        reasons: { type: 'array' },
        comparedCells: { type: 'integer' },
      },
      required: ['verdict', 'gateStatus'],
    },
  }),
});

export function getOperationDescriptor(id) {
  if (typeof id !== 'string') return null;
  return OPERATION_DESCRIPTORS[id.trim()] || null;
}

export function isValidOperationId(id) {
  return Boolean(getOperationDescriptor(id));
}

export function listOperationDescriptors(filter = {}) {
  const list = Object.values(OPERATION_DESCRIPTORS);
  if (filter.capability) {
    return list.filter((op) => op.capability === filter.capability);
  }
  return list;
}
